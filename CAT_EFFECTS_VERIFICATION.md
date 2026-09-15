# Offline cat effects verification

## Behavior and compatibility

- Cutter house: `bleh-cat.gif` → `cat-orange-cat.gif`, three loaded seconds each.
- Victim houses: `banana-cat-crying.gif` → `crying-crying-cat.gif`, three loaded seconds each.
- Individual ranks: first `babsb-cat.gif`, second `dancing-cat-ai.gif`, third `happy-cat.gif` where applicable; the last player gets `crying-crying-cat.gif` only at game end.
- Teams: both winners get `babsb-cat.gif` and both losers `crying-crying-cat.gif` only after the winning team completes all eight tokens.
- New ranks appear in a separate 48px player-card row for three loaded seconds. Final results include every player's assigned cat. Completed-game resume uses static result cats and does not replay historical capture/finish effects.

Effects use presentation-only timers. They never dispatch a roll, resolve a move, change bonuses or pause remaining players. One capture sequence per colour replaces older sequences; stale image loads cannot extend or restart newer stages. Failed loads have bounded cleanup. Reduced motion/hidden pages use generated static frames. Existing sound settings and game sounds remain unchanged; no crying/cat audio is introduced.

Capture events add optional `cutterColor`, taken from the actual moving token rather than the current player. Old saved breadcrumbs remain compatible and are consumed without replay. No save key, schema version, coordinate, token size, stacking offset or movement timing changes.

The seven cat originals remain under `public/animation`. Seven obsolete teddy source files and the teddy component were removed; tracked originals are recoverable from Git. Historical teddy verification reports are superseded by this document.

## Offline preparation and media size

All seven GIFs and seven generated static PNG frames are included in the content-hashed precache before **Ready to play offline**. Optimized files are served with current binary lengths and MIME types. Asset effect-query strings use the existing normalized cache lookup. Older clients keep their previous revision through the existing safe-update/cache-retention policy.

Only deployment copies are optimized. The GIF target width is 160px, preserving aspect ratios, frame counts, frame delays and loop metadata; originals are retained when re-encoding would increase file size. Static frames also target 160px. Development serves static frames on demand without altering source GIFs.

| Measurement                                           |               Before replacement/optimization |                 Cat release |
| ----------------------------------------------------- | --------------------------------------------: | --------------------------: |
| Cat source originals vs deployed GIFs + static frames |                              13,149,937 bytes |             6,031,288 bytes |
| All gameplay artwork, before/after optimization       |                                  14,181.2 KiB |                 6,061.1 KiB |
| Required offline inventory                            | Previous release: 38 files, about 1,345.9 KiB | 48 files, about 6,723.4 KiB |

The replacement increases the full offline download, predominantly due to the supplied animations. Cat media including static frames is **54.1% smaller** than the source GIFs; total artwork optimization saves **57.3%**. Cache totals are decoded file bytes, not an estimate of total browser storage or compressed wire transfer. Installation preparation reports actual progress and does not block online gameplay.

## Automated and visual checks

- **454 regression tests / 18 files pass**, covering capture-stage timing, duplicate/stale events, repeated captures, multiple victims, legacy breadcrumbs, rank/team assignments, missing-image cleanup and all 12 ordered diagonal 2P selections. Existing gameplay regressions remain passing.
- TypeScript passes. Lint has no errors; ten existing Fast Refresh export warnings remain.
- Production build passes HTTP content-hash verification, icon/route checks and revisioned media generation. GIF frame counts/delays were compared against originals; the optimizer also guards frame/loop metadata.
- All **17 production Chromium scenarios pass**, covering offline process restart, all routes/media/query strings, cache failures, safe updates, capture sequences for every colour, reduced motion, live rank effects in 2P/3P/4P, both team outcomes, resumed static standings and responsive layouts.
- Live rank, four-rank results, team results and capture-house screenshots were visually inspected. Feedback has its own row rather than covering names or dice; house effects sit between yard-token faces. Small-screen colour-icon visibility and long team-name truncation are preserved. After the final decorative inset adjustment, the five affected capture/rank/team/layout browser scenarios were rerun and passed.
- After unifying all timed GIF displays at 3,000 ms, all 454 regression tests, TypeScript, lint (no errors), production build and all 17 production browser scenarios were rerun successfully. The refreshed offline revision is `68a82244bd3c6d9a`; each two-stage capture lasts six loaded seconds, while rank/result celebrations last three.

Reproduce after a production build:

```sh
bun run test
bunx tsc --noEmit
bun run lint
bun run build
bun run test:pwa
node scripts/mobile-performance.mjs cats
```

Run the profiler separately from browser update tests, which temporarily replace generated worker files. Profiling reports are written to ignored `.artifacts/performance-cats.json`; the cat profile includes an actual UI capture and another completed move while effects are active, not just a static board.

## Throttled production profile

These measurements precede the later adjustment to three seconds per GIF. The profiler now samples 6.3 seconds to cover the longer capture sequence; that expanded profile has not been remeasured.

Chromium, 360×800, DPR 2, 6× CPU throttling, cache prepared and network disabled. In the sampled build, critical loaded JS/CSS gzip-equivalent changed from **131,019 to 131,083 bytes** (about 64 bytes / 0.05% growth); the lazy game chunk grew from about 7.83 to 8.8 KiB gzip. The source GIFs do not inflate the startup JS bundle. The final decorative house inset was tightened afterward to keep yard-token faces clear; token coordinates/sizes did not change.

Five offline startup samples were **1,293 / 1,306 / 1,270 / 1,238 / 14,339 ms**, median **1,293 ms**. Four met two seconds, but the long-tail sample did not; consistent two-second startup remains unverified. The previous profile also had a long-tail sample, so a causal regression from cat effects is not established.

Normal dice pointer feedback was **41.1 ms**, click feedback **27.2 ms**, and token-selection feedback **41.3 ms**. Normal movement median/p95 frame interval was **16.7 / 16.7 ms**, with 1 of 92 intervals above 34 ms.

During the roughly 4.3-second capture sample, median/p95 frame interval was **16.7 / 16.7 ms**, with **0 of 256 intervals above 34 ms**. Another roll and move completed while the cat sequence remained active. **No gameplay asset response bypassed the service-worker cache** in that sample. These short headless measurements support smooth sampled feedback, not a sustained real-phone 60 fps guarantee.

## Device acceptance

Actual Android/iOS installation, audible hardware playback and lower-end device performance remain pending. On HTTPS, wait for verified preparation, install, disable Wi-Fi/mobile data, fully close/reopen, then test new/resumed games, each capture role, every rank/team result, themes and reduced motion. Follow [the mobile acceptance checklist](./MOBILE_OFFLINE_VERIFICATION.md#manual-androidios-acceptance--pending-real-devices).

Offline operation still depends on required browser storage remaining intact. Updates never clear saves or device preferences; browser eviction and user-cleared storage cannot be prevented absolutely.
