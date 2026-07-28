# Readler design specification

Status: source of truth for the current product and future interface changes.

## Product definition

Readler is a quiet, offline-first reading library for CBZ comics, EPUB books, and PDF documents. It brings together files stored on the device, in browser storage, or in one selected Google Drive folder, then keeps reading progress and bookmarks consistent across the user's devices.

The product should feel private, dependable, and focused. The library helps the user find a title quickly; once reading starts, the interface gets out of the way.

### Design principles

1. **Reading comes first.** Content receives the largest possible canvas and reader controls stay minimal.
2. **Offline is a normal state.** Cached and local items remain useful without connectivity; failures are explained without blocking unrelated reading.
3. **The user's files remain theirs.** Readler never reorganizes or modifies source books. Destructive actions are explicit and scoped.
4. **One mental model across platforms.** Android, iOS, and web share structure and language while using appropriate native capabilities.
5. **Progress is trustworthy.** Position, status, bookmarks, downloads, and synchronization always expose clear states and recover gracefully.

## Information architecture

```text
Launch
├─ First run → Onboarding
│  ├─ Connect Google Drive → Folder picker
│  ├─ Add local files/folder → Library
│  └─ Explore empty library → Library
└─ Returning user → Main tabs
   ├─ Library → Reader
   ├─ Downloads → Reader
   └─ Settings → Sources / sync / account actions

Google Drive folder picker is a modal route.
Reader is a full-screen route above the main tabs.
```

### Navigation rules

- The root route decides between onboarding and the main tabs only after the database and stored settings are ready.
- The main tabs are **Library**, **Downloads**, and **Settings**, in that order.
- Opening a Drive item that is not local first materializes or downloads it, then opens the reader.
- Back always returns to the previous context. Closing the reader must preserve the latest valid position.
- Avoid adding top-level destinations when the task can live naturally inside an existing tab or modal.

## Core screens

### Onboarding

Purpose: explain the value in one glance and get the first source connected.

- Centered Readler mark, short promise, and three vertically stacked actions.
- Primary action: Google Drive. Secondary action: local files or folder, adapted to platform. Tertiary action: enter an empty library.
- Never require Google Drive; local-only use is a complete path.
- A cancelled picker or sign-in returns to the screen without losing control or marking onboarding complete.

### Library

Purpose: scan, filter, and open all known books.

- Search is first, followed by horizontally scrollable filter chips for format, source, reading status, and folder.
- Books appear in an adaptive cover grid. Each card shows cover or format placeholder, title, author or path, progress bar, and percentage.
- Pull to refresh synchronizes sources. Existing local content remains visible while refresh is in progress.
- Empty state includes both Drive and local-source actions. A no-results state caused by filters should offer a clear way to reset filters rather than imply the library is empty.
- Cover art uses a portrait ratio of approximately `0.72`; placeholders use the same footprint to keep the grid stable.

### Downloads

Purpose: make Drive items available offline and manage their lifecycle.

- Each row shows format, title, state, progress when active, and the single most relevant action.
- Supported states are queued, downloading, paused, ready, and error.
- Ready items open directly and can be removed from offline storage without removing the source book or reading state.
- Pausing, resuming, retrying, cancelling, and removing must update visible state immediately or show an in-progress state.

### Settings

Purpose: manage sources, synchronization, Google account access, and app information.

- List sources before add/sync controls; show source type and last successful scan when known.
- Separate routine source actions from destructive Google Drive actions.
- Confirm deletion of synchronized data and revocation of account access. Explain that deleting a source or download does not delete the original book.
- App version and supported formats form a quiet footer, not a primary card.

### Google Drive folder picker

Purpose: authenticate and choose one folder to scan recursively.

- Before authentication, show a single sign-in action and useful configuration errors.
- After authentication, show the account, current folder, child folders, breadcrumb/back navigation, and **Choose this folder** whenever selection is valid.
- Loading a child folder must not discard the current breadcrumb on failure.
- Folder rows use a recognizable folder icon, name, and navigation affordance.

### Reader

Purpose: display the book with no persistent distractions.

- The content canvas is full-screen on a near-black background.
- A tap toggles chrome. Visible chrome contains back, truncated title, bookmark, progress/percentage, previous, and next.
- CBZ additionally exposes left-to-right/right-to-left page direction. EPUB and PDF keep format-specific behavior behind the same controls.
- Reader position is restored on entry, debounced while reading, persisted when the app backgrounds or the route closes, and synchronized opportunistically for Drive items.
- Unavailable or damaged files show a readable error and a reliable back action; never leave the user on a blank canvas.

## Visual system

Readler uses a restrained green system inspired by paper, ink, and library materials. Green communicates primary action, progress, and selection; red is reserved for destructive actions and errors.

### Color tokens

