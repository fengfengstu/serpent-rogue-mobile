(function() {
  'use strict';

  const canvas = document.getElementById('game');
  const app = document.getElementById('app');
  const ctx = canvas.getContext('2d');
  const els = {
    menu: document.getElementById('menu'),
    start: document.getElementById('startBtn'),
    pause: document.getElementById('pauseBtn'),
    floor: document.getElementById('floorStat'),
    hp: document.getElementById('hpStat'),
    cores: document.getElementById('coreStat'),
    score: document.getElementById('scoreStat'),
    bestScoreMenu: document.getElementById('bestScoreMenu'),
    bestFloorMenu: document.getElementById('bestFloorMenu'),
    upgradePanel: document.getElementById('upgradePanel'),
    upgradeCards: document.getElementById('upgradeCards'),
    upgradeCooldown: document.querySelector('#upgradeCooldown span'),
    gameOver: document.getElementById('gameOverPanel'),
    deathLine: document.getElementById('deathLine'),
    finalScore: document.getElementById('finalScore'),
    finalFloor: document.getElementById('finalFloor'),
    finalLength: document.getElementById('finalLength'),
    finalCores: document.getElementById('finalCores'),
    buildList: document.getElementById('buildList'),
    retry: document.getElementById('retryBtn'),
    back: document.getElementById('backBtn')
  };

  const C = window.CONFIG;
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const ASSET_PATHS = {
    floor: './assets/kenney-micro-roguelike/floor_0057.png',
    floorAlt: './assets/kenney-micro-roguelike/floor_0058.png',
    floorCrack: './assets/kenney-micro-roguelike/floor_0059.png',
    floorEdge: './assets/kenney-micro-roguelike/floor_0070.png',
    wall: './assets/kenney-micro-roguelike/wall_0000.png',
    stone: './assets/kenney-micro-roguelike/stone_0067.png',
    core: './assets/kenney-micro-roguelike/core_0113.png',
    portal: './assets/kenney-micro-roguelike/portal_0095.png',
    enemyFang: './assets/kenney-micro-roguelike/enemy_red_0025.png',
    enemyShade: './assets/kenney-micro-roguelike/enemy_crab_0012.png',
    glow: './assets/kenney-micro-roguelike/glow_0078.png',
    ladder: './assets/kenney-micro-roguelike/ladder_0081.png'
  };
  const sprites = loadSprites();

  let state;
  let view = { w: 0, h: 0, cell: 20, ox: 0, oy: 0, dpr: 1 };
  let lastFrame = 0;
  let accumulator = 0;
  let touchStart = null;
  let upgradeOpenedAt = 0;
  let audioCtx = null;
  let records = loadRecords();

  function freshState() {
    return {
      mode: 'menu',
      prevMode: 'menu',
      floor: 1,
      hp: C.game.initialHp,
      maxHp: C.game.initialHp,
      score: 0,
      totalCores: 0,
      longest: C.game.initialLength,
      cores: 0,
      targetCores: C.floor.baseTargetCores,
      snake: [],
      grow: 0,
      direction: { x: 1, y: 0 },
      queuedDirection: null,
      core: null,
      exit: null,
      enemies: [],
      obstacles: [],
      venom: [],
      particles: [],
      floaters: [],
      message: C.lines.start,
      messageTimer: 1800,
      combo: 0,
      comboTimer: 0,
      inputPulse: null,
      tick: 0,
      enemySpawnCounter: 0,
      lastHurtAt: -9999,
      upgrades: {},
      pendingChoices: [],
      shedReady: true,
      screenShake: 0
    };
  }

  function loadRecords() {
    try {
      return Object.assign({ bestScore: 0, bestFloor: 1, longest: 0 }, JSON.parse(localStorage.getItem(C.game.storageKey)) || {});
    } catch (err) {
      return { bestScore: 0, bestFloor: 1, longest: 0 };
    }
  }

  function saveRecords() {
    localStorage.setItem(C.game.storageKey, JSON.stringify(records));
  }

  function init() {
    state = freshState();
    bindEvents();
    resize();
    updateRecordLabels();
    requestAnimationFrame(loop);
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    app.addEventListener('touchstart', onTouchStart, { passive: false });
    app.addEventListener('touchmove', onTouchMove, { passive: false });
    app.addEventListener('touchend', onTouchEnd, { passive: false });
    app.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
    document.querySelectorAll('[data-turn]').forEach((btn) => {
      btn.addEventListener('click', () => turnRelative(Number(btn.dataset.turn)));
    });
    els.start.addEventListener('click', startRun);
    els.retry.addEventListener('click', startRun);
    els.back.addEventListener('click', showMenu);
    els.pause.addEventListener('click', togglePause);
  }

  function loadSprites() {
    const map = {};
    Object.entries(ASSET_PATHS).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      map[key] = img;
    });
    return map;
  }

  function ensureAudio() {
    if (!audioCtx) {
      const AudioClass = window.AudioContext || window.webkitAudioContext;
      if (AudioClass) audioCtx = new AudioClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    gain.connect(audioCtx.destination);

    const notes = {
      core: [[520, 760, 0.12, 'sine']],
      upgrade: [[440, 660, 0.12, 'triangle'], [660, 880, 0.18, 'triangle']],
      hurt: [[180, 90, 0.18, 'sawtooth']],
      exit: [[330, 990, 0.35, 'sine']],
      death: [[220, 55, 0.7, 'square']]
    }[type] || [[440, 440, 0.08, 'sine']];

    notes.forEach((note, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = note[3];
      const start = now + i * 0.08;
      osc.frequency.setValueAtTime(note[0], start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, note[1]), start + note[2]);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + note[2]);
    });
  }

  function haptic(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    view.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.floor(view.w * view.dpr);
    canvas.height = Math.floor(view.h * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    view.cell = Math.floor(Math.min(view.w / C.game.cols, view.h / C.game.rows));
    view.ox = Math.floor((view.w - view.cell * C.game.cols) / 2);
    view.oy = Math.floor((view.h - view.cell * C.game.rows) / 2);
  }

  function startRun() {
    ensureAudio();
    state = freshState();
    state.mode = 'playing';
    state.snake = makeSnakeWithLength(C.game.initialLength);
    setupFloor();
    accumulator = 0;
    setPanel(els.menu, false);
    setPanel(els.gameOver, false);
    updateHud();
  }

  function showMenu() {
    state.mode = 'menu';
    setPanel(els.gameOver, false);
    setPanel(els.menu, true);
    updateRecordLabels();
  }

  function makeSnakeWithLength(length) {
    const cx = Math.floor(C.game.cols / 2);
    const cy = Math.floor(C.game.rows / 2);
    const snake = [];
    for (let i = 0; i < length; i += 1) {
      snake.push({ x: cx - i, y: cy });
    }
    return snake;
  }

  function setupFloor() {
    state.cores = 0;
    state.targetCores = Math.min(C.floor.maxTargetCores, C.floor.baseTargetCores + Math.floor(state.floor / 2));
    state.exit = null;
    state.obstacles = [];
    state.enemies = [];
    state.venom = [];
    state.particles = [];
    state.enemySpawnCounter = 0;
    state.shedReady = true;

    const obstacleCount = C.floor.baseObstacles + state.floor * 2;
    const enemyCount = C.floor.baseEnemies + Math.floor(state.floor * 0.7) + getUpgrade('glutton');
    for (let i = 0; i < obstacleCount; i += 1) addObstacle();
    for (let i = 0; i < enemyCount; i += 1) addEnemy();
    spawnCore();
    flashMessage(state.floor === 1 ? C.lines.start : `第 ${state.floor} 层重组。`);
  }

  function cellKey(pos) {
    return `${pos.x},${pos.y}`;
  }

  function inBounds(pos) {
    return pos.x >= 0 && pos.y >= 0 && pos.x < C.game.cols && pos.y < C.game.rows;
  }

  function sameCell(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function occupied(pos, includeEnemies) {
    if (!inBounds(pos)) return true;
    if (state.snake.some((s) => sameCell(s, pos))) return true;
    if (state.obstacles.some((o) => sameCell(o, pos))) return true;
    if (includeEnemies && state.enemies.some((e) => sameCell(e, pos))) return true;
    if (state.core && sameCell(state.core, pos)) return true;
    if (state.exit && sameCell(state.exit, pos)) return true;
    return false;
  }

  function randomCell(includeEnemies) {
    for (let i = 0; i < 600; i += 1) {
      const pos = {
        x: Math.floor(Math.random() * C.game.cols),
        y: Math.floor(Math.random() * C.game.rows)
      };
      const centerSafe = Math.abs(pos.x - Math.floor(C.game.cols / 2)) + Math.abs(pos.y - Math.floor(C.game.rows / 2)) < 5;
      if (!centerSafe && !occupied(pos, includeEnemies)) return pos;
    }
    return { x: 1, y: 1 };
  }

  function addObstacle() {
    state.obstacles.push(randomCell(true));
  }

  function addEnemy() {
    const pos = randomCell(true);
    state.enemies.push({
      id: `e${Date.now()}-${Math.random().toString(16).slice(2)}`,
      x: pos.x,
      y: pos.y,
      type: state.floor >= 3 && Math.random() < 0.35 ? 'shade' : 'fang',
      phase: Math.random() * Math.PI * 2
    });
  }

  function spawnCore() {
    state.core = randomCell(true);
    burst(state.core, C.colors.coreHot, 8);
  }

  function spawnExit() {
    const candidates = [];
    for (let x = 1; x < C.game.cols - 1; x += 1) {
      candidates.push({ x, y: 1 }, { x, y: C.game.rows - 2 });
    }
    for (let y = 2; y < C.game.rows - 2; y += 1) {
      candidates.push({ x: 1, y }, { x: C.game.cols - 2, y });
    }
    candidates.sort(() => Math.random() - 0.5);
    state.exit = candidates.find((pos) => !occupied(pos, true)) || randomCell(true);
    playTone('exit');
    flashMessage(C.lines.exit);
    burst(state.exit, C.colors.exit, 18);
  }

  function loop(timestamp) {
    const dt = Math.min(64, timestamp - (lastFrame || timestamp));
    lastFrame = timestamp;
    if (state.mode === 'playing') {
      accumulator += dt;
      const tickMs = getTickMs();
      while (accumulator >= tickMs) {
        updateGame(tickMs);
        accumulator -= tickMs;
      }
    }
    updateParticles(dt);
    draw(timestamp);
    updateCooldown(timestamp);
    requestAnimationFrame(loop);
  }

  function getTickMs() {
    return Math.max(C.game.minTickMs, C.game.baseTickMs - getUpgrade('speed') * 12);
  }

  function updateGame(dt) {
    state.tick += 1;
    state.messageTimer = Math.max(0, state.messageTimer - dt);
    state.venom.forEach((v) => { v.life -= 1; });
    state.venom = state.venom.filter((v) => v.life > 0);
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer === 0) state.combo = 0;
    if (state.inputPulse) {
      state.inputPulse.life -= dt;
      if (state.inputPulse.life <= 0) state.inputPulse = null;
    }

    if (state.queuedDirection) {
      state.direction = state.queuedDirection;
      state.queuedDirection = null;
    }

    moveSnake();
    collectByMagnet();
    if (state.tick % 2 === 0) moveEnemies();
    state.longest = Math.max(state.longest, state.snake.length);
    updateHud();
  }

  function moveSnake() {
    const head = state.snake[0];
    const next = wrapCell({ x: head.x + state.direction.x, y: head.y + state.direction.y });
    const obstacleIndex = state.obstacles.findIndex((o) => sameCell(o, next));
    const selfIndex = state.snake.findIndex((s) => sameCell(s, next));
    const enemyIndex = state.enemies.findIndex((e) => sameCell(e, next));

    if (obstacleIndex >= 0) {
      state.obstacles.splice(obstacleIndex, 1);
      hurt(1);
      burst(next, C.colors.obstacleEdge, 14);
    }

    if (selfIndex > 0) {
      hurt(1);
      state.snake = state.snake.slice(0, Math.max(3, selfIndex));
      burst(next, C.colors.snake, 12);
    }

    if (enemyIndex >= 0) {
      state.enemies.splice(enemyIndex, 1);
      hurt(1);
      score(C.score.enemy);
      burst(next, C.colors.enemy, 18);
    }

    state.snake.unshift(next);

    if (getUpgrade('venom') > 0) {
      const tail = state.snake[state.snake.length - 1];
      state.venom.push({ x: tail.x, y: tail.y, life: 3 + getUpgrade('venom') });
    }

    if (state.core && sameCell(next, state.core)) {
      eatCore();
    }

    if (state.exit && sameCell(next, state.exit)) {
      enterNextFloor();
      return;
    }

    if (state.grow > 0) {
      state.grow -= 1;
    } else {
      state.snake.pop();
    }
  }

  function wrapCell(pos) {
    return {
      x: (pos.x + C.game.cols) % C.game.cols,
      y: (pos.y + C.game.rows) % C.game.rows
    };
  }

  function eatCore() {
    const mult = 1 + getUpgrade('glutton') * 0.25;
    state.combo = Math.min(9, state.combo + 1);
    state.comboTimer = 2300;
    const comboMul = 1 + Math.max(0, state.combo - 1) * 0.08;
    const gained = Math.floor((C.score.core * mult + state.floor * 18) * comboMul);
    score(gained);
    state.cores += 1;
    state.totalCores += 1;
    state.grow += 1;
    playTone('core');
    haptic(14);
    addFloatText(state.core, `+${gained}${state.combo > 1 ? `  x${state.combo}` : ''}`, C.colors.coreHot);
    burst(state.core, C.colors.coreHot, 22);
    if (getUpgrade('fang') > 0) biteBurst(state.core);

    if (state.totalCores % 3 === 0) openUpgrade();
    if (state.cores >= state.targetCores && !state.exit) {
      state.core = null;
      spawnExit();
    } else {
      spawnCore();
    }

    state.enemySpawnCounter += 1;
    const spawnEvery = Math.max(2, C.floor.spawnEnemyEveryCores - Math.floor(state.floor / 3));
    if (state.enemySpawnCounter >= spawnEvery) {
      state.enemySpawnCounter = 0;
      addEnemy();
    }
  }

  function addFloatText(cell, text, color) {
    const center = cellCenter(cell);
    state.floaters.push({
      x: center.x,
      y: center.y,
      vy: -0.045,
      life: 780,
      text,
      color
    });
  }

  function biteBurst(center) {
    let removed = 0;
    state.enemies = state.enemies.filter((e) => {
      const near = Math.abs(e.x - center.x) <= 1 && Math.abs(e.y - center.y) <= 1;
      if (near) {
        removed += 1;
        burst(e, C.colors.enemy, 12);
      }
      return !near;
    });
    if (removed) score(removed * C.score.enemy);
  }

  function collectByMagnet() {
    const range = getUpgrade('magnet');
    if (!range || !state.core) return;
    const head = state.snake[0];
    const dist = Math.abs(head.x - state.core.x) + Math.abs(head.y - state.core.y);
    if (dist <= range) {
      eatCore();
    }
  }

  function moveEnemies() {
    const head = state.snake[0];
    const blocked = new Set(state.obstacles.map(cellKey));
    state.enemies.forEach((enemy) => {
      const options = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
      ];
      let dir;
      if (Math.random() < 0.65) {
        const dx = Math.sign(head.x - enemy.x);
        const dy = Math.sign(head.y - enemy.y);
        dir = Math.abs(head.x - enemy.x) > Math.abs(head.y - enemy.y) ? { x: dx, y: 0 } : { x: 0, y: dy };
      } else {
        dir = options[Math.floor(Math.random() * options.length)];
      }
      const next = wrapCell({ x: enemy.x + dir.x, y: enemy.y + dir.y });
      if (blocked.has(cellKey(next)) || (state.exit && sameCell(next, state.exit))) return;
      enemy.x = next.x;
      enemy.y = next.y;
    });

    const venomSet = new Set(state.venom.map(cellKey));
    const before = state.enemies.length;
    state.enemies = state.enemies.filter((e) => !venomSet.has(cellKey(e)));
    const killed = before - state.enemies.length;
    if (killed) {
      score(killed * C.score.enemy);
      addFloatText(state.snake[0], `猎杀 +${killed * C.score.enemy}`, C.colors.enemy);
      haptic(10);
    }

    if (state.enemies.some((e) => sameCell(e, state.snake[0]))) {
      hurt(1);
    }
  }

  function hurt(amount) {
    const now = performance.now();
    if (now - state.lastHurtAt < C.game.invulnerableMs) return;
    state.lastHurtAt = now;

    if (state.hp - amount <= 0 && getUpgrade('shed') > 0 && state.shedReady && state.snake.length > 4) {
      state.shedReady = false;
      state.snake.splice(-Math.min(3, state.snake.length - 3));
      state.hp = 1;
      flashMessage('蜕皮保住了你。');
      burst(state.snake[state.snake.length - 1], '#ecf6ef', 20);
      return;
    }

    state.hp -= amount;
    state.screenShake = 10;
    playTone('hurt');
    haptic([18, 30, 18]);
    flashMessage(C.lines.hurt);
    if (state.hp <= 0) endRun();
  }

  function enterNextFloor() {
    score(C.score.floor + state.floor * 120);
    state.floor += 1;
    state.direction = { x: 1, y: 0 };
    state.queuedDirection = null;
    state.snake = makeSnakeWithLength(Math.min(state.longest, 7 + state.floor));
    playTone('exit');
    haptic([16, 40, 16]);
    setupFloor();
  }

  function openUpgrade() {
    state.prevMode = state.mode;
    state.mode = 'upgrade';
    upgradeOpenedAt = performance.now();
    state.pendingChoices = chooseUpgrades();
    renderUpgradeCards();
    setPanel(els.upgradePanel, true);
    playTone('upgrade');
    haptic(20);
  }

  function chooseUpgrades() {
    const pool = C.upgrades.filter((u) => getUpgrade(u.id) < u.max);
    pool.sort(() => Math.random() - 0.5);
    return pool.slice(0, 3);
  }

  function renderUpgradeCards() {
    els.upgradeCards.innerHTML = '';
    state.pendingChoices.forEach((upgrade) => {
      const btn = document.createElement('button');
      btn.className = 'upgrade-card';
      btn.type = 'button';
      btn.disabled = true;
      btn.innerHTML = `<strong>${upgrade.name}</strong><span>${upgrade.kind} / Lv.${getUpgrade(upgrade.id) + 1}<br>${upgrade.desc}</span>`;
      btn.addEventListener('click', () => takeUpgrade(upgrade.id));
      els.upgradeCards.appendChild(btn);
    });
  }

  function updateCooldown(now) {
    if (state.mode !== 'upgrade') return;
    const progress = Math.min(1, (now - upgradeOpenedAt) / C.game.upgradeCooldownMs);
    els.upgradeCooldown.style.width = `${progress * 100}%`;
    const ready = progress >= 1;
    els.upgradeCards.querySelectorAll('button').forEach((btn) => { btn.disabled = !ready; });
  }

  function takeUpgrade(id) {
    if (performance.now() - upgradeOpenedAt < C.game.upgradeCooldownMs) return;
    state.upgrades[id] = getUpgrade(id) + 1;
    if (id === 'scale') {
      state.maxHp += 1;
      state.hp = Math.min(state.maxHp, state.hp + 1);
    }
    setPanel(els.upgradePanel, false);
    state.mode = 'playing';
    flashMessage(`突变：${C.upgrades.find((u) => u.id === id).name}`);
    updateHud();
  }

  function getUpgrade(id) {
    return state.upgrades[id] || 0;
  }

  function score(amount) {
    state.score += amount;
  }

  function endRun() {
    state.mode = 'gameover';
    playTone('death');
    const newBest = state.score > records.bestScore || state.floor > records.bestFloor;
    records.bestScore = Math.max(records.bestScore, state.score);
    records.bestFloor = Math.max(records.bestFloor, state.floor);
    records.longest = Math.max(records.longest, state.longest);
    saveRecords();
    els.deathLine.textContent = newBest ? C.lines.record : C.lines.death;
    els.finalScore.textContent = String(state.score);
    els.finalFloor.textContent = String(state.floor);
    els.finalLength.textContent = String(state.longest);
    els.finalCores.textContent = String(state.totalCores);
    els.buildList.innerHTML = '';
    Object.keys(state.upgrades).forEach((id) => {
      const u = C.upgrades.find((item) => item.id === id);
      const chip = document.createElement('span');
      chip.textContent = `${u.name} ${state.upgrades[id]}`;
      els.buildList.appendChild(chip);
    });
    setPanel(els.gameOver, true);
    updateRecordLabels();
  }

  function togglePause() {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      els.pause.textContent = '▶';
      flashMessage('回廊静止。');
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      els.pause.textContent = 'Ⅱ';
      flashMessage('回廊继续。');
    }
  }

  function setPanel(el, active) {
    el.classList.toggle('is-active', active);
  }

  function updateHud() {
    els.floor.textContent = `层 ${state.floor}`;
    els.hp.textContent = `HP ${Math.max(0, state.hp)}/${state.maxHp}`;
    els.cores.textContent = `核 ${state.cores}/${state.targetCores}`;
    els.score.textContent = String(state.score);
  }

  function updateRecordLabels() {
    els.bestScoreMenu.textContent = `最高 ${records.bestScore}`;
    els.bestFloorMenu.textContent = `最深 ${records.bestFloor}`;
  }

  function setDirection(name) {
    if (!DIRS[name] || (state.mode !== 'playing' && state.mode !== 'paused')) return;
    const dir = DIRS[name];
    const current = state.queuedDirection || state.direction;
    if (dir.x + state.direction.x === 0 && dir.y + state.direction.y === 0) return;
    if (dir.x === current.x && dir.y === current.y) return;
    state.queuedDirection = dir;
    state.inputPulse = { x: state.snake[0]?.x || 0, y: state.snake[0]?.y || 0, life: 220, dir };
    haptic(8);
  }

  function turnRelative(sign) {
    if (state.mode !== 'playing' && state.mode !== 'paused') return;
    const base = state.queuedDirection || state.direction;
    const dir = sign > 0 ? { x: -base.y, y: base.x } : { x: base.y, y: -base.x };
    const name = Object.keys(DIRS).find((key) => DIRS[key].x === dir.x && DIRS[key].y === dir.y);
    if (name) setDirection(name);
  }

  function onKey(evt) {
    const map = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right'
    };
    if (evt.code === 'Space') togglePause();
    if (map[evt.code]) {
      evt.preventDefault();
      setDirection(map[evt.code]);
    }
  }

  function onTouchStart(evt) {
    if (evt.target.closest('button, .panel') || state.mode !== 'playing') return;
    evt.preventDefault();
    ensureAudio();
    const touch = evt.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(evt) {
    if (!touchStart) return;
    evt.preventDefault();
  }

  function onTouchEnd(evt) {
    if (!touchStart) return;
    evt.preventDefault();
    const touch = evt.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < C.game.swipeMinPx) {
      turnRelative(touch.clientX > window.innerWidth / 2 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 'right' : 'left');
    else setDirection(dy > 0 ? 'down' : 'up');
  }

  function updateParticles(dt) {
    state.particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    state.particles = state.particles.filter((p) => p.life > 0);
    state.floaters.forEach((f) => {
      f.y += f.vy * dt;
      f.life -= dt;
    });
    state.floaters = state.floaters.filter((f) => f.life > 0);
    state.screenShake = Math.max(0, state.screenShake - dt * 0.04);
  }

  function burst(cell, color, count) {
    if (!cell) return;
    const center = cellCenter(cell);
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.025 + Math.random() * 0.08;
      state.particles.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 280 + Math.random() * 360,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }

  function flashMessage(text) {
    state.message = text;
    state.messageTimer = 1700;
  }

  function cellCenter(cell) {
    return {
      x: view.ox + cell.x * view.cell + view.cell / 2,
      y: view.oy + cell.y * view.cell + view.cell / 2
    };
  }

  function draw(ts) {
    ctx.clearRect(0, 0, view.w, view.h);
    const shakeX = state.screenShake ? (Math.random() - 0.5) * state.screenShake : 0;
    const shakeY = state.screenShake ? (Math.random() - 0.5) * state.screenShake : 0;
    drawBackdrop(ts);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawBoard();
    drawVenom();
    drawObstacles();
    drawExit(ts);
    drawCore(ts);
    drawEnemies(ts);
    drawDirectionPreview(ts);
    drawSnake(ts);
    drawParticles();
    drawFloaters();
    drawCombo();
    drawMessage();
    ctx.restore();
    drawVignette();
  }

  function drawBackdrop(ts) {
    const grad = ctx.createLinearGradient(0, 0, view.w, view.h);
    grad.addColorStop(0, '#2a1d36');
    grad.addColorStop(0.46, '#151926');
    grad.addColorStop(1, '#15100e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);

    for (let i = 0; i < 18; i += 1) {
      const x = (i * 97 + (ts * 0.012)) % (view.w + 80) - 40;
      const y = (i * 53) % view.h;
      const r = 18 + (i % 5) * 8;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,200,87,0.035)' : 'rgba(97,218,251,0.028)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoard() {
    const w = C.game.cols * view.cell;
    const h = C.game.rows * view.cell;
    const grad = ctx.createLinearGradient(0, view.oy, 0, view.oy + h);
    grad.addColorStop(0, '#20182a');
    grad.addColorStop(0.55, '#151927');
    grad.addColorStop(1, '#120f18');
    ctx.fillStyle = grad;
    roundRect(view.ox, view.oy, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,216,142,0.22)';
    ctx.stroke();

    ctx.save();
    ctx.shadowBlur = 26;
    ctx.shadowColor = 'rgba(255,200,87,0.35)';
    ctx.strokeStyle = 'rgba(255,200,87,0.26)';
    ctx.lineWidth = 4;
    roundRect(view.ox - 3, view.oy - 3, w + 6, h + 6, 14);
    ctx.stroke();
    ctx.restore();

    for (let y = 0; y < C.game.rows; y += 1) {
      for (let x = 0; x < C.game.cols; x += 1) {
        const pos = { x, y };
        ctx.globalAlpha = 0.22 + ((x * 7 + y * 3 + state.floor) % 3) * 0.035;
        const pick = (x * 11 + y * 17 + state.floor) % 13;
        const sprite = pick === 0 ? 'floorCrack' : pick < 3 ? 'floorAlt' : pick === 4 ? 'floorEdge' : 'floor';
        drawSprite(sprite, pos, 0.02);
      }
    }
    ctx.globalAlpha = 1;

    ctx.beginPath();
    for (let x = 1; x < C.game.cols; x += 1) {
      const px = view.ox + x * view.cell;
      ctx.moveTo(px, view.oy);
      ctx.lineTo(px, view.oy + h);
    }
    for (let y = 1; y < C.game.rows; y += 1) {
      const py = view.oy + y * view.cell;
      ctx.moveTo(view.ox, py);
      ctx.lineTo(view.ox + w, py);
    }
    ctx.strokeStyle = C.colors.grid;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawVenom() {
    state.venom.forEach((v) => {
      const r = cellRect(v, 0.22);
      ctx.fillStyle = C.colors.venom;
      roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.fill();
    });
  }

  function drawObstacles() {
    state.obstacles.forEach((o) => {
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = C.colors.obstacleEdge;
      if (!drawSprite('stone', o, 0.03)) {
        const r = cellRect(o, 0.16);
        ctx.fillStyle = C.colors.obstacle;
        roundRect(r.x, r.y, r.w, r.h, 5);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawCore(ts) {
    if (!state.core) return;
    const c = cellCenter(state.core);
    const pulse = 0.85 + Math.sin(ts / 160) * 0.15;
    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = C.colors.coreHot;
    ctx.globalAlpha = 0.35;
    drawSprite('glow', state.core, -0.18);
    ctx.globalAlpha = 1;
    ctx.translate(c.x, c.y);
    ctx.scale(pulse, pulse);
    ctx.translate(-c.x, -c.y);
    if (!drawSprite('core', state.core, -0.1)) {
      ctx.fillStyle = C.colors.core;
      ctx.beginPath();
      ctx.arc(c.x, c.y, view.cell * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.arc(c.x + view.cell * 0.12, c.y - view.cell * 0.13, view.cell * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawExit(ts) {
    if (!state.exit) return;
    const c = cellCenter(state.exit);
    ctx.save();
    ctx.shadowBlur = 22;
    ctx.shadowColor = C.colors.exit;
    ctx.globalAlpha = 0.75 + Math.sin(ts / 190) * 0.18;
    drawSprite('portal', state.exit, -0.12);
    ctx.globalAlpha = 1;
    ctx.translate(c.x, c.y);
    ctx.rotate(ts / 420);
    ctx.strokeStyle = 'rgba(255,209,102,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, view.cell * (0.46 - i * 0.13), i, Math.PI * 1.6 + i);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemies(ts) {
    state.enemies.forEach((e) => {
      const c = cellCenter(e);
      const bob = Math.sin(ts / 180 + e.phase) * 2;
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = C.colors.enemy;
      ctx.translate(0, bob);
      if (!drawSprite(e.type === 'shade' ? 'enemyShade' : 'enemyFang', e, -0.06)) {
        const size = view.cell * (e.type === 'shade' ? 0.36 : 0.31);
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = e.type === 'shade' ? '#ff7a90' : C.colors.enemy;
        roundRect(-size / 2, -size / 2, size, size, 4);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawSnake(ts) {
    state.snake.forEach((seg, i) => {
      const r = cellRect(seg, i === 0 ? 0.03 : 0.1);
      const invuln = performance.now() - state.lastHurtAt < C.game.invulnerableMs;
      ctx.save();
      ctx.globalAlpha = invuln && i === 0 && Math.floor(ts / 90) % 2 === 0 ? 0.45 : 1;
      const bodyGrad = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
      bodyGrad.addColorStop(0, i === 0 ? '#fff0a3' : shadeSnake(i));
      bodyGrad.addColorStop(1, i === 0 ? C.colors.head : '#145c42');
      ctx.fillStyle = bodyGrad;
      ctx.shadowBlur = i === 0 ? 18 : 5;
      ctx.shadowColor = i === 0 ? C.colors.head : C.colors.snake;
      roundRect(r.x, r.y, r.w, r.h, i === 0 ? 9 : 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = i === 0 ? '#6b3f00' : 'rgba(255,255,255,0.16)';
      ctx.stroke();
      if (i > 0 && i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(r.x + r.w * 0.24, r.y + r.h * 0.25, Math.max(2, r.w * 0.18), Math.max(2, r.h * 0.18));
      }
      if (i === 0) {
        drawEyes(r);
        drawTongue(r);
      }
      ctx.restore();
    });
  }

  function drawDirectionPreview(ts) {
    if (!state.snake.length || state.mode !== 'playing') return;
    const dir = state.queuedDirection || state.direction;
    let pos = { ...state.snake[0] };
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(ts / 120) * 0.05;
    ctx.fillStyle = C.colors.head;
    for (let i = 1; i <= 4; i += 1) {
      pos = wrapCell({ x: pos.x + dir.x, y: pos.y + dir.y });
      const r = cellRect(pos, 0.34);
      roundRect(r.x, r.y, r.w, r.h, 4);
      ctx.fill();
    }
    if (state.inputPulse) {
      const c = cellCenter(state.inputPulse);
      ctx.globalAlpha = Math.max(0, state.inputPulse.life / 220);
      ctx.strokeStyle = '#fff7df';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, view.cell * (0.55 - state.inputPulse.life / 900), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function shadeSnake(i) {
    return i % 2 === 0 ? C.colors.snake : C.colors.snakeDark;
  }

  function drawEyes(r) {
    ctx.fillStyle = '#071015';
    const ex = state.direction.x * r.w * 0.18;
    const ey = state.direction.y * r.h * 0.18;
    ctx.beginPath();
    ctx.arc(r.x + r.w * 0.35 + ex, r.y + r.h * 0.38 + ey, 2, 0, Math.PI * 2);
    ctx.arc(r.x + r.w * 0.65 + ex, r.y + r.h * 0.38 + ey, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTongue(r) {
    const cx = r.x + r.w / 2 + state.direction.x * r.w * 0.33;
    const cy = r.y + r.h / 2 + state.direction.y * r.h * 0.33;
    ctx.strokeStyle = '#ff5c8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + state.direction.x * r.w * 0.28, cy + state.direction.y * r.h * 0.28);
    ctx.stroke();
  }

  function drawParticles() {
    state.particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 500));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawFloaters() {
    state.floaters.forEach((f) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 280));
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#000';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  function drawCombo() {
    if (state.combo <= 1 || state.mode !== 'playing') return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.comboTimer / 500);
    ctx.textAlign = 'right';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.fillStyle = C.colors.coreHot;
    ctx.shadowBlur = 18;
    ctx.shadowColor = C.colors.coreHot;
    ctx.fillText(`x${state.combo}`, view.ox + C.game.cols * view.cell - 14, view.oy + 34);
    ctx.restore();
  }

  function drawVignette() {
    const grad = ctx.createRadialGradient(view.w / 2, view.h * 0.42, view.w * 0.2, view.w / 2, view.h * 0.42, view.w * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.46)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function drawMessage() {
    if (!state.messageTimer) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, state.messageTimer / 450);
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = C.colors.text;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#000';
    ctx.fillText(state.message, view.w / 2, view.oy + 28);
    ctx.restore();
  }

  function cellRect(cell, padRatio) {
    const pad = view.cell * padRatio;
    return {
      x: view.ox + cell.x * view.cell + pad,
      y: view.oy + cell.y * view.cell + pad,
      w: view.cell - pad * 2,
      h: view.cell - pad * 2
    };
  }

  function drawSprite(name, cell, padRatio) {
    const img = sprites[name];
    if (!img || !img.complete || !img.naturalWidth) return false;
    const r = cellRect(cell, padRatio);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    return true;
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  init();
})();
