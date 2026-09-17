# Offline cat effects verification

## Behavior and compatibility

- Cutter house: `bleh-cat.gif` → `cat-orange-cat.gif`, three loaded seconds each.
- Victim houses: `banana-cat-crying.gif` → `crying-crying-cat.gif`, three loaded seconds each.
- Individual ranks: first `babsb-cat.gif`, second `dancing-cat-ai.gif`, third `happy-cat.gif` where applicable; the last player gets `crying-crying-cat.gif` only at game end.
- Teams: both winners get `babsb-cat.gif` and both losers `crying-crying-cat.gif` only after the winning team completes all eight tokens.
- Each first/second/third token reaching home shows `weird-cute.webp` in its own colour's starting house for three loaded seconds, including teammate-controlled moves. The fourth token is excluded. New arrivals replace old home effects, and newer captures or rank/victory effects cancel older home effects. Saved home arrivals are seeded silently.
- New ranks loop inside the matching remapped starting house while remaining players continue. Player cards display names and `Finished #1`, `Finished #2`, etc., with no cat artwork. A resolved rank cancels any obsolete capture/home sequence in that house. Final standings restart every assigned house GIF together, wait for loading/fallback (bounded to ten seconds), then celebrate for six foreground seconds before opening text-only results. GIFs continue behind the popup until rematch/exit. Hidden pages pause the countdown and use static frames; reduced motion uses static artwork. Ongoing-game resume restores looping ranks; completed-game resume restores them with immediate results and no countdown. Rank cats require all four tokens to finish. Capture stages and token-home feedback remain three seconds each.

Effects use presentation-only timers. They never dispatch a roll, resolve a move, change bonuses or pause remaining players. One capture sequence per colour replaces older sequences; stale image loads cannot extend or restart newer stages. Failed loads have bounded cleanup. Reduced motion/hidden pages use generated static frames. Existing sound settings and game sounds remain unchanged; no crying/cat audio is introduced.

All incident and rank media fills the complete token-home square just inside its existing frame. Artwork and overlays share the 15% courtyard inset and responsive frame-width variables; overlays inset by that frame width as well, with no added border, padding or shadow. Centered, aspect-preserving cover cropping fills the container, and the opacity-only entrance keeps full-box bounds throughout. The overlay remains non-interactive, including while a legal yard token is released underneath it. No board or token geometry changes.

Capture events add optional `cutterColor`, taken from the actual moving token rather than the current player. Old saved breadcrumbs remain compatible and are consumed without replay. No save key, schema version, coordinate, token size, stacking offset or movement timing changes.

The seven GIF originals and `weird-cute.webp` remain under `public/animation`. Seven obsolete teddy source files and the teddy component were removed; tracked originals are recoverable from Git. Historical teddy verification reports are superseded by this document.

## Offline preparation and media size

All seven GIFs, the original WebP (116,926 bytes) and eight generated static PNG frames are included in the content-hashed precache before **Ready to play offline**. Optimized files are served with current binary lengths and MIME types, including `image/webp`. Asset effect-query strings use the existing normalized cache lookup. Older clients keep their previous revision through the existing safe-update/cache-retention policy.

Only deployment copies are optimized. The GIF target width is 160px, preserving aspect ratios, frame counts, frame delays and loop metadata; originals are retained when re-encoding would increase file size. Static frames also target 160px. Development serves static frames on demand without altering source GIFs.

| Measurement                                           |               Before replacement/optimization |                 Cat release |
| ----------------------------------------------------- | --------------------------------------------: | --------------------------: |
| Cat source originals vs deployed GIFs + static frames |                              13,149,937 bytes |             6,031,288 bytes |
| All gameplay artwork, before/after optimization       |                                  14,181.2 KiB |                 6,061.1 KiB |
| Required offline inventory                            | Previous release: 38 files, about 1,345.9 KiB | 48 files, about 6,723.4 KiB |

The replacement increases the full offline download, predominantly due to the supplied animations. Cat media including static frames is **54.1% smaller** than the source GIFs; total artwork optimization saves **57.3%**. Cache totals are decoded file bytes, not an estimate of total browser storage or compressed wire transfer. Installation preparation reports actual progress and does not block online gameplay.

## Automated and visual checks

### Full inner-home refinement — current verification

