// Iso Quiz Runner — Latest version
(() => {
  // DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: true });
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const messageEl = document.getElementById('message');
  const overlay = document.getElementById('overlay');
  const startPanel = document.getElementById('startPanel');
  const questionPanel = document.getElementById('questionPanel');
  const qText = document.getElementById('qText');
  const qOptions = document.getElementById('qOptions');
  const startBtn = document.getElementById('startBtn');
  const howBtn = document.getElementById('howBtn');
  const howPanel = document.getElementById('howPanel');
  const howClose = document.getElementById('howClose');
  const qContinue = document.getElementById('qContinue');
  const pausePanel = document.getElementById('pausePanel');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtn = document.getElementById('restartBtn');
  const btnSound = document.getElementById('btnSound');
  const btnPause = document.getElementById('btnPause');
  const touchControls = document.getElementById('touchControls');

  // Grid
  const cols = 9, rows = 13;
  const tileW = 96, tileH = 48;

  // Responsive origin; will be computed on resize
  let originX = 0, originY = 0;
  function isoToScreen(ix, iy) {
    const sx = originX + (ix - iy) * tileW/2;
    const sy = originY + (ix + iy) * tileH/2 - tileH;
    return { sx, sy };
  }

  // Game state
  let grid = [];
  let cars = [];
  let score = 0;
  let best = parseInt(localStorage.getItem('isoquiz_best') || '0', 10) || 0;
  let soundOn = JSON.parse(localStorage.getItem('isoquiz_sound') || 'true');
  let running = false, paused = false;
  let lastTs = 0;
  let player = {
    x: Math.floor(cols / 2),
    y: rows - 1,
    fx: 0, fy: 0, moving: false, moveStart: 0, moveDuration: 160,
    hop: 0   // vertical hop for more 2.5D feel
  };
  const gateRow = 0; // top
  let currentQuestion = null;
  let gateOptions = ['', ''];
  let awaitingGate = false; // waiting for player to go through gate after showing question

  // Questions (expanded)
  const QUESTIONS = [
    { q: "If you see a wet floor without sign, what's best to do?", options: ["Put up a warning sign/clean it", "Ignore it — someone else will"], correct: 0 },
    { q: "When lifting heavy items, the safer technique is:", options: ["Bend knees and keep back straight", "Bend from the waist quickly"], correct: 0 },
    { q: "If a machine is noisy, the correct action is:", options: ["Wear hearing protection / report it", "Use it without protection"], correct: 0 },
    { q: "Which is true about fire exits?", options: ["Keep clear at all times", "Block with boxes to save space"], correct: 0 },
    { q: "If you notice a chemical spill, you should:", options: ["Warn others and follow spill procedure", "Walk over it — it's fine"], correct: 0 },
    { q: "If uncertain about a task's safety, you should:", options: ["Ask a supervisor / check procedure", "Just guess and proceed"], correct: 0 },
    { q: "To protect hands around sharp objects, you should:", options: ["Wear the correct gloves", "Use bare hands for better grip"], correct: 0 },
    { q: "If a colleague reports an injury, you should:", options: ["Offer help and follow first-aid procedure", "Ignore — it's not your responsibility"], correct: 0 },
    { q: "Before using unfamiliar equipment you should:", options: ["Read instructions / get training", "Try to figure it out as you go"], correct: 0 },
  ];

  // Audio (simple beep using WebAudio)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = AudioCtx ? new AudioCtx() : null;
  function beep(freq = 440, time = 0.08, type = 'sine', gain = 0.15) {
    if (!soundOn || !audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + time);
    o.stop(audioCtx.currentTime + time + 0.02);
  }

  // init/responsive
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // compute origin to center grid
    originX = rect.width / 2;
    originY = rect.height - 80;
    draw(); // redraw
  }
  window.addEventListener('resize', resize);

  // Setup grid and lanes
  function initGrid() {
    grid = new Array(rows);
    for (let y = 0; y < rows; y++) {
      grid[y] = new Array(cols).fill(0);
    }
    // set roads in a pattern
    const roadRows = [rows - 3, rows - 5, rows - 7, rows - 9];
    cars = [];
    roadRows.forEach((r, idx) => {
      if (r <= gateRow) return;
      for (let x = 0; x < cols; x++) grid[r][x] = 1;
      // lane settings
      const dir = idx % 2 === 0 ? 1 : -1;
      const speed = 1.0 + idx * 0.12 + Math.random() * 0.6; // tiles/sec
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        cars.push({
          row: r,
          x: Math.random() * cols,
          speed: speed * dir, // tiles per second
          len: 1 + Math.floor(Math.random() * 2),
          dir
        });
      }
    });
  }

  // pick question & assign left/right
  function pickQuestion() {
    currentQuestion = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    if (Math.random() < 0.5) {
      gateOptions = [currentQuestion.options[0], currentQuestion.options[1]];
      currentQuestion.correctGate = currentQuestion.correct === 0 ? 0 : 1;
    } else {
      gateOptions = [currentQuestion.options[1], currentQuestion.options[0]];
      currentQuestion.correctGate = currentQuestion.correct === 0 ? 1 : 0;
    }
    awaitingGate = false;
    updateQuestionOverlay(false);
  }

  function updateQuestionOverlay(show) {
    if (show) {
      startPanel.classList.add('hidden');
      howPanel.classList.add('hidden');
      pausePanel.classList.add('hidden');
      questionPanel.classList.remove('hidden');
      overlay.classList.remove('hidden');
      qText.textContent = currentQuestion.q;
      qOptions.innerHTML = `<strong>Left:</strong> ${gateOptions[0]} &nbsp;&nbsp; <strong>Right:</strong> ${gateOptions[1]}`;
    } else {
      questionPanel.classList.add('hidden');
      // show nothing if start menu not active
      if (!running && !paused) overlay.classList.remove('hidden');
    }
  }

  function showPanel(name) {
    // names: start, how, pause
    startPanel.classList.toggle('hidden', name !== 'start');
    howPanel.classList.toggle('hidden', name !== 'how');
    pausePanel.classList.toggle('hidden', name !== 'pause');
    questionPanel.classList.add('hidden');
    overlay.classList.remove('hidden');
  }

  // Player movement
  function movePlayer(dx, dy) {
    if (!running || paused) return;
    if (player.moving) return;
    const nx = player.x + dx, ny = player.y + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return;
    player.moving = true;
    player.moveStart = performance.now();
    player.startX = player.x; player.startY = player.y;
    player.targetX = nx; player.targetY = ny;
  }

  function handleAfterMove() {
    player.moving = false;
    player.x = player.targetX; player.y = player.targetY;
    player.fx = player.x; player.fy = player.y;
    player.hop = 0;
    // collisions
    if (isOnRoad(player.y) && checkCarCollisionAt(player.x, player.y)) {
      respawn('hit');
      return;
    }
    // if reached gate row
    if (player.y === gateRow) {
      awaitingGate = true;
      updateQuestionOverlay(true);
      // player must step into left/right gate tile to choose
    }
    evaluateGateIfAtTop();
  }

  // collision helpers
  function isOnRoad(y) {
    return grid[y] && grid[y].some(cell => cell === 1);
  }

  function checkCarCollisionAt(px, py) {
    for (const c of cars) {
      if (c.row !== py) continue;
      for (let i = 0; i < c.len; i++) {
        const carCellX = Math.floor(c.x + (c.dir === 1 ? i : -i));
        if (carCellX === px) return true;
      }
    }
    return false;
  }

  function respawn(reason = '') {
    if (reason === 'hit') {
      showMessage('Hit by car! Respawning...', 1200);
      beep(120, 0.12, 'sawtooth', 0.14);
      score = Math.max(0, score - 3);
    } else if (reason === 'wrong') {
      showMessage('Wrong gate! Respawning...', 1200);
      beep(160, 0.14, 'sawtooth', 0.14);
      score = Math.max(0, score - 5);
    }
    updateScore();
    player.x = Math.floor(cols / 2);
    player.y = rows - 1;
    player.fx = player.x; player.fy = player.y;
    player.moving = false;
    pickQuestion();
  }

  function evaluateGateIfAtTop() {
    if (!awaitingGate) return;
    const leftGateX = Math.floor(cols / 2) - 2;
    const rightGateX = Math.floor(cols / 2) + 2;
    if (player.y === gateRow && (player.x === leftGateX || player.x === rightGateX)) {
      const chosen = (player.x === leftGateX) ? 0 : 1;
      const correct = currentQuestion.correctGate;
      updateQuestionOverlay(false);
      awaitingGate = false;
      if (chosen === correct) {
        score += 10;
        updateScore();
        showMessage('Correct! +10', 900);
        beep(880, 0.12, 'sine', 0.14);
        // teleport back and next question
        setTimeout(() => {
          player.x = Math.floor(cols / 2);
          player.y = rows - 1;
          player.fx = player.x; player.fy = player.y;
          pickQuestion();
        }, 280);
      } else {
        respawn('wrong');
      }
    }
  }

  function updateScore() {
    scoreEl.textContent = `Score: ${score}`;
    if (score > best) {
      best = score;
      localStorage.setItem('isoquiz_best', `${best}`);
    }
    bestEl.textContent = `Best: ${best}`;
  }

  function showMessage(txt, ms = 1200) {
    messageEl.textContent = txt;
    if (ms > 0) setTimeout(() => messageEl.textContent = '', ms);
  }

  // Input
  window.addEventListener('keydown', (e) => {
    if (!running || paused) return;
    if (overlay && !overlay.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') movePlayer(-1, 0);
    if (e.key === 'ArrowRight' || e.key === 'd') movePlayer(1, 0);
    if (e.key === 'ArrowUp' || e.key === 'w') movePlayer(0, -1);
    if (e.key === 'ArrowDown' || e.key === 's') movePlayer(0, 1);
  });

  // touch buttons
  document.querySelectorAll('.tbtn').forEach(btn => {
    btn.addEventListener('touchstart', (ev) => {
      ev.preventDefault();
      const dir = btn.dataset.dir;
      onTouchDir(dir);
    });
    btn.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const dir = btn.dataset.dir;
      onTouchDir(dir);
    });
  });
  function onTouchDir(dir) {
    if (!running || paused) return;
    if (dir === 'up') movePlayer(0, -1);
    if (dir === 'down') movePlayer(0, 1);
    if (dir === 'left') movePlayer(-1, 0);
    if (dir === 'right') movePlayer(1, 0);
  }

  // canvas click to step (adjacent only)
  canvas.addEventListener('click', (ev) => {
    if (!running || paused) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top;
    let best = null, bestD = 1e9;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const p = isoToScreen(x, y);
      const dx = p.sx - cx, dy = p.sy - cy;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) return;
    const dx = best.x - player.x, dy = best.y - player.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      movePlayer(dx, dy);
    }
  });

  // UI handlers
