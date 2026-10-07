/**
 * Armazenamento de áudio em disco local — ver docs/DECISIONS.md (sem S3
 * ainda; isso vira um adaptador trocável quando houver object storage real,
 * a assinatura dessas duas funções é o que um cliente S3 precisaria expor).
 */
import { mkdir, unlink, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config/index.js";

export async function saveAudioFile(
  ownerId: string,
  originalName: string,
  buffer: Buffer,
): Promise<string> {
  const ext = originalName.includes(".") ? originalName.split(".").pop() : "bin";
  const dir = join(config.storageDir, ownerId);
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const fullPath = join(dir, filename);
  await writeFile(fullPath, buffer);

  return fullPath;
}

export async function readAudioFile(storagePath: string): Promise<Buffer> {
  return readFile(storagePath);
}

export async function deleteAudioFile(storagePath: string): Promise<void> {
  await unlink(storagePath).catch(() => {}); // já pode ter sido removido — ok
}
