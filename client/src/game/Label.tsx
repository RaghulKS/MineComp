import * as THREE from "three";
import { useEffect, useMemo, useState } from "react";
import type { Vec3 } from "../types";

type LabelOpts = {
  color?: string;
  sub?: string;
  subColor?: string;
  fontSize?: number;
  panel?: boolean;
};

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
let fontsReady = false;
if (typeof document !== "undefined" && "fonts" in document) {
  document.fonts.ready.then(() => {
    fontsReady = true;
    cache.clear();
    listeners.forEach((l) => l());
  });
}
const listeners = new Set<() => void>();

export function makeLabelTexture(text: string, opts: LabelOpts = {}) {
  const { color = "#35f2ff", sub, subColor = "rgba(232,236,255,0.75)", fontSize = 60, panel = true } = opts;
  const key = `${text}|${sub ?? ""}|${color}|${fontSize}|${panel}|${fontsReady ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `900 ${fontSize}px Orbitron, "Segoe UI", sans-serif`;
  const subFont = `600 ${Math.round(fontSize * 0.5)}px Rajdhani, "Segoe UI", sans-serif`;
  ctx.font = font;
  const textW = ctx.measureText(text).width;
  ctx.font = subFont;
  const subW = sub ? ctx.measureText(sub).width : 0;
  const padX = fontSize * 0.7;
  const padY = fontSize * 0.35;
  const w = Math.ceil(Math.max(textW, subW) + padX * 2);
  const h = Math.ceil(fontSize * 1.25 + (sub ? fontSize * 0.7 : 0) + padY * 2);
  canvas.width = w;
  canvas.height = h;

  if (panel) {
    ctx.fillStyle = "rgba(5, 7, 20, 0.72)";
    roundRect(ctx, 2, 2, w - 4, h - 4, fontSize * 0.25);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    roundRect(ctx, 2, 2, w - 4, h - 4, fontSize * 0.25);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // accent bar
    ctx.fillStyle = color;
    ctx.fillRect(padX * 0.5, padY + fontSize * 0.2, 6, fontSize * 0.85);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font;
  ctx.shadowColor = color;
  ctx.shadowBlur = fontSize * 0.45;
  ctx.fillStyle = "#f4f7ff";
  const ty = padY + fontSize * 0.62;
  ctx.fillText(text, w / 2, ty);
  ctx.shadowBlur = fontSize * 0.2;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, w / 2, ty);
  ctx.globalAlpha = 1;
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.font = subFont;
    ctx.fillStyle = subColor;
    ctx.fillText(sub, w / 2, ty + fontSize * 0.85);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  const entry = { tex, aspect: w / h };
  cache.set(key, entry);
  return entry;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function Label({
  text,
  sub,
  position,
  color = "#35f2ff",
  scale = 1.6,
  panel = true,
  opacity = 1,
  fontSize,
}: {
  text: string;
  sub?: string;
  position: Vec3;
  color?: string;
  scale?: number;
  panel?: boolean;
  opacity?: number;
  fontSize?: number;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const { tex, aspect } = useMemo(
    () => makeLabelTexture(text, { color, sub, panel, fontSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, sub, color, panel, fontSize, fontsReady],
  );
  return (
    <sprite position={position} scale={[scale * aspect, scale, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} opacity={opacity} />
    </sprite>
  );
}
