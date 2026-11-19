import { resolvePlaybackStream } from "@/features/player/engine/streamResolver";
import type { PlayableTrack } from "@/features/player/engine/playbackStream";
import { downloadAudioBytes } from "@/shared/youtube";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";

const DOWNLOAD_TIMEOUT_MS = 180_000;

export interface DownloadableTrack {
  id: string;
  title: string;
  artists: string;
  durationMs?: number;
}

function toPlayable(track: DownloadableTrack): PlayableTrack {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists,
    durationMs: track.durationMs ?? 0,
  };
}

/**
 * Downloads a track as a standalone audio file into the user's download
 * folder and returns the saved path.
 */
export async function downloadTrackToFolder(
  track: DownloadableTrack,
): Promise<string | null> {
  const bridge = window.linerElectron;
  if (!bridge?.saveDownload) throw new Error("downloads are not available");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const stream = await resolvePlaybackStream(
    toPlayable(track),
    controller.signal,
  );
  try {
    let bytes: Uint8Array | null = null;
    if (stream.blob) {
      bytes = new Uint8Array(await stream.blob.arrayBuffer());
    } else if (stream.completed) {
      bytes = new Uint8Array(await (await stream.completed).arrayBuffer());
    } else {
      bytes = await downloadAudioBytes(stream.url, {
        contentLength: stream.contentLength,
        signal: controller.signal,
      });
    }
    if (!bytes || bytes.byteLength === 0)
      throw new Error("download came back empty");
    if (!isStandaloneAudioFile(bytes.subarray(0, 16)))
      throw new Error("stream is not a standalone audio file");

    return await bridge.saveDownload({
      fileName: `${track.artists} - ${track.title}`,
      // the ipc bridge copies the buffer, the view stays valid
      data: bytes,
      mimeType: stream.mimeType || stream.blob?.type || "audio/webm",
    });
  } finally {
    clearTimeout(timeout);
    stream.release?.();
  }
}
