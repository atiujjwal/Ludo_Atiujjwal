# Stable stacking and unified guidance verification

Verified on 2026-09-12.

## Changes

- Board-piece outer wrappers represent only board-cell coordinates. Only the active pending token gets a cell-travel transition. Stack offsets and sizes live on separate inner buttons with no layout transition.
- Stack hit regions are bounded and non-overlapping; artwork cannot intercept taps. One non-interactive outline identifies each shared square. Token IDs remain React keys, and numbering stays accessibility-only.
- Setup, board bell and settings share `showMoveSuggestions`. `notificationsOn` remains a synchronized compatibility alias. Loading prefers an explicit canonical value, then the alias, then OFF. New setup defaults OFF; save/resume and rematch preserve the choice without changing `ludo:save:v1` or schema version 1.
- OFF removes optional guidance while retaining direct board selection, dice results, turn indicators, protected/blockade markers, move/capture feedback and required dialogs. Owned guidance toasts are dismissed without dismissing unrelated notifications; muted messages are consumed rather than replayed. Gameplay audio remains independently controlled.
- No gameplay-rule changes were needed. Existing in-progress work and setup scrolling were preserved.

## Automated results

- `bun run test`: 261 tests passed in 10 files (87 additional regressions).
- Stop-square reproduction: roll 1 and invoke the rear pawn's actual board-button handler. Verify only that token changes steps, both finish in the same square, and the stationary pawn's outer transform stays unchanged. Covers every colour, all eight safe/start squares and both token-ID orders, plus stack departures, friendly and protected opposing stacks.
- Stack geometry: sizes 1–16 remain in bounds with pairwise non-overlapping hit regions. CSS contracts verify only pending pieces receive travel transitions. These are model/markup checks, not browser geometry measurements.
- All nine combinations of missing/false/true preference fields checked through normalization, load, hydrate, both toggle action names, save and rematch. Setup defaults and sound independence checked.
- Guidance notice lifecycle checks immediate dismissal, muted event consumption, no stale replay, repeated-update idempotency and notification sound suppression. Render tests check legal previews, optional controls, piece highlighting and dice invitation gating. Source contracts check bell/status/settings wiring and toast ownership.
- TypeScript: passed (`node node_modules/typescript/bin/tsc --noEmit`).
- Full lint: zero errors, 15 pre-existing fast-refresh warnings.
- Production/PWA build: passed. Its temporary Node server checked five route snapshots, 404 handling, service-worker HEAD/content, and all 27 precache assets. Generated offline shell: `ef284ca999881465`, 1630.7 KB uncompressed.
- Production gzip sizes: game route 6.69 kB, shared CSS 17.41 kB. No dependency or bitmap assets added.

## Pending browser verification

Browser connection was attempted through the Browser skill; runtime discovery returned no available browsers. Consequently the exact reported visual interaction, desktop/mobile taps, keyboard focus geometry, screenshots, perceived animation and device responsiveness remain pending. Real-browser offline cold starts, update interaction and saved-game UI resume also remain pending; automated service-worker and persistence regressions passed. No claim of full visual/device verification is made.
