/* cards.js — pure card/solitaire primitives. No DOM, no globals beyond `Cards`.
 *
 * Why this file is DOM-free: this machine has no working headless browser (§7.8 of the
 * parent repo's AGENTS.md), so the only way to prove the rules are right is to run the
 * engine under node and assert on it. Every rule lives here; the UI layer only renders
 * state and translates clicks into calls.
 *
 * Card encoding: rank 1..13 (A..K), suit 0..3 (spades, hearts, diamonds, clubs).
 * Colour: suits 1 and 2 are red.
 */
(function (root) {
  'use strict';

  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const SUIT_CHAR = { 0: '\u2660', 1: '\u2665', 2: '\u2666', 3: '\u2663' };
  const RANK_LABEL = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function isRed(suit) {
    return suit === 1 || suit === 2;
  }

  function cardLabel(card) {
    return RANK_LABEL[card.rank] + SUIT_CHAR[card.suit];
  }

  /* Deterministic shuffle.
   *
   * A game number has to mean the same deal on every device and every reload — that is
   * the whole point of "game #11982" in FreeCell and of shareable links. Math.random()
   * would break that, so we use mulberry32 seeded by the game number.
   */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDeck(decks) {
    const out = [];
    for (let d = 0; d < (decks || 1); d++) {
      for (let s = 0; s < 4; s++) {
        for (let r = 1; r <= 13; r++) {
          out.push({ rank: r, suit: s, id: d * 52 + s * 13 + r, up: false });
        }
      }
    }
    return out;
  }

  function shuffle(cards, seed) {
    const rnd = mulberry32(seed);
    const a = cards.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // ---------------------------------------------------------------- piles
  //
  // A pile is a plain array of cards plus a `kind`. Rules take (from, to) pile pairs and
  // decide whether the move is legal; nothing here knows about pixels.

  function pile(cards, kind, opts) {
    const p = cards ? cards.slice() : [];
    p.kind = kind || 'free';
    if (opts) Object.assign(p, opts);
    return p;
  }

  function top(p) {
    return p.length ? p[p.length - 1] : null;
  }

  /* Klondike tableau: descending, alternating colour. */
  function canStackTableau(card, onto) {
    if (!onto) return card.rank === 13; // only a King may start an empty column
    return onto.up && isRed(onto.suit) !== isRed(card.suit) && onto.rank === card.rank + 1;
  }

  /* Klondike foundation: same suit, ascending from Ace. */
  function canStackFoundation(card, onto) {
    if (!onto) return card.rank === 1;
    return onto.suit === card.suit && onto.rank === card.rank - 1;
  }

  /* FreeCell tableau: descending, alternating colour, no empty-column restriction. */
  function canStackFreeCell(card, onto) {
    if (!onto) return true;
    return isRed(onto.suit) !== isRed(card.suit) && onto.rank === card.rank + 1;
  }

  /* Spider tableau: descending regardless of suit; a run may only be moved while it is
   * itself same-suit descending (checked by caller via runIsSameSuit). */
  function canStackSpider(card, onto) {
    if (!onto) return true;
    return onto.up && onto.rank === card.rank + 1;
  }

  /* FreeCell's movable unit: descending in alternating colours, suits irrelevant.
   * (A same-suit run is a *subset* of this, which is why using runIsSameSuit here was a
   * rule bug: it forbade legal moves.) */
  function runIsAlternating(cards) {
    for (let i = 1; i < cards.length; i++) {
      if (cards[i - 1].rank !== cards[i].rank + 1) return false;
      if (isRed(cards[i - 1].suit) === isRed(cards[i].suit)) return false;
    }
    return true;
  }

  function runIsSameSuit(cards) {
    for (let i = 1; i < cards.length; i++) {
      if (cards[i - 1].suit !== cards[i].suit) return false;
      if (cards[i - 1].rank !== cards[i].rank + 1) return false;
    }
    return true;
  }

  /* A complete descending same-suit run K..A that can be lifted off a Spider column. */
  function isFullRun(cards) {
    return cards.length === 13 && cards[0].rank === 13 && cards[12].rank === 1
      && runIsSameSuit(cards);
  }

  // ---------------------------------------------------------------- state helpers

  /* Deep-ish clone: arrays of cards are copied, scalars carried over. `drawCount` must
   * survive this — losing it silently turns every draw into a no-op. */
  function cloneState(st) {
    const out = {};
    for (const k in st) {
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      const v = st[k];
      if (Array.isArray(v)) {
        // Copy card objects too, not just the arrays. A shallow slice leaves the two states
        // sharing card objects, so flipping `up` in the clone silently rewrites history and
        // undo stops working. Pyramid hit the same trap harder with its {card, gone} entries.
        out[k] = v.map(function (item) {
          if (Array.isArray(item)) return item.slice();
          if (item && typeof item === 'object') return Object.assign({}, item);
          return item;
        });
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function isWon(st) {
    if (!st.foundations) return false;
    for (let i = 0; i < st.foundations.length; i++) {
      if (st.foundations[i].length !== 13) return false;
    }
    return st.foundations.length > 0;
  }

  function countFoundation(st) {
    let n = 0;
    for (let i = 0; i < st.foundations.length; i++) n += st.foundations[i].length;
    return n;
  }

  root.Cards = {
    SUITS: SUITS,
    SUIT_CHAR: SUIT_CHAR,
    RANK_LABEL: RANK_LABEL,
    isRed: isRed,
    cardLabel: cardLabel,
    mulberry32: mulberry32,
    makeDeck: makeDeck,
    shuffle: shuffle,
    pile: pile,
    top: top,
    canStackTableau: canStackTableau,
    canStackFoundation: canStackFoundation,
    canStackFreeCell: canStackFreeCell,
    canStackSpider: canStackSpider,
    runIsSameSuit: runIsSameSuit,
    runIsAlternating: runIsAlternating,
    isFullRun: isFullRun,
    cloneState: cloneState,
    isWon: isWon,
    countFoundation: countFoundation
  };
})(typeof module === 'object' && module.exports ? module.exports : (this || {}));
