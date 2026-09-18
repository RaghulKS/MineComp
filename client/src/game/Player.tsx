import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../store";
import { SPAWN, WORLD_RADIUS } from "../worldgen";
import { bridge } from "./bridge";

const EYE = 1.7;
const RADIUS = 0.55;
const WALK = 7.5;
const SPRINT = 14;

export default function Player() {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const vel = useRef(new THREE.Vector3());
  const vy = useRef(0);
  const height = useRef(EYE);
  const bob = useRef(0);
  const lastSnap = useRef(0);
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  useEffect(() => {
    camera.position.set(SPAWN[0], SPAWN[1], SPAWN[2]);
    camera.rotation.order = "YXZ";
    yaw.current = 0;
    pitch.current = -0.05;
    camera.rotation.set(pitch.current, yaw.current, 0);
    camera.near = 0.1;
    camera.far = 900;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    bridge.requestLock = () => {
      try {
        const p = (el.requestPointerLock as unknown as (o?: unknown) => Promise<void> | void).call(el, {
          unadjustedMovement: true,
        });
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {
            try {
              el.requestPointerLock();
            } catch {
              /* ignore */
            }
          });
        }
      } catch {
        try {
          el.requestPointerLock();
        } catch {
          /* ignore */
        }
      }
    };

    const onLockChange = () => {
      const locked = document.pointerLockElement === el;
      useStore.getState().setLocked(locked);
      if (!locked) keys.current = {};
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      // ignore the occasional spurious jump some browsers emit right after locking
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      yaw.current -= e.movementX * 0.0021;
      pitch.current -= e.movementY * 0.0021;
      pitch.current = Math.max(-1.45, Math.min(1.45, pitch.current));
    };

    // tiny debug/automation hook (used by the smoke test; harmless in production)
    (window as unknown as { __worldos?: unknown }).__worldos = {
      look: (y: number, p: number) => {
        yaw.current = y;
        pitch.current = Math.max(-1.45, Math.min(1.45, p));
      },
      teleport: (x: number, z: number) => {
        camera.position.x = x;
        camera.position.z = z;
      },
      lock: (v: boolean) => useStore.getState().setLocked(v),
      store: useStore,
      bridge,
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (useStore.getState().searchOpen) return;
      keys.current[e.code] = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const onBlur = () => {
      keys.current = {};
    };
    const onCanvasClick = () => {
      const s = useStore.getState();
      if (s.started && !s.locked && !s.searchOpen) bridge.requestLock();
    };

    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    el.addEventListener("click", onCanvasClick);
    return () => {
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      el.removeEventListener("click", onCanvasClick);
    };
  }, [gl, camera]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = useStore.getState();
    const active = s.locked && !s.searchOpen;

    // orientation
    euler.current.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(euler.current);

    // input
    const k = keys.current;
    let fx = 0,
      fz = 0;
    if (active) {
      if (k.KeyW || k.ArrowUp) fz -= 1;
      if (k.KeyS || k.ArrowDown) fz += 1;
      if (k.KeyA || k.ArrowLeft) fx -= 1;
      if (k.KeyD || k.ArrowRight) fx += 1;
    }
    const sprint = active && (k.ShiftLeft || k.ShiftRight);
    const speed = sprint ? SPRINT : WALK;
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    // rotate input by yaw
    const sin = Math.sin(yaw.current),
      cos = Math.cos(yaw.current);
    const wx = fx * cos + fz * sin;
    const wz = -fx * sin + fz * cos;
    const targetVx = wx * speed;
    const targetVz = wz * speed;
    const accel = 1 - Math.exp(-dt * (len > 0 ? 12 : 16));
    vel.current.x += (targetVx - vel.current.x) * accel;
    vel.current.z += (targetVz - vel.current.z) * accel;

    // jump / gravity
    const grounded = height.current <= EYE + 0.001;
    if (active && k.Space && grounded) vy.current = 6.5;
    vy.current -= 20 * dt;
    height.current += vy.current * dt;
    if (height.current < EYE) {
      height.current = EYE;
      vy.current = 0;
    }

    let nx = camera.position.x + vel.current.x * dt;
    let nz = camera.position.z + vel.current.z * dt;

    // collisions against building AABBs
    const colliders = bridge.layout?.colliders ?? [];
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const ex = c.hw + RADIUS;
        const ez = c.hd + RADIUS;
        const dx = nx - c.x;
        const dz = nz - c.z;
        if (Math.abs(dx) < ex && Math.abs(dz) < ez) {
          const px = ex - Math.abs(dx);
          const pz = ez - Math.abs(dz);
          if (px < pz) nx = c.x + Math.sign(dx || 1) * ex;
          else nz = c.z + Math.sign(dz || 1) * ez;
        }
      }
    }
    // world bounds
    const r = Math.hypot(nx, nz);
    const maxR = WORLD_RADIUS - 4;
    if (r > maxR) {
      nx = (nx / r) * maxR;
      nz = (nz / r) * maxR;
    }

    camera.position.x = nx;
    camera.position.z = nz;

    // head bob
    const moving = Math.hypot(vel.current.x, vel.current.z);
    if (moving > 0.5 && grounded) bob.current += dt * (sprint ? 13 : 9);
    const bobY = Math.sin(bob.current) * Math.min(1, moving / WALK) * 0.045;
    camera.position.y = height.current + bobY;

    // snapshot for HUD (10Hz)
    const now = state.clock.getElapsedTime();
    if (now - lastSnap.current > 0.1) {
      lastSnap.current = now;
      s.setPlayer({ x: nx, y: camera.position.y, z: nz, yaw: yaw.current });
    }
  });

  return null;
}
