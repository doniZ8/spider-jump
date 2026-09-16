(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const $ = id => document.getElementById(id);

let W = innerWidth, H = innerHeight;
let DPR = Math.min(devicePixelRatio || 1, 2);

function resize() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener("resize", resize);
resize();

const CFG = {
  gravity: 1850,
  move: 480,
  jump: -790,
  jump2: -740,
  gap: 96
};

/* НЕ называем это save, потому что ниже есть function save(). */
const saveKey = "spiderJumpSaveULTRA";
let saved = {};
try { saved = JSON.parse(localStorage.getItem(saveKey) || "{}"); } catch {}

const state = {
  running: false,
  over: false,
  life: false,
  last: 0,
  score: 0,
  coins: saved.coins || 0,
  lives: saved.lives || 0,
  jumps: 0,
  triple: !!saved.triple,
  jetpack: false,
  jetpackTargetY: null,
  cameraY: 0,
  targetCameraY: 0,
  highestPlatform: 0,
  sound: saved.sound !== false,
  zone: 0,
  boss: null,
  bossHp: 0,
  bossMax: 0
};

function save() {
  localStorage.setItem(saveKey, JSON.stringify({
    coins: state.coins,
    triple: state.triple,
    lives: state.lives,
    sound: state.sound
  }));
}

const player = {
  x: W / 2 - 23,
  y: 0,
  vx: 0,
  vy: 0,
  w: 46,
  h: 68,
  onGround: true
};

let platforms = [];
let particles = [];
let audioCtx = null;
let musicTimer = null;
let musicGain = null;
let musicStep = 0;

function rnd(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function difficulty() {
  return Math.floor(state.score / 100);
}

function zone() {
  return Math.floor(state.score / 1000);
}

function biome(score) {
  if (score < 50) return "JUNGLE";
  if (score < 180) return "SNOW";
  if (score < 400) return "CITY";
  if (score < 1000) return "NEON";
  return ["NEON", "VOLCANO", "TEMPLE", "SKY", "VOID"][zone() % 5];
}

function gapFor(i) {
  return Math.max(66, CFG.gap - difficulty() * 3);
}

function widthFor(i) {
  return Math.max(72, 154 - difficulty() * 3 - rnd(i) * 35);
}


/* Тихая фоновая музыка без внешних аудиофайлов. */
function startMusic() {
  try {
    audioCtx ||= new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    if (musicTimer) return;

    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.018;
    musicGain.connect(audioCtx.destination);

    const notes = [196.00, 246.94, 293.66, 246.94, 220.00, 261.63, 329.63, 261.63];

    const playNote = () => {
      if (!state.sound || !musicGain || audioCtx.state !== "running") return;

      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.value = notes[musicStep % notes.length];

      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 0.18);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.65);

      osc.connect(g);
      g.connect(musicGain);

      osc.start();
      osc.stop(audioCtx.currentTime + 1.7);

      musicStep++;
    };

    playNote();
    musicTimer = setInterval(playNote, 1700);
  } catch {}
}

function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

function updateMusicVolume() {
  if (musicGain) {
    musicGain.gain.value = state.sound ? 0.018 : 0;
  }
}

function updateHud() {
  if ($("score")) $("score").textContent = state.score;
  if ($("coins")) $("coins").textContent = state.coins;
  if ($("lives")) $("lives").textContent = state.lives;
  if ($("biome")) $("biome").textContent = biome(state.score);
  if ($("soundBtn")) $("soundBtn").textContent = state.sound ? "🔊" : "🔇";

  if ($("jetpackBtn"))
    $("jetpackBtn").disabled = state.coins < 50 || state.jetpack;
  if ($("tripleBtn"))
    $("tripleBtn").disabled = state.coins < 25 || state.triple;
  if ($("lifeBtn"))
    $("lifeBtn").disabled = state.coins < 200;

  if ($("inventory")) {
    $("inventory").innerHTML =
      (state.triple ? '<span class="pill">✦ Тройной прыжок</span>' : "") +
      (state.lives ? `<span class="pill">❤ Жизней: ${state.lives}</span>` : "") +
      (state.jetpack ? '<span class="pill">🚀 Джетпак активен</span>' : "");
  }
}

