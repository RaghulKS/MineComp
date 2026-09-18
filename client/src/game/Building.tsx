import * as THREE from "three";
import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { PlacedBuilding } from "../types";
import { rand01 } from "../worldgen";
import { Label } from "./Label";

const STYLE = {
  library: {
    wall: "#c8a06a",
    wallAlt: "#b8935c",
    trim: "#6a4a2c",
    roof: "#8a5a3a",
    window: "#ffd27a",
    accent: "#e8b84a",
    label: "#ffd27a",
  },
  docks: {
    wall: "#7a8a94",
    wallAlt: "#6a7a86",
    trim: "#3a4a52",
    roof: "#4a5a64",
    window: "#ffd27a",
    accent: "#7ec8e8",
    label: "#7ec8e8",
  },
  desktop: {
    wall: "#9a9a9a",
    wallAlt: "#8a8a8a",
    trim: "#5a5a5a",
    roof: "#6a6a6a",
    window: "#ffd27a",
    accent: "#e8b84a",
    label: "#ffd27a",
  },
} as const;

function Windows({ b, color }: { b: PlacedBuilding; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const [w, h, d] = b.size;
  const cols = Math.max(1, Math.floor(w / 1.6));
  const rows = Math.max(1, Math.floor((h - 2.2) / 2.0));
  const colsD = Math.max(1, Math.floor(d / 1.6));
  const count = (cols + colsD) * 2 * rows;
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(0.9, 1.1, 1);
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    let i = 0;
    const faces: { axis: "x" | "z"; sign: number; n: number; extent: number }[] = [
      { axis: "z", sign: 1, n: cols, extent: w },
      { axis: "z", sign: -1, n: cols, extent: w },
      { axis: "x", sign: 1, n: colsD, extent: d },
      { axis: "x", sign: -1, n: colsD, extent: d },
    ];
    for (const f of faces) {
      for (let r = 0; r < rows; r++) {
        for (let cIdx = 0; cIdx < f.n; cIdx++) {
          const along = -f.extent / 2 + ((cIdx + 0.5) / f.n) * f.extent;
          const y = 2.0 + r * 2.0;
          if (f.axis === "z") {
            p.set(along, y, (f.sign * d) / 2 + f.sign * 0.03);
            q.setFromEuler(new THREE.Euler(0, f.sign > 0 ? 0 : Math.PI, 0));
          } else {
            p.set((f.sign * w) / 2 + f.sign * 0.03, y, along);
            q.setFromEuler(new THREE.Euler(0, f.sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0));
          }
          mat.compose(p, q, s);
          m.setMatrixAt(i, mat);
          const lit = rand01(`${b.entity.id}-win-${i}`, 3);
          if (lit < 0.62) {
            c.set(color).multiplyScalar(1.35 + rand01(`${b.entity.id}-glow-${i}`, 4) * 0.5); // HDR so bloom catches it
          } else c.set("#2a2620");
          m.setColorAt(i, c);
          i++;
        }
      }
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [b, color, cols, colsD, rows, w, h, d]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, count)]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} />
    </instancedMesh>
  );
}

