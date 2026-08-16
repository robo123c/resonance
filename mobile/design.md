# Resonance Mobile Interface Design

## Product intent

Resonance Mobile is a portrait-first companion for a self-hosted Resonance music library. It prioritizes quick connection to a private server, one-handed browsing, and dependable playback controls rather than attempting to expose filesystem-management workflows on the device. Android 10 is the minimum support target, so the client treats the server as the media authority and does not depend on deprecated device-path access.

## Screen list

| Screen | Primary content and functionality |
|---|---|
| Server setup | A short explanation, validated HTTP(S) server URL field, and a connection action with clear reachability feedback. The URL is stored in the device secure store only after a successful API response. |
| Sign in | Username and password fields, sign-in action, guest access when enabled by the server, and server-change action. |
| Home | Recently played tracks, compact library counts, and quick links to search and the full library. Content is fetched from the connected server; empty, loading, and failed states are distinct. |
| Library | Virtualized, one-column track list with title, artist, album, duration, play affordance, and pull-to-refresh. A compact query field filters server results. |
| Search | Debounced full-library search with grouped track, artist, and album results. A search result can start playback or navigate back to the library context. |
| Now playing | Full-height sheet with artwork fallback, title, artist, scrubber, elapsed/duration labels, play/pause, previous/next controls, and queue context. |
| Settings | Connected server summary, data refresh control, server switch, signed-in user, sign out, and Android support information. |

## Key user flows

The first-use flow is: **open app → enter server URL → validate `/api/health` or server reachability → sign in or continue as guest → Home**. The app shows a recoverable error instead of persisting an unreachable address.

The primary listening flow is: **Home or Library → tap a track → player source resolves from the configured server → Now Playing updates → user pauses, seeks, or advances through the queue**. Each primary control has an explicit pressed state and disabled state when no track is playable.

The recovery flow is: **connection or authentication failure → contextual error message → Settings or server setup → correct URL/sign in → refresh library**. The signed-out state never retains the previous token in memory or secure storage.

## Layout and interaction

All screens use 9:16 portrait layouts and keep primary touch targets at least 44 points high. The main tab bar is bottom-aligned for one-handed reach: Home, Library, Search, and Settings. Persistent playback uses a compact mini-player immediately above the tab bar; opening it presents the Now Playing screen. Long track metadata truncates to two lines rather than compressing adjacent controls.

Lists use `FlatList` with stable IDs and intentionally avoid nested scrolling. Screens use safe-area-aware containers. Primary actions use scale-to-0.97 press feedback; secondary rows use opacity feedback. Subtle haptics are reserved for play/pause and successful connection.

## Color choices

The visual system uses a night-listening palette that feels distinct from the web client while preserving Resonance’s energetic green accent.

| Token | Light mode | Dark mode | Role |
|---|---|---|---|
| Primary | `#147D61` | `#5DE1B5` | Playback and connection actions |
| Background | `#F5F7F6` | `#0B1210` | Main app canvas |
| Surface | `#FFFFFF` | `#14211D` | Cards, mini-player, list sections |
| Foreground | `#13211C` | `#ECF8F2` | Headings and essential metadata |
| Muted | `#64736C` | `#A3B5AC` | Supporting metadata |
| Border | `#D9E4DE` | `#294238` | Dividers and field boundaries |
| Success | `#167A4A` | `#64D89B` | Connected state |
| Warning | `#9A5A00` | `#FFC96B` | Recoverable connectivity state |
| Error | `#B83945` | `#FF8995` | Authentication and request failures |

## Android 10 compatibility design

The app sets `minSdkVersion` to 29, includes both `armeabi-v7a` and `arm64-v8a` ABI builds, and avoids Android 11+ storage permission APIs. The initial release consumes remote Resonance streams over user-configured HTTP(S), with explicit cleartext support documented for trusted LAN servers. It does not scan device storage or translate Storage Access Framework URIs into filesystem paths; this avoids scoped-storage failures on Android 10.
