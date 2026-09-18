import type { Root, SearchResult, SystemStats, WorldEntity } from "./types";

export const API_BASE = "http://localhost:8787";
export const WS_URL = "ws://localhost:8787/ws";

const TIMEOUT_MS = 4000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 140)}` : ""}`);
    }
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- normalization helpers ----------

const ROOTS: Root[] = ["Desktop", "Documents", "Downloads"];

function inferRoot(e: Partial<WorldEntity>): Root {
  if (e.root && ROOTS.includes(e.root as Root)) return e.root as Root;
  const p = (e.path ?? "").toLowerCase();
  if (p.includes("download")) return "Downloads";
  if (p.includes("document")) return "Documents";
  return "Desktop";
}

export function normalizeEntity(raw: unknown): WorldEntity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const path = typeof r.path === "string" ? r.path : null;
  if (!path) return null;
  const name =
    typeof r.name === "string" && r.name.length > 0 ? r.name : path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const kindRaw = String(r.kind ?? r.type ?? "file").toLowerCase();
  const kind: WorldEntity["kind"] = kindRaw.startsWith("dir") || kindRaw === "folder" ? "folder" : "file";
  let extension = typeof r.extension === "string" ? r.extension : undefined;
  if (!extension && kind === "file") {
    const m = name.match(/\.([a-z0-9]+)$/i);
    if (m) extension = m[1];
  }
  if (extension) extension = extension.replace(/^\./, "").toLowerCase();
  const parentPath =
    typeof r.parentPath === "string" ? r.parentPath : r.parentPath === null ? null : typeof r.parent === "string" ? (r.parent as string) : null;
  const modifiedAt =
    typeof r.modifiedAt === "number"
      ? r.modifiedAt
      : typeof r.mtime === "number"
        ? (r.mtime as number)
        : typeof r.modifiedAt === "string"
          ? Date.parse(r.modifiedAt)
          : undefined;
  return {
    id: typeof r.id === "string" ? r.id : path,
    kind,
    name,
    path,
    extension,
    parentPath,
    root: inferRoot({ root: r.root as Root | undefined, path }),
    size: typeof r.size === "number" ? r.size : undefined,
    modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : undefined,
  };
}

function extractEntityArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const key of ["entities", "world", "items", "nodes", "data", "results"]) {
      if (Array.isArray(d[key])) return d[key] as unknown[];
    }
    // roots keyed object: { Desktop: [...], Documents: [...], Downloads: [...] }
    const collected: unknown[] = [];
    for (const key of Object.keys(d)) {
      if (Array.isArray(d[key])) collected.push(...(d[key] as unknown[]));
    }
    if (collected.length) return collected;
  }
  return [];
}

