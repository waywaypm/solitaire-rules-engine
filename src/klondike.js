/* klondike.js — Klondike rules and state transitions. DOM-free, so `klondike.test.js` can
 * prove the rules without a browser (no headless Chrome on this machine).
 *
 * Piles are addressed by strings so the UI, the tests and any future solver share one
 * vocabulary:
 *   "stock"  "waste"  "f0".."f3" (foundations)  "t0".."t6" (tableau columns)
 */
(function (root) {
  'use strict';

  const C = root.Cards
    || (typeof require === 'function' ? require('./cards.js').Cards : null);

  const TABLEAU_COUNT = 7;

  function deal(seed, drawCount) {
    const draw = drawCount === 3 ? 3 : 1;
    const deck = C.shuffle(C.makeDeck(1), seed >>> 0);
    const tableau = [];
    let i = 0;
    for (let col = 0; col < TABLEAU_COUNT; col++) {
      const pile = [];
      for (let row = 0; row <= col; row++) {
        const card = deck[i++];
        card.up = row === col; // only the bottom card of each column starts face up
        pile.push(card);
      }
      tableau.push(pile);
    }
    const stock = deck.slice(i).map(function (c) { c.up = false; return c; });

    return {
      drawCount: draw,
      seed: seed >>> 0,
      stock: stock,
      waste: [],
      foundations: [[], [], [], []],
      tableau: tableau,
      redeals: 0,
      moves: 0,
      score: 0,
      won: false
    };
  }

  function pileAt(st, ref) {
    if (ref === 'stock') return st.stock;
    if (ref === 'waste') return st.waste;
    if (ref[0] === 'f') return st.foundations[+ref.slice(1)];
    if (ref[0] === 't') return st.tableau[+ref.slice(1)];
    throw new Error('unknown pile ' + ref);
  }

  function isTableau(ref) { return ref[0] === 't'; }
  function isFoundation(ref) { return ref[0] === 'f'; }

  /* Which cards can be picked up at `ref` starting at index `index`? Klondike may lift a
   * face-up descending alternating-colour run out of a column; the waste and foundations
   * only ever give up their top card. */
  function grabbable(st, ref, index) {
    if (ref === 'stock') return false;
    const pile = pileAt(st, ref);
    if (index == null) index = pile.length - 1;
    if (index < 0 || index >= pile.length) return false;
    if (ref === 'waste') return index === pile.length - 1;
    if (isFoundation(ref)) return index === pile.length - 1;
    // tableau: the tail must be face up and strictly descending in alternating colours
    for (let i = index; i < pile.length; i++) {
      if (!pile[i].up) return false;
      if (i > index) {
        const prev = pile[i - 1], cur = pile[i];
        if (prev.rank !== cur.rank + 1) return false;
        if (C.isRed(prev.suit) === C.isRed(cur.suit)) return false;
      }
    }
    return true;
  }

  function canDrop(st, ref, card) {
    if (isFoundation(ref)) return C.canStackFoundation(card, C.top(pileAt(st, ref)));
    if (isTableau(ref)) return C.canStackTableau(card, C.top(pileAt(st, ref)));
    return false;
  }

  /* Tap the stock: turn `drawCount` cards face up onto the waste, or recycle the waste. */
  function drawFromStock(st) {
    const s = C.cloneState(st);
    if (s.stock.length === 0) {
      if (s.waste.length === 0) return { state: s, changed: false, event: 'empty' };
      s.stock = s.waste.slice().reverse().map(function (c) { c.up = false; return c; });
      s.waste = [];
      s.redeals += 1;
      s.moves += 1;
      s.score = Math.max(0, s.score - 100);
      return { state: s, changed: true, event: 'recycle' };
    }
    const n = Math.min(s.drawCount, s.stock.length);
    for (let i = 0; i < n; i++) {
      const card = s.stock.pop();
      card.up = true;
      s.waste.push(card);
    }
    s.moves += 1;
    return { state: s, changed: true, event: 'draw' };
  }

  /* Move `index..` of `from` onto pile `to`. Returns {ok:false, reason} when illegal so the
   * UI can flash a message instead of silently doing nothing. */
  function move(st, from, index, to) {
    if (from === to) return { ok: false, reason: 'same-pile', state: st };
    if (!grabbable(st, from, index)) return { ok: false, reason: 'not-grabbable', state: st };
    const src = pileAt(st, from);
    if (index == null) index = src.length - 1;
    const moving = src.slice(index);
    const card = moving[0];

    // Only an Ace may go to an empty foundation, and only the top waste/tableau card may
    // leave the board: both are already enforced by canDrop.
    if (!canDrop(st, to, card)) return { ok: false, reason: 'illegal-stack', state: st };

    const s = C.cloneState(st);
    const sSrc = pileAt(s, from);
    const sDst = pileAt(s, to);
    sSrc.splice(index); // remove the tail
    for (let i = 0; i < moving.length; i++) sDst.push(moving[i]);

    // Flip the newly exposed tableau card.
    if (isTableau(from) && sSrc.length && !C.top(sSrc).up) {
      C.top(sSrc).up = true;
      s.score += 5;
    }
    s.moves += 1;
    if (isFoundation(to)) s.score += 10;
    if (from === 'waste' && isTableau(to)) s.score += 5;
    // Taking a card back off a foundation costs points. The rules page has documented this
    // since the first version while the code silently did nothing — a scoring table nobody
    // can reproduce is worse than no scoring table.
    if (isFoundation(from) && isTableau(to)) s.score -= 15;

    s.won = C.isWon(s);
    return { ok: true, state: s, moving: moving };
  }

  /* Where should a double-clicked card go? Foundation first, then the leftmost legal
   * tableau column. Returns a ref or null. */
  function autoTarget(st, from, index) {
    const pile = pileAt(st, from);
    if (index == null) index = pile.length - 1;
    if (!grabbable(st, from, index)) return null;
    const moving = pile.slice(index);
    if (moving.length === 1) {
      for (let i = 0; i < st.foundations.length; i++) {
        if (canDrop(st, 'f' + i, moving[0])) return 'f' + i;
      }
    }
    for (let i = 0; i < st.tableau.length; i++) {
      const ref = 't' + i;
      if (ref === from) continue;
      if (canDrop(st, ref, moving[0])) return ref;
    }
    return null;
  }

  /* Any legal move at all? Used by the win check and by "no moves left" hints. */
  function hasMove(st) {
    if (st.stock.length || st.waste.length) return true;
    for (let i = 0; i < st.foundations.length; i++) {
      if (st.foundations[i].length < 13) {
        // a foundation card can always go back to the table, so the game is not stuck
        return true;
      }
    }
    for (let c = 0; c < st.tableau.length; c++) {
      const pile = st.tableau[c];
      for (let i = 0; i < pile.length; i++) {
        if (!grabbable(st, 't' + c, i)) continue;
        const card = pile[i];
        if (i > 0 && pile[i - 1].up && C.canStackTableau(card, pile[i - 1])) continue;
        for (let d = 0; d < st.tableau.length; d++) {
          if (d === c) continue;
          if (canDrop(st, 't' + d, card)) return true;
        }
      }
    }
    return false;
  }

  root.Klondike = {
    deal: deal,
    pileAt: pileAt,
    grabbable: grabbable,
    canDrop: canDrop,
    drawFromStock: drawFromStock,
    move: move,
    autoTarget: autoTarget,
    hasMove: hasMove,
    TABLEAU_COUNT: TABLEAU_COUNT
  };
})(typeof module === 'object' && module.exports ? module.exports : (this || {}));
