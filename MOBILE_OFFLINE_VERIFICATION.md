# Mobile offline implementation and verification

## Implemented behavior

The custom `/sw.js` verifies every required file against its build-time content hash before reporting **Ready to play offline**. Preparation uses four concurrent downloads and retries; a failed candidate cannot replace the working revision. The final browser install prompt requires a fresh tap after verification. Play is available during preparation.

The inventory includes `/`, `/setup`, `/game`, `/rules`, `/settings`, browser bundles, CSS, JPEG branding, icons and the used cat GIF/static assets. Fonts are system fonts. Sound samples are discovered during the build; missing samples use synthesis without speculative requests. Crying audio remains removed. Known asset query strings resolve to the cached file; unknown routes retain genuine 404 behavior. The size/timing measurements below describe the original offline optimization release; see [CAT_EFFECTS_VERIFICATION.md](./CAT_EFFECTS_VERIFICATION.md) for the subsequent cat replacement and current media/cache growth.

Existing installations verify their local cache before checking for updates. Cached navigation does not wait for a network response. Missing required cached files produce an honest recovery warning rather than a false readiness claim.

Games still use `ludo:save:v1`, schema version 1, existing migrations and stable-state checkpoints. Sound, music, vibration and independent royal skin IDs use `ludo:preferences:v1`; Light/Dark appearance retains `ludo:app-theme:v1`. Device preferences survive clearing/starting games. A placeholder or reset cannot recreate a cleared game save. Guidance remains game-specific and defaults OFF in new setup.

Updates query the current route of every open app window, including SPA navigation. Activation is deferred while a game is open or an older window cannot confirm it is safe. Older clients retain required bundles; saved games and preferences are never deleted by cache cleanup. Refresh remains an explicit action outside gameplay.

## Production size and measured performance

Profile: automated Chromium, 360×800, DPR 2, **6× CPU throttling**, production Node output, offline navigation in an existing origin context. These desktop emulation results are not actual lower-end phone measurements.

| Measurement                             |      Baseline |       Current |
| --------------------------------------- | ------------: | ------------: |
| Critical loaded JS/CSS, gzip-equivalent | 173,949 bytes | 131,019 bytes |
| Generated gameplay artwork              |   2,170.4 KiB |     686.7 KiB |
| Median offline startup, five samples    |      1,630 ms |      1,535 ms |

Critical compressed JS/CSS fell **24.7%**, exceeding the 20% size target. Generated artwork fell **68.4%**; public source originals remain intact. The final build inventory contains five route snapshots and 38 required files, approximately **1,345.9 KiB decoded** (revision `cc08706da8f58ec7`). This is not a promise about wire transfer or total browser storage, which also includes metadata and retained update revisions. Deployment includes negotiated gzip/Brotli variants.

Latest offline startup samples: **1,535 / 1,488 / 1,452 / 1,650 / 13,492 ms**. Four met the two-second target, but the long tail did not. The two-second target is therefore **not consistently met**.

Latest pointer-to-dice feedback was **71.1 ms**, click-to-feedback **60.3 ms**, and selected-token feedback **96.2 ms**. Those samples met 100 ms; repeated earlier runs were variable and do not establish a universal guarantee.

During the short movement sample, median animation-frame interval was **16.8 ms**, p95 **266.7 ms**, with **10 of 29 intervals above 34 ms**. Median cadence approached 60 fps, but sustained smooth 60 fps is **not established**, and the frame spikes miss that target. These are frame intervals, not a device-certified GPU dropped-frame count. Further real-device profiling is needed; gameplay rules and hop timing were not changed to improve benchmark numbers.

Raw repeatable reports are generated locally under ignored `.artifacts/`. Run performance separately from PWA update tests: the latter temporarily replace generated worker files to exercise deployment failures.

## Automated checks

Run from a fresh dependency installation:

```sh
bun install --frozen-lockfile
bun run test
bunx tsc --noEmit
bun run lint
bun run build
bunx playwright install chromium
bun run test:pwa
bun run test:performance
```

