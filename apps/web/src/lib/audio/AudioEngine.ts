/**
 * Encapsula a Web Audio API nativa atrás de uma API interna limpa.
 * Ver docs/SPEC.md §6.2 — nenhum componente de UI deve tocar em
 * AudioContext/AudioBufferSourceNode diretamente, só nesta classe.
 *
 * Dois caminhos de reprodução:
 * - rate === 1: AudioBufferSourceNode nativo (barato, sem artefatos), com
 *   loop nativo via source.loop/loopStart/loopEnd quando aplicável.
 * - rate !== 1: AudioWorkletNode rodando o time-stretch OLA em
 *   public/worklets/time-stretch-processor.js, para preservar o pitch.
 *
 * Em AMBOS os casos, currentTime continua sendo derivado do relógio do
 * AudioContext (nunca lido do worklet nem guardado em estado do React) —
 * ver docs/SPEC.md §4.3. Com o worklet, cada segundo de tempo real consome
 * exatamente `rate` segundos de faixa original (é assim que o stretcher
 * funciona), então a fórmula abaixo continua válida nos dois caminhos.
 */

export type PlaybackState = "idle" | "playing" | "paused" | "ended";

export interface LoopRegion {
  start: number; // segundos
  end: number; // segundos
}

type Listener = (state: PlaybackState) => void;

const WORKLET_URL = "/worklets/time-stretch-processor.js";
const MIN_RATE = 0.25;
const MAX_RATE = 2.0;

export class AudioEngine {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;

  // caminho nativo (rate === 1)
  private nativeSource: AudioBufferSourceNode | null = null;

  // caminho com time-stretch (rate !== 1)
  private workletNode: AudioWorkletNode | null = null;
  private workletReady = false;

  private startedAtContextTime = 0;
  private startOffset = 0;
  private rate = 1;

  private loop: LoopRegion | null = null;
  private loopEnabled = false;

  private state: PlaybackState = "idle";
  private listeners = new Set<Listener>();

