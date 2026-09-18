import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { buildDecorations, DISTRICTS, rand01, ROADS, WORLD_RADIUS } from "../worldgen";
import type { Collider } from "../types";
import { Label } from "./Label";

// ---------- procedural textures ----------

function blockTexture(
  cells: number,
  palette: string[],
  seedKey: string,
  repeat: number,
  opts: { pixel?: number } = {},
): THREE.CanvasTexture {
  const px = opts.pixel ?? 4;
  const size = cells * px;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const r = rand01(`${seedKey}-${x}-${y}`, 1);
      const idx = Math.min(palette.length - 1, Math.floor(r * palette.length));
      ctx.fillStyle = palette[idx];
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function useGrassTexture() {
  return useMemo(
    () => blockTexture(64, ["#5d9c3f", "#6ab04c", "#4e8a34", "#7ab648", "#5f9e41", "#6aa84f", "#548c38", "#71b04a"], "grass", 90),
    [],
  );
}

export function useStoneTexture() {
  return useMemo(() => blockTexture(32, ["#7d7d7d", "#8a8a8a", "#6f6f6f", "#828282", "#767676"], "stone", 6), []);
}

// ---------- sky ----------

const skyVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const skyFragment = /* glsl */ `
  varying vec3 vWorld;
  uniform float uTime;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = dir.y;
    vec3 top = vec3(0.22, 0.46, 0.86);
    vec3 upper = vec3(0.42, 0.64, 0.95);
    vec3 horizon = vec3(0.78, 0.87, 0.97);
    vec3 glow = vec3(1.0, 0.92, 0.72);
    vec3 below = vec3(0.55, 0.62, 0.68);
    vec3 col;
    if (h > 0.0) {
      col = mix(horizon, upper, smoothstep(0.0, 0.22, h));
      col = mix(col, top, smoothstep(0.18, 0.75, h));
    } else {
      col = mix(horizon, below, smoothstep(0.0, 0.25, -h));
    }
    float band = pow(1.0 - clamp(abs(h), 0.0, 1.0), 14.0);
    col += glow * band * 0.35;
    // soft drifting cloud band
    float ribbon = exp(-pow((h - 0.32 + 0.05 * sin(dir.x * 3.0 + uTime * 0.05)) * 9.0, 2.0));
    ribbon *= 0.5 + 0.5 * sin(dir.x * 6.0 + dir.z * 4.0 + uTime * 0.08);
    col += vec3(1.0, 1.0, 1.0) * ribbon * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function Sky() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  useFrame((_, dt) => {
    if (mat.current) mat.current.uniforms.uTime.value += dt;
  });
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  return (
    <mesh renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[420, 32, 16]} />
      <shaderMaterial
        ref={mat}
        vertexShader={skyVertex}
        fragmentShader={skyFragment}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

// ---------- lights that follow the player ----------

function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null);
  const { scene, camera } = useThree();
  useEffect(() => {
    if (!light.current) return;
    const l = light.current;
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const p = camera.position;
    l.position.set(p.x + 45, 80, p.z + 35);
    l.target.position.set(p.x, 0, p.z);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={2.6}
      color="#fff3dc"
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-70}
      shadow-camera-right={70}
      shadow-camera-top={70}
      shadow-camera-bottom={-70}
      shadow-camera-near={10}
      shadow-camera-far={220}
      shadow-bias={-0.0006}
      shadow-normalBias={0.02}
    />
  );
}

// ---------- roads ----------

function Roads({ stone }: { stone: THREE.Texture }) {
  return (
    <group>
      {ROADS.map((r, i) => {
        const dx = r.to[0] - r.from[0];
        const dz = r.to[2] - r.from[2];
        const len = Math.hypot(dx, dz);
        const cx = (r.from[0] + r.to[0]) / 2;
        const cz = (r.from[2] + r.to[2]) / 2;
        const rot = Math.atan2(dx, dz);
        return (
          <group key={i} position={[cx, 0, cz]} rotation={[0, rot, 0]}>
            <mesh receiveShadow position={[0, 0.06, 0]}>
              <boxGeometry args={[r.width, 0.12, len]} />
              <meshStandardMaterial map={stone} color="#b8b4a8" roughness={0.9} />
            </mesh>
            {/* warm gravel edge strips */}
            {[-1, 1].map((s) => (
              <mesh key={s} position={[(s * (r.width + 0.16)) / 2, 0.1, 0]}>
                <boxGeometry args={[0.16, 0.06, len]} />
                <meshStandardMaterial color="#8a7a5c" roughness={0.95} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// ---------- plaza + district floors ----------

function Plaza({ stone }: { stone: THREE.Texture }) {
  const crystal = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (crystal.current) {
      crystal.current.rotation.y = t * 0.6;
      crystal.current.position.y = 7 + Math.sin(t * 1.2) * 0.4;
    }
    if (ring.current) ring.current.rotation.z = t * 0.2;
  });
  return (
    <group>
      <mesh receiveShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[22, 22, 0.1, 48]} />
        <meshStandardMaterial map={stone} color="#c4b89e" roughness={0.85} />
      </mesh>
      {/* gold ring inlay */}
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[19.4, 19.9, 96]} />
        <meshStandardMaterial color="#e8b84a" emissive="#e8b84a" emissiveIntensity={0.9} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.6, 5.9, 64]} />
        <meshStandardMaterial color="#e8b84a" emissive="#e8b84a" emissiveIntensity={0.8} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* central monument */}
      <mesh castShadow receiveShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[2.6, 3.2, 1.8, 8]} />
        <meshStandardMaterial color="#6f6a5e" roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh castShadow position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.5, 1.4, 1.8, 6]} />
        <meshStandardMaterial color="#5c574c" roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh ref={crystal} castShadow position={[0, 7, 0]}>
        <octahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color="#ffc861" emissive="#ffb347" emissiveIntensity={2.2} roughness={0.2} metalness={0.4} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 7, 0]}>
        <torusGeometry args={[3.2, 0.08, 8, 64]} />
        <meshStandardMaterial color="#ffc861" emissive="#ffc861" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 7, 0]} color="#ffb347" intensity={40} distance={40} decay={2} />
      <Label text="DESKTOP PLAZA" sub="DESKTOP DISTRICT" position={[0, 12.5, 0]} color="#ffc861" scale={3} />
    </group>
  );
}

function DistrictFloors({ stone }: { stone: THREE.Texture }) {
  const docs = DISTRICTS.Documents.center;
  const dl = DISTRICTS.Downloads.center;
  const water = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.emissiveIntensity = 0.35 + Math.sin(clock.getElapsedTime() * 0.8) * 0.12;
  });
  return (
    <group>
      {/* Documents Library - sandstone rotunda */}
      <group position={[docs[0], 0, docs[2]]}>
        <mesh receiveShadow position={[0, 0.05, 0]}>
          <cylinderGeometry args={[24, 24, 0.1, 10]} />
          <meshStandardMaterial map={stone} color="#c9a982" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[21.2, 21.7, 10]} />
          <meshStandardMaterial color="#ffc861" emissive="#ffc861" emissiveIntensity={1.5} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {/* central lectern / obelisk */}
        <mesh castShadow position={[0, 3, 0]}>
          <boxGeometry args={[1.6, 6, 1.6]} />
          <meshStandardMaterial color="#6b4a2f" roughness={0.7} />
        </mesh>
        <mesh position={[0, 6.6, 0]}>
          <octahedronGeometry args={[0.9, 0]} />
          <meshStandardMaterial color="#ffc861" emissive="#ffb347" emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 7, 0]} color="#ffb347" intensity={30} distance={40} decay={2} />
        <Label text="DOCUMENTS LIBRARY" sub="ARCHIVE OF RECORDS" position={[0, 11, 0]} color="#ffc861" scale={3} />
      </group>
      {/* Downloads Docks - planks over neon water */}
      <group position={[dl[0], 0, dl[2]]}>
        <mesh receiveShadow position={[0, -0.25, 0]}>
          <boxGeometry args={[78, 0.3, 66]} />
          <meshStandardMaterial ref={water} color="#2f6db3" emissive="#1a4a80" emissiveIntensity={0.25} roughness={0.2} metalness={0.3} transparent opacity={0.92} />
        </mesh>
        <mesh receiveShadow position={[0, 0.05, 0]}>
          <boxGeometry args={[52, 0.14, 44]} />
          <meshStandardMaterial color="#8a6a44" roughness={0.9} />
        </mesh>
        {/* dock edge trim */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 26, 0.14, 0]}>
            <boxGeometry args={[0.2, 0.08, 44]} />
            <meshStandardMaterial color="#6b4f30" roughness={0.9} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`z${s}`} position={[0, 0.14, s * 22]}>
            <boxGeometry args={[52, 0.08, 0.2]} />
            <meshStandardMaterial color="#6b4f30" roughness={0.9} />
          </mesh>
        ))}
        {/* crane */}
        <group position={[0, 0, -16]}>
          <mesh castShadow position={[0, 9, 0]}>
            <boxGeometry args={[1.2, 18, 1.2]} />
            <meshStandardMaterial color="#7a6248" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[6, 17.5, 0]}>
            <boxGeometry args={[14, 0.8, 0.8]} />
            <meshStandardMaterial color="#7a6248" roughness={0.8} />
          </mesh>
          <mesh position={[12.5, 17.5, 0]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="#e8b84a" emissive="#e8b84a" emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
          <mesh position={[10, 14, 0]}>
            <boxGeometry args={[0.08, 7, 0.08]} />
            <meshStandardMaterial color="#4a3a28" />
          </mesh>
          <mesh castShadow position={[10, 9.6, 0]}>
            <boxGeometry args={[2.2, 1.6, 1.4]} />
            <meshStandardMaterial color="#9a5a3a" roughness={0.8} />
          </mesh>
        </group>
        <pointLight position={[0, 8, 0]} color="#ffd27a" intensity={30} distance={45} decay={2} />
        <Label text="DOWNLOADS DOCKS" sub="INBOUND CARGO" position={[0, 11, 0]} color="#ffd27a" scale={3} />
      </group>
    </group>
  );
}

// ---------- instanced decorations ----------

function Decorations({ colliders }: { colliders: Collider[] }) {
  const decos = useMemo(() => buildDecorations(colliders), [colliders]);
  const trees = decos.filter((d) => d.kind === "tree");
  const crystals = decos.filter((d) => d.kind === "crystal");
  const rocks = decos.filter((d) => d.kind === "rock");
  const lamps = decos.filter((d) => d.kind === "lamp");

  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const canopy2Ref = useRef<THREE.InstancedMesh>(null);
  const crystalRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const lampPostRef = useRef<THREE.InstancedMesh>(null);
  const lampHeadRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();

    trees.forEach((t, i) => {
      const h = 3.2 * t.scale;
      q.setFromEuler(new THREE.Euler(0, rand01(`t${t.seed}`, 1) * Math.PI, 0));
      p.set(t.position[0], h / 2, t.position[2]);
      s.set(0.7 * t.scale, h, 0.7 * t.scale);
      m.compose(p, q, s);
      trunkRef.current?.setMatrixAt(i, m);
      p.set(t.position[0], h + 1.4 * t.scale, t.position[2]);
      s.set(3.6 * t.scale, 2.6 * t.scale, 3.6 * t.scale);
      m.compose(p, q, s);
      canopyRef.current?.setMatrixAt(i, m);
      const shade = rand01(`c${t.seed}`, 2);
      c.setHSL(0.29 + shade * 0.06, 0.62, 0.3 + shade * 0.1);
      canopyRef.current?.setColorAt(i, c);
      p.set(t.position[0], h + 3.4 * t.scale, t.position[2]);
      s.set(2.2 * t.scale, 1.8 * t.scale, 2.2 * t.scale);
      m.compose(p, q, s);
      canopy2Ref.current?.setMatrixAt(i, m);
      c.setHSL(0.31 + shade * 0.06, 0.66, 0.36 + shade * 0.1);
      canopy2Ref.current?.setColorAt(i, c);
    });
    crystals.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(rand01(`cr${t.seed}`, 1) * 0.5, rand01(`cr${t.seed}`, 2) * Math.PI, 0));
      p.set(t.position[0], 1.2 * t.scale, t.position[2]);
      s.setScalar(1.3 * t.scale);
      m.compose(p, q, s);
      crystalRef.current?.setMatrixAt(i, m);
      const hue = rand01(`ch${t.seed}`, 3);
      c.set(hue < 0.5 ? "#7ee8d8" : hue < 0.8 ? "#8fd8ff" : "#c8a2f0");
      crystalRef.current?.setColorAt(i, c);
    });
    rocks.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(rand01(`r${t.seed}`, 1), rand01(`r${t.seed}`, 2) * Math.PI, 0));
      p.set(t.position[0], 0.5 * t.scale, t.position[2]);
      s.set(1.4 * t.scale, 1.0 * t.scale, 1.4 * t.scale);
      m.compose(p, q, s);
      rockRef.current?.setMatrixAt(i, m);
    });
    lamps.forEach((t, i) => {
      q.identity();
      p.set(t.position[0], 2.2, t.position[2]);
      s.set(0.22, 4.4, 0.22);
      m.compose(p, q, s);
      lampPostRef.current?.setMatrixAt(i, m);
      p.set(t.position[0], 4.6, t.position[2]);
      s.setScalar(0.5);
      m.compose(p, q, s);
      lampHeadRef.current?.setMatrixAt(i, m);
    });
    for (const r of [trunkRef, canopyRef, canopy2Ref, crystalRef, rockRef, lampPostRef, lampHeadRef]) {
      if (r.current) {
        r.current.instanceMatrix.needsUpdate = true;
        if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
        r.current.computeBoundingSphere();
      }
    }
  }, [trees, crystals, rocks, lamps]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, Math.max(1, trees.length)]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6a4a2c" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, Math.max(1, trees.length)]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3f8f35" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopy2Ref} args={[undefined, undefined, Math.max(1, trees.length)]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4da33e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crystalRef} args={[undefined, undefined, Math.max(1, crystals.length)]} castShadow>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.7} roughness={0.2} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[undefined, undefined, Math.max(1, rocks.length)]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#8a8a8a" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={lampPostRef} args={[undefined, undefined, Math.max(1, lamps.length)]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4a3a28" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={lampHeadRef} args={[undefined, undefined, Math.max(1, lamps.length)]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffe9b0" emissive="#ffd27a" emissiveIntensity={2.2} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ---------- boundary ----------

function Boundary() {
  return (
    <mesh position={[0, 6, 0]}>
      <cylinderGeometry args={[WORLD_RADIUS, WORLD_RADIUS, 12, 96, 1, true]} />
      <meshBasicMaterial color="#ffd27a" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

export default function Environment({ colliders }: { colliders: Collider[] }) {
  const grass = useGrassTexture();
  const stone = useStoneTexture();
  return (
    <group>
      <color attach="background" args={["#79a6e8"]} />
      <fogExp2 attach="fog" args={["#a8c4e8", 0.0042]} />
      <Sky />
      <ambientLight intensity={0.55} color="#cfe4ff" />
      <hemisphereLight args={["#87b8e8", "#5d8a3c", 0.7]} />
      <SunLight />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[WORLD_RADIUS + 30, 96]} />
        <meshStandardMaterial map={grass} color="#a8d97c" roughness={1} />
      </mesh>
      <Roads stone={stone} />
      <Plaza stone={stone} />
      <DistrictFloors stone={stone} />
      <Decorations colliders={colliders} />
      <Boundary />
      <Sparkles count={400} scale={[300, 40, 300]} position={[0, 14, -20]} size={4} speed={0.25} opacity={0.4} color="#fff3b0" noise={1} />
      <Sparkles count={200} scale={[60, 12, 60]} position={[0, 5, 0]} size={6} speed={0.4} opacity={0.6} color="#ffd27a" noise={2} />
    </group>
  );
}
