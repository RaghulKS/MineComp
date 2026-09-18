import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { PORTAL_POS } from "../worldgen";
import { Label } from "./Label";

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const frag = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    float swirl = sin(a * 4.0 + r * 9.0 - uTime * 3.0);
    float swirl2 = sin(a * 7.0 - r * 14.0 + uTime * 2.0);
    vec3 cyan = vec3(0.55, 0.30, 0.85);
    vec3 violet = vec3(0.42, 0.18, 0.66);
    vec3 magenta = vec3(0.75, 0.42, 0.95);
    vec3 col = mix(cyan, violet, 0.5 + 0.5 * sin(a * 2.0 - uTime * 0.8 + r * 5.0));
    col = mix(col, magenta, 0.35 * (0.5 + 0.5 * swirl2));
    float energy = 0.55 + 0.35 * swirl + 0.15 * swirl2;
    float mask = smoothstep(1.0, 0.85, r);
    float core = smoothstep(0.45, 0.0, r);
    col = col * energy + vec3(1.0) * core * 0.9;
    float alpha = mask * (0.85 + 0.15 * swirl);
    gl_FragColor = vec4(col * 1.7, alpha);
  }
`;

export default function Portal({ targeted }: { targeted: boolean }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const orbit = useRef<THREE.Group>(null);
  const rim = useRef<THREE.MeshStandardMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    if (mat.current) mat.current.uniforms.uTime.value += dt;
    if (ring.current) ring.current.rotation.z = t * 0.25;
    if (orbit.current) orbit.current.rotation.z = -t * 0.6;
    if (rim.current) rim.current.emissiveIntensity = (targeted ? 3.2 : 2.2) + Math.sin(t * 3) * 0.4;
  });
  const [x, , z] = PORTAL_POS;
  // face the plaza
  const rotY = Math.atan2(0 - x, 0 - z);
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      {/* platform steps */}
      <mesh receiveShadow castShadow position={[0, 0.25, 0]}>
        <cylinderGeometry args={[9, 9.5, 0.5, 8]} />
        <meshStandardMaterial color="#3a3344" roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, 0.7, 0]}>
        <cylinderGeometry args={[6.5, 7, 0.5, 8]} />
        <meshStandardMaterial color="#453d52" roughness={0.8} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.4, 6.7, 64]} />
        <meshStandardMaterial color="#9b59d0" emissive="#9b59d0" emissiveIntensity={1.4} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* pillars */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 7.2, 0, -0.5]}>
          <mesh castShadow position={[0, 5, 0]}>
            <boxGeometry args={[1.4, 10, 1.4]} />
            <meshStandardMaterial color="#241d33" roughness={0.7} metalness={0.2} />
          </mesh>
          <mesh position={[0, 5, 0]}>
            <boxGeometry args={[0.25, 9.4, 1.5]} />
            <meshStandardMaterial color="#9b59d0" emissive="#9b59d0" emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
          <mesh position={[0, 10.5, 0]}>
            <octahedronGeometry args={[0.8, 0]} />
            <meshStandardMaterial color="#c8a2f0" emissive="#c8a2f0" emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* ring */}
      <group position={[0, 6.6, 0]}>
        <mesh ref={ring} castShadow>
          <torusGeometry args={[5.2, 0.75, 12, 48]} />
          <meshStandardMaterial color="#241d33" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh>
          <torusGeometry args={[5.2, 0.28, 8, 64]} />
          <meshStandardMaterial ref={rim} color="#9b59d0" emissive="#9b59d0" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[4.35, 0.12, 8, 64]} />
          <meshStandardMaterial color="#c8a2f0" emissive="#c8a2f0" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
        {/* swirling gate surface */}
        <mesh>
          <circleGeometry args={[4.45, 64]} />
          <shaderMaterial
            ref={mat}
            vertexShader={vert}
            fragmentShader={frag}
            uniforms={uniforms}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        {/* orbiting shards */}
        <group ref={orbit}>
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 6.6, Math.sin(a) * 6.6, 0]} rotation={[a, a * 0.5, 0]}>
                <boxGeometry args={[0.35, 0.35, 0.35]} />
                <meshStandardMaterial color={i % 2 ? "#9b59d0" : "#c8a2f0"} emissive={i % 2 ? "#9b59d0" : "#c8a2f0"} emissiveIntensity={2} toneMapped={false} />
              </mesh>
            );
          })}
        </group>
        <Sparkles count={160} scale={[12, 12, 4]} size={7} speed={1.4} color="#d8b8ff" opacity={0.9} noise={2} />
        <pointLight color="#9b59d0" intensity={90} distance={45} decay={2} />
      </group>
      <Label text="WEB GATE" sub="CHROME • PRESS E TO ENTER" position={[0, 14.2, 0]} color="#c8a2f0" scale={3.2} />
      {targeted && (
        <mesh position={[0, 6.6, 0]}>
          <torusGeometry args={[6.3, 0.15, 8, 64]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}
