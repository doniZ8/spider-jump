(() => {
"use strict";

/* =========================================================
   ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ
========================================================= */

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


/* =========================================================
   НАСТРОЙКИ
========================================================= */

const CFG = {
  gravity: 1850,
  move: 480,
  jump: -790,
  jump2: -740,
  gap: 96
};


/* =========================================================
   СОХРАНЕНИЕ ПРОФИЛЯ
   ВАЖНО: монеты и бусты текущего забега НЕ сохраняются.
========================================================= */

const SAVE_KEY = "spiderJumpSaveV4";

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


/* =========================================================
   СОСТОЯНИЕ ИГРЫ
========================================================= */

const state = {
  running: false,
  over: false,
  life: false,
  last: 0,

  score: 0,

  /*
    Монеты и бусты только текущего забега.
    После окончательной смерти они обнуляются.
  */
  coins: 0,
  lives: 0,
  triple: false,
  jetpack: false,
  magnet: false,
  shield: 0,
  slowTimer: 0,

  jumps: 0,

  jetpackTargetY: null,

  cameraY: 0,
  targetCameraY: 0,

  highestPlatform: 0,

  /*
    visualScore — текущая высота игрока.
    Именно она используется для фона,
    биома и смены зон ВО ВРЕМЯ ПОЛЁТА.
  */
  visualScore: 0,
  worldStartY: 0,

  sound: saved.sound !== false,

  zone: 0,

  boss: null,
  bossHp: 0,
  bossMax: 0,

  combo: 1,

  /*
    Комбо обновляется при приземлении.
  */
  comboWindow: 0,

  eventTimer: 0,
  weather: "clear",

  bossCount: profile.bosses || 0,

  runCoins: 0
};


/* =========================================================
   ПЕРСОНАЖ
========================================================= */

const player = {
  x: W / 2 - 23,
  y: 0,

  vx: 0,
  vy: 0,

  w: 46,
  h: 68,

  onGround: true
};


/* =========================================================
   МИР
========================================================= */

let platforms = [];
let particles = [];
let pickups = [];


/* =========================================================
   АУДИО
========================================================= */

let audioCtx = null;

let musicTimer = null;
let musicGain = null;
let musicStep = 0;


/* =========================================================
   СЛУЧАЙНЫЕ ЧИСЛА
========================================================= */

function rnd(n) {
  const x =
    Math.sin(
      n * 12.9898 +
      78.233
    ) *
    43758.5453;

  return x - Math.floor(x);
}


/* =========================================================
   СЛОЖНОСТЬ
========================================================= */

function difficulty() {
  return Math.floor(
    state.visualScore / 100
  );
}


/* =========================================================
   ЗОНА
========================================================= */

function zone() {
  return Math.floor(
    state.visualScore / 1000
  );
}


/* =========================================================
   БИОМ
========================================================= */

function biome(score) {
  if (score < 50) {
    return "JUNGLE";
  }

  if (score < 180) {
    return "SNOW";
  }

  if (score < 400) {
    return "CITY";
  }

  if (score < 1000) {
    return "NEON";
  }

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


/* =========================================================
   ТЕКУЩАЯ ВИЗУАЛЬНАЯ ВЫСОТА
   ГЛАВНОЕ ИСПРАВЛЕНИЕ ДЛЯ ДЖЕТПАКА
========================================================= */

function getVisualScore() {

  /*
    Сколько "платформ" игрок визуально
    пролетел относительно стартовой точки.
  */

  const climbed =
    state.worldStartY != null
      ? Math.max(
          0,
          Math.floor(
            (
              state.worldStartY -
              player.y
            ) / CFG.gap
          )
        )
      : 0;

  return Math.max(
    state.score,
    state.visualScore,
    climbed
  );
}


/* =========================================================
   РАССТОЯНИЕ МЕЖДУ ПЛАТФОРМАМИ
========================================================= */

function gapFor(index) {

  const d =
    Math.floor(
      getVisualScore() / 100
    );

  return Math.max(
    66,
    CFG.gap - d * 3
  );
}


/* =========================================================
   ШИРИНА ПЛАТФОРМЫ
========================================================= */

function widthFor(index) {

  const d =
    Math.floor(
      getVisualScore() / 100
    );

  return Math.max(
    72,
    154 -
      d * 3 -
      rnd(index) * 35
  );
}


/* =========================================================
   СОХРАНЕНИЕ
========================================================= */

function save() {

  /*
    Сохраняем профиль,
    но НЕ текущие монеты/бусты.
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


/* =========================================================
   ДАТА
========================================================= */

function dayKey(date = new Date()) {

  return date
    .toISOString()
    .slice(0, 10);
}

function yesterdayKey() {

  const d = new Date();

  d.setDate(
    d.getDate() - 1
  );

  return dayKey(d);
}


/* =========================================================
   ЕЖЕДНЕВНАЯ НАГРАДА
========================================================= */

function dailyReward() {

  const el =
    $("dailyReward");

  if (!el) {
    return;
  }

  const today =
    dayKey();

  if (
    profile.lastDaily ===
    today
  ) {
    el.innerHTML =
      `🎁 Ежедневная награда получена · серия ${profile.streak} дней`;

    return;
  }

  el.innerHTML =
    `🎁 Ежедневная награда: <b>+10 🪙</b> · Серия: ${profile.streak || 0} дней`;
}


function claimDaily() {

  const today =
    dayKey();

  if (
    profile.lastDaily ===
    today
  ) {
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

  toast(
    `🎁 Ежедневный бонус +10 монет · серия ${profile.streak}`
  );

  profile.lastDaily =
    today;

  save();

  dailyReward();

  updateHud();
}


/* =========================================================
   ЗВУКОВЫЕ ЭФФЕКТЫ
========================================================= */

function sound(type) {

  if (!state.sound) {
    return;
  }

  try {

    audioCtx ||=
      new (
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

    const frequency =
      type === "jump"
        ? 520
        : type === "coin"
        ? 880
        : type === "boss"
        ? 75
        : 180;

    osc.type =
      type === "hit"
        ? "sawtooth"
        : "sine";

    osc.frequency.value =
      frequency;

    gain.gain.setValueAtTime(
      0.035,
      audioCtx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioCtx.currentTime +
        0.13
    );

    osc.connect(gain);

    gain.connect(
      audioCtx.destination
    );

    osc.start();

    osc.stop(
      audioCtx.currentTime +
        0.13
    );

  } catch {}
}


/* =========================================================
   ТИХАЯ МУЗЫКА
========================================================= */

function startMusic() {

  try {

    audioCtx ||=
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    if (
      audioCtx.state ===
      "suspended"
    ) {
      audioCtx.resume();
    }

    if (
      musicTimer
    ) {
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
      196.00,
      246.94,
      293.66,
      246.94,
      220.00,
      261.63,
      329.63,
      261.63
    ];

    const playNote =
      () => {

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
          audioCtx.currentTime +
            0.18
        );

        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          audioCtx.currentTime +
            1.55
        );

        osc.connect(gain);

        gain.connect(
          musicGain
        );

        osc.start();

        osc.stop(
          audioCtx.currentTime +
            1.6
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

  if (
    musicGain
  ) {
    musicGain.gain.value =
      state.sound
        ? 0.018
        : 0;
  }
}


/* =========================================================
   HUD
========================================================= */

function updateHud() {

  if ($("score")) {
    $("score").textContent =
      state.score;
  }

  if ($("coins")) {
    $("coins").textContent =
      state.coins;
  }

  if ($("lives")) {
    $("lives").textContent =
      state.lives;
  }

  if ($("combo")) {
    $("combo").textContent =
      "x" +
      state.combo;
  }

  if ($("biome")) {

    $("biome").textContent =
      biome(
        getVisualScore()
      );
  }

  if ($("soundBtn")) {

    $("soundBtn").textContent =
      state.sound
        ? "🔊"
        : "🔇";
  }


  if ($("jetpackBtn")) {

    $("jetpackBtn").disabled =
      state.coins < 50 ||
      state.jetpack;
  }


  if ($("tripleBtn")) {

    $("tripleBtn").disabled =
      state.coins < 25 ||
      state.triple;
  }


  if ($("lifeBtn")) {

    $("lifeBtn").disabled =
      state.coins < 200;
  }


  if ($("magnetBtn")) {

    $("magnetBtn").disabled =
      state.coins < 75 ||
      state.magnet;
  }


  if ($("shieldBtn")) {

    $("shieldBtn").disabled =
      state.coins < 120 ||
      state.shield > 0;
  }


  if ($("slowBtn")) {

    $("slowBtn").disabled =
      state.coins < 90 ||
      state.slowTimer > 0;
  }


  if ($("inventory")) {

    $("inventory").innerHTML =

      (
        state.triple
          ? '<span class="pill">✦ Тройной</span>'
          : ""
      ) +

      (
        state.lives
          ? `<span class="pill">❤ ${state.lives}</span>`
          : ""
      ) +

      (
        state.magnet
          ? '<span class="pill">🧲 Магнит</span>'
          : ""
      ) +

      (
        state.shield
          ? '<span class="pill">🛡️ Щит</span>'
          : ""
      ) +

      (
        state.slowTimer > 0
          ? `<span class="pill">⏳ ${Math.ceil(state.slowTimer)}s</span>`
          : ""
      ) +

      (
        state.jetpack
          ? '<span class="pill">🚀 Джетпак</span>'
          : ""
      );
  }


  if ($("comboFill")) {

    let progress = 0;

    if (
      state.comboWindow
    ) {

      progress =
        Math.max(
          0,
          100 -
            (
              performance.now() -
              state.comboWindow
            ) /
              2600 *
              100
        );
    }

    $("comboFill").style.width =
      Math.min(
        100,
        progress
      ) +
      "%";
  }


  if ($("comboText")) {

    $("comboText").textContent =
      `Комбо ×${state.combo}`;
  }
}


/* =========================================================
   TOAST
========================================================= */

function toast(text) {

  const el =
    $("eventToast");

  if (!el) {
    return;
  }

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


/* =========================================================
   ДОСТИЖЕНИЯ
========================================================= */

const ACHIEVEMENTS = [

  [
    "first10",
    "Первый шаг",
    "10 платформ",
    10
  ],

  [
    "high100",
    "Высоко",
    "100 платформ",
    100
  ],

  [
    "high500",
    "Профессионал",
    "500 платформ",
    500
  ],

  [
    "high1000",
    "Выше облаков",
    "1000 платформ",
    1000
  ],

  [
    "high5000",
    "Безумец",
    "5000 платформ",
    5000
  ],

  [
    "boss1",
    "Охотник",
    "Победить босса",
    1
  ],

  [
    "coins500",
    "Богач",
    "Собрать 500 монет",
    500
  ],

  [
    "combo10",
    "Комбо-машина",
    "Комбо ×10",
    10
  ]
];


function achievementProgress(
  id
) {

  if (
    id.startsWith("high")
  ) {
    return state.score;
  }

  if (
    id === "boss1"
  ) {
    return state.bossCount;
  }

  if (
    id === "coins500"
  ) {
    return profile.totalCoins;
  }

  if (
    id === "combo10"
  ) {
    return state.combo;
  }

  if (
    id === "first10"
  ) {
    return state.score;
  }

  return 0;
}


function checkAchievements() {

  for (
    const achievement of
      ACHIEVEMENTS
  ) {

    const [
      id,
      title,
      description,
      target
    ] = achievement;

    if (
      profile.achievements[
        id
      ]
    ) {
      continue;
    }

    if (
      achievementProgress(
        id
      ) >= target
    ) {

      profile.achievements[
        id
      ] = true;

      toast(
        `🏆 Достижение: ${title}`
      );

      sound("coin");
    }
  }

  save();
}


function renderAchievements() {

  if (!$("achievements")) {
    return;
  }

  $("achievements").innerHTML =
    ACHIEVEMENTS
      .map(
        (
          [
            id,
            title,
            description
          ]
        ) => {

          const unlocked =
            !!profile.achievements[
              id
            ];

          return `
            <div class="achievement ${
              unlocked
                ? ""
                : "locked"
            }">
              <b>
                ${
                  unlocked
                    ? "🏆"
                    : "🔒"
                }
                ${title}
              </b>
              <span>
                ${description}
              </span>
            </div>
          `;
        }
      )
      .join("");
}


/* =========================================================
   ПРОФИЛЬ
========================================================= */

function updateProfileUI() {

  if ($("profileName")) {
    $("profileName").textContent =
      profile.name;
  }

  if ($("profileBest")) {
    $("profileBest").textContent =
      profile.best;
  }

  if ($("profileCoins")) {
    $("profileCoins").textContent =
      profile.totalCoins;
  }

  if ($("profileBosses")) {
    $("profileBosses").textContent =
      state.bossCount;
  }

  if ($("profileAchievements")) {

    const unlocked =
      Object.values(
        profile.achievements
      ).filter(
        Boolean
      ).length;

    $("profileAchievements").textContent =
      `${unlocked}/${ACHIEVEMENTS.length}`;
  }

  if ($("profileStreak")) {
    $("profileStreak").textContent =
      profile.streak;
  }

  renderAchievements();
}


/* =========================================================
   ПЛАТФОРМЫ
========================================================= */

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
      rnd(
        index * 7 + 1
      ) *
        (
          W -
          width -
          60
        );
  }

  return {

    x:
      Math.max(
        20,
        Math.min(
          W -
            width -
            20,
          x
        )
      ),

    y,

    w: width,

    h: 16,

    index,

    metal:
      rnd(
        index * 4
      ) >
      0.58
  };
}


/* =========================================================
   PICKUP
========================================================= */

function createPickupForPlatform(
  p
) {

  /*
    Монеты встречаются редко.
  */

  if (
    p.index <= 0 ||
    p.index % 8 !== 0 ||
    rnd(p.index * 3) <=
      0.55
  ) {
    return;
  }

  pickups.push({

    x:
      p.x +
      p.w / 2,

    y:
      p.y -
      30,

    type:
      rnd(
        p.index * 11
      ) >
      0.90
        ? "chest"
        : "coin",

    taken:
      false
  });
}


/* =========================================================
   СБРОС МИРА
========================================================= */

function resetWorld() {

  platforms = [];
  particles = [];
  pickups = [];

  state.score = 0;
  state.visualScore = 0;

  state.highestPlatform =
    0;

  state.cameraY = 0;
  state.targetCameraY = 0;

  state.zone = 0;

  state.boss = null;

  state.bossHp = 0;
  state.bossMax = 0;

  state.jetpack = false;

  state.jetpackTargetY =
    null;

  state.combo = 1;

  state.comboWindow =
    0;

  state.slowTimer = 0;

  state.eventTimer = 0;

  state.weather =
    "clear";

  state.runCoins =
    0;


  /*
    Запоминаем стартовую
    мировую координату.
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

  state.jumps =
    0;


  let y =
    base;


  for (
    let i = 1;
    i < 50;
    i++
  ) {

    y -=
      gapFor(i);

    const p =
      makePlatform(
        y,
        i
      );

    platforms.push(
      p
    );

    createPickupForPlatform(
      p
    );
  }
}


/* =========================================================
   РАСШИРЕНИЕ МИРА
========================================================= */

function extendWorld() {

  while (
    platforms.length <
    55
  ) {

    const previous =
      platforms[
        platforms.length -
          1
      ];

    const index =
      previous.index +
      1;

    const p =
      makePlatform(
        previous.y -
          gapFor(
            index
          ),
        index
      );

    platforms.push(
      p
    );

    createPickupForPlatform(
      p
    );
  }


  while (
    platforms.length >
      12 &&
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


/* =========================================================
   PARTICLES
========================================================= */

function spawn(
  x,
  y,
  amount = 8,
  type = "spark"
) {

  for (
    let i = 0;
    i < amount;
    i++
  ) {

    const angle =
      rnd(
        (x +
          y +
          i) *
          0.13
      ) *
      Math.PI *
      2;

    const speed =
      40 +
      rnd(
        i * 7
      ) *
        160;

    particles.push({

      x,
      y,

      vx:
        Math.cos(
          angle
        ) *
        speed,

      vy:
        Math.sin(
          angle
        ) *
          speed -
        60,

      life:
        0.35 +
        rnd(i) *
          0.4,

      max:
        0.8,

      type
    });
  }
}


/* =========================================================
   ПРЫЖОК
========================================================= */

function jump() {

  if (
    !state.running ||
    state.over ||
    state.life ||
    state.jetpack
  ) {
    return;
  }


  /*
    Первый прыжок
    только по команде.
  */

  if (
    player.onGround
  ) {

    player.vy =
      CFG.jump;

    player.onGround =
      false;

    state.jumps =
      1;

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


/* =========================================================
   УПРАВЛЕНИЕ КЛАВИАТУРОЙ
   Работает независимо от раскладки
========================================================= */

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


    /*
      A / Ф / ArrowLeft
    */

    if (
      code ===
        "KeyA" ||
      key === "a" ||
      key === "ф" ||
      key ===
        "arrowleft"
    ) {

      keys.left = true;

      event.preventDefault();
    }


    /*
      D / В / ArrowRight
    */

    if (
      code ===
        "KeyD" ||
      key === "d" ||
      key === "в" ||
      key ===
        "arrowright"
    ) {

      keys.right = true;

      event.preventDefault();
    }


    /*
      W / Ц / Space / ArrowUp
    */

    if (
      code ===
        "KeyW" ||
      code ===
        "Space" ||
      key === "w" ||
      key === "ц" ||
      key === " " ||
      key ===
        "arrowup"
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
      code ===
        "KeyA" ||
      key === "a" ||
      key === "ф" ||
      key ===
        "arrowleft"
    ) {

      keys.left = false;
    }


    if (
      code ===
        "KeyD" ||
      key === "d" ||
      key === "в" ||
      key ===
        "arrowright"
    ) {

      keys.right = false;
    }
  }
);


/* =========================================================
   МОБИЛЬНЫЕ СВАЙПЫ
========================================================= */

let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;
let touchPointerId = null;


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


    /*
      Палец влево
      → движение влево

      Палец вправо
      → движение вправо
    */

    if (
      Math.abs(dx) >
      12
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


  keys.left =
    false;

  keys.right =
    false;


  /*
    Просто тап
    → прыжок.
  */

  if (
    !touchMoved &&
    Math.abs(dx) <
      24 &&
    Math.abs(dy) <
      24
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
  side
) {

  const element =
    $(id);

  if (!element) {
    return;
  }

  const on =
    event => {

      event.preventDefault();

      keys[side] =
        true;
    };


  const off =
    event => {

      event.preventDefault();

      keys[side] =
        false;
    };


  element.addEventListener(
    "pointerdown",
    on
  );

  element.addEventListener(
    "pointerup",
    off
  );

  element.addEventListener(
    "pointercancel",
    off
  );

  element.addEventListener(
    "pointerleave",
    off
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


/* =========================================================
   ПРИЗЕМЛЕНИЕ
========================================================= */

function land(
  previousY
) {

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
        Убираем пустоту
        между персонажем
        и платформой.
      */

      player.y =
        platform.y -
        player.h;

      player.vy =
        0;

      player.onGround =
        true;

      state.jumps =
        0;


      /*
        КОМБО
        проверяется только
        при приземлении.
      */

      const landingTime =
        performance.now();


      if (
        state.comboWindow >
          0 &&

        landingTime -
          state.comboWindow <
          2600
      ) {

        state.combo =
          Math.min(
            10,
            state.combo + 1
          );

      } else {

        state.combo =
          1;
      }


      state.comboWindow =
        landingTime;


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


      if (
        platform.index >
        state.highestPlatform
      ) {

        const old =
          state.highestPlatform;

        state.highestPlatform =
          platform.index;


        /*
          Счёт игрока
          всегда отражает
          достигнутую платформу.
        */

        state.score =
          platform.index;


        /*
          ЗАРАБОТОК МОНЕТ:
          только 1 монета
          за каждые 10 платформ.
        */

        const coinsBefore =
          Math.floor(
            old / 10
          );

        const coinsAfter =
          Math.floor(
            platform.index /
              10
          );


        if (
          coinsAfter >
          coinsBefore
        ) {

          const gain =
            coinsAfter -
            coinsBefore;

          state.coins +=
            gain;

          profile.totalCoins +=
            gain;

          state.runCoins +=
            gain;

          sound("coin");
        }


        /*
          Сложность
          каждые 100 платформ.
        */

        if (
          platform.index >
            0 &&
          platform.index %
            100 ===
            0
        ) {

          toast(
            `⚡ Уровень сложности ${Math.floor(
              platform.index / 100
            )}`
          );
        }


        /*
          Босс.
        */

        if (
          platform.index >
            0 &&
          platform.index %
            500 ===
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


/* =========================================================
   МАГНИТ И ПОДБОР МОНЕТ
========================================================= */

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


    let dx =
      pickup.x -
      px;

    let dy =
      pickup.y -
      py;

    let distance =
      Math.hypot(
        dx,
        dy
      );


    /*
      ИСПРАВЛЕННЫЙ МАГНИТ:

      монета двигается
      ИМЕННО к игроку.

      Формула использует:
      player - coin

      поэтому монета
      физически не может
      "улететь" от игрока.
    */

    if (
      state.magnet &&
      pickup.type ===
        "coin" &&
      distance < 240
    ) {

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
        (
          px -
          pickup.x
        ) *
        pull;

      pickup.y +=
        (
          py -
          pickup.y
        ) *
        pull;


      distance =
        Math.hypot(
          pickup.x -
            px,
          pickup.y -
            py
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

        /*
          Обычная монета
          теперь даёт только 1.
        */

        state.coins +=
          1;

        profile.totalCoins +=
          1;

        state.runCoins +=
          1;

        sound("coin");

      } else {

        /*
          Сундук:
          редкий и небольшой
          бонус.
        */

        const bonus =
          10 +
          Math.floor(
            rnd(
              state.score
            ) *
            21
          );

        state.coins +=
          bonus;

        profile.totalCoins +=
          bonus;

        state.runCoins +=
          bonus;

        toast(
          `🎁 Сундук +${bonus} монет`
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


/* =========================================================
   ФИЗИКА
========================================================= */

function physics(
  dt
) {

  const previousY =
    player.y;


  /*
    Движение.
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


  if (
    !direction
  ) {

    player.vx *=
      Math.pow(
        0.0005,
        dt
      );
  }


  player.x +=
    player.vx *
    dt;


  /*
    wrap по сторонам.
  */

  if (
    player.x <
      -player.w *
        0.5
  ) {

    player.x =
      W -
      player.w *
        0.5;
  }


  if (
    player.x >
      W -
        player.w *
          0.5
  ) {

    player.x =
      -player.w *
        0.5;
  }


  /*
    Замедление.
  */

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


  /* =====================================================
     ГЛАВНОЕ:
     visualScore обновляется В КАЖДОМ кадре.

     Поэтому при джетпаке:
     player.y меняется →
     visualScore меняется →
     biome меняется →
     фон меняется сразу.
  ===================================================== */

  state.visualScore =
    Math.max(
      state.visualScore,
      getVisualScore(),
      state.score
    );


  /*
    Проверяем новую зону
    прямо во время полёта.
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


  /* =====================================================
     ДЖЕТПАК
  ===================================================== */

  if (
    state.jetpack
  ) {

    player.onGround =
      false;


    /*
      Постоянный подъём.
    */

    player.vy =
      -1150;

    player.y +=
      player.vy *
      dt;


    /*
      Пламя.
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


    /*
      Мир расширяется
      до высоты джетпака.
    */

    extendWorld();


    /*
      ЕСЛИ В ПОЛЁТЕ
      пересекли новую зону,
      фон уже изменился
      выше этого места.
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

      player.vy =
        0;

      state.jumps =
        0;

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


    /* ===================================================
       ОБЫЧНАЯ ФИЗИКА
    =================================================== */

    const gravity =
      state.slowTimer >
        0
        ? CFG.gravity *
          0.72
        : CFG.gravity;


    player.vy +=
      gravity *
      dt;


    player.y +=
      player.vy *
      dt;


    player.onGround =
      false;


    land(previousY);
  }


  /*
    Камера следует
    за игроком.
  */

  if (
    player.y <
    state.targetCameraY +
      H *
        0.38
  ) {

    state.targetCameraY =
      player.y -
      H *
        0.38;
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


  /*
    Комбо не сбрасывается
    в воздухе.

    Оно проверяется только
    при следующем приземлении.
  */

  if (
    player.onGround &&
    state.comboWindow &&
    performance.now() -
      state.comboWindow >
      2600
  ) {

    state.combo =
      1;
  }


  /*
    События.
  */

  tickEvents();


  /*
    Падение.
  */

  if (
    player.y -
      state.cameraY >
      H +
        160
  ) {

    fail();
  }
}


/* =========================================================
   ПАДЕНИЕ
========================================================= */

function fail() {

  /*
    Щит спасает.
  */

  if (
    state.shield > 0
  ) {

    state.shield =
      0;

    player.vy =
      -860;

    player.y -=
      80;

    toast(
      "🛡️ Щит спас тебя!"
    );

    save();

    updateHud();

    return;
  }


  /*
    Дополнительная жизнь:
    продолжаем текущий забег,
    поэтому бусты не сбрасываем.
  */

  if (
    state.lives > 0
  ) {

    state.life =
      true;

    state.running =
      false;

    $("lifeOverlay")
      ?.classList.remove(
        "hidden"
      );

    return;
  }


  /*
    Окончательная смерть.
  */

  endGame();
}


/* =========================================================
   СБРОС БУСТОВ ПОСЛЕ СМЕРТИ
========================================================= */

function clearRunBonuses() {

  state.coins =
    0;

  state.lives =
    0;

  state.triple =
    false;

  state.jetpack =
    false;

  state.jetpackTargetY =
    null;

  state.magnet =
    false;

  state.shield =
    0;

  state.slowTimer =
    0;

  state.combo =
    1;

  state.comboWindow =
    0;

  state.runCoins =
    0;
}


/* =========================================================
   ПРОДОЛЖЕНИЕ ПОСЛЕ ПАДЕНИЯ
========================================================= */

function continueLife() {

  let safe =
    platforms
      .filter(
        platform =>
          platform.y >
            state.cameraY -
              50 &&
          platform.y <
            state.cameraY +
              H *
                0.85
      )
      .sort(
        (a, b) =>
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
        platforms.length -
          1
      ];
  }


  player.x =
    safe.x +
    safe.w / 2 -
    player.w / 2;

  player.y =
    safe.y -
    player.h;

  player.vy =
    0;

  player.onGround =
    true;

  state.jumps =
    0;

  state.lives--;

  state.life =
    false;


  $("lifeOverlay")
    ?.classList.add(
      "hidden"
    );


  state.running =
    true;

  save();

  updateHud();

  state.last =
    performance.now();

  requestAnimationFrame(
    loop
  );
}


/* =========================================================
   МАГАЗИН
========================================================= */

function buy(
  type
) {

  /*
    Джетпак
  */

  if (
    type === "jet" &&
    state.coins >= 50 &&
    !state.jetpack
  ) {

    state.coins -=
      50;


    /*
      Целимся на 50 платформ
      выше текущей позиции.
    */

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

    state.jumps =
      0;

    extendWorld();

    sound("boss");

    toast(
      "🚀 Джетпак активирован!"
    );
  }


  /*
    Тройной прыжок
  */

  else if (
    type === "triple" &&
    state.coins >= 25 &&
    !state.triple
  ) {

    state.coins -=
      25;

    state.triple =
      true;

    sound("coin");

    toast(
      "✦ Тройной прыжок куплен!"
    );
  }


  /*
    Жизнь
  */

  else if (
    type === "life" &&
    state.coins >= 200
  ) {

    state.coins -=
      200;

    state.lives++;

    sound("coin");

    toast(
      "❤ Дополнительная жизнь!"
    );
  }


  /*
    Магнит
  */

  else if (
    type === "magnet" &&
    state.coins >= 75 &&
    !state.magnet
  ) {

    state.coins -=
      75;

    state.magnet =
      true;

    sound("coin");

    toast(
      "🧲 Магнит активирован!"
    );
  }


  /*
    Щит
  */

  else if (
    type === "shield" &&
    state.coins >= 120 &&
    !state.shield
  ) {

    state.coins -=
      120;

    state.shield =
      1;

    sound("coin");

    toast(
      "🛡️ Щит готов!"
    );
  }


  /*
    Замедление
  */

  else if (
    type === "slow" &&
    state.coins >= 90 &&
    state.slowTimer <= 0
  ) {

    state.coins -=
      90;

    state.slowTimer =
      12;

    sound("coin");

    toast(
      "⏳ Время замедлено!"
    );
  }


  save();

  updateHud();
}


if ($("jetpackBtn")) {

  $("jetpackBtn").onclick =
    () => buy(
      "jet"
    );
}


if ($("tripleBtn")) {

  $("tripleBtn").onclick =
    () => buy(
      "triple"
    );
}


if ($("lifeBtn")) {

  $("lifeBtn").onclick =
    () => buy(
      "life"
    );
}


if ($("magnetBtn")) {

  $("magnetBtn").onclick =
    () => buy(
      "magnet"
    );
}


if ($("shieldBtn")) {

  $("shieldBtn").onclick =
    () => buy(
      "shield"
    );
}


if ($("slowBtn")) {

  $("slowBtn").onclick =
    () => buy(
      "slow"
    );
}


/* =========================================================
   БОСС
========================================================= */

function startBoss() {

  state.boss = {

    x:
      W / 2,

    y:
      state.cameraY +
      150,

    vx:
      130,

    phase:
      0
  };


  state.bossMax =
    100 +
    difficulty() *
      8;

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
      '<div class="name">GUARDIAN</div>' +
      '<div class="track">' +
      '<div class="fill"></div>' +
      "</div>";

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


  boss.phase +=
    dt;


  boss.x +=
    boss.vx *
    dt;


  if (
    boss.x < 70 ||
    boss.x >
      W - 70
  ) {

    boss.vx *=
      -1;
  }


  boss.y =
    state.cameraY +
    145 +
    Math.sin(
      boss.phase *
        2
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
    ) <
      62 &&
    Math.abs(
      py -
      boss.y
    ) <
      70
  ) {

    state.bossHp -=
      22;

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


      state.coins +=
        50;

      profile.totalCoins +=
        50;

      state.runCoins +=
        50;


      state.bossCount++;


      toast(
        "👑 Босс побеждён! +50 монет"
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
      ) +
      "%";
  }
}


/* =========================================================
   ЧАСТИЦЫ
========================================================= */

function updateParticles(
  dt
) {

  for (
    const particle of
      particles
  ) {

    particle.x +=
      particle.vx *
      dt;

    particle.y +=
      particle.vy *
      dt;

    particle.vy +=
      420 *
      dt;

    particle.life -=
      dt;
  }


  particles =
    particles.filter(
      particle =>
        particle.life > 0
    );
}


/* =========================================================
   ПОГОДА / СОБЫТИЯ
========================================================= */

function maybeEvent() {

  const visual =
    getVisualScore();


  if (
    visual < 20 ||
    state.eventTimer >
      0
  ) {
    return;
  }


  state.eventTimer =
    6;


  const random =
    rnd(
      visual * 17
    );


  if (
    random < 0.28
  ) {

    state.weather =
      "rain";

    toast(
      "🌧️ Начался дождь"
    );

  } else if (
    random < 0.5
  ) {

    state.weather =
      "snow";

    toast(
      "❄️ Снегопад"
    );

  } else if (
    random < 0.68
  ) {

    /*
      Маленький бонус.
    */

    state.coins +=
      3;

    profile.totalCoins +=
      3;

    state.runCoins +=
      3;

    toast(
      "💰 +3 монеты"
    );

  } else if (
    random < 0.82
  ) {

    state.slowTimer =
      6;

    toast(
      "⏳ Время немного замедлилось"
    );

  } else {

    toast(
      "☄️ Опасный поток метеоров!"
    );
  }
}


function tickEvents() {

  if (
    state.eventTimer >
      0
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


/* =========================================================
   ZONE BANNER
========================================================= */

function showZone(
  zoneNumber
) {

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
      zoneNumber %
        names.length
    ],
    "Новая зона · сложность повышена"
  );
}


function showZoneText(
  title,
  text
) {

  let element =
    $("zoneBanner");


  if (!element) {

    element =
      document.createElement(
        "div"
      );

    element.id =
      "zoneBanner";

    element.className =
      "zoneBanner";

    element.innerHTML =
      "<b></b><span></span>";

    document.body.appendChild(
      element
    );
  }


  element.querySelector(
    "b"
  ).textContent =
    title;


  element.querySelector(
    "span"
  ).textContent =
    text;


  element.classList.remove(
    "show"
  );


  void element.offsetWidth;


  element.classList.add(
    "show"
  );


  clearTimeout(
    showZoneText.timer
  );


  showZoneText.timer =
    setTimeout(
      () =>
        element.classList.remove(
          "show"
        ),
      2200
    );
}


/* =========================================================
   ЦВЕТ ПЛАТФОРМ
========================================================= */

function platformColor(
  platform
) {

  const type =
    biome(
      platform.index
    );


  if (
    type ===
    "JUNGLE"
  ) {

    return [
      "#91b66a",
      "#253c29"
    ];
  }


  if (
    type ===
    "SNOW"
  ) {

    return [
      "#f3fbff",
      "#4d6878"
    ];
  }


  if (
    type ===
    "CITY"
  ) {

    return [
      "#aab5bd",
      "#28343e"
    ];
  }


  if (
    type ===
    "NEON"
  ) {

    return [
      "#7efff1",
      "#2b2871"
    ];
  }


  if (
    type ===
    "VOLCANO"
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


/* =========================================================
   BACKGROUND
   ИМЕННО ЗДЕСЬ ТЕПЕРЬ ИСПОЛЬЗУЕТСЯ visualScore
========================================================= */

function drawBackground(
  time
) {

  /*
    Раньше здесь был state.score,
    который менялся при посадке.

    Теперь:
    getVisualScore()
    меняется прямо в воздухе.
  */

  const shownScore =
    getVisualScore();


  const backgroundType =
    biome(
      shownScore
    );


  const night =
    Math.floor(
      shownScore / 30
    ) %
      2 ===
    1;


  const colors = {

    JUNGLE:
      night
        ? [
            "#06120e",
            "#102b22"
          ]
        : [
            "#75b5c8",
            "#214c39"
          ],

    SNOW:
      night
        ? [
            "#07111c",
            "#263d50"
          ]
        : [
            "#a8d2e7",
            "#547a91"
          ],

    CITY:
      night
        ? [
            "#050913",
            "#15283d"
          ]
        : [
            "#6c94b1",
            "#233c4f"
          ],

    NEON: [
      "#09051c",
      "#31135a"
    ],

    VOLCANO: [
      "#160707",
      "#512016"
    ],

    TEMPLE: [
      "#07100b",
      "#2d452a"
    ],

    SKY: [
      "#78bce7",
      "#d6efff"
    ],

    VOID: [
      "#020208",
      "#11111f"
    ]

  }[
    backgroundType
  ] || [
    "#111",
    "#222"
  ];


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
    backgroundType ===
    "JUNGLE"
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
        rnd(i * 4) *
          80;


      ctx.fillStyle =
        night
          ? "rgba(2,25,15,.8)"
          : "rgba(15,65,35,.65)";


      ctx.beginPath();


      ctx.ellipse(
        x,
        y,

        45 +
          rnd(i) *
            50,

        150 +
          rnd(i + 2) *
            100,

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
    backgroundType ===
    "SNOW"
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
          time *
            20
        ) %
        H;


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
    backgroundType ===
      "CITY" ||
    backgroundType ===
      "NEON"
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
        rnd(i * 2) *
          90;

      const height =
        150 +
        rnd(i * 3) *
          380;


      ctx.fillStyle =
        backgroundType ===
        "NEON"
          ? "rgba(15,8,40,.8)"
          : "rgba(22,45,62,.72)";


      ctx.fillRect(
        x,
        H -
          height,
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
          backgroundType ===
          "NEON"
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
    backgroundType ===
    "VOLCANO"
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
          rnd(i) *
            80,

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
    backgroundType ===
    "TEMPLE"
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
          rnd(i) *
            70,
        42,
        H
      );
    }
  }


  /*
    SKY
  */

  else if (
    backgroundType ===
    "SKY"
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
    backgroundType ===
    "VOID"
  ) {

    for (
      let i = 0;
      i < 160;
      i++
    ) {

      ctx.fillStyle =
        "rgba(210,230,255,.55)";


      ctx.fillRect(
        rnd(i * 2) *
          W,
        rnd(i * 5) *
          H,
        1.5,
        1.5
      );
    }
  }
}


/* =========================================================
   ПОГОДА
========================================================= */

function drawWeather(
  time
) {

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
          time *
            500
        ) %
        H;


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
          time *
            40
        ) %
        H;


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


/* =========================================================
   ПЛАТФОРМЫ
========================================================= */

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


    const [
      topColor,
      bottomColor
    ] =
      platformColor(
        platform
      );


    const gradient =
      ctx.createLinearGradient(
        0,
        y,
        0,
        y +
          platform.h
      );


    gradient.addColorStop(
      0,
      topColor
    );


    gradient.addColorStop(
      1,
      bottomColor
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


    ctx.shadowBlur =
      0;


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


/* =========================================================
   PICKUPS RENDER
========================================================= */

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
        0.35,
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
        11 +
          Math.sin(
            time * 6 +
            pickup.x
          ) *
            1.2,
        0,
        Math.PI * 2
      );


      ctx.fill();


      ctx.strokeStyle =
        "#fff1a0";


      ctx.lineWidth =
        2;


      ctx.stroke();


      ctx.restore();


    } else {

      /*
        Сундук.
      */

      ctx.save();


      ctx.translate(
        pickup.x,
        y
      );


      ctx.rotate(
        Math.sin(
          time * 2
        ) *
          0.05
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


      ctx.lineWidth =
        3;


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


/* =========================================================
   БОСС RENDER
========================================================= */

function drawBoss() {

  if (
    !state.boss
  ) {
    return;
  }


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
    0.12,
    "#ff6b6b"
  );


  gradient.addColorStop(
    0.7,
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


  ctx.lineWidth =
    3;


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


/* =========================================================
   ПЕРСОНАЖ
========================================================= */

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


  /*
    Небольшой наклон
    при горизонтальном движении.
  */

  if (
    !state.jetpack &&
    Math.abs(
      player.vx
    ) > 20
  ) {

    ctx.rotate(
      Math.max(
        -0.18,
        Math.min(
          0.18,
          player.vx *
            0.00045
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
        -10 +
          i * 20,
        13
      );


      ctx.lineTo(
        -3 +
          i * 20,
        42 +
          Math.sin(
            time * 30 +
            i
          ) *
            6
      );


      ctx.lineTo(
        5 +
          i * 20,
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


  ctx.lineWidth =
    8;


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
    0.35,
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
    Детали костюма.
  */

  ctx.strokeStyle =
    "rgba(255,255,255,.25)";


  ctx.lineWidth =
    1;


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
      i * 0.5,
      19
    );


    ctx.stroke();
  }


  for (
    let q = -11;
    q <= 12;
    q += 7
  ) {

    ctx.beginPath();


    ctx.arc(
      0,
      q,
      15 -
        Math.abs(q) *
          0.18,
      0,
      Math.PI * 2
    );


    ctx.stroke();
  }


  /*
    Руки.
  */

  ctx.strokeStyle =
    "#17212a";


  ctx.lineWidth =
    8;


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
    -0.2,
    0,
    Math.PI * 2
  );


  ctx.ellipse(
    5,
    -31,
    5,
    3,
    0.2,
    0,
    Math.PI * 2
  );


  ctx.fill();


  ctx.restore();
}


/* =========================================================
   PARTICLES RENDER
========================================================= */

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


/* =========================================================
   РЕНДЕР
========================================================= */

function render(time) {

  ctx.clearRect(
    0,
    0,
    W,
    H
  );


  /*
    Фон теперь считает
    текущую высоту каждый кадр.
  */

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


/* =========================================================
   ИГРОВОЙ ЦИКЛ
========================================================= */

function loop(
  now
) {

  if (
    !state.running
  ) {
    return;
  }


  const delta =
    Math.min(
      0.033,
      (
        now -
        state.last
      ) /
        1000 ||
        0.016
    );


  state.last =
    now;


  physics(
    delta
  );


  render(
    now / 1000
  );


  requestAnimationFrame(
    loop
  );
}


/* =========================================================
   ОКОНЧАТЕЛЬНАЯ СМЕРТЬ
========================================================= */

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
      `Высота: ${state.score} платформ · Собрано монет: ${state.runCoins}`;
  }


  /*
    После окончательной смерти:
    монеты и бусты = 0.
  */

  clearRunBonuses();


  updateHud();

  updateProfileUI();

  save();

  loadLeaderboard(
    currentPeriod
  );
}


/* =========================================================
   ЛИДЕРБОРД
========================================================= */

let currentPeriod =
  "all";


async function loadLeaderboard(
  period = currentPeriod
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
          <span>•</span>
          <span>
            Онлайн-таблица не настроена
          </span>
          <span>Supabase</span>
        </div>
      `;

    return;
  }


  let url =
    `${config.SUPABASE_URL}/rest/v1/scores?select=name,score,created_at&order=score.desc&limit=10`;


  const now =
    new Date();


  if (
    period ===
    "today"
  ) {

    url +=
      `&created_at=gte.${dayKey(now)}T00:00:00.000Z`;
  }


  if (
    period ===
    "week"
  ) {

    const date =
      new Date(now);

    date.setDate(
      date.getDate() -
        7
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
            apikey:
              config.SUPABASE_ANON_KEY,

            Authorization:
              `Bearer ${config.SUPABASE_ANON_KEY}`
          }
        }
      );


    if (
      !response.ok
    ) {
      throw new Error();
    }


    const rows =
      await response.json();


    if (
      rows.length
    ) {

      box.innerHTML =
        rows
          .map(
            (
              row,
              index
            ) =>
              `
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

    } else {

      box.innerHTML =
        `
          <div class="row">
            <span>•</span>
            <span>
              Пока пусто
            </span>
            <span></span>
          </div>
        `;
    }


  } catch {

    box.innerHTML =
      `
        <div class="row">
          <span>!</span>
          <span>
            Не удалось загрузить рейтинг
          </span>
          <span></span>
        </div>
      `;
  }
}


/* =========================================================
   СОХРАНЕНИЕ РЕЗУЛЬТАТА
========================================================= */

async function submitScore() {

  const config =
    window.SPIDER_CONFIG ||
    {};

  const input =
    $("nameInput");


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


  if (
    $("submitScore")
  ) {

    $("submitScore")
      .disabled =
      true;
  }


  try {

    const response =
      await fetch(
        `${config.SUPABASE_URL}/rest/v1/scores`,
        {
          method:
            "POST",

          headers: {

            apikey:
              config.SUPABASE_ANON_KEY,

            Authorization:
              `Bearer ${config.SUPABASE_ANON_KEY}`,

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
      throw new Error();
    }


    await loadLeaderboard(
      currentPeriod
    );


  } catch {

    alert(
      "Не удалось сохранить результат."
    );


  } finally {

    if (
      $("submitScore")
    ) {

      $("submitScore")
        .disabled =
        false;
    }


    save();
  }
}


function escapeHtml(
  text
) {

  return String(
    text
  ).replace(
    /[&<>"']/g,
    symbol =>
      ({
        "&":
          "&amp;",
        "<":
          "&lt;",
        ">":
          "&gt;",
        '"':
          "&quot;",
        "'":
          "&#039;"
      }[
        symbol
      ])
  );
}


/* =========================================================
   КНОПКИ
========================================================= */

if (
  $("submitScore")
) {

  $("submitScore")
    .addEventListener(
      "click",
      submitScore
    );
}


document
  .querySelectorAll(
    ".tab"
  )
  .forEach(
    tab => {

      tab.onclick =
        () => {

          document
            .querySelectorAll(
              ".tab"
            )
            .forEach(
              element =>
                element.classList.remove(
                  "active"
                )
            );


          tab.classList.add(
            "active"
          );


          loadLeaderboard(
            tab.dataset.period
          );
        };
    }
  );


if (
  $("profileBtn")
) {

  $("profileBtn").onclick =
    () => {

      $("profileOverlay")
        .classList.remove(
          "hidden"
        );

      updateProfileUI();
    };
}


if (
  $("closeProfile")
) {

  $("closeProfile").onclick =
    () => {

      $("profileOverlay")
        .classList.add(
          "hidden"
        );
    };
}


if (
  $("soundBtn")
) {

  $("soundBtn").onclick =
    () => {

      state.sound =
        !state.sound;

      updateMusicVolume();

      save();

      updateHud();
    };
}


/* =========================================================
   ЗАПУСК НОВОЙ ИГРЫ
========================================================= */

function startGame() {

  state.over =
    false;

  state.life =
    false;

  state.running =
    true;


  /*
    Новый забег:
    всё начинается
    без монет и бустов.
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


if (
  $("startBtn")
) {

  $("startBtn").onclick =
    startGame;
}


/*
  "Сыграть ещё"
  сразу начинает
  новую игру.
*/

if (
  $("restartBtn")
) {

  $("restartBtn").onclick =
    startGame;
}


if (
  $("continueBtn")
) {

  $("continueBtn").onclick =
    continueLife;
}


if (
  $("endLifeBtn")
) {

  $("endLifeBtn").onclick =
    endGame;
}


/* =========================================================
   ПРОФИЛЬ / ДОСТИЖЕНИЯ
========================================================= */

function initProfile() {

  if (
    $("profileName")
  ) {

    $("profileName")
      .textContent =
      profile.name;
  }


  updateProfileUI();
}


/* =========================================================
   ПЕРВИЧНАЯ ИНИЦИАЛИЗАЦИЯ
========================================================= */

function init() {

  /*
    Профиль.
  */

  initProfile();


  /*
    Ежедневная награда.
  */

  dailyReward();


  if (
    profile.lastDaily !==
    dayKey()
  ) {

    claimDaily();
  }


  /*
    Начальное состояние:
    персонаж стоит.
  */

  resetWorld();


  updateHud();


  render(0);


  updateMusicVolume();
}


init();


/* =========================================================
   ПОДДЕРЖАНИЕ СОБЫТИЙ
========================================================= */

setInterval(
  () => {

    tickEvents();

    updateHud();

  },
  1000 / 60
);


/* =========================================================
   ВОЗОБНОВЛЕНИЕ АУДИО ПОСЛЕ ВЗАИМОДЕЙСТВИЯ
========================================================= */

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