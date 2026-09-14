# Gameplay logic audit

## Authoritative flow

`gameReducer` resolves a die value, calls `getLegalMoves` once for every token controlled by the
current player, and stores the complete result in `state.legalMoves`. The board uses those token IDs
for highlighting and clickability. Before executing a selection, the reducer recalculates the same
legal-move set so stale UI or restored state cannot execute an illegal move.

Movement stays in the `moving` phase until all hop actions finish. Capture, home completion,
standings, custom rewards, and bonus-turn precedence are evaluated only by `FINISH_MOVE`.

## Configured rules

| Rule             | Engine behavior when enabled                                                                                                        | Behavior when disabled                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Exit on 1        | A base token may release on 1 or 6                                                                                                  | Only 6 releases a base token                        |
| Second Lap       | A token crossing its first home junction may enter home or take one more loop; the alternate loop is checked against every blockade | The token enters its home lane normally             |
| Cut Reward       | A capture earns a roll; optionally release or move six first, or take that same roll immediately; no duplicate roll is banked       | Every opponent capture directly grants another roll |
| Three 6s Variant | The third six is played; it grants another roll only when that move captures or reaches home                                        | The third consecutive six immediately ends the turn |

## Bonus precedence

1. Under standard rules, a third consecutive six ends the turn before movement.
2. A first or second six grants one further roll, even when no legal move exists.
3. Capturing an opponent or reaching home grants one further roll while the player or team can still act.
4. The Three 6s Variant grants a further roll after a third-six capture or home completion and resets the completed three-six streak before any reward choices.
5. Cut Reward is resolved before the owed roll. The owed state is boolean, so overlapping reasons
   cannot accidentally grant duplicate rolls.
6. A non-team player who finishes all four tokens does not receive a useless roll. In 2v2, that
   player may use the roll for their unfinished teammate.

## Executed regression matrix

The automated matrix in `src/lib/ludo/gameplay.test.ts` covers:

- 2-player, 3-player, 4-player, and 2v2 creation and turn order;
- every die value from 1 through 6;
- zero through four tokens outside the yard;
- simultaneous base and track moves after a six;
- home entry, home-lane movement, exact finish, and overshoot rejection;
- unsafe captures, safe-cell coexistence (including stacked opponents), teammate protection,
  blockade landing, and blockade traversal;
- no-move, single-move, and multi-move turn transitions;
- normal sixes, three-six limits, home bonuses, capture bonuses, and finished-player handoff;
- every custom rule on/off plus meaningful Second Lap/blockade and Cut Reward/third-six combinations;
- stale saved legal moves, invalid token selections, invalid modal actions, and invalid dice values;
- die output range and existing seating, capture, blockade, and winner regressions.
