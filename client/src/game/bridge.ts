import type { Vec3, WorldEntity, WorldLayout } from "../types";
import { DISTRICTS } from "../worldgen";

export const bridge = {
  layout: null as WorldLayout | null,
  requestLock: () => {},
  releaseLock: () => {
    if (document.pointerLockElement) document.exitPointerLock();
  },
  locate(e: WorldEntity): Vec3 {
    const l = bridge.layout;
    if (l) {
      const p = l.positions.get(e.id);
      if (p) return p;
      for (const x of l.byId.values()) {
        if (x.path === e.path) {
          const pp = l.positions.get(x.id);
          if (pp) return pp;
        }
      }
      if (e.parentPath) {
        for (const x of l.byId.values()) {
          if (x.path === e.parentPath) {
            const pp = l.positions.get(x.id);
            if (pp) return pp;
          }
        }
      }
    }
    const c = DISTRICTS[e.root]?.center ?? [0, 0, 0];
    return [c[0], 1, c[2]];
  },
};
