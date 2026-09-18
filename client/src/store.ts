import { create } from "zustand";
import type { SystemStats, Target, Toast, Waypoint, WorldEntity } from "./types";

type DataSource = "demo" | "live";

export type PlayerSnapshot = { x: number; y: number; z: number; yaw: number };

type State = {
  entities: WorldEntity[];
  source: DataSource;
  wsConnected: boolean;
  system: SystemStats;
  started: boolean;
  locked: boolean;
  searchOpen: boolean;
  target: Target | null;
  carrying: WorldEntity | null;
  dropTarget: { id: string; name: string; path: string } | null;
  waypoint: Waypoint | null;
  highlightId: string | null;
  toasts: Toast[];
  busy: boolean;
  reactorNear: boolean;
  player: PlayerSnapshot;
  worldVersion: number;
  setEntities: (entities: WorldEntity[], source: DataSource) => void;
  applyMove: (id: string, destinationDirectory: string) => void;
  setSystem: (s: SystemStats) => void;
  setWsConnected: (v: boolean) => void;
  setStarted: (v: boolean) => void;
  setLocked: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setTarget: (t: Target | null) => void;
  setCarrying: (e: WorldEntity | null) => void;
  setDropTarget: (d: State["dropTarget"]) => void;
  setWaypoint: (w: Waypoint | null) => void;
  setHighlight: (id: string | null) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  setBusy: (v: boolean) => void;
  setReactorNear: (v: boolean) => void;
  setPlayer: (p: PlayerSnapshot) => void;
};

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  entities: [],
  source: "demo",
  wsConnected: false,
  system: { cpu: 0, ram: 0, live: false },
  started: false,
  locked: false,
  searchOpen: false,
  target: null,
  carrying: null,
  dropTarget: null,
  waypoint: null,
  highlightId: null,
  toasts: [],
  busy: false,
  reactorNear: false,
  player: { x: 0, y: 1.7, z: 30, yaw: 0 },
  worldVersion: 0,

  setEntities: (entities, source) =>
    set((s) => {
      // skip identical snapshots so periodic polls don't rebuild the world
      const sig = (list: WorldEntity[]) => list.map((e) => `${e.id}|${e.path}|${e.modifiedAt ?? ""}`).join("\n");
      if (s.source === source && s.entities.length === entities.length && sig(s.entities) === sig(entities)) return {};
      return { entities, source, worldVersion: s.worldVersion + 1 };
    }),

  applyMove: (id, destinationDirectory) =>
    set((s) => {
      const sep = destinationDirectory.includes("\\") ? "\\" : "/";
      const destFolder = s.entities.find((e) => e.path === destinationDirectory);
      const entities = s.entities.map((e) => {
        if (e.id !== id) return e;
        const newPath = `${destinationDirectory.replace(/[\\/]+$/, "")}${sep}${e.name}`;
        return {
          ...e,
          path: newPath,
          parentPath: destinationDirectory,
          root: destFolder?.root ?? e.root,
          modifiedAt: Date.now(),
        };
      });
      return { entities, worldVersion: s.worldVersion + 1 };
    }),

  setSystem: (system) => set({ system }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setStarted: (started) => set({ started }),
  setLocked: (locked) => set({ locked }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setTarget: (target) => {
    const prev = get().target;
    if (
      (prev === null && target === null) ||
      (prev &&
        target &&
        prev.id === target.id &&
        prev.kind === target.kind &&
        Math.abs(prev.distance - target.distance) < 0.15)
    )
      return;
    set({ target });
  },
  setCarrying: (carrying) => set({ carrying }),
  setDropTarget: (dropTarget) => {
    const prev = get().dropTarget;
    if ((prev === null && dropTarget === null) || (prev && dropTarget && prev.id === dropTarget.id)) return;
    set({ dropTarget });
  },
  setWaypoint: (waypoint) => set({ waypoint, highlightId: waypoint?.id ?? null }),
  setHighlight: (highlightId) => set({ highlightId }),
  toast: (text, tone = "info") => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, tone, createdAt: Date.now() }] }));
    setTimeout(() => get().dismissToast(id), tone === "error" ? 5200 : 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setBusy: (busy) => set({ busy }),
  setReactorNear: (reactorNear) => {
    if (get().reactorNear !== reactorNear) set({ reactorNear });
  },
  setPlayer: (player) => set({ player }),
}));
