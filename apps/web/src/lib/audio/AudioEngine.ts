/**
 * Encapsula a Web Audio API nativa atrás de uma API interna limpa.
 * Ver docs/SPEC.md §6.2 — nenhum componente de UI deve tocar em
 * AudioContext/AudioBufferSourceNode diretamente, só nesta classe.
 *
 * currentTime é lido sob demanda (getCurrentTime), não guardado em estado
 * do React: o relógio de transporte é o próprio AudioContext, e quem
 * precisa desenhar a cada frame (o playhead da waveform) lê direto daqui
 * dentro de um requestAnimationFrame — assim o app inteiro não re-renderiza
 * 60x por segundo. Ver docs/SPEC.md §4.3 "Arquitetura de sincronização".
 */

export type PlaybackState = "idle" | "playing" | "paused" | "ended";

type Listener = (state: PlaybackState) => void;

export class AudioEngine {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;

  /** tempo do AudioContext quando o play() atual começou */
  private startedAtContextTime = 0;
  /** posição na faixa (segundos) de onde o play() atual começou */
  private startOffset = 0;

  private state: PlaybackState = "idle";
  private listeners = new Set<Listener>();

  async loadFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.context ??= new AudioContext();
    // decodeAudioData desconecta (neuters) o ArrayBuffer original, então
    // quem chamar isso deve ter feito uma cópia se ainda precisar dos bytes brutos.
    const buffer = await this.context.decodeAudioData(arrayBuffer);
    this.buffer = buffer;
    this.startOffset = 0;
    this.setState("idle");
    return buffer;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get playbackState(): PlaybackState {
    return this.state;
  }

  /** Posição atual na faixa, em segundos — chamar dentro de um rAF, não guardar em estado do React. */
  getCurrentTime(): number {
    if (!this.context) return 0;
    if (this.state !== "playing") return this.startOffset;

    const elapsed = this.context.currentTime - this.startedAtContextTime;
    return Math.min(this.startOffset + elapsed, this.duration);
  }

  play(): void {
    if (!this.context || !this.buffer) return;
    if (this.state === "playing") return;

    this.stopInternalSource();

    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      // onended também dispara quando paramos manualmente (stop/seek);
      // só tratamos como "acabou de verdade" se ainda formos a source ativa
      // e o tempo bateu no fim da faixa.
      if (this.source === source && this.getCurrentTime() >= this.duration - 0.05) {
        this.startOffset = 0;
        this.setState("ended");
      }
    };

    source.start(0, this.startOffset);
    this.source = source;
    this.startedAtContextTime = this.context.currentTime;
    this.setState("playing");
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.startOffset = this.getCurrentTime();
    this.stopInternalSource();
    this.setState("paused");
  }

  stop(): void {
    this.stopInternalSource();
    this.startOffset = 0;
    this.setState("idle");
  }

  /** Scrub/seek — usado tanto pelos controles de transporte quanto pelo clique na waveform. */
  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.duration));
    const wasPlaying = this.state === "playing";

    this.stopInternalSource();
    this.startOffset = clamped;

    if (wasPlaying) {
      this.play();
    } else {
      this.setState(this.state === "idle" ? "idle" : "paused");
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.stopInternalSource();
    this.context?.close();
    this.context = null;
    this.buffer = null;
  }

  private stopInternalSource(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // já pode ter parado sozinho — ignora
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  private setState(state: PlaybackState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
