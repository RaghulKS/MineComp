import type {
  Collider,
  FileVisual,
  PlacedBuilding,
  PlacedFile,
  Root,
  Vec3,
  WorldEntity,
  WorldLayout,
} from "./types";

// ---------- deterministic hashing ----------

export function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // final avalanche
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export function rand01(str: string, salt = 0): number {
  return hash32(`${str}#${salt}`) / 4294967296;
}

export function randRange(str: string, salt: number, min: number, max: number): number {
  return min + rand01(str, salt) * (max - min);
}

// ---------- world constants ----------

export const DISTRICTS: Record<Root, { center: Vec3; label: string; subtitle: string; radius: number }> = {
  Desktop: { center: [0, 0, 0], label: "DESKTOP PLAZA", subtitle: "DESKTOP DISTRICT", radius: 22 },
  Documents: { center: [-96, 0, -22], label: "DOCUMENTS LIBRARY", subtitle: "ARCHIVE OF RECORDS", radius: 20 },
  Downloads: { center: [96, 0, -22], label: "DOWNLOADS DOCKS", subtitle: "INBOUND CARGO", radius: 20 },
};

export const PORTAL_POS: Vec3 = [-40, 0, -84];
export const REACTOR_POS: Vec3 = [40, 0, -84];
export const SPAWN: Vec3 = [0, 1.7, 34];
export const WORLD_RADIUS = 175;

export const ROADS: { from: Vec3; to: Vec3; width: number }[] = [
  { from: [0, 0, 0], to: DISTRICTS.Documents.center, width: 5 },
  { from: [0, 0, 0], to: DISTRICTS.Downloads.center, width: 5 },
  { from: [0, 0, 0], to: PORTAL_POS, width: 4 },
  { from: [0, 0, 0], to: REACTOR_POS, width: 4 },
  { from: [0, 0, 0], to: [0, 0, 44], width: 4 },
];

export const LANDMARK_COLLIDERS: Collider[] = [
  { x: PORTAL_POS[0], z: PORTAL_POS[2], hw: 5.5, hd: 1.6 },
  { x: REACTOR_POS[0], z: REACTOR_POS[2], hw: 5, hd: 5 },
];

const MAX_BUILDINGS_PER_ROOT = 12;
const MAX_NESTED_PER_PARENT = 3;
const MAX_FILES_PER_PARENT = 8;
const MAX_LOOSE_FILES_PER_ROOT = 12;
const MAX_TOTAL_FILES = 72;

// ---------- extension → visual ----------

export function visualFor(ext?: string): FileVisual {
  const e = (ext ?? "").toLowerCase();
  if (e === "pdf") return "book-red";
  if (["txt", "md", "rtf", "doc", "docx", "log"].includes(e)) return "book-parchment";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].includes(e)) return "artwork";
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(e)) return "screen";
  if (["mp3", "wav", "flac", "ogg", "m4a"].includes(e)) return "record";
  if (["zip", "rar", "7z", "tar", "gz", "msi", "exe", "iso"].includes(e)) return "crate";
  if (["ts", "tsx", "js", "jsx", "py", "java", "rs", "go", "c", "cpp", "cs", "json", "html", "css", "sh", "ps1"].includes(e))
    return "terminal";
  return "cube";
}

export const VISUAL_LABEL: Record<FileVisual, string> = {
  "book-red": "DOCUMENT",
  "book-parchment": "TEXT",
  artwork: "IMAGE",
  screen: "VIDEO",
  record: "AUDIO",
  crate: "ARCHIVE",
  terminal: "CODE",
  cube: "DATA",
};

// ---------- layout ----------

function recency(e: WorldEntity): number {
  return e.modifiedAt ?? 0;
}

function sortUseful(a: WorldEntity, b: WorldEntity): number {
  return recency(b) - recency(a) || a.name.localeCompare(b.name);
}

function styleFor(root: Root): PlacedBuilding["style"] {
  return root === "Documents" ? "library" : root === "Downloads" ? "docks" : "desktop";
}

function overlaps(c: Collider, others: Collider[], pad: number): boolean {
  for (const o of others) {
    if (Math.abs(c.x - o.x) < c.hw + o.hw + pad && Math.abs(c.z - o.z) < c.hd + o.hd + pad) return true;
  }
  return false;
}

function nearRoad(x: number, z: number, margin: number): boolean {
  for (const r of ROADS) {
    const ax = r.from[0],
      az = r.from[2],
      bx = r.to[0],
      bz = r.to[2];
    const dx = bx - ax,
      dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx,
      pz = az + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < r.width / 2 + margin) return true;
  }
  return false;
}

