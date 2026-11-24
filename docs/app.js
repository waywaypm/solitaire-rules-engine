/* app.js — the smallest renderer that can drive Klondike from the engine.
 *
 * Deliberately tiny: it draws piles and translates clicks. Anything that looks like a rule
 * belongs in src/, not here — if this file grows a rule, the split has failed.
 */
(function () {
  'use strict';
  var C = window.Cards, K = window.Klondike;
  var state, history = [], selected = null;

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function cardEl(card, up) {
    var n = el('div', 'card ' + (up ? (C.isRed(card.suit) ? 'red' : 'black') : 'down'));
    if (up) {
      var a = el('div'); a.textContent = C.RANK_LABEL[card.rank] + C.SUIT_CHAR[card.suit];
      var b = el('div', 'foot'); b.textContent = C.SUIT_CHAR[card.suit];
      n.appendChild(a); n.appendChild(b);
    }
    return n;
  }

  function pile(ref) {
    if (ref === 'stock') return state.stock;
    if (ref === 'waste') return state.waste;
    if (ref[0] === 'f') return state.foundations[+ref.slice(1)];
    return state.tableau[+ref.slice(1)];
  }

  function render() {
    var rail = document.getElementById('rail'); rail.textContent = '';
    // stock
    var sc = el('div', 'col stock'); sc.dataset.pile = 'stock';
    if (state.stock.length) { var back = cardEl({rank:1,suit:0}, false); back.dataset.pile = 'stock'; sc.appendChild(back); }
    else { var s0 = el('div', 'slot'); s0.dataset.pile = 'stock'; s0.textContent = state.waste.length ? '\u21bb' : ''; sc.appendChild(s0); }
    var cnt = el('span', 'count'); cnt.textContent = String(state.stock.length); sc.appendChild(cnt);
    rail.appendChild(sc);
    // waste
    var wc = el('div', 'col'); wc.dataset.pile = 'waste';
    var wTop = C.top(state.waste);
    if (wTop) { var we = cardEl(wTop, true); we.dataset.pile = 'waste'; we.dataset.index = String(state.waste.length-1); wc.appendChild(we); }
    else wc.appendChild(el('div', 'slot'));
    rail.appendChild(wc);
    rail.appendChild(el('div', 'col'));
    // foundations
    for (var f = 0; f < 4; f++) {
      var fc = el('div', 'col'); fc.dataset.pile = 'f' + f;
      var ft = C.top(state.foundations[f]);
      if (ft) { var fe = cardEl(ft, true); fe.dataset.pile = 'f' + f; fe.dataset.index = String(state.foundations[f].length-1); fc.appendChild(fe); }
      else fc.appendChild(el('div', 'slot'));
      rail.appendChild(fc);
    }
    // tableau
    var tab = document.getElementById('tableau'); tab.textContent = '';
    for (var c = 0; c < state.tableau.length; c++) {
      var col = el('div', 'col'); col.dataset.pile = 't' + c;
      var p = state.tableau[c];
      if (!p.length) { var s1 = el('div', 'slot'); s1.dataset.pile = 't' + c; col.appendChild(s1); }
      for (var i = 0; i < p.length; i++) {
        var ce = cardEl(p[i], p[i].up);
        ce.dataset.pile = 't' + c; ce.dataset.index = String(i);
        if (p[i].up && selected && selected.pile === 't' + c && i >= selected.index) ce.classList.add('sel');
        col.appendChild(ce);
      }
      tab.appendChild(col);
    }
    document.getElementById('moves').textContent = String(state.moves);
    document.getElementById('score').textContent = String(state.score);
  }

  function apply(res) {
    if (!res.ok) return false;
    history.push(state); state = res.state; selected = null; render(); return true;
  }

  function click(pileRef, index) {
    if (pileRef === 'stock') {
      var r = K.drawFromStock(state);
      if (r.changed) { history.push(state); state = r.state; selected = null; render(); }
      return;
    }
    var p = pile(pileRef);
    if (selected) {
      if (pileRef === selected.pile) { selected = null; render(); return; }
      var mv = K.move(state, selected.pile, selected.index, pileRef);
      if (apply(mv)) return;
      selected = null; render(); return;
    }
    if (!K.grabbable(state, pileRef, index)) { selected = null; render(); return; }
    selected = { pile: pileRef, index: index };
    render();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-pile]');
    if (!t) return;
    click(t.dataset.pile, t.dataset.index != null ? +t.dataset.index : null);
  });

  document.getElementById('new').addEventListener('click', function () {
    var seed = Math.floor(Math.random() * 1e6);
    history = []; selected = null; state = K.deal(seed, 1); render();
    var u = new URL(location.href); u.searchParams.set('game', String(seed));
    history.replaceState ? history.replaceState(null, '', u) : null;
  });

  document.getElementById('undo').addEventListener('click', function () {
    if (!history.length) return;
    state = history.pop(); selected = null; render();
  });

  var seed = parseInt(new URLSearchParams(location.search).get('game'), 10);
  state = K.deal(Number.isFinite(seed) && seed > 0 ? seed : 20261125, 1);
  render();
})();