The regression suite passes **425 tests across 17 files**, including gameplay, layouts, persistence, audio, capture feedback, themes and offline-worker behavior. TypeScript passes. Lint has no errors; existing Fast Refresh export warnings remain.

The production build checks decoded HTTP hashes for every required file, icon dimensions, asset serving, route snapshots and 404 behavior. Optimization changes generated copies only. Maskable deployment artwork has an inset safe area.

### Compact Cut Reward panel — current verification

The required Cut Reward choice now appears in document flow below the board and player cards, without a modal backdrop. Release, Move 6 and Roll keep their existing actions and earned-roll entitlement. Each option has an independent info button; unavailable actions still explain themselves. Exit is disabled while the bonus is pending so the choice cannot be accidentally discarded. No gameplay engine, coordinates, save schema, assets or dependencies changed for this refinement.

The full regression suite passes **502 tests across 21 files**. TypeScript, affected-file lint, formatting and the Vercel production/PWA build pass. **Five targeted production-browser scenarios pass**: both appearances at 320, 360, 430 and 1280 px offline, all three bonus actions, minimum 44px action/info targets, unobstructed board geometry, bottom-of-button hit testing against the offline banner, expanded explanations, a live capture, keyboard operation and unavailable bonuses. Phone and desktop screenshots were inspected. Short windows can scroll to the panel. Actual phone and deployed-cloud checks remain pending.

Revision `b0b1347712563505` contains five routes and 50 verified files, **6,853.6 KiB decoded**. Compared with the preceding bonus-dialog build, compressed CSS grew approximately **0.38 kB** and the lazy game chunk **0.73 kB**; the critical JavaScript bundle is effectively unchanged. These five targeted browser passes do not supersede the separate unresolved browser-audio check below.

### Mobile audio follow-up

Current full-inner-home verification supersedes the earlier all-green browser-audio claim: 498 unit/regression tests and the Vercel/PWA build pass, and all eight GIF-focused scenarios pass across the rebuilt/targeted runs. However, the strict-autoplay browser's short Unmute-cue assertion repeatedly returned zero waveform output; first-roll output and muted silence passed. Pending-resume guarding and an actively pulled analyser branch did not resolve that assertion. Real-phone audio and this browser-audio follow-up remain unverified; see [the current cat-effects verification](./CAT_EFFECTS_VERIFICATION.md#full-inner-home-refinement--current-verification). The latest verified inventory revision is `92c11373bfc8c44a`, with 50 required files.

The loudness follow-up passes 497 regressions across 20 files, TypeScript, affected-file lint and the Vercel production/PWA build. Synthesized cues and requested background music share a 4× (+12 dB) output bus with compression; available samples use full app volume. Unit checks cover every cue's output routing, optional samples and mute. The strict-autoplay mobile-browser scenario was rerun against the new Vercel output and passed first tap, unmute, background recovery, muted silence and offline reopen. Its measured post-compressor waveform peak was 0.402 (below full-scale 1) during the tested first-roll interaction; this is not a phone-speaker loudness measurement or a guarantee against clipping under arbitrary audio loads. The critical JavaScript gzip size increased from 109.32 to 109.41 kB (about 90 bytes); no dependencies or media were added. Offline revision `1598c61ca5fbbab1` contains 50 verified files, 6849.4 KiB decoded. Real-device loudness and deployed-cloud checks remain pending. Device media volume, mute and browser/OS permissions remain authoritative.

The later mobile-audio fix passes 495 regressions across 20 files, TypeScript and lint (no errors; existing Fast Refresh warnings remain). Playback is unlocked by trusted pointer/touch/click or activating keyboard events; Unmute applies sound preferences and unlocks synchronously. Pending resume cues expire instead of replaying after mute, hidden pages or delayed permission. Suspended/interrupted contexts recover on the next gesture, with one shared context and lifecycle cleanup. Supporting platforms select a playback audio session; unsupported platforms retain the Web Audio fallback.

