(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const $ = id => document.getElementById(id);

let W = innerWidth, H = innerHeight;
let DPR = Math.min(devicePixelRatio || 1, 2);

function resize() {
  W = innerWidth; H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener("resize", resize); resize();

const SAVE_KEY = "spiderJumpSaveV2";
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch {}

const CFG = { gravity: 1850, move: 480, jump: -790, jump2: -740, gap: 96 };

const profile = {
  name: saved.name || "Игрок",
  best: saved.best || 0,
  totalCoins: saved.totalCoins || 0,
  bosses: saved.bosses || 0,
  streak: saved.streak || 0,
  lastDaily: saved.lastDaily || "",
  achievements: saved.achievements || {},
  magnet: saved.magnet || false,
  shield: saved.shield || 0
};

const state = {
  running: false, over: false, life: false, last: 0,
  score: 0, coins: saved.coins || 0, lives: saved.lives || 0,
  jumps: 0, triple: !!saved.triple, jetpack: false,
  jetpackTargetY: null, cameraY: 0, targetCameraY: 0,
  highestPlatform: 0, sound: saved.sound !== false,
  zone: 0, boss: null, bossHp: 0, bossMax: 0,
  combo: 1, comboTimer: 0, shield: profile.shield || 0,
  magnet: !!profile.magnet, slowTimer: 0, eventTimer: 0,
  weather: "clear", bossCount: profile.bosses || 0,
  runCoins: 0
};

const player = { x: W/2 - 23, y: 0, vx: 0, vy: 0, w: 46, h: 68, onGround: true };
let platforms = [], particles = [], pickups = [], stars = [];
let audioCtx = null, musicTimer = null, musicGain = null, musicStep = 0;
let currentPeriod = "all";

function rnd(n) { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
function difficulty() { return Math.floor(state.score / 100); }
function zone() { return Math.floor(state.score / 1000); }
function biome(score) {
  if (score < 50) return "JUNGLE";
  if (score < 180) return "SNOW";
  if (score < 400) return "CITY";
  if (score < 1000) return "NEON";
  return ["NEON","VOLCANO","TEMPLE","SKY","VOID"][zone() % 5];
}
function gapFor(i) { return Math.max(66, CFG.gap - difficulty() * 3 + (state.slowTimer > 0 ? 8 : 0)); }
function widthFor(i) { return Math.max(72, 154 - difficulty() * 3 - rnd(i) * 35); }
function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    ...profile,
    name: profile.name, best: Math.max(profile.best, state.score),
    totalCoins: profile.totalCoins, bosses: state.bossCount,
    streak: profile.streak, lastDaily: profile.lastDaily,
    achievements: profile.achievements,
    magnet: state.magnet, shield: state.shield,
    coins: state.coins, lives: state.lives, triple: state.triple, sound: state.sound
  }));
}
function dayKey(d = new Date()) { return d.toISOString().slice(0,10); }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate()-1); return dayKey(d); }

function dailyReward() {
  const el = $("dailyReward"); if (!el) return;
  const today = dayKey();
  if (profile.lastDaily === today) {
    el.innerHTML = `🎁 Ежедневная награда получена · серия ${profile.streak} дней`;
    return;
  }
  el.innerHTML = `🎁 Ежедневная награда: <b>+25 🪙</b> · Серия: ${profile.streak || 0} дней`;
}

function claimDaily() {
  const today = dayKey();
  if (profile.lastDaily === today) return;
  if (profile.lastDaily === yesterdayKey()) profile.streak = (profile.streak || 0) + 1;
  else profile.streak = 1;
  state.coins += 25; profile.totalCoins += 25; profile.lastDaily = today;
  toast(`🎁 Ежедневный бонус +25 монет · серия ${profile.streak}`);
  save(); dailyReward(); updateHud();
}

function sound(type) {
  if (!state.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type === "hit" ? "sawtooth" : "sine";
    o.frequency.value = type === "jump" ? 520 : type === "coin" ? 880 : type === "boss" ? 75 : 180;
    g.gain.setValueAtTime(.035, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .13);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + .13);
  } catch {}
}
function startMusic() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    if (musicTimer) return;
    musicGain = audioCtx.createGain(); musicGain.gain.value = .018; musicGain.connect(audioCtx.destination);
    const notes = [196,246.94,293.66,246.94,220,261.63,329.63,261.63];
    const tick = () => {
      if (!state.sound || audioCtx.state !== "running") return;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = notes[musicStep++ % notes.length];
      g.gain.setValueAtTime(.0001, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(.032, audioCtx.currentTime + .18);
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + 1.55);
      o.connect(g); g.connect(musicGain); o.start(); o.stop(audioCtx.currentTime + 1.6);
    };
    tick(); musicTimer = setInterval(tick, 1600);
  } catch {}
}
function updateMusicVolume() { if (musicGain) musicGain.gain.value = state.sound ? .018 : 0; }

