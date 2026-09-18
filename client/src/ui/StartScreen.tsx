import type { MouseEvent } from "react";
import { useStore } from "../store";
import { bridge } from "../game/bridge";

export default function StartScreen() {
  const started = useStore((s) => s.started);
  const locked = useStore((s) => s.locked);
  const searchOpen = useStore((s) => s.searchOpen);
  const source = useStore((s) => s.source);

  if (locked || searchOpen) return null;

  const footer = (
    <div className={`start-footer ${source === "live" ? "live" : "demo"}`}>
      {source === "live" ? "CONNECTED TO LIVE PC" : "DEMO WORLD — SERVER OFFLINE, RETRYING"}
    </div>
  );

  if (!started) {
    const enterWorld = () => {
      useStore.getState().setStarted(true);
      bridge.requestLock();
    };
    const onButtonClick = (e: MouseEvent) => {
      e.stopPropagation();
      enterWorld();
    };

    return (
      <div className="start fade-in" onClick={enterWorld}>
        <div className="start-inner">
          <div className="start-title">WORLDOS</div>
          <div className="start-tagline">Your computer is now a world.</div>
          <button className="enter-btn" onClick={onButtonClick}>
            [ ENTER WORLD ]
          </button>
          <div className="start-meta">
            LIVE FILESYSTEM<span className="dot-sep">•</span>LIVE APPLICATIONS<span className="dot-sep">•</span>
            LIVE SYSTEM STATE
          </div>
        </div>
        {footer}
      </div>
    );
  }

  const resume = () => bridge.requestLock();
  const onResumeClick = (e: MouseEvent) => {
    e.stopPropagation();
    resume();
  };

  return (
    <div className="start paused fade-in" onClick={resume}>
      <div className="start-inner">
        <div className="start-title">WORLDOS</div>
        <button className="enter-btn" onClick={onResumeClick}>
          [ RESUME ]
        </button>
        <div className="start-resume-hint">PRESS ESC TO RELEASE THE MOUSE • CLICK TO RESUME</div>
      </div>
      {footer}
    </div>
  );
}
