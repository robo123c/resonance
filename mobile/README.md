# Resonance Mobile

Resonance Mobile is a native Expo client for a self-hosted Resonance music server. It is designed for portrait use, secure bearer-token sessions, and Android 10 or newer.

## What it includes

The client validates a server address before storing it, signs in through the existing `/api/auth/login` and `/api/auth/guest` endpoints, stores the token in the Android Keystore via Expo SecureStore, and sends it as a bearer token for authenticated API and protected audio-stream requests. It provides a Home dashboard, filterable Library, debounced Search, Settings, and a persistent native player with a mini-player and a Now Playing sheet.

## Android support

The build configuration sets `minSdkVersion` to **29** for Android 10, targets both `armeabi-v7a` and `arm64-v8a`, and enables cleartext traffic only so a user may deliberately connect to a trusted LAN HTTP server. The app does not scan device music folders or translate Storage Access Framework URIs into filesystem paths, avoiding scoped-storage breakage on Android 10.

## Local development

Install dependencies with `pnpm install`, then run `pnpm dev`. Use `pnpm test`, `pnpm check`, and `pnpm lint` before creating a native build. The app requires a reachable Resonance server with the API routes present in the main repository.

> Audio streaming uses the same `Authorization: Bearer <token>` protocol accepted by Resonance’s backend. This means protected playback works from the native player rather than depending on a browser cookie.
