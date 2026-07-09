/* ============================================================
   LISA INVADERS 3D — Birra del Borgo vs le lager industriali
   Three.js rendering + game-state scoring module
   ============================================================ */
(() => {
  const GS = window.GameState;
  const W = 900;
  const H = 640;

  const container = document.getElementById('game-container');
  const hudCanvas = document.getElementById('hud-overlay');
  const hudCtx = hudCanvas.getContext('2d');

  // ---------- Three.js setup ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f2a);
  scene.fog = new THREE.Fog(0x0a0f2a, 500, 1400);

  const camera = new THREE.PerspectiveCamera(40, W / H, 1, 2500);
  camera.position.set(W * 0.5, 520, H + 560);
  camera.lookAt(W * 0.5, 0, H * 0.42);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x6d7fc4, 0.55);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.1);
  keyLight.position.set(W * 0.3, 500, H * 0.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -W;
  keyLight.shadow.camera.right = W * 2;
  keyLight.shadow.camera.top = H;
  keyLight.shadow.camera.bottom = -H;
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xc8102e, 0.35);
  rimLight.position.set(W * 0.8, 200, H);
  scene.add(rimLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 120, H + 120),
    new THREE.MeshStandardMaterial({ color: 0x121a3d, roughness: 0.9, metalness: 0.1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, -2, H / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(Math.max(W, H), 24, 0x2a3568, 0x1a2248);
  grid.position.set(W / 2, -1, H / 2);
  scene.add(grid);

  // Starfield
  const starGeo = new THREE.BufferGeometry();
  const starCount = 220;
  const starPos = new Float32Array(starCount * 3);
  const stars = [];
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * W;
    const y = 80 + Math.random() * 400;
    const z = Math.random() * H;
    starPos[i * 3] = x;
    starPos[i * 3 + 1] = y;
    starPos[i * 3 + 2] = z;
    stars.push({ tw: Math.random() * Math.PI * 2 });
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, transparent: true, opacity: 0.85 });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  // ---------- Assets ----------
  const IMAGES = {
    lisa: 'assets/lisa.png',
    bud: 'assets/bud.png',
    becks: 'assets/becks.png',
    corona: 'assets/corona.png',
    tennents: 'assets/tennents.png',
  };
  const textures = {};
  const loader = new THREE.TextureLoader();
  for (const [key, src] of Object.entries(IMAGES)) {
    textures[key] = loader.load(src, undefined, undefined, () => {
      textures[key].broken = true;
    });
    textures[key].colorSpace = THREE.SRGBColorSpace;
  }

  function makeBottleMesh(key, w, h, flip = false) {
    const group = new THREE.Group();
    const tex = textures[key] && !textures[key].broken ? textures[key] : null;
    const bodyH = h * 0.68;

    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.34, w * 0.4, bodyH, 18),
      new THREE.MeshStandardMaterial({
        color: 0x9ec89a,
        transparent: true,
        opacity: 0.45,
        roughness: 0.12,
        metalness: 0.08,
      })
    );
    glass.position.y = bodyH / 2;
    glass.castShadow = true;
    group.add(glass);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.82, h * 0.72),
      new THREE.MeshStandardMaterial({
        map: tex,
        color: tex ? 0xffffff : 0xc8102e,
        transparent: true,
        roughness: 0.55,
        side: THREE.DoubleSide,
      })
    );
    label.position.set(0, bodyH * 0.52, w * 0.36);
    label.castShadow = true;
    group.add(label);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.13, w * 0.13, h * 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0xc8102e, metalness: 0.55, roughness: 0.3 })
    );
    cap.position.y = bodyH + h * 0.05;
    cap.castShadow = true;
    group.add(cap);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.42, w * 0.42, h * 0.07, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.65, roughness: 0.35 })
    );
    base.position.y = h * 0.035;
    group.add(base);

    if (flip) group.rotation.x = Math.PI;
    return group;
  }

  function makeBulletMesh(radius, color, emissive) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 10),
      new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.35, metalness: 0.2 })
    );
    mesh.castShadow = true;
    return mesh;
  }

  function makeBunkerBlock(w, h, hp) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.5, 8, h - 0.5),
      new THREE.MeshStandardMaterial({
        color: hp === 2 ? 0xf7e8b0 : 0xc8b880,
        roughness: 0.7,
        transparent: hp < 2,
        opacity: hp === 2 ? 1 : 0.55,
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function gameToWorld(x, gy, elev = 0) {
    return { x, y: elev, z: gy };
  }

  function syncEntity(mesh, x, gy, elev = 12, zOffset = 0) {
    const p = gameToWorld(x, gy, elev);
    mesh.position.set(p.x, p.y, p.z + zOffset);
  }

  // ---------- Audio ----------
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

  // ---------- Game state ----------
  let state = GS.STATE.START;
  let paused = false;
  let session = GS.createSession();
  let levelBannerT = 0;

  const player = {
    w: Math.round(88 * GS.ASPECT.lisa), h: 88,
    x: W / 2 - Math.round(88 * GS.ASPECT.lisa) / 2, y: H - 106,
    speed: 360,
    cooldown: 0,
    invincible: 0,
    mesh: null,
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

  const keys = {};
  const interactEl = container;

  function clearSceneEntities() {
    [...playerBullets, ...enemyBullets, ...particles, ...bunkers, ...enemies].forEach(e => {
      if (e.mesh) scene.remove(e.mesh);
    });
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    bunkers = [];
    enemies = [];
    if (player.mesh) {
      scene.remove(player.mesh);
      player.mesh = null;
    }
  }

  function spawnWave() {
    enemies.forEach(e => { if (e.mesh) scene.remove(e.mesh); });
    enemies = [];
    const cfg = GS.getLevelConfig(session.level);
    const cols = cfg.columns;
    const cellW = 46, eh = 68;
    const gapX = 30, gapY = 16;
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 84;
    GS.ENEMY_ROWS.forEach((row, r) => {
      const ew = Math.round(eh * GS.ASPECT[row.key]);
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (cellW + gapX) + (cellW - ew) / 2;
        const y = startY + r * (eh + gapY);
        const mesh = makeBottleMesh(row.key, ew, eh, true);
        syncEntity(mesh, x + ew / 2, y + eh / 2, 14, r * 6);
        scene.add(mesh);
        enemies.push({
          x, y, w: ew, h: eh, col: c,
          key: row.key, points: row.points, alive: true, mesh,
          rowDepth: r * 6,
        });
      }
    });
    enemyDir = 1;
    enemySpeed = cfg.enemySpeed;
    enemyFireTimer = 1.5;
    marchTimer = 0;
  }

  function buildBunkers() {
    bunkers.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
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
            const x = px + rx * bw;
            const y = H - 210 + ry * bh;
            const mesh = makeBunkerBlock(bw, bh, 2);
            const p = gameToWorld(x + bw / 2, y + bh / 2, 4);
            mesh.position.set(p.x, p.y, p.z);
            scene.add(mesh);
            bunkers.push({ x, y, w: bw, h: bh, hp: 2, mesh });
          }
        });
      });
    });
  }

  function ensurePlayerMesh() {
    if (!player.mesh) {
      player.mesh = makeBottleMesh('lisa', player.w, player.h, false);
      scene.add(player.mesh);
    }
    syncEntity(player.mesh, player.x + player.w / 2, player.y + player.h / 2, 18);
    player.mesh.visible = player.invincible <= 0 || Math.floor(player.invincible * 10) % 2 === 0;
  }

  function resetGame() {
    session = GS.resetSession();
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    clearSceneEntities();
    player.x = W / 2 - player.w / 2;
    player.invincible = 0;
    player.cooldown = 0;
    paused = false;
    spawnWave();
    buildBunkers();
    ensurePlayerMesh();
    state = GS.STATE.PLAYING;
    updatePauseBtn();
  }

  function nextLevel() {
    session = GS.advanceLevel(session);
    playerBullets.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
    enemyBullets.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
    playerBullets = [];
    enemyBullets = [];
    spawnWave();
    buildBunkers();
    levelBannerT = 2;
    state = GS.STATE.LEVELUP;
    sound.levelUp();
  }

  function foamExplosion(x, y, baseColor = 0xf7e8b0, n = 22) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      const r = 2 + Math.random() * 4;
      const color = Math.random() < 0.7 ? baseColor : 0xc8102e;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 6, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      const p = gameToWorld(x, y, 10 + Math.random() * 20);
      mesh.position.set(p.x, p.y, p.z);
      scene.add(mesh);
      particles.push({
        x, y, z: p.z,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        r, life: 0.5 + Math.random() * 0.5, t: 0, mesh,
      });
    }
  }

  function firePlayer() {
    if (player.cooldown > 0) return;
    player.cooldown = 0.34;
    const bx = player.x + player.w / 2;
    const by = player.y - 6;
    const mesh = makeBulletMesh(5, 0xf5edd8, 0xc8102e);
    const p = gameToWorld(bx, by, 18);
    mesh.position.set(p.x, p.y, p.z);
    scene.add(mesh);
    playerBullets.push({ x: bx, y: by, vy: -540, r: 5, mesh });
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
    const bx = s.x + s.w / 2;
    const by = s.y + s.h;
    const cfg = GS.getLevelConfig(session.level);
    const mesh = makeBulletMesh(5, 0xe8a020, 0x804000);
    const p = gameToWorld(bx, by, 16);
    mesh.position.set(p.x, p.y, p.z);
    scene.add(mesh);
    enemyBullets.push({ x: bx, y: by, vy: cfg.enemyBulletSpeed, r: 5, mesh });
    sound.enemyShoot();
  }

  function rectHit(bx, by, br, r) {
    return bx > r.x - br && bx < r.x + r.w + br && by > r.y - br && by < r.y + r.h + br;
  }

  function updateBunkerVisual(blk) {
    if (blk.hp <= 0) {
      scene.remove(blk.mesh);
      blk.mesh = null;
      return;
    }
    blk.mesh.material.color.setHex(blk.hp === 2 ? 0xf7e8b0 : 0xc8b880);
    blk.mesh.material.opacity = blk.hp === 2 ? 1 : 0.55;
    blk.mesh.material.transparent = blk.hp < 2;
  }

  function update(dt) {
    stars.forEach(s => { s.tw += dt * 2; });
    starMat.opacity = 0.55 + 0.3 * Math.abs(Math.sin(performance.now() * 0.001));

    if (state === GS.STATE.LEVELUP) {
      levelBannerT -= dt;
      if (levelBannerT <= 0) state = GS.STATE.PLAYING;
      ensurePlayerMesh();
      return;
    }
    if (state !== GS.STATE.PLAYING || paused) {
      if (state === GS.STATE.PLAYING) ensurePlayerMesh();
      return;
    }

    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed * dt;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed * dt;
    player.x = Math.max(8, Math.min(W - player.w - 8, player.x));
    player.cooldown -= dt;
    if (player.invincible > 0) player.invincible -= dt;
    if (keys[' ']) firePlayer();
    ensurePlayerMesh();

    const alive = enemies.filter(e => e.alive);
    const speedScale = 1 + (1 - alive.length / (enemies.length || 1)) * 2.2;
    const vx = enemySpeed * speedScale * enemyDir;
    let hitEdge = false;
    alive.forEach(e => {
      e.x += vx * dt;
      if (e.x < 8 || e.x + e.w > W - 8) hitEdge = true;
      syncEntity(e.mesh, e.x + e.w / 2, e.y + e.h / 2, 14, (e.rowDepth || 0));
    });
    if (hitEdge) {
      enemyDir *= -1;
      alive.forEach(e => {
        e.y += enemyDrop;
        e.x += enemyDir * 2;
        syncEntity(e.mesh, e.x + e.w / 2, e.y + e.h / 2, 14, (e.rowDepth || 0));
      });
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

    const cfg = GS.getLevelConfig(session.level);
    enemyFireTimer -= dt;
    if (enemyFireTimer <= 0) {
      fireEnemy();
      enemyFireTimer = cfg.enemyFireInterval * (0.6 + Math.random() * 0.8);
    }

    playerBullets = playerBullets.filter(b => {
      b.y += b.vy * dt;
      const p = gameToWorld(b.x, b.y, 18);
      b.mesh.position.set(p.x, p.y, p.z);
      if (b.y < -10) {
        scene.remove(b.mesh);
        return false;
      }
      for (const e of enemies) {
        if (e.alive && rectHit(b.x, b.y, b.r, e)) {
          e.alive = false;
          scene.remove(e.mesh);
          e.mesh = null;
          const result = GS.awardPoints(session, e.key);
          session = result.session;
          foamExplosion(e.x + e.w / 2, e.y + e.h / 2);
          sound.boom();
          scene.remove(b.mesh);
          return false;
        }
      }
      for (const blk of bunkers) {
        if (blk.hp > 0 && rectHit(b.x, b.y, b.r, blk)) {
          blk.hp--;
          updateBunkerVisual(blk);
          foamExplosion(b.x, b.y, 0x8fa0e0, 6);
          scene.remove(b.mesh);
          return false;
        }
      }
      return true;
    });

    enemyBullets = enemyBullets.filter(b => {
      b.y += b.vy * dt;
      const p = gameToWorld(b.x, b.y, 16);
      b.mesh.position.set(p.x, p.y, p.z);
      if (b.y > H + 10) {
        scene.remove(b.mesh);
        return false;
      }
      for (const blk of bunkers) {
        if (blk.hp > 0 && rectHit(b.x, b.y, b.r, blk)) {
          blk.hp--;
          updateBunkerVisual(blk);
          foamExplosion(b.x, b.y, 0x8fa0e0, 6);
          scene.remove(b.mesh);
          return false;
        }
      }
      if (player.invincible <= 0 && rectHit(b.x, b.y, b.r, player)) {
        playerHit();
        scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    particles = particles.filter(p => {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      const wp = gameToWorld(p.x, p.y, 10 + (1 - p.t / p.life) * 30);
      p.mesh.position.set(wp.x, wp.y, wp.z);
      p.mesh.material.opacity = 1 - p.t / p.life;
      if (p.t >= p.life) {
        scene.remove(p.mesh);
        return false;
      }
      return true;
    });

    if (!enemies.some(e => e.alive)) nextLevel();
  }

  function playerHit() {
    const result = GS.loseLife(session);
    session = result.session;
    sound.playerHit();
    foamExplosion(player.x + player.w / 2, player.y + player.h / 2, 0xc8102e, 34);
    if (result.gameOver) {
      gameOver();
    } else {
      player.invincible = 2;
      player.x = W / 2 - player.w / 2;
    }
  }

  function gameOver() {
    state = GS.STATE.GAMEOVER;
    sound.gameOver();
  }

  // ---------- HUD overlay (2D) ----------
  function drawHudSprite(key, x, y, w, h, flip = false) {
    const img = textures[key]?.image;
    if (img && img.complete && img.naturalWidth) {
      const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      hudCtx.save();
      if (flip) {
        hudCtx.translate(dx + dw / 2, dy + dh / 2);
        hudCtx.rotate(Math.PI);
        hudCtx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        hudCtx.drawImage(img, dx, dy, dw, dh);
      }
      hudCtx.restore();
    } else {
      hudCtx.fillStyle = '#c8102e';
      hudCtx.fillRect(x, y, w, h);
    }
  }

  function overlay(title, sub, dark) {
    hudCtx.fillStyle = dark ? 'rgba(9,13,36,.82)' : 'rgba(9,13,36,.6)';
    hudCtx.fillRect(0, 0, W, H);
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#f5edd8';
    hudCtx.font = 'bold 52px "Courier New", monospace';
    hudCtx.shadowColor = '#c8102e';
    hudCtx.shadowBlur = 18;
    hudCtx.fillText(title, W / 2, H / 2 - 20);
    hudCtx.shadowBlur = 0;
    hudCtx.font = '18px "Courier New", monospace';
    hudCtx.fillStyle = '#8fa0e0';
    sub.split('\n').forEach((line, i) => {
      hudCtx.fillText(line, W / 2, H / 2 + 24 + i * 28);
    });
  }

  function drawStartScreen() {
    hudCtx.textAlign = 'center';
    drawHudSprite('lisa', W / 2 - 45, 120, 90, 152);
    hudCtx.fillStyle = '#f5edd8';
    hudCtx.font = 'bold 44px "Courier New", monospace';
    hudCtx.shadowColor = '#c8102e';
    hudCtx.shadowBlur = 16;
    hudCtx.fillText('LISA INVADERS 3D', W / 2, 330);
    hudCtx.shadowBlur = 0;
    hudCtx.font = '16px "Courier New", monospace';
    hudCtx.fillStyle = '#8fa0e0';
    GS.ENEMY_ROWS.forEach((r, i) => {
      const y = 370 + i * 52;
      drawHudSprite(r.key, W / 2 - 110, y - 24, 28, 42, true);
      hudCtx.textAlign = 'left';
      hudCtx.fillText(`${r.name}  =  ${r.points} punti`, W / 2 - 65, y);
    });
    hudCtx.textAlign = 'center';
    hudCtx.fillStyle = '#f5edd8';
    hudCtx.font = 'bold 20px "Courier New", monospace';
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      hudCtx.fillText('PREMI SPAZIO O TOCCA PER INIZIARE', W / 2, H - 32);
    }
  }

  function drawHud() {
    hudCtx.clearRect(0, 0, W, H);
    hudCtx.fillStyle = '#f5edd8';
    hudCtx.font = 'bold 16px "Courier New", monospace';
    hudCtx.textAlign = 'left';
    hudCtx.fillText(`PUNTI: ${session.score}`, 16, 28);
    hudCtx.textAlign = 'center';
    hudCtx.fillText(`RECORD: ${session.highScore}`, W / 2, 28);
    hudCtx.textAlign = 'right';
    hudCtx.fillText(`LIVELLO ${session.level}`, W - 16, 28);
    for (let i = 0; i < session.lives; i++) {
      drawHudSprite('lisa', 16 + i * 22, 40, 16, 28);
    }
    hudCtx.strokeStyle = 'rgba(200,16,46,.5)';
    hudCtx.beginPath();
    hudCtx.moveTo(0, 74);
    hudCtx.lineTo(W, 74);
    hudCtx.stroke();

    if (state === GS.STATE.START) {
      drawStartScreen();
      return;
    }
    if (state === GS.STATE.LEVELUP) {
      overlay(`LIVELLO ${session.level}`, 'Le lager tornano più cattive…', false);
    } else if (state === GS.STATE.GAMEOVER) {
      const msg = GS.gameOverMessage(session.score, session.highScore);
      overlay(msg.title, `${msg.subtitle}\nPremi R o RIAVVIA per riprovare`, true);
    } else if (paused) {
      overlay('PAUSA', 'Premi P per riprendere', false);
    }
  }

  function render() {
    const t = performance.now() * 0.00025;
    camera.position.x = W / 2 + Math.sin(t) * 18;
    camera.position.z = H + 560 + Math.cos(t * 0.7) * 10;
    camera.lookAt(W / 2, 0, H * 0.42);
    renderer.render(scene, camera);
    drawHud();
  }

  // ---------- Input ----------
  window.addEventListener('keydown', e => {
    if ([' ', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
    if (e.key === ' ' && state === GS.STATE.START) { resetGame(); return; }
    if ((e.key === 'r' || e.key === 'R') && state !== GS.STATE.START) resetGame();
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'm' || e.key === 'M') toggleSound();
  });
  window.addEventListener('keyup', e => {
    keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false;
  });

  let dragging = false;
  let activePointerId = null;
  const isTouchPointer = e => e.pointerType === 'touch' || e.pointerType === 'pen';

  function canvasXFromEvent(e) {
    const rect = interactEl.getBoundingClientRect();
    return (e.clientX - rect.left) * (W / rect.width);
  }

  function movePlayerToPointer(e) {
    const x = canvasXFromEvent(e);
    player.x = Math.max(8, Math.min(W - player.w - 8, x - player.w / 2));
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isTouchPointer(e)) e.preventDefault();
    sound.ensure();
    if (state === GS.STATE.START) { resetGame(); return; }
    if (state === GS.STATE.GAMEOVER) { resetGame(); return; }
    dragging = true;
    activePointerId = e.pointerId;
    interactEl.setPointerCapture(e.pointerId);
    if (isTouchPointer(e)) {
      movePlayerToPointer(e);
      firePlayer();
    } else {
      firePlayer();
    }
  }

  function onPointerMove(e) {
    if (!dragging || activePointerId !== e.pointerId || state !== GS.STATE.PLAYING) return;
    if (isTouchPointer(e)) e.preventDefault();
    movePlayerToPointer(e);
  }

  function onPointerUp(e) {
    if (activePointerId !== e.pointerId) return;
    if (isTouchPointer(e)) e.preventDefault();
    dragging = false;
    activePointerId = null;
    if (interactEl.hasPointerCapture(e.pointerId)) interactEl.releasePointerCapture(e.pointerId);
  }

  interactEl.addEventListener('pointerdown', onPointerDown);
  interactEl.addEventListener('pointermove', onPointerMove);
  interactEl.addEventListener('pointerup', onPointerUp);
  interactEl.addEventListener('pointercancel', onPointerUp);
  interactEl.addEventListener('contextmenu', e => e.preventDefault());
  interactEl.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  interactEl.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  const btnSound = document.getElementById('btn-sound');
  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');

  function toggleSound() {
    sound.enabled = !sound.enabled;
    btnSound.textContent = sound.enabled ? '🔊 SUONO: ON' : '🔇 SUONO: OFF';
    if (sound.enabled) sound.ensure();
  }
  function togglePause() {
    if (state !== GS.STATE.PLAYING) return;
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
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
