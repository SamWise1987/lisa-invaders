/* ============================================================
   LISA INVADERS — Game state, scoring & level progression
   Pure logic module (no DOM / rendering dependencies)
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'lisaInvadersHigh';

  const STATE = {
    START: 0,
    PLAYING: 1,
    LEVELUP: 2,
    GAMEOVER: 3,
  };

  const ENEMY_ROWS = [
    { key: 'bud',      name: 'Bud',       points: 40 },
    { key: 'becks',    name: "Beck's",    points: 30 },
    { key: 'tennents', name: "Tennent's", points: 20 },
    { key: 'corona',   name: 'Corona',    points: 10 },
  ];

  const ASPECT = {
    lisa: 761 / 1120,
    bud: 178 / 600,
    becks: 155 / 600,
    tennents: 278 / 600,
    corona: 147 / 600,
  };

  const DEFAULTS = {
    lives: 3,
    level: 1,
    score: 0,
  };

  function loadHighScore() {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = +(raw || 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function saveHighScore(highScore) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(highScore))));
  }

  function createSession() {
    return {
      score: DEFAULTS.score,
      lives: DEFAULTS.lives,
      level: DEFAULTS.level,
      highScore: loadHighScore(),
    };
  }

  function getEnemyPoints(enemyKey) {
    const row = ENEMY_ROWS.find(r => r.key === enemyKey);
    return row ? row.points : 0;
  }

  /**
   * Add points for a destroyed enemy. Returns updated session + flags.
   * Score is only incremented once per call — no duplicate counting.
   */
  function awardPoints(session, enemyKey) {
    const points = getEnemyPoints(enemyKey);
    if (points <= 0) return { session, pointsAwarded: 0, newRecord: false };

    const nextScore = session.score + points;
    let newRecord = false;
    let highScore = session.highScore;

    if (nextScore > highScore) {
      highScore = nextScore;
      newRecord = true;
      saveHighScore(highScore);
    }

    return {
      session: { ...session, score: nextScore, highScore },
      pointsAwarded: points,
      newRecord,
    };
  }

  function loseLife(session) {
    const lives = session.lives - 1;
    return {
      session: { ...session, lives },
      gameOver: lives <= 0,
    };
  }

  function advanceLevel(session) {
    return {
      ...session,
      level: session.level + 1,
    };
  }

  function resetSession() {
    const highScore = loadHighScore();
    return {
      score: DEFAULTS.score,
      lives: DEFAULTS.lives,
      level: DEFAULTS.level,
      highScore,
    };
  }

  /** Difficulty parameters derived from level (deterministic). */
  function getLevelConfig(level) {
    const lv = Math.max(1, Math.floor(level));
    return {
      columns: Math.min(7 + Math.floor((lv - 1) / 2), 9),
      enemySpeed: 22 + (lv - 1) * 9,
      enemyFireInterval: Math.max(0.25, 1.15 - lv * 0.08),
      enemyBulletSpeed: 150 + lv * 22,
      level: lv,
    };
  }

  function isNewRecord(score, highScore) {
    return score > 0 && score >= highScore;
  }

  function gameOverMessage(score, highScore) {
    const record = isNewRecord(score, highScore);
    return {
      title: 'GAME OVER',
      subtitle: record
        ? `Punteggio: ${score}  ★ NUOVO RECORD!`
        : `Punteggio: ${score}`,
    };
  }

  return {
    STORAGE_KEY,
    STATE,
    ENEMY_ROWS,
    ASPECT,
    DEFAULTS,
    loadHighScore,
    saveHighScore,
    createSession,
    getEnemyPoints,
    awardPoints,
    loseLife,
    advanceLevel,
    resetSession,
    getLevelConfig,
    isNewRecord,
    gameOverMessage,
  };
});
