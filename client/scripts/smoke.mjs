// Headless smoke test: loads the game, captures console errors, screenshots key viewpoints,
// and exercises search + carry/drop in demo mode.
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.URL ?? "http://localhost:5173/";
const OUT = "scripts/out";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1600,900", "--no-sandbox"],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => {
  const t = m.type();
  const txt = m.text();
  if ((t === "error" || t === "warning") && !txt.includes("8787") && !txt.includes("ERR_CONNECTION_REFUSED") && !txt.includes("Failed to load resource"))
    errors.push(`[${t}] ${txt}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

// screenshots can catch a cleared WebGL buffer between slow swiftshader frames; keep the largest of a few tries
const snap = async (name) => {
  let best = null;
  for (let i = 0; i < 4; i++) {
    const buf = await page.screenshot();
    if (!best || buf.length > best.length) best = buf;
    if (buf.length > 60000) break;
    await wait(500);
  }
  fs.writeFileSync(`${OUT}/${name}.png`, best);
  return best.length;
};

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await wait(3500);
await snap("01-start");

const btn = await page.$(".enter-btn");
if (btn) await btn.click();
await wait(1200);

const view = async (x, z, yaw, pitch) => {
  await page.evaluate(
    (x, z, yaw, pitch) => {
      window.__worldos.teleport(x, z);
      window.__worldos.look(yaw, pitch);
      window.__worldos.lock(true);
    },
    x,
    z,
    yaw,
    pitch,
  );
};
const lookAt = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
const shot = async (name, x, z, yaw, pitch) => {
  await view(x, z, yaw, pitch);
  await wait(1200);
  const size = await snap(name);
  console.log("SHOT", name, size);
};

await shot("02-spawn", 0, 34, 0, -0.04);
await shot("03-plaza", 12, 12, lookAt(12, 12, 0, 0), -0.12);
await shot("04-portal", -30, -62, lookAt(-30, -62, -40, -84), 0.1);
await shot("05-reactor", 30, -62, lookAt(30, -62, 40, -84), 0.15);
await shot("06-library", -70, -14, lookAt(-70, -14, -96, -22), 0.0);
await shot("07-docks", 70, -14, lookAt(70, -14, 96, -22), 0.0);

const world = await page.evaluate(() => {
  const s = window.__worldos.store.getState();
  const l = window.__worldos.bridge.layout;
  return { count: s.entities.length, source: s.source, buildings: l.buildings.length, files: l.files.length };
});
console.log("WORLD", JSON.stringify(world));

// ---- carry / drop flow ----
const file = await page.evaluate(() => {
  const l = window.__worldos.bridge.layout;
  const f = l.files.find((x) => x.district === "Desktop") ?? l.files[0];
  return { id: f.entity.id, name: f.entity.name, parentPath: f.entity.parentPath, pos: f.position, rot: f.rotation };
});
// stand 3.2m in front of the file (toward plaza center) and look at it
{
  const dx = file.pos[0], dz = file.pos[2];
  const len = Math.hypot(dx, dz) || 1;
  const sx = dx - (dx / len) * 3.2, sz = dz - (dz / len) * 3.2;
  await view(sx, sz, lookAt(sx, sz, dx, dz), -0.12);
}
await wait(1500);
const target = await page.evaluate(() => window.__worldos.store.getState().target);
console.log("TARGET", JSON.stringify(target));
await snap("08-aim-file");
if (target && target.kind === "file") {
  await page.keyboard.press("KeyF");
  await wait(900);
  const carrying = await page.evaluate(() => window.__worldos.store.getState().carrying?.name);
  console.log("CARRYING", carrying);
  await snap("09-carrying");
  const folder = await page.evaluate((parentPath) => {
    const l = window.__worldos.bridge.layout;
    const b = l.buildings.find((x) => !x.nested && x.entity.path !== parentPath && x.district === "Desktop") ?? l.buildings.find((x) => x.entity.path !== parentPath);
    return { id: b.entity.id, name: b.entity.name, path: b.entity.path, pos: b.position, size: b.size, rot: b.rotation };
  }, file.parentPath);
  // stand in front of the building's door (local +Z rotated by rot), 6m out
  {
    const fx = Math.sin(folder.rot), fz = Math.cos(folder.rot);
    const dist = folder.size[2] / 2 + 6;
    const sx = folder.pos[0] + fx * dist, sz = folder.pos[2] + fz * dist;
    await view(sx, sz, lookAt(sx, sz, folder.pos[0], folder.pos[2]), 0.05);
  }
  await wait(1500);
  const drop = await page.evaluate(() => window.__worldos.store.getState().dropTarget);
  console.log("DROP", JSON.stringify(drop));
  await snap("10-drop-prompt");
  if (drop) {
    await page.keyboard.press("KeyF");
    await wait(700);
    await snap("11-flight");
    await wait(1500);
    const after = await page.evaluate((id) => {
      const s = window.__worldos.store.getState();
      const e = s.entities.find((x) => x.id === id);
      return { carrying: s.carrying, newParent: e?.parentPath, newPath: e?.path, toasts: s.toasts.map((t) => t.text) };
    }, file.id);
    console.log("AFTER", JSON.stringify(after));
  }
}

// ---- search / waypoint ----
await page.keyboard.press("Slash");
await wait(600);
await page.keyboard.type("pdf");
await wait(600);
await snap("12-search");
await page.keyboard.press("Enter");
await wait(800);
const wp = await page.evaluate(() => window.__worldos.store.getState().waypoint);
console.log("WAYPOINT", JSON.stringify(wp));
if (wp) {
  const [tx, , tz] = wp.position;
  await view(tx + 16, tz + 16, lookAt(tx + 16, tz + 16, tx, tz), 0.12);
  await wait(1500);
  await snap("13-waypoint");
}

console.log("ERRORS", errors.length);
for (const e of errors.slice(0, 30)) console.log("  ", e.slice(0, 400));
await browser.close();
