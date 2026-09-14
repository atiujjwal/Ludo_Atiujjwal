# Royal Indian Ludo — implementation and verification

Verified on 12 September 2026, Windows x64, using the existing Bun lockfile.

## Delivered

- Royal defaults throughout the app: charcoal, ivory, antique brass, enamel player colors, original lotus/peacock/paisley SVG ornament, marble-like track and fabric-like courtyards. No reference bitmap or remote fonts are downloaded.
- Independent typed board, token and dice presentation interfaces; no appearance fields in saved games.
- Memoized static artwork, transform-positioned metallic pawns, bounded stacks, authoritative destination previews, legal Second Lap alternatives, individually labeled minimum-44px move controls.
- Square, width-first phone board; player panels above/below on small screens and beside the board on desktop. Short screens can scroll. Safe-area padding, reduced motion and hidden-page animation pausing are implemented.
- Brief capture/home/turn/victory effects. Dice result rendering uses the authoritative result immediately after rolling; cosmetic dice changes pause when hidden or reduced motion is requested.
- Focus-managed game dialogs using the existing dialog dependency; scrollable dialogs on short displays.
- Revisioned offline shell and content-hashed route snapshots, generated after the Node build. All five routes, browser bundles, styles, logo and existing icons are prepared without blocking play.
- Interrupted precaching leaves the previous cache intact. Updates require a deliberate refresh outside play; an open game in any tab defers activation. Previous bundles are retained for older tabs. No automatic gameplay reload.

## Automated results

- Frozen-lockfile dependency installation: passed; no dependency changes required for this theme.
- TypeScript, including the new server plugin: passed.
- Vitest: **100 tests passed across 6 files**, including the existing 74 gameplay regressions.
- Full lint: **0 errors**, 15 pre-existing fast-refresh warnings; no new warnings.
- Production build: passed. Post-build checks start the generated Node server and fetch the real HTTP responses.
- HTTP checks: all five SSR routes and all 27 precache files return successfully, including hashed offline HTML, manifest, logo, favicon and Android/iOS icons. Downloaded worker content matches the complete generated file. Unknown routes return 404; worker HEAD requests succeed.
- Source/lockfile scan: zero remaining removed-vendor references. Branding files are unchanged.

Added coverage checks release previews for every color, common-track destinations, home entry, exact finish and overshoot, optional-lap blockades, safe-stack legality, reward-six previews, suppressed previews during moves/dialogs, stacked-piece controls, finished-piece presentation, dice result rendering and stacks of up to 16 pieces.

Offline tests execute the worker against mock Cache Storage and client lifecycle APIs: complete preparation, interrupted downloads, retained old bundles, deferred updates during games, explicit activation, unknown-route handling and the sw=off bypass. Registration tests cover readiness, errors, embedded-window refusal, scoped unregistering and user-only refresh. Persistence tests load/write the unchanged v1 format and exercise blocked storage.

## Measured compressed build size

Sum of Node zlib gzip compression of each production browser JS/CSS asset, compared with the pre-upgrade build in this workspace:

| Resource           |    Before |     After |   Added |
| ------------------ | --------: | --------: | ------: |
| Browser JavaScript | 165,829 B | 167,817 B | 1,988 B |
| CSS                |  15,410 B |  17,188 B | 1,778 B |
| Combined           | 181,239 B | 185,005 B | 3,766 B |

The generated service worker is separately 1,525 B gzip versus 653 B before (+872 B). Including it, total compressed JavaScript growth is 2,860 B and total JS/CSS/worker growth is 4,638 B.

The standalone royal stylesheet compresses to 3,327 B; its net effect is smaller because old board styles/utilities are removed from the generated bundle. SVG artwork is included in JavaScript above. No new bitmap/font resources or animation framework were added. Both the 25 KB additional-JavaScript and 100 KB additional-theme-resource budgets are satisfied.

Complete offline preparation includes 27 files and approximately 1,625.6 KiB **uncompressed**, including the existing logo/icons. This is storage/preparation size, not measured network transfer or installation duration.

## Pending real-browser/device acceptance

The Browser skill connected to its runtime but reported no available browsers; browser discovery returned an empty list. No device screenshot comparison or hardware performance results are claimed.

- Desktop, tablet and 320/360/390/430px phone screenshots; short landscape windows; high-density screens.
- Real touch selection on every edge and stack, keyboard/focus behavior, reduced-motion appearance and screen-reader announcements.
- Android install prompt, iOS Add to Home Screen, standalone button hiding and safe-area appearance.
- Offline cold start from every route, offline new-game/resume/navigation, interrupted network preparation and multi-tab updates in actual browser Cache Storage.
- Interactive error/retry recovery, full visual gameplay walkthrough including captures, home bonuses and victory.
- 60 fps animation and sub-100ms input feedback on a named mobile profile. These are targets, **not measured results**; server-side rendering tests and bundle sizes cannot establish them.

To perform device acceptance: run `bun run build`, then `bun run start`, serve over HTTPS (localhost is exempt), wait for “Ready to play offline”, then test with networking disabled. Use `?sw=off` to bypass/unregister the app worker for troubleshooting.

## Deployment detail

Nitro indexes public files during its build. The small `server/plugins/offline-assets.ts` runtime plugin serves only the generated worker and a tightly constrained set of hashed HTML names so post-build output cannot inherit stale static lengths/ETags. It uses the [documented Nitro plugin interface](https://nitro.build/docs/plugins); ordinary routes/assets continue through the original server handler. Deploy the complete `.output` and start `.output/server/index.mjs`.
