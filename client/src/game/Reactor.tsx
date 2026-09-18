import * as THREE from "three";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { useStore } from "../store";
import { REACTOR_POS } from "../worldgen";
import { Label } from "./Label";

const BARS = 10;
const COOL = new THREE.Color("#7ec8e8");
const WARM = new THREE.Color("#ffb347");
const HOT = new THREE.Color("#e85a3a");

export default function Reactor({ targeted }: { targeted: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const bars = useRef<(THREE.Mesh | null)[]>([]);
  const barMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const smooth = useRef({ cpu: 20, ram: 40 });
  const spin = useRef(0);
  const tmp = useRef(new THREE.Color());

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    const sys = useStore.getState().system;
    const k = 1 - Math.exp(-dt * 2.5);
    smooth.current.cpu += (sys.cpu - smooth.current.cpu) * k;
    smooth.current.ram += (sys.ram - smooth.current.ram) * k;
    const cpu = smooth.current.cpu / 100;
    const ram = smooth.current.ram / 100;

    spin.current += dt * (0.4 + cpu * 3.5);
    const coreH = 5 + cpu * 9;
    if (core.current) {
      core.current.scale.set(1 + cpu * 0.35, coreH / 8, 1 + cpu * 0.35);
      core.current.position.y = 3.5 + coreH / 2;
      core.current.rotation.y = spin.current;
    }
    const c = tmp.current;
    if (cpu < 0.5) c.copy(COOL).lerp(WARM, cpu * 2);
    else c.copy(WARM).lerp(HOT, (cpu - 0.5) * 2);
    if (coreMat.current) {
      coreMat.current.emissive.copy(c);
      coreMat.current.color.copy(c);
      coreMat.current.emissiveIntensity = 1.6 + cpu * 4 + Math.sin(t * (4 + cpu * 10)) * 0.4;
    }
    if (light.current) {
      light.current.color.copy(c);
      light.current.intensity = 60 + cpu * 220;
      light.current.position.y = 3.5 + coreH / 2;
    }
    if (ring1.current) {
      ring1.current.rotation.x = spin.current * 0.7;
      ring1.current.rotation.y = spin.current * 0.4;
      ring1.current.position.y = 3.5 + coreH / 2;
    }
    if (ring2.current) {
      ring2.current.rotation.z = spin.current * 0.9;
      ring2.current.rotation.x = Math.PI / 3 + spin.current * 0.2;
      ring2.current.position.y = 3.5 + coreH / 2;
    }
    if (ring3.current) {
      ring3.current.rotation.y = -spin.current * 1.3;
      ring3.current.position.y = 3.5 + coreH / 2;
    }
    for (let i = 0; i < BARS; i++) {
      const m = bars.current[i];
      const mat = barMats.current[i];
      if (!m) continue;
      const wave = 0.85 + 0.15 * Math.sin(t * 2 + i * 0.9);
      const hgt = 0.8 + ram * 9.5 * wave;
      m.scale.y = hgt;
      m.position.y = 1 + hgt / 2;
      if (mat) mat.emissiveIntensity = 1.2 + ram * 2.2 + Math.sin(t * 3 + i) * 0.3;
    }
  });

  const [x, , z] = REACTOR_POS;
  return (
    <group position={[x, 0, z]}>
      {/* base */}
      <mesh receiveShadow castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[9, 9.6, 0.8, 12]} />
        <meshStandardMaterial color="#6f6a5e" roughness={0.8} metalness={0.15} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 1.2, 0]}>
        <cylinderGeometry args={[4.2, 4.8, 0.8, 12]} />
        <meshStandardMaterial color="#7d7668" roughness={0.8} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[8.6, 8.9, 64]} />
        <meshStandardMaterial color="#e8b84a" emissive="#e8b84a" emissiveIntensity={1.4} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* pylons */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <group key={i} position={[Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6]}>
            <mesh castShadow position={[0, 11, 0]}>
              <boxGeometry args={[0.9, 22, 0.9]} />
              <meshStandardMaterial color="#5c574c" roughness={0.7} metalness={0.3} />
            </mesh>
            <mesh position={[0, 11, 0]}>
              <boxGeometry args={[0.2, 21, 1.0]} />
              <meshStandardMaterial color="#ffb347" emissive="#ffb347" emissiveIntensity={1.2} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
      {/* crown */}
      <mesh castShadow position={[0, 22.4, 0]}>
        <cylinderGeometry args={[5.4, 5.4, 0.8, 8]} />
        <meshStandardMaterial color="#6f6a5e" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0, 24.5, 0]}>
        <cylinderGeometry args={[0.15, 0.6, 4, 6]} />
        <meshStandardMaterial color="#6b5a42" roughness={0.8} />
      </mesh>
      <mesh position={[0, 26.8, 0]}>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color="#ffb347" emissive="#ffb347" emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      {/* core */}
      <mesh ref={core} position={[0, 8, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 8, 6, 1]} />
        <meshStandardMaterial ref={coreMat} color="#7ec8e8" emissive="#7ec8e8" emissiveIntensity={2} roughness={0.2} toneMapped={false} />
      </mesh>
      <mesh ref={ring1} position={[0, 8, 0]}>
        <torusGeometry args={[2.6, 0.12, 8, 48]} />
        <meshStandardMaterial color="#7ec8e8" emissive="#7ec8e8" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} position={[0, 8, 0]}>
        <torusGeometry args={[3.1, 0.1, 8, 48]} />
        <meshStandardMaterial color="#ffb347" emissive="#ffb347" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <mesh ref={ring3} position={[0, 8, 0]}>
        <torusGeometry args={[2.1, 0.08, 8, 48]} />
        <meshStandardMaterial color="#e85a3a" emissive="#e85a3a" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 8, 0]} color="#7ec8e8" intensity={100} distance={60} decay={2} />
      {/* RAM energy bars */}
      {Array.from({ length: BARS }).map((_, i) => {
        const a = (i / BARS) * Math.PI * 2;
        const r = 6.6;
        return (
          <group key={i} position={[Math.cos(a) * r, 0, Math.sin(a) * r]} rotation={[0, -a, 0]}>
            <mesh castShadow position={[0, 0.9, 0]}>
              <boxGeometry args={[1.1, 0.3, 1.1]} />
              <meshStandardMaterial color="#7d7668" roughness={0.8} metalness={0.2} />
            </mesh>
            <mesh
              ref={(m) => {
                bars.current[i] = m;
              }}
              position={[0, 2, 0]}
            >
              <boxGeometry args={[0.7, 1, 0.7]} />
              <meshStandardMaterial
                ref={(m) => {
                  barMats.current[i] = m;
                }}
                color="#ffb347"
                emissive="#ffb347"
                emissiveIntensity={1.5}
                toneMapped={false}
                transparent
                opacity={0.9}
              />
            </mesh>
          </group>
        );
      })}
      <Sparkles count={120} scale={[10, 20, 10]} position={[0, 12, 0]} size={5} speed={2} color="#ffd27a" opacity={0.8} />
      <Label text="SYSTEM REACTOR" sub="LIVE CPU • RAM TELEMETRY" position={[0, 30, 0]} color="#ffb347" scale={3.2} />
      {targeted && (
        <mesh position={[0, 8, 0]}>
          <cylinderGeometry args={[4.4, 4.4, 14, 6, 1, true]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
