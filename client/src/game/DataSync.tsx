import { useEffect, useRef } from "react";
import { connectWorldSocket, FALLBACK_WORLD, fetchSystem, fetchWorld, normalizeSystem, normalizeWorld } from "../api";
import { useStore } from "../store";

export default function DataSync() {
  const simT = useRef(0);
  useEffect(() => {
    let alive = true;
    const s = () => useStore.getState();
    let announcedLive = false;
    let announcedDemo = false;

    const loadWorld = async () => {
      try {
        const entities = await fetchWorld();
        if (!alive) return;
        if (entities.length > 0) {
          if (s().source !== "live" || !announcedLive) {
            announcedLive = true;
            s().toast(`LIVE FILESYSTEM CONNECTED • ${entities.length} ENTITIES`, "success");
          }
          s().setEntities(entities, "live");
          return;
        }
        throw new Error("empty world");
      } catch {
        if (!alive) return;
        if (s().entities.length === 0) {
          s().setEntities(FALLBACK_WORLD, "demo");
        }
        if (s().source === "demo" && !announcedDemo) {
          announcedDemo = true;
          s().toast("SERVER OFFLINE • DEMO WORLD LOADED • RETRYING", "warn");
        }
      }
    };

    const loadSystem = async () => {
      try {
        const sys = await fetchSystem();
        if (!alive) return;
        s().setSystem(sys);
      } catch {
        if (!alive) return;
        // simulated telemetry so the reactor still breathes
        simT.current += 1;
        const t = simT.current;
        const cpu = 22 + Math.sin(t * 0.35) * 14 + Math.sin(t * 1.7) * 6 + (Math.sin(t * 5.3) > 0.8 ? 25 : 0);
        const ram = 48 + Math.sin(t * 0.12) * 8;
        s().setSystem({
          cpu: Math.round(Math.max(3, Math.min(97, cpu))),
          ram: Math.round(ram),
          ramUsedGb: (ram / 100) * 32,
          ramTotalGb: 32,
          live: false,
        });
      }
    };

    void loadWorld();
    void loadSystem();
    const worldTimer = setInterval(loadWorld, 8000);
    const sysTimer = setInterval(loadSystem, 2000);

    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(loadWorld, 400);
    };

    const disconnect = connectWorldSocket({
      onOpen: () => s().setWsConnected(true),
      onClose: () => s().setWsConnected(false),
      onMessage: (msg) => {
        if (!msg || typeof msg !== "object") return;
        const m = msg as Record<string, unknown>;
        const type = String(m.type ?? m.event ?? m.kind ?? "").toLowerCase();
        const payload = m.data ?? m.payload ?? m;
        if (type.includes("system") || type.includes("stats") || type.includes("metrics")) {
          s().setSystem(normalizeSystem(payload));
          return;
        }
        if (type.includes("world") || type.includes("entities") || type.includes("snapshot")) {
          const entities = normalizeWorld(payload);
          if (entities.length) s().setEntities(entities, "live");
          return;
        }
        if (
          type.includes("change") ||
          type.includes("fs") ||
          type.includes("file") ||
          type.includes("add") ||
          type.includes("remov") ||
          type.includes("unlink") ||
          type.includes("rename") ||
          type.includes("update") ||
          type.includes("move")
        ) {
          scheduleRefetch();
          return;
        }
        // unknown message shape: if it looks like a world array, use it
        const guess = normalizeWorld(payload);
        if (guess.length > 3) s().setEntities(guess, "live");
      },
    });

    return () => {
      alive = false;
      clearInterval(worldTimer);
      clearInterval(sysTimer);
      if (refetchTimer) clearTimeout(refetchTimer);
      disconnect();
    };
  }, []);
  return null;
}