function sound(type) {
  if (!state.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const f = type === "jump" ? 520 : type === "coin" ? 880 : type === "boss" ? 70 : 180;
    o.type = type === "hit" ? "sawtooth" : "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.035, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.12);
  } catch {}
}

if ($("soundBtn")) {
  $("soundBtn").onclick = () => {
    state.sound = !state.sound;
    updateMusicVolume();
    save();
    updateHud();
  };
}

function makePlatform(y, index, x = null) {
  const w = widthFor(index);
  if (x == null) x = 30 + rnd(index * 7 + 1) * (W - w - 60);
  return {
    x: Math.max(20, Math.min(W - w - 20, x)),
    y, w, h: 16, index,
    metal: rnd(index * 4) > 0.58
  };
}

function resetWorld() {
  platforms = [];
  particles = [];
  state.score = 0;
  state.highestPlatform = 0;
  state.cameraY = 0;
  state.targetCameraY = 0;
  state.zone = 0;
  state.boss = null;
  state.bossHp = 0;
  state.bossMax = 0;
  state.jetpack = false;
  state.jetpackTargetY = null;

  const base = H - 118;
  platforms.push(makePlatform(base, 0, W / 2 - 75));

  player.x = W / 2 - player.w / 2;
  player.y = base - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  state.jumps = 0;

  let y = base;
  for (let i = 1; i < 50; i++) {
    y -= gapFor(i);
    platforms.push(makePlatform(y, i));
  }
}

function extendWorld() {
  while (platforms.length < 50) {
    const p = platforms[platforms.length - 1];
    const i = p.index + 1;
    platforms.push(makePlatform(p.y - gapFor(i), i));
  }
  while (platforms.length > 12 && platforms[0].y > state.cameraY + H + 300) {
    platforms.shift();
  }
}

/* ДЖЕТПАК: летит вверх примерно на 50 платформ, а не одним коротким импульсом. */
function startJetpack() {
  let target = player.y;
  let index = state.highestPlatform;
  for (let i = 0; i < 50; i++) {
    index++;
    target -= gapFor(index);
  }
  state.jetpack = true;
  state.jetpackTargetY = target;
  state.jumps = 0;
  extendWorld();
  spawn(player.x + player.w / 2, player.y + player.h, 25, "flame");
  sound("boss");
  updateHud();
}

function spawn(x, y, n = 8, type = "spark") {
  for (let i = 0; i < n; i++) {
    const a = rnd((x + y + i) * .13) * Math.PI * 2;
    const s = 40 + rnd(i * 7) * 160;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 60,
      life: .35 + rnd(i) * .4,
      max: .8,
      type
    });
  }
}

function jump() {
  if (!state.running || state.over || state.life || state.jetpack) return;

  if (player.onGround) {
    player.vy = CFG.jump;
    player.onGround = false;
    state.jumps = 1;
    spawn(player.x + 23, player.y + 60, 5, "web");
    sound("jump");
    return;
  }

  const maxJumps = state.triple ? 3 : 2;
  if (state.jumps < maxJumps) {
    player.vy = state.jumps === 1 ? CFG.jump2 : -700;
    state.jumps++;
    spawn(player.x + 23, player.y + 60, 4, "web");
    sound("jump");
  }
}

const keys = { left: false, right: false };

addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "a" || k === "arrowleft") {
    keys.left = true;
    e.preventDefault();
  }
  if (k === "d" || k === "arrowright") {
    keys.right = true;
    e.preventDefault();
  }
  if (k === " " || k === "w" || k === "arrowup") {
    jump();
    e.preventDefault();
  }
});

addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (k === "a" || k === "arrowleft") keys.left = false;
  if (k === "d" || k === "arrowright") keys.right = false;
});

canvas.addEventListener("pointerdown", e => {
  if (e.button === 0) jump();
});