- All **498 regressions across 20 files**, TypeScript, affected-file lint, formatting and Vercel/PWA build pass. House artwork and overlays use the same whole-pixel frame width (1px on mobile/tablet, 2px on desktop), avoiding the fractional-border rounding mismatch found at 768px.
- All **eight GIF-focused browser scenarios pass across rebuilt and targeted follow-up runs**: offline capture and home completion for all colours, rank artwork at 320/360/430/768/1280px in both themes, and all 12 ordered two-player seats. Bounds match the courtyard's inside-border bounds within 1px; pictures/images fill the same area, add no border/padding/shadow, preserve aspect ratio with centered cover cropping, and do not animate their size. Direct yard-token selection through capture art remains functional. Token state is unchanged by presentation. Non-square cat artwork and reduced-motion frames are covered.
- Screenshots at 320px/light, 430px/dark and full-square capture were visually inspected. Original courtyard borders remain visible; media replaces the entire inner token-home background rather than the centre motif. Existing three-second capture/home windows and looping rank/six-second results behavior remain unchanged. Transient home geometry is measured early enough not to outlive its three-second display.
- The initial full 26-scenario run passed 24 scenarios. Tablet bounds were corrected and pass on the rebuilt output; the transient home check passes after moving its measurement earlier. **The separate mobile-audio browser assertion for a brief Unmute cue still fails**, despite first-roll output and mute suppression passing. Do not interpret this report as a completely green PWA suite or verified real-phone audio. A unit-tested guard now waits for pending output resume even if a context prematurely reports running; it did not resolve that browser assertion. Audio follow-up remains required.
- Revision `92c11373bfc8c44a` contains 50 verified required files, about 6849.6 KiB decoded. CSS gzip is 13.47 kB (previously 13.42); main JavaScript gzip is 109.42 kB (previously 109.41). No dependencies or media were added. Cloud redeployment, refreshed installed-PWA acceptance and real-phone output remain pending; never clear saved-game storage to update.

The release-by-release notes below are historical and are superseded by the current verification above.

- **495 regression tests / 20 files pass**, covering first/second/third token arrivals for every colour, the fourth-token exception, teammate colour identity, capture-stage timing, duplicate/stale events, rapid arrivals/captures, legacy breadcrumbs, rank/team assignments, persistent ranks, six-second foreground timing, bounded load fallback, cancellation, mobile audio resume/mute recovery, text-only player ranks and rank-house placement for all 12 ordered diagonal 2P selections. Existing gameplay regressions remain passing.
- TypeScript passes. Lint has no errors; ten existing Fast Refresh export warnings remain.
- Production build passes HTTP content-hash verification, icon/route checks and revisioned media generation. GIF frame counts/delays were compared against originals; the optimizer also guards frame/loop metadata.
- All **20 production Chromium scenarios are verified** across the full and targeted follow-up runs, covering actual generated audio under strict autoplay policy, full-house incident bounds and direct selection, offline process restart, all routes/media/query strings, cache failures, safe updates, captures, reduced motion, token-home arrivals, persistent ranks, six-second final results, hidden-page pause/resume, both team outcomes and responsive layouts.
- Live rank, four-rank results, team results and capture-house screenshots were visually inspected. Feedback has its own row rather than covering names or dice; house effects sit between yard-token faces. Small-screen colour-icon visibility and long team-name truncation are preserved. After the final decorative inset adjustment, the five affected capture/rank/team/layout browser scenarios were rerun and passed.
- After unifying all timed GIF displays at 3,000 ms, all 454 regression tests, TypeScript, lint (no errors), production build and all 17 production browser scenarios were rerun successfully. The refreshed offline revision is `68a82244bd3c6d9a`; each two-stage capture lasts six loaded seconds, while rank/result celebrations last three.
- Vercel packaging passed all 17 browser scenarios against the generated Nitro web Function plus a local CDN-file test bridge. After adding visible rank effects inside houses, the six affected capture/finish/team scenarios were rerun and passed against the refreshed Vercel output. TypeScript, lint (no errors) and all 467 regressions pass. The build verifies SSR for every route, unknown-route 404s, matching Node/Vercel bundles and all 48 precache hashes; revision `8254782b57c8919a` totals about 6,724.0 KiB. The 3P live screenshot was inspected and shows the first-place cat in both the house and player card. Actual Vercel cloud deployment/CDN acceptance remains pending redeployment.
- The latest house-only change supersedes those earlier card/result screenshots: all 472 regressions, TypeScript, lint (no errors), Vercel/PWA build and all 17 production browser scenarios pass. Tests assert that names/ranks remain on cards, no cats render on player/results cards, all final team cats appear in their houses, and completed-game resume uses static house artwork. The updated 3P screenshot was inspected: `Player 1` / `Finished #1` remains on the card, with its cat only in the red starting house. Offline revision `e632e7be37062110` contains 48 required files, about 6,723.6 KiB.
- The non-final home addition passes all 479 regressions, TypeScript, lint (no errors) and the Vercel/PWA build. All 18 production browser scenarios passed; after the final home-to-capture replacement safeguard, the affected offline home test passed again against rebuilt output. It checks every colour, first/second/third arrivals, static reduced-motion artwork, no historical replay and an earned roll/capture while the home cat is visible. Fourth-token rank tests assert no `weird-cute` artwork. The mobile screenshot was inspected: the cat stays in the starting house without covering player cards or controls. Current revision `3b10e63d53a5d342` contains 50 required files, about 6,847.1 KiB uncompressed, including the WebP and its static frame. Startup/frame performance was not remeasured for this addition; real-device acceptance remains pending.

