# Liner local API

Свой сервер вместо `api.tryliner.fun`: аккаунты, лайки, плейлисты, сохранённое,
история прослушиваний и остальные «аккаунтные» ручки, которые дёргает десктоп-клиент.
Каталог, поиск и воспроизведение по-прежнему идут с клиента (YouTube), сервер музыку
не трогает.

## Запуск

```powershell
cd C:\Users\Ильшат\Desktop\кн\desktop
node server\index.mjs
```

Сервер слушает `http://127.0.0.1:1337` (порт из `PORT`, хост из `HOST`).
Данные — `server/data/liner.json`, каталог можно переопределить через `LINER_DATA`.

Быстрый старт: двойной клик по `server\start-server.bat`.
Автозапуск при входе в Windows: положить ярлык на этот .bat в
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.

## Что реализовано

| Группа | Ручки |
|---|---|
| Авторизация | `POST /v1/auth/register`, `/login`, `/refresh`, `/logout`, `GET /v1/auth/username-available` |
| Профиль | `GET /v1/me`, `PATCH /v1/users/me`, `GET /v1/users/:id\|username`, `/followers`, `/following` |
| Лайки | `GET/PUT/DELETE /v1/me/library/tracks[/:id]` |
| Сохранённое | `GET/PUT/DELETE /v1/me/library/{albums,artists,playlists}[/:id]` |
| Плейлисты | `GET/POST /v1/me/playlists`, `GET/PATCH/DELETE /:id`, `POST /:id/tracks[/:trackId]`, `DELETE /:id/items/:itemId`, `POST /:id/items/:itemId/move` |
| История | `GET /v1/me/history`, `POST /v1/me/playback/events` |
| Прочее | `GET /v1/edge/key`, `POST /v1/presence/heartbeat`, пустые `recommendations`, `explore`, `leaderboards` |

Чего нет: текстов песен (`/v1/me/lyrics/*` и `/v1/tracks/:id/lyrics` отвечают 404),
рекомендаций и чартов (пустые списки), капчи и proof-of-work (клиент это переживает,
`/v1/auth/challenge` отдаёт 404).

## Безопасность

Сервер слушает только loopback: снаружи он недоступен. Пароли хранятся как scrypt-хеши,
токены — случайные строки, access живёт час, refresh — 30 дней. HTTPS не нужен, трафик
не покидает машину.

Если понадобится открыть наружу — поставь reverse proxy с TLS и поменяй `HOST`/`PORT`,
но тогда клиент надо собирать с `VITE_API_URL` на https-адрес.

## Телефон (Android и iPhone)

Сервер отдаёт мобильную сборку клиента по адресу `http://<ip-компьютера>:1337`
(порт из `PORT`, `HOST` по умолчанию `0.0.0.0`). Телефон должен быть в той же
Wi-Fi сети; при первом подключении Windows спросит про доступ к сети для `node.exe` —
разрешить.

Сборка для телефона собирается отдельно, с проксированием YouTube через сервер
(в браузере прямой вызов `music.youtube.com` блокируется CORS):

```powershell
$env:VITE_API_URL="http://192.168.0.100:1337"
$env:VITE_ALLOW_HTTP_API="1"
$env:VITE_YOUTUBE_PROXY="http://192.168.0.100:1337/yt"
pnpm exec vite build --outDir dist-mobile
```

Иконки для домашнего экрана: `powershell -File scripts/make-pwa-icons.ps1`.

Установка:

- **Android (Chrome)**: открыть `http://<ip>:1337`, меню ⋮ → «Установить приложение».
- **iPhone (Safari)**: открыть адрес, «Поделиться» → «На экран «Домой»».

Что делает сервер для телефона:

| Ручка | Назначение |
|---|---|
| `GET /` | мобильная сборка (SPA, манифест, service worker) |
| `POST /yt/music/youtubei/v1/*` | InnerTube-запросы (поиск, каталог, плеер) без CORS |
| `GET /yt/www/sw.js_data` | visitorData для InnerTube |
| `GET /yt/media?u=<url>` | аудио с googlevideo same-origin, с range-запросами |

Ограничения мобильной версии: нет локальных файлов, скачивания в папку, обоев-видео,
Discord RPC и оверлея — всё это живёт в Electron-мосте. Плеер использует клиенты
ANDROID/IOS (без PO-токенов), поэтому часть треков может быть недоступна так же,
как и на десктопе без токена.

