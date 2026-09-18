import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import chokidar from "chokidar";
import { resolveUserProfile, resolveKnownFolders, openWithDefaultApp, launchApp, isWindows, isWSL, ROOT_NAMES } from "./platform.js";
import { buildRoots, normalizeAndValidatePath, validateExisting, PathError, normKey } from "./paths.js";
import { WorldIndex, entityId } from "./scan.js";
import { SystemMonitor } from "./system.js";
import type { WorldEntity } from "./types.js";

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  const userProfile = await resolveUserProfile();
  const roots = buildRoots(await resolveKnownFolders(userProfile));
  const index = new WorldIndex(roots);
  const monitor = new SystemMonitor();

  console.log(`[minecomp] platform=${isWindows ? "windows" : isWSL ? "wsl" : process.platform} profile=${userProfile}`);
  for (const n of ROOT_NAMES) console.log(`[minecomp] root ${n} -> ${roots[n]} ${fs.existsSync(roots[n]) ? "" : "(MISSING)"}`);

  await index.rescan();
  console.log(`[minecomp] indexed ${index.count} entities in ${index.lastScanMs}ms`);

  const app = express();
  app.use(cors({ origin: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] }));
  app.use(express.json({ limit: "64kb" }));

  const fail = (res: Response, status: number, error: string) => res.status(status).json({ ok: false, error });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      platform: isWindows ? "windows" : isWSL ? "wsl" : process.platform,
      roots,
      entityCount: index.count,
      lastScanAt: index.lastScanAt,
      lastScanMs: index.lastScanMs,
      clients: wss.clients.size,
    });
  });

  app.get("/api/world", async (req, res) => {
    if (req.query.refresh !== undefined || Date.now() - index.lastScanAt > 15_000) await index.rescan();
    res.json({ entities: index.current() });
  });

  app.get("/api/system", (_req, res) => {
    res.json(monitor.current());
  });

  app.get("/api/search", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    if (!q.trim()) return res.json([]);
    res.json(index.search(q));
  });

  app.post("/api/open", async (req, res) => {
    const v = await validateExisting(req.body?.path, roots);
    await openWithDefaultApp(v.path);
    res.json({ ok: true, path: v.path });
  });

  app.post("/api/app/open", async (req, res) => {
    const appName = req.body?.app;
    if (appName !== "chrome" && appName !== "vscode") return fail(res, 400, 'app must be "chrome" or "vscode"');
    try {
      const launched = await launchApp(appName, userProfile);
      res.json({ ok: true, app: appName, launched });
    } catch (e) {
      fail(res, 500, `could not launch ${appName}: ${(e as Error).message}`);
    }
  });

  app.post("/api/move", async (req, res) => {
    const src = await validateExisting(req.body?.sourcePath, roots);
    const dst = await validateExisting(req.body?.destinationDirectory, roots);
    if (!dst.stat.isDirectory()) return fail(res, 400, "destinationDirectory is not a directory");
    if (src.stat.isSymbolicLink()) return fail(res, 400, "refusing to move a link");
    for (const n of ROOT_NAMES) if (normKey(src.path) === normKey(roots[n])) return fail(res, 400, `cannot move the ${n} root itself`);
    if (normKey(dst.path) === normKey(path.dirname(src.path))) return fail(res, 400, "already in that folder");
    if (src.stat.isDirectory() && (normKey(dst.path) + path.sep).startsWith(normKey(src.path) + path.sep)) {
      return fail(res, 400, "cannot move a folder into itself");
    }

    // Overwrite protection: pick a free name rather than clobbering.
    const ext = path.extname(src.path);
    const base = path.basename(src.path, ext);
    let target = path.join(dst.path, path.basename(src.path));
    for (let i = 1; fs.existsSync(target); i++) target = path.join(dst.path, `${base} (${i})${ext}`);

    await fs.promises.rename(src.path, target);
    const st = await fs.promises.stat(target);
    const entity: WorldEntity = {
      id: entityId(target),
      kind: st.isDirectory() ? "folder" : "file",
      name: path.basename(target),
      path: target,
      extension: st.isDirectory() ? undefined : ext.replace(/^\./, "").toLowerCase() || undefined,
      parentPath: normKey(dst.path) === normKey(roots[dst.root]) ? null : dst.path,
      root: dst.root,
      size: st.isDirectory() ? undefined : st.size,
      modifiedAt: st.mtimeMs,
    };
    scheduleRescan(200);
    res.json({ ok: true, previousPath: src.path, newPath: target, entity, renamed: path.basename(target) !== path.basename(src.path) });
  });

  app.use((_req, res) => fail(res, 404, "not found"));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof PathError) return fail(res, err.status, err.message);
    const msg = err instanceof Error ? err.message : String(err);
    if (/JSON/i.test(msg)) return fail(res, 400, "invalid JSON body");
    console.error("[minecomp] error:", msg);
    fail(res, 500, msg);
  });

  // ---- HTTP + WebSocket ----
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  const broadcast = (msg: unknown) => {
    const data = JSON.stringify(msg);
    for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
  };
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "hello", data: { entityCount: index.count } }));
    ws.send(JSON.stringify({ type: "system_state", data: monitor.current() }));
    ws.on("error", () => {});
  });

  monitor.start((s) => broadcast({ type: "system_state", data: s }));

  // ---- Filesystem watch (allowed roots only) ----
  let rescanTimer: NodeJS.Timeout | null = null;
  const scheduleRescan = (delay = 600) => {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(async () => {
      rescanTimer = null;
      await index.rescan();
      broadcast({ type: "filesystem_changed", data: { entityCount: index.count, timestamp: Date.now() } });
    }, delay);
  };
  const watchDirs = ROOT_NAMES.map((n) => roots[n]).filter((d) => fs.existsSync(d));
  const watcher = chokidar.watch(watchDirs, {
    depth: 2,
    ignoreInitial: true,
    persistent: true,
    usePolling: isWSL, // inotify does not fire across the WSL/NTFS boundary
    interval: 1500,
    binaryInterval: 3000,
    ignored: (p: string) => /[\\/](node_modules|\.git|\$RECYCLE\.BIN)([\\/]|$)/i.test(p) || /[\\/]\.[^\\/]+$/.test(p),
  });
  watcher.on("all", (ev, p) => {
    if (ev === "change") return; // content edits don't reshape the world; add/unlink/addDir/unlinkDir do
    scheduleRescan();
  });
  watcher.on("error", (e) => console.warn("[minecomp:watch] error:", (e as Error).message));

  server.listen(PORT, () => console.log(`[minecomp] http://localhost:${PORT}  ws://localhost:${PORT}/ws`));

  const shutdown = () => {
    monitor.stop();
    void watcher.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[minecomp] fatal:", e);
  process.exit(1);
});
