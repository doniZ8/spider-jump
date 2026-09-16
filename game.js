(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const $ = id => document.getElementById(id);

let W = innerWidth;
let H = innerHeight;
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


/* =====================================================
   НАСТРОЙКИ
===================================================== */

const CFG = {
  gravity: 1850,
  move: 480,
  jump: -790,
  jump2: -740,
  gap: 96
};


/* =====================================================
   ПРОФИЛЬ
===================================================== */

const SAVE_KEY = "spiderJumpFinalSave";

let saved = {};

try {
  saved = JSON.parse(
    localStorage.getItem(SAVE_KEY) || "{}"
  );
} catch {
  saved = {};
}

const profile = {
  name: saved.name || "Игрок",
  best: saved.best || 0,
  totalCoins: saved.totalCoins || 0,
  bosses: saved.bosses || 0,
  streak: saved.streak || 0,
  lastDaily: saved.lastDaily || "",
  achievements: saved.achievements || {}
};


/* =====================================================
   СОСТОЯНИЕ ИГРЫ

   ВАЖНО:
   coins / lives / boosts — только текущий забег.
===================================================== */

const state = {
  running: false,
  over: false,
  life: false,
  last: 0,

  score: 0,

  coins: 0,
  lives: 0,

  jumps: 0,
  triple: false,

  jetpack: false,
  jetpackTargetY: null,

  magnet: false,
  shield: 0,

  slowTimer: 0,

  cameraY: 0,
  targetCameraY: 0,

  highestPlatform: 0,

  /*
    Используется для фона и биомов.
    Меняется В ПОЛЁТЕ.
  */
  visualScore: 0,
  worldStartY: 0,

  sound: saved.sound !== false,

  zone: 0,

  boss: null,
  bossHp: 0,
  bossMax: 0,

  /*
    Комбо:
    меняется только при успешном
    приземлении.
  */
  combo: 1,
  landedOnce: false,

  eventTimer: 0,
  weather: "clear",

  bossCount: profile.bosses || 0,

  runCoins: 0
};


/* =====================================================
   ПЕРСОНАЖ
===================================================== */

const player = {
  x: W / 2 - 23,
  y: 0,

  vx: 0,
  vy: 0,

  w: 46,
  h: 68,

  onGround: true
};


/* =====================================================
   МИР
===================================================== */

let platforms = [];
let particles = [];
let pickups = [];


/* =====================================================
   AUDIO
===================================================== */

let audioCtx = null;
let musicTimer = null;
let musicGain = null;
let musicStep = 0;


/* =====================================================
   УТИЛИТЫ
===================================================== */

function rnd(n) {
  const x =
    Math.sin(
      n * 12.9898 + 78.233
    ) * 43758.5453;

  return x - Math.floor(x);
}


/* =====================================================
   ВЫСОТА / БИОМ
===================================================== */

function getVisualScore() {
  const climbed =
    state.worldStartY
      ? Math.max(
          0,
          Math.floor(
            (state.worldStartY - player.y) /
            CFG.gap
          )
        )
      : 0;

  return Math.max(
    state.score,
    state.visualScore,
    climbed
  );
}


function difficulty() {
  return Math.floor(
    getVisualScore() / 100
  );
}


function biome(score) {
  if (score < 50) return "JUNGLE";
  if (score < 180) return "SNOW";
  if (score < 400) return "CITY";
  if (score < 1000) return "NEON";

  return [
    "NEON",
    "VOLCANO",
    "TEMPLE",
    "SKY",
    "VOID"
  ][
    Math.floor(score / 1000) % 5
  ];
}


function gapFor(index) {
  return Math.max(
    66,
    CFG.gap -
      difficulty() * 3
  );
}


function widthFor(index) {
  return Math.max(
    72,
    154 -
      difficulty() * 3 -
      rnd(index) * 35
  );
}


/* =====================================================
   СОХРАНЕНИЕ ПРОФИЛЯ
===================================================== */

function save() {
  /*
    Текущие монеты и бусты НЕ сохраняем.
    Сохраняем только профиль.
  */

  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      name: profile.name,
      best: Math.max(
        profile.best,
        state.score
      ),
      totalCoins:
        profile.totalCoins,
      bosses:
        state.bossCount,
      streak:
        profile.streak,
      lastDaily:
        profile.lastDaily,
      achievements:
        profile.achievements,
      sound:
        state.sound
    })
  );
}


/* =====================================================
   DAILY REWARD
===================================================== */

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}


function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}


function dailyReward() {
  const el = $("dailyReward");

  if (!el) return;

  const today = dayKey();

  if (profile.lastDaily === today) {
    el.innerHTML =
      `🎁 Награда получена · серия ${profile.streak} дней`;
  } else {
    el.innerHTML =
      `🎁 Ежедневная награда: <b>+10 🪙</b> · серия ${profile.streak || 0} дней`;
  }
}


function claimDaily() {
  const today = dayKey();

  if (profile.lastDaily === today) {
    return;
  }

  if (
    profile.lastDaily ===
    yesterdayKey()
  ) {
    profile.streak =
      (profile.streak || 0) + 1;
  } else {
    profile.streak = 1;
  }

  state.coins += 10;

  profile.totalCoins += 10;

  state.runCoins += 10;

  profile.lastDaily = today;

  toast(
    `🎁 +10 монет · серия ${profile.streak}`
  );

  save();
  dailyReward();
  updateHud();
}


/* =====================================================
   ЗВУКИ
===================================================== */

function sound(type) {
  if (!state.sound) return;

  try {
    audioCtx ||= new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    if (
      audioCtx.state ===
      "suspended"
    ) {
      audioCtx.resume();
    }

    const osc =
      audioCtx.createOscillator();

    const gain =
      audioCtx.createGain();

    osc.type =
      type === "hit"
        ? "sawtooth"
        : "sine";

    osc.frequency.value =
      type === "jump"
        ? 520
        : type === "coin"
        ? 880
        : type === "boss"
        ? 75
        : 180;

    gain.gain.setValueAtTime(
      0.035,
      audioCtx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime + 0.13
    );

    osc.connect(gain);
    gain.connect(
      audioCtx.destination
    );

    osc.start();

    osc.stop(
      audioCtx.currentTime + 0.13
    );

  } catch {}
}


/* =====================================================
   ТИХАЯ МУЗЫКА
===================================================== */

function startMusic() {
  try {
    audioCtx ||= new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    if (
      audioCtx.state ===
      "suspended"
    ) {
      audioCtx.resume();
    }

    if (musicTimer) {
      return;
    }

    musicGain =
      audioCtx.createGain();

    musicGain.gain.value =
      0.018;

    musicGain.connect(
      audioCtx.destination
    );

    const notes = [
      196,
      246.94,
      293.66,
      246.94,
      220,
      261.63,
      329.63,
      261.63
    ];

    const playNote = () => {
      if (
        !state.sound ||
        audioCtx.state !==
          "running"
      ) {
        return;
      }

      const osc =
        audioCtx.createOscillator();

      const gain =
        audioCtx.createGain();

      osc.type =
        "sine";

      osc.frequency.value =
        notes[
          musicStep %
          notes.length
        ];

      gain.gain.setValueAtTime(
        0.0001,
        audioCtx.currentTime
      );

      gain.gain.linearRampToValueAtTime(
        0.032,
        audioCtx.currentTime + 0.18
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioCtx.currentTime + 1.55
      );

      osc.connect(gain);
      gain.connect(
        musicGain
      );

      osc.start();

      osc.stop(
        audioCtx.currentTime + 1.6
      );

      musicStep++;
    };

    playNote();

    musicTimer =
      setInterval(
        playNote,
        1600
      );

  } catch {}
}


function updateMusicVolume() {
  if (musicGain) {
    musicGain.gain.value =
      state.sound
        ? 0.018
        : 0;
  }
}


/* =====================================================
   HUD
===================================================== */

