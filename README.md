# solitaire-rules-engine

The rules of five solitaire games — Klondike, Spider, FreeCell, Pyramid and Yukon — as plain
JavaScript with no dependencies, no DOM and no framework. Every rule is also a test.

```bash
node test/engine_test.js    # 54 assertions on the mechanics
node test/rules_audit.js    # 60 assertions written as the games' published rules
```

Live demo: <https://games.appokk.com> — the same engines, with a board on top.

## Why it exists

Card-game code is usually written twice: once as rules, once as a drag-and-drop handler, with
the two drifting apart. Here the rules are pure functions over a plain state object, and the UI
is a separate layer that only draws and translates clicks. That split has one practical payoff:
**the rules can be tested without a browser**, which is what the second test file is for.

`test/rules_audit.js` is the interesting one. Each test's name is the published rule, so a
failure tells you which claim about the game is now false:

```
ok   [FreeCell] a movable pack is descending and alternating in colour, suits may differ
ok   [Spider] only a same-suit descending run may be moved as a unit
ok   [Pyramid] a card is covered while either card resting on it is still there
```

Writing those tests found two real bugs that "looked correct" for weeks: a FreeCell pack was
required to be a single suit (it is not — colour alternation is what matters), and cloning a
state shared card objects with it, so undo silently rewrote history.

## Install

There is nothing to install. Copy the files you need; each is a single IIFE that attaches itself
to `module.exports` under Node or to the global object in a browser.

```html
<script src="cards.js"></script>
<script src="klondike.js"></script>
<script>
  const state = Klondike.deal(11982, 1);        // seed, draw count (1 or 3)
  const moved = Klondike.move(state, 't0', null, 'f0');
  if (moved.ok) render(moved.state);            // never mutates `state`
</script>
```

## API shape

Every game exports a small, deliberately similar surface:

| Function | Meaning |
| --- | --- |
| `deal(seed, ...)` | Return a fresh state. The same seed always deals the same cards. |
| `move(state, from, index, to)` | Return `{ok, state, reason}`. Illegal moves leave `state` untouched. |
| `grabbable(state, ref, index)` | May this card, and everything above it, be lifted? |
| `canDrop(state, ref, card)` | Would this card be legal on that pile? |
| `autoTarget(state, from, index)` | Where would a double-click sensibly send this? |

Piles are addressed by short strings, so a UI, a test and a solver all speak the same language:

| Game | Piles |
| --- | --- |
| Klondike | `stock` `waste` `f0`–`f3` `t0`–`t6` |
| Spider | `stock` `f0`–`f7` `t0`–`t9` |
| FreeCell | `c0`–`c3` `f0`–`f3` `t0`–`t7` |
| Pyramid | `stock` `waste` `p0`–`p27` (row-major triangle) |
| Yukon | `f0`–`f3` `t0`–`t6` (no stock: the whole deck is dealt) |

## Design decisions worth knowing

**Seeded deals, not `Math.random()`.** A shuffle is `mulberry32(seed)`, so `?game=11982` is the
same 52 cards on every device and every year. That is what makes a deal shareable — and it is
why the tests can assert on exact positions.

**States are immutable.** `move()` and friends clone before they change anything, including the
card objects. A shallow clone that shares card objects looks fine until you add undo: flipping
`up` in the "new" state rewrites the history you were about to restore.

**Non-obvious rules are implemented as the rules read.** FreeCell's pack limit is
`(free cells + 1) × 2^empty columns`, and a pack is descending and alternating in colour with
no suit requirement. Spider's movable unit *is* one suit. Yukon lets you lift any face-up card
with its whole stack, in any order. These are the three places people (and this code, twice)
get it wrong.

**No solver included.** There is a FreeCell solver in the site's source, but it only reaches
about 65% of random deals within a couple of seconds, which is not good enough to publish as
"a solver". It is not in this repo on purpose.

## Licence

MIT. See `LICENSE`.
