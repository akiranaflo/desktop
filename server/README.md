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