function updateHud() {
  if ($("score"))
    $("score").textContent =
      state.score;

  if ($("coins"))
    $("coins").textContent =
      state.coins;

  if ($("lives"))
    $("lives").textContent =
      state.lives;

  if ($("combo"))
    $("combo").textContent =
      "x" + state.combo;

  if ($("biome"))
    $("biome").textContent =
      biome(
        getVisualScore()
      );

  if ($("soundBtn"))
    $("soundBtn").textContent =
      state.sound
        ? "🔊"
        : "🔇";

  if ($("jetpackBtn"))
    $("jetpackBtn").disabled =
      state.coins < 50 ||
      state.jetpack;

  if ($("tripleBtn"))
    $("tripleBtn").disabled =
      state.coins < 25 ||
      state.triple;

  if ($("lifeBtn"))
    $("lifeBtn").disabled =
      state.coins < 200;

  if ($("magnetBtn"))
    $("magnetBtn").disabled =
      state.coins < 75 ||
      state.magnet;

  if ($("shieldBtn"))
    $("shieldBtn").disabled =
      state.coins < 120 ||
      state.shield > 0;

  if ($("slowBtn"))
    $("slowBtn").disabled =
      state.coins < 90 ||
      state.slowTimer > 0;

  if ($("inventory")) {
    $("inventory").innerHTML =
      (state.triple
        ? '<span class="pill">✦ Тройной</span>'
        : "") +

      (state.lives
        ? `<span class="pill">❤ ${state.lives}</span>`
        : "") +

      (state.magnet
        ? '<span class="pill">🧲 Магнит</span>'
        : "") +

      (state.shield
        ? '<span class="pill">🛡️ Щит</span>'
        : "") +

      (state.slowTimer > 0
        ? `<span class="pill">⏳ ${Math.ceil(state.slowTimer)}s</span>`
        : "") +

      (state.jetpack
        ? '<span class="pill">🚀 Джетпак</span>'
        : "");
  }

  /*
    Полоса комбо теперь НЕ таймер.
    Она показывает только уровень x1...x10.
  */

  if ($("comboFill")) {
    $("comboFill").style.width =
      Math.min(
        100,
        state.combo * 10
      ) + "%";
  }

  if ($("comboText")) {
    $("comboText").textContent =
      `Комбо ×${state.combo}`;
  }
}


/* =====================================================
   TOAST
===================================================== */

function toast(text) {
  const el =
    $("eventToast");

  if (!el) return;

  el.textContent =
    text;

  el.classList.remove(
    "show"
  );

  void el.offsetWidth;

  el.classList.add(
    "show"
  );

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(
      () =>
        el.classList.remove(
          "show"
        ),
      2200
    );
}


/* =====================================================
   ДОСТИЖЕНИЯ
===================================================== */

const ACHIEVEMENTS = [
  ["first10","Первый шаг","10 платформ",10],
  ["high100","Высоко","100 платформ",100],
  ["high500","Профессионал","500 платформ",500],
  ["high1000","Выше облаков","1000 платформ",1000],
  ["high5000","Безумец","5000 платформ",5000],
  ["boss1","Охотник","Победить босса",1],
  ["coins500","Богач","500 монет",500],
  ["combo10","Комбо-машина","Комбо ×10",10]
];


function achievementProgress(id) {
  if (id.startsWith("high"))
    return state.score;

  if (id === "boss1")
    return state.bossCount;

  if (id === "coins500")
    return profile.totalCoins;

  if (id === "combo10")
    return state.combo;

  return 0;
}


function checkAchievements() {
  for (
    const [id,title,description,target]
    of ACHIEVEMENTS
  ) {

    if (
      profile.achievements[id]
    ) {
      continue;
    }

    if (
      achievementProgress(id) >=
      target
    ) {

      profile.achievements[id] =
        true;

      toast(
        `🏆 Достижение: ${title}`
      );

      sound("coin");
    }
  }

  save();
}


function renderAchievements() {
  if (!$("achievements"))
    return;

  $("achievements").innerHTML =
    ACHIEVEMENTS
      .map(
        ([id,title,description]) => `
          <div class="achievement ${
            profile.achievements[id]
              ? ""
              : "locked"
          }">
            <b>
              ${
                profile.achievements[id]
                  ? "🏆"
                  : "🔒"
              }
              ${title}
            </b>
            <span>
              ${description}
            </span>
          </div>
        `
      )
      .join("");
}


function updateProfileUI() {
  if ($("profileName"))
    $("profileName").textContent =
      profile.name;

  if ($("profileBest"))
    $("profileBest").textContent =
      profile.best;

  if ($("profileCoins"))
    $("profileCoins").textContent =
      profile.totalCoins;

  if ($("profileBosses"))
    $("profileBosses").textContent =
      state.bossCount;

  if ($("profileAchievements")) {

    const count =
      Object.values(
        profile.achievements
      ).filter(Boolean).length;

    $("profileAchievements")
      .textContent =
      `${count}/${ACHIEVEMENTS.length}`;
  }

  if ($("profileStreak"))
    $("profileStreak").textContent =
      profile.streak;

  renderAchievements();
}


/* =====================================================
   ПЛАТФОРМЫ
===================================================== */

function makePlatform(
  y,
  index,
  x = null
) {

  const width =
    widthFor(index);

  if (x == null) {
    x =
      30 +
      rnd(index * 7 + 1) *
      (
        W -
        width -
        60
      );
  }

  return {
    x: Math.max(
      20,
      Math.min(
        W - width - 20,
        x
      )
    ),
    y,
    w: width,
    h: 16,
    index
  };
}


/* =====================================================
   PICKUPS
   РЕДКИЕ МОНЕТЫ
===================================================== */

function createPickup(
  platform
) {

  if (
    platform.index <= 0
  ) {
    return;
  }

  /*
    Только примерно
    каждые 8 платформ.
  */

  if (
    platform.index % 8 !== 0 ||
    rnd(platform.index * 3) <= 0.55
  ) {
    return;
  }

  pickups.push({
    x:
      platform.x +
      platform.w / 2,

    y:
      platform.y -
      30,

    type:
      rnd(
        platform.index * 11
      ) > 0.90
        ? "chest"
        : "coin",

    taken: false
  });
}


/* =====================================================
   СБРОС МИРА
===================================================== */

function resetWorld() {

  platforms = [];
  particles = [];
  pickups = [];

  state.score = 0;
  state.visualScore = 0;

  state.highestPlatform = 0;

  state.cameraY = 0;
  state.targetCameraY = 0;

  state.zone = 0;

  state.boss = null;
  state.bossHp = 0;
  state.bossMax = 0;

  state.jetpack = false;
  state.jetpackTargetY = null;

  state.combo = 1;
  state.landedOnce = false;

  state.slowTimer = 0;
  state.eventTimer = 0;

  state.weather =
    "clear";

  state.runCoins = 0;

  /*
    ВАЖНО:
    Это стартовая
    вертикальная координата.
  */

  state.worldStartY =
    H - 118;


  const base =
    state.worldStartY;


  platforms.push(
    makePlatform(
      base,
      0,
      W / 2 - 75
    )
  );


  player.x =
    W / 2 -
    player.w / 2;

  player.y =
    base -
    player.h;

  player.vx = 0;
  player.vy = 0;

  player.onGround =
    true;

  state.jumps = 0;


  let y =
    base;


  for (
    let i = 1;
    i < 50;
    i++
  ) {

    y -=
      gapFor(i);

    const platform =
      makePlatform(
        y,
        i
      );

    platforms.push(
      platform
    );

    createPickup(
      platform
    );
  }
}


/* =====================================================
   РАСШИРЕНИЕ МИРА
===================================================== */

function extendWorld() {

  while (
    platforms.length <
    55
  ) {

    const previous =
      platforms[
        platforms.length - 1
      ];

    const index =
      previous.index + 1;

    const platform =
      makePlatform(
        previous.y -
        gapFor(index),
        index
      );

    platforms.push(
      platform
    );

    createPickup(
      platform
    );
  }


  while (
    platforms.length > 12 &&
    platforms[0].y >
      state.cameraY +
      H +
      320
  ) {

    platforms.shift();
  }


  pickups =
    pickups.filter(
      pickup =>
        !pickup.taken &&
        pickup.y <
          state.cameraY +
          H +
          360
    );
}


/* =====================================================
   PARTICLES
===================================================== */

function spawn(
  x,
  y,
  count = 8,
  type = "spark"
) {

  for (
    let i = 0;
    i < count;
    i++
  ) {

    const angle =
      rnd(
        (x + y + i) *
        0.13
      ) *
      Math.PI *
      2;

    const speed =
      40 +
      rnd(i * 7) * 160;

    particles.push({
      x,
      y,

      vx:
        Math.cos(angle) *
        speed,

      vy:
        Math.sin(angle) *
        speed -
        60,

      life:
        0.35 +
        rnd(i) * 0.4,

      max: 0.8,

      type
    });
  }
}


/* =====================================================
   JUMP
===================================================== */

function jump() {

  if (
    !state.running ||
    state.over ||
    state.life ||
    state.jetpack
  ) {
    return;
  }


  if (
    player.onGround
  ) {

    player.vy =
      CFG.jump;

    player.onGround =
      false;

    state.jumps = 1;

    spawn(
      player.x + 23,
      player.y + 60,
      5,
      "web"
    );

    sound("jump");

    return;
  }


  const maxJumps =
    state.triple
      ? 3
      : 2;


  if (
    state.jumps <
    maxJumps
  ) {

    player.vy =
      state.jumps === 1
        ? CFG.jump2
        : -700;

    state.jumps++;

    spawn(
      player.x + 23,
      player.y + 60,
      4,
      "web"
    );

    sound("jump");
  }
}


/* =====================================================
   КЛАВИАТУРА
   Работает с русской раскладкой.
===================================================== */

const keys = {
  left: false,
  right: false
};


