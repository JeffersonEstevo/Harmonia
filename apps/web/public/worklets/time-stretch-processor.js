/**
 * AudioWorkletProcessor que faz time-stretch com preservação de pitch via
 * OLA (overlap-add) — ver docs/SPEC.md §4.3 "Velocidade de reprodução variável".
 *
 * Por que não dá pra só mudar `source.playbackRate`: isso re-amostra o áudio,
 * então tocar mais devagar também baixa o pitch (efeito "disco lento"). Um
 * time-stretcher de verdade lê a fonte numa velocidade (rate) e sintetiza a
 * saída em outra (sempre 1x em tempo real), preservando a tonalidade.
 *
 * Este é um OLA simples (não um WSOLA completo com correlação de fase) —
 * suficiente para 0.25x–2.0x com uma leve "textura" perceptível em trechos
 * muito esticados. Documentado como decisão consciente em docs/DECISIONS.md;
 * um WSOLA com alinhamento por correlação cruzada é a evolução natural aqui.
 */

const GRAIN_SIZE = 4096;
const HOP_OUT = 1024; // 75% de overlap — suaviza bastante o resultado

function hannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return w;
}

const WINDOW = hannWindow(GRAIN_SIZE);

class ChannelStretcher {
  constructor(sourceData) {
    this.source = sourceData;
    this.accum = new Float32Array(GRAIN_SIZE);
    this.outQueue = [];
    this.outQueueOffset = 0;
    this.readPos = 0;
  }

  setReadPos(samples) {
    this.readPos = samples;
    this.accum.fill(0);
    this.outQueue = [];
    this.outQueueOffset = 0;
  }

  /** amostragem com interpolação linear + wrap de loop opcional */
  sampleAt(pos, loop) {
    let p = pos;
    if (loop && loop.enabled && loop.end > loop.start) {
      const span = loop.end - loop.start;
      if (p >= loop.end) p = loop.start + ((p - loop.start) % span);
    }
    const i0 = Math.floor(p);
    const i1 = i0 + 1;
    const frac = p - i0;
    const s0 = i0 >= 0 && i0 < this.source.length ? this.source[i0] : 0;
    const s1 = i1 >= 0 && i1 < this.source.length ? this.source[i1] : 0;
    return s0 + (s1 - s0) * frac;
  }

  generateGrain(rate, loop) {
    for (let i = 0; i < GRAIN_SIZE; i++) {
      this.accum[i] += this.sampleAt(this.readPos + i, loop) * WINDOW[i];
    }

    this.outQueue.push(this.accum.slice(0, HOP_OUT));
    this.accum.copyWithin(0, HOP_OUT);
    this.accum.fill(0, GRAIN_SIZE - HOP_OUT);

    this.readPos += HOP_OUT * rate;
    if (loop && loop.enabled && loop.end > loop.start && this.readPos >= loop.end) {
      const span = loop.end - loop.start;
      this.readPos = loop.start + ((this.readPos - loop.start) % span);
    }
  }

  pull(n, rate, loop) {
    const out = new Float32Array(n);
    let filled = 0;
    while (filled < n) {
      if (this.outQueue.length === 0) this.generateGrain(rate, loop);
      const chunk = this.outQueue[0];
      const avail = chunk.length - this.outQueueOffset;
      const take = Math.min(avail, n - filled);
      out.set(chunk.subarray(this.outQueueOffset, this.outQueueOffset + take), filled);
      filled += take;
      this.outQueueOffset += take;
      if (this.outQueueOffset >= chunk.length) {
        this.outQueue.shift();
        this.outQueueOffset = 0;
      }
    }
    return out;
  }
}

class TimeStretchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = null; // ChannelStretcher[]
    this.rate = 1;
    this.playing = false;
    this.loop = { enabled: false, start: 0, end: 0 };

    this.port.onmessage = (event) => {
      const msg = event.data;
      switch (msg.type) {
        case "load":
          this.channels = msg.channelData.map((data) => new ChannelStretcher(data));
          break;
        case "setRate":
          this.rate = msg.rate;
          break;
        case "setPlaying":
          this.playing = msg.playing;
          break;
        case "seek":
          this.channels?.forEach((c) => c.setReadPos(msg.positionSamples));
          break;
        case "setLoop":
          this.loop = { enabled: msg.enabled, start: msg.startSamples, end: msg.endSamples };
          break;
        default:
          break;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!this.channels || !this.playing) {
      // silêncio — deixa os buffers zerados como já vêm por padrão
      return true;
    }

    for (let ch = 0; ch < output.length; ch++) {
      const stretcher = this.channels[ch] ?? this.channels[0];
      output[ch].set(stretcher.pull(output[ch].length, this.rate, this.loop));
    }

    return true;
  }
}

registerProcessor("time-stretch-processor", TimeStretchProcessor);