A 360×800 Chromium test with strict user-gesture autoplay policy measured nonzero waveform output for first tap, unmute, background recovery and offline reopen, and suppressed output during muted play. It checks generated audio rather than just mocking `play()` calls. The original fixture randomly rolled a six and awaited another roll instead of choosing a token; after making it deterministic, the audio scenario and direct-selection/full-house-overlay scenario were rerun and passed. The other 19 production/PWA scenarios passed in the full run. Actual Android/iOS speaker output, silent-switch behavior and installed-device validation remain pending; no cloud deployment was performed.

The 11 production Chromium scenarios cover:

- Closing the entire browser, then reopening offline and starting/resuming a game.
- Offline navigation to every route without prior individual visits.
- Cached JPEG, icons, GIFs/static images and asset query strings.
- Installation prompt gating and a fresh final install gesture.
- Sound/vibration/music, themes and house-rule persistence; clearing saves without phantom recreation.
- Incomplete caches, interrupted first preparation/retry and failed candidate storage writes.
- Actual SPA game-window activation deferral, failed update preservation and explicit successful refresh.
- Offline capture feedback for every victim colour, victory presentation and reduced motion, with no missing-sound requests.
- Bounded board layouts in both themes at 320, 360, 430, 768 and 1280 px; setup's third name field remains reachable in a short window.

Unit tests additionally exercise corrupt responses, completion markers, older-client cache retention and compatibility preference fields. Browser failure injection simulates quota errors; it is not certification of a physical phone's storage quota. Desktop screenshots at 320 px/light and 1280 px/dark were visually inspected; broader sizes have automated bounds checks and captured screenshots.

## Manual Android/iOS acceptance — pending real devices

1. Deploy the **complete `.output` directory** over HTTPS. Do not deploy the source worker template. On a phone, open the home page and tap **Install on your phone** if preparation is not complete.
2. Wait for **Ready to play offline**. Tap **Install now** on supported Android browsers; on iOS follow the verified Share → Add to Home Screen guidance. Browser installation alone does not prove offline preparation.
3. Open the installed app online. Set appearance and sound/music/vibration; start a game with house rules. Complete a move so a stable checkpoint is saved.
4. Disable both Wi-Fi and mobile data. Fully close the installed app/browser process, then reopen from its home-screen icon.
5. Resume the saved game; visit rules/settings and return. Start a new game offline. Check 2P, 3P, 4P and teams, both themes, all colours, stacks, dice, legal moves, captures, five-cell home lanes, finishes and victory.
6. Confirm cat sequences/rank graphics, synthesized/available sampled sounds and mute behavior. Verify audio stops when hidden or muted and capture feedback remains independent of suggestions.
7. Clear a game and reopen; it must not return. Device preferences must remain. Confirm theme changes and preference changes survive another offline close/reopen.
8. Restore connectivity and deploy an update with a game open in one window. It must not reload mid-play. Leave gameplay/close other game windows, then explicitly refresh from home. The saved game, pending choices and earned bonuses must remain intact.
9. Interrupt a new revision's preparation. The previous verified app must still reopen offline. Reconnect and retry. Also test low-storage and user-cleared-storage recovery messages.
10. Repeat on lower-end Android hardware, iOS Safari/home-screen mode, 320–430 px screens, landscape, keyboard focus and reduced motion. Record cold launches, visible movement stalls, touch feedback and audible playback.

Actual Android/iOS installation, airplane-mode process restart, audible output and lower-end hardware performance remain **pending**. Chromium automation covers browser offline behavior, not platform installation UI or operating-system lifecycle guarantees.

Offline operation is guaranteed only after verified preparation while required browser storage remains intact. Persistent-storage requests are best effort: browser eviction, operating-system pressure and user-cleared storage cannot be prevented absolutely. See [web.dev's offline storage guidance](https://web.dev/learn/pwa/offline-data). Installation and worker activation are separate lifecycles, as described in [web.dev's service-worker guidance](https://web.dev/learn/pwa/service-workers). Interrupted moves retain the existing stable-checkpoint recovery policy, not a new mid-animation save schema.