addEventListener(
  "keydown",
  event => {

    const key =
      event.key.toLowerCase();

    const code =
      event.code;


    if (
      code === "KeyA" ||
      key === "a" ||
      key === "ф" ||
      key === "arrowleft"
    ) {

      keys.left = true;

      event.preventDefault();
    }


    if (
      code === "KeyD" ||
      key === "d" ||
      key === "в" ||
      key === "arrowright"
    ) {

      keys.right = true;

      event.preventDefault();
    }


    if (
      code === "KeyW" ||
      code === "Space" ||
      key === "w" ||
      key === "ц" ||
      key === " " ||
      key === "arrowup"
    ) {

      jump();

      event.preventDefault();
    }
  }
);


addEventListener(
  "keyup",
  event => {

    const key =
      event.key.toLowerCase();

    const code =
      event.code;


    if (
      code === "KeyA" ||
      key === "a" ||
      key === "ф" ||
      key === "arrowleft"
    ) {

      keys.left = false;
    }


    if (
      code === "KeyD" ||
      key === "d" ||
      key === "в" ||
      key === "arrowright"
    ) {

      keys.right = false;
    }
  }
);


/* =====================================================
   МОБИЛЬНОЕ УПРАВЛЕНИЕ
===================================================== */

let touchStartX = 0;
let touchStartY = 0;
let touchPointerId = null;
let touchMoved = false;


canvas.addEventListener(
  "pointerdown",
  event => {

    if (
      event.pointerType ===
      "touch"
    ) {

      touchPointerId =
        event.pointerId;

      touchStartX =
        event.clientX;

      touchStartY =
        event.clientY;

      touchMoved =
        false;

      canvas.setPointerCapture?.(
        event.pointerId
      );

      event.preventDefault();

      return;
    }


    if (
      event.button === 0
    ) {
      jump();
    }
  }
);


canvas.addEventListener(
  "pointermove",
  event => {

    if (
      event.pointerType !==
        "touch" ||
      event.pointerId !==
        touchPointerId
    ) {
      return;
    }


    const dx =
      event.clientX -
      touchStartX;


    if (
      Math.abs(dx) > 12
    ) {

      touchMoved =
        true;

      keys.left =
        dx < 0;

      keys.right =
        dx > 0;
    }


    event.preventDefault();
  }
);


function finishTouch(
  event
) {

  if (
    event.pointerType !==
      "touch" ||
    event.pointerId !==
      touchPointerId
  ) {
    return;
  }


  const dx =
    event.clientX -
    touchStartX;

  const dy =
    event.clientY -
    touchStartY;


  keys.left = false;
  keys.right = false;


  /*
    Короткий тап:
    прыжок.
  */

  if (
    !touchMoved &&
    Math.abs(dx) < 24 &&
    Math.abs(dy) < 24
  ) {
    jump();
  }


  touchPointerId =
    null;

  event.preventDefault();
}


canvas.addEventListener(
  "pointerup",
  finishTouch
);

canvas.addEventListener(
  "pointercancel",
  finishTouch
);


if ($("jumpBtn")) {
  $("jumpBtn").addEventListener(
    "pointerdown",
    event => {
      event.preventDefault();
      jump();
    }
  );
}


function bindButton(
  id,
  direction
) {

  const element =
    $(id);

  if (!element)
    return;


  element.addEventListener(
    "pointerdown",
    event => {
      event.preventDefault();
      keys[direction] =
        true;
    }
  );


  const stop =
    event => {
      event.preventDefault();
      keys[direction] =
        false;
    };


  element.addEventListener(
    "pointerup",
    stop
  );

  element.addEventListener(
    "pointercancel",
    stop
  );

  element.addEventListener(
    "pointerleave",
    stop
  );
}


bindButton(
  "leftBtn",
  "left"
);

bindButton(
  "rightBtn",
  "right"
);


/* =====================================================
   ПРИЗЕМЛЕНИЕ
===================================================== */

function land(previousY) {

  if (
    player.vy <= 0 ||
    state.jetpack
  ) {
    return;
  }


  const bottom =
    player.y +
    player.h;

  const previousBottom =
    previousY +
    player.h;


  for (
    const platform of
      platforms
  ) {

    if (
      bottom >=
        platform.y &&

      previousBottom <=
        platform.y &&

      player.x +
        player.w * 0.82 >
        platform.x &&

      player.x +
        player.w * 0.18 <
        platform.x +
        platform.w
    ) {

      /*
        Точная установка
        на поверхность.
      */

      player.y =
        platform.y -
        player.h;

      player.vy = 0;

      player.onGround =
        true;

      state.jumps = 0;


      /*
        =================================================
        КОМБО

        ВАЖНО:

        Первая посадка = x1.
        Следующая = x2.
        Потом x3...
        Максимум x10.

        Комбо НЕ МЕНЯЕТСЯ
        во время полёта.
        =================================================
      */

      if (
        !state.landedOnce
      ) {

        state.combo = 1;

        state.landedOnce =
          true;

      } else {

        state.combo =
          Math.min(
            10,
            state.combo + 1
          );
      }


      if (
        state.combo > 1
      ) {

        toast(
          `🔥 Комбо ×${state.combo}`
        );
      }


      spawn(
        player.x + 23,
        platform.y,
        8,
        "dust"
      );


      /*
        Счёт платформ.
      */

      if (
        platform.index >
        state.highestPlatform
      ) {

        const old =
          state.highestPlatform;

        state.highestPlatform =
          platform.index;

        state.score =
          platform.index;


        /*
          МОНОТЫ:
          1 монета за каждые 10 платформ.
          Комбо НЕ умножает монеты.
        */

        const before =
          Math.floor(
            old / 10
          );

        const after =
          Math.floor(
            platform.index /
            10
          );


        if (
          after > before
        ) {

          const gain =
            after - before;

          state.coins +=
            gain;

          profile.totalCoins +=
            gain;

          state.runCoins +=
            gain;

          sound("coin");
        }


        /*
          Сложность.
        */

        if (
          platform.index > 0 &&
          platform.index % 100 ===
            0
        ) {

          toast(
            `⚡ Сложность ${Math.floor(
              platform.index / 100
            )}`
          );
        }


        /*
          Босс каждые 500.
        */

        if (
          platform.index > 0 &&
          platform.index % 500 ===
            0 &&
          !state.boss
        ) {

          startBoss();
        }
      }


      checkPickups();
      checkAchievements();

      updateHud();
      save();

      break;
    }
  }
}


/* =====================================================
   MAGNET + PICKUPS
===================================================== */

function checkPickups() {

  for (
    const pickup of
      pickups
  ) {

    if (
      pickup.taken
    ) {
      continue;
    }


    const px =
      player.x +
      player.w / 2;

    const py =
      player.y +
      player.h / 2;


    let distance =
      Math.hypot(
        pickup.x - px,
        pickup.y - py
      );


    /*
      МАГНИТ:

      pickup -> player

      поэтому монета
      физически не может
      улететь от игрока.
    */

    if (
      state.magnet &&
      pickup.type ===
        "coin" &&
      distance < 240
    ) {

      const dx =
        px -
        pickup.x;

      const dy =
        py -
        pickup.y;

      const pull =
        Math.min(
          0.22,
          Math.max(
            0.06,
            0.18 *
              (
                1 -
                distance /
                  240
              )
          )
        );


      pickup.x +=
        dx *
        pull;

      pickup.y +=
        dy *
        pull;


      distance =
        Math.hypot(
          pickup.x - px,
          pickup.y - py
        );
    }


    if (
      distance < 34
    ) {

      pickup.taken =
        true;


      if (
        pickup.type ===
        "coin"
      ) {

        state.coins += 1;

        profile.totalCoins +=
          1;

        state.runCoins += 1;

        sound("coin");

      } else {

        /*
          Редкий сундук.
        */

        const bonus =
          10 +
          Math.floor(
            rnd(state.score) *
            21
          );

        state.coins +=
          bonus;

        profile.totalCoins +=
          bonus;

        state.runCoins +=
          bonus;

        toast(
          `🎁 Сундук +${bonus}`
        );

        sound("coin");
      }


      spawn(
        pickup.x,
        pickup.y,
        12,
        "spark"
      );
    }
  }
}


/* =====================================================
   PHYSICS
===================================================== */