function bindButton(id, side) {
  const el = $(id);
  if (!el) return;
  const on = e => { e.preventDefault(); keys[side] = true; };
  const off = e => { e.preventDefault(); keys[side] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
}
bindButton("leftBtn", "left");
bindButton("rightBtn", "right");

function land(prevY) {
  if (player.vy <= 0 || state.jetpack) return;

  const bottom = player.y + player.h;
  const prevBottom = prevY + player.h;

  for (const p of platforms) {
    if (
      bottom >= p.y &&
      prevBottom <= p.y &&
      player.x + player.w * .82 > p.x &&
      player.x + player.w * .18 < p.x + p.w
    ) {
      /* Без пустоты: ноги точно ставятся на верх платформы. */
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
      state.jumps = 0;

      spawn(player.x + 23, p.y, 8, "dust");

      if (p.index > state.highestPlatform) {
        const old = state.highestPlatform;
        state.highestPlatform = p.index;
        state.score = p.index;

        const coinsBefore = Math.floor(old / 5);
        const coinsAfter = Math.floor(p.index / 5);
        if (coinsAfter > coinsBefore) {
          state.coins += (coinsAfter - coinsBefore) * 5;
          sound("coin");
        }

        const z = zone();
        if (z !== state.zone) {
          state.zone = z;
          showZone(z);
        }

        if (p.index > 0 && p.index % 500 === 0 && !state.boss) {
          startBoss();
        }

        updateHud();
        save();
      }
      break;
    }
  }
}

function physics(dt) {
  const prevY = player.y;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);

  player.vx += (dir * CFG.move - player.vx) * Math.min(1, dt * 11);
  if (!dir) player.vx *= Math.pow(.0005, dt);
  player.x += player.vx * dt;

  if (player.x < -player.w * .5) player.x = W - player.w * .5;
  if (player.x > W - player.w * .5) player.x = -player.w * .5;

  if (state.jetpack) {
    player.onGround = false;
    player.vy = -1150;
    player.y += player.vy * dt;

    if (Math.random() < .8) {
      spawn(player.x + player.w / 2, player.y + player.h, 1, "flame");
    }

    extendWorld();

    if (player.y <= state.jetpackTargetY) {
      state.jetpack = false;
      state.jetpackTargetY = null;
      player.vy = 0;
      player.jumps = 0;
      spawn(player.x + 23, player.y + player.h, 20, "flame");
      sound("coin");
      save();
      updateHud();
    }
  } else {
    player.vy += CFG.gravity * dt;
    player.y += player.vy * dt;
    player.onGround = false;
    land(prevY);
  }

  if (player.y < state.targetCameraY + H * .38) {
    state.targetCameraY = player.y - H * .38;
  }
  state.cameraY += (state.targetCameraY - state.cameraY) * (1 - Math.pow(.00015, dt));

  updateParticles(dt);
  updateBoss(dt);
  extendWorld();

  if (player.y - state.cameraY > H + 160) fail();
}

function fail() {
  if (state.lives > 0) {
    state.life = true;
    state.running = false;
    $("lifeOverlay")?.classList.remove("hidden");
  } else {
    endGame();
  }
}

function continueLife() {
  let safe = platforms
    .filter(p => p.y > state.cameraY - 50 && p.y < state.cameraY + H * .85)
    .sort((a, b) => Math.abs(a.y - player.y) - Math.abs(b.y - player.y))[0];

  safe ||= platforms[platforms.length - 1];

  player.x = safe.x + safe.w / 2 - player.w / 2;
  player.y = safe.y - player.h;
  player.vy = 0;
  player.onGround = true;
  state.jumps = 0;
  state.lives--;
  state.life = false;

  $("lifeOverlay")?.classList.add("hidden");
  state.running = true;
  save();
  updateHud();
  state.last = performance.now();
  requestAnimationFrame(loop);
}

$("continueBtn")?.addEventListener("click", continueLife);
$("endLifeBtn")?.addEventListener("click", endGame);

function buy(type) {
  if (type === "jet" && state.coins >= 50 && !state.jetpack) {
    state.coins -= 50;
    startJetpack();
  } else if (type === "triple" && state.coins >= 25 && !state.triple) {
    state.coins -= 25;
    state.triple = true;
    sound("coin");
  } else if (type === "life" && state.coins >= 200) {
    state.coins -= 200;
    state.lives++;
    sound("coin");
  }
  save();
  updateHud();
}

$("jetpackBtn")?.addEventListener("click", () => buy("jet"));
$("tripleBtn")?.addEventListener("click", () => buy("triple"));
$("lifeBtn")?.addEventListener("click", () => buy("life"));

