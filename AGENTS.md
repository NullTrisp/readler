# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Readler project guide

Readler is an offline-first Expo application for Android, iOS, and the web. It reads CBZ, EPUB, and PDF files from local storage or a user-selected Google Drive folder. Read `README.md` for setup and architecture, and treat `DESIGN.md` as the product and interface source of truth.

## Runtime and tooling

- Keep the application on Expo SDK 57 unless an upgrade is explicitly requested. SDK 57 targets React Native 0.86, React 19.2.3, and React Native Web 0.21.0, and requires Node.js 22.13 or newer.
- Use `npx expo install` when adding Expo or React Native packages so versions remain compatible with SDK 57.
- Native development requires an Expo development build. Do not assume Expo Go can load the PDF, ZIP, or Google Sign-In native modules.
- Preserve the static web export and the cross-origin isolation headers required by SQLite WASM.

## Architecture boundaries

- Keep format-independent contracts in `src/domain`, SQLite and repositories in `src/data`, platform integrations in `src/services`, reader adapters in `src/readers`, shared UI in `src/components`, and routes in `src/app`.
- Keep native and web implementations behind matching `.tsx`/`.web.tsx` or `.ts`/`.web.ts` interfaces. A platform fix must not silently break the other targets.
- Route database access through `src/data/repository.ts`. Schema changes must be forward-only migrations and must preserve existing libraries, progress, bookmarks, downloads, and settings.
- Google Drive book content is read-only. Never upload, modify, or delete a user's books. Only reading-state snapshots may be written to `appDataFolder`, and deletion of those snapshots must remain an explicit user action.
- Preserve offline-first behavior: local reading and cached Drive downloads must continue to work without a network connection. Synchronization failures must not block reading or corrupt local state.
- Keep CBZ, EPUB, and PDF implementations behind the shared reader contract in `src/readers/types.ts`.

## Product and UI rules

- Follow `DESIGN.md` for information architecture, visual tokens, responsive behavior, interaction states, and accessibility.
- Support both light and dark system themes. Use the shared tokens and primitives in `src/components/readler-ui.tsx` instead of introducing one-off colors or duplicate components.
- Put user-facing copy in `src/i18n/index.ts` and update both English and Spanish translations together.
- Respect safe areas, touch targets, dynamic content, screen readers, and reduced-motion preferences. Do not rely on color or icon glyphs alone to communicate state.
- Preserve reading position frequently and on background/exit. Reader chrome may disappear, but navigation, progress, bookmarking, and recovery from unavailable files must remain discoverable.

## Verification

- Add or update focused tests for behavior changes. Keep platform-specific behavior testable through shared pure utilities where practical.
- Before handing off a change, run the checks relevant to it; for a broad change run `npm run typecheck`, `npm run lint`, and `npm test`.
- Run `npm run doctor` after dependency, native configuration, or Expo plugin changes.
- For web changes, verify `npm run web:export`. For native integration changes, state which Android/iOS development build was exercised.