function physics(
  dt
) {

  const previousY =
    player.y;


  /*
    Управление.
  */

  const direction =
    (
      keys.right
        ? 1
        : 0
    ) -
    (
      keys.left
        ? 1
        : 0
    );


  player.vx +=
    (
      direction *
      CFG.move -
      player.vx
    ) *
    Math.min(
      1,
      dt * 11
    );


  if (!direction) {
    player.vx *=
      Math.pow(
        0.0005,
        dt
      );
  }


  player.x +=
    player.vx * dt;


  if (
    player.x <
    -player.w * 0.5
  ) {

    player.x =
      W -
      player.w * 0.5;
  }


  if (
    player.x >
    W -
    player.w * 0.5
  ) {

    player.x =
      -player.w * 0.5;
  }


  if (
    state.slowTimer >
    0
  ) {

    state.slowTimer =
      Math.max(
        0,
        state.slowTimer -
        dt
      );
  }


  /*
    ===================================================
    ВАЖНО ДЛЯ ДЖЕТПАКА:

    visualScore обновляется
    КАЖДЫЙ КАДР.

    Поэтому фон меняется
    прямо во время полёта.
    ===================================================
  */

  state.visualScore =
    Math.max(
      state.visualScore,
      getVisualScore(),
      state.score
    );


  /*
    Определяем зону сразу
    в воздухе.
  */

  const liveZone =
    Math.floor(
      state.visualScore /
      1000
    );


  if (
    liveZone !==
    state.zone
  ) {

    state.zone =
      liveZone;

    showZone(
      liveZone
    );
  }


  /*
    ==============================================
    ДЖЕТПАК
    ==============================================
  */

  if (
    state.jetpack
  ) {

    player.onGround =
      false;

    player.vy =
      -1150;

    player.y +=
      player.vy *
      dt;


    /*
      Огонь джетпака.
    */

    if (
      Math.random() <
      0.8
    ) {

      spawn(
        player.x +
        player.w / 2,
        player.y +
        player.h,
        1,
        "flame"
      );
    }


    extendWorld();


    /*
      Обновляем HUD
      в воздухе.
    */

    updateHud();


    /*
      Джетпак закончился.
    */

    if (
      player.y <=
      state.jetpackTargetY
    ) {

      state.jetpack =
        false;

      state.jetpackTargetY =
        null;

      player.vy = 0;

      state.jumps = 0;

      spawn(
        player.x + 23,
        player.y +
        player.h,
        20,
        "flame"
      );

      sound("coin");

      save();
      updateHud();
    }


  } else {


    /*
      Обычная физика.
    */

    const gravity =
      state.slowTimer >
      0
        ? CFG.gravity * 0.72
        : CFG.gravity;


    player.vy +=
      gravity *
      dt;


    player.y +=
      player.vy *
      dt;


    player.onGround =
      false;


    /*
      Здесь НЕТ
      автоматического
      прыжка.
    */

    land(
      previousY
    );
  }


  /*
    Камера.
  */

  if (
    player.y <
    state.targetCameraY +
    H * 0.38
  ) {

    state.targetCameraY =
      player.y -
      H * 0.38;
  }


  state.cameraY +=
    (
      state.targetCameraY -
      state.cameraY
    ) *
    (
      1 -
      Math.pow(
        0.00015,
        dt
      )
    );


  updateParticles(dt);
  updateBoss(dt);
  extendWorld();

  tickEvents();


  /*
    Падение.
  */

  if (
    player.y -
    state.cameraY >
    H + 160
  ) {

    fail();
  }
}


/* =====================================================
   DEATH
===================================================== */

function fail() {

  /*
    Щит.
  */

  if (
    state.shield > 0
  ) {

    state.shield = 0;

    player.vy =
      -860;

    player.y -= 80;

    toast(
      "🛡️ Щит спас тебя!"
    );

    save();
    updateHud();

    return;
  }


  /*
    Дополнительная жизнь:
    продолжаем текущий
    забег.
  */

  if (
    state.lives > 0
  ) {

    state.life = true;

    state.running =
      false;

    $("lifeOverlay")
      ?.classList.remove(
        "hidden"
      );

    return;
  }


  endGame();
}


/* =====================================================
   CLEAR RUN
===================================================== */

function clearRunBonuses() {

  state.coins = 0;

  state.lives = 0;

  state.triple = false;

  state.jetpack = false;

  state.jetpackTargetY =
    null;

  state.magnet = false;

  state.shield = 0;

  state.slowTimer = 0;

  state.combo = 1;

  state.landedOnce =
    false;

  state.runCoins =
    0;
}


/* =====================================================
   CONTINUE LIFE
===================================================== */

function continueLife() {

  let safe =
    platforms
      .filter(
        platform =>
          platform.y >
          state.cameraY - 50 &&
          platform.y <
          state.cameraY +
          H * 0.85
      )
      .sort(
        (a,b) =>
          Math.abs(
            a.y -
            player.y
          ) -
          Math.abs(
            b.y -
            player.y
          )
      )[0];


  if (!safe) {
    safe =
      platforms[
        platforms.length - 1
      ];
  }


  player.x =
    safe.x +
    safe.w / 2 -
    player.w / 2;

  player.y =
    safe.y -
    player.h;

  player.vy = 0;

  player.onGround =
    true;

  state.jumps = 0;

  state.lives--;

  state.life = false;


  $("lifeOverlay")
    ?.classList.add(
      "hidden"
    );


  state.running = true;

  save();

  updateHud();

  state.last =
    performance.now();

  requestAnimationFrame(
    loop
  );
}


/* =====================================================
   SHOP
===================================================== */

function buy(type) {

  if (
    type === "jet" &&
    state.coins >= 50 &&
    !state.jetpack
  ) {

    state.coins -= 50;

    let target =
      player.y;

    let index =
      state.highestPlatform;


    for (
      let i = 0;
      i < 50;
      i++
    ) {

      index++;

      target -=
        gapFor(index);
    }


    state.jetpack = true;

    state.jetpackTargetY =
      target;

    state.jumps = 0;

    extendWorld();

    sound("boss");

    toast(
      "🚀 Джетпак активирован!"
    );
  }


  else if (
    type === "triple" &&
    state.coins >= 25 &&
    !state.triple
  ) {

    state.coins -= 25;

    state.triple = true;

    sound("coin");

    toast(
      "✦ Тройной прыжок!"
    );
  }


  else if (
    type === "life" &&
    state.coins >= 200
  ) {

    state.coins -= 200;

    state.lives++;

    sound("coin");

    toast(
      "❤ Дополнительная жизнь!"
    );
  }


  else if (
    type === "magnet" &&
    state.coins >= 75 &&
    !state.magnet
  ) {

    state.coins -= 75;

    state.magnet = true;

    sound("coin");

    toast(
      "🧲 Магнит активирован!"
    );
  }


  else if (
    type === "shield" &&
    state.coins >= 120 &&
    !state.shield
  ) {

    state.coins -= 120;

    state.shield = 1;

    sound("coin");

    toast(
      "🛡️ Щит готов!"
    );
  }


  else if (
    type === "slow" &&
    state.coins >= 90 &&
    state.slowTimer <= 0
  ) {

    state.coins -= 90;

    state.slowTimer = 12;

    sound("coin");

    toast(
      "⏳ Замедление!"
    );
  }


  save();

  updateHud();
}


$("jetpackBtn")?.addEventListener(
  "click",
  () => buy("jet")
);

$("tripleBtn")?.addEventListener(
  "click",
  () => buy("triple")
);

$("lifeBtn")?.addEventListener(
  "click",
  () => buy("life")
);

$("magnetBtn")?.addEventListener(
  "click",
  () => buy("magnet")
);

$("shieldBtn")?.addEventListener(
  "click",
  () => buy("shield")
);

$("slowBtn")?.addEventListener(
  "click",
  () => buy("slow")
);


/* =====================================================
   BOSS
===================================================== */

function startBoss() {

  state.boss = {
    x: W / 2,
    y:
      state.cameraY + 150,
    vx: 130,
    phase: 0
  };


  state.bossMax =
    100 +
    difficulty() * 8;

  state.bossHp =
    state.bossMax;


  let bar =
    document.getElementById(
      "bossbar"
    );


  if (!bar) {

    bar =
      document.createElement(
        "div"
      );

    bar.id =
      "bossbar";

    bar.className =
      "bossbar";

    bar.innerHTML =
      `
        <div class="name">
          GUARDIAN
        </div>

        <div class="track">
          <div class="fill"></div>
        </div>
      `;

    document.body.appendChild(
      bar
    );
  }


  bar.style.display =
    "block";


  showZoneText(
    "GUARDIAN",
    "Победи хранителя высоты"
  );


  sound("boss");
}


function updateBoss(
  dt
) {

  if (
    !state.boss
  ) {
    return;
  }


  const boss =
    state.boss;


  boss.phase += dt;

  boss.x +=
    boss.vx * dt;


  if (
    boss.x < 70 ||
    boss.x > W - 70
  ) {

    boss.vx *= -1;
  }


  boss.y =
    state.cameraY +
    145 +
    Math.sin(
      boss.phase * 2
    ) * 55;


  const px =
    player.x +
    player.w / 2;

  const py =
    player.y +
    player.h / 2;


  if (
    player.vy > 0 &&
    Math.abs(
      px -
      boss.x
    ) < 62 &&
    Math.abs(
      py -
      boss.y
    ) < 70
  ) {

    state.bossHp -= 22;

    player.vy = -880;

    spawn(
      boss.x,
      boss.y,
      18,
      "impact"
    );

    sound("boss");


    if (
      state.bossHp <= 0
    ) {

      spawn(
        boss.x,
        boss.y,
        40,
        "spark"
      );

      state.coins += 50;

      profile.totalCoins +=
        50;

      state.runCoins += 50;

      state.bossCount++;

      toast(
        "👑 Босс побеждён! +50"
      );

      state.boss =
        null;


      if (
        $("bossbar")
      ) {

        $("bossbar")
          .style.display =
          "none";
      }


      checkAchievements();

      save();

      updateProfileUI();
      updateHud();
    }
  }


  const fill =
    document.querySelector(
      "#bossbar .fill"
    );


  if (fill) {

    fill.style.width =
      Math.max(
        0,
        state.bossHp /
        state.bossMax *
        100
      ) + "%";
  }
}


