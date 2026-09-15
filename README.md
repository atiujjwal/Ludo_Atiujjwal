# Ludo Offline

A local pass-and-play Ludo game for two to four players. It runs as a TanStack Start application and can be installed as a Progressive Web App on supported Android and iOS devices.

## Requirements

- Node.js 20 or newer
- Bun 1.2 or newer (recommended), or npm

## Development

Install dependencies and start the Vite development server:

```sh
bun install --frozen-lockfile
bun run dev
```

With npm, use `npm install` and `npm run dev` instead.

## Quality checks

```sh
bun run test
bunx tsc --noEmit
bun run lint
bun run test:pwa
```

## Production

Build the browser assets and standalone Node server:

```sh
bun run build
bun run start
```

The deployable application is written to `.output`. Its server entry point is `.output/server/index.mjs`; deploy the complete `.output` directory. The server listens on port `3000` by default and accepts the standard `PORT` and `HOST` environment variables.

`bun run preview` starts the same production server locally after a build.

## Progressive Web App

The application manifest, service worker, favicon, and home-screen icons are served from `public`. The generated icons use `public/logo.jpeg` as their source artwork.

`bun run build` also runs `scripts/build-offline.mjs` after Nitro finishes. It renders all five routes, hashes the browser assets and generated HTML, and writes the revisioned `.output/public/sw.js`. A small Nitro runtime plugin serves these post-build files with current metadata. Deploy the **entire** generated `.output`, not the source `public/sw.js` template.

The home and install screens show preparation progress followed by “Ready to play offline”. Readiness requires a complete cache, not merely an active worker. The worker downloads four files at a time, validates content hashes, and stores a completion marker only after every required file succeeds. All five routes, browser chunks, CSS, current JPEG branding, icons and teddy animations are included. System fonts and synthesized sounds need no external downloads; optional sample files are discovered at build time, so absent samples generate no requests.

“Install on your phone” requests browser-managed persistent storage and starts/retries preparation. The final “Install now” action or iOS instructions appear after verification; Android prompting uses that fresh tap. Gameplay never waits for installation, cache completion, or an internet response. Install controls are hidden in standalone mode. Browsers can still deny persistent storage, evict data under pressure, or clear it at the user's request.

Interrupted updates preserve the working revision. A refresh is offered outside play; the worker checks the actual current route in every open window rather than relying on potentially stale SPA URLs. Unknown/unresponsive older windows defer activation until they are closed or refreshed. Older clients retain their lazy-loaded bundles; obsolete revisions are pruned when safe. No update clears game or preference storage.

Builds optimize only generated deployment copies of images and icons before precaching; source artwork and public URLs remain intact. JavaScript, CSS, offline HTML, SVG and the worker also receive Brotli/gzip variants, negotiated by the portable Node server without requiring a proxy. The Nitro plugin serves generated files with correct response metadata. Every precached HTTP response is checked against its expected decoded-content hash during the build.

Game saves retain `ludo:save:v1` and the existing stable-state checkpoint/recovery behavior. Audio preferences and independent royal skin IDs use `ludo:preferences:v1`; app Light/Dark mode retains `ludo:app-theme:v1`. Starting or clearing a game keeps device preferences, while new setup suggestions still default OFF. House rules remain part of each saved game. A nonblocking warning appears if local storage cannot save progress or preferences.

Production browser and mobile profiling checks (build first):

```sh
bunx playwright install chromium
bun run test:pwa
bun run test:performance
```

See [MOBILE_OFFLINE_VERIFICATION.md](./MOBILE_OFFLINE_VERIFICATION.md) for measurements, offline/update coverage, and the manual Android/iOS installation checklist. Browser automation does not certify actual phone installation, audible playback, or lower-end hardware performance.

Service workers and browser installation prompts require a secure context in production. Serve the deployed app over HTTPS, except when testing on `localhost`. Add `?sw=off` to a URL to unregister this application's service worker while troubleshooting.

## Royal appearance

Two-player games always seat the first selected colour top-left and the second bottom-right. A shared, immutable layout maps identities to yard, start, home-lane and finishing geometry; player cards and dice follow the same seats. Three-player, four-player and team layouts retain their default coordinates. Resumed two-player games use this seating too: token progress, colours and save data remain intact, but physical positions and shared-square relationships can change. See [DIAGONAL_SEATING_VERIFICATION.md](./DIAGONAL_SEATING_VERIFICATION.md) for coverage and pending device checks.

Royal is the default and only shipped appearance. `src/lib/ludo/theme.ts` defines independent `BoardTheme`, `TokenSkin`, and `DiceSkin` interfaces and presentation-only defaults. Artwork uses CSS gradients and small original SVG lotus, peacock, paisley and jali details, with system fonts; the reference image is not shipped. No external font, rendering, or animation dependency is needed.

The shared 52-cell track is unchanged. Each private lane contains five cells, followed by an exact-roll step into its centre triangle. Finished full-size counters settle into fixed positions before bonuses or victory resolve. Saves still use `ludo:save:v1` and schema version 1; `homePathVersion: 2` marks the one-time legacy conversion. An unfinished piece on the removed sixth lane cell moves to the fifth, retaining one step to finish. The board includes bounded stacks and unnumbered, 44px-minimum legal-piece controls with individual accessibility labels. Motion is brief and respects reduced-motion preferences.

Setup's **Move suggestions** switch defaults OFF for each new game and shares one saved preference with the board bell and settings switch. OFF hides turn tips, game-guidance toasts, destination/Second Lap previews, extra token controls and the dice invitation pulse. Legal-piece highlighting, direct board selection, turn indicators, movement/capture feedback and required dialogs remain available in both states. ON restores current guidance without replaying muted notices. Resume and rematch retain the preference; older saves use their explicit suggestion value first, otherwise their legacy notification preference, otherwise OFF. Stack rearrangement is instantaneous within its square; only the selected moving counter animates between squares.

Every opponent capture earns another roll. Own pieces, teammates and safe-square occupants cannot be cut. With **Cut Reward** enabled, release or move-six happens before that earned roll; choosing Roll again takes the same roll immediately, without doubling it. With **Three 6s Variant** enabled, a played third six that captures or reaches home earns a roll and starts a fresh six streak. Without that variant, the third six is skipped before movement.

See [ROYAL_VERIFICATION.md](./ROYAL_VERIFICATION.md) for measured build sizes, automated coverage, and device checks still pending.

See [STACKING_GUIDANCE_VERIFICATION.md](./STACKING_GUIDANCE_VERIFICATION.md) for the stable-stack and unified-guidance regression results and pending browser checks.

Capture feedback uses `/crying_teddy.gif`, with `/crying_teddy-still.png` for reduced motion. Each victim's corner displays one temporary overlay for 2.5 seconds after image loading, independent of move suggestions. No crying sound is played or fetched. The teddy assets are revisioned and precached for offline games; the original source assets are retained without duplicate precaching.

The winner dialog includes `/happy_teddy.gif` for both individual and team victories. After five seconds of loaded playback it switches to `/happy_teddy-still.png`; reduced motion uses that static frame immediately. Both assets are precached, and the celebration adds no sound or gameplay actions.

See [HOME_PATH_CAPTURE_VERIFICATION.md](./HOME_PATH_CAPTURE_VERIFICATION.md) for regression results and pending device checks.

## Technology

- TanStack Start and TanStack Router
- React and TypeScript
- Vite and Nitro
- Tailwind CSS
- Vitest
