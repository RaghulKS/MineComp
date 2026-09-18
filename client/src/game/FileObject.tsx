import * as THREE from "three";
import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { FileVisual, PlacedFile } from "../types";
import { rand01 } from "../worldgen";

export const VISUAL_COLOR: Record<FileVisual, string> = {
  "book-red": "#ff6b5a",
  "book-parchment": "#ffd98a",
  artwork: "#ffc861",
  screen: "#35f2ff",
  record: "#ff4fd8",
  crate: "#ffa552",
  terminal: "#5dff9a",
  cube: "#a259ff",
};

function artTexture(seed: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 48;
  const ctx = c.getContext("2d")!;
  const h1 = rand01(seed, 1) * 360;
  const h2 = (h1 + 60 + rand01(seed, 2) * 120) % 360;
  const g = ctx.createLinearGradient(0, 0, 64, 48);
  g.addColorStop(0, `hsl(${h1},70%,55%)`);
  g.addColorStop(1, `hsl(${h2},70%,35%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 48);
  // blocky "mountains"
  ctx.fillStyle = `hsla(${(h1 + 180) % 360},50%,20%,0.8)`;
  for (let x = 0; x < 64; x += 4) {
    const hgt = 10 + rand01(seed + x, 3) * 22;
    ctx.fillRect(x, 48 - hgt, 4, hgt);
  }
  ctx.fillStyle = "#fff8d0";
  const sx = 8 + rand01(seed, 4) * 40;
  ctx.fillRect(sx, 8, 6, 6);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Visual({ visual, seed, id }: { visual: FileVisual; seed: number; id: string }) {
  const spin = useRef<THREE.Mesh>(null);
  const glowMat = useRef<THREE.MeshStandardMaterial>(null);
  const art = useMemo(() => (visual === "artwork" ? artTexture(id) : null), [visual, id]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed * 0.001;
    if (spin.current) {
      if (visual === "record") spin.current.rotation.y = t * 2.2;
      else if (visual === "cube") {
        spin.current.rotation.y = t * 0.9;
        spin.current.rotation.x = t * 0.5;
      }
    }
    if (glowMat.current) {
      if (visual === "terminal") glowMat.current.emissiveIntensity = 1.6 + (Math.sin(t * 6) > 0.6 ? 0.9 : 0);
      else if (visual === "screen") glowMat.current.emissiveIntensity = 1.8 + Math.sin(t * 3.1) * 0.35 + Math.sin(t * 17) * 0.1;
      else glowMat.current.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.3;
    }
  });

  switch (visual) {
    case "book-red":
      return (
        <group rotation={[0, 0, 0.12]}>
          <mesh castShadow>
            <boxGeometry args={[0.95, 1.25, 0.28]} />
            <meshStandardMaterial color="#a8202c" roughness={0.6} />
          </mesh>
          <mesh position={[0.03, 0, 0]}>
            <boxGeometry args={[0.82, 1.14, 0.3]} />
            <meshStandardMaterial color="#f1e6c8" roughness={0.9} />
          </mesh>
          <mesh position={[-0.47, 0, 0]}>
            <boxGeometry args={[0.06, 1.25, 0.3]} />
            <meshStandardMaterial ref={glowMat} color="#ffc861" emissive="#ffc861" emissiveIntensity={1.6} toneMapped={false} metalness={0.6} />
          </mesh>
          {[0.35, 0, -0.35].map((y) => (
            <mesh key={y} position={[-0.47, y, 0]}>
              <boxGeometry args={[0.08, 0.08, 0.32]} />
              <meshStandardMaterial color="#ffc861" emissive="#ffc861" emissiveIntensity={1.2} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
    case "book-parchment":
      return (
        <group rotation={[0.1, 0.3, -0.08]}>
          <mesh castShadow>
            <boxGeometry args={[0.95, 1.2, 0.24]} />
            <meshStandardMaterial color="#5a3d26" roughness={0.8} />
          </mesh>
          <mesh position={[0.04, 0, 0]}>
            <boxGeometry args={[0.86, 1.1, 0.27]} />
            <meshStandardMaterial ref={glowMat} color="#e9d7a6" emissive="#c9a35a" emissiveIntensity={0.35} roughness={0.95} />
          </mesh>
          <mesh position={[0.1, 0.1, 0.16]}>
            <boxGeometry args={[0.5, 0.05, 0.02]} />
            <meshStandardMaterial color="#5a3d26" />
          </mesh>
          <mesh position={[0.1, -0.05, 0.16]}>
            <boxGeometry args={[0.6, 0.05, 0.02]} />
            <meshStandardMaterial color="#5a3d26" />
          </mesh>
        </group>
      );
    case "artwork":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[1.5, 1.15, 0.1]} />
            <meshStandardMaterial color="#c9a24a" metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.06]}>
            <planeGeometry args={[1.25, 0.92]} />
            <meshStandardMaterial ref={glowMat} map={art!} emissiveMap={art!} emissive="#ffffff" emissiveIntensity={0.6} roughness={0.8} />
          </mesh>
          {/* easel legs */}
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} position={[x, -0.75, -0.15]} rotation={[0.2, 0, x > 0 ? -0.1 : 0.1]}>
              <boxGeometry args={[0.08, 1.4, 0.08]} />
              <meshStandardMaterial color="#3a2a24" />
            </mesh>
          ))}
        </group>
      );
    case "screen":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[1.5, 0.9, 0.12]} />
            <meshStandardMaterial color="#0c1020" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.07]}>
            <planeGeometry args={[1.34, 0.76]} />
            <meshStandardMaterial ref={glowMat} color="#35f2ff" emissive="#35f2ff" emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.12, 0.08]}>
            <ringGeometry args={[0.12, 0.2, 3]} />
            <meshBasicMaterial color="#05060f" />
          </mesh>
          <mesh position={[0, -0.62, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.12]} />
            <meshStandardMaterial color="#1c2033" metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.82, 0]}>
            <boxGeometry args={[0.7, 0.06, 0.4]} />
            <meshStandardMaterial color="#1c2033" metalness={0.6} />
          </mesh>
        </group>
      );
    case "record":
      return (
        <group>
          <mesh castShadow position={[0, -0.45, 0]}>
            <boxGeometry args={[1.1, 0.7, 0.9]} />
            <meshStandardMaterial color="#3a1a3a" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, -0.45, 0.46]}>
            <planeGeometry args={[0.9, 0.35]} />
            <meshStandardMaterial ref={glowMat} color="#ff4fd8" emissive="#ff4fd8" emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
          <mesh ref={spin} position={[0, 0.05, 0]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 32]} />
            <meshStandardMaterial color="#0b0b12" roughness={0.3} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.02, 24]} />
            <meshStandardMaterial color="#ff4fd8" emissive="#ff4fd8" emissiveIntensity={2} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.02, 32]} />
            <meshBasicMaterial color="#ff4fd8" transparent opacity={0.15} />
          </mesh>
        </group>
      );
    case "crate":
      return (
        <group rotation={[0, 0.4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.05, 1.05, 1.05]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.9} />
          </mesh>
          {[
            [0, 0, 0.54, 0],
            [0, 0, -0.54, 0],
            [0.54, 0, 0, Math.PI / 2],
            [-0.54, 0, 0, Math.PI / 2],
          ].map(([x, y, z, ry], i) => (
            <group key={i} position={[x, y, z]} rotation={[0, ry, 0]}>
              <mesh>
                <boxGeometry args={[1.08, 0.12, 0.04]} />
                <meshStandardMaterial color="#5c3a1a" />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <boxGeometry args={[1.08, 0.12, 0.04]} />
                <meshStandardMaterial color="#5c3a1a" />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[1.4, 0.1, 0.03]} />
                <meshStandardMaterial color="#5c3a1a" />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.54, 0]}>
            <boxGeometry args={[0.5, 0.03, 0.5]} />
            <meshStandardMaterial ref={glowMat} color="#ffa552" emissive="#ffa552" emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        </group>
      );
    case "terminal":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[1.0, 1.2, 0.55]} />
            <meshStandardMaterial color="#0e1a16" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.15, 0.28]}>
            <planeGeometry args={[0.82, 0.7]} />
            <meshStandardMaterial ref={glowMat} color="#5dff9a" emissive="#5dff9a" emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
          {[0.32, 0.2, 0.08, -0.04].map((y, i) => (
            <mesh key={y} position={[-0.32 + i * 0.05, y, 0.29]}>
              <planeGeometry args={[0.3 + i * 0.12, 0.04]} />
              <meshBasicMaterial color="#05100a" />
            </mesh>
          ))}
          <mesh position={[0, -0.5, 0.45]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={[0.9, 0.06, 0.35]} />
            <meshStandardMaterial color="#1b2a24" />
          </mesh>
          <mesh position={[0, -0.46, 0.45]} rotation={[-0.3, 0, 0]}>
            <boxGeometry args={[0.7, 0.02, 0.2]} />
            <meshStandardMaterial color="#5dff9a" emissive="#5dff9a" emissiveIntensity={0.8} toneMapped={false} />
          </mesh>
        </group>
      );
    default: {
      const hue = rand01(id, 9);
      const col = hue < 0.4 ? "#a259ff" : hue < 0.7 ? "#35f2ff" : "#ff4fd8";
      return (
        <group>
          <mesh ref={spin} castShadow>
            <boxGeometry args={[0.7, 0.7, 0.7]} />
            <meshStandardMaterial ref={glowMat} color={col} emissive={col} emissiveIntensity={1.6} roughness={0.2} metalness={0.4} toneMapped={false} />
          </mesh>
          <mesh rotation={[0.6, 0.8, 0]}>
            <boxGeometry args={[1.05, 1.05, 1.05]} />
            <meshBasicMaterial color={col} wireframe transparent opacity={0.45} />
          </mesh>
        </group>
      );
    }
  }
}

export function FileMesh({ file, carried }: { file: PlacedFile; carried?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const color = VISUAL_COLOR[file.visual];
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + file.seed * 0.0007;
    if (group.current) {
      group.current.position.y = (carried ? 0 : 1.25) + Math.sin(t * 1.6) * 0.07;
      if (!carried) group.current.rotation.y = file.rotation + Math.sin(t * 0.7) * 0.08;
    }
    if (ring.current && !carried) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.45 + Math.sin(t * 2.4) * 0.15;
    }
  });
  return (
    <group>
      <group ref={group} position={[0, carried ? 0 : 1.25, 0]} rotation={[0, file.rotation, 0]}>
        <Visual visual={file.visual} seed={file.seed} id={file.entity.id} />
      </group>
      {!carried && (
        <>
          {/* pedestal */}
          <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
            <boxGeometry args={[1.3, 0.4, 1.3]} />
            <meshStandardMaterial color="#1c2033" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.41, 0]}>
            <boxGeometry args={[1.0, 0.03, 1.0]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
          <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.95, 1.1, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function FileObject({ file, targeted, highlighted }: { file: PlacedFile; targeted: boolean; highlighted: boolean }) {
  const color = VISUAL_COLOR[file.visual];
  const halo = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (halo.current) {
      const t = clock.getElapsedTime();
      const s = 1 + Math.sin(t * 5) * 0.06;
      halo.current.scale.set(s, 1, s);
    }
  });
  return (
    <group position={file.position}>
      <FileMesh file={file} />
      {(targeted || highlighted) && (
        <group ref={halo}>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.15, 1.45, 40]} />
            <meshBasicMaterial color={targeted ? "#ffffff" : color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <pointLight position={[0, 1.6, 0]} color={targeted ? "#ffffff" : color} intensity={5} distance={6} decay={2} />
        </group>
      )}
    </group>
  );
}

export default memo(FileObject);