export function normalizeWorld(data: unknown): WorldEntity[] {
  const arr = extractEntityArray(data);
  const out: WorldEntity[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    const e = normalizeEntity(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function pct(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  if (v >= 0 && v <= 1.0001) return v * 100;
  return Math.max(0, Math.min(100, v));
}

export function normalizeSystem(data: unknown): SystemStats {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const cpuObj = (d.cpu && typeof d.cpu === "object" ? d.cpu : {}) as Record<string, unknown>;
  const memObj = ((d.memory ?? d.mem ?? d.ram) && typeof (d.memory ?? d.mem ?? d.ram) === "object"
    ? (d.memory ?? d.mem ?? d.ram)
    : {}) as Record<string, unknown>;

  const cpu =
    pct(d.cpu) ??
    pct(d.cpuPercent) ??
    pct(d.cpuUsage) ??
    pct(d.cpuLoad) ??
    pct(cpuObj.usage) ??
    pct(cpuObj.percent) ??
    pct(cpuObj.load) ??
    pct(cpuObj.usagePercent) ??
    0;

  let ram =
    pct(d.ram) ??
    pct(d.ramPercent) ??
    pct(d.memoryPercent) ??
    pct(d.memPercent) ??
    pct(d.memoryUsage) ??
    pct(memObj.percent) ??
    pct(memObj.usage) ??
    pct(memObj.usedPercent) ??
    pct(memObj.usagePercent);

  const total = (memObj.total ?? d.totalMem ?? d.memTotal ?? d.ramTotal) as number | undefined;
  const used = (memObj.used ?? d.usedMem ?? d.memUsed ?? d.ramUsed) as number | undefined;
  const free = (memObj.free ?? d.freeMem ?? d.memFree) as number | undefined;
  let ramUsedGb: number | undefined;
  let ramTotalGb: number | undefined;
  if (typeof total === "number" && total > 0) {
    const usedBytes = typeof used === "number" ? used : typeof free === "number" ? total - free : undefined;
    const scale = total > 1e9 ? 1 / 1024 ** 3 : total > 1e6 ? 1 / 1024 ** 2 : total > 1e3 ? 1 / 1024 : 1;
    ramTotalGb = total * scale;
    if (typeof usedBytes === "number") {
      ramUsedGb = usedBytes * scale;
      if (ram === undefined) ram = (usedBytes / total) * 100;
    }
  }

  return {
    cpu: Math.round(cpu),
    ram: Math.round(ram ?? 0),
    ramUsedGb,
    ramTotalGb,
    hostname: typeof d.hostname === "string" ? d.hostname : undefined,
    platform: typeof d.platform === "string" ? d.platform : undefined,
    uptime: typeof d.uptime === "number" ? d.uptime : undefined,
    live: true,
  };
}

// ---------- API calls ----------

export async function fetchWorld(): Promise<WorldEntity[]> {
  const data = await request<unknown>("/api/world");
  return normalizeWorld(data);
}

export async function fetchSystem(): Promise<SystemStats> {
  const data = await request<unknown>("/api/system");
  return normalizeSystem(data);
}

export async function openPath(path: string): Promise<void> {
  await request("/api/open", { method: "POST", body: JSON.stringify({ path }) });
}

export async function moveEntity(sourcePath: string, destinationDirectory: string): Promise<unknown> {
  return request("/api/move", {
    method: "POST",
    body: JSON.stringify({ sourcePath, destinationDirectory }),
  });
}

export async function openApp(app: "chrome" | "vscode"): Promise<void> {
  await request("/api/app/open", { method: "POST", body: JSON.stringify({ app }) });
}

export async function searchWorld(q: string): Promise<SearchResult[]> {
  const data = await request<unknown>(`/api/search?q=${encodeURIComponent(q)}`);
  return normalizeWorld(data);
}

export function connectWorldSocket(handlers: {
  onMessage: (msg: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
}): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      attempt = 0;
      handlers.onOpen?.();
    };
    ws.onmessage = (ev) => {
      try {
        handlers.onMessage(JSON.parse(String(ev.data)));
      } catch {
        handlers.onMessage({ type: "raw", data: ev.data });
      }
    };
    ws.onclose = () => {
      handlers.onClose?.();
      schedule();
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  };

  const schedule = () => {
    if (closed) return;
    attempt += 1;
    const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
    timer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  };
}

// ---------- Fallback demo dataset ----------

const HOME = "C:\\Users\\Player";
const NOW = Date.now();
const DAY = 86400000;

function demo(
  root: Root,
  rel: string,
  kind: "file" | "folder",
  ageDays: number,
  size?: number,
): WorldEntity {
  const path = `${HOME}\\${root}${rel ? `\\${rel}` : ""}`;
  const name = rel.split("\\").pop() ?? root;
  const parentRel = rel.includes("\\") ? rel.slice(0, rel.lastIndexOf("\\")) : "";
  const parentPath = parentRel ? `${HOME}\\${root}\\${parentRel}` : `${HOME}\\${root}`;
  const ext = kind === "file" ? name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() : undefined;
  return {
    id: `demo:${path}`,
    kind,
    name,
    path,
    extension: ext,
    parentPath,
    root,
    size,
    modifiedAt: NOW - ageDays * DAY,
  };
}

export const FALLBACK_WORLD: WorldEntity[] = [
  // Desktop
  demo("Desktop", "Projects", "folder", 0.2),
  demo("Desktop", "Projects\\minecomp-client.ts", "file", 0.1, 48213),
  demo("Desktop", "Projects\\server.js", "file", 0.3, 22011),
  demo("Desktop", "Projects\\pipeline.py", "file", 1.2, 9800),
  demo("Desktop", "Projects\\README.md", "file", 2, 4021),
  demo("Desktop", "Screenshots", "folder", 1),
  demo("Desktop", "Screenshots\\demo-shot-01.png", "file", 0.5, 1_840_000),
  demo("Desktop", "Screenshots\\hud-mockup.jpg", "file", 3, 920_000),
  demo("Desktop", "Screenshots\\sunset.png", "file", 8, 2_100_000),
  demo("Desktop", "Games", "folder", 5),
  demo("Desktop", "Games\\theme.mp3", "file", 6, 5_200_000),
  demo("Desktop", "Games\\trailer.mp4", "file", 7, 88_000_000),
  demo("Desktop", "notes.txt", "file", 0.1, 1200),
  demo("Desktop", "hackathon-plan.md", "file", 0.05, 3300),
  demo("Desktop", "budget.xlsx", "file", 4, 66_000),
  demo("Desktop", "shortcut.lnk", "file", 20, 1200),
  // Documents
  demo("Documents", "Research", "folder", 2),
  demo("Documents", "Research\\quantum-notes.pdf", "file", 2, 3_400_000),
  demo("Documents", "Research\\voxel-rendering.pdf", "file", 4, 6_100_000),
  demo("Documents", "Research\\abstract.txt", "file", 9, 2200),
  demo("Documents", "Research\\bibliography.md", "file", 11, 8000),
  demo("Documents", "Writing", "folder", 3),
  demo("Documents", "Writing\\novel-draft.md", "file", 1, 220_000),
  demo("Documents", "Writing\\chapter-01.txt", "file", 3, 41_000),
  demo("Documents", "Writing\\cover-art.png", "file", 5, 1_100_000),
  demo("Documents", "Finance", "folder", 12),
  demo("Documents", "Finance\\taxes-2025.pdf", "file", 12, 890_000),
  demo("Documents", "Finance\\ledger.csv", "file", 15, 30_000),
  demo("Documents", "Finance\\receipts.zip", "file", 16, 12_000_000),
  demo("Documents", "Recipes", "folder", 30),
  demo("Documents", "Recipes\\ramen.md", "file", 30, 3200),
  demo("Documents", "Recipes\\bread.txt", "file", 45, 1800),
  demo("Documents", "manifesto.pdf", "file", 1.5, 120_000),
  demo("Documents", "journal.md", "file", 0.8, 44_000),
  // Downloads
  demo("Downloads", "Installers", "folder", 1),
  demo("Downloads", "Installers\\node-v24.msi", "file", 1, 62_000_000),
  demo("Downloads", "Installers\\vscode-setup.exe", "file", 2, 98_000_000),
  demo("Downloads", "Installers\\driver-pack.zip", "file", 4, 240_000_000),
  demo("Downloads", "Media", "folder", 0.5),
  demo("Downloads", "Media\\podcast-ep12.mp3", "file", 0.5, 44_000_000),
  demo("Downloads", "Media\\keynote.mp4", "file", 1, 310_000_000),
  demo("Downloads", "Media\\wallpaper-4k.jpg", "file", 2, 5_600_000),
  demo("Downloads", "Media\\loop.wav", "file", 6, 9_000_000),
  demo("Downloads", "Archive", "folder", 20),
  demo("Downloads", "Archive\\old-backup.zip", "file", 20, 1_200_000_000),
  demo("Downloads", "Archive\\photos-2024.zip", "file", 40, 800_000_000),
  demo("Downloads", "invoice-0917.pdf", "file", 0.2, 210_000),
  demo("Downloads", "dataset.csv", "file", 0.7, 12_000_000),
  demo("Downloads", "sample-code.py", "file", 0.9, 5400),
  demo("Downloads", "font-pack.zip", "file", 3, 24_000_000),
  demo("Downloads", "hero.png", "file", 0.3, 3_300_000),
];

export function fallbackSearch(entities: WorldEntity[], q: string): SearchResult[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return entities
    .map((e) => {
      const n = e.name.toLowerCase();
      let score = 0;
      if (n === needle) score = 100;
      else if (n.startsWith(needle)) score = 80;
      else if (n.includes(needle)) score = 60;
      else if (e.path.toLowerCase().includes(needle)) score = 30;
      return { ...e, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))
    .slice(0, 12);
}
