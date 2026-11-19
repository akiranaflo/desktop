import { memo } from "react";
import { useWallpaperStore } from "../store/wallpaperStore";

/**
 * Full-window wallpaper layer: a still image, a GIF or a looping video behind
 * the app content. Blur and dim come from the wallpaper settings.
 */
function WallpaperLayerComponent() {
  const url = useWallpaperStore((state) => state.url);
  const kind = useWallpaperStore((state) => state.kind);
  const blur = useWallpaperStore((state) => state.blur);
  const dim = useWallpaperStore((state) => state.dim);

  if (!url) return null;

  const mediaStyle = {
    filter: blur > 0 ? `blur(${blur}px)` : undefined,
    // scaled up so the blurred edge never shows inside the window
    transform: `scale(${1 + Math.min(blur, 60) / 80})`,
  } as const;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
      aria-hidden="true"
    >
      {kind === "video" ? (
        <video
          key={url}
          src={url}
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          className="absolute inset-0 h-full w-full object-cover"
          style={mediaStyle}
        />
      ) : (
        <img
          key={url}
          src={url}
          alt=""
          draggable={false}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={mediaStyle}
          onError={() => useWallpaperStore.getState().reset()}
        />
      )}
      {dim > 0 ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `rgba(0, 0, 0, ${dim})` }}
        />
      ) : null}
    </div>
  );
}

export const WallpaperLayer = memo(WallpaperLayerComponent);
export default WallpaperLayer;