/* =====================================================
   PARTICLES
===================================================== */

function updateParticles(dt) {

  for (
    const p of
      particles
  ) {

    p.x +=
      p.vx * dt;

    p.y +=
      p.vy * dt;

    p.vy +=
      420 * dt;

    p.life -= dt;
  }


  particles =
    particles.filter(
      p => p.life > 0
    );
}


/* =====================================================
   СЛУЧАЙНЫЕ СОБЫТИЯ
===================================================== */

function maybeEvent() {

  if (
    getVisualScore() < 20 ||
    state.eventTimer > 0
  ) {
    return;
  }


  state.eventTimer = 6;


  const r =
    rnd(
      getVisualScore() *
      17
    );


  if (
    r < 0.28
  ) {

    state.weather =
      "rain";

    toast(
      "🌧️ Дождь"
    );

  } else if (
    r < 0.5
  ) {

    state.weather =
      "snow";

    toast(
      "❄️ Снег"
    );

  } else if (
    r < 0.68
  ) {

    state.coins += 3;

    profile.totalCoins +=
      3;

    state.runCoins +=
      3;

    toast(
      "💰 +3 монеты"
    );

  } else if (
    r < 0.82
  ) {

    state.slowTimer = 6;

    toast(
      "⏳ Замедление"
    );

  } else {

    toast(
      "☄️ Метеоритный поток!"
    );
  }
}


function tickEvents() {

  if (
    state.eventTimer > 0
  ) {

    state.eventTimer =
      Math.max(
        0,
        state.eventTimer -
        1 / 60
      );

  } else {

    maybeEvent();
  }
}


/* =====================================================
   ЗОНЫ
===================================================== */

function showZone(number) {

  const names = [
    "JUNGLE",
    "SNOW",
    "CITY",
    "NEON",
    "VOLCANO",
    "TEMPLE",
    "SKY",
    "VOID"
  ];


  showZoneText(
    names[
      number %
      names.length
    ],
    "Новая зона · сложность повышена"
  );
}


function showZoneText(
  title,
  text
) {

  let el =
    $("zoneBanner");


  if (!el) {

    el =
      document.createElement(
        "div"
      );

    el.id =
      "zoneBanner";

    el.className =
      "zoneBanner";

    el.innerHTML =
      "<b></b><span></span>";

    document.body.appendChild(
      el
    );
  }


  el.querySelector(
    "b"
  ).textContent =
    title;


  el.querySelector(
    "span"
  ).textContent =
    text;


  el.classList.remove(
    "show"
  );


  void el.offsetWidth;


  el.classList.add(
    "show"
  );


  clearTimeout(
    showZoneText.timer
  );


  showZoneText.timer =
    setTimeout(
      () =>
        el.classList.remove(
          "show"
        ),
      2200
    );
}


/* =====================================================
   BACKGROUND
   ВАЖНО:
   используется getVisualScore()
===================================================== */

function drawBackground(
  time
) {

  const shownScore =
    getVisualScore();

  const type =
    biome(
      shownScore
    );

  const night =
    Math.floor(
      shownScore / 30
    ) % 2 === 1;


  const colors = {

    JUNGLE:
      night
        ? ["#06120e","#102b22"]
        : ["#75b5c8","#214c39"],

    SNOW:
      night
        ? ["#07111c","#263d50"]
        : ["#a8d2e7","#547a91"],

    CITY:
      night
        ? ["#050913","#15283d"]
        : ["#6c94b1","#233c4f"],

    NEON:
      ["#09051c","#31135a"],

    VOLCANO:
      ["#160707","#512016"],

    TEMPLE:
      ["#07100b","#2d452a"],

    SKY:
      ["#78bce7","#d6efff"],

    VOID:
      ["#020208","#11111f"]

  }[type];


  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      0,
      H
    );


  gradient.addColorStop(
    0,
    colors[0]
  );

  gradient.addColorStop(
    1,
    colors[1]
  );


  ctx.fillStyle =
    gradient;


  ctx.fillRect(
    0,
    0,
    W,
    H
  );


  /*
    JUNGLE
  */

  if (
    type === "JUNGLE"
  ) {

    for (
      let i = 0;
      i < 18;
      i++
    ) {

      const x =
        rnd(i * 9) *
        W;

      const y =
        H * 0.66 +
        rnd(i * 4) * 80;


      ctx.fillStyle =
        night
          ? "rgba(2,25,15,.8)"
          : "rgba(15,65,35,.65)";


      ctx.beginPath();


      ctx.ellipse(
        x,
        y,
        45 +
          rnd(i) * 50,
        150 +
          rnd(i + 2) * 100,
        0,
        0,
        Math.PI * 2
      );


      ctx.fill();
    }
  }


  /*
    SNOW
  */

  else if (
    type === "SNOW"
  ) {

    for (
      let i = 0;
      i < 10;
      i++
    ) {

      const x =
        i *
        W /
        9;


      ctx.fillStyle =
        night
          ? "rgba(100,140,165,.35)"
          : "rgba(245,250,255,.9)";


      ctx.beginPath();


      ctx.moveTo(
        x,
        H * 0.78
      );


      ctx.lineTo(
        x +
          W / 14,
        H * 0.25
      );


      ctx.lineTo(
        x +
          W / 7,
        H * 0.78
      );


      ctx.fill();
    }


    for (
      let i = 0;
      i < 120;
      i++
    ) {

      const x =
        rnd(i * 3) *
        W;


      const y =
        (
          rnd(i * 5) *
          H +
          time * 20
        ) % H;


      ctx.fillStyle =
        "rgba(255,255,255,.55)";


      ctx.fillRect(
        x,
        y,
        2,
        2
      );
    }
  }


  /*
    CITY / NEON
  */

  else if (
    type === "CITY" ||
    type === "NEON"
  ) {

    for (
      let i = 0;
      i < 20;
      i++
    ) {

      const x =
        rnd(i * 8) *
        W;

      const width =
        35 +
        rnd(i * 2) * 90;

      const height =
        150 +
        rnd(i * 3) * 380;


      ctx.fillStyle =
        type === "NEON"
          ? "rgba(15,8,40,.8)"
          : "rgba(22,45,62,.72)";


      ctx.fillRect(
        x,
        H - height,
        width,
        height
      );


      for (
        let y =
          H -
          height +
          18;

        y < H;

        y += 26
      ) {

        ctx.fillStyle =
          type === "NEON"
            ? "rgba(80,240,255,.45)"
            : "rgba(255,225,120,.35)";


        ctx.fillRect(
          x + 8,
          y,
          6,
          9
        );
      }
    }
  }


  /*
    VOLCANO
  */

  else if (
    type === "VOLCANO"
  ) {

    ctx.fillStyle =
      "rgba(255,90,20,.18)";


    for (
      let i = 0;
      i < 12;
      i++
    ) {

      ctx.beginPath();


      ctx.arc(
        rnd(i * 4) *
          W,
        H * 0.75,

        60 +
          rnd(i) * 80,

        0,
        Math.PI * 2
      );


      ctx.fill();
    }
  }


  /*
    TEMPLE
  */

  else if (
    type === "TEMPLE"
  ) {

    for (
      let i = 0;
      i < 10;
      i++
    ) {

      const x =
        i *
        W /
        9;


      ctx.fillStyle =
        "rgba(30,55,38,.65)";


      ctx.fillRect(
        x,
        H * 0.35 +
          rnd(i) * 70,
        42,
        H
      );
    }
  }


  /*
    SKY
  */

  else if (
    type === "SKY"
  ) {

    for (
      let i = 0;
      i < 9;
      i++
    ) {

      const x =
        rnd(i * 4) *
        W;

      const y =
        H * 0.2 +
        rnd(i * 5) *
        H *
        0.6;


      ctx.fillStyle =
        "rgba(255,255,255,.6)";


      ctx.beginPath();


      ctx.ellipse(
        x,
        y,
        70,
        18,
        0,
        0,
        Math.PI * 2
      );


      ctx.fill();
    }
  }


  /*
    VOID
  */

  else if (
    type === "VOID"
  ) {

    for (
      let i = 0;
      i < 160;
      i++
    ) {

      ctx.fillStyle =
        "rgba(210,230,255,.55)";


      ctx.fillRect(
        rnd(i * 2) * W,
        rnd(i * 5) * H,
        1.5,
        1.5
      );
    }
  }
}