- The continuous-rank update supersedes the earlier three-second/static rank behavior: TypeScript, lint (no errors; ten existing export warnings), all 488 regressions, Vercel/PWA build and all 19 browser scenarios pass. Earlier ranks remain beyond six seconds and restore after reload. Final four-player sessions restart together; hidden time does not open results, GIFs switch to static frames while hidden/reduced motion, and all house GIFs remain after the popup opens. Completed-game resume opens results without a countdown; rematch removes old effects. Mobile rank and final-popup screenshots were inspected. Revision `0ec3d36eeb775571` retains 50 required files, about 6,847.9 KiB uncompressed. No assets or dependencies were added; the lazy game chunk changed from 9.11 to 9.47 kB gzip (about 0.36 kB growth). Sustained animation/device performance was not remeasured.

- The mobile-audio/full-house follow-up passes all 495 regressions, TypeScript, lint (no errors) and Vercel/PWA build. The full browser run passed the existing 19 scenarios; its new audio fixture initially rolled a random six and waited incorrectly for another roll. With a deterministic roll, the audio test and updated capture/direct-selection test both passed again. Waveform probing confirms audible-range generated output on first tap, Unmute, background recovery and offline reopen, and suppressed output while muted. Every colour's incident frame matches its courtyard bounds; direct release works beneath the overlay. The full-square capture screenshot was inspected. Revision `28faec77da10d406` contains 50 files, about 6,849.1 KiB uncompressed; no new media/dependencies were added. Real-phone speaker/silent-switch/PWA validation and actual cloud redeployment remain pending.

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

These measurements precede the later adjustment to three seconds per capture GIF and continuous rank loops. The profiler now samples 6.3 seconds to cover the longer capture sequence; that expanded profile and sustained rank loops have not been remeasured.

Chromium, 360×800, DPR 2, 6× CPU throttling, cache prepared and network disabled. In the sampled build, critical loaded JS/CSS gzip-equivalent changed from **131,019 to 131,083 bytes** (about 64 bytes / 0.05% growth); the lazy game chunk grew from about 7.83 to 8.8 KiB gzip. The source GIFs do not inflate the startup JS bundle. The final decorative house inset was tightened afterward to keep yard-token faces clear; token coordinates/sizes did not change.

Five offline startup samples were **1,293 / 1,306 / 1,270 / 1,238 / 14,339 ms**, median **1,293 ms**. Four met two seconds, but the long-tail sample did not; consistent two-second startup remains unverified. The previous profile also had a long-tail sample, so a causal regression from cat effects is not established.

Normal dice pointer feedback was **41.1 ms**, click feedback **27.2 ms**, and token-selection feedback **41.3 ms**. Normal movement median/p95 frame interval was **16.7 / 16.7 ms**, with 1 of 92 intervals above 34 ms.

During the roughly 4.3-second capture sample, median/p95 frame interval was **16.7 / 16.7 ms**, with **0 of 256 intervals above 34 ms**. Another roll and move completed while the cat sequence remained active. **No gameplay asset response bypassed the service-worker cache** in that sample. These short headless measurements support smooth sampled feedback, not a sustained real-phone 60 fps guarantee.

## Device acceptance

Actual Android/iOS installation, audible hardware playback and lower-end device performance remain pending. On HTTPS, wait for verified preparation, install, disable Wi-Fi/mobile data, fully close/reopen, then test new/resumed games, each capture role, every rank/team result, themes and reduced motion. Follow [the mobile acceptance checklist](./MOBILE_OFFLINE_VERIFICATION.md#manual-androidios-acceptance--pending-real-devices).

Offline operation still depends on required browser storage remaining intact. Updates never clear saves or device preferences; browser eviction and user-cleared storage cannot be prevented absolutely.
