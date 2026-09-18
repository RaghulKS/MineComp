export type Root = "Desktop" | "Documents" | "Downloads";

export type WorldEntity = {
  id: string;
  kind: "file" | "folder";
  name: string;
  path: string;
  extension?: string;
  parentPath: string | null;
  root: Root;
  size?: number;
  modifiedAt?: number;
};

export type SystemStats = {
  cpu: number; // 0..100
  ram: number; // 0..100
  ramUsedGb?: number;
  ramTotalGb?: number;
  hostname?: string;
  platform?: string;
  uptime?: number;
  live: boolean;
};

export type SearchResult = WorldEntity & { score?: number };

export type FileVisual =
  | "book-red"
  | "book-parchment"
  | "artwork"
  | "screen"
  | "record"
  | "crate"
  | "terminal"
  | "cube";

export type Vec3 = [number, number, number];

export type PlacedBuilding = {
  entity: WorldEntity;
  position: Vec3;
  rotation: number;
  size: Vec3; // w, h, d
  district: Root;
  nested: boolean;
  childCount: number;
  style: "library" | "docks" | "desktop";
  seed: number;
};

export type PlacedFile = {
  entity: WorldEntity;
  position: Vec3;
  rotation: number;
  visual: FileVisual;
  district: Root;
  parentId: string | null;
  seed: number;
};

export type Collider = { x: number; z: number; hw: number; hd: number };

export type WorldLayout = {
  buildings: PlacedBuilding[];
  files: PlacedFile[];
  colliders: Collider[];
  positions: Map<string, Vec3>;
  byId: Map<string, WorldEntity>;
};

export type TargetKind = "file" | "folder" | "portal" | "reactor";

export type Target = {
  kind: TargetKind;
  id: string;
  name: string;
  distance: number;
  position: Vec3;
};

export type Toast = {
  id: number;
  text: string;
  tone: "info" | "success" | "error" | "warn";
  createdAt: number;
};

export type Waypoint = {
  id: string;
  name: string;
  kind: "file" | "folder";
  position: Vec3;
};
