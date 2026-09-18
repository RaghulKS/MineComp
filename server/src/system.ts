import si from "systeminformation";
import { hostStatsViaPowershell, isWSL } from "./platform.js";
import type { SystemState } from "./types.js";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 10) / 10));

/** Samples every second; on WSL, blends in host numbers from PowerShell when they're fresh. */
export class SystemMonitor {
  private state: SystemState = { cpu: 0, ram: 0, timestamp: Date.now() };
  private host: { cpu: number; ram: number; at: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private hostTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  start(onSample: (s: SystemState) => void) {
    const tick = async () => {
      try {
        const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);
        let cpu = load.currentLoad;
        let ram = ((mem.total - mem.available) / mem.total) * 100;
        if (this.host && Date.now() - this.host.at < 10000) {
          cpu = this.host.cpu;
          ram = this.host.ram;
        }
        this.state = { cpu: clamp(cpu), ram: clamp(ram), timestamp: Date.now() };
        onSample(this.state);
      } catch (e) {
        console.warn("[system] sample failed:", (e as Error).message);
      }
    };
    void tick();
    this.timer = setInterval(tick, 1000);

    if (isWSL) {
      // PowerShell takes ~2-3s per sample; chain calls so they never overlap.
      const hostTick = async () => {
        const h = await hostStatsViaPowershell();
        if (h) this.host = { ...h, at: Date.now() };
        if (!this.stopped) this.hostTimer = setTimeout(hostTick, 1000);
      };
      void hostTick();
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.hostTimer) clearTimeout(this.hostTimer);
  }

  current(): SystemState {
    return this.state;
  }
}
