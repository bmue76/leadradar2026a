import * as path from "node:path";
import * as fs from "node:fs";
import { promises as fsp } from "node:fs";
import { Readable } from "node:stream";

export type StoragePutTextOptions = {
  rootDirName: string; // e.g. ".tmp_exports"
  relativeKey: string; // e.g. "<tenantId>/<jobId>.csv"
  content: string;
};

export type StoragePutBinaryOptions = {
  rootDirName: string; // e.g. ".tmp_branding"
  relativeKey: string; // e.g. "tenants/<tenantId>/branding/logo-<uuid>.png"
  data: Uint8Array; // Buffer is fine too (subclass of Uint8Array)
};

export type StoragePutFromPathOptions = {
  rootDirName: string;
  relativeKey: string;
  sourceAbsPath: string; // absolute path to local file (dev seed assets etc.)
};

export type StorageGetPathOptions = {
  rootDirName: string;
  relativeKey: string;
};

function assertSafeRelativeKey(relativeKey: string) {
  // Prevent path traversal + absolute paths
  if (!relativeKey || typeof relativeKey !== "string") {
    throw new Error("Invalid storage key.");
  }
  if (relativeKey.includes("\0")) throw new Error("Invalid storage key.");
  if (path.isAbsolute(relativeKey)) throw new Error("Invalid storage key.");
  const normalized = path.posix.normalize(relativeKey.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("Invalid storage key.");
  }
  // Allow a safe subset of characters
  if (!/^[a-zA-Z0-9._\-\/]+$/.test(normalized)) {
    throw new Error("Invalid storage key.");
  }
}

export function getStorageRoot(rootDirName: string): string {
  // Root is repo cwd (dev stub). GoLive will replace with object storage.
  return path.join(process.cwd(), rootDirName);
}

export function getAbsolutePath(opts: StorageGetPathOptions): string {
  assertSafeRelativeKey(opts.relativeKey);
  const root = getStorageRoot(opts.rootDirName);
  const abs = path.resolve(root, opts.relativeKey);

  // Guard: abs must be inside root
  const rootResolved = path.resolve(root);
  if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
    throw new Error("Invalid storage key.");
  }
  return abs;
}

export async function putTextFile(opts: StoragePutTextOptions): Promise<void> {
  assertSafeRelativeKey(opts.relativeKey);
  const abs = getAbsolutePath({ rootDirName: opts.rootDirName, relativeKey: opts.relativeKey });
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, opts.content, "utf8");
}

export async function putBinaryFile(
  opts: StoragePutBinaryOptions,
): Promise<{ absPath: string; sizeBytes: number; mtimeMs: number }> {
  assertSafeRelativeKey(opts.relativeKey);
  const abs = getAbsolutePath({ rootDirName: opts.rootDirName, relativeKey: opts.relativeKey });
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, Buffer.from(opts.data));
  const st = await statFile(abs);
  return { absPath: abs, sizeBytes: st.sizeBytes, mtimeMs: st.mtimeMs };
}

export async function putFileFromLocalPath(
  opts: StoragePutFromPathOptions,
): Promise<{ absPath: string; sizeBytes: number; mtimeMs: number }> {
  assertSafeRelativeKey(opts.relativeKey);
  if (!path.isAbsolute(opts.sourceAbsPath)) {
    throw new Error("sourceAbsPath must be absolute.");
  }
  const abs = getAbsolutePath({ rootDirName: opts.rootDirName, relativeKey: opts.relativeKey });
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.copyFile(opts.sourceAbsPath, abs);
  const st = await statFile(abs);
  return { absPath: abs, sizeBytes: st.sizeBytes, mtimeMs: st.mtimeMs };
}

export async function deleteFileIfExists(opts: StorageGetPathOptions): Promise<void> {
  const abs = getAbsolutePath(opts);
  try {
    await fsp.unlink(abs);
  } catch (e) {
    // Ignore ENOENT (missing). Re-throw anything else.
    const anyErr = e as { code?: string };
    if (anyErr?.code !== "ENOENT") throw e;
  }
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    const st = await fsp.stat(absPath);
    return st.isFile();
  } catch {
    return false;
  }
}

export async function statFile(absPath: string): Promise<{ sizeBytes: number; mtimeMs: number }> {
  const st = await fsp.stat(absPath);
  if (!st.isFile()) throw new Error("Not a file.");
  return { sizeBytes: st.size, mtimeMs: st.mtimeMs };
}

export function streamFileWeb(absPath: string): ReadableStream<Uint8Array> {
  const nodeStream = fs.createReadStream(absPath);
  // Convert Node stream to Web stream (Node 18+)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Readable.toWeb(nodeStream as any) as ReadableStream<Uint8Array>;
}
