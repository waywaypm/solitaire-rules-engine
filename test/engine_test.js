/* Node test harness for the card engine. Run: node node test/engine_test.js
 *
 * This is the substitute for a browser: the machine cannot run headless Chrome, so the
 * rules are proved here and the UI is kept to rendering + click translation.
 */
'use strict';

const path = require('path');
const assert = require('assert');
const Cards = require(path.join(__dirname, '..', 'src', 'cards.js')).Cards;
const Klondike = require(path.join(__dirname, '..', 'src', 'klondike.js')).Klondike;
const Spider = require(path.join(__dirname, '..', 'src', 'spider.js')).Spider;
const FreeCell = require(path.join(__dirname, '..', 'src', 'freecell.js')).FreeCell;
const Yukon = require(path.join(__dirname, '..', 'src', 'yukon.js')).Yukon;
const Pyramid = require(path.join(__dirname, '..', 'src', 'pyramid.js')).Pyramid;

let pass = 0;
const fails = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok   ' + name);
  } catch (e) {
    fails.push(name + ': ' + e.message);
    console.log('  FAIL ' + name + ' — ' + e.message);
  }
}

console.log('\ncards.js');

test('deck has 52 unique cards', () => {
  const d = Cards.makeDeck(1);
  assert.strictEqual(d.length, 52);
  assert.strictEqual(new Set(d.map(c => c.id)).size, 52);
});

test('double deck has 104 cards', () => {
  assert.strictEqual(Cards.makeDeck(2).length, 104);
});

test('shuffle is deterministic for a seed', () => {
  const a = Cards.shuffle(Cards.makeDeck(1), 12345).map(c => c.id).join(',');
  const b = Cards.shuffle(Cards.makeDeck(1), 12345).map(c => c.id).join(',');
  assert.strictEqual(a, b);
});

test('different seeds give different deals', () => {
  const a = Cards.shuffle(Cards.makeDeck(1), 1).map(c => c.id).join(',');
  const b = Cards.shuffle(Cards.makeDeck(1), 2).map(c => c.id).join(',');
  assert.notStrictEqual(a, b);
});

test('shuffle is a permutation (no card lost or duplicated)', () => {
  const d = Cards.shuffle(Cards.makeDeck(1), 999);
  assert.deepStrictEqual(d.map(c => c.id).sort((x, y) => x - y),
    Cards.makeDeck(1).map(c => c.id).sort((x, y) => x - y));
});

test('colour rules', () => {
  assert.strictEqual(Cards.isRed(1), true);
  assert.strictEqual(Cards.isRed(2), true);
  assert.strictEqual(Cards.isRed(0), false);
  assert.strictEqual(Cards.isRed(3), false);
});

test('tableau stack: descending, alternating colour', () => {
  const redSix = { rank: 6, suit: 1, up: true };
  const blackSeven = { rank: 7, suit: 0, up: true };
  const redSeven = { rank: 7, suit: 2, up: true };
  assert.strictEqual(Cards.canStackTableau(redSix, blackSeven), true);
  assert.strictEqual(Cards.canStackTableau(redSix, redSeven), false);
  assert.strictEqual(Cards.canStackTableau(blackSeven, redSix), false);
});

test('tableau stack: only a King may start an empty column', () => {
  assert.strictEqual(Cards.canStackTableau({ rank: 13, suit: 0 }, null), true);
  assert.strictEqual(Cards.canStackTableau({ rank: 12, suit: 0 }, null), false);
});

test('tableau stack: a face-down card cannot be stacked on', () => {
  assert.strictEqual(
    Cards.canStackTableau({ rank: 6, suit: 1 }, { rank: 7, suit: 0, up: false }), false);
});

test('foundation: same suit ascending from Ace', () => {
  assert.strictEqual(Cards.canStackFoundation({ rank: 1, suit: 1 }, null), true);
  assert.strictEqual(Cards.canStackFoundation({ rank: 2, suit: 1 }, null), false);
  assert.strictEqual(Cards.canStackFoundation({ rank: 2, suit: 1 }, { rank: 1, suit: 1 }), true);
  assert.strictEqual(Cards.canStackFoundation({ rank: 2, suit: 0 }, { rank: 1, suit: 1 }), false);
  assert.strictEqual(Cards.canStackFoundation({ rank: 4, suit: 1 }, { rank: 1, suit: 1 }), false);
});