export function buildLayout(entities: WorldEntity[]): WorldLayout {
  const byId = new Map<string, WorldEntity>();
  const byPath = new Map<string, WorldEntity>();
  for (const e of entities) {
    byId.set(e.id, e);
    byPath.set(e.path, e);
  }

  const isTopLevel = (e: WorldEntity) => e.parentPath === null || !byPath.has(e.parentPath);

  const buildings: PlacedBuilding[] = [];
  const files: PlacedFile[] = [];
  const colliders: Collider[] = [...LANDMARK_COLLIDERS];
  const positions = new Map<string, Vec3>();

  const childrenOf = new Map<string, WorldEntity[]>();
  for (const e of entities) {
    if (e.parentPath && byPath.has(e.parentPath)) {
      const parent = byPath.get(e.parentPath)!;
      const arr = childrenOf.get(parent.id) ?? [];
      arr.push(e);
      childrenOf.set(parent.id, arr);
    }
  }

  const roots: Root[] = ["Desktop", "Documents", "Downloads"];
  const buildingById = new Map<string, PlacedBuilding>();

  // --- top-level folders → buildings on rings around district centers ---
  for (const root of roots) {
    const district = DISTRICTS[root];
    const folders = entities.filter((e) => e.kind === "folder" && e.root === root && isTopLevel(e));
    folders.sort(sortUseful);
    const chosen = folders.slice(0, MAX_BUILDINGS_PER_ROOT);
    const n = chosen.length;
    const baseRadius = root === "Desktop" ? 36 : 17;
    chosen.forEach((folder, i) => {
      const kids = childrenOf.get(folder.id) ?? [];
      const childCount = kids.length;
      const seed = hash32(folder.id);
      const w = randRange(folder.id, 1, 6.5, 9.5);
      const d = randRange(folder.id, 2, 6.5, 9.5);
      const h = Math.min(26, 6 + Math.sqrt(childCount) * 3.2 + randRange(folder.id, 3, 0, 6));

      let placed = false;
      let x = 0,
        z = 0;
      for (let attempt = 0; attempt < 14 && !placed; attempt++) {
        const ring = Math.floor(attempt / 7);
        const radius = baseRadius + ring * 16 + randRange(folder.id, 10 + attempt, -2, 2);
        const angle = ((i + 0.5) / Math.max(n, 1)) * Math.PI * 2 + randRange(folder.id, 20 + attempt, -0.18, 0.18) + ring * 0.3;
        x = district.center[0] + Math.cos(angle) * radius;
        z = district.center[2] + Math.sin(angle) * radius;
        const c: Collider = { x, z, hw: w / 2, hd: d / 2 };
        if (!overlaps(c, colliders, 4) && !nearRoad(x, z, Math.max(w, d) / 2 + 1)) placed = true;
      }
      if (!placed) {
        // fallback: spiral outward
        const angle = i * 2.4;
        const radius = baseRadius + 20 + i * 2;
        x = district.center[0] + Math.cos(angle) * radius;
        z = district.center[2] + Math.sin(angle) * radius;
      }
      // face the district center
      const rotation = Math.atan2(district.center[0] - x, district.center[2] - z);
      const b: PlacedBuilding = {
        entity: folder,
        position: [x, 0, z],
        rotation,
        size: [w, h, d],
        district: root,
        nested: false,
        childCount,
        style: styleFor(root),
        seed,
      };
      buildings.push(b);
      buildingById.set(folder.id, b);
      colliders.push({ x, z, hw: w / 2, hd: d / 2 });
      positions.set(folder.id, [x, h / 2, z]);
    });
  }

  // --- children (files + nested folders) clustered around parent buildings ---
  let totalFiles = 0;
  const topBuildings = [...buildings];
  for (const b of topBuildings) {
    const kids = (childrenOf.get(b.entity.id) ?? []).slice().sort(sortUseful);
    const nestedFolders = kids.filter((k) => k.kind === "folder").slice(0, MAX_NESTED_PER_PARENT);
    const kidFiles = kids.filter((k) => k.kind === "file").slice(0, MAX_FILES_PER_PARENT);
    const items: WorldEntity[] = [...nestedFolders, ...kidFiles];
    const count = items.length;
    if (!count) continue;
    const ringR = Math.max(b.size[0], b.size[2]) / 2 + 3.2;
    // spread across an arc facing the district center (front of building), then wrap around
    const startAngle = b.rotation - Math.PI * 0.75;
    items.forEach((item, i) => {
      const frac = count === 1 ? 0.5 : i / (count - 1);
      const angle = startAngle + frac * Math.PI * 1.5 + randRange(item.id, 4, -0.08, 0.08);
      const r = ringR + randRange(item.id, 5, 0, 1.6) + (item.kind === "folder" ? 1.4 : 0);
      const x = b.position[0] + Math.sin(angle) * r;
      const z = b.position[2] + Math.cos(angle) * r;
      const rot = Math.atan2(b.position[0] - x, b.position[2] - z) + Math.PI + randRange(item.id, 6, -0.3, 0.3);
      if (item.kind === "folder") {
        const w = 3.2,
          d = 3.2,
          h = 3.6 + randRange(item.id, 7, 0, 1.5);
        const nb: PlacedBuilding = {
          entity: item,
          position: [x, 0, z],
          rotation: rot + Math.PI,
          size: [w, h, d],
          district: b.district,
          nested: true,
          childCount: (childrenOf.get(item.id) ?? []).length,
          style: b.style,
          seed: hash32(item.id),
        };
        buildings.push(nb);
        buildingById.set(item.id, nb);
        colliders.push({ x, z, hw: w / 2, hd: d / 2 });
        positions.set(item.id, [x, h / 2, z]);
      } else if (totalFiles < MAX_TOTAL_FILES) {
        files.push({
          entity: item,
          position: [x, 0, z],
          rotation: rot,
          visual: visualFor(item.extension),
          district: b.district,
          parentId: b.entity.id,
          seed: hash32(item.id),
        });
        positions.set(item.id, [x, 1, z]);
        totalFiles++;
      }
    });
  }

  // --- loose top-level files → plaza / district center spirals ---
  for (const root of roots) {
    const district = DISTRICTS[root];
    const loose = entities.filter((e) => e.kind === "file" && e.root === root && isTopLevel(e)).sort(sortUseful);
    const chosen = loose.slice(0, MAX_LOOSE_FILES_PER_ROOT);
    chosen.forEach((file, i) => {
      if (totalFiles >= MAX_TOTAL_FILES) return;
      const golden = 2.399963;
      const angle = i * golden + randRange(file.id, 8, -0.2, 0.2);
      const r = (root === "Desktop" ? 7 : 4.5) + Math.sqrt(i + 1) * 3.2;
      let x = district.center[0] + Math.cos(angle) * r;
      let z = district.center[2] + Math.sin(angle) * r;
      // keep off the roads
      let guard = 0;
      while (nearRoad(x, z, 1.2) && guard++ < 6) {
        x += Math.cos(angle + 1.3) * 2.2;
        z += Math.sin(angle + 1.3) * 2.2;
      }
      files.push({
        entity: file,
        position: [x, 0, z],
        rotation: angle + Math.PI / 2,
        visual: visualFor(file.extension),
        district: root,
        parentId: null,
        seed: hash32(file.id),
      });
      positions.set(file.id, [x, 1, z]);
      totalFiles++;
    });
  }

  return { buildings, files, colliders, positions, byId };
}

