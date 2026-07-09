/* ============================================================
   LISA INVADERS — Birra del Borgo vs le lager industriali
   ============================================================ */
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // ---------- Assets ----------
  const IMAGES = {
    lisa: 'assets/lisa.png',
    bud: 'assets/bud.png',
    becks: 'assets/becks.png',
    corona: 'assets/corona.png',
    tennents: 'assets/tennents.png',
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
    bud: 178 / 600,
    becks: 155 / 600,
    tennents: 278 / 600,
    corona: 147 / 600,
  };

  const ENEMY_ROWS = [
    { key: 'bud',      name: "Bud",       points: 40 },
    { key: 'becks',    name: "Beck's",    points: 30 },
    { key: 'tennents', name: "Tennent's", points: 20 },
    { key: 'corona',   name: 'Corona',    points: 10 },
  ];

  const POWER = { RAPID: 'rapid', TRIPLE: 'triple', SHIELD: 'shield' };
  const COMBO_WINDOW = 1.5;

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
  let shakeT = 0;
  let shakeMag = 0;
  let flashT = 0;

  const player = {
    w: Math.round(88 * ASPECT.lisa), h: 88,
    x: W / 2 - Math.round(88 * ASPECT.lisa) / 2,
    targetX: W / 2 - Math.round(88 * ASPECT.lisa) / 2,
    y: H - 106,
    speed: 420,
    cooldown: 0,
    invincible: 0,
    recoil: 0,
    shield: false,
    rapidT: 0,
    tripleT: 0,
  };

  let enemies = [];
  let enemyDir = 1;
  let enemySpeed = 0;
  const enemyDrop = 22;
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

  for (let i = 0; i < 90; i++) {
    const layer = Math.random();
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.4,
      tw: Math.random() * Math.PI * 2,
      parallax: 0.3 + layer * 0.7,
    });
  }

  const keys = {};
  let fireHeld = false;

  function getComboMultiplier() {
    if (combo < 3) return 1;
    if (combo < 6) return 2;
    if (combo < 10) return 3;
    return 4;
  }

  function addShake(dur, mag) {
    shakeT = Math.max(shakeT, dur);
    shakeMag = Math.max(shakeMag, mag);
  }

  function addPopup(x, y, text, color = '#f5edd8', size = 18) {
    popups.push({ x, y, text, color, size, t: 0, life: 0.85 });
  }

  function awardKillPoints(e) {
    combo++;
    comboTimer = COMBO_WINDOW;
    const mult = getComboMultiplier();
    const pts = e.points * mult;
    score += pts;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('lisaInvadersHigh', highScore);
    }
    if (mult > 1) sound.combo();
    addPopup(e.x + e.w / 2, e.y, `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, mult > 1 ? '#ffd56a' : '#f5edd8', mult > 1 ? 20 : 16);
    if (Math.random() < 0.08) {
      const types = [POWER.RAPID, POWER.TRIPLE, POWER.SHIELD];
      drops.push({
        x: e.x + e.w / 2, y: e.y + e.h / 2,
        vy: 60, type: types[(Math.random() * types.length) | 0], r: 14,
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
    const cols = Math.min(7 + Math.floor((level - 1) / 2), 9);
    const cellW = 46, eh = 68;
    const gapX = 30, gapY = 16;
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 84;
    ENEMY_ROWS.forEach((row, r) => {
      const ew = Math.round(eh * ASPECT[row.key]);
      for (let c = 0; c < cols; c++) {
        enemies.push({
          x: startX + c * (cellW + gapX) + (cellW - ew) / 2,
          y: startY + r * (eh + gapY),
          w: ew, h: eh,
          col: c,
          key: row.key, points: row.points, alive: true,
          bob: Math.random() * Math.PI * 2,
        });
      }
    });
    enemyDir = 1;
    enemySpeed = (level <= 2 ? 18 : 22) + (level - 1) * 9;
    enemyFireTimer = initialFireDelay();
    marchTimer = 0;
  }

  function buildBunkers() {
    bunkers = [];
    const bw = 10, bh = 10;
    const shape = [
      '..######..',
      '.########.',
      '##########',
      '##########',
      '###....###',
      '##......##',
    ];
    const positions = [W * 0.17, W * 0.415, W * 0.66];
    positions.forEach(px => {
      shape.forEach((rowStr, ry) => {
        [...rowStr].forEach((ch, rx) => {
          if (ch === '#') {
            bunkers.push({ x: px + rx * bw, y: H - 210 + ry * bh, w: bw, h: bh, hp: 2, maxHp: 2 });
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

  function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    popups = [];
    drops = [];
    resetCombo();
    player.x = W / 2 - player.w / 2;
    player.targetX = player.x;
    player.invincible = 0;
    player.shield = false;
    player.rapidT = 0;
    player.tripleT = 0;
    player.recoil = 0;
    paused = false;
    levelGrace = 5;
    spawnWave();
    buildBunkers();
    state = STATE.PLAYING;
    updatePauseBtn();
  }

  function nextLevel() {
    level++;
    playerBullets = [];
    enemyBullets = [];
    drops = [];
    levelGrace = level <= 2 ? 4 : 0;
    spawnWave();
    buildBunkers();
    levelBannerT = 1.6;
    state = STATE.LEVELUP;
    sound.levelUp();
  }

  function foamExplosion(x, y, baseColor = '#f7e8b0', n = 22) {
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
  }

  function fireEnemy() {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) return;
    const byCol = {};
    alive.forEach(e => {
      if (!byCol[e.col] || e.y > byCol[e.col].y) byCol[e.col] = e;
    });
    const shooters = Object.values(byCol);
    const s = shooters[(Math.random() * shooters.length) | 0];
    const bulletSpeed = (level <= 2 ? 120 : 150) + level * 22;
    enemyBullets.push({ x: s.x + s.w / 2, y: s.y + s.h, vy: bulletSpeed, r: 5 });
    sound.enemyShoot();
  }

  function rectHit(bx, by, br, r) {
    return bx > r.x - br && bx < r.x + r.w + br && by > r.y - br && by < r.y + r.h + br;
  }

  function applyPowerUp(type) {
    sound.powerUp();
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

  function update(dt) {
    stars.forEach(s => { s.tw += dt * 2 * s.parallax; });

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
    if (keys['ArrowLeft'] || keys['a']) player.targetX -= player.speed * dt;
    if (keys['ArrowRight'] || keys['d']) player.targetX += player.speed * dt;
    player.targetX = Math.max(8, Math.min(W - player.w - 8, player.targetX));
    player.x += (player.targetX - player.x) * Math.min(1, dt * 16);
    player.cooldown -= dt;
    if (player.invincible > 0) player.invincible -= dt;
    if (keys[' '] || fireHeld) firePlayer();

    // Marcia nemici
    const alive = enemies.filter(e => e.alive);
    const speedScale = 1 + (1 - alive.length / (enemies.length || 1)) * 2.2;
    const vx = enemySpeed * speedScale * enemyDir;
    let hitEdge = false;
    alive.forEach(e => {
      e.x += vx * dt;
      e.bob += dt * 10;
      if (e.x < 8 || e.x + e.w > W - 8) hitEdge = true;
    });
    if (hitEdge) {
      enemyDir *= -1;
      alive.forEach(e => { e.y += enemyDrop; e.x += enemyDir * 2; });
    }

    marchTimer -= dt;
    if (marchTimer <= 0 && alive.length) {
      marchTimer = Math.max(0.12, 0.7 / speedScale);
      sound.march(marchStep);
      marchStep = (marchStep + 1) % 4;
    }

    if (alive.some(e => e.y + e.h >= player.y - 4)) {
      gameOver();
      return;
    }

    if (levelGrace <= 0) {
      enemyFireTimer -= dt;
      if (enemyFireTimer <= 0) {
        fireEnemy();
        const base = Math.max(0.25, 1.15 - level * 0.08);
        const easy = level <= 2 ? 1.4 : 1;
        enemyFireTimer = base * easy * (0.6 + Math.random() * 0.8);
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
      b.y += b.vy * dt;
      if (b.y > H + 10) return false;
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

    if (!enemies.some(e => e.alive)) nextLevel();
  }

  function playerHit() {
    lives--;
    resetCombo();
    sound.playerHit();
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
    state = STATE.GAMEOVER;
    sound.gameOver();
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
    ctx.save();
    if (shakeT > 0) {
      const m = shakeMag * (shakeT / 0.35);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.clearRect(0, 0, W, H);

    stars.forEach(s => {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * s.parallax, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`PUNTI: ${score}`, 16, 28);
    ctx.textAlign = 'center';
    ctx.fillText(`RECORD: ${highScore}`, W / 2, 28);
    ctx.textAlign = 'right';
    ctx.fillText(`LIVELLO ${level}`, W - 16, 28);

    if (combo >= 3) {
      ctx.fillStyle = '#ffd56a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.fillText(`COMBO ×${getComboMultiplier()}`, W / 2, 48);
    }

    for (let i = 0; i < lives; i++) {
      drawBottle('lisa', 16 + i * 22, 40, 16, 28);
    }
    if (player.shield) {
      ctx.strokeStyle = '#9eff9e';
      ctx.lineWidth = 2;
      ctx.strokeRect(14, 38, lives * 22 + 4, 32);
    }

    ctx.strokeStyle = 'rgba(200,16,46,.5)';
    ctx.beginPath();
    ctx.moveTo(0, 74); ctx.lineTo(W, 74);
    ctx.stroke();

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
      ctx.fillStyle = '#e8a020';
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
      ctx.fillRect(0, 74, W, H - 74);
    }

    if (state === STATE.LEVELUP) {
      overlay(`LIVELLO ${level}`, 'Le lager tornano più cattive…', false);
    } else if (state === STATE.GAMEOVER) {
      overlay('GAME OVER', `Punteggio: ${score}${score >= highScore && score > 0 ? '  ★ NUOVO RECORD!' : ''}\nPremi R o RIAVVIA per riprovare`, true);
    } else if (paused) {
      overlay('PAUSA', 'Premi P per riprendere', false);
    }

    ctx.restore();
  }

  function overlay(title, sub, dark) {
    ctx.fillStyle = dark ? 'rgba(9,13,36,.82)' : 'rgba(9,13,36,.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.shadowColor = '#c8102e';
    ctx.shadowBlur = 18;
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.font = '18px "Courier New", monospace';
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
    drawBottle('lisa', W / 2 - 45, 120, 90, 152);
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 44px "Courier New", monospace';
    ctx.shadowColor = '#c8102e';
    ctx.shadowBlur = 16;
    ctx.fillText('LISA INVADERS', W / 2, 330);
    ctx.shadowBlur = 0;

    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#8fa0e0';
    ENEMY_ROWS.forEach((r, i) => {
      const y = 370 + i * 52;
      drawBottle(r.key, W / 2 - 110, y - 24, 28, 42, true);
      ctx.textAlign = 'left';
      ctx.fillText(`${r.name}  =  ${r.points} punti`, W / 2 - 65, y);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 18px "Courier New", monospace';
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillText('PREMI SPAZIO O TOCCA PER INIZIARE', W / 2, H - 52);
    }
    ctx.font = '14px "Courier New", monospace';
    ctx.fillStyle = '#8fa0e0';
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) {
      ctx.fillText('Trascina a sinistra per muoverti · SPARA per sparare', W / 2, H - 24);
    } else {
      ctx.fillText('← → per muoverti · SPAZIO o clic per sparare', W / 2, H - 24);
    }
  }

  // ---------- Input ----------
  window.addEventListener('keydown', e => {
    if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
    if (e.key === ' ' && state === STATE.START) { resetGame(); return; }
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
  const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

  function canvasXFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) * (W / rect.width);
  }

  function movePlayerToPointer(e) {
    const x = canvasXFromEvent(e);
    player.targetX = Math.max(8, Math.min(W - player.w - 8, x - player.w / 2));
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isTouchPointer(e)) e.preventDefault();
    sound.ensure();
    if (state === STATE.START) { resetGame(); return; }
    if (state === STATE.GAMEOVER) { resetGame(); return; }
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
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  const btnSound = document.getElementById('btn-sound');
  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');
  const btnFire = document.getElementById('btn-fire');

  function toggleSound() {
    sound.enabled = !sound.enabled;
    localStorage.setItem('lisaInvadersSound', sound.enabled ? 'on' : 'off');
    btnSound.textContent = sound.enabled ? '🔊 SUONO: ON' : '🔇 SUONO: OFF';
    if (sound.enabled) sound.ensure();
  }
  function togglePause() {
    if (state !== STATE.PLAYING) return;
    paused = !paused;
    updatePauseBtn();
  }
  function updatePauseBtn() {
    btnPause.textContent = paused ? '▶ RIPRENDI' : '⏸ PAUSA';
  }

  btnSound.textContent = sound.enabled ? '🔊 SUONO: ON' : '🔇 SUONO: OFF';
  btnSound.addEventListener('click', toggleSound);
  btnPause.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', resetGame);

  if (btnFire) {
    const startFire = e => { e.preventDefault(); fireHeld = true; sound.ensure(); };
    const endFire = e => { e.preventDefault(); fireHeld = false; };
    btnFire.addEventListener('pointerdown', startFire);
    btnFire.addEventListener('pointerup', endFire);
    btnFire.addEventListener('pointerleave', endFire);
    btnFire.addEventListener('pointercancel', endFire);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
