import path from "node:path";
import fs from "node:fs/promises";

const EXPORTS_ROOT = path.resolve(process.cwd(), ".tmp_exports");

/**
 * Resolves a relative storage key into an absolute path under .tmp_exports
 * and blocks path traversal.
 */
function resolveStoragePath(storageKey: string): string {
  const cleaned = storageKey.replace(/^[/\\]+/, "");
  const abs = path.resolve(EXPORTS_ROOT, cleaned);
  if (!abs.startsWith(EXPORTS_ROOT + path.sep) && abs !== EXPORTS_ROOT) {
    throw new Error("Invalid storageKey (path traversal blocked).");
  }
  return abs;
}

export async function ensureExportsRoot(): Promise<void> {
  await fs.mkdir(EXPORTS_ROOT, { recursive: true });
}

export async function writeExportFile(storageKey: string, content: Buffer): Promise<void> {
  await ensureExportsRoot();
  const abs = resolveStoragePath(storageKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
}

export async function readExportFile(storageKey: string): Promise<Buffer> {
  const abs = resolveStoragePath(storageKey);
  return await fs.readFile(abs);
}

export async function existsExportFile(storageKey: string): Promise<boolean> {
  try {
    const abs = resolveStoragePath(storageKey);
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}
