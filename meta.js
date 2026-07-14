/* Lisa Invaders — menu, progressione, accessibilità e classifiche */
(() => {
  const KEYS = {
    difficulty: 'lisaInvadersDifficulty',
    settings: 'lisaInvadersSettings',
    tutorial: 'lisaInvadersTutorialSeen',
    achievements: 'lisaInvadersAchievements',
    scores: 'lisaInvadersScores',
    player: 'lisaInvadersPlayerName',
    daily: 'lisaInvadersDaily',
    intro: 'lisaInvadersIntroSeen',
  };

  const DIFFICULTIES = {
    easy: { id: 'easy', label: 'FACILE', lives: 4, enemySpeed: 0.78, enemyFire: 1.35, dropChance: 0.12, scoreMultiplier: 0.8, grace: 1.35 },
    normal: { id: 'normal', label: 'NORMALE', lives: 3, enemySpeed: 1, enemyFire: 1, dropChance: 0.08, scoreMultiplier: 1, grace: 1 },
    arcade: { id: 'arcade', label: 'ARCADE', lives: 2, enemySpeed: 1.24, enemyFire: 0.72, dropChance: 0.06, scoreMultiplier: 1.5, grace: 0.55 },
  };

  const ACHIEVEMENTS = {
    combo4: { title: 'COMBO ×4', text: 'Raggiungi il moltiplicatore massimo' },
    flawless: { title: 'LIVELLO PERFETTO', text: 'Completa un livello senza subire danni' },
    streak20: { title: '20 DI FILA', text: 'Elimina 20 nemici senza essere colpito' },
    boss: { title: 'DEMOLITORE', text: 'Sconfiggi il primo boss' },
    daily: { title: 'MISSIONE COMPIUTA', text: 'Completa la missione del giorno' },
  };

  function safeJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function getDailyConfig() {
    const date = new Date().toISOString().slice(0, 10);
    const seed = hashString('lisa-invaders-' + date);
    const targetScore = 2200 + (seed % 5) * 400;
    const targetLevel = 3 + (seed % 3);
    const difficulty = ['easy', 'normal', 'arcade'][seed % 3];
    return {
      date,
      seed,
      targetScore,
      targetLevel,
      difficulty,
      description: targetScore + ' punti · raggiungi livello ' + targetLevel + ' · ' + DIFFICULTIES[difficulty].label,
    };
  }

  const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storedSettings = safeJSON(KEYS.settings, {});
  const settings = {
    reducedMotion: storedSettings.reducedMotion ?? systemReducedMotion,
    screenShake: storedSettings.screenShake ?? true,
    highContrast: storedSettings.highContrast ?? false,
    haptics: storedSettings.haptics ?? true,
    autoFireMobile: storedSettings.autoFireMobile ?? false,
  };
  const unlocked = safeJSON(KEYS.achievements, {});
  let selectedDifficulty = localStorage.getItem(KEYS.difficulty) || 'normal';
  if (!DIFFICULTIES[selectedDifficulty]) selectedDifficulty = 'normal';
  let currentRun = null;
  let currentResult = null;
  let currentScoreId = null;
  let runUnlocks = [];
  let activeLeaderboard = 'local';
  let tutorial = { active: false, step: 0, timeout: null, finishTimeout: null };
  let lastRunSignature = '';
  let lastHaptic = 0;
  let gamepadNotified = false;
  let introVisible = false;

  const el = {
    introOverlay: document.getElementById('intro-overlay'),
    dismissIntro: document.getElementById('btn-dismiss-intro'),
    startMenu: document.getElementById('start-menu'),
    start: document.getElementById('btn-start-run'),
    daily: document.getElementById('btn-daily'),
    dailyDescription: document.getElementById('daily-description'),
    howto: document.getElementById('btn-howto'),
    leaderboard: document.getElementById('btn-leaderboard'),
    openSettings: document.getElementById('btn-open-settings'),
    hudSettings: document.getElementById('btn-settings'),
    tutorial: document.getElementById('tutorial-overlay'),
    tutorialTitle: document.getElementById('tutorial-title'),
    tutorialText: document.getElementById('tutorial-text'),
    tutorialDots: [...document.querySelectorAll('.tutorial-dot')],
    skipTutorial: document.getElementById('btn-skip-tutorial'),
    gameover: document.getElementById('gameover-panel'),
    finalScore: document.getElementById('final-score'),
    finalLevel: document.getElementById('final-level'),
    finalRecord: document.getElementById('final-record'),
    finalAchievements: document.getElementById('gameover-achievements'),
    playerName: document.getElementById('player-name'),
    saveScore: document.getElementById('btn-save-score'),
    share: document.getElementById('btn-share-score'),
    retry: document.getElementById('btn-retry'),
    mainMenu: document.getElementById('btn-main-menu'),
    runMode: document.getElementById('run-mode'),
    modal: document.getElementById('modal-layer'),
    closeModal: document.getElementById('btn-close-modal'),
    tabLeaderboard: document.getElementById('tab-leaderboard'),
    tabSettings: document.getElementById('tab-settings'),
    leaderboardView: document.getElementById('leaderboard-view'),
    settingsView: document.getElementById('settings-view'),
    tabLocal: document.getElementById('tab-local'),
    tabOnline: document.getElementById('tab-online'),
    leaderboardBody: document.getElementById('leaderboard-body'),
    leaderboardStatus: document.getElementById('leaderboard-status'),
    reducedMotion: document.getElementById('setting-reduced-motion'),
    screenShake: document.getElementById('setting-screen-shake'),
    highContrast: document.getElementById('setting-high-contrast'),
    haptics: document.getElementById('setting-haptics'),
    autoFire: document.getElementById('setting-auto-fire'),
    replayTutorial: document.getElementById('btn-replay-tutorial'),
    shareImage: document.getElementById('btn-share-image'),
    shareCardLayer: document.getElementById('share-card-layer'),
    shareCardPreview: document.getElementById('share-card-preview'),
    shareCardDownload: document.getElementById('btn-share-card-download'),
    shareCardNative: document.getElementById('btn-share-card-native'),
    shareCardClose: document.getElementById('btn-share-card-close'),
    toastLayer: document.getElementById('toast-layer'),
  };
  let shareCardBlob = null;
  let shareCardUrl = '';

  function toast(message) {
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    el.toastLayer.appendChild(item);
    setTimeout(() => item.remove(), settings.reducedMotion ? 1400 : 2600);
  }

  function isMobileUI() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 900;
  }

  function applySettings() {
    document.body.classList.toggle('high-contrast', settings.highContrast);
    document.body.classList.toggle('auto-fire-on', Boolean(settings.autoFireMobile && isMobileUI()));
    el.reducedMotion.checked = settings.reducedMotion;
    el.screenShake.checked = settings.screenShake;
    el.highContrast.checked = settings.highContrast;
    el.haptics.checked = settings.haptics;
    if (el.autoFire) el.autoFire.checked = settings.autoFireMobile;
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('lisa:settings', { detail: { ...settings } }));
  }

  async function requestPlayFullscreen() {
    if (!isMobileUI()) return;
    const root = document.documentElement;
    try {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
    } catch {
      /* fullscreen opzionale */
    }
  }

  function exitPlayFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch {
      /* ignore */
    }
  }

  function enterPlayMode() {
    document.body.classList.add('in-game');
    document.body.classList.toggle('mobile-ui', isMobileUI());
    applySettings();
    window.dispatchEvent(new Event('lisa:play-mode'));
    requestPlayFullscreen();
  }

  function exitPlayMode() {
    document.body.classList.remove('in-game', 'mobile-ui', 'auto-fire-on');
    window.dispatchEvent(new Event('lisa:play-mode'));
    exitPlayFullscreen();
  }

  function selectDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    selectedDifficulty = id;
    localStorage.setItem(KEYS.difficulty, id);
    document.querySelectorAll('.difficulty-button').forEach(button => {
      const selected = button.dataset.difficulty === id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function runConfig(daily = false, forceTutorial = false) {
    const mission = getDailyConfig();
    const difficultyId = daily ? mission.difficulty : selectedDifficulty;
    return {
      ...DIFFICULTIES[difficultyId],
      daily,
      seed: daily ? mission.seed : null,
      mission: daily ? mission : null,
      forceTutorial,
    };
  }

  function showIntro() {
    introVisible = true;
    el.introOverlay.classList.remove('is-hidden');
    el.dismissIntro?.focus();
  }

  function dismissIntro() {
    introVisible = false;
    el.introOverlay.classList.add('is-hidden');
    // Una sola volta per sessione browser (tab): non riappare finché la scheda resta aperta.
    sessionStorage.setItem(KEYS.intro, 'yes');
  }

  function startRun(options = {}) {
    if (introVisible) return;
    currentRun = options.config || runConfig(Boolean(options.daily), Boolean(options.forceTutorial));
    currentResult = null;
    currentScoreId = null;
    runUnlocks = [];
    lastRunSignature = '';
    el.startMenu.classList.add('is-hidden');
    el.gameover.classList.add('is-hidden');
    el.modal.classList.add('is-hidden');
    el.runMode.classList.remove('is-hidden');
    el.runMode.textContent = currentRun.daily ? '★ MISSIONE ' + currentRun.mission.date : currentRun.label;
    enterPlayMode();
    window.dispatchEvent(new CustomEvent('lisa:start', { detail: currentRun }));
  }

  function showStartMenu() {
    completeTutorial(false);
    el.gameover.classList.add('is-hidden');
    el.startMenu.classList.remove('is-hidden');
    el.runMode.classList.add('is-hidden');
    exitPlayMode();
    window.dispatchEvent(new Event('lisa:menu'));
  }

  function setModalView(view) {
    const settingsSelected = view === 'settings';
    el.tabSettings.classList.toggle('selected', settingsSelected);
    el.tabLeaderboard.classList.toggle('selected', !settingsSelected);
    el.settingsView.classList.toggle('is-hidden', !settingsSelected);
    el.leaderboardView.classList.toggle('is-hidden', settingsSelected);
    if (!settingsSelected) renderLeaderboard(activeLeaderboard);
  }

  function openModal(view = 'leaderboard') {
    window.dispatchEvent(new Event('lisa:pause-request'));
    el.modal.classList.remove('is-hidden');
    setModalView(view);
  }

  function closeModal() {
    el.modal.classList.add('is-hidden');
  }

  function tutorialCopy(step) {
    return [
      ['1. MUOVITI', 'Usa le frecce, A/D, il gamepad o trascina Lisa.'],
      ['2. SPARA', 'Pollice sinistro su ◎ per sparare, oppure attiva auto-fuoco nelle opzioni.'],
      ['3. POWER-UP', 'R = fuoco rapido · 3 = colpo triplo · S = scudo.'],
    ][step];
  }

  function renderTutorial() {
    const copy = tutorialCopy(tutorial.step);
    el.tutorialTitle.textContent = copy[0];
    el.tutorialText.textContent = copy[1];
    el.tutorialDots.forEach((dot, index) => dot.classList.toggle('active', index <= tutorial.step));
  }

  function startTutorial() {
    clearTimeout(tutorial.timeout);
    clearTimeout(tutorial.finishTimeout);
    tutorial = { active: true, step: 0, timeout: null, finishTimeout: null };
    renderTutorial();
    el.tutorial.classList.remove('is-hidden');
    tutorial.timeout = setTimeout(() => completeTutorial(true), 10000);
  }

  function completeTutorial(markSeen = true) {
    clearTimeout(tutorial.timeout);
    clearTimeout(tutorial.finishTimeout);
    const wasActive = tutorial.active;
    tutorial.active = false;
    el.tutorial.classList.add('is-hidden');
    if (markSeen) localStorage.setItem(KEYS.tutorial, 'yes');
    if (wasActive && markSeen) toast('TUTORIAL COMPLETATO');
  }

  function tutorialSignal(signal) {
    if (!tutorial.active) return;
    if (tutorial.step === 0 && signal === 'move') {
      tutorial.step = 1;
      renderTutorial();
      return;
    }
    if (tutorial.step === 1 && signal === 'fire') {
      tutorial.step = 2;
      renderTutorial();
      tutorial.finishTimeout = setTimeout(() => completeTutorial(true), 2600);
    }
  }

  function onRunStarted(config) {
    currentRun = config;
    if (config.forceTutorial || !localStorage.getItem(KEYS.tutorial)) startTutorial();
  }

  function unlockAchievement(id) {
    if (!ACHIEVEMENTS[id] || unlocked[id]) return false;
    unlocked[id] = new Date().toISOString();
    localStorage.setItem(KEYS.achievements, JSON.stringify(unlocked));
    runUnlocks.push(id);
    toast('OBIETTIVO: ' + ACHIEVEMENTS[id].title);
    return true;
  }

  function updateRun(stats) {
    if (!currentRun) return;
    const signature = [stats.score, stats.level, stats.lives, stats.combo].join('|');
    if (signature === lastRunSignature) return;
    lastRunSignature = signature;
    if (currentRun.daily) {
      const mission = currentRun.mission;
      el.runMode.textContent = '★ ' + Math.min(stats.score, mission.targetScore) + '/' + mission.targetScore + ' · LV ' + stats.level + '/' + mission.targetLevel;
      if (stats.score >= mission.targetScore && stats.level >= mission.targetLevel) {
        const dailyState = safeJSON(KEYS.daily, {});
        if (!dailyState[mission.date]) {
          dailyState[mission.date] = { completed: true, score: stats.score, level: stats.level };
          localStorage.setItem(KEYS.daily, JSON.stringify(dailyState));
          unlockAchievement('daily');
          toast('MISSIONE DEL GIORNO COMPLETATA');
        }
      }
    }
  }

  function getScores() {
    const scores = safeJSON(KEYS.scores, []);
    return Array.isArray(scores) ? scores : [];
  }

  function cleanName(value) {
    const clean = String(value || '').toUpperCase().replace(/[^A-Z0-9_À-Ü -]/g, '').trim().slice(0, 12);
    return clean || 'GIOCATORE';
  }

  function saveLocalEntry(entry) {
    const scores = getScores().filter(item => item.id !== entry.id);
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score || b.level - a.level);
    localStorage.setItem(KEYS.scores, JSON.stringify(scores.slice(0, 10)));
  }

  async function apiRequest(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(path, { ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Servizio non disponibile');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function submitOnline(entry) {
    try {
      await apiRequest('/api/leaderboard', { method: 'POST', body: JSON.stringify(entry) });
      toast('PUNTEGGIO ONLINE SALVATO');
    } catch {
      toast('CLASSIFICA ONLINE NON CONFIGURATA');
    }
  }

  function saveCurrentScore() {
    if (!currentResult || currentResult.score <= 0) return;
    const name = cleanName(el.playerName.value);
    el.playerName.value = name;
    localStorage.setItem(KEYS.player, name);
    if (!currentScoreId) currentScoreId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const entry = {
      id: currentScoreId,
      name,
      score: Math.round(currentResult.score),
      level: Math.round(currentResult.level),
      difficulty: currentRun?.daily ? 'daily' : (currentRun?.id || 'normal'),
      daily: Boolean(currentRun?.daily),
      date: new Date().toISOString(),
    };
    saveLocalEntry(entry);
    renderLeaderboard('local');
    submitOnline(entry);
    toast('PUNTEGGIO SALVATO');
  }

  function appendScoreRows(entries) {
    el.leaderboardBody.replaceChildren();
    if (!entries.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'Nessun punteggio salvato';
      row.appendChild(cell);
      el.leaderboardBody.appendChild(row);
      return;
    }
    entries.slice(0, 10).forEach((entry, index) => {
      const row = document.createElement('tr');
      [index + 1, entry.name, Number(entry.score).toLocaleString('it-IT'), entry.level, String(entry.difficulty || 'normal').toUpperCase()].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      el.leaderboardBody.appendChild(row);
    });
  }

  async function renderLeaderboard(type = 'local') {
    activeLeaderboard = type;
    el.tabLocal.classList.toggle('selected', type === 'local');
    el.tabOnline.classList.toggle('selected', type === 'online');
    if (type === 'local') {
      el.leaderboardStatus.textContent = 'I migliori 10 punteggi su questo dispositivo';
      appendScoreRows(getScores());
      return;
    }
    el.leaderboardStatus.textContent = 'Caricamento classifica online…';
    try {
      const data = await apiRequest('/api/leaderboard');
      el.leaderboardStatus.textContent = 'I migliori 10 punteggi online';
      appendScoreRows(Array.isArray(data.entries) ? data.entries : []);
    } catch (error) {
      el.leaderboardStatus.textContent = 'Online non configurato: serve Upstash Redis su Vercel';
      appendScoreRows([]);
    }
  }

  function onGameOver(result) {
    completeTutorial(true);
    currentResult = result;
    el.finalScore.textContent = Number(result.score).toLocaleString('it-IT');
    el.finalLevel.textContent = result.level;
    el.finalRecord.textContent = Number(result.highScore).toLocaleString('it-IT');
    el.finalAchievements.textContent = runUnlocks.length
      ? 'SBLOCCATI: ' + runUnlocks.map(id => ACHIEVEMENTS[id].title).join(' · ')
      : 'Continua a giocare per sbloccare nuovi obiettivi';
    el.playerName.value = localStorage.getItem(KEYS.player) || 'GIOCATORE';
    el.gameover.classList.remove('is-hidden');
    if (result.score > 0) saveCurrentScore();
  }

  function revokeShareCardUrl() {
    if (shareCardUrl) {
      URL.revokeObjectURL(shareCardUrl);
      shareCardUrl = '';
    }
    shareCardBlob = null;
  }

  function loadShareImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function buildShareCard(result) {
    const CARD_W = 1080;
    const CARD_H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.22, 0, CARD_W / 2, CARD_H * 0.22, CARD_W * 0.85);
    gradient.addColorStop(0, '#232f63');
    gradient.addColorStop(0.55, '#10173a');
    gradient.addColorStop(1, '#090d24');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 14;
    ctx.strokeRect(28, 28, CARD_W - 56, CARD_H - 56);

    try {
      const lisa = await loadShareImage('assets/lisa.png');
      const lisaH = 280;
      const lisaW = Math.round(lisaH * (lisa.width / lisa.height));
      ctx.drawImage(lisa, CARD_W / 2 - lisaW / 2, 96, lisaW, lisaH);
    } catch {
      /* asset opzionale */
    }

    const name = cleanName(el.playerName.value);
    const modeLabel = currentRun?.daily ? 'MISSIONE DEL GIORNO' : (currentRun?.label || 'NORMALE');
    const dateLabel = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 68px "Courier New", monospace';
    ctx.fillText('LISA INVADERS', CARD_W / 2, 430);

    ctx.fillStyle = '#ffd56a';
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.fillText(name, CARD_W / 2, 510);

    ctx.fillStyle = '#8fa0e0';
    ctx.font = '36px "Courier New", monospace';
    ctx.fillText('PUNTEGGIO', CARD_W / 2, 610);

    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 156px "Courier New", monospace';
    ctx.shadowColor = 'rgba(200,16,46,.75)';
    ctx.shadowBlur = 28;
    ctx.fillText(Number(result.score).toLocaleString('it-IT'), CARD_W / 2, 780);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#cdd6f0';
    ctx.font = '40px "Courier New", monospace';
    ctx.fillText(`LIVELLO ${result.level} · RECORD ${Number(result.highScore).toLocaleString('it-IT')}`, CARD_W / 2, 870);
    ctx.fillText(modeLabel, CARD_W / 2, 940);
    ctx.fillStyle = '#8fa0e0';
    ctx.font = '30px "Courier New", monospace';
    ctx.fillText(dateLabel, CARD_W / 2, 1000);

    ctx.fillStyle = '#f5edd8';
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.fillText('🍺 Difendi la birra artigianale!', CARD_W / 2, 1120);
    ctx.fillStyle = '#c8102e';
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.fillText('lisa-invaders.vercel.app', CARD_W / 2, CARD_H - 88);

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));
  }

  async function openShareCard() {
    if (!currentResult) return;
    try {
      revokeShareCardUrl();
      shareCardBlob = await buildShareCard(currentResult);
      if (!shareCardBlob) throw new Error('Immagine non generata');
      shareCardUrl = URL.createObjectURL(shareCardBlob);
      el.shareCardPreview.src = shareCardUrl;
      el.shareCardLayer.classList.remove('is-hidden');
    } catch {
      toast('IMMAGINE NON DISPONIBILE');
    }
  }

  function closeShareCard() {
    el.shareCardLayer.classList.add('is-hidden');
    revokeShareCardUrl();
    el.shareCardPreview.removeAttribute('src');
  }

  function downloadShareCard() {
    if (!shareCardBlob) return;
    const url = shareCardUrl || URL.createObjectURL(shareCardBlob);
    const link = document.createElement('a');
    const name = cleanName(el.playerName.value);
    link.href = url;
    link.download = `lisa-invaders-${name}-${currentResult?.score || 0}.png`;
    link.click();
    if (!shareCardUrl) URL.revokeObjectURL(url);
    toast('IMMAGINE SCARICATA');
  }

  async function shareShareCard() {
    if (!shareCardBlob || !currentResult) return;
    const name = cleanName(el.playerName.value);
    const text = `Lisa Invaders — ${name} ha fatto ${currentResult.score} punti al livello ${currentResult.level}!`;
    const file = new File([shareCardBlob], `lisa-invaders-${name}.png`, { type: 'image/png' });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Lisa Invaders', text, files: [file], url: location.href });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: 'Lisa Invaders', text: text + ' ' + location.href });
        return;
      }
      downloadShareCard();
    } catch (error) {
      if (error?.name !== 'AbortError') downloadShareCard();
    }
  }

  async function shareResult() {
    if (!currentResult) return;
    const text = 'Lisa Invaders — ' + currentResult.score + ' punti, livello ' + currentResult.level + ', record ' + currentResult.highScore + '.';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Lisa Invaders', text, url: location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text + ' ' + location.href);
        toast('RISULTATO COPIATO');
      } else {
        toast(text);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast('CONDIVISIONE NON DISPONIBILE');
    }
  }

  function haptic(pattern) {
    if (!settings.haptics || !navigator.vibrate) return;
    const now = performance.now();
    if (now - lastHaptic < 70) return;
    lastHaptic = now;
    navigator.vibrate(pattern);
  }

  function notifyGamepad() {
    if (gamepadNotified) return;
    gamepadNotified = true;
    toast('GAMEPAD COLLEGATO');
  }

  document.querySelectorAll('.difficulty-button').forEach(button => button.addEventListener('click', () => selectDifficulty(button.dataset.difficulty)));
  if (el.dismissIntro) el.dismissIntro.addEventListener('click', dismissIntro);
  el.start.addEventListener('click', () => startRun());
  el.daily.addEventListener('click', () => startRun({ daily: true }));
  el.howto.addEventListener('click', () => startRun({ forceTutorial: true }));
  el.leaderboard.addEventListener('click', () => openModal('leaderboard'));
  el.openSettings.addEventListener('click', () => openModal('settings'));
  el.hudSettings.addEventListener('click', () => openModal('settings'));
  el.skipTutorial.addEventListener('click', () => completeTutorial(true));
  el.closeModal.addEventListener('click', closeModal);
  el.modal.addEventListener('click', event => { if (event.target === el.modal) closeModal(); });
  el.tabLeaderboard.addEventListener('click', () => setModalView('leaderboard'));
  el.tabSettings.addEventListener('click', () => setModalView('settings'));
  el.tabLocal.addEventListener('click', () => renderLeaderboard('local'));
  el.tabOnline.addEventListener('click', () => renderLeaderboard('online'));
  el.saveScore.addEventListener('click', saveCurrentScore);
  el.share.addEventListener('click', shareResult);
  if (el.shareImage) el.shareImage.addEventListener('click', openShareCard);
  if (el.shareCardClose) el.shareCardClose.addEventListener('click', closeShareCard);
  if (el.shareCardDownload) el.shareCardDownload.addEventListener('click', downloadShareCard);
  if (el.shareCardNative) el.shareCardNative.addEventListener('click', shareShareCard);
  if (el.shareCardLayer) el.shareCardLayer.addEventListener('click', event => { if (event.target === el.shareCardLayer) closeShareCard(); });
  el.retry.addEventListener('click', () => startRun({ config: currentRun || runConfig() }));
  el.mainMenu.addEventListener('click', showStartMenu);
  el.replayTutorial.addEventListener('click', () => {
    localStorage.removeItem(KEYS.tutorial);
    closeModal();
    startRun({ forceTutorial: true });
  });
  el.reducedMotion.addEventListener('change', () => { settings.reducedMotion = el.reducedMotion.checked; applySettings(); });
  el.screenShake.addEventListener('change', () => { settings.screenShake = el.screenShake.checked; applySettings(); });
  el.highContrast.addEventListener('change', () => { settings.highContrast = el.highContrast.checked; applySettings(); });
  el.haptics.addEventListener('change', () => { settings.haptics = el.haptics.checked; applySettings(); });
  if (el.autoFire) el.autoFire.addEventListener('change', () => { settings.autoFireMobile = el.autoFire.checked; applySettings(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (introVisible) {
        dismissIntro();
        return;
      }
      closeModal();
      closeShareCard();
    }
    if (introVisible && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      dismissIntro();
    }
  });

  const daily = getDailyConfig();
  el.dailyDescription.textContent = daily.description;
  el.playerName.value = localStorage.getItem(KEYS.player) || 'GIOCATORE';
  selectDifficulty(selectedDifficulty);
  applySettings();
  renderLeaderboard('local');
  if (!sessionStorage.getItem(KEYS.intro)) showIntro();

  window.LisaMeta = {
    DIFFICULTIES,
    settings,
    startSelectedRun: () => startRun(),
    showStartMenu,
    onRunStarted,
    onGameOver,
    updateRun,
    tutorialSignal,
    unlockAchievement,
    motionReduced: () => settings.reducedMotion,
    autoFireMobile: () => settings.autoFireMobile,
    screenShakeEnabled: () => settings.screenShake && !settings.reducedMotion,
    haptic,
    notifyGamepad,
    toast,
    getCurrentRun: () => currentRun,
    getDailyConfig,
  };
})();