function Building({ b, isDropTarget, highlighted }: { b: PlacedBuilding; isDropTarget: boolean; highlighted: boolean }) {
  const [w, h, d] = b.size;
  const st = STYLE[b.style];
  const holo = useRef<THREE.Mesh>(null);
  const dropRing = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const seed = b.seed;
  const wallColor = rand01(b.entity.id, 11) < 0.5 ? st.wall : st.wallAlt;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (holo.current) {
      holo.current.rotation.y = t * 0.5 + seed;
      holo.current.position.y = h + 1.6 + Math.sin(t * 1.5 + seed) * 0.15;
    }
    if (dropRing.current) {
      const s = 1 + ((t * 0.9 + seed) % 1) * 0.35;
      dropRing.current.scale.set(s, s, s);
      const mat = dropRing.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 - ((t * 0.9 + seed) % 1) * 0.6;
    }
    if (beacon.current) {
      const mat = beacon.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 2 + Math.sin(t * 4) * 1.2;
    }
  });

  const ringR = Math.max(w, d) / 2 + 2.2;
  const sub = b.nested ? "SUB-FOLDER" : `${b.childCount} ITEM${b.childCount === 1 ? "" : "S"} • FOLDER`;

  const body = useMemo(() => {
    if (b.style === "library") {
      return (
        <>
          {/* plinth */}
          <mesh receiveShadow castShadow position={[0, 0.3, 0]}>
            <boxGeometry args={[w + 1.2, 0.6, d + 1.2]} />
            <meshStandardMaterial color={st.trim} roughness={0.9} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={wallColor} roughness={0.85} />
          </mesh>
          {/* columns */}
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[(s * (w - 1)) / 2, h * 0.45, d / 2 + 0.5]}>
              <cylinderGeometry args={[0.35, 0.4, h * 0.9, 8]} />
              <meshStandardMaterial color="#c9a982" roughness={0.7} />
            </mesh>
          ))}
          {/* cornice */}
          <mesh castShadow position={[0, h + 0.25, 0]}>
            <boxGeometry args={[w + 0.8, 0.5, d + 0.8]} />
            <meshStandardMaterial color={st.trim} roughness={0.9} />
          </mesh>
          {/* pitched roof */}
          <mesh castShadow position={[0, h + 0.5 + Math.min(w, d) * 0.35, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[Math.max(w, d) * 0.78, Math.min(w, d) * 0.7, 4]} />
            <meshStandardMaterial color={st.roof} roughness={0.8} />
          </mesh>
          {/* door */}
          <mesh position={[0, 1.4, d / 2 + 0.05]}>
            <boxGeometry args={[1.8, 2.8, 0.15]} />
            <meshStandardMaterial color="#1a1410" roughness={0.9} />
          </mesh>
          <mesh position={[0, 3.2, d / 2 + 0.08]}>
            <boxGeometry args={[2.4, 0.18, 0.1]} />
            <meshStandardMaterial color={st.accent} emissive={st.accent} emissiveIntensity={2} toneMapped={false} />
          </mesh>
          {/* lanterns */}
          {[-1, 1].map((s) => (
            <mesh key={`l${s}`} position={[s * 1.5, 2.6, d / 2 + 0.3]}>
              <boxGeometry args={[0.3, 0.45, 0.3]} />
              <meshStandardMaterial color="#ffe0a0" emissive="#ffb347" emissiveIntensity={2.4} toneMapped={false} />
            </mesh>
          ))}
        </>
      );
    }
    if (b.style === "docks") {
      const topW = w * 0.75;
      const topD = d * 0.8;
      const topH = h * 0.35;
      return (
        <>
          <mesh receiveShadow castShadow position={[0, 0.25, 0]}>
            <boxGeometry args={[w + 1.4, 0.5, d + 1.4]} />
            <meshStandardMaterial color="#8a8a8a" roughness={0.9} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, h * 0.65 * 0.5 + 0.5, 0]}>
            <boxGeometry args={[w, h * 0.65, d]} />
            <meshStandardMaterial color={wallColor} roughness={0.8} metalness={0.1} />
          </mesh>
          {/* ribs */}
          {[-0.3, 0, 0.3].map((f) => (
            <mesh key={f} castShadow position={[f * w, h * 0.65 * 0.5 + 0.5, 0]}>
              <boxGeometry args={[0.25, h * 0.65 + 0.1, d + 0.2]} />
              <meshStandardMaterial color={st.trim} roughness={0.8} metalness={0.2} />
            </mesh>
          ))}
          <mesh castShadow receiveShadow position={[w * 0.1, h * 0.65 + 0.5 + topH / 2, -d * 0.05]}>
            <boxGeometry args={[topW, topH, topD]} />
            <meshStandardMaterial color={st.wallAlt} roughness={0.8} metalness={0.1} />
          </mesh>
          {/* neon band */}
          <mesh position={[0, h * 0.65 + 0.5, 0]}>
            <boxGeometry args={[w + 0.1, 0.18, d + 0.1]} />
            <meshStandardMaterial color={st.accent} emissive={st.accent} emissiveIntensity={2} toneMapped={false} />
          </mesh>
          {/* door */}
          <mesh position={[0, 1.6, d / 2 + 0.05]}>
            <boxGeometry args={[2.2, 3.2, 0.15]} />
            <meshStandardMaterial color="#0d1620" roughness={0.9} />
          </mesh>
          {/* antenna */}
          <mesh castShadow position={[-w * 0.35, h * 0.65 + 0.5 + topH + 1.8, d * 0.3]}>
            <cylinderGeometry args={[0.08, 0.12, 3.6, 6]} />
            <meshStandardMaterial color="#6b5a42" roughness={0.8} />
          </mesh>
          <mesh ref={beacon} position={[-w * 0.35, h * 0.65 + 0.5 + topH + 3.7, d * 0.3]}>
            <sphereGeometry args={[0.22, 8, 8]} />
            <meshStandardMaterial color="#e8b84a" emissive="#e8b84a" emissiveIntensity={2} toneMapped={false} />
          </mesh>
        </>
      );
    }
    // desktop: neon glass tower
    return (
      <>
        <mesh receiveShadow castShadow position={[0, 0.3, 0]}>
          <boxGeometry args={[w + 1.2, 0.6, d + 1.2]} />
          <meshStandardMaterial color={st.trim} roughness={0.7} metalness={0.4} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, h / 2 + 0.6, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={wallColor} roughness={0.35} metalness={0.5} />
        </mesh>
        {/* vertical light strips at corners */}
        {[
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ].map(([sx, sz], i) => (
          <mesh key={i} position={[(sx * w) / 2, h / 2 + 0.6, (sz * d) / 2]}>
            <boxGeometry args={[0.18, h * 0.96, 0.18]} />
            <meshStandardMaterial color={st.accent} emissive={i % 2 ? st.accent : st.window} emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
        ))}
        {/* roof cap */}
        <mesh castShadow position={[0, h + 0.9, 0]}>
          <boxGeometry args={[w * 0.7, 0.6, d * 0.7]} />
          <meshStandardMaterial color={st.roof} roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh castShadow position={[0, h + 2.4, 0]}>
          <cylinderGeometry args={[0.06, 0.15, 3, 6]} />
          <meshStandardMaterial color="#6b5a42" roughness={0.8} />
        </mesh>
        <mesh ref={holo} position={[0, h + 1.6, 0]}>
          <torusGeometry args={[Math.min(w, d) * 0.45, 0.07, 8, 40]} />
          <meshStandardMaterial color={st.window} emissive={st.window} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        {/* door */}
        <mesh position={[0, 1.6, d / 2 + 0.05]}>
          <boxGeometry args={[2.0, 3.2, 0.15]} />
          <meshStandardMaterial color="#080a16" roughness={0.3} metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.35, d / 2 + 0.1]}>
          <boxGeometry args={[2.4, 0.14, 0.1]} />
          <meshStandardMaterial color={st.window} emissive={st.window} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      </>
    );
  }, [b.style, w, h, d, st, wallColor]);

  return (
    <group position={b.position} rotation={[0, b.rotation, 0]}>
      {body}
      {!b.nested && <Windows b={b} color={st.window} />}
      {/* ground accent ring */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringR, ringR + 0.14, 48]} />
        <meshBasicMaterial color={st.accent} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      {isDropTarget && (
        <>
          <mesh ref={dropRing} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[ringR, ringR + 0.6, 64]} />
            <meshBasicMaterial color="#5dff9a" transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[0, h / 2 + 0.3, 0]}>
            <boxGeometry args={[w + 0.5, h + 0.5, d + 0.5]} />
            <meshBasicMaterial color="#5dff9a" wireframe transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh position={[0, 3.6, d / 2 + 0.2]}>
            <boxGeometry args={[2.6, 0.12, 0.1]} />
            <meshStandardMaterial color="#5dff9a" emissive="#5dff9a" emissiveIntensity={3} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 3, d / 2 + 2]} color="#5dff9a" intensity={30} distance={14} decay={2} />
        </>
      )}
      {highlighted && (
        <mesh position={[0, h / 2 + 0.3, 0]}>
          <boxGeometry args={[w + 0.7, h + 0.7, d + 0.7]} />
          <meshBasicMaterial color="#ffe08a" wireframe transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
      <Label
        text={b.entity.name.toUpperCase()}
        sub={sub}
        position={[0, h + (b.style === "library" ? Math.min(w, d) * 0.7 + 2.4 : b.style === "docks" ? h * 0.35 + 3.2 : 4.6), 0]}
        color={st.label}
        scale={b.nested ? 1.3 : 2.1}
      />
    </group>
  );
}

export default memo(Building);
