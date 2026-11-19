#!/usr/bin/env node
/**
 * Liner local API.
 *
 * A self-hosted stand-in for api.tryliner.fun: accounts, likes, playlists,
 * saved collections, playback history and the account endpoints the desktop
 * client calls. The catalog, search and playback stay on the client (YouTube),
 * so this server never touches audio.
 *
 *   node server/index.mjs            # http://127.0.0.1:1337
 *   PORT=3000 node server/index.mjs
 *
 * Data lives in server/data/liner.json (override with LINER_DATA).
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 1337);
const HOST = process.env.HOST ?? "127.0.0.1";
const DATA_DIR = process.env.LINER_DATA ?? path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "liner.json");
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- storage ---

const EMPTY_DB = {
  users: {},
  sessions: {},
  likes: {},
  collections: {},
  playlists: {},
  history: {},
};

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY_DB), ...parsed };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

let db = loadDb();
let saveTimer = null;

function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_PATH);
  } catch (error) {
    console.error("[liner] could not save the database:", error.message);
  }
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 200);
}

process.on("SIGINT", () => {
  saveNow();
  process.exit(0);
});
process.on("SIGTERM", () => {
  saveNow();
  process.exit(0);
});

// ------------------------------------------------------------------ utils ---

const now = () => Date.now();
const randomToken = () => crypto.randomBytes(32).toString("hex");
const iso = (ms = Date.now()) => new Date(ms).toISOString();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored ?? "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected)
  );
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

const bad = (code, message) => new ApiError(400, code, message);
const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "Unauthorized");
const notFound = (what = "Not found") =>
  new ApiError(404, "NOT_FOUND", what);

function json(res, status, payload) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw bad("PAYLOAD_TOO_LARGE", "Payload too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    throw bad("INVALID_JSON", "Body is not valid JSON");
  }
}

// ------------------------------------------------------------------ users ---

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    isPublic: user.isPublic !== false,
    showActivity: user.showActivity !== false,
    showHistory: user.showHistory !== false,
    showLikedTracks: user.showLikedTracks !== false,
    participateLeaderboards: user.participateLeaderboards !== false,
  };
}

function userProfile(user) {
  return {
    ...publicUser(user),
    followersCount: 0,
    followingCount: 0,
    isFollowing: false,
    createdAt: user.createdAt,
  };
}

function userByToken(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const session = db.sessions[token];
  if (!session || session.kind !== "access") return null;
  if (session.expiresAt < now()) {
    delete db.sessions[token];
    save();
    return null;
  }
  return db.users[session.userId] ?? null;
}

function requireUser(req) {
  const user = userByToken(req);
  if (!user) throw unauthorized();
  return user;
}

function issueTokens(user) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  db.sessions[accessToken] = {
    kind: "access",
    userId: user.id,
    expiresAt: now() + ACCESS_TTL_MS,
  };
  db.sessions[refreshToken] = {
    kind: "refresh",
    userId: user.id,
    expiresAt: now() + REFRESH_TTL_MS,
  };
  pruneSessions();
  save();
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: iso(now() + ACCESS_TTL_MS),
    user: publicUser(user),
  };
}

function pruneSessions() {
  const nowMs = now();
  for (const [token, session] of Object.entries(db.sessions)) {
    if (!session || session.expiresAt < nowMs) delete db.sessions[token];
  }
}

function findUserByEmail(email) {
  return Object.values(db.users).find(
    (user) => user.email.toLowerCase() === email.toLowerCase(),
  );
}

function findUserByUsername(username) {
  return Object.values(db.users).find(
    (user) => (user.username ?? "").toLowerCase() === username.toLowerCase(),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

// -------------------------------------------------------------- playlists ---

function playlistView(list, { withCovers = true } = {}) {
  const covers = withCovers
    ? [
        ...new Set(
          list.items
            .map((item) => item.track?.coverUrl ?? item.track?.cover?.url)
            .filter((url) => typeof url === "string" && url.length > 0),
        ),
      ].slice(0, 4)
    : [];
  const owner = db.users[list.ownerId];
  return {
    id: list.id,
    title: list.title,
    description: list.description ?? "",
    isPublic: list.isPublic !== false,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    revision: list.revision ?? 1,
    trackCount: list.items.length,
    coverUrls: covers,
    ownerId: list.ownerId,
    owner: owner
      ? {
          id: owner.id,
          username: owner.username,
          displayName: owner.displayName,
          avatarUrl: owner.avatarUrl ?? null,
        }
      : undefined,
  };
}

function userPlaylists(userId) {
  return Object.values(db.playlists)
    .filter((list) => list.ownerId === userId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function ownPlaylist(user, id) {
  const list = db.playlists[id];
  if (!list || list.ownerId !== user.id) return null;
  return list;
}

function touchList(list) {
  list.updatedAt = iso();
  list.revision = (list.revision ?? 1) + 1;
}

// ----------------------------------------------------------------- routes ---

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? "127.0.0.1"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method ?? "GET";
  const body =
    method === "POST" || method === "PUT" || method === "PATCH"
      ? await readBody(req)
      : {};

  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // the desktop client probes this to decide whether the backend is reachable
  if (url.pathname === "/health" || url.pathname === "/v1/health") {
    return json(res, 200, { status: "ok", uptimeMs: Math.round(process.uptime() * 1000) });
  }

  if (parts[0] !== "v1") throw notFound("Unknown route");

  // ---- auth ---------------------------------------------------------------
  if (parts[1] === "auth") {
    if (parts[2] === "challenge" && method === "POST") {
      // no captcha / proof of work on a private server; the client treats 404
      // as "nothing to solve"
      throw notFound("No human check here");
    }

    if (parts[2] === "username-available" && method === "GET") {
      const username = (url.searchParams.get("username") ?? "")
        .trim()
        .toLowerCase();
      if (!USERNAME_RE.test(username))
        return json(res, 200, { username, valid: false });
      return json(res, 200, {
        username,
        valid: !findUserByUsername(username),
      });
    }

    if (parts[2] === "register" && method === "POST") {
      const email = String(body.email ?? "").trim();
      const password = String(body.password ?? "");
      const username = String(body.username ?? "").trim().toLowerCase();
      const displayName = String(body.displayName ?? "").trim();
      if (!EMAIL_RE.test(email))
        throw bad("INVALID_INPUT", "Enter a valid email address");
      if (password.length < 6)
        throw bad("INVALID_INPUT", "Password is too short");
      if (!USERNAME_RE.test(username))
        throw bad("INVALID_USERNAME", "Username must match [a-z0-9_]{3,30}");
      if (!displayName) throw bad("INVALID_INPUT", "Display name is required");
      if (findUserByEmail(email))
        throw new ApiError(409, "EMAIL_ALREADY_USED", "Email is already used");
      if (findUserByUsername(username))
        throw new ApiError(409, "USERNAME_TAKEN", "Username is already taken");

      const id = crypto.randomUUID();
      const user = {
        id,
        email,
        username,
        displayName,
        password: hashPassword(password),
        createdAt: iso(),
        isPublic: true,
        showActivity: true,
        showHistory: true,
        showLikedTracks: true,
        participateLeaderboards: true,
      };
      db.users[id] = user;
      db.likes[id] = [];
      db.collections[id] = { albums: {}, artists: {}, playlists: {} };
      db.history[id] = [];
      save();
      return json(res, 200, issueTokens(user));
    }

    if (parts[2] === "login" && method === "POST") {
      const email = String(body.email ?? "").trim();
      const password = String(body.password ?? "");
      const user = findUserByEmail(email);
      if (!user || !verifyPassword(password, user.password))
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect",
        );
      return json(res, 200, issueTokens(user));
    }

    if (parts[2] === "refresh" && method === "POST") {
      const token = String(body.refreshToken ?? "");
      const session = db.sessions[token];
      if (!session || session.kind !== "refresh" || session.expiresAt < now())
        throw new ApiError(
          401,
          "INVALID_REFRESH_TOKEN",
          "Refresh token is not valid",
        );
      const user = db.users[session.userId];
      if (!user) throw unauthorized();
      delete db.sessions[token];
      return json(res, 200, issueTokens(user));
    }

    if (parts[2] === "logout" && method === "POST") {
      const header = req.headers.authorization ?? "";
      if (header.startsWith("Bearer ")) delete db.sessions[header.slice(7)];
      const refreshToken = String(body.refreshToken ?? "");
      if (refreshToken) delete db.sessions[refreshToken];
      save();
      res.writeHead(204);
      return res.end();
    }

    throw notFound("Unknown auth route");
  }

  // ---- edge key (client refresh loop) -------------------------------------
  if (parts[1] === "edge" && parts[2] === "key") {
    return json(res, 200, {
      key: crypto.randomBytes(24).toString("base64url"),
      rotatesAt: iso(now() + 60 * 60 * 1000),
    });
  }

  // ---- presence heartbeat -------------------------------------------------
  if (parts[1] === "presence" && parts[2] === "heartbeat") {
    userByToken(req);
    res.writeHead(204);
    return res.end();
  }

  // ---- everything below needs a session -----------------------------------
  const user = requireUser(req);

  // ---- me -----------------------------------------------------------------
  if (parts[1] === "me" && parts.length === 2) {
    return json(res, 200, publicUser(user));
  }

  if (parts[1] === "users" && parts[2] === "me" && method === "PATCH") {
    const patch = body ?? {};
    if (typeof patch.username === "string") {
      const username = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(username))
        throw bad("INVALID_USERNAME", "Username must match [a-z0-9_]{3,30}");
      const taken = findUserByUsername(username);
      if (taken && taken.id !== user.id)
        throw new ApiError(409, "USERNAME_TAKEN", "Username is already taken");
      user.username = username;
    }
    if (patch.displayName !== undefined)
      user.displayName =
        typeof patch.displayName === "string" && patch.displayName.trim()
          ? patch.displayName.trim()
          : user.displayName;
    for (const key of [
      "avatarUrl",
      "bio",
      "isPublic",
      "showActivity",
      "showHistory",
      "showLikedTracks",
      "participateLeaderboards",
    ]) {
      if (patch[key] !== undefined) user[key] = patch[key];
    }
    save();
    return json(res, 200, publicUser(user));
  }

  if (parts[1] === "users" && parts[2] === "search") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (!q) return json(res, 200, []);
    const found = Object.values(db.users)
      .filter(
        (candidate) =>
          (candidate.username ?? "").toLowerCase().includes(q) ||
          (candidate.displayName ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20)
      .map(userProfile);
    return json(res, 200, found);
  }

  if (parts[1] === "users" && parts[2]) {
    const key = decodeURIComponent(parts[2]);
    const found = db.users[key] ?? findUserByUsername(key);
    if (!found) throw notFound("User not found");
    if (parts[3] === "followers" || parts[3] === "following") {
      return json(res, 200, []);
    }
    return json(res, 200, userProfile(found));
  }

  // ---- library: likes -----------------------------------------------------
  if (parts[1] === "me" && parts[2] === "library" && parts[3] === "tracks") {
    const likes = (db.likes[user.id] ??= []);
    const id = parts[4] ? decodeURIComponent(parts[4]) : null;
    if (!id && method === "GET") {
      const limit = Math.max(
        1,
        Math.min(200, Number(url.searchParams.get("limit") ?? 100) || 100),
      );
      const offset = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
      const items = likes.slice(offset, offset + limit);
      const next = offset + limit < likes.length ? String(offset + limit) : null;
      return json(res, 200, { items, nextCursor: next });
    }
    if (id && method === "PUT") {
      const track = body.track ?? body.trackSnapshot;
      if (!track || typeof track !== "object")
        throw bad("INVALID_INPUT", "Track snapshot is required");
      const existing = likes.findIndex((entry) => entry.track?.id === id);
      if (existing >= 0) likes.splice(existing, 1);
      likes.unshift({ track, likedAt: iso() });
      save();
      return json(res, 200, undefined);
    }
    if (id && method === "DELETE") {
      const index = likes.findIndex((entry) => entry.track?.id === id);
      if (index >= 0) likes.splice(index, 1);
      save();
      return json(res, 200, undefined);
    }
    throw notFound("Unknown library route");
  }

  // ---- library: saved collections -----------------------------------------
  if (parts[1] === "me" && parts[2] === "library" && parts[3]) {
    const type = parts[3];
    if (!["albums", "artists", "playlists"].includes(type))
      throw notFound("Unknown collection");
    const store = (db.collections[user.id] ??= {
      albums: {},
      artists: {},
      playlists: {},
    });
    const bucket = (store[type] ??= {});
    const id = parts[4] ? decodeURIComponent(parts[4]) : null;
    if (!id && method === "GET")
      return json(res, 200, { items: Object.values(bucket) });
    if (id && method === "PUT") {
      bucket[id] = body.snapshot ?? { id };
      save();
      return json(res, 200, undefined);
    }
    if (id && method === "DELETE") {
      delete bucket[id];
      save();
      return json(res, 200, undefined);
    }
    throw notFound("Unknown collection route");
  }

  // ---- playlists ----------------------------------------------------------
  if (parts[1] === "me" && parts[2] === "playlists") {
    const id = parts[3] ? decodeURIComponent(parts[3]) : null;

    if (!id) {
      if (method === "GET")
        return json(res, 200, {
          items: userPlaylists(user.id).map((list) => playlistView(list)),
        });
      if (method === "POST") {
        const title = String(body.title ?? "").trim();
        if (!title) throw bad("INVALID_INPUT", "Playlist title is required");
        const listId = crypto.randomUUID();
        const stamp = iso();
        db.playlists[listId] = {
          id: listId,
          ownerId: user.id,
          title,
          description: typeof body.description === "string" ? body.description : "",
          isPublic: body.isPublic !== false,
          createdAt: stamp,
          updatedAt: stamp,
          revision: 1,
          items: [],
        };
        save();
        return json(res, 200, playlistView(db.playlists[listId]));
      }
      throw notFound("Unknown playlists route");
    }

    const list = ownPlaylist(user, id);

    if (parts[4] === "tracks" && method === "POST") {
      if (!list) throw notFound("Playlist not found");
      const trackId = parts[5] ? decodeURIComponent(parts[5]) : null;
      const tracks = trackId
        ? [body.track ?? body.trackSnapshot]
        : Array.isArray(body.tracks)
          ? body.tracks
          : [];
      const added = [];
      for (const track of tracks) {
        if (!track || typeof track !== "object" || !track.id) continue;
        if (list.items.some((item) => item.track?.id === track.id)) continue;
        const item = {
          id: crypto.randomUUID(),
          track,
          position: list.items.length,
          addedAt: iso(),
        };
        list.items.push(item);
        added.push(item);
      }
      touchList(list);
      save();
      return json(
        res,
        200,
        trackId
          ? (added[0] ?? {
              id: crypto.randomUUID(),
              track: body.track ?? body.trackSnapshot,
              position: list.items.length,
              addedAt: iso(),
            })
          : { items: added, added: added.length, rejected: tracks.length - added.length },
      );
    }

    if (parts[4] === "items" && parts[5]) {
      if (!list) throw notFound("Playlist not found");
      const itemId = decodeURIComponent(parts[5]);
      const index = list.items.findIndex((item) => item.id === itemId);
      if (index < 0) throw notFound("Playlist item not found");
      if (method === "DELETE") {
        list.items.splice(index, 1);
        list.items.forEach((item, position) => (item.position = position));
        touchList(list);
        save();
        return json(res, 200, undefined);
      }
      if (parts[6] === "move" && method === "POST") {
        const [moved] = list.items.splice(index, 1);
        const before = body.beforeItemId
          ? list.items.findIndex((item) => item.id === body.beforeItemId)
          : -1;
        list.items.splice(before >= 0 ? before : list.items.length, 0, moved);
        list.items.forEach((item, position) => (item.position = position));
        touchList(list);
        save();
        return json(res, 200, {
          playlist: playlistView(list),
          items: list.items,
        });
      }
      throw notFound("Unknown playlist item route");
    }

    if (method === "GET" && !list) {
      // a playlist that was deleted or belongs to someone else: empty page
      throw notFound("Playlist not found");
    }
    if (method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 0);
      const items = limit > 0 ? list.items.slice(0, limit) : list.items;
      return json(res, 200, {
        playlist: playlistView(list),
        items,
        trackCount: list.items.length,
        durationMs: list.items.reduce(
          (sum, item) => sum + (item.track?.durationMs ?? 0),
          0,
        ),
        partial: limit > 0 && limit < list.items.length,
      });
    }
    if (method === "PATCH" && list) {
      if (typeof body.title === "string" && body.title.trim())
        list.title = body.title.trim();
      if (body.description !== undefined)
        list.description =
          typeof body.description === "string" ? body.description : "";
      if (typeof body.isPublic === "boolean") list.isPublic = body.isPublic;
      touchList(list);
      save();
      return json(res, 200, playlistView(list));
    }
    if (method === "DELETE" && list) {
      delete db.playlists[id];
      save();
      return json(res, 200, undefined);
    }
    throw notFound("Playlist not found");
  }

  // ---- history / playback -------------------------------------------------
  if (parts[1] === "me" && parts[2] === "history" && method === "GET") {
    const history = (db.history[user.id] ??= []);
    const limit = Math.max(
      1,
      Math.min(200, Number(url.searchParams.get("limit") ?? 30) || 30),
    );
    const offset = Math.max(0, Number(url.searchParams.get("cursor") ?? 0) || 0);
    const items = history.slice(offset, offset + limit);
    const next = offset + limit < history.length ? String(offset + limit) : null;
    return json(res, 200, { items, nextCursor: next });
  }

  if (parts[1] === "me" && parts[2] === "playback" && parts[3] === "events") {
    const event = body ?? {};
    if (event.trackSnapshot && typeof event.trackSnapshot === "object") {
      const history = (db.history[user.id] ??= []);
      history.unshift({
        id: crypto.randomUUID(),
        playbackSessionId: event.playbackSessionId ?? "",
        listeningSessionId: event.listeningSessionId ?? "",
        track: event.trackSnapshot,
        playedDurationMs: event.playedDurationMs ?? 0,
        completionRate: event.completionRate ?? 0,
        completed: event.completed === true,
        skipped: event.skipped === true,
        loopCount: event.loopCount ?? 0,
        hasSeekBackward: event.hasSeekBackward === true,
        ...(event.context ? { context: event.context } : {}),
        listenedAt: iso(),
      });
      if (history.length > 1000) history.length = 1000;
      save();
    }
    res.writeHead(204);
    return res.end();
  }

  // ---- recommendations / charts -------------------------------------------
  // A private server has no global users to aggregate, so the charts are built
  // from this account's own history and library.
  if (parts[1] === "me" && parts[2] === "recommendations") {
    return json(res, 200, { items: [], generatedAt: iso() });
  }

  if (parts[1] === "explore") {
    const window = url.searchParams.get("window") ?? "7d";
    const limit = Math.max(
      1,
      Math.min(100, Number(url.searchParams.get("limit") ?? 20) || 20),
    );
    const history = db.history[user.id] ?? [];
    const likes = db.likes[user.id] ?? [];

    if (parts[2] === "popular" && parts[3] === "albums") {
      const albums = new Map();
      for (const entry of history) {
        const album = entry.track?.album;
        if (!album?.title) continue;
        const key = album.id || album.title;
        const current = albums.get(key) ?? {
          id: key,
          title: album.title,
          artist: (entry.track.artists ?? [])
            .map((artist) => artist.name)
            .join(", "),
          artists: entry.track.artists,
          coverUrl: entry.track.cover?.url ?? entry.track.coverUrl ?? null,
          playCount: 0,
          uniqueListeners: 1,
          trackCount: 0,
          score: 0,
        };
        current.playCount += 1;
        current.trackCount += 1;
        current.score += 1;
        albums.set(key, current);
      }
      return json(res, 200, {
        window,
        items: [...albums.values()]
          .sort((a, b) => b.score - a.score)
          .slice(0, limit),
      });
    }

    if (parts[2] === "popular") {
      const tracks = new Map();
      for (const entry of history) {
        const track = entry.track;
        if (!track?.id) continue;
        const current = tracks.get(track.id) ?? {
          track,
          playCount: 0,
          uniqueListeners: 1,
          score: 0,
        };
        current.playCount += 1;
        current.score += entry.completionRate ?? 0.5;
        tracks.set(track.id, current);
      }
      const liked = new Set(likes.map((entry) => entry.track?.id));
      const items = [...tracks.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((entry, index) => ({
          rank: index + 1,
          track: entry.track,
          playCount: entry.playCount,
          uniqueListeners: entry.uniqueListeners,
          score: Math.round(entry.score * 100) / 100,
          viewer: { liked: liked.has(entry.track.id) },
        }));
      return json(res, 200, { window, generatedAt: iso(), items });
    }

    if (parts[2] === "most-saved") {
      const type = url.searchParams.get("type") ?? "all";
      const store = db.collections[user.id] ?? { albums: {}, playlists: {}, artists: {} };
      const entries = [];
      if (type === "all" || type === "album") {
        for (const item of Object.values(store.albums ?? {})) {
          if (!item || typeof item !== "object") continue;
          entries.push({
            type: "album",
            id: String(item.id ?? ""),
            title: String(item.title ?? "Album"),
            subtitle: String(item.artist ?? item.subtitle ?? ""),
            artists: item.artists,
            coverUrl: item.coverUrl ?? null,
            saves: 1,
          });
        }
      }
      if (type === "all" || type === "playlist") {
        for (const item of Object.values(store.playlists ?? {})) {
          if (!item || typeof item !== "object") continue;
          entries.push({
            type: "playlist",
            id: String(item.id ?? ""),
            title: String(item.title ?? "Playlist"),
            subtitle: String(item.subtitle ?? ""),
            coverUrl: item.coverUrl ?? null,
            saves: 1,
          });
        }
      }
      return json(res, 200, { type, items: entries.slice(0, limit) });
    }

    throw notFound("Unknown explore route");
  }

  if (parts[1] === "leaderboards") {
    return json(res, 200, {
      type: parts[2] === "artist" ? "artist" : "global",
      targetId: parts[3] ? decodeURIComponent(parts[3]) : "global",
      period: url.searchParams.get("period") ?? "7d",
      entries: [],
      updatedAt: iso(),
    });
  }

  // ---- lyrics: this server has none ---------------------------------------
  if (parts[1] === "me" && parts[2] === "lyrics") {
    throw new ApiError(404, "LYRICS_NOT_FOUND", "Lyrics are not available");
  }
  if (parts[1] === "tracks" && parts[3] === "lyrics") {
    throw new ApiError(404, "LYRICS_NOT_FOUND", "Lyrics are not available");
  }

  throw notFound("Unknown route");
}

// ------------------------------------------------------------------ server ---

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers":
    "authorization,content-type,x-request-id,x-client-version,x-platform,x-user-id,x-user-name,x-session-id,x-liner-signature,x-liner-timestamp,x-liner-nonce,if-none-match",
  "access-control-expose-headers": "date,etag",
  "access-control-max-age": "600",
};

const server = http.createServer(async (req, res) => {
  for (const [name, value] of Object.entries(CORS_HEADERS))
    res.setHeader(name, value);
  const started = Date.now();
  try {
    await handle(req, res);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
    if (status >= 500)
      console.error(`[liner] ${req.method} ${req.url} ->`, error);
    if (!res.headersSent) {
      json(res, status, {
        code,
        message: error?.message ?? "Something went wrong",
      });
    } else {
      res.end();
    }
  } finally {
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Liner local API on http://${HOST}:${PORT}`);
  console.log(`data: ${DB_PATH}`);
});
