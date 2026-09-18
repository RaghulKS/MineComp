import path from "node:path";
import fs from "node:fs";
import { isWindows, ROOT_NAMES, toNativePath } from "./platform.js";
import type { RootName } from "./types.js";

export class PathError extends Error {
  status: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.status = status;
  }
}

export type Roots = Record<RootName, string>;

export function buildRoots(resolved: Record<RootName, string>): Roots {
  const out = {} as Roots;
  for (const n of ROOT_NAMES) out[n] = path.resolve(resolved[n]);
  return out;
}

/** Case-insensitive on Windows (and WSL's drvfs, which fronts NTFS). */
export function normKey(p: string): string {
  const n = path.resolve(p).replace(/[\\/]+$/, "");
  return n.toLowerCase();
}

function isInside(child: string, parent: string): boolean {
  const c = normKey(child);
  const p = normKey(parent);
  return c === p || c.startsWith(p + (isWindows ? "\\" : "/"));
}

/**
 * The single gate every user-supplied path passes through.
 * Accepts native or Windows-style paths; returns the resolved native path and its root.
 * Throws PathError for traversal, malformed input, or anything outside the roots.
 */
export function normalizeAndValidatePath(input: unknown, roots: Roots): { path: string; root: RootName } {
  if (typeof input !== "string" || input.length === 0 || input.length > 4096) {
    throw new PathError("path must be a non-empty string");
  }
  if (input.includes("\0")) throw new PathError("malformed path");
  const native = toNativePath(input.trim());
  const resolved = path.resolve(native);
  // path.resolve already collapses "..", but a literal check catches sneaky encodings.
  if (resolved.split(/[\\/]/).includes("..")) throw new PathError("path traversal rejected");
  for (const name of ROOT_NAMES) {
    if (isInside(resolved, roots[name])) return { path: resolved, root: name };
  }
  throw new PathError("path is outside the allowed roots (Desktop, Documents, Downloads)", 403);
}

/** Like validate, but also requires the path to currently exist on disk. */
export async function validateExisting(input: unknown, roots: Roots) {
  const v = normalizeAndValidatePath(input, roots);
  try {
    const st = await fs.promises.lstat(v.path);
    return { ...v, stat: st };
  } catch {
    throw new PathError("path does not exist", 404);
  }
}