startBtn.addEventListener('click', () => {
  overlay.classList.add('hidden');
  startPanel.classList.add('hidden'); // <-- hide the start panel when play begins
  startGame();
});
  howBtn.addEventListener('click', () => { showPanel('how'); });
  howClose.addEventListener('click', () => { overlay.classList.add('hidden'); });
  qContinue.addEventListener('click', () => { updateQuestionOverlay(false); awaitingGate = true; });

  resumeBtn.addEventListener('click', () => { paused = false; overlay.classList.add('hidden'); });
  restartBtn.addEventListener('click', () => { restartGame(); });

  btnSound.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('isoquiz_sound', JSON.stringify(soundOn));
    btnSound.textContent = soundOn ? '🔊' : '🔇';
  });
  btnPause.addEventListener('click', () => {
    paused = !paused;
    if (paused) showPanel('pause'); else overlay.classList.add('hidden');
  });

  // touch UI toggle (show on small screens)
  function updateTouchUI() {
    if (window.innerWidth < 720) {
      touchControls.classList.remove('hidden');
    } else {
      touchControls.classList.add('hidden');
    }
  }
  window.addEventListener('resize', updateTouchUI);

  // Game lifecycle
  function startGame() {
    running = true;
    paused = false;
    score = 0;
    updateScore();
    initGrid();
    player.x = Math.floor(cols / 2);
    player.y = rows - 1;
    player.fx = player.x; player.fy = player.y;
    pickQuestion();
    lastTs = performance.now();
    requestAnimationFrame(loop);
    updateTouchUI();
    btnSound.textContent = soundOn ? '🔊' : '🔇';
  }

  function restartGame() {
    running = true;
    paused = false;
    overlay.classList.add('hidden');
    score = 0; updateScore();
    initGrid();
    player.x = Math.floor(cols / 2);
    player.y = rows - 1;
    player.fx = player.x; player.fy = player.y;
    pickQuestion();
  }

  // game loop
  function loop(ts) {
    if (!running) return;
    const dt = Math.min(100, ts - lastTs) / 1000; // clamp
    lastTs = ts;
    if (!paused) {
      // update cars
      for (const c of cars) {
        c.x += c.speed * dt; // tiles per second
        // wrap
        if (c.dir === 1 && c.x > cols + 3) c.x = -3;
        if (c.dir === -1 && c.x < -3) c.x = cols + 3;
      }

      // update player tween
      if (player.moving) {
        const t = (performance.now() - player.moveStart) / player.moveDuration;
        if (t >= 1) {
          handleAfterMove();
        } else {
          const eased = easeOutQuad(t);
          player.fx = player.startX + (player.targetX - player.startX) * eased;
          player.fy = player.startY + (player.targetY - player.startY) * eased;
          player.hop = Math.sin(Math.min(1, t) * Math.PI) * 10;
          // while moving across roads also check collisions with approximate position
          if (isOnRoad(Math.round(player.fy)) && checkCarCollisionAt(Math.round(player.fx), Math.round(player.fy))) {
            respawn('hit');
            player.moving = false;
          }
        }
      } else {
        // if standing on road check
        if (isOnRoad(player.y) && checkCarCollisionAt(player.x, player.y)) {
          respawn('hit');
        }
      }

      // evaluate gate if on top
      evaluateGateIfAtTop();
    }

    draw();
    if (!paused) requestAnimationFrame(loop);
  }

  // draw
  function draw() {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const rect = canvas.getBoundingClientRect();
    // draw tiles back-to-front: y then x
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const { sx, sy } = isoToScreen(x, y);
        const type = grid[y][x];
        if (type === 0) drawIsoTile(sx, sy, '#bfeeb0', '#9fd08b');
        else drawIsoTile(sx, sy, '#9b9b9b', '#7a7a7a');
      }
    }

    // draw gates
    const leftGateX = Math.floor(cols / 2) - 2;
    const rightGateX = Math.floor(cols / 2) + 2;
    const leftPos = isoToScreen(leftGateX, gateRow);
    const rightPos = isoToScreen(rightGateX, gateRow);
    drawGateAt(leftPos.sx, leftPos.sy, gateOptions[0]);
    drawGateAt(rightPos.sx, rightPos.sy, gateOptions[1]);

    // draw cars (sorted by row)
    for (const c of cars) {
      const y = c.row;
      for (let i = 0; i < c.len; i++) {
        const cx = c.x + (c.dir === 1 ? i : -i);
        const { sx, sy } = isoToScreen(cx, y);
        drawCar(sx, sy, c.dir);
      }
    }

    // draw player (on top)
    drawPlayer();

    // small HUD overlay drawn on canvas optional (we use DOM HUD)
  }

  function drawIsoTile(sx, sy, fill, shade) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + tileW / 2, sy + tileH / 2);
    ctx.lineTo(sx, sy + tileH);
    ctx.lineTo(sx - tileW / 2, sy + tileH / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // shade
    ctx.beginPath();
    ctx.moveTo(sx + tileW / 2, sy + tileH / 2);
    ctx.lineTo(sx, sy + tileH);
    ctx.lineTo(sx, sy + tileH / 2);
    ctx.closePath();
    ctx.fillStyle = shade;
    ctx.globalAlpha = 0.16;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.stroke();
    ctx.restore();
  }

  function drawCar(sx, sy, dir) {
    ctx.save();
    ctx.translate(sx, sy + 8);
    const carW = tileW * 0.68;
    const carH = tileH * 0.6;
    ctx.fillStyle = '#d9534f';
    roundRectPath(ctx, -carW / 2, -carH / 2, carW, carH, 8);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-carW / 4, -carH / 6, carW / 6, carH / 6);
    ctx.fillRect(carW / 8, -carH / 6, carW / 6, carH / 6);
    ctx.restore();
  }

  function drawGateAt(sx, sy, label) {
    ctx.save();
    ctx.translate(sx, sy - tileH * 0.6);
    // base pillars
    ctx.fillStyle = '#444';
    roundRectPath(ctx, -36, -6, 22, 40, 6); ctx.fill();
    roundRectPath(ctx, 14, -6, 22, 40, 6); ctx.fill();
    // top bar
    ctx.fillStyle = '#ffd27a';
    roundRectPath(ctx, -36, -24, 72, 18, 8); ctx.fill();
    // label
    ctx.fillStyle = '#06364a';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(label || '—', 0, -6);
    ctx.restore();
  }

  function drawPlayer() {
    const px = player.fx, py = player.fy;
    const { sx, sy } = isoToScreen(px, py);
    ctx.save();
    const offY = player.hop || 0;
    // shadow
    ctx.beginPath();
    ctx.ellipse(sx, sy + 24, 18, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fill();

    // body
    ctx.beginPath();
    ctx.fillStyle = '#2b6bf6';
    ctx.arc(sx, sy + 2 - offY, 16, 0, Math.PI * 2);
    ctx.fill();

    // face
    ctx.beginPath();
    ctx.fillStyle = '#ffe0b3';
    ctx.arc(sx, sy - 6 - offY, 8, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = '#222';
    ctx.fillRect(sx - 3, sy - 8 - offY, 2, 2);
    ctx.fillRect(sx + 1, sy - 8 - offY, 2, 2);
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // helpers
  function easeOutQuad(t) { return t * (2 - t); }

  // initial setup
  function setupCanvasSize() {
    // set canvas DOM size to available area
    const maxW = Math.min(1100, window.innerWidth - 40);
    canvas.style.width = `${maxW}px`;
    canvas.style.height = `${Math.min(640, window.innerHeight - 220)}px`;
    resize();
  }

  // initial state
  setupCanvasSize();
  initGrid();
  player.fx = player.x; player.fy = player.y;
  updateScore();
  updateTouchUI();

  // expose controls for initial menu
  // On load, show start panel (overlay already visible)
  showPanel('start');

  // click start in start panel handled earlier

  // expose functions for small tasks
  // ensure audio context resumes on first user gesture for some browsers
  window.addEventListener('pointerdown', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }, { once: true });

  // expose for debugging: window.iso = { startGame, restartGame };

})();