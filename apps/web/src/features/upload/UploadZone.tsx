import { useCallback, useRef, useState } from "react";
import { usePlayerStore } from "../../stores/playerStore";
import "./UploadZone.css";

export function UploadZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const status = usePlayerStore((s) => s.status);
  const errorMessage = usePlayerStore((s) => s.errorMessage);
  const loadFile = usePlayerStore((s) => s.loadFile);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  const isBusy = status === "validating" || status === "decoding";

  return (
    <div
      className={`upload-zone ${isDragOver ? "upload-zone--drag" : ""} ${
        status === "error" ? "upload-zone--error" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      aria-label="Enviar arquivo de áudio"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.ogg"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {isBusy && (
        <p className="upload-zone__status" aria-live="polite">
          {status === "validating" ? "Verificando arquivo..." : "Decodificando áudio..."}
        </p>
      )}

      {!isBusy && status !== "error" && (
        <>
          <p className="upload-zone__title">Arraste uma faixa aqui</p>
          <p className="upload-zone__hint">
            ou clique para escolher — MP3, WAV, FLAC ou OGG, até 100 MB
          </p>
        </>
      )}

      {status === "error" && (
        <p className="upload-zone__error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
