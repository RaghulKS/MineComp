import * as THREE from "three";
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../store";
import { Label } from "./Label";

const CRUMBS = 16;

export default function Waypoint() {
  const waypoint = useStore((s) => s.waypoint);
  const beam = useRef<THREE.Mesh>(null);
  const beamOuter = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const crumbs = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const m = useRef(new THREE.Matrix4());
  const v = useRef(new THREE.Vector3());

  useFrame(({ clock }) => {
    if (!waypoint) return;
    const t = clock.getElapsedTime();
    if (beam.current) {
      const mat = beam.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(t * 3) * 0.2;
      beam.current.rotation.y = t * 0.5;
    }
    if (beamOuter.current) {
      const mat = beamOuter.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.14 + Math.sin(t * 2 + 1) * 0.06;
      beamOuter.current.scale.x = beamOuter.current.scale.z = 1 + Math.sin(t * 2) * 0.15;
    }
    if (marker.current) {
      marker.current.rotation.y = t * 1.5;
      marker.current.position.y = waypoint.position[1] + 5 + Math.sin(t * 2) * 0.4;
    }
    if (ring.current) {
      const s = 1 + ((t * 0.8) % 1) * 1.6;
      ring.current.scale.set(s, s, s);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 - ((t * 0.8) % 1) * 0.9;
    }
    // breadcrumb trail from player to target
    if (crumbs.current) {
      const px = camera.position.x,
        pz = camera.position.z;
      const tx = waypoint.position[0],
        tz = waypoint.position[2];
      const dist = Math.hypot(tx - px, tz - pz);
      const flow = (t * 0.6) % 1;
      for (let i = 0; i < CRUMBS; i++) {
        const f = (i + flow) / CRUMBS;
        const x = px + (tx - px) * f;
        const z = pz + (tz - pz) * f;
        const y = 0.6 + Math.sin(f * Math.PI) * 1.0 + Math.sin(t * 3 + i) * 0.1;
        const fromCam = dist * f;
        const toTarget = dist * (1 - f);
        // hide crumbs right in front of the camera and the ones on top of the target
        const scale = fromCam < 4 ? 0 : fromCam < 7 ? (fromCam - 4) / 3 : toTarget < 2.5 ? 0 : 0.8;
        v.current.set(x, y, z);
        m.current.makeScale(0.35 * scale, 0.35 * scale, 0.35 * scale);
        m.current.setPosition(v.current);
        crumbs.current.setMatrixAt(i, m.current);
      }
      crumbs.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (!waypoint) return null;
  const [x, y, z] = waypoint.position;
  const color = waypoint.kind === "folder" ? "#ffc861" : "#35f2ff";
  return (
    <group>
      <group position={[x, 0, z]}>
        <mesh ref={beam} position={[0, 60, 0]}>
          <cylinderGeometry args={[0.35, 0.55, 120, 8, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={beamOuter} position={[0, 60, 0]}>
          <cylinderGeometry args={[1.4, 2.2, 120, 12, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh ref={ring} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 2.0, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh ref={marker} position={[0, y + 5, 0]}>
          <octahedronGeometry args={[0.9, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 4, 0]} color={color} intensity={40} distance={25} decay={2} />
        <Label text={waypoint.name.toUpperCase()} sub="WAYPOINT" position={[0, y + 7.6, 0]} color={color} scale={2} />
      </group>
      <instancedMesh ref={crumbs} args={[undefined, undefined, CRUMBS]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
