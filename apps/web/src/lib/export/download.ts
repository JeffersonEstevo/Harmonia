/** Dispara o download de um Blob no navegador. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // adia o revoke: revogar na hora cancela o download em alguns navegadores
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Rasteriza o SVG anotado em PNG usando <img> + <canvas> (2x por padrão, pra
 * ficar nítido em telas de alta densidade). Só funciona no navegador.
 * O SVG é carregado como imagem (não injetado no DOM), então nenhum script
 * embutido executaria mesmo se algo passasse pelo escape.
 */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const widthMatch = /width="(\d+)"/.exec(svg);
    const heightMatch = /height="(\d+)"/.exec(svg);
    if (!widthMatch || !heightMatch) {
      reject(new Error("SVG sem dimensões"));
      return;
    }
    const w = Number(widthMatch[1]);
    const h = Number(heightMatch[1]);

    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("Canvas indisponível"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG"))),
        "image/png",
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Falha ao renderizar o SVG"));
    };
    img.src = svgUrl;
  });
}