// ---------- decoration ----------

export type Decoration = { kind: "tree" | "crystal" | "lamp" | "rock"; position: Vec3; scale: number; seed: number };

export function buildDecorations(colliders: Collider[]): Decoration[] {
  const out: Decoration[] = [];
  const count = 190;
  for (let i = 0; i < count; i++) {
    const key = `deco-${i}`;
    const angle = rand01(key, 1) * Math.PI * 2;
    const r = 24 + Math.sqrt(rand01(key, 2)) * 135;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (nearRoad(x, z, 3)) continue;
    let blocked = false;
    for (const c of colliders) {
      if (Math.abs(x - c.x) < c.hw + 3 && Math.abs(z - c.z) < c.hd + 3) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    // avoid district cores
    if (Math.hypot(x - DISTRICTS.Documents.center[0], z - DISTRICTS.Documents.center[2]) < 12) continue;
    if (Math.hypot(x - DISTRICTS.Downloads.center[0], z - DISTRICTS.Downloads.center[2]) < 12) continue;
    if (Math.hypot(x - PORTAL_POS[0], z - PORTAL_POS[2]) < 12) continue;
    if (Math.hypot(x - REACTOR_POS[0], z - REACTOR_POS[2]) < 12) continue;
    const roll = rand01(key, 3);
    const kind: Decoration["kind"] = roll < 0.6 ? "tree" : roll < 0.8 ? "crystal" : roll < 0.9 ? "rock" : "lamp";
    out.push({ kind, position: [x, 0, z], scale: 0.8 + rand01(key, 4) * 0.8, seed: hash32(key) });
  }
  // lamps along the roads
  for (const road of ROADS) {
    const len = Math.hypot(road.to[0] - road.from[0], road.to[2] - road.from[2]);
    const steps = Math.max(2, Math.floor(len / 16));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = road.from[0] + (road.to[0] - road.from[0]) * t;
      const z = road.from[2] + (road.to[2] - road.from[2]) * t;
      const nx = -(road.to[2] - road.from[2]) / len;
      const nz = (road.to[0] - road.from[0]) / len;
      const side = s % 2 === 0 ? 1 : -1;
      out.push({
        kind: "lamp",
        position: [x + nx * (road.width / 2 + 1.2) * side, 0, z + nz * (road.width / 2 + 1.2) * side],
        scale: 1,
        seed: hash32(`lamp-${x}-${z}`),
      });
    }
  }
  return out;
}

export function districtLabel(root: Root): string {
  return DISTRICTS[root].label;
}

export function formatBytes(n?: number): string {
  if (n === undefined || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
