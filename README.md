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

The application manifest, service worker, favicon, and home-screen icons are served from `public`. The generated icons use `public/logo.png` as their source artwork.

`bun run build` also runs `scripts/build-offline.mjs` after Nitro finishes. It renders all five routes, hashes the browser assets and generated HTML, and writes the revisioned `.output/public/sw.js`. A small Nitro runtime plugin serves these post-build files with current metadata. Deploy the **entire** generated `.output`, not the source `public/sw.js` template.

The home and install screens show “Preparing offline play” followed by “Ready to play offline”. Preparation is independent of browser installation and never blocks starting a game. All playable routes are cached, so first visits to setup, game, rules, and settings work offline once preparation completes. Interrupted updates preserve the working cache. A refresh is offered outside play, and activation is deferred while any game tab is open. Browsers can still evict offline data under storage pressure.

Service workers and browser installation prompts require a secure context in production. Serve the deployed app over HTTPS, except when testing on `localhost`. Add `?sw=off` to a URL to unregister this application's service worker while troubleshooting.

## Royal appearance

Royal is the default and only shipped appearance. `src/lib/ludo/theme.ts` defines independent `BoardTheme`, `TokenSkin`, and `DiceSkin` interfaces and presentation-only defaults. Artwork uses CSS gradients and small original SVG lotus, peacock, paisley and jali details, with system fonts; the reference image is not shipped. No external font, rendering, or animation dependency is needed.

Board coordinates are unchanged. Saves still use `ludo:save:v1`. The board includes bounded stacks and unnumbered, 44px-minimum legal-piece controls with individual accessibility labels. Motion is brief, pauses when hidden, and respects reduced-motion preferences.

Setup's **Move suggestions** switch defaults OFF for each new game and shares one saved preference with the board bell and settings switch. OFF hides turn tips, game-guidance toasts, destination/Second Lap previews, selectable-piece glow, extra pawn controls and the dice invitation pulse. Direct legal board selection, turn indicators, movement feedback and required dialogs remain available. ON restores current guidance without replaying muted notices. Resume and rematch retain the preference; older saves use their explicit suggestion value first, otherwise their legacy notification preference, otherwise OFF. Stack rearrangement is instantaneous within its square; only the selected moving pawn animates between squares.

Every opponent capture earns another roll. Own pieces, teammates and safe-square occupants cannot be cut. With **Cut Reward** enabled, release or move-six happens before that earned roll; choosing Roll again takes the same roll immediately, without doubling it. With **Three 6s Variant** enabled, a played third six that captures or reaches home earns a roll and starts a fresh six streak. Without that variant, the third six is skipped before movement.

See [ROYAL_VERIFICATION.md](./ROYAL_VERIFICATION.md) for measured build sizes, automated coverage, and device checks still pending.

See [STACKING_GUIDANCE_VERIFICATION.md](./STACKING_GUIDANCE_VERIFICATION.md) for the stable-stack and unified-guidance regression results and pending browser checks.

## Technology

- TanStack Start and TanStack Router
- React and TypeScript
- Vite and Nitro
- Tailwind CSS
- Vitest
