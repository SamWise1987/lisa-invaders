/* Node test runner for game-state.js — run: node tests/game-state.test.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock localStorage for Node
const store = {};
global.localStorage = {
  getItem(k) { return store[k] ?? null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};

const code = fs.readFileSync(path.join(__dirname, '..', 'game-state.js'), 'utf8');
const context = { module: { exports: {} }, self: {}, localStorage: global.localStorage };
vm.runInNewContext(code, context);
const GS = context.module.exports;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log('game-state.js tests\n');

// Reset storage between groups
function clearStore() { Object.keys(store).forEach(k => delete store[k]); }

test('createSession starts with defaults and loads high score', () => {
  clearStore();
  store[GS.STORAGE_KEY] = '1200';
  const s = GS.createSession();
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.lives, 3);
  assert.strictEqual(s.level, 1);
  assert.strictEqual(s.highScore, 1200);
});

test('awardPoints increments score once per kill', () => {
  clearStore();
  let s = GS.createSession();
  const r1 = GS.awardPoints(s, 'bud');
  assert.strictEqual(r1.pointsAwarded, 40);
  assert.strictEqual(r1.session.score, 40);
  s = r1.session;
  const r2 = GS.awardPoints(s, 'corona');
  assert.strictEqual(r2.pointsAwarded, 10);
  assert.strictEqual(r2.session.score, 50);
});

test('awardPoints updates and persists new high score', () => {
  clearStore();
  store[GS.STORAGE_KEY] = '30';
  let s = GS.createSession();
  const r = GS.awardPoints(s, 'bud');
  assert.strictEqual(r.newRecord, true);
  assert.strictEqual(r.session.highScore, 40);
  assert.strictEqual(store[GS.STORAGE_KEY], '40');
});

test('awardPoints does not double-count on invalid enemy', () => {
  clearStore();
  const s = GS.createSession();
  const r = GS.awardPoints(s, 'unknown');
  assert.strictEqual(r.pointsAwarded, 0);
  assert.strictEqual(r.session.score, 0);
});

test('loseLife decrements lives and signals game over at zero', () => {
  clearStore();
  let s = { ...GS.createSession(), lives: 2 };
  let r = GS.loseLife(s);
  assert.strictEqual(r.session.lives, 1);
  assert.strictEqual(r.gameOver, false);
  r = GS.loseLife(r.session);
  assert.strictEqual(r.session.lives, 0);
  assert.strictEqual(r.gameOver, true);
});

test('advanceLevel increments level', () => {
  clearStore();
  const s = GS.createSession();
  const next = GS.advanceLevel(s);
  assert.strictEqual(next.level, 2);
  assert.strictEqual(s.level, 1);
});

test('resetSession clears run but keeps persisted high score', () => {
  clearStore();
  store[GS.STORAGE_KEY] = '500';
  const s = GS.resetSession();
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.lives, 3);
  assert.strictEqual(s.level, 1);
  assert.strictEqual(s.highScore, 500);
});

test('getLevelConfig scales predictably', () => {
  const l1 = GS.getLevelConfig(1);
  const l3 = GS.getLevelConfig(3);
  const l5 = GS.getLevelConfig(5);
  assert.strictEqual(l1.columns, 7);
  assert.strictEqual(l3.columns, 8);
  assert.strictEqual(l5.columns, 9);
  assert.ok(l3.enemySpeed > l1.enemySpeed);
  assert.ok(l5.enemyFireInterval < l1.enemyFireInterval);
  assert.ok(l5.enemyBulletSpeed > l1.enemyBulletSpeed);
});

test('getLevelConfig clamps invalid level to 1', () => {
  const c = GS.getLevelConfig(0);
  assert.strictEqual(c.level, 1);
  assert.strictEqual(c.columns, 7);
});

test('isNewRecord and gameOverMessage', () => {
  assert.strictEqual(GS.isNewRecord(0, 100), false);
  assert.strictEqual(GS.isNewRecord(100, 100), true);
  const msg = GS.gameOverMessage(200, 200);
  assert.ok(msg.subtitle.includes('NUOVO RECORD'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
