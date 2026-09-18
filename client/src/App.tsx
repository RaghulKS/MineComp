import * as THREE from "three";
import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useStore } from "./store";
import { buildLayout, SPAWN } from "./worldgen";
import { bridge } from "./game/bridge";
import Environment from "./game/Environment";
import Player from "./game/Player";
import Building from "./game/Building";
import FileObject from "./game/FileObject";
import Portal from "./game/Portal";
import Reactor from "./game/Reactor";
import Interaction from "./game/Interaction";
import Waypoint from "./game/Waypoint";
import Effects from "./game/Effects";
import DataSync from "./game/DataSync";
import HUD from "./ui/HUD";
import StartScreen from "./ui/StartScreen";
import SearchOverlay from "./ui/SearchOverlay";

function World() {
  const entities = useStore((s) => s.entities);
  const target = useStore((s) => s.target);
  const dropTarget = useStore((s) => s.dropTarget);
  const highlightId = useStore((s) => s.highlightId);
  const carrying = useStore((s) => s.carrying);

  const layout = useMemo(() => buildLayout(entities), [entities]);
  useEffect(() => {
    bridge.layout = layout;
  }, [layout]);

  // keep the waypoint anchored if the world re-lays out (e.g. after a move)
  useEffect(() => {
    const s = useStore.getState();
    if (s.waypoint) {
      const p = layout.positions.get(s.waypoint.id);
      if (p && (p[0] !== s.waypoint.position[0] || p[2] !== s.waypoint.position[2])) {
        s.setWaypoint({ ...s.waypoint, position: p });
      }
    }
  }, [layout]);

  return (
    <>
      <Environment colliders={layout.colliders} />
      {layout.buildings.map((b) => (
        <Building
          key={b.entity.id}
          b={b}
          isDropTarget={dropTarget?.id === b.entity.id}
          highlighted={highlightId === b.entity.id}
        />
      ))}
      {layout.files.map((f) =>
        carrying?.id === f.entity.id ? null : (
          <FileObject
            key={f.entity.id}
            file={f}
            targeted={target?.kind === "file" && target.id === f.entity.id}
            highlighted={highlightId === f.entity.id}
          />
        ),
      )}
      <Portal targeted={target?.kind === "portal"} />
      <Reactor targeted={target?.kind === "reactor"} />
      <Waypoint />
      <Interaction layout={layout} />
      <Player />
    </>
  );
}

export default function App() {
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: 75, near: 0.1, far: 900, position: SPAWN }}
        gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Suspense fallback={null}>
          <World />
          <Effects />
        </Suspense>
      </Canvas>
      <DataSync />
      <HUD />
      <SearchOverlay />
      <StartScreen />
    </>
  );
}