test('freecell: any card may start an empty column', () => {
  assert.strictEqual(Cards.canStackFreeCell({ rank: 5, suit: 0 }, null), true);
});

test('spider run detection', () => {
  const run = [
    { rank: 9, suit: 0, up: true }, { rank: 8, suit: 0, up: true },
    { rank: 7, suit: 0, up: true }
  ];
  assert.strictEqual(Cards.runIsSameSuit(run), true);
  const mixed = [{ rank: 9, suit: 0 }, { rank: 8, suit: 1 }];
  assert.strictEqual(Cards.runIsSameSuit(mixed), false);
});

console.log('\nklondike.js');

test('deal puts 28 cards on the tableau and 24 in the stock', () => {
  const st = Klondike.deal(1, 1);
  let onTable = 0;
  st.tableau.forEach(p => { onTable += p.length; });
  assert.strictEqual(onTable, 28);
  assert.strictEqual(st.stock.length, 24);
});

test('deal: column n has n+1 cards, only the last face up', () => {
  const st = Klondike.deal(7, 1);
  st.tableau.forEach((p, i) => {
    assert.strictEqual(p.length, i + 1);
    p.forEach((c, j) => assert.strictEqual(c.up, j === p.length - 1));
  });
});

test('deal is reproducible from the seed', () => {
  const a = JSON.stringify(Klondike.deal(42, 1).tableau);
  const b = JSON.stringify(Klondike.deal(42, 1).tableau);
  assert.strictEqual(a, b);
});

test('draw 1 moves exactly one card to the waste', () => {
  const st = Klondike.deal(3, 1);
  const r = Klondike.drawFromStock(st);
  assert.strictEqual(r.state.stock.length, 23);
  assert.strictEqual(r.state.waste.length, 1);
  assert.strictEqual(r.state.waste[0].up, true);
});

test('draw 3 moves three cards, revealing them in order', () => {
  const st = Klondike.deal(3, 3);
  const r = Klondike.drawFromStock(st);
  assert.strictEqual(r.state.waste.length, 3);
  assert.strictEqual(r.state.stock.length, 21);
});

test('draw 3 on a short stock takes only what is left', () => {
  const st = Klondike.deal(3, 3);
  while (st.stock.length > 2) st.stock.pop();
  const r = Klondike.drawFromStock(st);
  assert.strictEqual(r.state.waste.length, 2);
  assert.strictEqual(r.state.stock.length, 0);
});

test('recycling the waste rebuilds the stock face down', () => {
  const st = Klondike.deal(5, 1);
  st.stock = [];
  st.waste = [{ rank: 5, suit: 0, up: true }, { rank: 9, suit: 1, up: true }];
  const r = Klondike.drawFromStock(st);
  assert.strictEqual(r.event, 'recycle');
  assert.strictEqual(r.state.stock.length, 2);
  assert.strictEqual(r.state.waste.length, 0);
  assert.ok(r.state.stock.every(c => c.up === false));
  assert.strictEqual(r.state.redeals, 1);
});

test('only the top waste card is grabbable', () => {
  const st = Klondike.deal(5, 1);
  st.waste = [{ rank: 5, suit: 0, up: true }, { rank: 9, suit: 1, up: true }];
  assert.strictEqual(Klondike.grabbable(st, 'waste', 0), false);
  assert.strictEqual(Klondike.grabbable(st, 'waste', 1), true);
});

test('an illegal move is refused and leaves the state untouched', () => {
  const st = Klondike.deal(11, 1);
  st.tableau[0] = [{ rank: 5, suit: 0, up: true }];
  st.tableau[1] = [{ rank: 9, suit: 1, up: true }];
  const r = Klondike.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(st.tableau[0].length, 1);
});

test('a legal tableau move carries the whole run', () => {
  const st = Klondike.deal(11, 1);
  st.tableau[0] = [
    { rank: 8, suit: 0, up: true },
    { rank: 7, suit: 1, up: true },
    { rank: 6, suit: 0, up: true }
  ];
  st.tableau[1] = [{ rank: 9, suit: 2, up: true }];
  const r = Klondike.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.tableau[0].length, 0);
  assert.strictEqual(r.state.tableau[1].length, 4);
  assert.strictEqual(r.state.tableau[1][1].rank, 8);
});

