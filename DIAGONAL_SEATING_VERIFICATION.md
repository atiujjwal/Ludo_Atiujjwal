# Diagonal seating and vibrant houses

Verified on 2026-09-14.

- Full Vitest suite: 413 passing tests across 16 files.
- TypeScript: `tsc --noEmit` passed.
- Full lint: zero errors; 15 existing Fast Refresh warnings remain.
- Production/PWA build passed. Revision `5cefef0362ae2cf3` precaches five route snapshots and 32 files (2515.1 KB uncompressed), with HTTP availability checks for every file and checks for route 404 handling.

All 12 ordered two-player colour pairs are covered for unique corner ownership, top-left/bottom-right placement, matching rendered token positions and player-panel seat lookup. Tests replay release, full shared-track traversal, Second Lap, every five-cell lane and delayed finishing for both players in every pair. Each hop remains adjacent, and destination previews use the same layout as rules and tokens.

Regression coverage includes exact-roll finishes and overshoots on both laps, opponent capture bonuses, passable protected stacks, unsafe blockades, preserved saved token identities/progress, pending capture rewards, rematches, and invalid saved choice recovery. Other game modes use the default immutable layout; existing teammate/gameplay regressions continue passing.

House palettes are brighter in both themes, with ivory ornaments on red/green/blue and dark ochre on yellow. Palette checks verify ornament contrast of at least 3:1, alongside the existing 4.5:1 essential-text and 3:1 token/safe-cell checks. Token sizes, overlap offsets and movement/hover timing are unchanged.

Compatibility: no new save field or schema version. Existing two-player saves adopt the new seats while keeping relative steps and laps. Consequently, physical shared-square relationships can change on resume, as explicitly selected. Saved choices are revalidated without incrementing six streaks or duplicating capture entitlements. Old capture flashes are not replayed on mount.

Pending visual/device checks: Windows computer-use initialization succeeded, but app inventory failed because its native pipe was unavailable (OS error 2). The browser-only fallback returned no apps or browsers. Desktop and 320–430px screenshots in both themes, short-screen tap ergonomics, and real browser offline/update checks therefore remain pending. Automated markup/coordinate tests and build-time HTTP checks are not device visual verification.