function updateHud() {
  $("score").textContent = state.score;
  $("coins").textContent = state.coins;
  $("lives").textContent = state.lives;
  $("combo").textContent = "x" + state.combo;
  $("biome").textContent = biome(state.score);
  $("soundBtn").textContent = state.sound ? "🔊" : "🔇";
  $("jetpackBtn").disabled = state.coins < 50 || state.jetpack;
  $("tripleBtn").disabled = state.coins < 25 || state.triple;
  $("lifeBtn").disabled = state.coins < 200;
  $("magnetBtn").disabled = state.coins < 75 || state.magnet;
  $("shieldBtn").disabled = state.coins < 120 || state.shield > 0;
  $("slowBtn").disabled = state.coins < 90 || state.slowTimer > 0;
  $("inventory").innerHTML =
    (state.triple ? '<span class="pill">✦ Тройной</span>' : "") +
    (state.lives ? `<span class="pill">❤ ${state.lives}</span>` : "") +
    (state.magnet ? '<span class="pill">🧲 Магнит</span>' : "") +
    (state.shield ? '<span class="pill">🛡️ Щит</span>' : "") +
    (state.slowTimer > 0 ? `<span class="pill">⏳ ${Math.ceil(state.slowTimer)}s</span>` : "") +
    (state.jetpack ? '<span class="pill">🚀 Джетпак</span>' : "");
  $("comboFill").style.width = Math.min(100, state.comboTimer / 7 * 100) + "%";
  $("comboText").textContent = `Комбо ×${state.combo}`;
}

function toast(text) {
  const el = $("eventToast");
  el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200);
}

const ACH = [
  ["first10","Первый шаг","10 платформ",10],
  ["high100","Высоко","100 платформ",100],
  ["high500","Профессионал","500 платформ",500],
  ["high1000","Выше облаков","1000 платформ",1000],
  ["high5000","Безумец","5000 платформ",5000],
  ["boss1","Охотник","Победить босса",1],
  ["coins500","Богач","Собрать 500 монет",500],
  ["combo10","Комбо-машина","Комбо x10",10]
];

function achievementProgress(id) {
  if (id.startsWith("high")) return state.score;
  if (id === "boss1") return state.bossCount;
  if (id === "coins500") return profile.totalCoins;
  if (id === "combo10") return state.combo;
  if (id === "first10") return state.score;
  return 0;
}
function checkAchievements() {
  for (const [id, title, desc, target] of ACH) {
    if (profile.achievements[id]) continue;
    if (achievementProgress(id) >= target) {
      profile.achievements[id] = true;
      toast(`🏆 Достижение: ${title}`);
      sound("coin");
    }
  }
  save();
}
function renderAchievements() {
  $("achievements").innerHTML = ACH.map(([id,title,desc,target]) => {
    const unlocked = !!profile.achievements[id];
    return `<div class="achievement ${unlocked ? "" : "locked"}">
      <b>${unlocked ? "🏆" : "🔒"} ${title}</b><span>${desc}</span>
    </div>`;
  }).join("");
}

function updateProfileUI() {
  $("profileName").textContent = profile.name;
  $("profileBest").textContent = profile.best;
  $("profileCoins").textContent = profile.totalCoins;
  $("profileBosses").textContent = state.bossCount;
  $("profileAchievements").textContent = `${Object.values(profile.achievements).filter(Boolean).length}/${ACH.length}`;
  $("profileStreak").textContent = profile.streak;
  renderAchievements();
}

function makePlatform(y, index, x = null) {
  const w = widthFor(index);
  if (x == null) x = 30 + rnd(index * 7 + 1) * (W - w - 60);
  return { x: Math.max(20, Math.min(W - w - 20, x)), y, w, h: 16, index, metal: rnd(index * 4) > .58 };
}