function startBoss() {
  state.boss = { x: W / 2, y: state.cameraY + 150, vx: 130, phase: 0 };
  state.bossMax = 100 + difficulty() * 8;
  state.bossHp = state.bossMax;

  let bar = $("bossbar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bossbar";
    bar.className = "bossbar";
    bar.innerHTML = '<div class="name">GUARDIAN</div><div class="track"><div class="fill"></div></div>';
    document.body.appendChild(bar);
  }
  bar.style.display = "block";
  showZoneText("GUARDIAN", "Победи хранителя высоты");
  sound("boss");
}

function updateBoss(dt) {
  if (!state.boss) return;

  const b = state.boss;
  b.phase += dt;
  b.x += b.vx * dt;
  if (b.x < 70 || b.x > W - 70) b.vx *= -1;
  b.y = state.cameraY + 145 + Math.sin(b.phase * 2) * 55;

  const px = player.x + player.w / 2;
  const py = player.y + player.h / 2;

  if (
    player.vy > 0 &&
    Math.abs(px - b.x) < 62 &&
    Math.abs(py - b.y) < 70
  ) {
    state.bossHp -= 22;
    player.vy = -880;
    spawn(b.x, b.y, 18, "impact");
    sound("boss");

    if (state.bossHp <= 0) {
      spawn(b.x, b.y, 40, "spark");
      state.coins += 50;
      state.boss = null;
      if ($("bossbar")) $("bossbar").style.display = "none";
      save();
      updateHud();
    }
  }

  const fill = document.querySelector("#bossbar .fill");
  if (fill) fill.style.width = Math.max(0, state.bossHp / state.bossMax * 100) + "%";
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
}

function showZone(z) {
  const names = ["JUNGLE", "SNOW", "CITY", "NEON", "VOLCANO", "TEMPLE", "SKY", "VOID"];
  showZoneText(names[z % names.length], "Новая зона · сложность повышена");
}

