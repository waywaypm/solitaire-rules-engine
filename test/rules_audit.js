/* rules_audit.js — the official rules of each game, written as assertions.
 *
 * Why this file exists: twice now a rule was implemented from memory and shipped wrong (the
 * FreeCell pack rule required same-suit; a Spider rules page described a 52-card deal). The
 * engine tests assert the rules I *thought of*; this file walks the published rules of each
 * game, one line at a time, and checks the engine agrees.
 *
 * Every test names the rule it is auditing, in the words of the rule, so a failure tells you
 * which claim about the game is now false — on the page or in the code.
 *
 * Run: node node test/rules_audit.js
 */
'use strict';

const path = require('path');
const assert = require('assert');

const dir = path.join(__dirname, '..', 'src');
const Cards = require(path.join(dir, 'cards.js')).Cards;
const Klondike = require(path.join(dir, 'klondike.js')).Klondike;
const Spider = require(path.join(dir, 'spider.js')).Spider;
const FreeCell = require(path.join(dir, 'freecell.js')).FreeCell;
const Yukon = require(path.join(dir, 'yukon.js')).Yukon;
const Pyramid = require(path.join(dir, 'pyramid.js')).Pyramid;

let pass = 0;
const fails = [];

function rule(game, text, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok   [${game}] ${text}`);
  } catch (e) {
    fails.push(`[${game}] ${text}: ${e.message}`);
    console.log(`  FAIL [${game}] ${text} — ${e.message}`);
  }
}

const card = (rank, suit, up) => ({ rank, suit, up: up !== false, id: rank * 4 + suit });

/* ════════════════════════════════════════════════════════════════ Klondike
 * Source rules: the standard patience game as shipped with Windows ("Solitaire"),
 * which is what the page is describing.
 */
console.log('\nKlondike');

rule('Klondike', 'the deal is 52 cards: 28 on the tableau, 24 in the stock', () => {
  const st = Klondike.deal(1, 1);
  let onTable = 0;
  st.tableau.forEach((p) => { onTable += p.length; });
  assert.strictEqual(onTable, 28);
  assert.strictEqual(st.stock.length, 24);
  assert.strictEqual(onTable + st.stock.length, 52);
});

rule('Klondike', 'column n holds n+1 cards and only the bottom one is face up', () => {
  const st = Klondike.deal(5, 1);
  st.tableau.forEach((p, i) => {
    assert.strictEqual(p.length, i + 1);
    p.forEach((c, j) => assert.strictEqual(c.up, j === p.length - 1));
  });
});

rule('Klondike', 'tableau builds down in alternating colours', () => {
  assert.strictEqual(Cards.canStackTableau(card(6, 0), card(7, 1)), true);  // black 6 on red 7
  assert.strictEqual(Cards.canStackTableau(card(6, 1), card(7, 0)), true);  // red 6 on black 7
  assert.strictEqual(Cards.canStackTableau(card(6, 0), card(7, 3)), false); // black on black
  assert.strictEqual(Cards.canStackTableau(card(6, 1), card(7, 2)), false); // red on red
  assert.strictEqual(Cards.canStackTableau(card(5, 0), card(7, 1)), false); // wrong rank
});

rule('Klondike', 'only a king may be moved to an empty column', () => {
  const st = Klondike.deal(2, 1);
  st.tableau[0] = [card(13, 0)];
  st.tableau[1] = [];
  assert.strictEqual(Klondike.move(st, 't0', 0, 't1').ok, true);
  st.tableau[0] = [card(12, 1)];
  st.tableau[1] = [];
  assert.strictEqual(Klondike.move(st, 't0', 0, 't1').ok, false);
});

rule('Klondike', 'foundations build up in suit from the ace', () => {
  const st = Klondike.deal(2, 1);
  st.foundations[0] = [];
  st.tableau[0] = [card(1, 1)];
  assert.strictEqual(Klondike.move(st, 't0', 0, 'f0').ok, true);
  const st2 = Klondike.deal(2, 1);
  st2.tableau[0] = [card(2, 1)];          // a two cannot start a foundation
  assert.strictEqual(Klondike.move(st2, 't0', 0, 'f0').ok, false);
});

rule('Klondike', 'a face-up descending alternating sequence moves as one unit', () => {
  const st = Klondike.deal(3, 1);
  st.tableau[0] = [card(9, 0), card(8, 1), card(7, 0)];
  st.tableau[1] = [card(10, 2)];
  const r = Klondike.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.tableau[0].length, 0);
  assert.strictEqual(r.state.tableau[1].length, 4);
});

rule('Klondike', 'a face-down card may not be picked up', () => {
  const st = Klondike.deal(3, 1);
  st.tableau[0] = [card(5, 0, false), card(4, 1)];
  assert.strictEqual(Klondike.grabbable(st, 't0', 0), false);
});

rule('Klondike', 'draw 1 turns one card; draw 3 turns three', () => {
  const one = Klondike.drawFromStock(Klondike.deal(4, 1));
  assert.strictEqual(one.state.waste.length, 1);
  const three = Klondike.drawFromStock(Klondike.deal(4, 3));
  assert.strictEqual(three.state.waste.length, 3);
});

rule('Klondike', 'only the top card of the waste is playable', () => {
  const st = Klondike.deal(4, 3);
  const r = Klondike.drawFromStock(st);
  assert.strictEqual(Klondike.grabbable(r.state, 'waste', 0), false);
  assert.strictEqual(Klondike.grabbable(r.state, 'waste', 2), true);
});

rule('Klondike', 'an empty stock is re-dealt from the waste, face down', () => {
  const st = Klondike.deal(6, 1);
  st.stock = [];
  st.waste = [card(5, 0, true), card(9, 1, true)];
  const r = Klondike.drawFromStock(st);
  assert.strictEqual(r.event, 'recycle');
  assert.strictEqual(r.state.stock.length, 2);
  assert.ok(r.state.stock.every((c) => c.up === false));
});

rule('Klondike', 'a card may be taken back off a foundation, for -15', () => {
  const st = Klondike.deal(6, 1);
  st.foundations[0] = [card(1, 0), card(2, 0)];
  st.tableau[0] = [card(3, 1)];
  const before = st.score;
  const r = Klondike.move(st, 'f0', 1, 't0');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.score, before - 15);
  assert.strictEqual(r.state.foundations[0].length, 1);
});

rule('Klondike', 'scoring: +5 waste to tableau, +10 to foundation, +5 for a flip', () => {
  const st = Klondike.deal(6, 1);
  st.waste = [card(2, 1)];
  st.tableau[0] = [card(3, 0)];
  const a = Klondike.move(st, 'waste', 0, 't0').state.score;
  assert.strictEqual(a, st.score + 5);

  const st2 = Klondike.deal(6, 1);
  st2.tableau[0] = [card(1, 1)];
  const b = Klondike.move(st2, 't0', 0, 'f0').state.score;
  assert.strictEqual(b, st2.score + 10);

  const st3 = Klondike.deal(6, 1);
  st3.tableau[0] = [card(9, 0, false), card(7, 1)];
  st3.tableau[1] = [card(8, 0)];
  const c = Klondike.move(st3, 't0', 1, 't1').state.score;
  assert.strictEqual(c, st3.score + 5, 'exposing a face-down card scores 5');
});

rule('Klondike', 'recycling the waste costs 100 and never goes below zero', () => {
  const st = Klondike.deal(6, 1);
  st.score = 40;
  st.stock = [];
  st.waste = [card(5, 0, true)];
  assert.strictEqual(Klondike.drawFromStock(st).state.score, 0);
});

rule('Klondike', 'the game is won only when all four foundations hold thirteen cards', () => {
  const st = Klondike.deal(1, 1);
  st.foundations = [[], [], [], []];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) st.foundations[s].push(card(r, s));
  assert.strictEqual(Cards.isWon(st), true);
  st.foundations[2].pop();
  assert.strictEqual(Cards.isWon(st), false);
});

/* ════════════════════════════════════════════════════════════════ Spider
 * Source rules: two-deck Spider, 10 columns, 5 stock deals.
 */
console.log('\nSpider');

rule('Spider', 'two decks: 104 cards, 54 dealt and 50 in the stock', () => {
  const st = Spider.deal(1, 4);
  let onTable = 0;
  st.tableau.forEach((p) => { onTable += p.length; });
  assert.strictEqual(st.tableau.length, 10);
  assert.strictEqual(onTable, 54);
  assert.strictEqual(st.stock.length, 50);
  assert.strictEqual(onTable + st.stock.length, 104);
});

rule('Spider', 'four columns get six cards, six get five; one card per column is face up', () => {
  const st = Spider.deal(2, 4);
  const sizes = st.tableau.map((p) => p.length).sort();
  assert.deepStrictEqual(sizes, [5, 5, 5, 5, 5, 5, 6, 6, 6, 6]);
  st.tableau.forEach((p) => {
    p.forEach((c, j) => assert.strictEqual(c.up, j === p.length - 1));
  });
});

rule('Spider', 'one-suit Spider is eight copies of each rank, all one suit', () => {
  const st = Spider.deal(2, 1);
  const all = st.stock.concat(...st.tableau);
  assert.strictEqual(all.length, 104);
  assert.ok(all.every((c) => c.suit === 0));
  const byRank = {};
  all.forEach((c) => { byRank[c.rank] = (byRank[c.rank] || 0) + 1; });
  Object.values(byRank).forEach((n) => assert.strictEqual(n, 8));
});

rule('Spider', 'four-suit Spider is two complete decks', () => {
  const st = Spider.deal(2, 4);
  const all = st.stock.concat(...st.tableau);
  const byCard = {};
  all.forEach((c) => { const k = c.suit + ':' + c.rank; byCard[k] = (byCard[k] || 0) + 1; });
  assert.strictEqual(Object.keys(byCard).length, 52);
  Object.values(byCard).forEach((n) => assert.strictEqual(n, 2));
});

rule('Spider', 'columns build down regardless of suit', () => {
  const st = Spider.deal(3, 4);
  st.tableau[0] = [card(7, 0)];
  assert.strictEqual(Spider.canDrop(st, 't0', card(6, 1)), true);
  assert.strictEqual(Spider.canDrop(st, 't0', card(6, 0)), true);
  assert.strictEqual(Spider.canDrop(st, 't0', card(5, 0)), false);
});

rule('Spider', 'any card may be placed in an empty column', () => {
  const st = Spider.deal(3, 4);
  st.tableau[5] = [];
  assert.strictEqual(Spider.canDrop(st, 't5', card(4, 2)), true);
});

rule('Spider', 'only a same-suit descending run may be moved as a unit', () => {
  const st = Spider.deal(3, 4);
  st.tableau[0] = [card(9, 0), card(8, 0), card(7, 1)];
  assert.strictEqual(Spider.grabbable(st, 't0', 2), true, 'single card');
  assert.strictEqual(Spider.grabbable(st, 't0', 1), false, '8S over 7H is not one suit');
  st.tableau[0] = [card(9, 0), card(8, 0)];
  assert.strictEqual(Spider.grabbable(st, 't0', 0), true, '9S 8S is one suit');
});

rule('Spider', 'a deal turns one card onto every column', () => {
  const st = Spider.deal(4, 4);
  const r = Spider.dealRow(st);
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.state.stock.length, 40);
  r.state.tableau.forEach((p) => assert.strictEqual(p[p.length - 1].up, true));
});

rule('Spider', 'no deal may be made while a column is empty', () => {
  const st = Spider.deal(4, 4);
  st.tableau[7] = [];
  const r = Spider.dealRow(st);
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.reason || r.event, 'empty-column');
});

rule('Spider', 'a complete king-to-ace run in one suit leaves the board', () => {
  const st = Spider.deal(4, 1);
  const run = [];
  for (let r = 13; r >= 1; r--) run.push(card(r, 0));
  st.tableau[0] = run;
  const after = Spider.collectRuns(st);
  assert.strictEqual(after.completed, 1);
  assert.strictEqual(after.tableau[0].length, 0);
  assert.strictEqual(after.foundations[0].length, 13);
});

rule('Spider', 'a mixed-suit king-to-ace run does not leave the board', () => {
  const st = Spider.deal(4, 1);
  const run = [];
  for (let r = 13; r >= 1; r--) run.push(card(r, r % 2 === 0 ? 0 : 1));
  st.tableau[0] = run;
  const after = Spider.collectRuns(st);
  assert.strictEqual(after.completed, 0);
  assert.strictEqual(after.foundations[0].length, 0);
});

rule('Spider', 'eight collected runs wins', () => {
  const st = Spider.deal(4, 1);
  st.completed = 7;
  const run = [];
  for (let r = 13; r >= 1; r--) run.push(card(r, 0));
  st.tableau[0] = run;
  assert.strictEqual(Spider.collectRuns(st).won, true);
});

/* ════════════════════════════════════════════════════════════════ FreeCell
 * Source rules: the standard 52-card FreeCell (Microsoft / FreeCell Pro).
 */
console.log('\nFreeCell');

rule('FreeCell', '52 cards, all face up, eight columns of seven and six', () => {
  const st = FreeCell.deal(1);
  let n = 0;
  st.tableau.forEach((p) => { n += p.length; });
  assert.strictEqual(n, 52);
  assert.deepStrictEqual(st.tableau.map((p) => p.length).sort(), [6, 6, 6, 6, 7, 7, 7, 7]);
  st.tableau.forEach((p) => p.forEach((c) => assert.strictEqual(c.up, true)));
});

rule('FreeCell', 'columns build down in alternating colours', () => {
  assert.strictEqual(Cards.canStackFreeCell(card(6, 0), card(7, 1)), true);
  assert.strictEqual(Cards.canStackFreeCell(card(6, 0), card(7, 3)), false); // black on black
});

rule('FreeCell', 'any card may be placed in an empty column', () => {
  assert.strictEqual(Cards.canStackFreeCell(card(4, 3), null), true);
});

rule('FreeCell', 'a free cell holds exactly one card', () => {
  const st = FreeCell.deal(2);
  assert.strictEqual(FreeCell.canDrop(st, 'c0', card(5, 0)), true);
  st.cells[0] = [card(9, 1)];
  assert.strictEqual(FreeCell.canDrop(st, 'c0', card(5, 0)), false);
});

rule('FreeCell', 'a card in a free cell can always be taken back out', () => {
  const st = FreeCell.deal(2);
  st.cells[0] = [card(5, 1)];
  st.tableau[0] = [card(6, 0)];
  assert.strictEqual(FreeCell.move(st, 'c0', 0, 't0').ok, true);
});

rule('FreeCell', 'foundations build up in suit from the ace', () => {
  const st = FreeCell.deal(2);
  assert.strictEqual(FreeCell.canDrop(st, 'f0', card(1, 3)), true);
  assert.strictEqual(FreeCell.canDrop(st, 'f0', card(2, 3)), false);
  st.foundations[3] = [card(1, 3)];
  assert.strictEqual(FreeCell.canDrop(st, 'f3', card(2, 3)), true);
  assert.strictEqual(FreeCell.canDrop(st, 'f3', card(2, 0)), false);
});

rule('FreeCell', 'a movable pack is descending and alternating in colour, suits may differ', () => {
  const st = FreeCell.deal(3);
  st.tableau[0] = [card(9, 0), card(8, 1)];   // 9S over 8H
  assert.strictEqual(FreeCell.grabbable(st, 't0', 0), true);
  st.tableau[0] = [card(9, 0), card(8, 3)];   // 9S over 8C — same colour
  assert.strictEqual(FreeCell.grabbable(st, 't0', 0), false);
});

rule('FreeCell', 'capacity is (free cells + 1) x 2^empty columns', () => {
  const mk = (cellsUsed, empties) => {
    const st = FreeCell.deal(4);
    st.cells = [[], [], [], []];
    for (let i = 0; i < cellsUsed; i++) st.cells[i] = [card(10, i)];
    st.tableau = [[], [], [], [], [], [], [], []];
    for (let i = 0; i < empties; i++) st.tableau[i] = [];
    st.tableau[7] = [card(13, 0)]; // a destination that is never empty
    for (let i = empties; i < 7; i++) st.tableau[i] = [card(2, i % 4)];
    return st;
  };
  assert.strictEqual(FreeCell.runCapacity(mk(4, 0), 't7'), 1, 'all cells full, no empty column');
  assert.strictEqual(FreeCell.runCapacity(mk(0, 0), 't7'), 5, '4 free cells, no empty column');
  assert.strictEqual(FreeCell.runCapacity(mk(0, 1), 't7'), 10, '4 free cells, 1 empty column');
  assert.strictEqual(FreeCell.runCapacity(mk(2, 0), 't7'), 3, '2 free cells, no empty column');
});

rule('FreeCell', 'a pack larger than the capacity may not be moved', () => {
  const st = FreeCell.deal(5);
  st.cells = [[card(10, 0)], [card(10, 1)], [card(10, 2)], [card(10, 3)]];
  st.tableau = [[], [], [], [], [], [], [], []];
  st.tableau[0] = [card(9, 0), card(8, 1)];   // a legal pack of two
  st.tableau[1] = [card(10, 2)];              // 9S (black) on 10D (red) — legal landing
  for (let i = 2; i < 8; i++) st.tableau[i] = [card(2, i % 4)];
  const r = FreeCell.move(st, 't0', 0, 't1');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'too-many-cards');
});

rule('FreeCell', 'there is no stock and no waste', () => {
  const st = FreeCell.deal(1);
  assert.strictEqual(st.stock, undefined);
  assert.strictEqual(st.waste, undefined);
});

rule('FreeCell', 'the game is won when all four foundations reach king', () => {
  const st = FreeCell.deal(1);
  st.foundations = [[], [], [], []];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) st.foundations[s].push(card(r, s));
  assert.strictEqual(Cards.isWon(st), true);
});


/* ════════════════════════════════════════════════════════════════ Yukon
 * Source rules: classic Yukon — five face-up cards on the first column's neighbours, no stock,
 * and the "any face-up card takes its whole stack" rule.
 */
console.log('\nYukon');

rule('Yukon', 'the whole deck is dealt: 52 cards, no stock', () => {
  const st = Yukon.deal(1);
  let n = 0;
  st.tableau.forEach((p) => { n += p.length; });
  assert.strictEqual(n, 52);
  assert.strictEqual(st.stock, null);
  assert.strictEqual(st.waste, null);
});

rule('Yukon', 'column 1 gets 1 card; columns 2-7 get their index + 1, then 4 face-up cards', () => {
  const st = Yukon.deal(1);
  assert.strictEqual(st.tableau[0].length, 1, 'first column must hold exactly one card');
  for (let i = 1; i < 7; i++) {
    assert.strictEqual(st.tableau[i].length, (i + 1) + 4, 'column ' + (i + 1));
  }
});

rule('Yukon', 'the 28-card deal leaves 21 face down; the 24 extras are all face up', () => {
  const st = Yukon.deal(2);
  let down = 0;
  let up = 0;
  st.tableau.forEach((p) => p.forEach((c) => { if (c.up) up += 1; else down += 1; }));
  // 1+2+...+7 = 28 cards, one face up per column -> 21 face down; plus 24 face-up extras.
  assert.strictEqual(down, 21);
  assert.strictEqual(up, 31);
  assert.strictEqual(st.tableau[0].filter((c) => !c.up).length, 0,
    'the one-card first column has nothing to hide');
});

rule('Yukon', 'any face-up card may be lifted with everything stacked on it', () => {
  const st = Yukon.deal(3);
  st.tableau[0] = [card(9, 0), card(2, 1), card(11, 3)];  // deliberately not a sequence
  assert.strictEqual(Yukon.grabbable(st, 't0', 0), true, 'a mixed stack must be liftable');
  assert.strictEqual(Yukon.grabbable(st, 't0', 1), true);
  st.tableau[0] = [card(9, 0, false), card(2, 1)];
  assert.strictEqual(Yukon.grabbable(st, 't0', 0), false, 'a face-down card is not liftable');
});

rule('Yukon', 'the tableau builds down by rank only — colour and suit are irrelevant', () => {
  const st = Yukon.deal(4);
  st.tableau[0] = [card(8, 0)];
  assert.strictEqual(Yukon.canDrop(st, 't0', card(7, 0)), true, 'same colour must be allowed');
  assert.strictEqual(Yukon.canDrop(st, 't0', card(7, 2)), true);
  assert.strictEqual(Yukon.canDrop(st, 't0', card(6, 1)), false);
});

rule('Yukon', 'only a king may fill an empty column', () => {
  const st = Yukon.deal(4);
  st.tableau[3] = [];
  assert.strictEqual(Yukon.canDrop(st, 't3', card(13, 1)), true);
  assert.strictEqual(Yukon.canDrop(st, 't3', card(12, 1)), false);
});

rule('Yukon', 'foundations build up in suit from the ace', () => {
  const st = Yukon.deal(5);
  st.foundations[0] = [];
  assert.strictEqual(Yukon.canDrop(st, 'f0', card(1, 2)), true);
  assert.strictEqual(Yukon.canDrop(st, 'f0', card(3, 2)), false);
  st.foundations[0] = [card(1, 2)];
  assert.strictEqual(Yukon.canDrop(st, 'f0', card(2, 2)), true);
});

rule('Yukon', 'moving a stack exposes and flips the card underneath', () => {
  const st = Yukon.deal(6);
  st.tableau[0] = [card(4, 0, false), card(9, 1), card(3, 2)];
  st.tableau[1] = [card(10, 0)];
  const r = Yukon.move(st, 't0', 1, 't1');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.tableau[0].length, 1);
  assert.strictEqual(r.state.tableau[0][0].up, true, 'exposed card was not flipped');
  assert.strictEqual(r.state.tableau[1].length, 3);
});

rule('Yukon', 'a deal holds exactly 52 distinct cards', () => {
  const st = Yukon.deal(77);
  const ids = [];
  st.tableau.forEach((p) => p.forEach((c) => ids.push(c.id)));
  assert.strictEqual(ids.length, 52);
  assert.strictEqual(new Set(ids).size, 52);
});

rule('Yukon', 'the game is won when all four foundations reach king', () => {
  const st = Yukon.deal(1);
  st.foundations = [[], [], [], []];
  for (let s2 = 0; s2 < 4; s2++) for (let r = 1; r <= 13; r++) st.foundations[s2].push(card(r, s2));
  assert.strictEqual(Cards.isWon(st), true);
});


/* ════════════════════════════════════════════════════════════════ Pyramid
 * Source rules: Pyramid solitaire — 28 cards in a triangle, pairs summing to 13 removed,
 * a king removed alone, and a card is only available when nothing rests on it.
 */
console.log('\nPyramid');

rule('Pyramid', 'the triangle is 28 cards and the stock is the other 24', () => {
  const st = Pyramid.deal(1, 1);
  assert.strictEqual(st.pyramid.length, 28);
  assert.strictEqual(st.stock.length, 24);
  assert.strictEqual(28 + 24, 52);
});

rule('Pyramid', 'row r holds r+1 cards, all face up', () => {
  const st = Pyramid.deal(2, 1);
  const counts = {};
  st.pyramid.forEach((_, i) => {
    const r = Pyramid.rowOf(i);
    counts[r] = (counts[r] || 0) + 1;
  });
  for (let r = 0; r < 7; r++) assert.strictEqual(counts[r], r + 1, 'row ' + r);
  assert.ok(st.pyramid.every((pc) => pc.card.up === true));
});

rule('Pyramid', 'a card is covered while either card resting on it is still there', () => {
  const st = Pyramid.deal(3, 1);
  // the apex (index 0) rests on index 1 and 2; the bottom row is always free
  assert.strictEqual(Pyramid.exposed(st, 0), false, 'the apex must start covered');
  assert.strictEqual(Pyramid.exposed(st, 27), true, 'the bottom row is free');
  st.pyramid[1].gone = true;
  assert.strictEqual(Pyramid.exposed(st, 0), false, 'one supporter is not enough');
  st.pyramid[2].gone = true;
  assert.strictEqual(Pyramid.exposed(st, 0), true, 'both supporters gone -> exposed');
});

rule('Pyramid', 'cards pair when their values add to 13', () => {
  const c = (rank) => ({ rank, suit: 0, up: true });
  assert.strictEqual(Pyramid.canPair(c(1), c(12)), true);   // A + Q
  assert.strictEqual(Pyramid.canPair(c(6), c(7)), true);
  assert.strictEqual(Pyramid.canPair(c(5), c(7)), false);
  assert.strictEqual(Pyramid.canPair(c(13), c(1)), false);  // a king pairs with nothing
});

rule('Pyramid', 'a king is removed on its own and nothing else may be', () => {
  const st = Pyramid.deal(4, 1);
  st.pyramid[25] = { card: { rank: 13, suit: 0, up: true }, gone: false }; // bottom row
  const r = Pyramid.removeOne(st, { kind: 'p', index: 25 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.pyramid[25].gone, true);
  st.pyramid[24] = { card: { rank: 5, suit: 0, up: true }, gone: false };
  const r2 = Pyramid.removeOne(st, { kind: 'p', index: 24 });
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.reason, 'needs-pair');
});

rule('Pyramid', 'a covered card cannot be taken even if the pair adds to 13', () => {
  const st = Pyramid.deal(5, 1);
  st.pyramid[0] = { card: { rank: 1, suit: 0, up: true }, gone: false };
  st.pyramid[26] = { card: { rank: 12, suit: 0, up: true }, gone: false };
  // index 0 is still covered by 1 and 2
  const r = Pyramid.removePair(st, { kind: 'p', index: 0 }, { kind: 'p', index: 26 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not-available');
});

rule('Pyramid', 'two exposed cards adding to 13 are removed together', () => {
  const st = Pyramid.deal(6, 1);
  st.pyramid[25] = { card: { rank: 6, suit: 0, up: true }, gone: false };
  st.pyramid[26] = { card: { rank: 7, suit: 1, up: true }, gone: false };
  const r = Pyramid.removePair(st, { kind: 'p', index: 25 }, { kind: 'p', index: 26 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.pyramid[25].gone, true);
  assert.strictEqual(r.state.pyramid[26].gone, true);
  assert.strictEqual(r.state.removed, 2);
});

rule('Pyramid', 'a waste card can pair with an exposed pyramid card', () => {
  const st = Pyramid.deal(7, 1);
  st.waste = [{ rank: 8, suit: 0, up: true }];
  st.pyramid[27] = { card: { rank: 5, suit: 2, up: true }, gone: false };
  const r = Pyramid.removePair(st, { kind: 'p', index: 27 }, { kind: 'w' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.state.waste.length, 0);
  assert.strictEqual(r.state.pyramid[27].gone, true);
});

rule('Pyramid', 'two waste cards may not be paired with each other', () => {
  const st = Pyramid.deal(7, 1);
  st.waste = [{ rank: 6, suit: 0, up: true }, { rank: 7, suit: 0, up: true }];
  const r = Pyramid.removePair(st, { kind: 'w' }, { kind: 'w' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'one-waste-card');
});

rule('Pyramid', 'the stock draws one card, or three when that variant is chosen', () => {
  const one = Pyramid.draw(Pyramid.deal(8, 1));
  assert.strictEqual(one.state.waste.length, 1);
  const three = Pyramid.draw(Pyramid.deal(8, 3));
  assert.strictEqual(three.state.waste.length, 3);
});

rule('Pyramid', 'an empty stock is refilled from the waste', () => {
  const st = Pyramid.deal(9, 1);
  st.stock = [];
  st.waste = [{ rank: 4, suit: 0, up: true }, { rank: 9, suit: 0, up: true }];
  const r = Pyramid.draw(st);
  assert.strictEqual(r.event, 'recycle');
  assert.strictEqual(r.state.stock.length, 2);
  assert.strictEqual(r.state.waste.length, 0);
  assert.strictEqual(r.state.redeals, 1);
});

rule('Pyramid', 'the game is won when all 28 pyramid cards are gone', () => {
  const st = Pyramid.deal(10, 1);
  assert.strictEqual(st.won, false);
  st.removed = 27;
  st.pyramid[27] = { card: { rank: 13, suit: 0, up: true }, gone: false };
  const r = Pyramid.removeOne(st, { kind: 'p', index: 27 });
  assert.strictEqual(r.state.removed, 28);
  assert.strictEqual(r.state.won, true);
});

rule('Pyramid', 'legal moves never include a covered card', () => {
  const st = Pyramid.deal(11, 1);
  const moves = Pyramid.legalMoves(st);
  moves.forEach((mv) => {
    if (mv.a.kind === 'p') assert.ok(Pyramid.exposed(st, mv.a.index), 'covered card offered');
    if (mv.b && mv.b.kind === 'p') assert.ok(Pyramid.exposed(st, mv.b.index), 'covered card offered');
  });
});

/* ════════════════════════════════════════════════════════════════ summary */
console.log('\n' + pass + ' rules verified, ' + fails.length + ' violated');
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