/* =====================================================
   WEATHER
===================================================== */

function drawWeather(time) {

  if (
    state.weather ===
    "rain"
  ) {

    for (
      let i = 0;
      i < 120;
      i++
    ) {

      const x =
        rnd(i * 8) *
        W;

      const y =
        (
          rnd(i * 11) *
          H +
          time * 500
        ) % H;


      ctx.strokeStyle =
        "rgba(180,220,255,.28)";


      ctx.beginPath();


      ctx.moveTo(
        x,
        y
      );


      ctx.lineTo(
        x - 4,
        y + 12
      );


      ctx.stroke();
    }
  }


  if (
    state.weather ===
    "snow"
  ) {

    for (
      let i = 0;
      i < 90;
      i++
    ) {

      const x =
        rnd(i * 5) *
        W;

      const y =
        (
          rnd(i * 7) *
          H +
          time * 40
        ) % H;


      ctx.fillStyle =
        "rgba(255,255,255,.45)";


      ctx.fillRect(
        x,
        y,
        2,
        2
      );
    }
  }
}


/* =====================================================
   DRAW PLATFORMS
===================================================== */

function platformColor(
  platform
) {

  const type =
    biome(
      platform.index
    );


  if (
    type === "JUNGLE"
  ) {
    return [
      "#91b66a",
      "#253c29"
    ];
  }


  if (
    type === "SNOW"
  ) {
    return [
      "#f3fbff",
      "#4d6878"
    ];
  }


  if (
    type === "CITY"
  ) {
    return [
      "#aab5bd",
      "#28343e"
    ];
  }


  if (
    type === "NEON"
  ) {
    return [
      "#7efff1",
      "#2b2871"
    ];
  }


  if (
    type === "VOLCANO"
  ) {
    return [
      "#ff884e",
      "#35100c"
    ];
  }


  return [
    "#d4c68c",
    "#3b3520"
  ];
}


function roundRect(
  x,
  y,
  width,
  height,
  radius
) {

  ctx.beginPath();

  ctx.moveTo(
    x + radius,
    y
  );

  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    radius
  );

  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    radius
  );

  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    radius
  );

  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    radius
  );

  ctx.closePath();
}


function drawPlatforms() {

  for (
    const platform of
      platforms
  ) {

    const y =
      platform.y -
      state.cameraY;


    if (
      y < -30 ||
      y > H + 30
    ) {
      continue;
    }


    const colors =
      platformColor(
        platform
      );


    const gradient =
      ctx.createLinearGradient(
        0,
        y,
        0,
        y + platform.h
      );


    gradient.addColorStop(
      0,
      colors[0]
    );


    gradient.addColorStop(
      1,
      colors[1]
    );


    ctx.save();


    ctx.shadowColor =
      "rgba(0,0,0,.45)";


    ctx.shadowBlur =
      15;


    ctx.fillStyle =
      gradient;


    roundRect(
      platform.x,
      y,
      platform.w,
      platform.h,
      7
    );


    ctx.fill();


    ctx.shadowBlur = 0;


    ctx.fillStyle =
      "rgba(255,255,255,.35)";


    roundRect(
      platform.x + 5,
      y + 2,
      platform.w - 10,
      3,
      2
    );


    ctx.fill();


    ctx.restore();
  }
}


/* =====================================================
   PICKUPS
===================================================== */

function drawPickups(
  time
) {

  for (
    const pickup of
      pickups
  ) {

    if (
      pickup.taken
    ) {
      continue;
    }


    const y =
      pickup.y -
      state.cameraY;


    if (
      y < -50 ||
      y > H + 50
    ) {
      continue;
    }


    if (
      pickup.type ===
      "coin"
    ) {

      ctx.save();


      ctx.translate(
        pickup.x,
        y
      );


      ctx.rotate(
        Math.sin(
          time * 3 +
          pickup.x
        ) *
        0.08
      );


      const gradient =
        ctx.createRadialGradient(
          -4,
          -5,
          2,
          0,
          0,
          12
        );


      gradient.addColorStop(
        0,
        "#fff5aa"
      );


      gradient.addColorStop(
        .35,
        "#ffd84e"
      );


      gradient.addColorStop(
        1,
        "#b56b0c"
      );


      ctx.fillStyle =
        gradient;


      ctx.beginPath();

      ctx.arc(
        0,
        0,
        11,
        0,
        Math.PI * 2
      );

      ctx.fill();


      ctx.strokeStyle =
        "#fff1a0";

      ctx.lineWidth = 2;

      ctx.stroke();

      ctx.restore();

    } else {

      ctx.save();

      ctx.translate(
        pickup.x,
        y
      );

      ctx.fillStyle =
        "#8f5c28";

      ctx.fillRect(
        -14,
        -11,
        28,
        22
      );

      ctx.strokeStyle =
        "#ffd45c";

      ctx.lineWidth = 3;

      ctx.strokeRect(
        -14,
        -11,
        28,
        22
      );

      ctx.fillStyle =
        "#ffd45c";

      ctx.fillRect(
        -3,
        -4,
        6,
        8
      );

      ctx.restore();
    }
  }
}


/* =====================================================
   BOSS
===================================================== */

