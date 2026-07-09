/* End-to-end simulation of scoring/level flow (no DOM) */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = {};
global.localStorage = {
  getItem(k) { return store[k] ?? null; },
  setItem(k, v) { store[k] = String(v); },
};

const code = fs.readFileSync(path.join(__dirname, '..', 'game-state.js'), 'utf8');
const ctx = { module: { exports: {} }, self: {}, localStorage: global.localStorage };
vm.runInNewContext(code, ctx);
const GS = ctx.module.exports;

let session = GS.resetSession();
let kills = 0;

// Simulate clearing wave 1 (7 cols × 4 rows = 28 enemies)
const cols = GS.getLevelConfig(1).columns;
const perWave = cols * GS.ENEMY_ROWS.length;

for (let i = 0; i < perWave; i++) {
  const row = GS.ENEMY_ROWS[i % GS.ENEMY_ROWS.length];
  const r = GS.awardPoints(session, row.key);
  session = r.session;
  kills++;
}

console.log(`Wave 1 cleared: score=${session.score}, level=${session.level}, kills=${kills}`);
if (session.score <= 0) throw new Error('Score should be positive after wave');

session = GS.advanceLevel(session);
console.log(`Advanced to level ${session.level}`);
const cfg2 = GS.getLevelConfig(session.level);
if (cfg2.enemySpeed <= GS.getLevelConfig(1).enemySpeed) throw new Error('Level 2 should be harder');

// Lose all lives
while (session.lives > 0) {
  const r = GS.loseLife(session);
  session = r.session;
}
if (session.lives !== 0) throw new Error('Should have 0 lives');

// High score persists after reset
const savedHigh = session.highScore;
session = GS.resetSession();
if (session.highScore !== savedHigh) throw new Error('High score lost on reset');
if (session.score !== 0 || session.lives !== 3 || session.level !== 1) {
  throw new Error('Reset did not restore defaults');
}

console.log('E2E scoring simulation OK');
