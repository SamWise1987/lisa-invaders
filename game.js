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

  // Proporzioni reali degli sprite (larghezza/altezza) per non deformarli
  const ASPECT = {
    lisa: 761 / 1120,
    bud: 178 / 600,
    becks: 155 / 600,
    tennents: 278 / 600,
    corona: 147 / 600,
  };

  // Ordine righe (dall'alto): più in alto = più punti
  const ENEMY_ROWS = [
    { key: 'bud',      name: "Bud",       points: 40 },
    { key: 'becks',    name: "Beck's",    points: 30 },
    { key: 'tennents', name: "Tennent's", points: 20 },
    { key: 'corona',   name: 'Corona',    points: 10 },
  ];

  // ---------- Audio (WebAudio, niente file) ----------
  const sound = {
    enabled: true,
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
    shoot()    { this.tone(880, 0.12, 'square', 0.06, 220); },
    enemyShoot(){ this.tone(200, 0.15, 'sawtooth', 0.04, 90); },
    boom()     { this.tone(140, 0.25, 'sawtooth', 0.1, 40); },
    playerHit(){ this.tone(300, 0.5, 'sawtooth', 0.12, 50); },
    march(step){ this.tone([110, 98, 87, 78][step], 0.08, 'triangle', 0.07); },
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
  const STATE = { START: 0, PLAYING: 1, LEVELUP: 2, GAMEOVER: 3, WIN_PAUSE: 4 };
  let state = STATE.START;
  let paused = false;

  let score = 0;
  let highScore = +(localStorage.getItem('lisaInvadersHigh') || 0);
  let lives = 3;
  let level = 1;
  let levelBannerT = 0;

  const player = {
    w: Math.round(88 * ASPECT.lisa), h: 88,
    x: W / 2 - Math.round(88 * ASPECT.lisa) / 2, y: H - 106,
    speed: 360,
    cooldown: 0,
    invincible: 0,
  };

  let enemies = [];
  let enemyDir = 1;
  let enemySpeed = 0;
  let enemyDrop = 22;
  let marchStep = 0;
  let marchTimer = 0;
  let enemyFireTimer = 0;

  let playerBullets = [];
  let enemyBullets = [];
  let particles = [];
  let bunkers = [];
  let stars = [];

  for (let i = 0; i < 90; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2 });
  }

  const keys = {};

  // ---------- Onda nemica ----------
  function spawnWave() {
    enemies = [];
    const cols = Math.min(7 + Math.floor((level - 1) / 2), 9);
    const cellW = 46, eh = 68;
    const gapX = 30, gapY = 16;
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 84;
    ENEMY_ROWS.forEach((row, r) => {
      // larghezza reale in base alle proporzioni dello sprite, centrata nella cella
      const ew = Math.round(eh * ASPECT[row.key]);
      for (let c = 0; c < cols; c++) {
        enemies.push({
          x: startX + c * (cellW + gapX) + (cellW - ew) / 2,
          y: startY + r * (eh + gapY),
          w: ew, h: eh,
          col: c,
          key: row.key, points: row.points, alive: true,
        });
      }
    });
    enemyDir = 1;
    enemySpeed = 22 + (level - 1) * 9;
    enemyFireTimer = 1.5;
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
            bunkers.push({ x: px + rx * bw, y: H - 210 + ry * bh, w: bw, h: bh, hp: 2 });
          }
        });
      });
    });
  }

  function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    player.x = W / 2 - player.w / 2;
    player.invincible = 0;
    paused = false;
    spawnWave();
    buildBunkers();
    state = STATE.PLAYING;
    updatePauseBtn();
  }

  function nextLevel() {
    level++;
    playerBullets = [];
    enemyBullets = [];
    spawnWave();
    buildBunkers();
    levelBannerT = 2;
    state = STATE.LEVELUP;
    sound.levelUp();
  }

  // ---------- Particelle (schiuma!) ----------
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

  // ---------- Sparo ----------
  function firePlayer() {
    if (player.cooldown > 0) return;
    player.cooldown = 0.34;
    playerBullets.push({ x: player.x + player.w / 2, y: player.y - 6, vy: -540, r: 5 });
    sound.shoot();
  }

  function fireEnemy() {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) return;
    // spara dal fondo di una colonna casuale
    const byCol = {};
    alive.forEach(e => {
      if (!byCol[e.col] || e.y > byCol[e.col].y) byCol[e.col] = e;
    });
    const shooters = Object.values(byCol);
    const s = shooters[(Math.random() * shooters.length) | 0];
    enemyBullets.push({ x: s.x + s.w / 2, y: s.y + s.h, vy: 150 + level * 22, r: 5 });
    sound.enemyShoot();
  }

  // ---------- Collisioni ----------
  function rectHit(bx, by, br, r) {
    return bx > r.x - br && bx < r.x + r.w + br && by > r.y - br && by < r.y + r.h + br;
  }

  // ---------- Update ----------
  function update(dt) {
    stars.forEach(s => { s.tw += dt * 2; });

    if (state === STATE.LEVELUP) {
      levelBannerT -= dt;
      if (levelBannerT <= 0) state = STATE.PLAYING;
      return;
    }
    if (state !== STATE.PLAYING || paused) return;

    // Player
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed * dt;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed * dt;
    player.x = Math.max(8, Math.min(W - player.w - 8, player.x));
    player.cooldown -= dt;
    if (player.invincible > 0) player.invincible -= dt;
    if (keys[' ']) firePlayer();

    // Marcia nemici
    const alive = enemies.filter(e => e.alive);
    const speedScale = 1 + (1 - alive.length / (enemies.length || 1)) * 2.2;
    const vx = enemySpeed * speedScale * enemyDir;
    let hitEdge = false;
    alive.forEach(e => {
      e.x += vx * dt;
      if (e.x < 8 || e.x + e.w > W - 8) hitEdge = true;
    });
    if (hitEdge) {
      enemyDir *= -1;
      alive.forEach(e => { e.y += enemyDrop; e.x += enemyDir * 2; });
    }

    // Suono marcia
    marchTimer -= dt;
    if (marchTimer <= 0 && alive.length) {
      marchTimer = Math.max(0.12, 0.7 / speedScale);
      sound.march(marchStep);
      marchStep = (marchStep + 1) % 4;
    }

    // I nemici raggiungono la base → game over
    if (alive.some(e => e.y + e.h >= player.y - 4)) {
      gameOver();
      return;
    }

    // Fuoco nemico
    enemyFireTimer -= dt;
    if (enemyFireTimer <= 0) {
      fireEnemy();
      enemyFireTimer = Math.max(0.25, 1.15 - level * 0.08) * (0.6 + Math.random() * 0.8);
    }

    // Proiettili giocatore
    playerBullets = playerBullets.filter(b => {
      b.y += b.vy * dt;
      if (b.y < -10) return false;
      for (const e of enemies) {
        if (e.alive && rectHit(b.x, b.y, b.r, e)) {
          e.alive = false;
          score += e.points;
          if (score > highScore) {
            highScore = score;
            localStorage.setItem('lisaInvadersHigh', highScore);
          }
          foamExplosion(e.x + e.w / 2, e.y + e.h / 2);
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

    // Proiettili nemici
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
        playerHit();
        return false;
      }
      return true;
    });

    // Particelle
    particles = particles.filter(p => {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      return p.t < p.life;
    });

    // Onda completata
    if (!enemies.some(e => e.alive)) nextLevel();
  }

  function playerHit() {
    lives--;
    sound.playerHit();
    foamExplosion(player.x + player.w / 2, player.y + player.h / 2, '#c8102e', 34);
    if (lives <= 0) {
      gameOver();
    } else {
      player.invincible = 2;
      player.x = W / 2 - player.w / 2;
    }
  }

  function gameOver() {
    state = STATE.GAMEOVER;
    sound.gameOver();
  }

  // ---------- Render ----------
  function drawBottle(key, x, y, w, h, flip = false) {
    const img = sprites[key];
    if (img && img.complete && img.naturalWidth) {
      // adatta lo sprite nel box senza deformarlo
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

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Stelle
    stars.forEach(s => {
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.tw));
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // HUD in alto
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`PUNTI: ${score}`, 16, 28);
    ctx.textAlign = 'center';
    ctx.fillText(`RECORD: ${highScore}`, W / 2, 28);
    ctx.textAlign = 'right';
    ctx.fillText(`LIVELLO ${level}`, W - 16, 28);
    // Vite (bottigliette)
    for (let i = 0; i < lives; i++) {
      drawBottle('lisa', 16 + i * 22, 40, 16, 28);
    }
    ctx.strokeStyle = 'rgba(200,16,46,.5)';
    ctx.beginPath();
    ctx.moveTo(0, 74); ctx.lineTo(W, 74);
    ctx.stroke();

    if (state === STATE.START) {
      drawStartScreen();
      return;
    }

    // Bunker (fusti di schiuma)
    bunkers.forEach(b => {
      if (b.hp <= 0) return;
      ctx.fillStyle = b.hp === 2 ? '#f7e8b0' : 'rgba(247,232,176,.45)';
      ctx.fillRect(b.x, b.y, b.w - 1, b.h - 1);
    });

    // Nemici (bottiglie capovolte)
    enemies.forEach(e => {
      if (e.alive) drawBottle(e.key, e.x, e.y, e.w, e.h, true);
    });

    // Player Lisa (lampeggia se invincibile)
    if (player.invincible <= 0 || Math.floor(player.invincible * 10) % 2 === 0) {
      drawBottle('lisa', player.x, player.y, player.w, player.h);
    }

    // Proiettili giocatore: tappi
    playerBullets.forEach(b => {
      ctx.fillStyle = '#f5edd8';
      ctx.strokeStyle = '#c8102e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Proiettili nemici: gocce
    enemyBullets.forEach(b => {
      ctx.fillStyle = '#e8a020';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 8);
      ctx.quadraticCurveTo(b.x + 6, b.y, b.x, b.y + 5);
      ctx.quadraticCurveTo(b.x - 6, b.y, b.x, b.y - 8);
      ctx.fill();
    });

    // Particelle
    particles.forEach(p => {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (state === STATE.LEVELUP) {
      overlay(`LIVELLO ${level}`, 'Le lager tornano più cattive…', false);
    } else if (state === STATE.GAMEOVER) {
      overlay('GAME OVER', `Punteggio: ${score}${score >= highScore && score > 0 ? '  ★ NUOVO RECORD!' : ''}\nPremi R o RIAVVIA per riprovare`, true);
    } else if (paused) {
      overlay('PAUSA', 'Premi P per riprendere', false);
    }
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
    // Lisa al centro
    drawBottle('lisa', W / 2 - 45, 120, 90, 152);
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 44px "Courier New", monospace';
    ctx.shadowColor = '#c8102e';
    ctx.shadowBlur = 16;
    ctx.fillText('LISA INVADERS', W / 2, 330);
    ctx.shadowBlur = 0;

    // I 4 invasori con punteggi
    ctx.font = '16px "Courier New", monospace';
    ctx.fillStyle = '#8fa0e0';
    const rows = [...ENEMY_ROWS];
    rows.forEach((r, i) => {
      const y = 370 + i * 52;
      drawBottle(r.key, W / 2 - 110, y - 24, 28, 42, true);
      ctx.textAlign = 'left';
      ctx.fillText(`${r.name}  =  ${r.points} punti`, W / 2 - 65, y);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 20px "Courier New", monospace';
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    if (blink) ctx.fillText('PREMI SPAZIO O TOCCA PER INIZIARE', W / 2, H - 32);
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

  // Touch / pointer: trascina per muovere, tocca per sparare
  let dragging = false;
  canvas.addEventListener('pointerdown', e => {
    sound.ensure();
    if (state === STATE.START) { resetGame(); return; }
    if (state === STATE.GAMEOVER) { resetGame(); return; }
    dragging = true;
    firePlayer();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging || state !== STATE.PLAYING) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    player.x = Math.max(8, Math.min(W - player.w - 8, x - player.w / 2));
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  // Bottoni
  const btnSound = document.getElementById('btn-sound');
  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');

  function toggleSound() {
    sound.enabled = !sound.enabled;
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
  btnSound.addEventListener('click', toggleSound);
  btnPause.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', resetGame);

  // ---------- Loop ----------
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
