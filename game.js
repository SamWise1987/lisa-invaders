/* ============================================================
   LISA INVADERS — Birra del Borgo vs le lager industriali
   ============================================================ */
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const VIEW = {
    desktop: { w: 900, h: 640 },
    portrait: { w: 390, h: 560 },
    landscape: { w: 720, h: 400 },
  };
  let layoutMode = 'desktop';
  let portraitLayout = false;
  let landscapeLayout = false;
  let W = VIEW.desktop.w;
  let H = VIEW.desktop.h;
  let pixelRatio = 1;

  function detectLayoutMode() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const narrow = window.innerWidth <= 900 || window.innerHeight <= 520;
    if (coarse && narrow) {
      return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
    }
    return 'desktop';
  }

  function syncLayoutFlags() {
    layoutMode = detectLayoutMode();
    portraitLayout = layoutMode === 'portrait';
    landscapeLayout = layoutMode === 'landscape';
  }

  function isCompactLayout() { return layoutMode !== 'desktop'; }

  function updateGameWidthLimit() {
    syncLayoutFlags();
    const inGame = document.body.classList.contains('in-game');
    const compactDesktop = layoutMode === 'desktop' && window.innerHeight <= 850;
    let reservedHeight;
    if (isCompactLayout() && inGame) {
      reservedHeight = landscapeLayout ? 20 : 36;
    } else if (isCompactLayout()) {
      reservedHeight = landscapeLayout ? 96 : 148;
    } else {
      reservedHeight = compactDesktop ? 184 : 214;
    }
    const availableHeight = Math.max(280, window.innerHeight - reservedHeight);
    const availableWidth = Math.max(280, window.innerWidth - 16);
    const heightBound = Math.floor(availableHeight * (W / H));
    const maxWidth = Math.max(280, Math.min(heightBound, availableWidth));
    document.documentElement.style.setProperty('--game-max-width', `${maxWidth}px`);
  }

  function configureCanvas() {
    syncLayoutFlags();
    const view = VIEW[layoutMode] || VIEW.desktop;
    W = view.w;
    H = view.h;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * pixelRatio);
    canvas.height = Math.round(H * pixelRatio);
    canvas.style.aspectRatio = `${W} / ${H}`;
    document.documentElement.style.setProperty('--game-ratio', String(W / H));
    updateGameWidthLimit();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  configureCanvas();

  // ---------- Assets ----------
  const IMAGES = {
    lisa: 'assets/lisa.png',
    lustweiser: 'assets/lustweiser.png',
    necks: 'assets/necks.png',
    borona: 'assets/borona.png',
    bennets: 'assets/bennets.png',
    boss: 'assets/boss.png',
  };
  const sprites = {};
  let assetsLoaded = 0;
  const assetsTotal = Object.keys(IMAGES).length;
  for (const [key, src] of Object.entries(IMAGES)) {
    const img = new Image();
    img.src = src;
    img.onload = () => { assetsLoaded++; };
    img.onerror = () => { assetsLoaded++; sprites[key].broken = true; };
    sprites[key] = img;
  }

  const ASPECT = {
    lisa: 761 / 1120,
    lustweiser: 1024 / 1536,
    necks: 1024 / 1536,
    borona: 1024 / 1536,
    bennets: 1024 / 1536,
  };

  const ENEMY_ROWS = [
    { key: 'lustweiser', name: 'Lustweiser', points: 40 },
    { key: 'necks',      name: "Neck's",     points: 30 },
    { key: 'bennets',    name: 'Bennets',    points: 20 },
    { key: 'borona',     name: 'Borona',     points: 10 },
  ];

  const POWER = { RAPID: 'rapid', TRIPLE: 'triple', SHIELD: 'shield' };
  const COMBO_WINDOW = 1.5;
  const meta = window.LisaMeta;
  const defaultRun = { id: 'normal', label: 'NORMALE', lives: 3, enemySpeed: 1, enemyFire: 1, dropChance: 0.08, scoreMultiplier: 1, grace: 1, daily: false, seed: null, mission: null };
  let activeRun = { ...defaultRun };
  let randomSource = Math.random;

  function mulberry32(seed) {
    return function seededRandom() {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function gameRandom() { return randomSource(); }
  function motionReduced() { return meta?.motionReduced?.() ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // ---------- Audio ----------
  const sound = {
    enabled: localStorage.getItem('lisaInvadersSound') !== 'off',
    ctx: null,
    ensure() {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
      if (!this.enabled) return;
      this.ensure();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    },
    shoot()    { this.tone(880, 0.1, 'square', 0.06, 220); },
    enemyShoot(){ this.tone(200, 0.15, 'sawtooth', 0.04, 90); },
    boom()     { this.tone(140, 0.25, 'sawtooth', 0.1, 40); },
    playerHit(){ this.tone(300, 0.5, 'sawtooth', 0.12, 50); },
    march(step){ this.tone([110, 98, 87, 78][step], 0.08, 'triangle', 0.07); },
    powerUp()  { this.tone(660, 0.2, 'square', 0.07, 990); },
    combo()    { this.tone(520, 0.08, 'triangle', 0.05, 780); },
    levelUp()  {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.15, 'square', 0.07), i * 110));
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) =>
        setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.09), i * 200));
    },
  };

  // ---------- Stato ----------
  const STATE = { START: 0, PLAYING: 1, LEVELUP: 2, GAMEOVER: 3 };
  let state = STATE.START;
  let paused = false;

  let score = 0;
  let highScore = +(localStorage.getItem('lisaInvadersHigh') || 0);
  let lives = 3;
  let level = 1;
  let levelBannerT = 0;
  let levelGrace = 0;

  let combo = 0;
  let comboTimer = 0;
  let killStreak = 0;
  let levelHitTaken = false;
  let shakeT = 0;
  let shakeMag = 0;
  let flashT = 0;

  const statusEls = {
    score: document.getElementById('stat-score'),
    high: document.getElementById('stat-high'),
    level: document.getElementById('stat-level'),
    lives: document.getElementById('stat-lives'),
    powers: {
      shield: document.querySelector('[data-power="shield"]'),
      rapid: document.querySelector('[data-power="rapid"]'),
      triple: document.querySelector('[data-power="triple"]'),
    },
  };
  let statusSignature = '';

  function updateStatusUI(force = false) {
    const rapidSeconds = Math.max(0, Math.ceil(player.rapidT));
    const tripleSeconds = Math.max(0, Math.ceil(player.tripleT));
    const signature = [score, highScore, level, lives, player.shield ? 1 : 0, rapidSeconds, tripleSeconds].join('|');
    if (!force && signature === statusSignature) return;
    statusSignature = signature;
    statusEls.score.textContent = score;
    statusEls.high.textContent = highScore;
    statusEls.level.textContent = level;
    statusEls.lives.setAttribute('aria-label', `${lives} ${lives === 1 ? 'vita' : 'vite'}`);
    statusEls.lives.innerHTML = Array.from({ length: lives }, () => '<img class="life-bottle" src="assets/lisa.png" alt="">').join('');

    const setPower = (key, active, value) => {
      const el = statusEls.powers[key];
      el.classList.toggle('active', active);
      el.querySelector('.power-time').textContent = value;
      const names = { shield: 'Scudo', rapid: 'Fuoco rapido', triple: 'Colpo triplo' };
      el.setAttribute('aria-label', active ? `${names[key]} attivo${value !== 'ON' ? ` per ${value} secondi` : ''}` : `${names[key]} non attivo`);
    };
    setPower('shield', player.shield, 'ON');
    setPower('rapid', rapidSeconds > 0, String(rapidSeconds));
    setPower('triple', tripleSeconds > 0, String(tripleSeconds));
  }

  const initialPlayerH = isCompactLayout() ? (landscapeLayout ? 64 : 70) : 88;
  const player = {
    w: Math.round(initialPlayerH * ASPECT.lisa), h: initialPlayerH,
    x: W / 2 - Math.round(initialPlayerH * ASPECT.lisa) / 2,
    targetX: W / 2 - Math.round(initialPlayerH * ASPECT.lisa) / 2,
    y: H - (landscapeLayout ? 72 : portraitLayout ? 80 : 98),
    speed: 420,
    cooldown: 0,
    invincible: 0,
    recoil: 0,
    shield: false,
    rapidT: 0,
    tripleT: 0,
  };

  let enemies = [];
  let boss = null;
  let enemyDir = 1;
  let enemySpeed = 0;
  let enemyDrop = isCompactLayout() ? (landscapeLayout ? 14 : 18) : 22;
  let marchStep = 0;
  let marchTimer = 0;
  let enemyFireTimer = 0;

  let playerBullets = [];
  let enemyBullets = [];
  let particles = [];
  let bunkers = [];
  let stars = [];
  let popups = [];
  let drops = [];
  let gamepadAxis = 0;
  let gamepadFire = false;
  let gamepadPauseLatch = false;
  let gamepadStartLatch = false;

  function buildStars() {
    stars = [];
    const count = isCompactLayout() ? (landscapeLayout ? 55 : 70) : 90;
    for (let i = 0; i < count; i++) {
      const layer = Math.random();
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4,
        tw: Math.random() * Math.PI * 2,
        parallax: 0.3 + layer * 0.7,
      });
    }
  }

  buildStars();

  const keys = {};
  let fireHeld = false;

  function getComboMultiplier() {
    if (combo < 3) return 1;
    if (combo < 6) return 2;
    if (combo < 10) return 3;
    return 4;
  }

  function addShake(dur, mag) {
    if (!meta?.screenShakeEnabled?.() || motionReduced()) return;
    shakeT = Math.max(shakeT, dur);
    shakeMag = Math.max(shakeMag, mag);
  }

  function addPopup(x, y, text, color = '#f5edd8', size = 18) {
    popups.push({ x, y, text, color, size, t: 0, life: 0.85 });
  }

  function awardKillPoints(e) {
    combo++;
    killStreak++;
    comboTimer = COMBO_WINDOW;
    const mult = getComboMultiplier();
    const pts = Math.round(e.points * mult * activeRun.scoreMultiplier);
    score += pts;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('lisaInvadersHigh', highScore);
    }
    if (mult > 1) sound.combo();
    if (mult >= 4) meta?.unlockAchievement?.('combo4');
    if (killStreak >= 20) meta?.unlockAchievement?.('streak20');
    addPopup(e.x + e.w / 2, e.y, `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, mult > 1 ? '#ffd56a' : '#f5edd8', mult > 1 ? 20 : 16);
    if (gameRandom() < activeRun.dropChance) {
      const types = [POWER.RAPID, POWER.TRIPLE, POWER.SHIELD];
      drops.push({
        x: e.x + e.w / 2, y: e.y + e.h / 2,
        vy: 60, type: types[(gameRandom() * types.length) | 0], r: 14,
      });
    }
  }

  function resetCombo() {
    combo = 0;
    comboTimer = 0;
  }

  function initialFireDelay() {
    if (level <= 1) return 2.8;
    if (level === 2) return 2.0;
    return 1.5;
  }

  function spawnWave() {
    enemies = [];
    boss = null;
    if (level % 5 === 0) {
      spawnBoss();
      return;
    }
    const cols = landscapeLayout
      ? Math.min(7 + Math.floor((level - 1) / 3), 9)
      : portraitLayout ? 5 : Math.min(7 + Math.floor((level - 1) / 2), 9);
    const cellW = landscapeLayout ? 40 : portraitLayout ? 42 : 46;
    const eh = landscapeLayout ? 44 : portraitLayout ? 52 : 68;
    const gapX = landscapeLayout ? 20 : portraitLayout ? 23 : 30;
    const gapY = landscapeLayout ? 9 : portraitLayout ? 11 : 16;
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = landscapeLayout ? 18 : portraitLayout ? 24 : 34;
    ENEMY_ROWS.forEach((row, r) => {
      const ew = Math.round(eh * ASPECT[row.key]);
      for (let c = 0; c < cols; c++) {
        enemies.push({
          x: startX + c * (cellW + gapX) + (cellW - ew) / 2,
          y: startY + r * (eh + gapY),
          w: ew, h: eh,
          col: c,
          key: row.key, points: row.points, alive: true,
          bob: gameRandom() * Math.PI * 2,
        });
      }
    });
    enemyDir = 1;
    enemySpeed = ((level <= 2 ? 18 : 22) + (level - 1) * 9) * activeRun.enemySpeed;
    enemyFireTimer = initialFireDelay() * activeRun.enemyFire;
    marchTimer = 0;
  }

  function spawnBoss() {
    const tier = Math.max(1, Math.floor(level / 5));
    const w = landscapeLayout ? 300 : portraitLayout ? 250 : 360;
    const h = Math.round(w * 2 / 3);
    const hp = 26 + tier * 12 + (activeRun.id === 'arcade' ? 8 : 0);
    boss = {
      x: W / 2 - w / 2,
      y: landscapeLayout ? 18 : portraitLayout ? 28 : 24,
      w, h,
      hp,
      maxHp: hp,
      vx: (landscapeLayout ? 68 : portraitLayout ? 55 : 76) * activeRun.enemySpeed,
      fireTimer: 1.2,
      attackCount: tier,
      phase: 0,
      tier,
      flash: 0,
      alive: true,
    };
    enemyFireTimer = 1.5;
    marchTimer = 0;
  }

  function fireBossPattern() {
    if (!boss?.alive) return;
    const cx = boss.x + boss.w / 2;
    const by = boss.y + boss.h * .82;
    const speed = (landscapeLayout ? 140 : portraitLayout ? 125 : 160) + level * 4;
    const pattern = boss.attackCount++ % 3;
    const make = (x, vx, vy, radius = 6) => enemyBullets.push({ x, y: by, vx, vy, r: radius, boss: true });

    if (pattern === 0) {
      [-2, -1, 0, 1, 2].forEach(step => make(cx + step * boss.w * .08, step * 42, speed));
    } else if (pattern === 1) {
      const dx = player.x + player.w / 2 - cx;
      const dy = Math.max(80, player.y - by);
      const length = Math.hypot(dx, dy) || 1;
      const aimX = dx / length * speed;
      const aimY = dy / length * speed;
      [-36, 0, 36].forEach(spread => make(cx, aimX + spread, aimY));
    } else {
      const count = isCompactLayout() ? (landscapeLayout ? 6 : 5) : 7;
      for (let i = 0; i < count; i++) {
        const x = boss.x + boss.w * (.12 + i * .76 / Math.max(1, count - 1));
        make(x, Math.sin(boss.phase + i) * 28, speed * (0.82 + i % 2 * .18), 5);
      }
    }
    sound.enemyShoot();
    boss.fireTimer = Math.max(.48, (1.25 - boss.tier * .05) * activeRun.enemyFire);
  }

  function updateBoss(dt) {
    if (!boss?.alive) return;
    boss.phase += dt * 2.2;
    if (boss.flash > 0) boss.flash -= dt;
    boss.x += boss.vx * dt;
    if (boss.x < 8 || boss.x + boss.w > W - 8) {
      boss.x = Math.max(8, Math.min(W - boss.w - 8, boss.x));
      boss.vx *= -1;
    }
    if (levelGrace <= 0) {
      boss.fireTimer -= dt;
      if (boss.fireTimer <= 0) fireBossPattern();
    }
  }

  function damageBoss(bullet) {
    if (!boss?.alive || !rectHit(bullet.x, bullet.y, bullet.r, boss)) return false;
    boss.hp--;
    boss.flash = .08;
    score += Math.round(8 * activeRun.scoreMultiplier);
    foamExplosion(bullet.x, bullet.y, '#ffd56a', 6);
    if (boss.hp <= 0) {
      const defeated = boss;
      defeated.alive = false;
      const bonus = Math.round(level * 500 * activeRun.scoreMultiplier);
      score += bonus;
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('lisaInvadersHigh', highScore);
      }
      addPopup(defeated.x + defeated.w / 2, defeated.y + defeated.h / 2, `BOSS +${bonus}`, '#ffd56a', portraitLayout ? 20 : 28);
      foamExplosion(defeated.x + defeated.w / 2, defeated.y + defeated.h / 2, '#c8102e', 70);
      addShake(.55, 16);
      sound.boom();
      meta?.unlockAchievement?.('boss');
      boss = null;
    }
    return true;
  }

  function buildBunkers() {
    bunkers = [];
    const bw = portraitLayout ? 7 : 10;
    const bh = portraitLayout ? 7 : 10;
    const shape = [
      '..######..',
      '.########.',
      '##########',
      '##########',
      '###....###',
      '##......##',
    ];
    const positions = landscapeLayout
      ? [W * 0.12, W * 0.4, W * 0.68]
      : portraitLayout ? [W * 0.08, W * 0.37, W * 0.66] : [W * 0.17, W * 0.415, W * 0.66];
    const bunkerY = H - (landscapeLayout ? 118 : portraitLayout ? 145 : 180);
    positions.forEach(px => {
      shape.forEach((rowStr, ry) => {
        [...rowStr].forEach((ch, rx) => {
          if (ch === '#') {
            bunkers.push({ x: px + rx * bw, y: bunkerY + ry * bh, w: bw, h: bh, hp: 2, maxHp: 2 });
          }
        });
      });
    });
  }

  function regenBunkers(dt) {
    bunkers.forEach(b => {
      if (b.hp >= b.maxHp) return;
      b.regenT = (b.regenT || 0) + dt;
      if (b.regenT >= 15) {
        b.regenT = 0;
        b.hp++;
      }
    });
  }

  function startRun(config = activeRun) {
    activeRun = { ...defaultRun, ...config };
    randomSource = activeRun.daily && Number.isFinite(activeRun.seed) ? mulberry32(activeRun.seed) : Math.random;
    score = 0;
    lives = activeRun.lives;
    level = 1;
    boss = null;
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    popups = [];
    drops = [];
    killStreak = 0;
    levelHitTaken = false;
    resetCombo();
    placePlayer();
    player.invincible = 0;
    player.shield = false;
    player.rapidT = 0;
    player.tripleT = 0;
    player.recoil = 0;
    paused = false;
    levelGrace = 5 * activeRun.grace;
    spawnWave();
    buildBunkers();
    state = STATE.PLAYING;
    updatePauseBtn();
    updateStatusUI(true);
    meta?.onRunStarted?.(activeRun);
  }

  function resetGame() { startRun(activeRun); }

  function placePlayer() {
    player.h = isCompactLayout() ? (landscapeLayout ? 64 : 70) : 88;
    player.w = Math.round(player.h * ASPECT.lisa);
    player.y = H - (landscapeLayout ? 72 : portraitLayout ? 80 : 98);
    player.x = W / 2 - player.w / 2;
    player.targetX = player.x;
  }

  function nextLevel() {
    if (!levelHitTaken) meta?.unlockAchievement?.('flawless');
    levelHitTaken = false;
    level++;
    playerBullets = [];
    enemyBullets = [];
    drops = [];
    levelGrace = (level % 5 === 0 ? 2.5 : level <= 2 ? 4 : 1.1) * activeRun.grace;
    spawnWave();
    buildBunkers();
    levelBannerT = 1.6;
    state = STATE.LEVELUP;
    sound.levelUp();
    updateStatusUI(true);
    meta?.updateRun?.({ score, level, lives, combo });
  }

  function foamExplosion(x, y, baseColor = '#f7e8b0', n = 22) {
    if (motionReduced()) n = Math.max(4, Math.round(n * 0.35));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        r: 2 + Math.random() * 4,
        life: 0.5 + Math.random() * 0.5,
        t: 0,
        color: Math.random() < 0.7 ? baseColor : '#c8102e',
      });
    }
  }

  function shootCooldown() {
    let cd = 0.24;
    if (player.rapidT > 0) cd *= 0.45;
    return cd;
  }

  function firePlayer() {
    if (player.cooldown > 0) return;
    player.cooldown = shootCooldown();
    player.recoil = 0.12;
    const bx = player.x + player.w / 2;
    const by = player.y - 6;
    const mk = (x, vy = -540, spread = 0) => {
      playerBullets.push({ x: x + spread, y: by, vy, r: 5 });
    };
    if (player.tripleT > 0) {
      mk(bx, -540, -12);
      mk(bx);
      mk(bx, -540, 12);
    } else {
      mk(bx);
    }
    sound.shoot();
    meta?.tutorialSignal?.('fire');
    meta?.haptic?.(8);
  }

  function fireEnemy() {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) return;
    const byCol = {};
    alive.forEach(e => {
      if (!byCol[e.col] || e.y > byCol[e.col].y) byCol[e.col] = e;
    });
    const shooters = Object.values(byCol);
    const s = shooters[(gameRandom() * shooters.length) | 0];
    const bulletSpeed = ((level <= 2 ? 120 : 150) + level * 22) * Math.sqrt(activeRun.enemySpeed);
    enemyBullets.push({ x: s.x + s.w / 2, y: s.y + s.h, vy: bulletSpeed, r: 5 });
    sound.enemyShoot();
  }

  function rectHit(bx, by, br, r) {
    return bx > r.x - br && bx < r.x + r.w + br && by > r.y - br && by < r.y + r.h + br;
  }

  function applyPowerUp(type) {
    sound.powerUp();
    meta?.haptic?.([18, 28, 18]);
    if (type === POWER.RAPID) {
      player.rapidT = 8;
      addPopup(player.x + player.w / 2, player.y - 20, 'RAPID!', '#8fd4ff');
    } else if (type === POWER.TRIPLE) {
      player.tripleT = 8;
      addPopup(player.x + player.w / 2, player.y - 20, 'TRIPLO!', '#ffd56a');
    } else if (type === POWER.SHIELD) {
      player.shield = true;
      addPopup(player.x + player.w / 2, player.y - 20, 'SCUDO!', '#9eff9e');
    }
  }

  function pollGamepad() {
    gamepadAxis = 0;
    gamepadFire = false;
    if (!navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find(Boolean);
    if (!pad) {
      gamepadPauseLatch = false;
      gamepadStartLatch = false;
      return;
    }
    meta?.notifyGamepad?.();
    const left = pad.buttons[14]?.pressed;
    const right = pad.buttons[15]?.pressed;
    const axis = Math.abs(pad.axes[0] || 0) > .18 ? pad.axes[0] : 0;
    gamepadAxis = left ? -1 : right ? 1 : axis;
    gamepadFire = Boolean(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[7]?.pressed);
    const pausePressed = Boolean(pad.buttons[9]?.pressed);
    if (pausePressed && !gamepadPauseLatch && state === STATE.PLAYING) togglePause();
    gamepadPauseLatch = pausePressed;
    if (state === STATE.START && gamepadFire && !gamepadStartLatch) meta?.startSelectedRun?.();
    gamepadStartLatch = gamepadFire;
  }

  function update(dt) {
    pollGamepad();
    if (!motionReduced()) stars.forEach(s => { s.tw += dt * 2 * s.parallax; });

    if (shakeT > 0) shakeT -= dt;
    if (flashT > 0) flashT -= dt;
    if (player.recoil > 0) player.recoil -= dt;

    if (state === STATE.LEVELUP) {
      levelBannerT -= dt;
      if (levelBannerT <= 0) state = STATE.PLAYING;
      return;
    }
    if (state !== STATE.PLAYING || paused) return;

    if (levelGrace > 0) levelGrace -= dt;
    if (player.rapidT > 0) player.rapidT -= dt;
    if (player.tripleT > 0) player.tripleT -= dt;
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) resetCombo();
    }

    // Player movement (smooth)
    const keyboardAxis = (keys['ArrowLeft'] || keys['a'] ? -1 : 0) + (keys['ArrowRight'] || keys['d'] ? 1 : 0);
    const moveAxis = keyboardAxis || gamepadAxis;
    if (moveAxis) {
      player.targetX += moveAxis * player.speed * dt;
      meta?.tutorialSignal?.('move');
    }
    player.targetX = Math.max(8, Math.min(W - player.w - 8, player.targetX));
    player.x += (player.targetX - player.x) * Math.min(1, dt * 16);
    player.cooldown -= dt;
    if (player.invincible > 0) player.invincible -= dt;
    if (keys[' '] || fireHeld || gamepadFire || (meta?.autoFireMobile?.() && isCoarsePointer())) firePlayer();

    // Marcia nemici
    const alive = enemies.filter(e => e.alive);
    const speedScale = 1 + (1 - alive.length / (enemies.length || 1)) * 2.2;
    const vx = enemySpeed * speedScale * enemyDir;
    let hitEdge = false;
    if (boss) {
      updateBoss(dt);
    } else {
      alive.forEach(e => {
        e.x += vx * dt;
        e.bob += dt * 10;
        if (e.x < 8 || e.x + e.w > W - 8) hitEdge = true;
      });
      if (hitEdge) {
        enemyDir *= -1;
        alive.forEach(e => { e.y += enemyDrop; e.x += enemyDir * 2; });
      }
    }

    marchTimer -= dt;
    if (marchTimer <= 0 && (alive.length || boss)) {
      marchTimer = Math.max(0.12, 0.7 / speedScale);
      sound.march(marchStep);
      marchStep = (marchStep + 1) % 4;
    }

    if (!boss && alive.some(e => e.y + e.h >= player.y - 4)) {
      gameOver();
      return;
    }

    if (!boss && levelGrace <= 0) {
      enemyFireTimer -= dt;
      if (enemyFireTimer <= 0) {
        fireEnemy();
        const base = Math.max(0.25, 1.15 - level * 0.08);
        const easy = level <= 2 ? 1.4 : 1;
        enemyFireTimer = base * easy * activeRun.enemyFire * (0.6 + gameRandom() * 0.8);
      }
    }

    regenBunkers(dt);

    // Power-up drops
    drops = drops.filter(d => {
      d.y += d.vy * dt;
      if (d.y > H + 20) return false;
      if (rectHit(d.x, d.y, d.r, player)) {
        applyPowerUp(d.type);
        foamExplosion(d.x, d.y, '#ffd56a', 14);
        return false;
      }
      return true;
    });

    playerBullets = playerBullets.filter(b => {
      b.y += b.vy * dt;
      if (b.y < -10) return false;
      if (damageBoss(b)) return false;
      for (const e of enemies) {
        if (e.alive && rectHit(b.x, b.y, b.r, e)) {
          e.alive = false;
          awardKillPoints(e);
          foamExplosion(e.x + e.w / 2, e.y + e.h / 2);
          addShake(0.07, 5);
          flashT = 0.05;
          sound.boom();
          return false;
        }
      }
      for (const blk of bunkers) {
        if (blk.hp > 0 && rectHit(b.x, b.y, b.r, blk)) {
          blk.hp--;
          foamExplosion(b.x, b.y, '#8fa0e0', 6);
          return false;
        }
      }
      return true;
    });

    enemyBullets = enemyBullets.filter(b => {
      b.x += (b.vx || 0) * dt;
      b.y += b.vy * dt;
      if (b.y > H + 10 || b.x < -20 || b.x > W + 20) return false;
      for (const blk of bunkers) {
        if (blk.hp > 0 && rectHit(b.x, b.y, b.r, blk)) {
          blk.hp--;
          foamExplosion(b.x, b.y, '#8fa0e0', 6);
          return false;
        }
      }
      if (player.invincible <= 0 && rectHit(b.x, b.y, b.r, player)) {
        if (player.shield) {
          player.shield = false;
          foamExplosion(b.x, b.y, '#9eff9e', 16);
          addPopup(player.x + player.w / 2, player.y, 'SCUDO!', '#9eff9e', 16);
          return false;
        }
        playerHit();
        return false;
      }
      return true;
    });

    particles = particles.filter(p => {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      return p.t < p.life;
    });

    popups = popups.filter(p => {
      p.t += dt;
      p.y -= 42 * dt;
      return p.t < p.life;
    });

    meta?.updateRun?.({ score, level, lives, combo });
    if (!boss && !enemies.some(e => e.alive)) nextLevel();
  }

  function playerHit() {
    lives--;
    killStreak = 0;
    levelHitTaken = true;
    resetCombo();
    sound.playerHit();
    meta?.haptic?.([70, 40, 70]);
    addShake(0.35, 10);
    foamExplosion(player.x + player.w / 2, player.y + player.h / 2, '#c8102e', 34);
    if (lives <= 0) {
      gameOver();
    } else {
      player.invincible = 2;
      player.x = W / 2 - player.w / 2;
      player.targetX = player.x;
    }
  }

  function gameOver() {
    if (state === STATE.GAMEOVER) return;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('lisaInvadersHigh', highScore);
    }
    state = STATE.GAMEOVER;
    sound.gameOver();
    meta?.onGameOver?.({ score, level, highScore, difficulty: activeRun.id, daily: activeRun.daily });
  }

  function drawBottle(key, x, y, w, h, flip = false) {
    const img = sprites[key];
    if (img && img.complete && img.naturalWidth && !img.broken) {
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      ctx.save();
      if (flip) {
        ctx.translate(dx + dw / 2, dy + dh / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawPowerDrop(d) {
    const colors = { [POWER.RAPID]: '#8fd4ff', [POWER.TRIPLE]: '#ffd56a', [POWER.SHIELD]: '#9eff9e' };
    const labels = { [POWER.RAPID]: 'R', [POWER.TRIPLE]: '3', [POWER.SHIELD]: 'S' };
    ctx.fillStyle = colors[d.type];
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#10173a';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[d.type], d.x, d.y);
    ctx.textBaseline = 'alphabetic';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeT > 0) {
      const m = shakeMag * (shakeT / 0.35);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    stars.forEach(s => {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * s.parallax, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    updateStatusUI();

    if (state === STATE.START) {
      drawStartScreen();
      ctx.restore();
      return;
    }

    bunkers.forEach(b => {
      if (b.hp <= 0) return;
      ctx.fillStyle = b.hp === 2 ? '#f7e8b0' : 'rgba(247,232,176,.45)';
      ctx.fillRect(b.x, b.y, b.w - 1, b.h - 1);
    });

    enemies.forEach(e => {
      if (!e.alive) return;
      const bobY = Math.sin(e.bob) * 3;
      drawBottle(e.key, e.x, e.y + bobY, e.w, e.h, true);
    });

    if (boss?.alive) {
      ctx.save();
      if (boss.flash > 0) ctx.globalAlpha = Math.floor(boss.flash * 100) % 2 ? .45 : 1;
      drawBottle('boss', boss.x, boss.y + Math.sin(boss.phase) * 3, boss.w, boss.h);
      ctx.restore();
      const barW = Math.min(boss.w * .8, portraitLayout ? 210 : 300);
      const barX = W / 2 - barW / 2;
      const barY = boss.y + boss.h + 8;
      ctx.fillStyle = 'rgba(9,13,36,.9)';
      ctx.fillRect(barX - 2, barY - 2, barW + 4, 10);
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(barX, barY, barW * Math.max(0, boss.hp / boss.maxHp), 6);
      ctx.fillStyle = '#f5edd8';
      ctx.font = `bold ${portraitLayout ? 10 : 13}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`BOSS · ${boss.hp}/${boss.maxHp}`, W / 2, barY + 22);
    }

    const py = player.y + (player.recoil > 0 ? player.recoil * 30 : 0);
    if (player.invincible <= 0 || Math.floor(player.invincible * 10) % 2 === 0) {
      drawBottle('lisa', player.x, py, player.w, player.h);
    }
    if (player.shield || player.rapidT > 0 || player.tripleT > 0) {
      ctx.strokeStyle = player.shield ? '#9eff9e' : player.tripleT > 0 ? '#ffd56a' : '#8fd4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(player.x - 4, py - 4, player.w + 8, player.h + 8);
    }

    playerBullets.forEach(b => {
      ctx.fillStyle = '#f5edd8';
      ctx.strokeStyle = '#c8102e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    enemyBullets.forEach(b => {
      ctx.fillStyle = b.boss ? '#c8102e' : '#e8a020';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 8);
      ctx.quadraticCurveTo(b.x + 6, b.y, b.x, b.y + 5);
      ctx.quadraticCurveTo(b.x - 6, b.y, b.x, b.y - 8);
      ctx.fill();
    });

    drops.forEach(drawPowerDrop);

    particles.forEach(p => {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    popups.forEach(p => {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.font = `bold ${p.size}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;

    if (flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashT * 4})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (state === STATE.LEVELUP) {
      overlay(level % 5 === 0 ? `BOSS · LIVELLO ${level}` : `LIVELLO ${level}`, level % 5 === 0 ? 'Tre pattern di attacco · distruggilo!' : 'Le lager tornano più cattive…', false);
    } else if (paused) {
      overlay('PAUSA', portraitLayout ? 'Tocca RIPRENDI per continuare' : 'Premi P per riprendere', false);
    }

    ctx.restore();
  }

  function overlay(title, sub, dark) {
    ctx.fillStyle = dark ? 'rgba(9,13,36,.82)' : 'rgba(9,13,36,.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5edd8';
    ctx.font = `bold ${portraitLayout ? 34 : 52}px "Courier New", monospace`;
    ctx.shadowColor = '#c8102e';
    ctx.shadowBlur = 18;
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.font = `${portraitLayout ? 14 : 18}px "Courier New", monospace`;
    ctx.fillStyle = '#8fa0e0';
    sub.split('\n').forEach((line, i) => {
      ctx.fillText(line, W / 2, H / 2 + 24 + i * 28);
    });
  }

  function drawStartScreen() {
    ctx.textAlign = 'center';
    if (assetsLoaded < assetsTotal) {
      ctx.fillStyle = '#8fa0e0';
      ctx.font = '18px "Courier New", monospace';
      ctx.fillText('Caricamento...', W / 2, H / 2);
      return;
    }
    const heroH = portraitLayout ? 108 : 142;
    const heroW = Math.round(heroH * ASPECT.lisa);
    const heroY = portraitLayout ? 34 : 62;
    drawBottle('lisa', W / 2 - heroW / 2, heroY, heroW, heroH);
    ctx.fillStyle = '#f5edd8';
    ctx.font = `bold ${portraitLayout ? 29 : 44}px "Courier New", monospace`;
    ctx.shadowColor = '#c8102e';
    ctx.shadowBlur = 16;
    const titleY = portraitLayout ? 176 : 238;
    ctx.fillText('LISA INVADERS', W / 2, titleY);
    ctx.shadowBlur = 0;

    ctx.font = `${portraitLayout ? 13 : 16}px "Courier New", monospace`;
    ctx.fillStyle = '#8fa0e0';
    ENEMY_ROWS.forEach((r, i) => {
      const rowGap = portraitLayout ? 48 : 54;
      const y = titleY + (portraitLayout ? 44 : 52) + i * rowGap;
      const bottleH = portraitLayout ? 35 : 42;
      const bottleW = Math.round(bottleH * ASPECT[r.key]);
      drawBottle(r.key, W / 2 - (portraitLayout ? 94 : 110), y - bottleH * .68, bottleW, bottleH, true);
      ctx.textAlign = 'left';
      ctx.fillText(`${r.name} = ${r.points} punti`, W / 2 - (portraitLayout ? 58 : 65), y);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5edd8';
    ctx.font = `bold ${portraitLayout ? 14 : 18}px "Courier New", monospace`;
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillText(portraitLayout ? 'TOCCA PER INIZIARE' : 'PREMI SPAZIO O TOCCA PER INIZIARE', W / 2, H - 48);
    }
    ctx.font = `${portraitLayout ? 11 : 14}px "Courier New", monospace`;
    ctx.fillStyle = '#8fa0e0';
    const isCoarse = portraitLayout || window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) {
      ctx.fillText(landscapeLayout ? '◎ spara · trascina per muoverti' : '◎ sinistra spara · trascina per muoverti', W / 2, H - 22);
    } else {
      ctx.fillText('← → per muoverti · SPAZIO o clic per sparare', W / 2, H - 24);
    }
  }

  // ---------- Input ----------
  window.addEventListener('keydown', e => {
    if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
    if (e.key === ' ' && state === STATE.START) { meta?.startSelectedRun?.(); return; }
    if ((e.key === 'r' || e.key === 'R') && state !== STATE.START) resetGame();
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'm' || e.key === 'M') toggleSound();
  });
  window.addEventListener('keyup', e => {
    keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false;
  });

  let dragging = false;
  let activePointerId = null;
  const isTouchPointer = e => e.pointerType === 'touch' || e.pointerType === 'pen';
  const isCoarsePointer = () => isCompactLayout() || window.matchMedia('(pointer: coarse)').matches;

  function canvasXFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) * (W / rect.width);
  }

  function movePlayerToPointer(e) {
    const x = canvasXFromEvent(e);
    player.targetX = Math.max(8, Math.min(W - player.w - 8, x - player.w / 2));
    meta?.tutorialSignal?.('move');
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isTouchPointer(e)) e.preventDefault();
    sound.ensure();
    if (state === STATE.START) { meta?.startSelectedRun?.(); return; }
    if (state === STATE.GAMEOVER) { startRun(activeRun); return; }
    dragging = true;
    activePointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    if (isTouchPointer(e) || isCoarsePointer()) {
      movePlayerToPointer(e);
    } else {
      firePlayer();
    }
  }

  function onPointerMove(e) {
    if (!dragging || activePointerId !== e.pointerId || state !== STATE.PLAYING) return;
    if (isTouchPointer(e)) e.preventDefault();
    movePlayerToPointer(e);
  }

  function onPointerUp(e) {
    if (activePointerId !== e.pointerId) return;
    if (isTouchPointer(e)) e.preventDefault();
    dragging = false;
    activePointerId = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture', () => {
    dragging = false;
    activePointerId = null;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  const btnSound = document.getElementById('btn-sound');
  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');
  const btnFire = document.getElementById('btn-fire');
  const btnPauseMini = document.getElementById('btn-pause-mini');
  const btnSoundMini = document.getElementById('btn-sound-mini');

  function toggleSound() {
    sound.enabled = !sound.enabled;
    localStorage.setItem('lisaInvadersSound', sound.enabled ? 'on' : 'off');
    const label = sound.enabled ? '🔊 SUONO: ON' : '🔇 SUONO: OFF';
    btnSound.textContent = label;
    if (btnSoundMini) btnSoundMini.textContent = sound.enabled ? '🔊' : '🔇';
    if (sound.enabled) sound.ensure();
  }
  function togglePause() {
    if (state !== STATE.PLAYING) return;
    paused = !paused;
    updatePauseBtn();
  }
  function updatePauseBtn() {
    const label = paused ? '▶ RIPRENDI' : '⏸ PAUSA';
    btnPause.textContent = label;
    if (btnPauseMini) btnPauseMini.textContent = paused ? '▶' : '⏸';
  }

  btnSound.textContent = sound.enabled ? '🔊 SUONO: ON' : '🔇 SUONO: OFF';
  if (btnSoundMini) btnSoundMini.textContent = sound.enabled ? '🔊' : '🔇';
  btnSound.addEventListener('click', toggleSound);
  btnPause.addEventListener('click', togglePause);
  if (btnSoundMini) btnSoundMini.addEventListener('click', toggleSound);
  if (btnPauseMini) btnPauseMini.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', () => state === STATE.START ? meta?.startSelectedRun?.() : resetGame());

  if (btnFire) {
    let firePointerId = null;
    const startFire = e => {
      e.preventDefault();
      e.stopPropagation();
      if (state === STATE.START) meta?.startSelectedRun?.();
      else if (state === STATE.GAMEOVER) startRun(activeRun);
      firePointerId = e.pointerId;
      fireHeld = true;
      btnFire.classList.add('is-active');
      sound.ensure();
      firePlayer();
      meta?.tutorialSignal?.('fire');
    };
    const endFire = e => {
      if (firePointerId !== null && e.pointerId !== firePointerId) return;
      e.preventDefault();
      firePointerId = null;
      fireHeld = false;
      btnFire.classList.remove('is-active');
    };
    btnFire.addEventListener('pointerdown', startFire);
    btnFire.addEventListener('pointerup', endFire);
    btnFire.addEventListener('pointerleave', endFire);
    btnFire.addEventListener('pointercancel', endFire);
    btnFire.addEventListener('contextmenu', e => e.preventDefault());
  }

  function clearActiveInput() {
    Object.keys(keys).forEach(key => { keys[key] = false; });
    fireHeld = false;
    dragging = false;
    activePointerId = null;
    gamepadAxis = 0;
    gamepadFire = false;
    if (btnFire) btnFire.classList.remove('is-active');
  }

  window.addEventListener('lisa:start', event => startRun(event.detail || defaultRun));
  window.addEventListener('lisa:menu', () => {
    clearActiveInput();
    state = STATE.START;
    paused = false;
    boss = null;
    enemies = [];
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    drops = [];
    popups = [];
    updatePauseBtn();
  });
  window.addEventListener('lisa:pause-request', () => {
    if (state === STATE.PLAYING && !paused) {
      clearActiveInput();
      paused = true;
      updatePauseBtn();
    }
  });

  function pauseForInterruption() {
    clearActiveInput();
    if (state === STATE.PLAYING && !paused) {
      paused = true;
      updatePauseBtn();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseForInterruption();
  });
  window.addEventListener('blur', pauseForInterruption);

  let resizeTimer = null;
  function applyResponsiveLayout() {
    const nextMode = detectLayoutMode();
    if (nextMode === layoutMode) {
      updateGameWidthLimit();
      return;
    }
    layoutMode = nextMode;
    portraitLayout = layoutMode === 'portrait';
    landscapeLayout = layoutMode === 'landscape';
    enemyDrop = isCompactLayout() ? (landscapeLayout ? 14 : 18) : 22;
    configureCanvas();
    buildStars();
    placePlayer();
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    drops = [];
    popups = [];
    clearActiveInput();
    if (state === STATE.PLAYING || state === STATE.LEVELUP) {
      spawnWave();
      buildBunkers();
      state = STATE.PLAYING;
      paused = true;
      updatePauseBtn();
    }
    statusSignature = '';
    updateStatusUI(true);
    draw();
  }

  window.addEventListener('lisa:play-mode', () => updateGameWidthLimit());
  window.addEventListener('lisa:settings', () => {
    document.body.classList.toggle('auto-fire-on', Boolean(meta?.autoFireMobile?.() && isCoarsePointer()));
  });

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateGameWidthLimit();
      applyResponsiveLayout();
    }, 120);
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  updateStatusUI(true);
  requestAnimationFrame(loop);
})();