function showZoneText(title, text) {
  let el = $("zoneBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "zoneBanner";
    el.className = "zoneBanner";
    el.innerHTML = "<b></b><span></span>";
    document.body.appendChild(el);
  }
  el.querySelector("b").textContent = title;
  el.querySelector("span").textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(showZoneText.timer);
  showZoneText.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------- ФОН ---------- */

function drawBackground(t) {
  const b = biome(state.score);
  const night = Math.floor(state.score / 30) % 2 === 1;
  const colors = {
    JUNGLE: night ? ["#06120e", "#102b22"] : ["#75b5c8", "#214c39"],
    SNOW: night ? ["#07111c", "#263d50"] : ["#a8d2e7", "#547a91"],
    CITY: night ? ["#050913", "#15283d"] : ["#6c94b1", "#233c4f"],
    NEON: ["#09051c", "#31135a"],
    VOLCANO: ["#160707", "#512016"],
    TEMPLE: ["#07100b", "#2d452a"],
    SKY: ["#78bce7", "#d6efff"],
    VOID: ["#020208", "#11111f"]
  }[b] || ["#111", "#222"];

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (b === "JUNGLE") {
    for (let i = 0; i < 18; i++) {
      const x = rnd(i * 9) * W;
      const y = H * .66 + rnd(i * 4) * 80;
      ctx.fillStyle = night ? "rgba(2,25,15,.8)" : "rgba(15,65,35,.65)";
      ctx.beginPath();
      ctx.ellipse(x, y, 45 + rnd(i) * 50, 150 + rnd(i + 2) * 100, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (b === "SNOW") {
    for (let i = 0; i < 10; i++) {
      const x = i * W / 9;
      ctx.fillStyle = night ? "rgba(100,140,165,.35)" : "rgba(245,250,255,.9)";
      ctx.beginPath();
      ctx.moveTo(x, H * .78);
      ctx.lineTo(x + W / 14, H * .25);
      ctx.lineTo(x + W / 7, H * .78);
      ctx.fill();
    }
    for (let i = 0; i < 120; i++) {
      const x = rnd(i * 3) * W;
      const y = (rnd(i * 5) * H + t * 20) % H;
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillRect(x, y, 2, 2);
    }
  } else if (b === "CITY" || b === "NEON") {
    for (let i = 0; i < 20; i++) {
      const x = rnd(i * 8) * W;
      const w = 35 + rnd(i * 2) * 90;
      const h = 150 + rnd(i * 3) * 380;
      ctx.fillStyle = b === "NEON" ? "rgba(15,8,40,.8)" : "rgba(22,45,62,.72)";
      ctx.fillRect(x, H - h, w, h);
      for (let y = H - h + 18; y < H; y += 26) {
        ctx.fillStyle = b === "NEON" ? "rgba(80,240,255,.45)" : "rgba(255,225,120,.35)";
        ctx.fillRect(x + 8, y, 6, 9);
      }
    }
  } else if (b === "VOLCANO") {
    ctx.fillStyle = "rgba(255,90,20,.18)";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(rnd(i * 4) * W, H * .75, 60 + rnd(i) * 80, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (b === "VOID") {
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = "rgba(210,230,255,.55)";
      ctx.fillRect(rnd(i * 2) * W, rnd(i * 5) * H, 1.5, 1.5);
    }
  }
}

function platformColor(p) {
  const b = biome(p.index);
  if (b === "JUNGLE") return ["#91b66a", "#253c29"];
  if (b === "SNOW") return ["#f3fbff", "#4d6878"];
  if (b === "CITY") return ["#aab5bd", "#28343e"];
  if (b === "NEON") return ["#7efff1", "#2b2871"];
  if (b === "VOLCANO") return ["#ff884e", "#35100c"];
  return ["#d4c68c", "#3b3520"];
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlatforms() {
  for (const p of platforms) {
    const y = p.y - state.cameraY;
    if (y < -30 || y > H + 30) continue;

    const [a, b] = platformColor(p);
    const g = ctx.createLinearGradient(0, y, 0, y + p.h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 15;
    ctx.fillStyle = g;
    roundRect(p.x, y, p.w, p.h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.35)";
    roundRect(p.x + 5, y + 2, p.w - 10, 3, 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBoss() {
  if (!state.boss) return;
  const b = state.boss;
  const y = b.y - state.cameraY;

  ctx.save();
  ctx.translate(b.x, y);
  ctx.shadowBlur = 28;
  ctx.shadowColor = "rgba(255,70,80,.5)";

  const g = ctx.createRadialGradient(0, 0, 5, 0, 0, 58);
  g.addColorStop(0, "#fff");
  g.addColorStop(.12, "#ff6b6b");
  g.addColorStop(.7, "#64232f");
  g.addColorStop(1, "#160b12");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#ffcf7a";
  ctx.lineWidth = 3;

  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 32, Math.sin(a) * 32);
    ctx.lineTo(Math.cos(a) * 70, Math.sin(a) * 70);
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-14, -8, 7, 0, Math.PI * 2);
  ctx.arc(14, -8, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(t) {
  const x = player.x + player.w / 2;
  const y = player.y - state.cameraY + player.h / 2;

  ctx.save();
  ctx.translate(x, y);

  /* Когда персонаж стоит — он неподвижен. Наклон только при движении. */
  if (!state.jetpack && Math.abs(player.vx) > 20) {
    ctx.rotate(Math.max(-.18, Math.min(.18, player.vx * .00045)));
  }

  if (state.jetpack) {
    ctx.fillStyle = "#303d47";
    roundRect(-24, -14, 48, 28, 9);
    ctx.fill();

    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i ? "#ffd86b" : "#ff6b36";
      ctx.beginPath();
      ctx.moveTo(-10 + i * 20, 13);
      ctx.lineTo(-3 + i * 20, 42 + Math.sin(t * 30 + i) * 6);
      ctx.lineTo(5 + i * 20, 13);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 37, 25, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#121922";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-9, 18); ctx.lineTo(-16, 33);
  ctx.moveTo(9, 18); ctx.lineTo(16, 33);
  ctx.stroke();

  const suit = ctx.createLinearGradient(-17, -20, 17, 23);
  suit.addColorStop(0, "#f0f6fa");
  suit.addColorStop(.35, "#465462");
  suit.addColorStop(1, "#10151c");
  ctx.fillStyle = suit;
  roundRect(-17, -20, 34, 44, 11);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 1;
  for (let i = -14; i <= 14; i += 7) {
    ctx.beginPath(); ctx.moveTo(i, -18); ctx.lineTo(i * .5, 19); ctx.stroke();
  }
  for (let q = -11; q <= 12; q += 7) {
    ctx.beginPath();
    ctx.arc(0, q, 15 - Math.abs(q) * .18, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "#17212a";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-14, -9); ctx.lineTo(-29, 5);
  ctx.moveTo(14, -9); ctx.lineTo(29, 5);
  ctx.stroke();

  ctx.fillStyle = "#101820";
  ctx.beginPath();
  ctx.arc(0, -29, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#edfaff";
  ctx.beginPath();
  ctx.ellipse(-5, -31, 5, 3, -.2, 0, Math.PI * 2);
  ctx.ellipse(5, -31, 5, 3, .2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle =
      p.type === "flame" ? "#ff9d38" :
      p.type === "web" ? "#dff7ff" :
      p.type === "impact" ? "#ffcf7a" : "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y - state.cameraY, p.type === "dust" ? 3 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render(t) {
  ctx.clearRect(0, 0, W, H);
  drawBackground(t);
  drawPlatforms();
  drawBoss();
  drawParticles();
  drawPlayer(t);
}

function loop(now) {
  if (!state.running) return;
  const dt = Math.min(.033, (now - state.last) / 1000 || .016);
  state.last = now;

  physics(dt);
  render(now / 1000);
  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  state.over = true;
  $("lifeOverlay")?.classList.add("hidden");
  $("gameOverOverlay")?.classList.remove("hidden");
  if ($("finalResult")) {
    $("finalResult").textContent =
      `Высота: ${state.score} платформ · Монеты: ${state.coins}`;
  }
  loadLeaderboard();
}

async function loadLeaderboard() {
  const box = $("leaderboard");
  if (!box) return;

  const d = window.SPIDER_CONFIG || {};
  if (!d.SUPABASE_URL || !d.SUPABASE_ANON_KEY) {
    box.innerHTML = "<div class='row'><span>•</span><span>Онлайн-таблица не настроена</span><span>README</span></div>";
    return;
  }

  try {
    const r = await fetch(
      `${d.SUPABASE_URL}/rest/v1/scores?select=name,score,created_at&order=score.desc&limit=10`,
      {
        headers: {
          apikey: d.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${d.SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!r.ok) throw new Error("leaderboard");

    const rows = await r.json();
    box.innerHTML = rows.length
      ? rows.map((x, i) =>
          `<div class="row"><span>${i + 1}</span><span>${escapeHtml(x.name)}</span><span class="pts">${x.score}</span></div>`
        ).join("")
      : "<div class='row'><span>•</span><span>Пока пусто</span><span></span></div>";
  } catch {
    box.innerHTML = "<div class='row'><span>!</span><span>Ошибка загрузки рейтинга</span><span></span></div>";
  }
}

async function submitScore() {
  const input = $("nameInput");
  const d = window.SPIDER_CONFIG || {};
  if (!input || !d.SUPABASE_URL || !d.SUPABASE_ANON_KEY) return;

  const name = (input.value.trim() || "Игрок").slice(0, 16);
  if ($("submitScore")) $("submitScore").disabled = true;

  try {
    const r = await fetch(`${d.SUPABASE_URL}/rest/v1/scores`, {
      method: "POST",
      headers: {
        apikey: d.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${d.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ name, score: state.score })
    });
    if (!r.ok) throw new Error("submit");
    await loadLeaderboard();
  } catch {
    alert("Не удалось сохранить результат.");
  } finally {
    if ($("submitScore")) $("submitScore").disabled = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

$("submitScore")?.addEventListener(
  "click",
  submitScore
);

/*
  Одна общая функция запуска.
  Поэтому "Сыграть ещё" запускает игру сразу,
  без возврата на стартовый экран.
*/
function startGame() {
  state.over = false;
  state.life = false;
  state.running = true;

  $("startOverlay")?.classList.add("hidden");
  $("gameOverOverlay")?.classList.add("hidden");
  $("lifeOverlay")?.classList.add("hidden");

  resetWorld();
  updateHud();

  render(performance.now() / 1000);

  state.last = performance.now();

  startMusic();
  updateMusicVolume();

  requestAnimationFrame(loop);
}

$("startBtn")?.addEventListener(
  "click",
  startGame
);

$("restartBtn")?.addEventListener(
  "click",
  startGame
);

/* Первичное состояние: персонаж стоит на платформе и НЕ прыгает сам. */
resetWorld();
updateHud();
render(0);
updateMusicVolume();

})();