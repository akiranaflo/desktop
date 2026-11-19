import { app, dialog, shell, BrowserWindow } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const SETTINGS_FILE = "downloads.json";
const DEFAULT_FOLDER_NAME = "Liner";

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
};

function settingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

export function defaultDownloadsFolder(): string {
  return path.join(app.getPath("music"), DEFAULT_FOLDER_NAME);
}

export function downloadsFolder(): string {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), "utf-8")) as {
      folder?: unknown;
    };
    if (typeof raw.folder === "string" && raw.folder.trim()) return raw.folder;
  } catch {
    /* first run */
  }
  return defaultDownloadsFolder();
}

function storeFolder(folder: string): void {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ folder }));
  } catch (error) {
    console.warn("[downloads] could not store the folder:", error);
  }
}

export async function chooseDownloadsFolder(
  owner: BrowserWindow | null,
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Downloads",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: downloadsFolder(),
  };
  const picked = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (picked.canceled || !picked.filePaths[0]) return null;
  storeFolder(picked.filePaths[0]);
  return picked.filePaths[0];
}

export async function openDownloadsFolder(): Promise<string> {
  const folder = downloadsFolder();
  await fsp.mkdir(folder, { recursive: true });
  return shell.openPath(folder);
}

/** windows refuses these characters in file names */
function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 150)
    .trim();
}

export interface DownloadFileInput {
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}

export async function saveDownloadFile(
  input: DownloadFileInput,
): Promise<string | null> {
  if (input.data.byteLength === 0 || input.data.byteLength > MAX_FILE_BYTES)
    return null;
  const folder = downloadsFolder();
  await fsp.mkdir(folder, { recursive: true });

  const ext = EXTENSION_BY_MIME[input.mimeType.toLowerCase()] ?? "webm";
  const base = sanitizeFileName(input.fileName) || "track";
  let target = path.join(folder, `${base}.${ext}`);
  let index = 2;
  while (fs.existsSync(target)) {
    target = path.join(folder, `${base} (${index++}).${ext}`);
  }
  await fsp.writeFile(target, Buffer.from(input.data));
  return target;
}

export function revealDownloadedFile(filePath: string): boolean {
  if (!filePath || !path.isAbsolute(filePath)) return false;
  shell.showItemInFolder(filePath);
  return true;
}