function resetWorld() {
  platforms = []; particles = []; pickups = []; state.score = 0; state.highestPlatform = 0;
  state.cameraY = 0; state.targetCameraY = 0; state.zone = 0;
  state.boss = null; state.bossHp = 0; state.bossMax = 0;
  state.jetpack = false; state.jetpackTargetY = null;
  state.combo = 1; state.comboTimer = 0; state.slowTimer = 0; state.weather = "clear"; state.runCoins = 0;
  const base = H - 118;
  platforms.push(makePlatform(base, 0, W / 2 - 75));
  player.x = W / 2 - player.w / 2; player.y = base - player.h; player.vx = 0; player.vy = 0; player.onGround = true;
  state.jumps = 0;
  let y = base;
  for (let i=1;i<50;i++){ y -= gapFor(i); platforms.push(makePlatform(y,i)); }
  scatterPickups();
}

function scatterPickups() {
  pickups = [];
  for (const p of platforms) {
    if (p.index > 0 && p.index % 4 === 0 && rnd(p.index * 3) > .25) {
      pickups.push({ x: p.x + p.w * .5, y: p.y - 30, type: rnd(p.index * 11) > .85 ? "chest" : "coin", taken:false });
    }
  }
}

function extendWorld() {
  while (platforms.length < 55) {
    const p = platforms[platforms.length - 1], i = p.index + 1;
    platforms.push(makePlatform(p.y - gapFor(i), i));
    if (i % 4 === 0 && rnd(i*3) > .25) pickups.push({x:0,y:0,type:rnd(i*11)>.86?"chest":"coin",taken:false});
    const last = pickups[pickups.length - 1];
    if (last && last.x === 0 && i % 4 === 0) { last.x = platforms.at(-1).x + platforms.at(-1).w/2; last.y = platforms.at(-1).y - 30; }
  }
  while (platforms.length > 12 && platforms[0].y > state.cameraY + H + 320) platforms.shift();
  pickups = pickups.filter(p => !p.taken && p.y < state.cameraY + H + 360);
}

function spawn(x,y,n=8,type="spark") {
  for (let i=0;i<n;i++){
    const a = rnd((x+y+i)*.13)*Math.PI*2, s = 40 + rnd(i*7)*160;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,life:.35+rnd(i)*.4,max:.8,type});
  }
}

function jump() {
  if (!state.running || state.over || state.life || state.jetpack) return;
  if (player.onGround) {
    player.vy = CFG.jump; player.onGround = false; state.jumps = 1;
    spawn(player.x+23,player.y+60,5,"web"); sound("jump"); return;
  }
  const maxJumps = state.triple ? 3 : 2;
  if (state.jumps < maxJumps) {
    player.vy = state.jumps === 1 ? CFG.jump2 : -700; state.jumps++;
    spawn(player.x+23,player.y+60,4,"web"); sound("jump");
  }
}

const keys = {left:false,right:false};
addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(k==="a"||k==="arrowleft"){keys.left=true;e.preventDefault();}
  if(k==="d"||k==="arrowright"){keys.right=true;e.preventDefault();}
  if(k===" "||k==="w"||k==="arrowup"){jump();e.preventDefault();}
});
addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();
  if(k==="a"||k==="arrowleft")keys.left=false;
  if(k==="d"||k==="arrowright")keys.right=false;
});
canvas.addEventListener("pointerdown",e=>{if(e.button===0)jump();});
$("jumpBtn").addEventListener("pointerdown",e=>{e.preventDefault();jump();});
function bindButton(id,side){const el=$(id);const on=e=>{e.preventDefault();keys[side]=true};const off=e=>{e.preventDefault();keys[side]=false};el.addEventListener("pointerdown",on);el.addEventListener("pointerup",off);el.addEventListener("pointercancel",off);el.addEventListener("pointerleave",off);}
bindButton("leftBtn","left"); bindButton("rightBtn","right");

function land(prevY) {
  if (player.vy <= 0 || state.jetpack) return;
  const bottom=player.y+player.h, prevBottom=prevY+player.h;
  for(const p of platforms){
    if(bottom>=p.y&&prevBottom<=p.y&&player.x+player.w*.82>p.x&&player.x+player.w*.18<p.x+p.w){
      player.y=p.y-player.h; player.vy=0; player.onGround=true; state.jumps=0;
      state.comboTimer=Math.min(7,state.comboTimer+1.2);
      state.combo=Math.min(10,state.combo + (state.comboTimer>0 ? 1:0));
      if(state.combo>1) toast(`🔥 Комбо ×${state.combo}`);
      spawn(player.x+23,p.y,8,"dust");
      const old=state.highestPlatform;
      if(p.index>old){
        state.highestPlatform=p.index; state.score=p.index;
        const coinsBefore=Math.floor(old/5),coinsAfter=Math.floor(p.index/5);
        if(coinsAfter>coinsBefore){
          const gain=(coinsAfter-coinsBefore)*5*state.combo;
          state.coins+=gain; profile.totalCoins+=gain; state.runCoins+=gain; sound("coin");
        }
        if(p.index>=100&&p.index%100===0) toast(`⚡ Сложность ${Math.floor(p.index/100)} уровня`);
        const z=zone(); if(z!==state.zone){state.zone=z;showZone(z);}
        if(p.index>0&&p.index%500===0&&!state.boss)startBoss();
      }
      checkPickups(); checkAchievements(); updateHud(); save(); break;
    }
  }
}

