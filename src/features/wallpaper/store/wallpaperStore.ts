import { create } from "zustand";

export type WallpaperKind = "image" | "video";

export interface WallpaperSettings {
  /** liner-local:// URL of the picked file, null when no wallpaper is set */
  url: string | null;
  kind: WallpaperKind;
  /** blur radius in px */
  blur: number;
  /** darkening layer on top, 0..1 */
  dim: number;
}

const STORAGE_KEY = "liner_wallpaper_v1";

const DEFAULTS: WallpaperSettings = {
  url: null,
  kind: "image",
  blur: 20,
  dim: 0.3,
};

export const WALLPAPER_BLUR_MAX = 60;
export const WALLPAPER_DIM_MAX = 0.8;

function read(): WallpaperSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WallpaperSettings>;
    return {
      url: typeof parsed.url === "string" && parsed.url ? parsed.url : null,
      kind: parsed.kind === "video" ? "video" : "image",
      blur:
        typeof parsed.blur === "number"
          ? Math.max(0, Math.min(WALLPAPER_BLUR_MAX, parsed.blur))
          : DEFAULTS.blur,
      dim:
        typeof parsed.dim === "number"
          ? Math.max(0, Math.min(WALLPAPER_DIM_MAX, parsed.dim))
          : DEFAULTS.dim,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(state: WallpaperSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled: the wallpaper just will not survive a restart */
  }
}

interface WallpaperStore extends WallpaperSettings {
  setWallpaper: (url: string | null, kind?: WallpaperKind) => void;
  setBlur: (blur: number) => void;
  setDim: (dim: number) => void;
  reset: () => void;
}

const initial = typeof window === "undefined" ? { ...DEFAULTS } : read();

export const useWallpaperStore = create<WallpaperStore>((set) => ({
  ...initial,
  setWallpaper: (url, kind) =>
    set((state) => ({
      url,
      kind: url ? (kind ?? state.kind) : state.kind,
    })),
  setBlur: (blur) =>
    set({ blur: Math.max(0, Math.min(WALLPAPER_BLUR_MAX, blur)) }),
  setDim: (dim) => set({ dim: Math.max(0, Math.min(WALLPAPER_DIM_MAX, dim)) }),
  reset: () => set({ url: null }),
}));

useWallpaperStore.subscribe((state) => {
  persist({ url: state.url, kind: state.kind, blur: state.blur, dim: state.dim });
});

export const useHasWallpaper = () =>
  useWallpaperStore((state) => Boolean(state.url));