| Role | Light | Dark | Usage |
| --- | --- | --- | --- |
| Background | `#F7FBF7` | `#07130C` | Screen canvas |
| Surface | `#FFFFFF` | `#0E1C13` | Cards, bars, controls |
| Surface variant | `#E8F0E9` | `#1B2A20` | Chips, secondary containers |
| Primary | `#2E7D32` | `#81C784` | Main actions, selected filters, progress |
| Primary pressed | `#1B5E20` | `#A5D6A7` | Pressed primary action |
| Primary container | `#C8E6C9` | `#1B5E20` | Secondary action background |
| Text | `#172019` | `#E3EAE4` | Primary copy |
| Muted text | `#536158` | `#BAC8BD` | Metadata and supporting copy |
| Outline | `#77847A` | `#87958A` | Focus and active borders |
| Outline subtle | `#C5D0C6` | `#3E4D42` | Card and input borders |
| Danger | `#BA1A1A` | `#FFB4AB` | Errors and destructive actions |
| Reader background | `#080B12` | `#080B12` | Distraction-free reader canvas |

All foreground/background pairs must retain WCAG AA contrast for normal text. If a token changes, validate both themes and every state that consumes it.

### Typography

- Use the system sans-serif stack: San Francisco on Apple platforms, Roboto/system UI on Android, and `Spline Sans, Inter, system-ui` on web.
- Default body: 15/21, regular. Button: 15, bold. Section title: 22/28, bold.
- Onboarding display: 38/44, bold. Avoid display sizing elsewhere.
- Book titles use bold body text and at most two lines. Metadata uses muted body text and one line.
- Respect operating-system text scaling. Essential actions and values must not be clipped at 200% text size.

### Shape, spacing, and elevation

- Base spacing unit: 4. Preferred steps: 4, 8, 16, 24, 32, and 64.
- Screen padding: 16–20 on compact layouts; onboarding may use 28.
- Cards: 18 radius, 16 padding, one subtle outline. Do not rely on shadow alone.
- Inputs and buttons: 14 radius and at least 46 high.
- Chips: pill radius, 8 vertical and 14 horizontal padding.
- Reader controls: 12–21 radius on dark translucent surfaces.
- Prefer spacing, outlines, and tonal surfaces over decorative shadows.

### Icons and imagery

- Use a consistent platform-safe icon set with accessibility labels. Do not use text glyphs as final icons because rendering varies by font and encoding.
- The Readler mark is a simple, recognizable `R`/book motif with green as its identifying color.
- Book covers are content, not decoration: crop with `cover`, preserve the card ratio, and provide a format-labeled placeholder when absent.
- Animation should explain a state change, not decorate idle screens. Honor reduced-motion preferences.

## Components and states

Shared primitives belong in `src/components/readler-ui.tsx` or a focused component beside it. Screens compose those primitives rather than redefining visual rules.

Every interactive component must cover:

- default, pressed, focused, disabled, and loading where applicable;
- success, empty, and error outcomes for asynchronous work;
- visible keyboard focus on web;
- an accessibility role, name, state, and minimum 44×44 touch target;
- labels in both English and Spanish.

Buttons use one hierarchy per action group: filled primary, tonal secondary, and danger. Avoid multiple filled primary buttons competing in the same cluster.

Filters are toggle buttons, not navigation. Selected state uses color plus `accessibilityState.selected`; visual selection should also survive grayscale perception through weight, border, or shape.

## Responsive behavior

- **Compact, under 700 px:** two library columns and edge-to-edge screen structure with standard padding.
- **Medium, 700–999 px:** three library columns.
- **Large, 1000–1399 px:** four library columns and a centered content region where practical.
- **Extra large, 1400 px and above:** six library columns; cap text-heavy content to a comfortable reading width.
- Grid items must divide the available row evenly at every breakpoint. Do not retain a compact `50%` maximum width on three-, four-, or six-column layouts.
- On landscape phones and tablets, preserve safe areas and keep reader controls reachable without obscuring the content center.
- On web, all pointer actions must also work by keyboard; hover may enhance but never reveal the only path to an action.

## Accessibility and localization

- Target WCAG 2.2 AA on web and equivalent native platform guidance.
- Keep touch targets at least 44×44 points and do not place destructive controls immediately beside routine actions without separation.
- Announce loading, download progress, sync completion, and errors when those state changes are not otherwise obvious.
- Progress controls expose their current value and support keyboard/assistive adjustment, not pointer position alone.
- Reader controls remain usable with screen readers when visible and are hidden from the accessibility tree when chrome is hidden.
- Never concatenate translated fragments into sentences. Dates and numbers use the active locale.
- English and Spanish are released together; layouts must tolerate Spanish expansion and future right-to-left interface localization even though CBZ page direction is a separate reading preference.

## Privacy, data, and trust

- File contents and library metadata stay local except when the user explicitly accesses Google Drive.
- Drive access is read-only for book content. Readler writes only per-installation progress/bookmark snapshots to the hidden `appDataFolder`.
- Account, source, download, and synchronized-data removal are distinct operations and must be named precisely.
- Never imply that synchronization is a backup of the books themselves.
- Show the last successful scan/sync rather than claiming success while work is pending or has failed.

## Acceptance checklist

A user-facing change is complete when:

- it works in light and dark themes at compact and wide sizes;
- loading, empty, offline, error, disabled, and success states are intentional;
- English and Spanish copy are present and encoding is valid UTF-8;
- touch, keyboard, and screen-reader paths are available as appropriate;
- the change preserves local reading and cached downloads without a network;
- destructive actions explain scope and request confirmation;
- reader progress and bookmarks survive backgrounding and reopening;
- relevant type checks, lint, tests, web export, and native development-build checks pass.