function checkPickups(){
  for(const c of pickups){
    if(c.taken)continue;
    const px=player.x+player.w/2,py=player.y+player.h/2;
    let dx=c.x-px,dy=c.y-py,dist=Math.hypot(dx,dy);
    if(state.magnet&&c.type==="coin"&&dist<210){
      c.x += dx*.08; c.y += dy*.08; dist=Math.hypot(c.x-px,c.y-py);
    }
    if(dist<34){
      c.taken=true;
      if(c.type==="coin"){state.coins+=5;profile.totalCoins+=5;state.runCoins+=5;sound("coin");}
      else {const bonus=25+Math.floor(rnd(state.score)*50);state.coins+=bonus;profile.totalCoins+=bonus;state.runCoins+=bonus;toast(`🎁 Сундук +${bonus} монет`);sound("coin");}
      spawn(c.x,c.y,12,"spark");
    }
  }
}

function physics(dt){
  const prevY=player.y;
  const dir=(keys.right?1:0)-(keys.left?1:0);
  player.vx += (dir*CFG.move-player.vx)*Math.min(1,dt*11);
  if(!dir)player.vx*=Math.pow(.0005,dt);
  player.x+=player.vx*dt;
  if(player.x<-player.w*.5)player.x=W-player.w*.5;
  if(player.x>W-player.w*.5)player.x=-player.w*.5;

  if(state.slowTimer>0)state.slowTimer=Math.max(0,state.slowTimer-dt);

  if(state.jetpack){
    player.onGround=false; player.vy=-1150; player.y+=player.vy*dt;
    if(Math.random()<.8)spawn(player.x+player.w/2,player.y+player.h,1,"flame");
    extendWorld();
    if(player.y<=state.jetpackTargetY){state.jetpack=false;state.jetpackTargetY=null;player.vy=0;state.jumps=0;spawn(player.x+23,player.y+player.h,20,"flame");sound("coin");save();updateHud();}
  }else{
    const grav=state.slowTimer>0?CFG.gravity*.72:CFG.gravity;
    player.vy+=grav*dt;player.y+=player.vy*dt;player.onGround=false;land(prevY);
  }

  checkPickups();
  if(player.y<state.targetCameraY+H*.38)state.targetCameraY=player.y-H*.38;
  state.cameraY+=(state.targetCameraY-state.cameraY)*(1-Math.pow(.00015,dt));
  updateParticles(dt);updateBoss(dt);extendWorld();

  state.comboTimer=Math.max(0,state.comboTimer-dt);
  if(state.comboTimer===0)state.combo=1;

  if(player.y-state.cameraY>H+160){fail();}
}

function fail(){
  if(state.shield>0){state.shield=0;player.vy=-860;player.y-=80;toast("🛡️ Щит спас тебя!");save();updateHud();return;}
  if(state.lives>0){state.life=true;state.running=false;$("lifeOverlay").classList.remove("hidden");}
  else endGame();
}
function continueLife(){
  let safe=platforms.filter(p=>p.y>state.cameraY-50&&p.y<state.cameraY+H*.85).sort((a,b)=>Math.abs(a.y-player.y)-Math.abs(b.y-player.y))[0]||platforms.at(-1);
  player.x=safe.x+safe.w/2-player.w/2;player.y=safe.y-player.h;player.vy=0;player.onGround=true;state.jumps=0;state.lives--;state.life=false;
  $("lifeOverlay").classList.add("hidden");state.running=true;save();updateHud();state.last=performance.now();requestAnimationFrame(loop);
}

