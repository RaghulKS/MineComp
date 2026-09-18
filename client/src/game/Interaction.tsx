import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { moveEntity, openApp, openPath } from "../api";
import { useStore } from "../store";
import type { PlacedFile, Target, Vec3, WorldLayout } from "../types";
import { hash32, PORTAL_POS, REACTOR_POS, visualFor } from "../worldgen";
import { bridge } from "./bridge";
import { FileMesh, VISUAL_COLOR } from "./FileObject";

const FILE_RANGE = 7.5;
const BUILDING_RANGE = 14;
const LANDMARK_RANGE = 18;
const DROP_RANGE = 9;

type Flight = { id: number; from: Vec3; to: Vec3; start: number; color: string; name: string };

function FlightFx({ flight, onDone }: { flight: Flight; onDone: (id: number) => void }) {
  const orb = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);
  const done = useRef(false);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() - flight.start;
    const dur = 0.9;
    const k = Math.min(1, t / dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    if (orb.current) {
      orb.current.position.set(
        flight.from[0] + (flight.to[0] - flight.from[0]) * e,
        flight.from[1] + (flight.to[1] - flight.from[1]) * e + Math.sin(k * Math.PI) * 4,
        flight.from[2] + (flight.to[2] - flight.from[2]) * e,
      );
      const s = 0.5 + Math.sin(k * Math.PI) * 0.4;
      orb.current.scale.set(s, s, s);
      orb.current.visible = k < 1;
    }
    if (burst.current) {
      const b = Math.max(0, (t - dur) / 0.6);
      burst.current.visible = t >= dur && b < 1;
      const s = 1 + b * 6;
      burst.current.scale.set(s, s, s);
      (burst.current.material as THREE.MeshBasicMaterial).opacity = (1 - b) * 0.9;
    }
    if (t > dur + 0.7 && !done.current) {
      done.current = true;
      onDone(flight.id);
    }
  });
  return (
    <group>
      <mesh ref={orb} position={flight.from}>
        <sphereGeometry args={[0.6, 16, 16]} />
        <meshStandardMaterial color={flight.color} emissive={flight.color} emissiveIntensity={4} toneMapped={false} />
      </mesh>
      <mesh ref={burst} position={[flight.to[0], 0.3, flight.to[2]]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.9, 1.25, 48]} />
        <meshBasicMaterial color={flight.color} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <Sparkles count={40} scale={[3, 3, 3]} position={[flight.to[0], 2, flight.to[2]]} size={8} speed={3} color={flight.color} />
    </group>
  );
}

