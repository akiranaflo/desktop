/**
 * Guest (no-account) mode.
 *
 * The upstream client keeps the library, playlists, likes and history on
 * api.tryliner.fun behind a bearer token. This module serves those endpoints
 * from localStorage instead, so the app runs without sign-in. Anything the
 * client can already fetch on its own (catalog, search, radio, playback)
 * never reaches this file.
 */
import { getAuthSession } from "./auth-session";
import type {
  ApiTrack,
  AuthUser,
  LikedTracksPage,
  UserPlaylist,
  UserPlaylistItem,
} from "@/shared/contracts";

export const GUEST_USER_ID = "local-guest";

export const GUEST_USER: AuthUser = {
  id: GUEST_USER_ID,
  username: "guest",
  displayName: "Guest",
  avatarUrl: null,
  bio: null,
  isPublic: false,
  showActivity: false,
  showHistory: false,
  showLikedTracks: false,
  participateLeaderboards: false,
};

const LIKES_KEY = "liner_guest_likes_v1";
const COLLECTIONS_KEY = "liner_guest_collections_v1";
const PLAYLISTS_KEY = "liner_guest_playlists_v1";

type LikeEntry = { track: ApiTrack; likedAt: string };
type LikesState = Record<string, LikeEntry>;
type CollectionType = "albums" | "artists" | "playlists";
type CollectionsState = Record<CollectionType, Record<string, unknown>>;
type LocalPlaylist = { playlist: UserPlaylist; items: UserPlaylistItem[] };
type PlaylistsState = Record<string, LocalPlaylist>;

export function isGuestSession(): boolean {
  return getAuthSession() === null;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled: guest state is best-effort */
  }
}

function readLikes(): LikesState {
  return read<LikesState>(LIKES_KEY, {});
}

function readCollections(): CollectionsState {
  return read<CollectionsState>(COLLECTIONS_KEY, {
    albums: {},
    artists: {},
    playlists: {},
  });
}