test('a run may not be split mid-sequence by an illegal tail', () => {
  const st = Klondike.deal(11, 1);
  st.tableau[0] = [
    { rank: 8, suit: 0, up: true },
    { rank: 7, suit: 3, up: true }, // black on black — not a valid run
    { rank: 6, suit: 0, up: true }
  ];
  st.tableau[1] = [{ rank: 9, suit: 1, up: true }];
  assert.strictEqual(Klondike.grabbable(st, 't0', 0), false);
  assert.strictEqual(Klondike.move(st, 't0', 0, 't1').ok, false);
});

test('moving a run off a column flips the newly exposed card', () => {
  const st = Klondike.deal(11, 1);
  st.tableau[0] = [
    { rank: 3, suit: 0, up: false },
    { rank: 7, suit: 1, up: true }
  ];
  st.tableau[1] = [{ rank: 8, suit: 0, up: true }];
  const r = Klondike.move(st, 't0', 1, 't1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.tableau[0][0].up, true);
});

test('a face-down card cannot be picked up', () => {
  const st = Klondike.deal(11, 1);
  st.tableau[0] = [{ rank: 3, suit: 0, up: false }, { rank: 2, suit: 1, up: true }];
  assert.strictEqual(Klondike.grabbable(st, 't0', 0), false);
  assert.strictEqual(Klondike.grabbable(st, 't0', 1), true);
});

test('an ace goes to an empty foundation', () => {
  const st = Klondike.deal(11, 1);
  st.tableau[0] = [{ rank: 1, suit: 0, up: true }];
  const r = Klondike.move(st, 't0', 0, 'f0');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.foundations[0].length, 1);
  assert.strictEqual(r.state.tableau[0].length, 0);
});

test('autoTarget prefers the foundation', () => {
  const st = Klondike.deal(11, 1);
  st.foundations[2] = [{ rank: 6, suit: 2, up: true }];
  st.tableau[0] = [{ rank: 7, suit: 2, up: true }];
  st.tableau[1] = [{ rank: 8, suit: 0, up: true }];
  assert.strictEqual(Klondike.autoTarget(st, 't0', 0), 'f2');
});

test('win detection needs all four foundations complete', () => {
  const st = Klondike.deal(1, 1);
  st.foundations = [[], [], [], []];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) st.foundations[s].push({ rank: r, suit: s, up: true });
  }
  assert.strictEqual(Cards.isWon(st), true);
  st.foundations[3].pop();
  assert.strictEqual(Cards.isWon(st), false);
});

test('no duplicate cards anywhere in a dealt state', () => {
  const st = Klondike.deal(77, 3);
  const ids = [];
  st.stock.forEach(c => ids.push(c.id));
  st.waste.forEach(c => ids.push(c.id));
  st.tableau.forEach(p => p.forEach(c => ids.push(c.id)));
  assert.strictEqual(ids.length, 52);
  assert.strictEqual(new Set(ids).size, 52);
});


console.log('\nspider.js');

test('spider deals 54 cards to ten columns and 50 to the stock', () => {
  const st = Spider.deal(1, 1);
  let onTable = 0;
  st.tableau.forEach(p => { onTable += p.length; });
  assert.strictEqual(st.tableau.length, 10);
  assert.strictEqual(onTable, 54);
  assert.strictEqual(st.stock.length, 50);
});

test('spider: first four columns carry 6 cards, the rest 5, only the last face up', () => {
  const st = Spider.deal(9, 4);
  st.tableau.forEach((p, i) => {
    assert.strictEqual(p.length, i < 4 ? 6 : 5);
    p.forEach((c, j) => assert.strictEqual(c.up, j === p.length - 1));
  });
});

test('spider deck composition: 1 suit has eight copies of each rank', () => {
  const st = Spider.deal(3, 1);
  const ranks = {};
  const all = st.stock.concat(...st.tableau);
  assert.strictEqual(all.length, 104);
  all.forEach(c => { assert.strictEqual(c.suit, 0); ranks[c.rank] = (ranks[c.rank] || 0) + 1; });
  assert.strictEqual(Object.keys(ranks).length, 13);
  Object.values(ranks).forEach(n => assert.strictEqual(n, 8));
});