function drawBoss() {

  if (!state.boss)
    return;

  const boss =
    state.boss;

  const y =
    boss.y -
    state.cameraY;


  ctx.save();

  ctx.translate(
    boss.x,
    y
  );


  ctx.shadowBlur =
    28;

  ctx.shadowColor =
    "rgba(255,70,80,.5)";


  const gradient =
    ctx.createRadialGradient(
      0,
      0,
      5,
      0,
      0,
      58
    );


  gradient.addColorStop(
    0,
    "#fff"
  );

  gradient.addColorStop(
    .12,
    "#ff6b6b"
  );

  gradient.addColorStop(
    .7,
    "#64232f"
  );

  gradient.addColorStop(
    1,
    "#160b12"
  );


  ctx.fillStyle =
    gradient;


  ctx.beginPath();

  ctx.arc(
    0,
    0,
    48,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.shadowBlur = 0;

  ctx.strokeStyle =
    "#ffcf7a";

  ctx.lineWidth = 3;


  for (
    let i = 0;
    i < 8;
    i++
  ) {

    const angle =
      i *
      Math.PI /
      4;


    ctx.beginPath();

    ctx.moveTo(
      Math.cos(angle) *
      32,
      Math.sin(angle) *
      32
    );

    ctx.lineTo(
      Math.cos(angle) *
      70,
      Math.sin(angle) *
      70
    );

    ctx.stroke();
  }


  ctx.fillStyle =
    "#fff";


  ctx.beginPath();

  ctx.arc(
    -14,
    -8,
    7,
    0,
    Math.PI * 2
  );

  ctx.arc(
    14,
    -8,
    7,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();
}


/* =====================================================
   PLAYER
===================================================== */

function drawPlayer(
  time
) {

  const x =
    player.x +
    player.w / 2;

  const y =
    player.y -
    state.cameraY +
    player.h / 2;


  ctx.save();


  ctx.translate(
    x,
    y
  );


  if (
    Math.abs(player.vx) >
      20 &&
    !state.jetpack
  ) {

    ctx.rotate(
      Math.max(
        -.18,
        Math.min(
          .18,
          player.vx *
          .00045
        )
      )
    );
  }


  /*
    Джетпак.
  */

  if (
    state.jetpack
  ) {

    ctx.fillStyle =
      "#303d47";


    roundRect(
      -24,
      -14,
      48,
      28,
      9
    );


    ctx.fill();


    for (
      let i = 0;
      i < 2;
      i++
    ) {

      ctx.fillStyle =
        i
          ? "#ffd86b"
          : "#ff6b36";


      ctx.beginPath();


      ctx.moveTo(
        -10 + i * 20,
        13
      );


      ctx.lineTo(
        -3 + i * 20,
        42 +
          Math.sin(
            time * 30 + i
          ) *
          6
      );


      ctx.lineTo(
        5 + i * 20,
        13
      );


      ctx.fill();
    }
  }


  /*
    Тень.
  */

  ctx.fillStyle =
    "rgba(0,0,0,.28)";


  ctx.beginPath();


  ctx.ellipse(
    0,
    37,
    25,
    6,
    0,
    0,
    Math.PI * 2
  );


  ctx.fill();


  /*
    Ноги.
  */

  ctx.strokeStyle =
    "#121922";

  ctx.lineWidth = 8;

  ctx.lineCap =
    "round";

  ctx.beginPath();

  ctx.moveTo(
    -9,
    18
  );

  ctx.lineTo(
    -16,
    33
  );

  ctx.moveTo(
    9,
    18
  );

  ctx.lineTo(
    16,
    33
  );

  ctx.stroke();


  /*
    Тело.
  */

  const suit =
    ctx.createLinearGradient(
      -17,
      -20,
      17,
      23
    );


  suit.addColorStop(
    0,
    "#f0f6fa"
  );

  suit.addColorStop(
    .35,
    "#465462"
  );

  suit.addColorStop(
    1,
    "#10151c"
  );


  ctx.fillStyle =
    suit;


  roundRect(
    -17,
    -20,
    34,
    44,
    11
  );


  ctx.fill();


  /*
    Текстура.
  */

  ctx.strokeStyle =
    "rgba(255,255,255,.25)";

  ctx.lineWidth = 1;


  for (
    let i = -14;
    i <= 14;
    i += 7
  ) {

    ctx.beginPath();

    ctx.moveTo(
      i,
      -18
    );

    ctx.lineTo(
      i * .5,
      19
    );

    ctx.stroke();
  }


  /*
    Руки.
  */

  ctx.strokeStyle =
    "#17212a";

  ctx.lineWidth = 8;


  ctx.beginPath();

  ctx.moveTo(
    -14,
    -9
  );

  ctx.lineTo(
    -29,
    5
  );

  ctx.moveTo(
    14,
    -9
  );

  ctx.lineTo(
    29,
    5
  );

  ctx.stroke();


  /*
    Голова.
  */

  ctx.fillStyle =
    "#101820";


  ctx.beginPath();

  ctx.arc(
    0,
    -29,
    15,
    0,
    Math.PI * 2
  );

  ctx.fill();


  /*
    Глаза.
  */

  ctx.fillStyle =
    "#edfaff";


  ctx.beginPath();

  ctx.ellipse(
    -5,
    -31,
    5,
    3,
    -.2,
    0,
    Math.PI * 2
  );

  ctx.ellipse(
    5,
    -31,
    5,
    3,
    .2,
    0,
    Math.PI * 2
  );

  ctx.fill();


  ctx.restore();
}


/* =====================================================
   PARTICLES
===================================================== */

function drawParticles() {

  for (
    const particle of
      particles
  ) {

    ctx.globalAlpha =
      Math.max(
        0,
        particle.life /
        particle.max
      );


    ctx.fillStyle =
      particle.type ===
      "flame"
        ? "#ff9d38"
        : particle.type ===
          "web"
        ? "#dff7ff"
        : particle.type ===
          "impact"
        ? "#ffcf7a"
        : "#fff";


    ctx.beginPath();


    ctx.arc(
      particle.x,
      particle.y -
        state.cameraY,

      particle.type ===
      "dust"
        ? 3
        : 2.5,

      0,
      Math.PI * 2
    );


    ctx.fill();
  }


  ctx.globalAlpha = 1;
}


/* =====================================================
   РЕНДЕР
===================================================== */

function render(time) {

  ctx.clearRect(
    0,
    0,
    W,
    H
  );


  drawBackground(
    time
  );

  drawWeather(
    time
  );

  drawPlatforms();

  drawPickups(
    time
  );

  drawBoss();

  drawParticles();

  drawPlayer(
    time
  );
}


/* =====================================================
   GAME LOOP
===================================================== */

function loop(now) {

  if (
    !state.running
  ) {
    return;
  }


  const dt =
    Math.min(
      .033,
      (now -
        state.last) /
        1000 ||
        .016
    );


  state.last =
    now;


  physics(dt);

  render(
    now / 1000
  );


  requestAnimationFrame(
    loop
  );
}


/* =====================================================
   ПОРАЖЕНИЕ
===================================================== */

function fail() {

  /*
    Щит.
  */

  if (
    state.shield > 0
  ) {

    state.shield = 0;

    player.vy =
      -860;

    player.y -=
      80;

    toast(
      "🛡️ Щит спас!"
    );

    save();
    updateHud();

    return;
  }


  /*
    Дополнительная жизнь.
    Здесь НЕ сбрасываем
    бусты.
  */

  if (
    state.lives > 0
  ) {

    state.life = true;

    state.running =
      false;

    $("lifeOverlay")
      ?.classList.remove(
        "hidden"
      );

    return;
  }


  /*
    Финальная смерть.
  */

  endGame();
}


/* =====================================================
   СБРОС ПОСЛЕ СМЕРТИ
===================================================== */

function clearRunBonuses() {

  state.coins = 0;
  state.lives = 0;

  state.triple = false;

  state.jetpack = false;
  state.jetpackTargetY =
    null;

  state.magnet = false;

  state.shield = 0;

  state.slowTimer = 0;

  state.combo = 1;

  state.landedOnce =
    false;

  state.runCoins = 0;
}


/* =====================================================
   CONTINUE LIFE
===================================================== */

function continueLife() {

  let safe =
    platforms
      .filter(
        p =>
          p.y >
          state.cameraY - 50 &&
          p.y <
          state.cameraY +
          H * .85
      )
      .sort(
        (a,b) =>
          Math.abs(
            a.y -
            player.y
          ) -
          Math.abs(
            b.y -
            player.y
          )
      )[0];


  if (!safe) {
    safe =
      platforms[
        platforms.length - 1
      ];
  }


  player.x =
    safe.x +
    safe.w / 2 -
    player.w / 2;

  player.y =
    safe.y -
    player.h;

  player.vy = 0;

  player.onGround =
    true;

  state.jumps = 0;

  state.lives--;

  state.life = false;


  $("lifeOverlay")
    ?.classList.add(
      "hidden"
    );


  state.running = true;

  save();
  updateHud();

  state.last =
    performance.now();

  requestAnimationFrame(
    loop
  );
}


/* =====================================================
   SHOP
===================================================== */

function buy(type) {

  if (
    type === "jet" &&
    state.coins >= 50 &&
    !state.jetpack
  ) {

    state.coins -= 50;

    let target =
      player.y;

    let index =
      state.highestPlatform;


    for (
      let i = 0;
      i < 50;
      i++
    ) {

      index++;

      target -=
        gapFor(index);
    }


    state.jetpack =
      true;

    state.jetpackTargetY =
      target;

    state.jumps = 0;

    extendWorld();

    toast(
      "🚀 Джетпак!"
    );

    sound("boss");
  }


  else if (
    type === "triple" &&
    state.coins >= 25 &&
    !state.triple
  ) {

    state.coins -= 25;

    state.triple =
      true;

    toast(
      "✦ Тройной прыжок!"
    );

    sound("coin");
  }


  else if (
    type === "life" &&
    state.coins >= 200
  ) {

    state.coins -= 200;

    state.lives++;

    toast(
      "❤ Дополнительная жизнь!"
    );

    sound("coin");
  }


  else if (
    type === "magnet" &&
    state.coins >= 75 &&
    !state.magnet
  ) {

    state.coins -= 75;

    state.magnet = true;

    toast(
      "🧲 Магнит активирован!"
    );

    sound("coin");
  }


  else if (
    type === "shield" &&
    state.coins >= 120 &&
    state.shield === 0
  ) {

    state.coins -= 120;

    state.shield = 1;

    toast(
      "🛡️ Щит готов!"
    );

    sound("coin");
  }


  else if (
    type === "slow" &&
    state.coins >= 90 &&
    state.slowTimer <= 0
  ) {

    state.coins -= 90;

    state.slowTimer = 12;

    toast(
      "⏳ Замедление!"
    );

    sound("coin");
  }


  updateHud();
}


$("jetpackBtn")?.addEventListener(
  "click",
  () => buy("jet")
);

$("tripleBtn")?.addEventListener(
  "click",
  () => buy("triple")
);

$("lifeBtn")?.addEventListener(
  "click",
  () => buy("life")
);

$("magnetBtn")?.addEventListener(
  "click",
  () => buy("magnet")
);

$("shieldBtn")?.addEventListener(
  "click",
  () => buy("shield")
);

$("slowBtn")?.addEventListener(
  "click",
  () => buy("slow")
);


/* =====================================================
   БOSS
===================================================== */

function startBoss() {

  state.boss = {
    x: W / 2,
    y:
      state.cameraY +
      150,
    vx: 130,
    phase: 0
  };


  state.bossMax =
    100 +
    difficulty() * 8;

  state.bossHp =
    state.bossMax;


  let bar =
    document.getElementById(
      "bossbar"
    );


  if (!bar) {

    bar =
      document.createElement(
        "div"
      );

    bar.id =
      "bossbar";

    bar.className =
      "bossbar";

    bar.innerHTML =
      `
        <div class="name">
          GUARDIAN
        </div>

        <div class="track">
          <div class="fill"></div>
        </div>
      `;


    document.body.appendChild(
      bar
    );
  }


  bar.style.display =
    "block";


  showZoneText(
    "GUARDIAN",
    "Победи хранителя высоты"
  );


  sound("boss");
}


function updateBoss(dt) {

  if (
    !state.boss
  ) {
    return;
  }


  const boss =
    state.boss;


  boss.phase += dt;

  boss.x +=
    boss.vx * dt;


  if (
    boss.x < 70 ||
    boss.x >
      W - 70
  ) {

    boss.vx *= -1;
  }


  boss.y =
    state.cameraY +
    145 +
    Math.sin(
      boss.phase * 2
    ) *
    55;


  const px =
    player.x +
    player.w / 2;

  const py =
    player.y +
    player.h / 2;


  if (
    player.vy > 0 &&
    Math.abs(
      px -
      boss.x
    ) < 62 &&
    Math.abs(
      py -
      boss.y
    ) < 70
  ) {

    state.bossHp -= 22;

    player.vy =
      -880;

    spawn(
      boss.x,
      boss.y,
      18,
      "impact"
    );

    sound("boss");


    if (
      state.bossHp <=
      0
    ) {

      spawn(
        boss.x,
        boss.y,
        40,
        "spark"
      );

      state.coins += 50;

      profile.totalCoins +=
        50;

      state.runCoins +=
        50;

      state.bossCount++;

      toast(
        "👑 Босс побеждён! +50"
      );


      state.boss =
        null;


      if (
        $("bossbar")
      ) {

        $("bossbar")
          .style.display =
          "none";
      }


      checkAchievements();

      save();

      updateProfileUI();

      updateHud();
    }
  }


  const fill =
    document.querySelector(
      "#bossbar .fill"
    );


  if (fill) {

    fill.style.width =
      Math.max(
        0,
        state.bossHp /
        state.bossMax *
        100
      ) + "%";
  }
}


/* =====================================================
   PROFILE
===================================================== */

function updateProfile() {
  updateProfileUI();
}


/* =====================================================
   LEADERBOARD
   SUPABASE
===================================================== */

let currentPeriod = "all";


function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    c => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[c])
  );
}