function Carried() {
  const carrying = useStore((s) => s.carrying);
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const placed = useMemo<PlacedFile | null>(() => {
    if (!carrying) return null;
    return {
      entity: carrying,
      position: [0, 0, 0],
      rotation: 0,
      visual: visualFor(carrying.extension),
      district: carrying.root,
      parentId: null,
      seed: hash32(carrying.id),
    };
  }, [carrying]);
  useFrame(({ clock }) => {
    if (!group.current || !placed) return;
    const t = clock.getElapsedTime();
    camera.getWorldDirection(fwd.current);
    right.current.crossVectors(fwd.current, camera.up).normalize();
    group.current.position
      .copy(camera.position)
      .addScaledVector(fwd.current, 1.9)
      .addScaledVector(right.current, 0.7)
      .add(new THREE.Vector3(0, -0.55 + Math.sin(t * 2.2) * 0.05, 0));
    group.current.quaternion.copy(camera.quaternion);
    group.current.rotateY(-0.35 + Math.sin(t * 1.3) * 0.08);
  });
  if (!placed) return null;
  const color = VISUAL_COLOR[placed.visual];
  return (
    <group ref={group} scale={0.5}>
      <FileMesh file={placed} carried />
      <mesh>
        <sphereGeometry args={[1.25, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.035} depthWrite={false} />
      </mesh>
      <pointLight color={color} intensity={6} distance={6} decay={2} />
      <Sparkles count={20} scale={[2.4, 2.4, 2.4]} size={5} speed={1.5} color={color} />
    </group>
  );
}

export default function Interaction({ layout }: { layout: WorldLayout }) {
  const { camera, clock } = useThree();
  const fwd = useRef(new THREE.Vector3());
  const toT = useRef(new THREE.Vector3());
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightSeq = useRef(1);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // ---- per-frame targeting ----
  useFrame(({ clock }) => {
    const s = useStore.getState();
    const l = layoutRef.current;
    const p = camera.position;
    camera.getWorldDirection(fwd.current);

    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (kind: Target["kind"], id: string, name: string, pos: Vec3, range: number, angleMax: number) => {
      toT.current.set(pos[0] - p.x, pos[1] - p.y, pos[2] - p.z);
      const dist = toT.current.length();
      if (dist > range || dist < 0.01) return;
      toT.current.normalize();
      const ang = Math.acos(Math.max(-1, Math.min(1, toT.current.dot(fwd.current))));
      if (ang > angleMax) return;
      const score = ang * 3 + dist * 0.08;
      if (score < bestScore) {
        bestScore = score;
        best = { kind, id, name, distance: Math.hypot(pos[0] - p.x, pos[2] - p.z), position: pos };
      }
    };

    if (!s.carrying) {
      for (const f of l.files) consider("file", f.entity.id, f.entity.name, [f.position[0], 1.3, f.position[2]], FILE_RANGE, 0.26);
    }
    for (const b of l.buildings) {
      const [w, h, d] = b.size;
      const cy = Math.min(h * 0.5, p.y + 1.5);
      // aim point: closest point on the AABB to the camera (horizontally), at eye-ish height
      const cx = Math.max(b.position[0] - w / 2, Math.min(b.position[0] + w / 2, p.x));
      const cz = Math.max(b.position[2] - d / 2, Math.min(b.position[2] + d / 2, p.z));
      consider("folder", b.entity.id, b.entity.name, [cx, cy, cz], b.nested ? BUILDING_RANGE * 0.6 : BUILDING_RANGE, b.nested ? 0.3 : 0.42);
    }
    consider("portal", "portal", "WEB GATE", [PORTAL_POS[0], 6, PORTAL_POS[2]], LANDMARK_RANGE, 0.45);
    consider("reactor", "reactor", "SYSTEM REACTOR", [REACTOR_POS[0], 7, REACTOR_POS[2]], LANDMARK_RANGE, 0.5);
    s.setTarget(best);

    // drop target when carrying: aimed building, else nearest building in range
    if (s.carrying) {
      const aimed = best as Target | null;
      let drop: { id: string; name: string; path: string } | null = null;
      if (aimed && aimed.kind === "folder") {
        const b = l.buildings.find((x) => x.entity.id === aimed.id);
        if (b && aimed.distance < DROP_RANGE + Math.max(b.size[0], b.size[2]) / 2) drop = { id: b.entity.id, name: b.entity.name, path: b.entity.path };
      }
      if (!drop) {
        let nd = Infinity;
        for (const b of l.buildings) {
          const dx = Math.max(0, Math.abs(p.x - b.position[0]) - b.size[0] / 2);
          const dz = Math.max(0, Math.abs(p.z - b.position[2]) - b.size[2] / 2);
          const dist = Math.hypot(dx, dz);
          if (dist < DROP_RANGE * 0.7 && dist < nd) {
            nd = dist;
            drop = { id: b.entity.id, name: b.entity.name, path: b.entity.path };
          }
        }
      }
      // don't offer dropping into the folder it's already in
      if (drop && s.carrying.parentPath === drop.path) drop = null;
      s.setDropTarget(drop);
    } else if (s.dropTarget) {
      s.setDropTarget(null);
    }

    // reactor proximity
    s.setReactorNear(Math.hypot(p.x - REACTOR_POS[0], p.z - REACTOR_POS[2]) < 26);

    // waypoint arrival
    if (s.waypoint) {
      const d = Math.hypot(p.x - s.waypoint.position[0], p.z - s.waypoint.position[2]);
      if (d < 5) {
        s.toast(`ARRIVED → ${s.waypoint.name}`, "success");
        s.setWaypoint(null);
      }
    }
    void clock;
  });

  // ---- key handling ----
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.code === "Slash" || e.key === "/") {
        if (!s.started) return;
        e.preventDefault();
        if (!s.searchOpen) {
          bridge.releaseLock();
          s.setSearchOpen(true);
        }
        return;
      }
      if (!s.locked || s.searchOpen || s.busy) return;
      const l = layoutRef.current;

      if (e.code === "KeyE") {
        const t = s.target;
        if (!t) return;
        if (t.kind === "portal") {
          s.toast("WEB GATE ACTIVATED → LAUNCHING CHROME", "info");
          try {
            await openApp("chrome");
            s.toast("CHROME IS OPENING ON YOUR PC", "success");
          } catch {
            s.toast(s.source === "demo" ? "DEMO MODE • SERVER OFFLINE, GATE IS SIMULATED" : "GATE FAILED • SERVER REJECTED REQUEST", "error");
          }
          return;
        }
        if (t.kind === "reactor") {
          s.toast(`REACTOR TELEMETRY • CPU ${s.system.cpu}% • RAM ${s.system.ram}%`, "info");
          return;
        }
        const ent = l.byId.get(t.id);
        if (!ent) return;
        s.toast(`${ent.kind === "folder" ? "OPENING FOLDER" : "OPENING"} → ${ent.name}`, "info");
        try {
          await openPath(ent.path);
          s.toast(`${ent.name} OPENED ON YOUR PC`, "success");
        } catch {
          s.toast(s.source === "demo" ? "DEMO MODE • SERVER OFFLINE, NOTHING OPENED" : `COULD NOT OPEN ${ent.name}`, "error");
        }
        return;
      }

      if (e.code === "KeyF") {
        if (s.carrying) {
          const carried = s.carrying;
          const drop = s.dropTarget;
          if (!drop) {
            s.setCarrying(null);
            s.toast(`RELEASED ${carried.name}`, "info");
            return;
          }
          s.setBusy(true);
          const dest = l.buildings.find((b) => b.entity.id === drop.id);
          const from: Vec3 = [camera.position.x, camera.position.y - 0.4, camera.position.z];
          const to: Vec3 = dest ? [dest.position[0], dest.size[1] * 0.5, dest.position[2]] : [drop.id.length, 2, 0];
          const color = VISUAL_COLOR[visualFor(carried.extension)];
          const launch = () => {
            setFlights((f) => [
              ...f,
              { id: flightSeq.current++, from, to, start: clock.getElapsedTime(), color, name: carried.name },
            ]);
          };
          try {
            await moveEntity(carried.path, drop.path);
            s.applyMove(carried.id, drop.path);
            s.setCarrying(null);
            launch();
            s.toast(`MOVED ${carried.name} → ${drop.name}`, "success");
          } catch (err) {
            if (s.source === "demo") {
              s.applyMove(carried.id, drop.path);
              s.setCarrying(null);
              launch();
              s.toast(`MOVED ${carried.name} → ${drop.name} (DEMO)`, "success");
            } else {
              s.toast(`MOVE FAILED • ${(err as Error).message?.slice(0, 60) ?? "server error"}`, "error");
            }
          } finally {
            s.setBusy(false);
          }
          return;
        }
        const t = s.target;
        if (t && t.kind === "file") {
          const ent = l.byId.get(t.id);
          if (ent) {
            s.setCarrying(ent);
            s.toast(`CARRYING ${ent.name} • WALK TO A FOLDER, PRESS F`, "info");
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera]);

  return (
    <group>
      <Carried />
      {flights.map((f) => (
        <FlightFx key={f.id} flight={f} onDone={(id) => setFlights((fs) => fs.filter((x) => x.id !== id))} />
      ))}
    </group>
  );
}
