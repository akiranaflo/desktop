# Liner для Android

Обёртка вокруг мобильной веб-сборки (`../dist-mobile`) на Capacitor. Веб-часть уже
умеет работать без Electron: API и YouTube идут через локальный сервер, который
раздаёт эту же сборку по `http://<ip-компьютера>:1337`.

## Что нужно

- Node 22+, JDK 21, Android SDK (platform 35, build-tools 35.0.0)
- `ANDROID_HOME` и `JAVA_HOME` в окружении

## Сборка

```powershell
# 1. веб-часть (из корня репозитория)
$env:VITE_API_URL="http://192.168.0.100:1337"
$env:VITE_ALLOW_HTTP_API="1"
$env:VITE_YOUTUBE_PROXY="http://192.168.0.100:1337/yt"
pnpm exec vite build --outDir dist-mobile

# 2. андроид-оболочка
cd mobile
npm install
powershell -File make-android-icons.ps1
npx cap sync android
cd android
.\gradlew.bat assembleRelease
```

APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`, подписан ключом
`mobile/android/app/liner-release.keystore` (в репозиторий не попадает, см. `.gitignore`).
После сборки положить файл в `server/downloads/` — сервер отдаст его по
`http://<ip>:1337/download/<имя>.apk`.

## Что меняется в конфиге

- `mobile/capacitor.config.json`: `allowMixedContent` (запросы к http-серверу в LAN),
  `cleartext` (Android 9+ по умолчанию режет http).
- `android/app/src/main/AndroidManifest.xml`: `usesCleartextTraffic`,
  `hardwareAccelerated`.
- `android/app/build.gradle`: версия 0.2.12 (versionCode 12), release подписывается
  ключом из `signingConfigs.release`.

## Ограничения

Мобильная сборка не умеет то, что живёт в Electron-мосте: импорт локальных файлов,
скачивание треков в папку, обои-видео, Discord Rich Presence, оверлей, системные
медиаклавиши. Плеер использует клиенты ANDROID/IOS без PO-токенов.
