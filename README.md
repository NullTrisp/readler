# Readler

Readler is an offline-first reader for Android, iOS, and the web. It opens CBZ, EPUB, and PDF libraries in one exclusive mode at a time: local files or a selected Google Drive folder. Switching modes keeps the inactive library intact, and reading progress and bookmarks for Drive files synchronize privately through the Google Drive `appDataFolder`.

## Requirements

- Node.js 22 or newer
- Expo SDK 57
- Android API 24+ and iOS 16.4+ (the native minimums required by Expo SDK 57 / React Native 0.86)
- An Expo development build for Android/iOS; Expo Go cannot load the PDF, ZIP, or Google Sign-In native modules
- A browser with IndexedDB, Web Workers, and WebAssembly for web reading

## Local development

```bash
npm install
npx expo prebuild --clean
npx expo run:android
# or: npx expo run:ios
```

Web development and production export:

```bash
npm run web
npm run web:export
```

The production files are written to `dist`. The hosting service must return the `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` headers included in `public/_headers`; these are required by SQLite WASM.

Copy `.env.example` to `.env.local` and add the OAuth client IDs before testing Google Drive. Local files work without Google configuration.

Quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run doctor
```

## Architecture

- `src/domain`: format-independent library, locator, bookmark, download, and sync contracts.
- `src/data`: versioned SQLite schema and repository functions.
- `src/services`: native and web local/Drive sources, persistent downloads, and per-device Drive synchronization.
- `src/readers`: native and web adapters for CBZ, EPUB, and PDF behind one reader interface.
- `src/app`: Expo Router onboarding, tabs, Drive browser, and full-screen reader.

Drive content is read-only. Readler never uploads, edits, or deletes books. It only writes `state-<installationId>.json` snapshots to the hidden application-data space and can delete those snapshots from Settings.

See [Google Drive setup](docs/GOOGLE_DRIVE_SETUP.md) and the [privacy checklist](docs/PRIVACY.md) before publishing.


## TODO
[] Real notifications for downloads
[] Fix Android OAuth flow
[] Test in IOS env
