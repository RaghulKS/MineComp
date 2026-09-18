import { useStore } from "../store";
import type { SystemStats, Target, WorldEntity } from "../types";
import Toasts from "./Toasts";

type PromptInfo = {
  key?: string;
  main: string;
  sub?: string;
  distance?: number;
};

function buildPrompt(
  carrying: WorldEntity | null,
  dropTarget: { id: string; name: string; path: string } | null,
  target: Target | null,
  system: SystemStats,
): PromptInfo | null {
  if (carrying) {
    if (dropTarget) {
      return { key: "F", main: `DROP INTO ${dropTarget.name}`, distance: target?.distance };
    }
    return { key: "F", main: "RELEASE", sub: "carry to a folder building", distance: target?.distance };
  }

  if (!target) return null;

  switch (target.kind) {
    case "file":
      return { key: "E", main: `OPEN ${target.name}`, sub: "[F] CARRY", distance: target.distance };
    case "folder":
      return { key: "E", main: `OPEN FOLDER ${target.name}`, distance: target.distance };
    case "portal":
      return { key: "E", main: "OPEN CHROME", sub: "web gate", distance: target.distance };
    case "reactor":
      return {
        main: "SYSTEM REACTOR",
        sub: `CPU ${Math.round(system.cpu)}% • RAM ${Math.round(system.ram)}%`,
        distance: target.distance,
      };
    default:
      return null;
  }
}

export default function HUD() {
  const started = useStore((s) => s.started);
  const locked = useStore((s) => s.locked);
  const source = useStore((s) => s.source);
  const wsConnected = useStore((s) => s.wsConnected);
  const system = useStore((s) => s.system);
  const target = useStore((s) => s.target);
  const carrying = useStore((s) => s.carrying);
  const dropTarget = useStore((s) => s.dropTarget);
  const waypoint = useStore((s) => s.waypoint);
  const reactorNear = useStore((s) => s.reactorNear);
  const player = useStore((s) => s.player);

  if (!started) return null;

  const prompt = buildPrompt(carrying, dropTarget, target, system);
  const waypointDistance = waypoint
    ? Math.round(Math.hypot(player.x - waypoint.position[0], player.z - waypoint.position[2]))
    : 0;
  const ramGb =
    system.ramUsedGb !== undefined && system.ramTotalGb !== undefined
      ? `${system.ramUsedGb.toFixed(1)} / ${system.ramTotalGb.toFixed(1)} GB`
      : undefined;

  return (
    <div className="hud">
      <div className="brand">
        <div className="brand-title">WORLDOS</div>
        <div className="brand-sub">LIVE PC // PLAYABLE</div>
      </div>

      <div className="status">
        <div className="status-row">
          <span className={`status-dot ${source === "live" ? "online" : "demo"}`} />
          <span className="status-text">{source === "live" ? "FILES ONLINE" : "DEMO DATA"}</span>
          {wsConnected && <span className="ws-dot" title="Live updates connected" />}
        </div>
        <div className="status-row">
          <span className="status-label">CPU</span>
          <span className="meter">
            <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, system.cpu))}%` }} />
          </span>
          <span className="status-pct">{Math.round(system.cpu)}%</span>
        </div>
        <div className="status-row">
          <span className="status-label">RAM</span>
          <span className="meter">
            <span className="meter-fill" style={{ width: `${Math.min(100, Math.max(0, system.ram))}%` }} />
          </span>
          <span className="status-pct">{Math.round(system.ram)}%</span>
        </div>
      </div>

      {locked && (
        <div className={`crosshair${target ? " active" : ""}`}>
          <span className="cb cb-top" />
          <span className="cb cb-bottom" />
          <span className="cb cb-left" />
          <span className="cb cb-right" />
          <span className="cb-dot" />
        </div>
      )}

      {prompt && (
        <div className="prompt fade-in">
          <div className="prompt-body">
            <div className="prompt-main">
              {prompt.key && <span className="key">{prompt.key}</span>}
              <span>{prompt.main}</span>
            </div>
            {prompt.sub && <div className="prompt-sub">{prompt.sub}</div>}
          </div>
          {prompt.distance !== undefined && (
            <div className="prompt-dist">{prompt.distance.toFixed(1)}m</div>
          )}
        </div>
      )}

      {carrying && (
        <div className="carry fade-in">
          <div className="carry-title">CARRYING</div>
          <div className="carry-name">{carrying.name}</div>
          <div className="carry-hint">F NEAR FOLDER TO DROP</div>
        </div>
      )}

      {waypoint && (
        <div className="waypoint fade-in">
          <span>WAYPOINT</span>
          <span className="waypoint-chevron">→</span>
          <span>{waypoint.name}</span>
          <span className="waypoint-dist">• {waypointDistance}m</span>
        </div>
      )}

      {reactorNear && (
        <div className="reactor-readout fade-in">
          <div className="reactor-title">SYSTEM REACTOR // {system.live ? "LIVE" : "SIMULATED"}</div>
          <div className="reactor-grid">
            <div className="reactor-stat">
              <span className="reactor-label">CPU</span>
              <span className="reactor-value">{Math.round(system.cpu)}%</span>
            </div>
            <div className="reactor-stat">
              <span className="reactor-label">RAM</span>
              <span className="reactor-value">{Math.round(system.ram)}%</span>
              {ramGb && <span className="reactor-sub">{ramGb}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="controls">
        <span className="key">WASD</span> MOVE <span className="sep">•</span>{" "}
        <span className="key">SHIFT</span> SPRINT <span className="sep">•</span>{" "}
        <span className="key">E</span> INTERACT <span className="sep">•</span>{" "}
        <span className="key">F</span> CARRY <span className="sep">•</span>{" "}
        <span className="key">/</span> SEARCH
      </div>

      <Toasts />
    </div>
  );
}
