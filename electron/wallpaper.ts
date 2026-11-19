import { app, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export type WallpaperKind = "image" | "video";

export interface WallpaperState {
  url: string;
  kind: WallpaperKind;
  name: string;
}

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
] as const;

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mkv", ".mov", ".m4v"] as const;

const IMAGE_EXT = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXT = new Set<string>(VIDEO_EXTENSIONS);

const FILE_PREFIX = "background";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
};

export function wallpaperMimeType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function wallpaperDir(): string {
  return path.join(app.getPath("userData"), "wallpaper");
}

/**
 * Resolves a wallpaper file name coming from a liner-local://wallpaper/<name>
 * request. Only names inside the wallpaper directory are accepted.
 */
export function resolveWallpaperFile(name: string): string | null {
  const base = wallpaperDir();
  const safe = path.basename(name);
  if (!safe || safe !== name) return null;
  const target = path.join(base, safe);
  return target.startsWith(base + path.sep) ? target : null;
}

function currentFileName(): string | null {
  try {
    const file = fs
      .readdirSync(wallpaperDir())
      .find((entry) => entry.startsWith(`${FILE_PREFIX}.`));
    return file ?? null;
  } catch {
    return null;
  }
}

export function currentWallpaper(): WallpaperState | null {
  const name = currentFileName();
  if (!name) return null;
  const filePath = path.join(wallpaperDir(), name);
  let version = 0;
  try {
    version = Math.round(fs.statSync(filePath).mtimeMs);
  } catch {
    return null;
  }
  const ext = path.extname(name).toLowerCase();
  return {
    // the version keeps the <img>/<video> from serving a stale file after a
    // wallpaper with the same extension replaces the previous one
    url: `liner-local://wallpaper/${encodeURIComponent(name)}?v=${version}`,
    kind: VIDEO_EXT.has(ext) ? "video" : "image",
    name,
  };
}

export function clearWallpaper(): void {
  const dir = wallpaperDir();
  try {
    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { force: true, recursive: true });
    }
  } catch {
    /* nothing stored yet */
  }
}

export async function pickWallpaper(
  owner: BrowserWindow | null,
): Promise<WallpaperState | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Wallpaper",
    properties: ["openFile"],
    filters: [
      {
        name: "Images & videos",
        extensions: [
          ...IMAGE_EXTENSIONS.map((ext) => ext.slice(1)),
          ...VIDEO_EXTENSIONS.map((ext) => ext.slice(1)),
        ],
      },
      { name: "Images", extensions: IMAGE_EXTENSIONS.map((ext) => ext.slice(1)) },
      { name: "Videos", extensions: VIDEO_EXTENSIONS.map((ext) => ext.slice(1)) },
    ],
  };
  const picked = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (picked.canceled || !picked.filePaths[0]) return null;

  const source = picked.filePaths[0];
  const ext = path.extname(source).toLowerCase();
  if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) return null;

  clearWallpaper();
  await fsp.mkdir(wallpaperDir(), { recursive: true });
  await fsp.copyFile(source, path.join(wallpaperDir(), `${FILE_PREFIX}${ext}`));
  return currentWallpaper();
}
