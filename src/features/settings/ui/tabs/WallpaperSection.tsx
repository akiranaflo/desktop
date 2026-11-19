import { useState } from "react";
import { useTranslation } from "@/languages";
import { Button, Slider } from "@/shared/ui";
import { SettingBlock } from "../controls";
import {
  WALLPAPER_BLUR_MAX,
  WALLPAPER_DIM_MAX,
  useWallpaperStore,
} from "@/features/wallpaper";

export function WallpaperSection({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const url = useWallpaperStore((state) => state.url);
  const kind = useWallpaperStore((state) => state.kind);
  const blur = useWallpaperStore((state) => state.blur);
  const dim = useWallpaperStore((state) => state.dim);
  const setWallpaper = useWallpaperStore((state) => state.setWallpaper);
  const setBlur = useWallpaperStore((state) => state.setBlur);
  const setDim = useWallpaperStore((state) => state.setDim);
  const reset = useWallpaperStore((state) => state.reset);
  const [busy, setBusy] = useState(false);

  const electron = typeof window !== "undefined" ? window.linerElectron : null;
  if (!electron?.pickWallpaper) return null;

  const pick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await electron.pickWallpaper?.();
      if (picked) setWallpaper(picked.url, picked.kind);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    reset();
    await electron.clearWallpaper?.().catch(() => {});
  };

  return (
    <SettingBlock
      title={t("settings.wallpaper.title")}
      description={t("settings.wallpaper.description")}
      titleKey="settings.wallpaper.title"
      descKey="settings.wallpaper.description"
      searchQuery={searchQuery}
    >
      <div className="flex flex-col gap-[14px] pb-[16px] sm:flex-row">
        <div className="relative h-[118px] w-full shrink-0 overflow-hidden rounded-[10px] bg-bg-surface sm:w-[210px]">
          {url ? (
            <>
              {kind === "video" ? (
                <video
                  key={url}
                  src={url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    filter: blur > 0 ? `blur(${blur / 2}px)` : undefined,
                    transform: "scale(1.15)",
                  }}
                />
              ) : (
                <img
                  key={url}
                  src={url}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    filter: blur > 0 ? `blur(${blur / 2}px)` : undefined,
                    transform: "scale(1.15)",
                  }}
                />
              )}
              {dim > 0 ? (
                <div
                  className="absolute inset-0"
                  style={{ backgroundColor: `rgba(0, 0, 0, ${dim})` }}
                />
              ) : null}
            </>
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-[12px] text-center text-caption text-text-tertiary">
              {t("settings.wallpaper.empty")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void pick()}
              disabled={busy}
            >
              {busy
                ? t("settings.wallpaper.picking")
                : url
                  ? t("settings.wallpaper.change")
                  : t("settings.wallpaper.pick")}
            </Button>
            {url ? (
              <Button variant="ghost" size="sm" onClick={() => void clear()}>
                {t("settings.wallpaper.clear")}
              </Button>
            ) : null}
          </div>

          <Slider
            label={t("settings.wallpaper.blur")}
            value={blur}
            min={0}
            max={WALLPAPER_BLUR_MAX}
            step={1}
            unit="px"
            onChange={setBlur}
            disabled={!url}
          />
          <Slider
            label={t("settings.wallpaper.dim")}
            value={Math.round((dim / WALLPAPER_DIM_MAX) * 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            onChange={(value) => setDim((value / 100) * WALLPAPER_DIM_MAX)}
            disabled={!url}
          />
        </div>
      </div>
    </SettingBlock>
  );
}