function buy(type){
  if(type==="jet"&&state.coins>=50&&!state.jetpack){
    state.coins-=50;let target=player.y,index=state.highestPlatform;
    for(let i=0;i<50;i++){index++;target-=gapFor(index);}
    state.jetpack=true;state.jetpackTargetY=target;state.jumps=0;extendWorld();sound("boss");toast("🚀 Джетпак активирован!");
  }else if(type==="triple"&&state.coins>=25&&!state.triple){state.coins-=25;state.triple=true;sound("coin");toast("✦ Тройной прыжок куплен!");}
  else if(type==="life"&&state.coins>=200){state.coins-=200;state.lives++;sound("coin");toast("❤ Дополнительная жизнь!");}
  else if(type==="magnet"&&state.coins>=75&&!state.magnet){state.coins-=75;state.magnet=true;sound("coin");toast("🧲 Магнит активирован!");}
  else if(type==="shield"&&state.coins>=120&&!state.shield){state.coins-=120;state.shield=1;sound("coin");toast("🛡️ Щит готов!");}
  else if(type==="slow"&&state.coins>=90&&state.slowTimer<=0){state.coins-=90;state.slowTimer=12;sound("coin");toast("⏳ Время замедлено!");}
  save();updateHud();
}

$("jetpackBtn").onclick=()=>buy("jet");
$("tripleBtn").onclick=()=>buy("triple");
$("lifeBtn").onclick=()=>buy("life");
$("magnetBtn").onclick=()=>buy("magnet");
$("shieldBtn").onclick=()=>buy("shield");
$("slowBtn").onclick=()=>buy("slow");

function startBoss(){
  state.boss={x:W/2,y:state.cameraY+150,vx:130,phase:0};
  state.bossMax=100+difficulty()*8;state.bossHp=state.bossMax;
  let bar=document.getElementById("bossbar");
  if(!bar){bar=document.createElement("div");bar.id="bossbar";bar.className="bossbar";bar.innerHTML='<div class="name">GUARDIAN</div><div class="track"><div class="fill"></div></div>';document.body.appendChild(bar);}
  bar.style.display="block";showZoneText("GUARDIAN","Победи хранителя высоты");sound("boss");
}

function updateBoss(dt){
  if(!state.boss)return;
  const b=state.boss;b.phase+=dt;b.x+=b.vx*dt;if(b.x<70||b.x>W-70)b.vx*=-1;b.y=state.cameraY+145+Math.sin(b.phase*2)*55;
  const px=player.x+player.w/2,py=player.y+player.h/2;
  if(player.vy>0&&Math.abs(px-b.x)<62&&Math.abs(py-b.y)<70){
    state.bossHp-=22;player.vy=-880;spawn(b.x,b.y,18,"impact");sound("boss");
    if(state.bossHp<=0){spawn(b.x,b.y,40,"spark");state.coins+=50;profile.totalCoins+=50;state.runCoins+=50;state.bossCount++;toast("👑 Босс побеждён! +50 монет");state.boss=null;$("bossbar").style.display="none";checkAchievements();save();updateProfileUI();updateHud();}
  }
  const fill=document.querySelector("#bossbar .fill");if(fill)fill.style.width=Math.max(0,state.bossHp/state.bossMax*100)+"%";
}

function updateParticles(dt){
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=420*dt;p.life-=dt;}
  particles=particles.filter(p=>p.life>0);
}

function showZone(z){
  const names=["JUNGLE","SNOW","CITY","NEON","VOLCANO","TEMPLE","SKY","VOID"];
  showZoneText(names[z%names.length],"Новая зона · сложность повышена");
}
function showZoneText(title,text){
  let el=$("zoneBanner");if(!el){el=document.createElement("div");el.id="zoneBanner";el.className="zoneBanner";el.innerHTML="<b></b><span></span>";document.body.appendChild(el);}
  el.querySelector("b").textContent=title;el.querySelector("span").textContent=text;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");
  clearTimeout(showZoneText.timer);showZoneText.timer=setTimeout(()=>el.classList.remove("show"),2200);
}

