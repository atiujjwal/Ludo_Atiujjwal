# Mobile gameplay performance pass

## Bottlenecks found

- Every visual cell hop cloned the complete game state, updated the shared context and reran board-level derivations. A six-cell move required at least six logical commits plus completion.
- Legal-move rendering recalculated blockades for each candidate and destination previews recalculated the same legal moves.
- Dice state recreated the game-screen roll callback and rerendered inactive player cards. Initial dice/token feedback waited for the throttled React commit.
- Animated feedback had no response to sustained frame loss. Its first decode could also occur on the incident input path.
- The repeatable 6×-CPU profile is highly variable. Baseline cold launches contained 11–15 second outliers; final samples still contain 10.8–13.6 second outliers. The final trace separates hydration from offline-readiness work.

## Changes made

- The movement coordinator animates the complete validated route with compositor transforms and commits its reducer replay once. It retains the legacy `HOP`/finish actions, exact route cells, timings, sounds, settling and guarded completion behavior. Preference updates do not restart travel; hidden/detached boards and failed animation events have deterministic fallbacks.
- Moving pieces alone receive `will-change`. Stationary stack sections do not receive travel animation.
- Blockades and legal moves are reused within one calculation/render. Player cards are memoized by their visible data, and the roll callback is stable.
- Dice and selected-token presentation reacts synchronously to the trusted input while React remains authoritative for dice results and game state. The dice timer is owned and cleaned up on unmount.
- Cat GIFs begin animated. Two consecutive visible two-second windows with over 20% slow frames switch the current match to existing static frames. The mode never oscillates and resets next match. Verified cached capture cats are warmed one at a time during idle time; reduced-motion and hidden-page behavior remain unchanged.
- The benchmark now records ten offline launches, hydration and readiness separately, long tasks, DOM/heap metrics and optional Playwright traces. Build-time cache integrity and the missing-entry checks remain unchanged.

## Results

Profile: Chromium, 360×800, DPR 2, 6× CPU, verified offline build.

| Measurement                      |               Baseline |             Final |
| -------------------------------- | ---------------------: | ----------------: |
| Critical compressed JS/CSS       |              131,989 B |         133,148 B |
| Median offline ready startup     |         1,698–1,930 ms |          1,211 ms |
| p95 offline ready startup        | not previously sampled |          1,308 ms |
| Dice pointer feedback            |            49–1,068 ms |           22.1 ms |
| Dice click feedback              |              33–376 ms |           14.2 ms |
| Token-selection feedback         |            34–1,260 ms |           10.0 ms |
| Movement median frame interval   |            16.7–100 ms |           16.7 ms |
| Final movement p95 / slow frames |                      — | 16.8 ms / 1 of 93 |

The isolated final run passed all four automated targets: input feedback, p95 frame interval, slow-frame ratio (1.1%) and p95 offline startup. A deliberately concurrent run alongside the full browser suite still produced 10–14 second launch stalls and a 50ms frame p95, so performance tests must remain isolated and real-device thermal/resource contention is not certified. Critical compressed code increased 1,159 bytes (0.88%) for the coordinator, adaptive monitor and guards. Production artwork remains 6,183.5 KiB; source files and visual timing are unchanged.

The previous six-cell move produced at least seven React state commits; it now produces one authoritative completion commit. Exact home finishing previously required at least eight and now also commits once. Pixel interpolation causes no React state updates.

## Verification

- 508 regression tests across 23 files pass, including atomic/legacy reducer equivalence, stale callback rejection and adaptive-effect thresholds.
- TypeScript and affected-file lint pass; eight pre-existing Fast Refresh export warnings remain in the game store.
- Vercel/PWA production build passes with revision `625f36fa88b3002c`, five offline routes and 50 verified files (6,857.6 KiB decoded).
- The 31-scenario production browser suite had 30 passes and one timing-test failure caused by an assertion waiting across its own six-second boundary. After making that assertion deadline-safe, the affected 2P ranking test and capture/home scenarios all pass in the final targeted run.
- Mobile audio recovery passed with nonzero post-compressor output. No crying audio or teddy effects were restored.

Actual Android/iOS installation, speakers, thermal throttling and long-session physical-device memory remain pending. Benchmark traces and JSON reports are generated under ignored `.artifacts/`.
