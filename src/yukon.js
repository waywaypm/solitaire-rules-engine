/* yukon.js — Yukon solitaire rules and state transitions. DOM-free.
 *
 * Yukon is Klondike's looser cousin: the whole deck is dealt, there is no stock, and — this is
 * the rule that changes everything — you may pick up any face-up card together with everything
 * stacked on it, no matter what is in that stack or in what order. That makes it feel far more
 * open than Klondike, and far easier to accidentally make unwinnable.
 *
 * Piles: "t0".."t6" (columns) | "f0".."f3" (foundations). No stock, no waste.
 */
(function (root) {
  'use strict';

  const C = root.Cards
    || (typeof require === 'function' ? require('./cards.js').Cards : null);

  const COLUMNS = 7;

  function deal(seed) {
    const deck = C.shuffle(C.makeDeck(1), seed >>> 0);
    const tableau = [];
    let i = 0;
    // Twelve face-down cards: the first column gets 1 card and no face-down ones; columns
    // 2..7 get one more than their index, of which all but the last are face down. That is
    // 28 cards, 12 of them face down.
    for (let col = 0; col < COLUMNS; col++) {
      const pile = [];
      for (let row = 0; row <= col; row++) {
        const card = deck[i++];
        card.up = row === col;
        pile.push(card);
      }
      tableau.push(pile);
    }
    // The remaining 24 cards go face up, four onto each of the last six columns.
    for (let col = 1; col < COLUMNS; col++) {
      for (let k = 0; k < 4; k++) {
        const card = deck[i++];
        card.up = true;
        tableau[col].push(card);
      }
    }
    return {
      seed: seed >>> 0,
      stock: null,
      waste: null,
      foundations: [[], [], [], []],
      tableau: tableau,
      moves: 0,
      score: 0,
      won: false
    };
  }

  function pileAt(st, ref) {
    if (ref[0] === 't') return st.tableau[+ref.slice(1)];
    if (ref[0] === 'f') return st.foundations[+ref.slice(1)];
    throw new Error('unknown pile ' + ref);
  }

  function isTableau(ref) { return ref[0] === 't'; }
  function isFoundation(ref) { return ref[0] === 'f'; }

  /* Yukon's defining rule: any face-up card may be lifted, together with everything on top of
   * it — the rest of the stack does not have to be in sequence. */
  function grabbable(st, ref, index) {
    if (!isTableau(ref)) {
      const pile = pileAt(st, ref);
      if (index == null) index = pile.length - 1;
      return index === pile.length - 1;
    }
    const pile = pileAt(st, ref);
    if (index == null) index = pile.length - 1;
    if (index < 0 || index >= pile.length) return false;
    return pile[index].up === true;
  }

  function canDrop(st, ref, card) {
    if (isFoundation(ref)) return C.canStackFoundation(card, C.top(pileAt(st, ref)));
    if (isTableau(ref)) {
      const onto = C.top(pileAt(st, ref));
      // Tableau builds down by rank only — suit and colour are irrelevant in Yukon.
      if (!onto) return card.rank === 13;
      return onto.rank === card.rank + 1;
    }
    return false;
  }

  function move(st, from, index, to) {
    if (from === to) return { ok: false, reason: 'same-pile', state: st };
    if (!grabbable(st, from, index)) return { ok: false, reason: 'not-grabbable', state: st };
    const src = pileAt(st, from);
    if (index == null) index = src.length - 1;
    const moving = src.slice(index);
    if (!canDrop(st, to, moving[0])) return { ok: false, reason: 'illegal-stack', state: st };

    const s = C.cloneState(st);
    const sSrc = pileAt(s, from);
    const sDst = pileAt(s, to);
    sSrc.splice(index);
    for (let k = 0; k < moving.length; k++) sDst.push(moving[k]);
    if (isTableau(from) && sSrc.length && !C.top(sSrc).up) {
      C.top(sSrc).up = true;
      s.score += 5;
    }
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
    }
    for (let i = 0; i < st.tableau.length; i++) {
      const ref = 't' + i;
      if (ref === from) continue;
      if (canDrop(st, ref, moving[0])) return ref;
    }
    return null;
  }

  root.Yukon = {
    deal: deal,
    pileAt: pileAt,
    grabbable: grabbable,
    canDrop: canDrop,
    move: move,
    autoTarget: autoTarget,
    COLUMNS: COLUMNS
  };
})(typeof module === 'object' && module.exports ? module.exports : (this || {}));
