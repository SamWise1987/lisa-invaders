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

  const el = {
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
    replayTutorial: document.getElementById('btn-replay-tutorial'),
    toastLayer: document.getElementById('toast-layer'),
  };

  function toast(message) {
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    el.toastLayer.appendChild(item);
    setTimeout(() => item.remove(), settings.reducedMotion ? 1400 : 2600);
  }

  function applySettings() {
    document.body.classList.toggle('high-contrast', settings.highContrast);
    el.reducedMotion.checked = settings.reducedMotion;
    el.screenShake.checked = settings.screenShake;
    el.highContrast.checked = settings.highContrast;
    el.haptics.checked = settings.haptics;
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('lisa:settings', { detail: { ...settings } }));
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

  function startRun(options = {}) {
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
    window.dispatchEvent(new CustomEvent('lisa:start', { detail: currentRun }));
  }

  function showStartMenu() {
    completeTutorial(false);
    el.gameover.classList.add('is-hidden');
    el.startMenu.classList.remove('is-hidden');
    el.runMode.classList.add('is-hidden');
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
      ['2. SPARA', 'Premi SPAZIO, il tasto gamepad o tieni premuto SPARA.'],
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
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

  const daily = getDailyConfig();
  el.dailyDescription.textContent = daily.description;
  el.playerName.value = localStorage.getItem(KEYS.player) || 'GIOCATORE';
  selectDifficulty(selectedDifficulty);
  applySettings();
  renderLeaderboard('local');

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
    screenShakeEnabled: () => settings.screenShake && !settings.reducedMotion,
    haptic,
    notifyGamepad,
    toast,
    getCurrentRun: () => currentRun,
    getDailyConfig,
  };
})();
