import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { WorldEntity, RootName } from "./types.js";
import { normKey, type Roots } from "./paths.js";
import { ROOT_NAMES } from "./platform.js";

const MAX_DEPTH = 2;            // root children = depth 1, their children = depth 2
const MAX_PER_DIR = 150;
const TARGET_TOTAL = 200;
const IGNORED_NAMES = new Set([
  "node_modules", ".git", "$recycle.bin", "desktop.ini", "thumbs.db", "ntuser.dat",
  "system volume information", "my music", "my pictures", "my videos", "__pycache__", ".venv", "venv",
]);

export function entityId(p: string): string {
  return createHash("sha1").update(normKey(p)).digest("hex").slice(0, 12);
}

function isHidden(name: string): boolean {
  return name.startsWith(".") || name.startsWith("~$") || IGNORED_NAMES.has(name.toLowerCase());
}

async function safeReaddir(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // permission denied, junction to nowhere, vanished mid-scan: all fine
  }
}

async function safeStat(p: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.stat(p);
  } catch {
    return null;
  }
}

type Scanned = WorldEntity & { depth: number };

async function scanDir(dir: string, root: RootName, depth: number, out: Scanned[], parentPath: string | null) {
  const dirents = await safeReaddir(dir);
  let count = 0;
  const subdirs: string[] = [];
  for (const d of dirents) {
    if (count >= MAX_PER_DIR) break;
    if (isHidden(d.name)) continue;
    if (d.isSymbolicLink()) continue; // junctions/reparse points: skip, never follow
    const full = path.join(dir, d.name);
    const st = await safeStat(full);
    if (!st) continue;
    const isDir = st.isDirectory();
    if (!isDir && !st.isFile()) continue;
    const ext = isDir ? undefined : path.extname(d.name).replace(/^\./, "").toLowerCase() || undefined;
    out.push({
      id: entityId(full),
      kind: isDir ? "folder" : "file",
      name: d.name,
      path: full,
      extension: ext,
      parentPath,
      root,
      size: isDir ? undefined : st.size,
      modifiedAt: st.mtimeMs,
      depth,
    });
    count++;
    if (isDir) subdirs.push(full);
  }
  if (depth < MAX_DEPTH) {
    for (const sub of subdirs) await scanDir(sub, root, depth + 1, out, sub === dir ? null : sub);
  }
}

/** Direct children always win; deeper entries are ranked by recency until the budget is spent. */
function prioritize(all: Scanned[]): WorldEntity[] {
  const top = all.filter((e) => e.depth === 1);
  const deep = all.filter((e) => e.depth > 1).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0);
  });
  const keep = new Map<string, Scanned>();
  for (const e of top) keep.set(e.id, e);
  for (const e of deep) {
    if (keep.size >= TARGET_TOTAL) break;
    keep.set(e.id, e);
  }
  // never orphan: a kept child needs its parent kept too
  const byPath = new Map(all.map((e) => [normKey(e.path), e]));
  for (const e of [...keep.values()]) {
    if (e.parentPath) {
      const parent = byPath.get(normKey(e.parentPath));
      if (parent) keep.set(parent.id, parent);
    }
  }
  return [...keep.values()].map(({ depth: _d, ...rest }) => rest);
}

export class WorldIndex {
  private entities: WorldEntity[] = [];
  private scanning: Promise<WorldEntity[]> | null = null;
  lastScanAt = 0;
  lastScanMs = 0;

  constructor(private roots: Roots) {}

  get count() {
    return this.entities.length;
  }

  current(): WorldEntity[] {
    return this.entities;
  }

  /** Coalesces concurrent callers onto one scan. */
  async rescan(): Promise<WorldEntity[]> {
    if (this.scanning) return this.scanning;
    this.scanning = (async () => {
      const t0 = Date.now();
      const all: Scanned[] = [];
      for (const name of ROOT_NAMES) {
        const dir = this.roots[name];
        const st = await safeStat(dir);
        if (!st || !st.isDirectory()) continue;
        try {
          await scanDir(dir, name, 1, all, null);
        } catch (e) {
          console.warn(`[scan] ${name} failed:`, (e as Error).message);
        }
      }
      // parentPath for direct children is the root dir itself, not null? Contract: null means root-level.
      this.entities = prioritize(all);
      this.lastScanAt = Date.now();
      this.lastScanMs = this.lastScanAt - t0;
      this.scanning = null;
      return this.entities;
    })();
    return this.scanning;
  }

  search(q: string, limit = 25): WorldEntity[] {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const scored: { e: WorldEntity; s: number }[] = [];
    for (const e of this.entities) {
      const name = e.name.toLowerCase();
      let s = 0;
      if (name === needle) s = 100;
      else if (name.startsWith(needle)) s = 80;
      else if (name.includes(needle)) s = 60;
      else if (isSubsequence(needle, name)) s = 20;
      else continue;
      s -= Math.min(name.length, 40) / 10; // shorter names rank a little higher
      if (e.kind === "folder") s += 2;
      scored.push({ e, s });
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.e);
  }
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}