function readPlaylists(): PlaylistsState {
  return read<PlaylistsState>(PLAYLISTS_KEY, {});
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function parseBody(body: BodyInit | null | undefined): any {
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function likedPage(query: URLSearchParams): LikedTracksPage {
  const limit = Number(query.get("limit") ?? 100) || 100;
  const offset = Number(query.get("cursor") ?? 0) || 0;
  const all = Object.values(readLikes()).sort((a, b) =>
    a.likedAt < b.likedAt ? 1 : -1,
  );
  const slice = all.slice(offset, offset + limit);
  const next = offset + limit < all.length ? String(offset + limit) : null;
  return { items: slice, nextCursor: next };
}

function emptyPlaylist(id: string, title = "Playlist"): UserPlaylist {
  const stamp = nowIso();
  return {
    id,
    title,
    description: "",
    isPublic: false,
    createdAt: stamp,
    updatedAt: stamp,
    revision: 1,
    trackCount: 0,
    ownerId: GUEST_USER_ID,
    owner: {
      id: GUEST_USER_ID,
      username: GUEST_USER.username,
      displayName: GUEST_USER.displayName,
      avatarUrl: null,
    },
  };
}

function createLocalPlaylist(input: any): UserPlaylist {
  const state = readPlaylists();
  const id = newId();
  const playlist = emptyPlaylist(id, String(input?.title ?? "Playlist"));
  playlist.description =
    typeof input?.description === "string" ? input.description : "";
  playlist.isPublic = input?.isPublic === true;
  state[id] = { playlist, items: [] };
  write(PLAYLISTS_KEY, state);
  return playlist;
}

function touch(entry: LocalPlaylist): UserPlaylist {
  const stamps = entry.playlist;
  stamps.updatedAt = nowIso();
  stamps.revision += 1;
  stamps.trackCount = entry.items.length;
  return stamps;
}

function addItem(entry: LocalPlaylist, track: ApiTrack | undefined): UserPlaylistItem {
  const item: UserPlaylistItem = {
    id: newId(),
    track: track as ApiTrack,
    position: entry.items.length,
    addedAt: nowIso(),
  };
  entry.items.push(item);
  return item;
}

/**
 * Returns a guest answer for a server-side endpoint, or null when the request
 * should go to the network as usual.
 */
export function resolveGuestRequest(
  path: string,
  init?: RequestInit,
): { value: unknown } | null {
  if (!isGuestSession()) return null;

  const queryAt = path.indexOf("?");
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  const query = new URLSearchParams(queryAt === -1 ? "" : path.slice(queryAt + 1));
  const method = (init?.method ?? "GET").toUpperCase();
  const body = parseBody(init?.body);
  const seg = pathname.split("/").filter(Boolean);

  if (seg[0] !== "v1") return null;

  // /v1/me and /v1/me/...
  if (seg[1] === "me") {
    // profile
    if (seg.length === 2) return { value: GUEST_USER };

    // likes
    if (seg[2] === "library" && seg[3] === "tracks") {
      const id = seg[4] ? decodeURIComponent(seg[4]) : null;
      if (!id && method === "GET") return { value: likedPage(query) };
      if (id) {
        const likes = readLikes();
        if (method === "PUT") {
          const track = body?.track ?? body?.trackSnapshot;
          if (track) {
            likes[id] = { track, likedAt: nowIso() };
            write(LIKES_KEY, likes);
          }
          return { value: undefined };
        }
        if (method === "DELETE") {
          delete likes[id];
          write(LIKES_KEY, likes);
          return { value: undefined };
        }
      }
      return { value: undefined };
    }

    // saved collections
    if (seg[2] === "library" && seg[3]) {
      const type = seg[3] as CollectionType;
      if (!["albums", "artists", "playlists"].includes(type)) return null;
      const collections = readCollections();
      const bucket = collections[type] ?? (collections[type] = {});
      const id = seg[4] ? decodeURIComponent(seg[4]) : null;
      if (!id && method === "GET") {
        return { value: { items: Object.values(bucket) } };
      }
      if (id) {
        if (method === "PUT") {
          bucket[id] = body?.snapshot ?? { id };
          write(COLLECTIONS_KEY, collections);
          return { value: undefined };
        }
        if (method === "DELETE") {
          delete bucket[id];
          write(COLLECTIONS_KEY, collections);
          return { value: undefined };
        }
      }
      return { value: undefined };
    }

    // playlists
    if (seg[2] === "playlists") {
      const state = readPlaylists();
      const id = seg[3] ? decodeURIComponent(seg[3]) : null;

      if (!id) {
        if (method === "GET") {
          const items = Object.values(state)
            .map((entry) => entry.playlist)
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
          return { value: { items } };
        }
        if (method === "POST") {
          return { value: createLocalPlaylist(body) };
        }
        return null;
      }

      let entry = state[id];

      // POST /v1/me/playlists/:id/tracks[/:trackId]
      if (seg[4] === "tracks") {
        if (!entry) {
          entry = { playlist: emptyPlaylist(id), items: [] };
          state[id] = entry;
        }
        if (method === "POST" && seg[5]) {
          const item = addItem(entry, body?.track ?? body?.trackSnapshot);
          touch(entry);
          write(PLAYLISTS_KEY, state);
          return { value: item };
        }
        if (method === "POST") {
          const tracks: ApiTrack[] = Array.isArray(body?.tracks) ? body.tracks : [];
          const items = tracks.map((track) => addItem(entry!, track));
          touch(entry);
          write(PLAYLISTS_KEY, state);
          return { value: { items, added: items.length, rejected: 0 } };
        }
        return { value: undefined };
      }

      // /v1/me/playlists/:id/items/:itemId[/move]
      if (seg[4] === "items") {
        if (!entry) return { value: undefined };
        const itemId = seg[5] ? decodeURIComponent(seg[5]) : null;
        if (!itemId) return { value: undefined };
        if (method === "DELETE") {
          entry.items = entry.items.filter((item) => item.id !== itemId);
          entry.items.forEach((item, index) => (item.position = index));
          touch(entry);
          write(PLAYLISTS_KEY, state);
          return { value: undefined };
        }
        if (method === "POST" && seg[6] === "move") {
          const index = entry.items.findIndex((item) => item.id === itemId);
          if (index >= 0) {
            const [moved] = entry.items.splice(index, 1);
            const before = body?.beforeItemId
              ? entry.items.findIndex((item) => item.id === body.beforeItemId)
              : -1;
            const target = before >= 0 ? before : entry.items.length;
            entry.items.splice(target, 0, moved);
            entry.items.forEach((item, i) => (item.position = i));
            touch(entry);
            write(PLAYLISTS_KEY, state);
          }
          return { value: { playlist: entry.playlist, items: entry.items } };
        }
        return { value: undefined };
      }

      if (method === "GET") {
        if (!entry) {
          entry = { playlist: emptyPlaylist(id), items: [] };
          state[id] = entry;
          write(PLAYLISTS_KEY, state);
        }
        return {
          value: {
            playlist: entry.playlist,
            items: entry.items,
            trackCount: entry.items.length,
            durationMs: entry.items.reduce(
              (sum, item) => sum + (item.track?.durationMs || 0),
              0,
            ),
            partial: false,
          },
        };
      }
      if (method === "PATCH") {
        if (!entry) {
          entry = { playlist: emptyPlaylist(id), items: [] };
          state[id] = entry;
        }
        if (typeof body?.title === "string") entry.playlist.title = body.title;
        if (body?.description !== undefined) {
          entry.playlist.description =
            typeof body.description === "string" ? body.description : "";
        }
        if (typeof body?.isPublic === "boolean") {
          entry.playlist.isPublic = body.isPublic;
        }
        touch(entry);
        write(PLAYLISTS_KEY, state);
        return { value: entry.playlist };
      }
      if (method === "DELETE") {
        delete state[id];
        write(PLAYLISTS_KEY, state);
        return { value: undefined };
      }
      return { value: undefined };
    }

    // history / mixes / playback / lyrics: nothing to store locally
    if (seg[2] === "history") return { value: { items: [], nextCursor: null } };
    if (seg[2] === "recommendations") {
      return { value: { items: [], generatedAt: nowIso() } };
    }
    if (seg[2] === "playback") return { value: undefined };
    if (seg[2] === "lyrics") return { value: null };
    return null;
  }

  // public counters and charts are server-side only
  if (seg[1] === "explore") {
    if (seg[2] === "popular" && seg[3] === "albums") {
      return {
        value: { window: query.get("window") ?? "7d", items: [] },
      };
    }
    if (seg[2] === "popular") {
      return {
        value: {
          window: query.get("window") ?? "7d",
          generatedAt: nowIso(),
          items: [],
        },
      };
    }
    if (seg[2] === "most-saved") {
      return { value: { type: query.get("type") ?? "all", items: [] } };
    }
    return { value: { items: [] } };
  }

  return null;
}
