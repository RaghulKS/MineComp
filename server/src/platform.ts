// Platform bridge: the server may run natively on Windows, or inside WSL and
// reach the Windows host through /mnt/c + cmd.exe. Everything OS-specific lives here.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RootName } from "./types.js";

const execFileP = promisify(execFile);

export const isWindows = process.platform === "win32";
export const isWSL =
  !isWindows &&
  process.platform === "linux" &&
  (() => {
    try {
      return /microsoft/i.test(fs.readFileSync("/proc/version", "utf8"));
    } catch {
      return false;
    }
  })();

export const ROOT_NAMES: RootName[] = ["Desktop", "Documents", "Downloads"];

/** Absolute, native (to this process) path of the Windows user profile. */
export async function resolveUserProfile(): Promise<string> {
  if (isWindows) return process.env.USERPROFILE ?? os.homedir();
  if (isWSL) {
    try {
      const { stdout } = await execFileP("cmd.exe", ["/c", "echo %USERPROFILE%"], { cwd: "/mnt/c" });
      const win = stdout.trim();
      if (/^[A-Za-z]:\\/.test(win)) return toNativePath(win);
    } catch {
      /* fall through */
    }
    const guess = `/mnt/c/Users/${os.userInfo().username}`;
    if (fs.existsSync(guess)) return guess;
  }
  return os.homedir();
}

/** Windows path (C:\x\y) -> path this process can open. Identity on Windows. */
export function toNativePath(p: string): string {
  if (isWindows || !isWSL) return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return p;
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

/** Native path -> path Windows tools understand. Identity on Windows. */
export function toWindowsPath(p: string): string {
  if (isWindows || !isWSL) return p;
  const m = /^\/mnt\/([a-z])\/(.*)$/.exec(p);
  if (!m) return p;
  return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
}

function cmdExe(): string {
  return isWindows ? (process.env.ComSpec ?? "cmd.exe") : "cmd.exe";
}

function runDetached(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(cmd, args, { cwd, detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", reject);
      child.unref();
      // give spawn a tick to surface ENOENT
      setTimeout(resolve, 150);
    } catch (e) {
      reject(e);
    }
  });
}

/** Open a file/folder with its Windows default application. */
export async function openWithDefaultApp(nativePath: string): Promise<void> {
  const winPath = toWindowsPath(nativePath);
  if (isWindows) {
    // explorer.exe handles files (default app) and folders alike, and never blocks.
    await runDetached("explorer.exe", [winPath]);
    return;
  }
  if (isWSL) {
    // cwd must be a Windows-visible dir, or cmd complains about UNC paths.
    await runDetached(cmdExe(), ["/c", "start", "", winPath], "/mnt/c");
    return;
  }
  await runDetached("xdg-open", [nativePath]);
}

const CHROME_CANDIDATES_WIN = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const VSCODE_CANDIDATES_WIN = (profile: string) => [
  `${profile}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`,
  "C:\\Program Files\\Microsoft VS Code\\Code.exe",
  "C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe",
];

export type AppName = "chrome" | "vscode";

export async function launchApp(app: AppName, userProfileNative: string): Promise<string> {
  const profileWin = toWindowsPath(userProfileNative);
  const candidates = app === "chrome" ? CHROME_CANDIDATES_WIN : VSCODE_CANDIDATES_WIN(profileWin);
  const extraArgs = app === "chrome" ? ["--new-window", "https://www.google.com"] : [toWindowsPath(userProfileNative)];

  for (const exeWin of candidates) {
    const exeNative = toNativePath(exeWin);
    if (fs.existsSync(exeNative)) {
      if (isWindows || isWSL) {
        await runDetached(exeNative, extraArgs, isWSL ? "/mnt/c" : undefined);
        return exeWin;
      }
    }
  }
  // Fall back to Windows' own resolution (App Paths / PATH).
  if (isWindows || isWSL) {
    const startTarget = app === "chrome" ? "chrome" : "code";
    await runDetached(cmdExe(), ["/c", "start", "", startTarget, ...extraArgs], isWSL ? "/mnt/c" : undefined);
    return `start ${startTarget}`;
  }
  const bin = app === "chrome" ? "google-chrome" : "code";
  await runDetached(bin, extraArgs);
  return bin;
}

/** Host CPU/RAM via PowerShell (WSL only, since systeminformation would report the VM). */
export async function hostStatsViaPowershell(): Promise<{ cpu: number; ram: number } | null> {
  if (!isWSL) return null;
  try {
    const script =
      "$c=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average;" +
      "$o=Get-CimInstance Win32_OperatingSystem;" +
      "$r=($o.TotalVisibleMemorySize-$o.FreePhysicalMemory)/$o.TotalVisibleMemorySize*100;" +
      "Write-Output \"$c $r\"";
    const { stdout } = await execFileP(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { cwd: "/mnt/c", timeout: 8000 },
    );
    const [c, r] = stdout.trim().split(/\s+/).map((v) => Number(v.replace(",", ".")));
    if (!Number.isFinite(c) || !Number.isFinite(r)) return null;
    return { cpu: c, ram: r };
  } catch {
    return null;
  }
}

/**
 * Windows "known folders" can be redirected (OneDrive moves Desktop/Documents under
 * %USERPROFILE%\\OneDrive). Ask Windows where they really are; fall back to the plain layout.
 */
export async function resolveKnownFolders(userProfileNative: string): Promise<Record<RootName, string>> {
  const fallback: Record<RootName, string> = {
    Desktop: path.join(userProfileNative, "Desktop"),
    Documents: path.join(userProfileNative, "Documents"),
    Downloads: path.join(userProfileNative, "Downloads"),
  };
  if (!isWindows && !isWSL) return fallback;
  try {
    const script =
      "$d=[Environment]::GetFolderPath('Desktop');" +
      "$m=[Environment]::GetFolderPath('MyDocuments');" +
      "$k=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}';" +
      "$k=[Environment]::ExpandEnvironmentVariables($k);" +
      "Write-Output $d; Write-Output $m; Write-Output $k";
    const { stdout } = await execFileP(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { cwd: isWSL ? "/mnt/c" : undefined, timeout: 15000 },
    );
    const [d, m, k] = stdout.split(/\r?\n/).map((l) => l.trim());
    const pick = (win: string | undefined, fb: string) => {
      if (!win || !/^[A-Za-z]:\\/.test(win)) return fb;
      const nat = toNativePath(win);
      return fs.existsSync(nat) ? nat : fb;
    };
    return { Desktop: pick(d, fallback.Desktop), Documents: pick(m, fallback.Documents), Downloads: pick(k, fallback.Downloads) };
  } catch (e) {
    console.warn("[platform] known-folder lookup failed, using plain layout:", (e as Error).message);
    return fallback;
  }
}