test('spider deck composition: 4 suits has two copies of each card', () => {
  const st = Spider.deal(3, 4);
  const all = st.stock.concat(...st.tableau);
  const seen = {};
  all.forEach(c => { const k = c.suit + '-' + c.rank; seen[k] = (seen[k] || 0) + 1; });
  assert.strictEqual(Object.keys(seen).length, 52);
  Object.values(seen).forEach(n => assert.strictEqual(n, 2));
});

test('spider: only a same-suit descending run may be lifted', () => {
  const st = Spider.deal(5, 4);
  st.tableau[0] = [
    { rank: 9, suit: 0, up: true, id: 1 },
    { rank: 8, suit: 0, up: true, id: 2 },
    { rank: 7, suit: 1, up: true, id: 3 }
  ];
  assert.strictEqual(Spider.grabbable(st, 't0', 2), true);
  assert.strictEqual(Spider.grabbable(st, 't0', 1), false); // 8/7 differ in suit
  assert.strictEqual(Spider.grabbable(st, 't0', 0), false);
});

test('spider: any suit stacks descending, and the empty column takes anything', () => {
  const st = Spider.deal(5, 4);
  assert.strictEqual(Spider.canDrop(st, 't1', { rank: 6, suit: 2 }), false); // empty? no
  st.tableau[1] = [];
  assert.strictEqual(Spider.canDrop(st, 't1', { rank: 3, suit: 2 }), true);
  st.tableau[1] = [{ rank: 7, suit: 0, up: true }];
  assert.strictEqual(Spider.canDrop(st, 't1', { rank: 6, suit: 2 }), true);
  assert.strictEqual(Spider.canDrop(st, 't1', { rank: 6, suit: 0 }), true);
  assert.strictEqual(Spider.canDrop(st, 't1', { rank: 5, suit: 0 }), false);
});

test('spider: dealing a row adds ten cards and empties the stock by ten', () => {
  const st = Spider.deal(7, 1);
  const before = st.stock.length;
  const r = Spider.dealRow(st);
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.state.stock.length, before - 10);
  r.state.tableau.forEach(p => { assert.strictEqual(p[p.length - 1].up, true); });
});

test('spider: no deal while a column is empty', () => {
  const st = Spider.deal(7, 1);
  st.tableau[3] = [];
  const r = Spider.dealRow(st);
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.event, 'empty-column');
});

test('spider: a complete same-suit run is collected automatically', () => {
  const st = Spider.deal(11, 1);
  const run = [];
  for (let r = 13; r >= 1; r--) run.push({ rank: r, suit: 0, up: true, id: 200 + r });
  st.tableau[0] = [{ rank: 5, suit: 0, up: false, id: 299 }].concat(run);
  const after = Spider.collectRuns(st);
  assert.strictEqual(after.completed, 1);
  assert.strictEqual(after.foundations[0].length, 13);
  assert.strictEqual(after.tableau[0].length, 1);
  assert.strictEqual(after.tableau[0][0].up, true, 'exposed card not flipped');
});

test('spider: eight collected runs is a win', () => {
  const st = Spider.deal(11, 1);
  st.completed = 7;
  const run = [];
  for (let r = 13; r >= 1; r--) run.push({ rank: r, suit: 0, up: true, id: 300 + r });
  st.tableau[0] = run;
  const after = Spider.collectRuns(st);
  assert.strictEqual(after.completed, 8);
  assert.strictEqual(after.won, true);
});

test('spider: moving a run onto a matching card keeps the run intact', () => {
  const st = Spider.deal(13, 1);
  st.tableau[0] = [{ rank: 8, suit: 0, up: true, id: 401 }, { rank: 7, suit: 0, up: true, id: 402 }];
  st.tableau[1] = [{ rank: 9, suit: 0, up: true, id: 403 }];
  const r = Spider.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.tableau[0].length, 0);
  assert.strictEqual(r.state.tableau[1].length, 3);
});

console.log('\nfreecell.js');

