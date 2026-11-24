/* spider.js — Spider solitaire rules and state transitions. DOM-free.
 *
 * Two decks (104 cards) dealt into ten columns. Build descending runs regardless of suit,
 * but only a same-suit descending run may be lifted and moved. A complete same-suit run
 * K..A is lifted off the board automatically into a foundation slot.
 *
 * Piles: "stock" | "t0".."t9" | "f0".."f7" (completed runs; eight is the maximum possible
 * with two decks, and eight completed runs is a win).
 */
(function (root) {
  'use strict';

  const C = root.Cards
    || (typeof require === 'function' ? require('./cards.js').Cards : null);

  const COLUMNS = 10;

  /* deal(seed, suits): suits = 1, 2 or 4 — how many distinct suits the 104 cards use.
   * 1 suit = 8 copies of each rank; 4 suits = two full decks. */
  function deal(seed, suits) {
    const suitCount = suits === 4 ? 4 : (suits === 1 ? 1 : 2);
    const cards = [];
    // Two decks' worth of cards, but every card is re-labelled into the chosen suit set so
    // that a 1-suit game really is eight copies of each rank.
    for (let i = 0; i < 104; i++) {
      const suit = i % suitCount;
      const rank = (Math.floor(i / suitCount) % 13) + 1;
      cards.push({ rank: rank, suit: suit, up: false, id: i });
    }
    const deck = C.shuffle(cards, seed >>> 0);

    const tableau = [];
    let idx = 0;
    // 54 cards go face down: rows of 6,6,6,6,6,6,5,5,5,5 in the usual deal. We use the
    // common 5x10 + 4 extra rule: first four columns get 6 cards, the rest 5, and the last
    // card of each column is face up. That is 54 dealt, 50 left for five stock deals.
    for (let col = 0; col < COLUMNS; col++) {
      const count = col < 4 ? 6 : 5;
      const pile = [];
      for (let r = 0; r < count; r++) {
        const card = deck[idx++];
        card.up = r === count - 1;
        pile.push(card);
      }
      tableau.push(pile);
    }
    const stock = deck.slice(idx).map(function (c) { c.up = false; return c; });

    return {
      suits: suitCount,
      seed: seed >>> 0,
      stock: stock,
      tableau: tableau,
      foundations: [[], [], [], [], [], [], [], []],
      moves: 0,
      score: 0,
      completed: 0,
      won: false
    };
  }

  function pileAt(st, ref) {
    if (ref === 'stock') return st.stock;
    if (ref[0] === 't') return st.tableau[+ref.slice(1)];
    if (ref[0] === 'f') return st.foundations[+ref.slice(1)];
    throw new Error('unknown pile ' + ref);
  }

  function isTableau(ref) { return ref[0] === 't'; }

  /* Like Klondike, but a run may only be lifted if every card in it is the same suit. */
  function grabbable(st, ref, index) {
    if (ref === 'stock' || !isTableau(ref)) return false;
    const pile = pileAt(st, ref);
    if (index == null) index = pile.length - 1;
    if (index < 0 || index >= pile.length) return false;
    const tail = pile.slice(index);
    if (!tail.every(function (c) { return c.up; })) return false;
    return C.runIsSameSuit(tail);
  }

  function canDrop(st, ref, card) {
    if (!isTableau(ref)) return false;
    return C.canStackSpider(card, C.top(pileAt(st, ref)));
  }

  /* Deal one card face up onto every column, if a deal is available. */
  function dealRow(st) {
    let s = C.cloneState(st);
    if (s.stock.length < COLUMNS) {
      return { state: s, changed: false, event: 'no-deal' };
    }
    // The rules forbid dealing onto an empty column; we follow it, which also keeps the
    // stock size a multiple of ten.
    for (let i = 0; i < COLUMNS; i++) {
      if (s.tableau[i].length === 0) return { state: s, changed: false, event: 'empty-column' };
    }
    for (let i = 0; i < COLUMNS; i++) {
      const card = s.stock.pop();
      card.up = true;
      s.tableau[i].push(card);
    }
    s.moves += 1;
    s = collectRuns(s);
    return { state: s, changed: true, event: 'deal' };
  }

  /* Lift any complete same-suit K..A run off the bottom of a column into a foundation. */
  function collectRuns(st) {
    const s = C.cloneState(st);
    for (let c = 0; c < s.tableau.length; c++) {
      const pile = s.tableau[c];
      if (pile.length < 13) continue;
      const tail = pile.slice(pile.length - 13);
      if (!C.isFullRun(tail)) continue;
      const slot = s.foundations.findIndex(function (f) { return f.length === 0; });
      if (slot < 0) continue;
      s.foundations[slot] = tail;
      pile.length = pile.length - 13;
      s.completed += 1;
      s.score += 100;
      if (pile.length && !C.top(pile).up) C.top(pile).up = true;
    }
    s.won = s.completed >= 8;
    return s;
  }

  function move(st, from, index, to) {
    if (from === to) return { ok: false, reason: 'same-pile', state: st };
    if (!grabbable(st, from, index)) return { ok: false, reason: 'not-grabbable', state: st };
    const src = pileAt(st, from);
    if (index == null) index = src.length - 1;
    const moving = src.slice(index);
    if (!canDrop(st, to, moving[0])) return { ok: false, reason: 'illegal-stack', state: st };

    let s = C.cloneState(st);
    const sSrc = pileAt(s, from);
    const sDst = pileAt(s, to);
    sSrc.splice(index);
    for (let i = 0; i < moving.length; i++) sDst.push(moving[i]);
    if (sSrc.length && !C.top(sSrc).up) C.top(sSrc).up = true;
    s.moves += 1;
    s = collectRuns(s);
    return { ok: true, state: s, moving: moving };
  }

  function autoTarget(st, from, index) {
    const pile = pileAt(st, from);
    if (index == null) index = pile.length - 1;
    if (!grabbable(st, from, index)) return null;
    const moving = pile.slice(index);
    // Prefer a target where the run joins the same suit, then the fullest column.
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < st.tableau.length; i++) {
      const ref = 't' + i;
      if (ref === from) continue;
      if (!canDrop(st, ref, moving[0])) continue;
      const t = C.top(pileAt(st, ref));
      const score = (t && t.suit === moving[0].suit ? 2 : 0) + pileAt(st, ref).length * 0.01;
      if (score > bestScore) { bestScore = score; best = ref; }
    }
    return best;
  }

  root.Spider = {
    deal: deal,
    pileAt: pileAt,
    grabbable: grabbable,
    canDrop: canDrop,
    dealRow: dealRow,
    collectRuns: collectRuns,
    move: move,
    autoTarget: autoTarget,
    COLUMNS: COLUMNS
  };
})(typeof module === 'object' && module.exports ? module.exports : (this || {}));