function drawBackground(t){
  const b=biome(state.score),night=Math.floor(state.score/30)%2===1;
  const colors={
    JUNGLE:night?["#06120e","#102b22"]:["#75b5c8","#214c39"],
    SNOW:night?["#07111c","#263d50"]:["#a8d2e7","#547a91"],
    CITY:night?["#050913","#15283d"]:["#6c94b1","#233c4f"],
    NEON:["#09051c","#31135a"],VOLCANO:["#160707","#512016"],
    TEMPLE:["#07100b","#2d452a"],SKY:["#78bce7","#d6efff"],VOID:["#020208","#11111f"]
  }[b]||["#111","#222"];
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,colors[0]);g.addColorStop(1,colors[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

  if(b==="JUNGLE"){
    for(let i=0;i<18;i++){const x=rnd(i*9)*W,y=H*.66+rnd(i*4)*80;ctx.fillStyle=night?"rgba(2,25,15,.8)":"rgba(15,65,35,.65)";ctx.beginPath();ctx.ellipse(x,y,45+rnd(i)*50,150+rnd(i+2)*100,0,0,Math.PI*2);ctx.fill();}
  }else if(b==="SNOW"){
    for(let i=0;i<10;i++){const x=i*W/9;ctx.fillStyle=night?"rgba(100,140,165,.35)":"rgba(245,250,255,.9)";ctx.beginPath();ctx.moveTo(x,H*.78);ctx.lineTo(x+W/14,H*.25);ctx.lineTo(x+W/7,H*.78);ctx.fill();}
    for(let i=0;i<120;i++){const x=rnd(i*3)*W,y=(rnd(i*5)*H+t*20)%H;ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillRect(x,y,2,2);}
  }else if(b==="CITY"||b==="NEON"){
    for(let i=0;i<20;i++){const x=rnd(i*8)*W,w=35+rnd(i*2)*90,h=150+rnd(i*3)*380;ctx.fillStyle=b==="NEON"?"rgba(15,8,40,.8)":"rgba(22,45,62,.72)";ctx.fillRect(x,H-h,w,h);for(let y=H-h+18;y<H;y+=26){ctx.fillStyle=b==="NEON"?"rgba(80,240,255,.45)":"rgba(255,225,120,.35)";ctx.fillRect(x+8,y,6,9);}}
  }else if(b==="VOLCANO"){ctx.fillStyle="rgba(255,90,20,.18)";for(let i=0;i<12;i++){ctx.beginPath();ctx.arc(rnd(i*4)*W,H*.75,60+rnd(i)*80,0,Math.PI*2);ctx.fill();}}
  else if(b==="TEMPLE"){for(let i=0;i<10;i++){const x=i*W/9;ctx.fillStyle="rgba(30,55,38,.65)";ctx.fillRect(x,H*.35+rnd(i)*70,42,H);}}
  else if(b==="SKY"){for(let i=0;i<9;i++){const x=rnd(i*4)*W,y=H*.2+rnd(i*5)*H*.6;ctx.fillStyle="rgba(255,255,255,.6)";ctx.beginPath();ctx.ellipse(x,y,70,18,0,0,Math.PI*2);ctx.fill();}}
  else if(b==="VOID"){for(let i=0;i<160;i++){ctx.fillStyle="rgba(210,230,255,.55)";ctx.fillRect(rnd(i*2)*W,rnd(i*5)*H,1.5,1.5);}}
}

function platformColor(p){
  const b=biome(p.index);
  if(b==="JUNGLE")return["#91b66a","#253c29"];
  if(b==="SNOW")return["#f3fbff","#4d6878"];
  if(b==="CITY")return["#aab5bd","#28343e"];
  if(b==="NEON")return["#7efff1","#2b2871"];
  if(b==="VOLCANO")return["#ff884e","#35100c"];
  return["#d4c68c","#3b3520"];
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function drawPlatforms(){
  for(const p of platforms){
    const y=p.y-state.cameraY;if(y<-30||y>H+30)continue;
    const [a,b]=platformColor(p);const g=ctx.createLinearGradient(0,y,0,y+p.h);g.addColorStop(0,a);g.addColorStop(1,b);
    ctx.save();ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=15;ctx.fillStyle=g;roundRect(p.x,y,p.w,p.h,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="rgba(255,255,255,.35)";roundRect(p.x+5,y+2,p.w-10,3,2);ctx.fill();ctx.restore();
  }
}
function drawPickups(t){
  for(const c of pickups){
    if(c.taken)continue;
    const y=c.y-state.cameraY;
    if(y<-50||y>H+50)continue;
    if(c.type==="coin"){
      ctx.save();ctx.translate(c.x,y);ctx.rotate(Math.sin(t*3+c.x)*.08);
      const g=ctx.createRadialGradient(-4,-5,2,0,0,12);g.addColorStop(0,"#fff5aa");g.addColorStop(.35,"#ffd84e");g.addColorStop(1,"#b56b0c");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,11+Math.sin(t*6+c.x)*1.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#fff1a0";ctx.lineWidth=2;ctx.stroke();
      ctx.restore();
    }else{
      ctx.save();ctx.translate(c.x,y);ctx.rotate(Math.sin(t*2)*.05);ctx.fillStyle="#8f5c28";ctx.fillRect(-14,-11,28,22);ctx.strokeStyle="#ffd45c";ctx.lineWidth=3;ctx.strokeRect(-14,-11,28,22);ctx.fillStyle="#ffd45c";ctx.fillRect(-3,-4,6,8);ctx.restore();
    }
  }
}
function drawBoss(){
  if(!state.boss)return;
  const b=state.boss,y=b.y-state.cameraY;ctx.save();ctx.translate(b.x,y);ctx.shadowBlur=28;ctx.shadowColor="rgba(255,70,80,.5)";
  const g=ctx.createRadialGradient(0,0,5,0,0,58);g.addColorStop(0,"#fff");g.addColorStop(.12,"#ff6b6b");g.addColorStop(.7,"#64232f");g.addColorStop(1,"#160b12");ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,48,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle="#ffcf7a";ctx.lineWidth=3;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*32,Math.sin(a)*32);ctx.lineTo(Math.cos(a)*70,Math.sin(a)*70);ctx.stroke();}
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-14,-8,7,0,Math.PI*2);ctx.arc(14,-8,7,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawPlayer(t){
  const x=player.x+player.w/2,y=player.y-state.cameraY+player.h/2;ctx.save();ctx.translate(x,y);
  if(Math.abs(player.vx)>20&&!state.jetpack)ctx.rotate(Math.max(-.18,Math.min(.18,player.vx*.00045)));
  if(state.jetpack){ctx.fillStyle="#303d47";roundRect(-24,-14,48,28,9);ctx.fill();for(let i=0;i<2;i++){ctx.fillStyle=i?"#ffd86b":"#ff6b36";ctx.beginPath();ctx.moveTo(-10+i*20,13);ctx.lineTo(-3+i*20,42+Math.sin(t*30+i)*6);ctx.lineTo(5+i*20,13);ctx.fill();}}
  ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(0,37,25,6,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#121922";ctx.lineWidth=8;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-9,18);ctx.lineTo(-16,33);ctx.moveTo(9,18);ctx.lineTo(16,33);ctx.stroke();
  const suit=ctx.createLinearGradient(-17,-20,17,23);suit.addColorStop(0,"#f0f6fa");suit.addColorStop(.35,"#465462");suit.addColorStop(1,"#10151c");ctx.fillStyle=suit;roundRect(-17,-20,34,44,11);ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.25)";ctx.lineWidth=1;
  for(let i=-14;i<=14;i+=7){ctx.beginPath();ctx.moveTo(i,-18);ctx.lineTo(i*.5,19);ctx.stroke();}
  for(let q=-11;q<=12;q+=7){ctx.beginPath();ctx.arc(0,q,15-Math.abs(q)*.18,0,Math.PI*2);ctx.stroke();}
  ctx.strokeStyle="#17212a";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-14,-9);ctx.lineTo(-29,5);ctx.moveTo(14,-9);ctx.lineTo(29,5);ctx.stroke();
  ctx.fillStyle="#101820";ctx.beginPath();ctx.arc(0,-29,15,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#edfaff";ctx.beginPath();ctx.ellipse(-5,-31,5,3,-.2,0,Math.PI*2);ctx.ellipse(5,-31,5,3,.2,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawParticles(){for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.type==="flame"?"#ff9d38":p.type==="web"?"#dff7ff":p.type==="impact"?"#ffcf7a":"#fff";ctx.beginPath();ctx.arc(p.x,p.y-state.cameraY,p.type==="dust"?3:2.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
function drawWeather(t){
  if(state.weather==="rain"){for(let i=0;i<120;i++){const x=rnd(i*8)*W,y=(rnd(i*11)*H+t*500)%H;ctx.strokeStyle="rgba(180,220,255,.28)";ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-4,y+12);ctx.stroke();}}
  if(state.weather==="snow"){for(let i=0;i<90;i++){const x=rnd(i*5)*W,y=(rnd(i*7)*H+t*40)%H;ctx.fillStyle="rgba(255,255,255,.45)";ctx.fillRect(x,y,2,2);}}
}
function render(t){ctx.clearRect(0,0,W,H);drawBackground(t);drawWeather(t);drawPlatforms();drawPickups(t);drawBoss();drawParticles();drawPlayer(t);}

function loop(now){
  if(!state.running)return;
  const dt=Math.min(.033,(now-state.last)/1000||.016);
  state.last=now;
  physics(dt);
  render(now/1000);
  requestAnimationFrame(loop);
}

function maybeEvent(){
  if(state.score<20||state.eventTimer>0)return;
  state.eventTimer=6;
  const r=rnd(state.score*17);
  if(r<.28){state.weather="rain";toast("🌧️ Начался дождь");}
  else if(r<.5){state.weather="snow";toast("❄️ Снегопад");}
  else if(r<.68){state.coins+=15;profile.totalCoins+=15;toast("💰 Счастливый момент +15 монет");}
  else if(r<.82){state.slowTimer=6;toast("⏳ Время немного замедлилось");}
  else {toast("☄️ Осторожно: поток метеоров!");}
}
function tickEvents(){if(state.eventTimer>0)state.eventTimer-=1/60;else maybeEvent();}

async function loadLeaderboard(period=currentPeriod){
  currentPeriod=period;const box=$("leaderboard");const d=window.SPIDER_CONFIG||{};
  if(!d.SUPABASE_URL||!d.SUPABASE_ANON_KEY){box.innerHTML="<div class='row'><span>•</span><span>Онлайн-таблица не настроена</span><span>Supabase</span></div>";return;}
  let q=`${d.SUPABASE_URL}/rest/v1/scores?select=name,score,created_at&order=score.desc&limit=10`;
  const now=new Date(),today=dayKey(now);
  if(period==="today")q+=`&created_at=gte.${today}T00:00:00.000Z`;
  if(period==="week"){const d7=new Date(now);d7.setDate(d7.getDate()-7);q+=`&created_at=gte.${d7.toISOString()}`;}
  try{
    const r=await fetch(q,{headers:{apikey:d.SUPABASE_ANON_KEY,Authorization:`Bearer ${d.SUPABASE_ANON_KEY}`}});
    if(!r.ok)throw new Error();
    const rows=await r.json();
    box.innerHTML=rows.length?rows.map((x,i)=>`<div class="row"><span>${i+1}</span><span>${escapeHtml(x.name)}</span><span class="pts">${x.score}</span></div>`).join(""):"<div class='row'><span>•</span><span>Пока пусто</span><span></span></div>";
  }catch{box.innerHTML="<div class='row'><span>!</span><span>Не удалось загрузить рейтинг</span><span></span></div>";}
}
async function submitScore(){
  const d=window.SPIDER_CONFIG||{},input=$("nameInput");
  const name=(input.value.trim()||profile.name||"Игрок").slice(0,16);
  profile.name=name;
  if($("submitScore"))$("submitScore").disabled=true;
  if(!d.SUPABASE_URL||!d.SUPABASE_ANON_KEY){save();if($("submitScore"))$("submitScore").disabled=false;return;}
  try{
    const r=await fetch(`${d.SUPABASE_URL}/rest/v1/scores`,{method:"POST",headers:{apikey:d.SUPABASE_ANON_KEY,Authorization:`Bearer ${d.SUPABASE_ANON_KEY}`,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({name,score:state.score})});
    if(!r.ok)throw new Error();
    await loadLeaderboard(currentPeriod);
  }catch{alert("Не удалось сохранить результат.");}
  finally{if($("submitScore"))$("submitScore").disabled=false;save();}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

$("submitScore").onclick=submitScore;
document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");loadLeaderboard(tab.dataset.period);});

$("profileBtn").onclick=()=>{$("profileOverlay").classList.remove("hidden");updateProfileUI();};
$("closeProfile").onclick=()=>$("profileOverlay").classList.add("hidden");
$("soundBtn").onclick=()=>{state.sound=!state.sound;updateMusicVolume();save();updateHud();};

function endGame(){
  state.running=false;state.over=true;$("lifeOverlay").classList.add("hidden");$("gameOverOverlay").classList.remove("hidden");
  profile.best=Math.max(profile.best,state.score);$("finalResult").textContent=`Высота: ${state.score} платформ · Монеты: ${state.runCoins}`;
  updateProfileUI();save();loadLeaderboard(currentPeriod);
}

function startGame(){
  state.over=false;state.life=false;state.running=true;
  $("startOverlay").classList.add("hidden");$("gameOverOverlay").classList.add("hidden");$("lifeOverlay").classList.add("hidden");
  resetWorld();updateHud();render(performance.now()/1000);state.last=performance.now();startMusic();updateMusicVolume();requestAnimationFrame(loop);
}

$("startBtn").onclick=startGame;
$("restartBtn").onclick=startGame;
$("continueBtn").onclick=continueLife;
$("endLifeBtn").onclick=endGame;

window.addEventListener("pointerdown",()=>{ if(audioCtx&&audioCtx.state==="suspended")audioCtx.resume();},{once:false});

function init(){
  dailyReward();
  const today=dayKey();
  if(profile.lastDaily!==today)claimDaily();
  resetWorld();updateHud();render(0);updateProfileUI();
}
init();

setInterval(()=>{
  tickEvents();
  updateHud();
},1000/60);

})();