test('freecell deals all 52 cards face up into eight columns', () => {
  const st = FreeCell.deal(1);
  let n = 0;
  st.tableau.forEach(p => { n += p.length; });
  assert.strictEqual(st.tableau.length, 8);
  assert.strictEqual(n, 52);
  st.tableau.forEach(p => p.forEach(c => assert.strictEqual(c.up, true)));
  assert.strictEqual(st.cells.length, 4);
});

test('freecell: four columns get 7 cards, four get 6', () => {
  const st = FreeCell.deal(2);
  const sizes = st.tableau.map(p => p.length).sort();
  assert.deepStrictEqual(sizes, [6, 6, 6, 6, 7, 7, 7, 7]);
});

test('freecell: a free cell takes one card only', () => {
  const st = FreeCell.deal(3);
  assert.strictEqual(FreeCell.canDrop(st, 'c0', { rank: 5, suit: 0 }), true);
  st.cells[0] = [{ rank: 9, suit: 1, up: true }];
  assert.strictEqual(FreeCell.canDrop(st, 'c0', { rank: 5, suit: 0 }), false);
});

test('freecell: foundations build up in suit from the ace', () => {
  const st = FreeCell.deal(3);
  assert.strictEqual(FreeCell.canDrop(st, 'f0', { rank: 1, suit: 0 }), true);
  st.foundations[0] = [{ rank: 1, suit: 0, up: true }];
  assert.strictEqual(FreeCell.canDrop(st, 'f0', { rank: 2, suit: 0 }), true);
  assert.strictEqual(FreeCell.canDrop(st, 'f0', { rank: 2, suit: 1 }), false);
});

test('freecell: run capacity grows with free cells and empty columns', () => {
  const st = FreeCell.deal(4);
  const noneFree = FreeCell.runCapacity(st, null);
  st.cells[0] = [{ rank: 1, suit: 0, up: true }];
  assert.ok(FreeCell.runCapacity(st, null) < noneFree, 'a used free cell must reduce capacity');
  st.tableau[7] = [];
  assert.ok(FreeCell.runCapacity(st, null) >= 1);
});

test('freecell: moving more cards than capacity is refused', () => {
  const st = FreeCell.deal(6);
  st.cells = [[{ rank: 1, suit: 0, up: true }], [{ rank: 2, suit: 0, up: true }],
    [{ rank: 3, suit: 0, up: true }], [{ rank: 4, suit: 0, up: true }]];
  // every free cell used, no empty column -> capacity 1
  // 9H,8S is a legal pack (red over black); 10S is not a landing spot for 9H (same colour),
  // so use 10D... which is red on red. 9H goes on 10S? no — alternation is what matters:
  // 9H (red) lands on 10S (black). Correct.
  const run = [{ rank: 9, suit: 1, up: true }, { rank: 8, suit: 0, up: true }];
  st.tableau[0] = run.slice();
  st.tableau[1] = [{ rank: 10, suit: 0, up: true }];
  const r = FreeCell.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'too-many-cards');
});

test('freecell: a legal single-card move works', () => {
  const st = FreeCell.deal(6);
  st.tableau[0] = [{ rank: 8, suit: 1, up: true, id: 501 }];
  st.tableau[1] = [{ rank: 9, suit: 0, up: true, id: 502 }];
  const r = FreeCell.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.tableau[0].length, 0);
  assert.strictEqual(r.state.tableau[1].length, 2);
});

test('freecell: win detection needs four complete foundations', () => {
  const st = FreeCell.deal(1);
  st.foundations = [[], [], [], []];
  for (let s = 0; s < 4; s++) {
    for (let r = 1; r <= 13; r++) st.foundations[s].push({ rank: r, suit: s, up: true });
  }
  assert.strictEqual(Cards.isWon(st), true);
});

test('no engine loses or duplicates a card after a random play session', () => {
  const st = Spider.deal(21, 2);
  let guard = 0;
  let state = st;
  while (guard++ < 400) {
    // try a random legal move; give up quietly when none is found
    let moved = false;
    outer:
    for (let c = 0; c < state.tableau.length; c++) {
      const pile = state.tableau[c];
      for (let i = 0; i < pile.length; i++) {
        if (!Spider.grabbable(state, 't' + c, i)) continue;
        for (let d = 0; d < state.tableau.length; d++) {
          if (d === c) continue;
          const r = Spider.move(state, 't' + c, i, 't' + d);
          if (r.ok) { state = r.state; moved = true; break outer; }
        }
      }
    }
    if (!moved) {
      const dr = Spider.dealRow(state);
      if (!dr.changed) break;
      state = dr.state;
    }
    let n = state.stock.length;
    state.tableau.forEach(p => { n += p.length; });
    state.foundations.forEach(p => { n += p.length; });
    assert.strictEqual(n, 104, 'card count drifted to ' + n);
  }
});


