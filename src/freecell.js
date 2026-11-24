/* freecell.js — FreeCell rules and state transitions. DOM-free.
 *
 * Every card is dealt face up into eight columns; four free cells each hold one card; four
 * foundations build up in suit from the ace. Unlike Klondike there is no stock and no luck
 * after the deal — every game (except a handful of known dead deals) is winnable.
 *
 * Piles: "c0".."c3" (free cells) | "t0".."t7" (columns) | "f0".."f3" (foundations)
 */
(function (root) {
  'use strict';

  const C = root.Cards
    || (typeof require === 'function' ? require('./cards.js').Cards : null);

  const COLUMNS = 8;
  const CELLS = 4;

  function deal(seed) {
    const deck = C.shuffle(C.makeDeck(1), seed >>> 0).map(function (c) {
      c.up = true;
      return c;
    });
    const tableau = [];
    for (let i = 0; i < COLUMNS; i++) tableau.push([]);
    deck.forEach(function (card, i) { tableau[i % COLUMNS].push(card); });
    return {
      seed: seed >>> 0,
      cells: [[], [], [], []],
      foundations: [[], [], [], []],
      tableau: tableau,
      moves: 0,
      score: 0,
      won: false
    };
  }

  function pileAt(st, ref) {
    if (ref[0] === 'c') return st.cells[+ref.slice(1)];
    if (ref[0] === 't') return st.tableau[+ref.slice(1)];
    if (ref[0] === 'f') return st.foundations[+ref.slice(1)];
    throw new Error('unknown pile ' + ref);
  }

  function isCell(ref) { return ref[0] === 'c'; }
  function isTableau(ref) { return ref[0] === 't'; }
  function isFoundation(ref) { return ref[0] === 'f'; }

  /* FreeCell's movement limit: a run of n cards needs (free cells + 1) * 2^(empty columns)
   * slots, counting the destination column. Without this rule the game is far too easy. */
  function runCapacity(st, destRef) {
    let freeCells = 0;
    st.cells.forEach(function (c) { if (c.length === 0) freeCells += 1; });
    let emptyCols = 0;
    st.tableau.forEach(function (p, i) {
      if (p.length === 0 && 't' + i !== destRef) emptyCols += 1;
    });
    return (freeCells + 1) * Math.pow(2, emptyCols);
  }

  function grabbable(st, ref, index) {
    const pile = pileAt(st, ref);
    if (index == null) index = pile.length - 1;
    if (index < 0 || index >= pile.length) return false;
    if (isCell(ref) || isFoundation(ref)) return index === pile.length - 1;
    // Capacity depends on the destination, so it is enforced in move(); here we only ask
    // whether the tail is a legal pack. In FreeCell that is descending in alternating
    // colours — NOT descending in one suit.
    return C.runIsAlternating(pile.slice(index));
  }

  function canDrop(st, ref, card) {
    if (isFoundation(ref)) return C.canStackFoundation(card, C.top(pileAt(st, ref)));
    if (isCell(ref)) return pileAt(st, ref).length === 0;
    if (isTableau(ref)) return C.canStackFreeCell(card, C.top(pileAt(st, ref)));
    return false;
  }

  function move(st, from, index, to) {
    if (from === to) return { ok: false, reason: 'same-pile', state: st };
    if (!grabbable(st, from, index)) return { ok: false, reason: 'not-grabbable', state: st };
    const src = pileAt(st, from);
    if (index == null) index = src.length - 1;
    const moving = src.slice(index);
    if (!canDrop(st, to, moving[0])) return { ok: false, reason: 'illegal-stack', state: st };
    // the destination counts toward capacity only when moving a run into a column
    if (moving.length > 1 && isTableau(to)) {
      if (moving.length > runCapacity(st, to)) return { ok: false, reason: 'too-many-cards', state: st };
    }

    const s = C.cloneState(st);
    const sSrc = pileAt(s, from);
    const sDst = pileAt(s, to);
    sSrc.splice(index);
    for (let i = 0; i < moving.length; i++) sDst.push(moving[i]);
    s.moves += 1;
    if (isFoundation(to)) s.score += 10;
    s.won = C.isWon(s);
    return { ok: true, state: s, moving: moving };
  }

  function autoTarget(st, from, index) {
    const pile = pileAt(st, from);
    if (index == null) index = pile.length - 1;
    if (!grabbable(st, from, index)) return null;
    const moving = pile.slice(index);
    if (moving.length === 1) {
      for (let i = 0; i < st.foundations.length; i++) {
        if (canDrop(st, 'f' + i, moving[0])) return 'f' + i;
      }
      // a single card into a free cell is the second-best automatic move, but only when it
      // unblocks a column; the UI lets the player decide, so we skip it here.
    }
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < st.tableau.length; i++) {
      const ref = 't' + i;
      if (ref === from) continue;
      if (!canDrop(st, ref, moving[0])) continue;
      if (moving.length > runCapacity(st, ref)) continue;
      const t = C.top(pileAt(st, ref));
      const score = (t && t.suit === moving[0].suit ? 2 : 0) + pileAt(st, ref).length * 0.01;
      if (score > bestScore) { bestScore = score; best = ref; }
    }
    return best;
  }

  root.FreeCell = {
    deal: deal,
    pileAt: pileAt,
    grabbable: grabbable,
    canDrop: canDrop,
    runCapacity: runCapacity,
    move: move,
    autoTarget: autoTarget,
    COLUMNS: COLUMNS,
    CELLS: CELLS
  };
})(typeof module === 'object' && module.exports ? module.exports : (this || {}));