async function loadLeaderboard(
  period = "all"
) {

  currentPeriod =
    period;


  const box =
    $("leaderboard");


  if (!box) {
    return;
  }


  const config =
    window.SPIDER_CONFIG ||
    {};


  if (
    !config.SUPABASE_URL ||
    !config.SUPABASE_ANON_KEY
  ) {

    box.innerHTML =
      `
        <div class="row">
          <span>!</span>
          <span>
            Supabase не настроен
          </span>
          <span>config.js</span>
        </div>
      `;

    return;
  }


  let url =
    `${config.SUPABASE_URL}/rest/v1/scores` +
    `?select=name,score,created_at` +
    `&order=score.desc` +
    `&limit=10`;


  if (
    period === "today"
  ) {

    const today =
      new Date()
        .toISOString()
        .slice(0,10);

    url +=
      `&created_at=gte.${today}T00:00:00.000Z`;
  }


  if (
    period === "week"
  ) {

    const date =
      new Date();

    date.setDate(
      date.getDate() - 7
    );


    url +=
      `&created_at=gte.${date.toISOString()}`;
  }


  try {

    const response =
      await fetch(
        url,
        {
          headers: {
            /*
              Для нового
              sb_publishable_...
              используем только apikey.
            */
            apikey:
              config.SUPABASE_ANON_KEY
          }
        }
      );


    if (
      !response.ok
    ) {

      const message =
        await response.text();

      throw new Error(
        `HTTP ${response.status}: ${message.slice(0,150)}`
      );
    }


    const rows =
      await response.json();


    if (!rows.length) {

      box.innerHTML =
        `
          <div class="row">
            <span>•</span>
            <span>
              Пока нет результатов
            </span>
            <span></span>
          </div>
        `;

      return;
    }


    box.innerHTML =
      rows
        .map(
          (row,index) => `
            <div class="row">
              <span>
                ${index + 1}
              </span>

              <span>
                ${escapeHtml(
                  row.name
                )}
              </span>

              <span class="pts">
                ${row.score}
              </span>
            </div>
          `
        )
        .join("");


  } catch (error) {

    console.error(
      "Supabase leaderboard:",
      error
    );


    box.innerHTML =
      `
        <div class="row">
          <span>!</span>

          <span>
            ${escapeHtml(
              error.message
            )}
          </span>

          <span></span>
        </div>
      `;
  }
}


/* =====================================================
   SUBMIT SCORE
===================================================== */

async function submitScore() {

  const input =
    $("nameInput");

  const config =
    window.SPIDER_CONFIG ||
    {};


  if (
    !input ||
    !config.SUPABASE_URL ||
    !config.SUPABASE_ANON_KEY
  ) {

    return;
  }


  const name =
    (
      input.value.trim() ||
      profile.name ||
      "Игрок"
    ).slice(
      0,
      16
    );


  profile.name =
    name;


  $("submitScore").disabled =
    true;


  try {

    const response =
      await fetch(
        `${config.SUPABASE_URL}/rest/v1/scores`,
        {

          method:
            "POST",

          headers: {

            /*
              Только apikey.
              Это важно для
              sb_publishable_...
            */

            apikey:
              config.SUPABASE_ANON_KEY,

            "Content-Type":
              "application/json",

            Prefer:
              "return=minimal"
          },

          body:
            JSON.stringify({
              name,
              score:
                state.score
            })
        }
      );


    if (
      !response.ok
    ) {

      const message =
        await response.text();

      throw new Error(
        `HTTP ${response.status}: ${message.slice(0,200)}`
      );
    }


    await loadLeaderboard(
      currentPeriod
    );


  } catch (error) {

    console.error(
      "Supabase submit:",
      error
    );


    alert(
      "Ошибка сохранения результата:\n\n" +
      error.message
    );


  } finally {

    $("submitScore").disabled =
      false;

    save();
  }
}


$("submitScore")?.addEventListener(
  "click",
  submitScore
);


/* =====================================================
   ТАБЫ РЕЙТИНГА
===================================================== */

document
  .querySelectorAll(
    ".tab"
  )
  .forEach(
    tab => {

      tab.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".tab"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );


          tab.classList.add(
            "active"
          );


          loadLeaderboard(
            tab.dataset.period
          );
        }
      );
    }
  );


/* =====================================================
   PROFILE BUTTONS
===================================================== */

$("profileBtn")
  ?.addEventListener(
    "click",
    () => {

      $("profileOverlay")
        ?.classList.remove(
          "hidden"
        );

      updateProfileUI();
    }
  );


$("closeProfile")
  ?.addEventListener(
    "click",
    () => {

      $("profileOverlay")
        ?.classList.add(
          "hidden"
        );
    }
  );


$("soundBtn")
  ?.addEventListener(
    "click",
    () => {

      state.sound =
        !state.sound;

      updateMusicVolume();

      save();

      updateHud();
    }
  );


/* =====================================================
   END GAME
===================================================== */

function endGame() {

  state.running =
    false;

  state.over =
    true;


  $("lifeOverlay")
    ?.classList.add(
      "hidden"
    );


  $("gameOverOverlay")
    ?.classList.remove(
      "hidden"
    );


  profile.best =
    Math.max(
      profile.best,
      state.score
    );


  if (
    $("finalResult")
  ) {

    $("finalResult")
      .textContent =
      `Высота: ${state.score} платформ · Монет: ${state.runCoins}`;
  }


  /*
    После смерти:
    всё текущего забега
    обнуляется.
  */

  clearRunBonuses();


  updateHud();

  updateProfileUI();

  save();

  loadLeaderboard(
    currentPeriod
  );
}


/* =====================================================
   START GAME
===================================================== */

function startGame() {

  state.running =
    true;

  state.over =
    false;

  state.life =
    false;


  /*
    Каждый новый забег
    начинается с нуля.
  */

  clearRunBonuses();


  $("startOverlay")
    ?.classList.add(
      "hidden"
    );


  $("gameOverOverlay")
    ?.classList.add(
      "hidden"
    );


  $("lifeOverlay")
    ?.classList.add(
      "hidden"
    );


  resetWorld();


  updateHud();


  render(
    performance.now() /
    1000
  );


  state.last =
    performance.now();


  startMusic();

  updateMusicVolume();


  requestAnimationFrame(
    loop
  );
}


$("startBtn")
  ?.addEventListener(
    "click",
    startGame
);


/*
  Сыграть ещё =
  сразу новая игра.
*/

$("restartBtn")
  ?.addEventListener(
    "click",
    startGame
);


$("continueBtn")
  ?.addEventListener(
    "click",
    continueLife
);


$("endLifeBtn")
  ?.addEventListener(
    "click",
    endGame
);


/* =====================================================
   INIT
===================================================== */

function init() {

  dailyReward();


  /*
    Ежедневная награда.
  */

  if (
    profile.lastDaily !==
    dayKey()
  ) {

    claimDaily();
  }


  resetWorld();

  updateHud();

  updateProfileUI();

  render(0);
}


init();


/* =====================================================
   LOOP СЛУЧАЙНЫХ СОБЫТИЙ
===================================================== */

setInterval(
  () => {

    tickEvents();

    updateHud();

  },
  1000 / 60
);


/* =====================================================
   RESUME AUDIO
===================================================== */

addEventListener(
  "pointerdown",
  () => {

    if (
      audioCtx &&
      audioCtx.state ===
      "suspended"
    ) {

      audioCtx.resume();
    }
  }
);

})();