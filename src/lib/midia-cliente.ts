/** Reduz a foto no aparelho (máx. 1600 px, JPEG). Se o navegador não abrir o formato, manda como está. */
export async function prepararFoto(arquivo: File): Promise<{ blob: Blob; tipo: string; extensao: string }> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob) return { blob, tipo: "image/jpeg", extensao: "jpg" };
  } catch {
    /* segue com o arquivo original */
  }
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
  return { blob: arquivo, tipo: arquivo.type || "image/jpeg", extensao };
}

/** Foto reduzida ou vídeo como está, pronto para subir. */
export async function prepararArquivo(
  arquivo: File
): Promise<{ blob: Blob; tipo: string; extensao: string; midia: "foto" | "video" } | null> {
  if (arquivo.type.startsWith("video/")) {
    return { blob: arquivo, tipo: arquivo.type, extensao: arquivo.name.split(".").pop()?.toLowerCase() || "mp4", midia: "video" };
  }
  if (arquivo.type.startsWith("image/")) return { ...(await prepararFoto(arquivo)), midia: "foto" };
  return null;
}
