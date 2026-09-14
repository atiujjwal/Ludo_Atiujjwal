# Move suggestions and capture bonuses

Implemented 12 September 2026.

- Removed visible token numbering on the board, setup colour tokens and extra move buttons. Colour glyphs, player names, dice pips and individual accessibility labels remain.
- Added a separate setup display switch, default OFF, for destination and Second Lap previews. Legal selection highlighting and 44px touch controls remain available in either state.
- Added optional `Settings.showMoveSuggestions` and `START.showMoveSuggestions`. New games default OFF; resume/rematch preserve the preference; missing legacy values mean OFF. Save key and schema version remain unchanged.
- Ordinary captures now grant one next roll. Six + capture does not bank two. Cut Reward release/move-six precedes that roll; Roll again consumes that same entitlement. Reward-six movement alone does not count as a rolled six.
- Played third-six captures/home completions reset the exhausted six streak before showing rewards. Standard third-six skipping is unchanged.
- Legacy saved Cut Reward dialogs and reward-move selections recover their pending capture roll. Premature move-completion actions cannot resolve captures before the remaining hops.
- Updated rules, setup explanations, reward dialog and capture notices.

## Verification

- Full Vitest suite: 174 passing tests across 8 files.
- TypeScript: passed.
- Full lint: no errors; 15 existing fast-refresh warnings.
- Production/PWA build: passed; regenerated revisioned worker and all five offline routes. Post-build HTTP checks verify actual serving of the generated worker, snapshots and precache assets.
- Capture matrix: rolls 1–6, all four modes, Cut Reward ON/OFF; no bonuses for own/teammate/safe stacking; reward choices, repeated completion, chained captures, saved reward entitlement, third-six reset and subsequent six, home exception, and game-over precedence.
- Presentation/persistence checks: visible numbers absent, accessibility labels retained, suggestions OFF/ON and absent legacy setting, blocked Second Lap alternatives, save/hydrate/rematch, and fresh-game defaults.
- Existing setup scrolling contract checks still pass with the new display option.

Live browser discovery returned no available browsers. Desktop/phone interaction, keyboard editing, PWA update acceptance and visual screenshot checks remain pending; automated rendering and source-contract checks are not claimed as real-device verification.