  async loadFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.context ??= new AudioContext();
    const buffer = await this.context.decodeAudioData(arrayBuffer);
    this.buffer = buffer;
    this.startOffset = 0;
    this.setState("idle");
    return buffer;
  }

  private async ensureWorklet(): Promise<AudioWorkletNode | null> {
    if (!this.context) return null;
    if (this.workletNode) return this.workletNode;

    try {
      if (!this.workletReady) {
        await this.context.audioWorklet.addModule(WORKLET_URL);
        this.workletReady = true;
      }
      const node = new AudioWorkletNode(this.context, "time-stretch-processor", {
        outputChannelCount: [this.buffer?.numberOfChannels ?? 2],
      });
      node.connect(this.context.destination);
      this.workletNode = node;
      return node;
    } catch (err) {
      // navegador sem suporte a AudioWorklet — degrada graciosamente,
      // ver docs/SPEC.md NFR "Suporte a navegadores"
      console.warn("[AudioEngine] AudioWorklet indisponível, sem preservação de pitch:", err);
      return null;
    }
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  get playbackRate(): number {
    return this.rate;
  }

  get loopRegion(): LoopRegion | null {
    return this.loop;
  }

  get isLoopEnabled(): boolean {
    return this.loopEnabled;
  }

  /** Posição atual na faixa, em segundos — chamar dentro de um rAF, não guardar em estado do React. */
  getCurrentTime(): number {
    if (!this.context) return 0;
    if (this.state !== "playing") return this.startOffset;

    const elapsedRealTime = this.context.currentTime - this.startedAtContextTime;
    let raw = this.startOffset + elapsedRealTime * this.rate;

    // a fonte nativa (ou o worklet) "volta" sozinha pro início do loop —
    // essa fórmula precisa saber disso, senão o cursor visual continua
    // subindo linearmente e sai da região do loop mesmo com o áudio
    // corretamente repetindo por baixo.
    if (this.loopEnabled && this.loop && this.loop.end > this.loop.start && raw >= this.loop.end) {
      const span = this.loop.end - this.loop.start;
      raw = this.loop.start + ((raw - this.loop.start) % span);
    }

    return Math.min(raw, this.duration);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    const clamped = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
    if (clamped === this.rate) return;

    const wasPlaying = this.state === "playing";
    const position = this.getCurrentTime();

    this.stopAllSources();
    this.rate = clamped;
    this.startOffset = position;

    if (wasPlaying) {
      // stopAllSources() só para o áudio — o estado interno continua
      // "playing" até aqui. Sem resetá-lo, play() below acha que já está
      // tocando (é a guarda `if (this.state === "playing") return`) e
      // ignora silenciosamente o pedido de reiniciar com a nova taxa.
      this.state = "paused";
      await this.play();
    }
  }

  /**
   * Define a região de loop e já habilita/desabilita o loop de forma atômica
   * (uma região não-nula habilita automaticamente; `null` desabilita e limpa).
   * Evita a janela de inconsistência de ter que chamar setLoopEnabled à parte.
   */
  setLoopRegion(region: LoopRegion | null): void {
    this.loop = region;
    this.loopEnabled = region !== null && region.end > region.start;
    this.applyLoopToActiveSource();
  }

  setLoopEnabled(enabled: boolean): void {
    this.loopEnabled = enabled;
    this.applyLoopToActiveSource();
  }

  private applyLoopToActiveSource(): void {
    const active = this.loopEnabled && this.loop && this.loop.end > this.loop.start;

    if (this.nativeSource) {
      this.nativeSource.loop = Boolean(active);
      if (active && this.loop) {
        this.nativeSource.loopStart = this.loop.start;
        this.nativeSource.loopEnd = this.loop.end;
      }
    }

    if (this.workletNode && this.buffer) {
      this.workletNode.port.postMessage({
        type: "setLoop",
        enabled: Boolean(active),
        startSamples: (this.loop?.start ?? 0) * this.buffer.sampleRate,
        endSamples: (this.loop?.end ?? 0) * this.buffer.sampleRate,
      });
    }
  }

  async play(): Promise<void> {
    if (!this.context || !this.buffer) return;
    if (this.state === "playing") return;

    // O navegador pode suspender o AudioContext quando não há fontes ativas
    // (economia de energia) — isso acontece tipicamente logo após um pause().
    // Sem isso, o áudio fica mudo até algo (como um seek) forçar um novo
    // grafo, mesmo com o relógio (currentTime) parecendo continuar OK.
    try {
      await this.context.resume();
    } catch (err) {
      console.warn("[AudioEngine] falha ao retomar o AudioContext:", err);
    }

    this.stopAllSources();

    if (this.rate === 1) {
      await this.playNative();
    } else {
      await this.playWithWorklet();
    }

    this.startedAtContextTime = this.context.currentTime;
    this.setState("playing");
  }

  private async playNative(): Promise<void> {
    if (!this.context || !this.buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      if (this.nativeSource === source && this.getCurrentTime() >= this.duration - 0.05) {
        this.startOffset = 0;
        this.setState("ended");
      }
    };
    source.start(0, this.startOffset);
    this.nativeSource = source;
    this.applyLoopToActiveSource();
  }

  private async playWithWorklet(): Promise<void> {
    if (!this.context || !this.buffer) return;
    const node = await this.ensureWorklet();

    if (!node) {
      // sem suporte a worklet: cai pra nativo (perde preservação de pitch,
      // mas o app continua funcional — ver console.warn em ensureWorklet)
      await this.playNative();
      return;
    }

    const channelData = Array.from({ length: this.buffer.numberOfChannels }, (_, ch) =>
      this.buffer!.getChannelData(ch).slice(),
    );

    node.port.postMessage({ type: "load", channelData }, channelData.map((c) => c.buffer));
    node.port.postMessage({ type: "setRate", rate: this.rate });
    node.port.postMessage({
      type: "seek",
      positionSamples: this.startOffset * this.buffer.sampleRate,
    });
    node.port.postMessage({ type: "setPlaying", playing: true });
    this.applyLoopToActiveSource();
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.startOffset = this.getCurrentTime();
    this.stopAllSources();
    this.setState("paused");
  }

  stop(): void {
    this.stopAllSources();
    this.startOffset = 0;
    this.setState("idle");
  }

  /** Scrub/seek — usado tanto pelos controles de transporte quanto pelo clique na waveform. */
  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration));
    const wasPlaying = this.state === "playing";

    this.stopAllSources();
    this.startOffset = clamped;

    if (this.workletNode && this.buffer) {
      this.workletNode.port.postMessage({
        type: "seek",
        positionSamples: clamped * this.buffer.sampleRate,
      });
    }

    if (wasPlaying) {
      // mesmo problema de setPlaybackRate: sem isso, play() acha que já
      // está tocando e não reagenda a fonte — o cursor volta a andar
      // (getCurrentTime usa o novo startOffset normalmente), mas o áudio
      // fica mudo até um pause/play manual "destravar" o estado.
      this.state = "paused";
      void this.play();
    } else {
      this.setState(this.state === "idle" ? "idle" : "paused");
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.stopAllSources();
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.context?.close();
    this.context = null;
    this.buffer = null;
  }

  private stopAllSources(): void {
    if (this.nativeSource) {
      this.nativeSource.onended = null;
      try {
        this.nativeSource.stop();
      } catch {
        // já pode ter parado sozinho — ignora
      }
      this.nativeSource.disconnect();
      this.nativeSource = null;
    }
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "setPlaying", playing: false });
    }
  }

  private setState(state: PlaybackState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
