/* pyramid.js — Pyramid Solitaire rules and state transitions. DOM-free.
 *
 * Pyramid does not use columns at all: 28 cards form a triangle of seven rows, and a card can
 * only be taken when the two cards resting on it are gone. Pairs that add up to 13 are removed
 * together, and a king (13) is removed on its own. The remaining 24 cards are the stock.
 *
 * Addressing: rows are 0..6, row r holds r+1 cards, and a card is identified by its flat index
 * (row-major). Card (r,c) is covered by (r+1,c) and (r+1,c+1), which is the only geometry the
 * engine needs to know.
 */
(function (root) {
  'use strict';

  const C = root.Cards
    || (typeof require === 'function' ? require('./cards.js').Cards : null);

  const ROWS = 7;
  const PYRAMID_CARDS = 28;   // 1+2+...+7

  function rowStart(r) { return (r * (r + 1)) / 2; }

  function rowOf(index) {
    let r = 0;
    while (r + 1 < ROWS && rowStart(r + 1) <= index) r += 1;
    return r;
  }

  function colOf(index) { return index - rowStart(rowOf(index)); }

  /* Value used for pairing: ace is 1, jack 11, queen 12, king 13. */
  function valueOf(card) { return card.rank; }

  function deal(seed, drawCount) {
    const draw = drawCount === 3 ? 3 : 1;
    const deck = C.shuffle(C.makeDeck(1), seed >>> 0);
    const pyramid = [];
    for (let i = 0; i < PYRAMID_CARDS; i++) {
      const card = deck[i];
      card.up = true;
      pyramid.push({ card: card, gone: false });
    }
    const stock = deck.slice(PYRAMID_CARDS).map(function (c) { c.up = false; return c; });
    return {
      drawCount: draw,
      seed: seed >>> 0,
      pyramid: pyramid,
      stock: stock,
      waste: [],
      redeals: 0,
      moves: 0,
      score: 0,
      removed: 0,
      won: false
    };
  }

  /* Is this pyramid card free to be taken? True when it is still there and both cards that
   * rest on it have already gone. The bottom row is always free. */
  function exposed(st, index) {
    if (index < 0 || index >= st.pyramid.length) return false;
    if (st.pyramid[index].gone) return false;
    const r = rowOf(index);
    if (r === ROWS - 1) return true;
    const c = colOf(index);
    const left = rowStart(r + 1) + c;
    const right = left + 1;
    return st.pyramid[left].gone && st.pyramid[right].gone;
  }

  function canPair(a, b) {
    return valueOf(a) + valueOf(b) === 13;
  }

  /* Pyramid entries are {card, gone}, so a plain clone would leave both states pointing at the
   * same entry objects and `gone = true` would rewrite the undo history in place. */
  function cloneState(st) {
    const s = C.cloneState(st);
    s.pyramid = st.pyramid.map(function (pc) {
      return { card: Object.assign({}, pc.card), gone: pc.gone };
    });
    return s;
  }

  function take(st, a, b) {
    // a and b are {kind:'p'|'w', index}
    const s = cloneState(st);
    const left = a.kind === 'p' ? s.pyramid[a.index] : null;
    const right = b ? (b.kind === 'p' ? s.pyramid[b.index] : null) : null;
    if (left) left.gone = true;
    if (right) right.gone = true;
    // At most one side can be the waste (removePair refuses two waste cards), so pop per side.
    if (a.kind === 'w') s.waste.pop();
    if (b && b.kind === 'w') s.waste.pop();
    s.removed += (left ? 1 : 0) + (right ? 1 : 0);
    s.moves += 1;
    s.score += 5;
    s.won = s.removed >= PYRAMID_CARDS;
    return s;
  }

  /* Remove a single card — only legal for a king (13), which needs no partner. */
  function removeOne(st, ref) {
    if (ref.kind === 'p') {
      if (!exposed(st, ref.index)) return { ok: false, reason: 'covered', state: st };
      const card = st.pyramid[ref.index].card;
      if (valueOf(card) !== 13) return { ok: false, reason: 'needs-pair', state: st };
      return { ok: true, state: take(st, ref, null) };
    }
    const top = C.top(st.waste);
    if (!top) return { ok: false, reason: 'empty-waste', state: st };
    if (valueOf(top) !== 13) return { ok: false, reason: 'needs-pair', state: st };
    return { ok: true, state: take(st, { kind: 'w' }, null) };
  }

  /* Remove two cards that add to 13. Each side must be available: an exposed pyramid card, or
   * the top of the waste. */
  function removePair(st, a, b) {
    const avail = (ref) => {
      if (ref.kind === 'p') return exposed(st, ref.index);
      return st.waste.length > 0;
    };
    if (!avail(a) || !avail(b)) return { ok: false, reason: 'not-available', state: st };
    if (a.kind === b.kind && a.kind === 'p' && a.index === b.index) {
      return { ok: false, reason: 'same-card', state: st };
    }
    if (a.kind === 'w' && b.kind === 'w') return { ok: false, reason: 'one-waste-card', state: st };
    const cardA = a.kind === 'p' ? st.pyramid[a.index].card : C.top(st.waste);
    const cardB = b.kind === 'p' ? st.pyramid[b.index].card : C.top(st.waste);
    if (!canPair(cardA, cardB)) return { ok: false, reason: 'no-sum', state: st };
    // a king pairs with nothing, so it must be taken alone
    if (valueOf(cardA) === 13 || valueOf(cardB) === 13) {
      return { ok: false, reason: 'king-alone', state: st };
    }
    return { ok: true, state: take(st, a, b) };
  }

  /* Draw from the stock; when it is empty, turn the waste back over. */
  function draw(st) {
    let s = cloneState(st);
    if (s.stock.length === 0) {
      if (s.waste.length === 0) return { ok: false, reason: 'empty', state: s };
      s.stock = s.waste.slice().reverse().map(function (c) { c.up = false; return c; });
      s.waste = [];
      s.redeals += 1;
      s.moves += 1;
      return { ok: true, state: s, event: 'recycle' };
    }
    const n = Math.min(s.drawCount, s.stock.length);
    for (let i = 0; i < n; i++) {
      const card = s.stock.pop();
      card.up = true;
      s.waste.push(card);
    }
    s.moves += 1;
    return { ok: true, state: s, event: 'draw' };
  }

  /* Every currently legal action, used by the hint button and by tests. */
  function legalMoves(st) {
    const out = [];
    const free = [];
    for (let i = 0; i < st.pyramid.length; i++) {
      if (exposed(st, i)) free.push(i);
    }
    // kings on their own
    free.forEach(function (i) {
      if (valueOf(st.pyramid[i].card) === 13) out.push({ kind: 'one', a: { kind: 'p', index: i } });
    });
    const wasteTop = C.top(st.waste);
    if (wasteTop && valueOf(wasteTop) === 13) out.push({ kind: 'one', a: { kind: 'w' } });
    // pairs among exposed cards
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const a = st.pyramid[free[i]].card;
        const b = st.pyramid[free[j]].card;
        if (valueOf(a) !== 13 && valueOf(b) !== 13 && canPair(a, b)) {
          out.push({ kind: 'pair', a: { kind: 'p', index: free[i] }, b: { kind: 'p', index: free[j] } });
        }
      }
    }
    // pairs with the waste
    if (wasteTop && valueOf(wasteTop) !== 13) {
      free.forEach(function (i) {
        const card = st.pyramid[i].card;
        if (valueOf(card) !== 13 && canPair(card, wasteTop)) {
          out.push({ kind: 'pair', a: { kind: 'p', index: i }, b: { kind: 'w' } });
        }
      });
    }
    return out;
  }

  root.Pyramid = {
    deal: deal,
    exposed: exposed,
    canPair: canPair,
    removeOne: removeOne,
    removePair: removePair,
    draw: draw,
    legalMoves: legalMoves,
    rowOf: rowOf,
    colOf: colOf,
    rowStart: rowStart,
    valueOf: valueOf,
    ROWS: ROWS,
    PYRAMID_CARDS: PYRAMID_CARDS
  };
})(typeof module === 'object' && module.exports ? module.exports : (this || {}));