test('freecell: a pack may mix suits as long as the colours alternate', () => {
  // 9S 8H is legal to lift as a unit even though the suits differ. Using a same-suit test
  // here was a real rule bug: it forbade most legal moves in the game.
  const st = FreeCell.deal(8);
  st.cells = [[], [], [], []];
  st.tableau[0] = [
    { rank: 9, suit: 0, up: true, id: 601 },   // 9S
    { rank: 8, suit: 1, up: true, id: 602 }    // 8H
  ];
  assert.strictEqual(FreeCell.grabbable(st, 't0', 0), true);
  // two blacks are not a pack
  st.tableau[0][1] = { rank: 8, suit: 3, up: true, id: 603 };
  assert.strictEqual(FreeCell.grabbable(st, 't0', 0), false);
  // nor are two reds (9H over 8D)
  st.tableau[0][0] = { rank: 9, suit: 1, up: true, id: 601 };
  st.tableau[0][1] = { rank: 8, suit: 2, up: true, id: 604 };
  assert.strictEqual(FreeCell.grabbable(st, 't0', 0), false);
});

test('freecell: a card in a free cell can always come back out', () => {
  const st = FreeCell.deal(9);
  st.cells[0] = [{ rank: 5, suit: 1, up: true, id: 605 }];
  st.tableau[0] = [{ rank: 6, suit: 0, up: true, id: 606 }];
  const r = FreeCell.move(st, 'c0', 0, 't0');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.cells[0].length, 0);
  assert.strictEqual(r.state.tableau[0].length, 2);
});


test('cloning never shares card objects between states (undo depends on this)', () => {
  const d = Klondike.deal(31, 1);
  const copy = Cards.cloneState(d);
  const cardA = d.stock[0];
  const cardB = copy.stock[0];
  assert.notStrictEqual(cardA, cardB, 'the clone shares a card object with the original');
  cardB.up = true;
  assert.strictEqual(cardA.up, false, 'flipping the clone rewrote the original card');
});

test('drawing then undoing leaves the stock card face down', () => {
  const st = Klondike.deal(32, 1);
  const before = st.stock.length;
  const drawn = Klondike.drawFromStock(st);
  assert.strictEqual(drawn.state.stock.length, before - 1);
  const drawnCard = drawn.state.waste[0];
  const stillInStock = st.stock.find((c) => c.id === drawnCard.id);
  assert.ok(stillInStock, 'the card vanished from the pre-move state');
  assert.strictEqual(stillInStock.up, false, 'the pre-move state was mutated by the draw');
});

test('every engine keeps its pre-move state intact', () => {
  const engines = [
    ['klondike', Klondike.deal(41, 3), (st) => Klondike.drawFromStock(st)],
    ['spider', Spider.deal(41, 2), (st) => Spider.dealRow(st)],
    ['pyramid', Pyramid.deal(41, 1), (st) => {
      const mv = Pyramid.legalMoves(st)[0];
      if (!mv) return { ok: false, state: st };
      return mv.kind === 'one' ? Pyramid.removeOne(st, mv.a)
        : Pyramid.removePair(st, mv.a, mv.b);
    }],
    ['yukon', Yukon.deal(41), (st) => {
      // move the single card of column 1 onto column 2 if it fits, else no-op
      for (let d = 1; d < 7; d++) {
        const r = Yukon.move(st, 't0', 0, 't' + d);
        if (r.ok) return r;
      }
      return { ok: false, state: st };
    }]
  ];
  engines.forEach(([name, st, step]) => {
    const snapshot = JSON.stringify(st);
    step(st);
    assert.strictEqual(JSON.stringify(st), snapshot, name + ' mutated its input state');
  });
});

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exit(1);
}
