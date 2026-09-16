(() => {
"use strict";
const canvas=document.getElementById("game"),ctx=canvas.getContext("2d");
const $=id=>document.getElementById(id);
let W=innerWidth,H=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
function resize(){W=innerWidth;H=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+"px";canvas.style.height=H+"px";ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener("resize",resize);resize();

const CFG={gravity:1850,move:480,jump:-790,jump2:-740,gap:96,maxPlatforms:44};
const state={running:false,over:false,life:false,last:0,acc:0,score:0,coins:0,lives:0,jumps:0,triple:false,jetpack:false,cameraY:0,targetCameraY:0,highestPlatform:0,shake:0,sound:true,zone:0,boss:null,bossHp:0,bossMax:0,bannerTimer:0};
const saveKey="spiderJumpSaveULTRA";
const saveData=JSON.parse(localStorage.getItem(saveKey)||"{}");
state.coins=saveData.coins||0;
state.triple=!!saveData.triple;
state.lives=saveData.lives||0;
state.sound=saveData.sound!==false;

const player={x:W*.5,y:0,vx:0,vy:0,w:46,h:68,onGround:false,web:0};
let platforms=[],particles=[],stars=[],audioCtx=null;

function rnd(n){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)}
function difficulty(){return Math.floor(state.score/100)}
function zone(){return Math.floor(state.score/1000)}
function gapFor(i){return Math.max(67,CFG.gap-difficulty()*3)}
function widthFor(i){return Math.max(72,154-difficulty()*3-rnd(i)*35)}
function biome(score){if(score<50)return"JUNGLE";if(score<180)return"SNOW";if(score<400)return"CITY";if(score<1000)return"NEON";return ["NEON","VOLCANO","TEMPLE","SKY","VOID"][zone()%5]}
function save(){localStorage.setItem(saveKey,JSON.stringify({coins:state.coins,triple:state.triple,lives:state.lives,sound:state.sound}))}
function updateHud(){
 $("score").textContent=state.score;$("coins").textContent=state.coins;$("lives").textContent=state.lives;
 $("biome").textContent=biome(state.score);
 $("jetpackBtn").disabled=state.coins<50;$("tripleBtn").disabled=state.coins<25||state.triple;$("lifeBtn").disabled=state.coins<200;
 $("soundBtn").textContent=state.sound?"🔊":"🔇";
 $("inventory").innerHTML=(state.triple?'<span class="pill">✦ Тройной прыжок</span>':"")+(state.lives?`<span class="pill">❤ Жизней: ${state.lives}</span>`:"");
}
function sound(type){
 if(!state.sound)return;
 try{
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.connect(g);g.connect(audioCtx.destination);let f=type==="jump"?520:type==="coin"?880:type==="hit"?110:type==="boss"?70:320;
  o.frequency.value=f;o.type=type==="hit"?"sawtooth":"sine";g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.start();o.stop(audioCtx.currentTime+.12)
 }catch{}
}
$("soundBtn").onclick=()=>{state.sound=!state.sound;save();updateHud()};

function makePlatform(y,index,x){
 const w=widthFor(index);if(x==null)x=35+rnd(index*7+1)*(W-w-70);
 return{x:Math.max(25,Math.min(W-w-25,x)),y,w,h:16,index,metal:rnd(index*4)>.58};
}
function resetWorld(){
 platforms=[];particles=[];state.score=0;state.cameraY=0;state.targetCameraY=0;state.highestPlatform=0;state.zone=0;state.boss=null;
 const base=H-118;platforms.push(makePlatform(base,0,W*.5-75));player.x=W*.5;player.y=base-player.h;player.vx=0;player.vy=-790;player.onGround=false;state.jumps=1;
 let y=base;for(let i=1;i<CFG.maxPlatforms;i++){y-=gapFor(i);platforms.push(makePlatform(y,i))}
}
function extendWorld(){
 while(platforms.length<CFG.maxPlatforms){const q=platforms[platforms.length-1],i=q.index+1;platforms.push(makePlatform(q.y-gapFor(i),i))}
 while(platforms.length>12&&platforms[0].y>state.cameraY+H+280)platforms.shift();
}
function spawn(x,y,n=8,type="spark"){
 for(let i=0;i<n;i++){const a=rnd((x+y+i)*.13)*Math.PI*2,s=40+rnd(i*7)*160;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,life:.35+rnd(i)*.45,max:.8,type})}
}
function jump(){
 if(!state.running||state.life||state.over)return;
 if(player.onGround){player.vy=CFG.jump;player.onGround=false;state.jumps=1;spawn(player.x+23,player.y+60,5,"web");sound("jump");return}
 const max=state.triple?3:2;if(state.jumps<max){player.vy=state.jumps===1?CFG.jump2:-700;state.jumps++;spawn(player.x+23,player.y+60,4,"web");sound("jump")}
}
const keys={left:false,right:false};
addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["a","arrowleft"].includes(k)){keys.left=true;e.preventDefault()}if(["d","arrowright"].includes(k)){keys.right=true;e.preventDefault()}if([" ","w","arrowup"].includes(k)){jump();e.preventDefault()}});
addEventListener("keyup",e=>{const k=e.key.toLowerCase();if(["a","arrowleft"].includes(k))keys.left=false;if(["d","arrowright"].includes(k))keys.right=false});
canvas.addEventListener("pointerdown",()=>jump());
function bind(id,s){const e=$(id),on=a=>{a.preventDefault();keys[s]=true},off=a=>{a.preventDefault();keys[s]=false};e.addEventListener("pointerdown",on);e.addEventListener("pointerup",off);e.addEventListener("pointercancel",off);e.addEventListener("pointerleave",off)}bind("leftBtn","left");bind("rightBtn","right");

function land(prev){
 if(player.vy<=0)return;
 const b=player.y+player.h,pb=prev+player.h;
 for(const p of platforms)if(b>=p.y&&pb<=p.y&&player.x+player.w*.82>p.x&&player.x+player.w*.18<p.x+p.w){
  player.y=p.y-player.h;
player.vy=0;
player.onGround=true;
state.jumps=0;
  spawn(player.x+23,p.y,9,"dust");sound("hit");
  if(p.index>state.highestPlatform){
   const old=state.highestPlatform;state.highestPlatform=p.index;state.score=p.index;
   const before=Math.floor(old/5),after=Math.floor(p.index/5);if(after>before){state.coins+=5*(after-before);sound("coin")}
   const z=zone();if(z!==state.zone){state.zone=z;showZone(z)}
   if(p.index>0&&p.index%500===0&&!state.boss)startBoss(p.index);
   updateHud();save();
  }break
 }
}
function physics(dt){
 const prev=player.y,dir=(keys.right?1:0)-(keys.left?1:0);
 player.vx+=(dir*CFG.move-player.vx)*Math.min(1,dt*11);if(!dir)player.vx*=Math.pow(.0005,dt);player.x+=player.vx*dt;
 if(player.x<-player.w*.5)player.x=W-player.w*.5;if(player.x>W-player.w*.5)player.x=-player.w*.5;
 player.vy+=CFG.gravity*dt;player.y+=player.vy*dt;player.onGround=false;land(prev);
 if(player.y<state.targetCameraY+H*.38)state.targetCameraY=player.y-H*.38;
 state.cameraY+=(state.targetCameraY-state.cameraY)*(1-Math.pow(.00015,dt));extendWorld();
 updateParticles(dt);updateBoss(dt);
 if(player.y-state.cameraY>H+160)fail();
}
function fail(){if(state.lives>0){state.life=true;state.running=false;$("lifeOverlay").classList.remove("hidden");}else endGame()}
function continueLife(){
 const p=platforms.filter(p=>p.y>state.cameraY-80&&p.y<state.cameraY+H*.85).sort((a,b)=>a.y-b.y)[0]||platforms[platforms.length-1];
 player.x=p.x+p.w*.5;player.y=p.y-player.h;player.vy=CFG.jump;state.cameraY=Math.max(0,p.y-H*.7);state.targetCameraY=state.cameraY;
 state.lives--;state.life=false;$("lifeOverlay").classList.add("hidden");state.running=true;save();updateHud();requestAnimationFrame(loop)
}
$("continueBtn").onclick=continueLife;$("endLifeBtn").onclick=endGame;

function buy(t){
 if(t==="jet"&&state.coins>=50&&!state.jetpack){
  state.coins-=50;
  state.jetpack=true;
  state.jetpackUntil=state.highestPlatform+50;
  player.vy=-900;
  state.targetCameraY=player.y-H*.45;
  spawn(player.x+23,player.y+player.h,25,"flame");
  sound("boss");
}
 if(t==="triple"&&state.coins>=25&&!state.triple){state.coins-=25;state.triple=true;sound("coin")}
 if(t==="life"&&state.coins>=200){state.coins-=200;state.lives++;sound("coin")}
 save();updateHud()
}
$("jetpackBtn").onclick=()=>buy("jet");$("tripleBtn").onclick=()=>buy("triple");$("lifeBtn").onclick=()=>buy("life");

function startBoss(at){
 state.boss={x:W*.5,y:state.cameraY+130,vx:130,phase:0,defeated:false};state.bossMax=100+difficulty()*8;state.bossHp=state.bossMax;
 let bar=document.getElementById("bossbar");if(!bar){bar=document.createElement("div");bar.id="bossbar";bar.className="bossbar";bar.innerHTML="<div class='name'>GUARDIAN</div><div class='track'><div class='fill'></div></div>";document.body.appendChild(bar)}
 bar.style.display="block";sound("boss");showZoneText("GUARDIAN","Победи хранителя высоты");
}
function updateBoss(dt){
 if(!state.boss||state.boss.defeated)return;
 const b=state.boss;b.phase+=dt;b.x+=b.vx*dt;if(b.x<70||b.x>W-70)b.vx*=-1;b.y=state.cameraY+145+Math.sin(b.phase*2)*55;
 // Collision with player while falling can damage boss; player gets bounced away.
 const px=player.x+player.w/2,py=worldY(player.y+player.h/2);
 if(Math.abs(px-b.x)<62&&Math.abs(py-b.y)<70&&player.vy>0){
   state.bossHp-=22;player.vy=-880;spawn(b.x,b.y,20,"impact");sound("boss");state.shake=10;
   if(state.bossHp<=0){b.defeated=true;state.coins+=50;spawn(b.x,b.y,45,"spark");sound("coin");document.getElementById("bossbar").style.display="none";state.boss=null;save();updateHud()}
 }
 const fill=document.querySelector("#bossbar .fill");if(fill)fill.style.width=Math.max(0,state.bossHp/state.bossMax*100)+"%";
}
function worldY(y){return y}
function updateParticles(dt){
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=420*dt;p.life-=dt}
 particles=particles.filter(p=>p.life>0)
}
function showZone(z){
 const names=["JUNGLE","SNOW","CITY","NEON","VOLCANO","TEMPLE","SKY","VOID"],n=names[z%names.length];
 showZoneText(n,z===0?"Вход в бесконечную зону":"Новая зона · сложность повышена")
}
function showZoneText(a,b){let el=$("zoneBanner");if(!el){el=document.createElement("div");el.id="zoneBanner";el.className="zoneBanner";el.innerHTML="<b></b><span></span>";document.body.appendChild(el)}el.querySelector("b").textContent=a;el.querySelector("span").textContent=b;el.classList.remove("show");void el.offsetWidth;el.classList.add("show");clearTimeout(state.bannerTimer);state.bannerTimer=setTimeout(()=>el.classList.remove("show"),2200)}

function bg(t){
 const s=state.score,b=biome(s),night=(Math.floor(s/30)%2===1),z=zone();
 const sky=ctx.createLinearGradient(0,0,0,H);
 const palettes={
  JUNGLE:night?["#06120e","#102b22"]:["#75b5c8","#214c39"],
  SNOW:night?["#07111c","#263d50"]:["#a8d2e7","#547a91"],
  CITY:night?["#050913","#15283d"]:["#6c94b1","#233c4f"],
  NEON:night?["#080417","#241044"]:["#553e9c","#1d607a"],
  VOLCANO:["#160707","#512016"],TEMPLE:["#07100b","#2d452a"],SKY:["#78bce7","#d6efff"],VOID:["#020208","#11111f"]
 };
 const p=palettes[b]||palettes.VOID;sky.addColorStop(0,p[0]);sky.addColorStop(1,p[1]);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 if(b==="JUNGLE")jungle(t,night);else if(b==="SNOW")snow(t,night);else if(b==="CITY")city(t,night);else if(b==="NEON")neon(t);else if(b==="VOLCANO")volcano(t);else if(b==="TEMPLE")temple(t);else if(b==="SKY")skyZone(t);else voidZone(t);
 // subtle vignette
 const v=ctx.createRadialGradient(W*.5,H*.42,Math.min(W,H)*.15,W*.5,H*.5,Math.max(W,H)*.75);v.addColorStop(0,"rgba(255,255,255,0)");v.addColorStop(1,"rgba(0,0,0,.34)");ctx.fillStyle=v;ctx.fillRect(0,0,W,H)
}
function jungle(t,n){for(let l=0;l<4;l++){ctx.fillStyle=n?`rgba(2,20,14,${.7-l*.1})`:`rgba(${15+l*7},${50+l*12},${32+l*5},${.65-l*.1})`;for(let i=0;i<16;i++){let x=rnd(i+l*40)*W,y=H*.54+l*70;ctx.beginPath();ctx.ellipse(x,y,65+l*14,160+l*18,0,0,Math.PI*2);ctx.fill()}}for(let i=0;i<16;i++){let x=rnd(i*11)*W;ctx.strokeStyle=n?"rgba(2,30,20,.9)":"rgba(18,70,39,.8)";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x,H);ctx.quadraticCurveTo(x-35,H*.6,x+Math.sin(i)*25,H*.18);ctx.stroke()}}
function snow(t,n){for(let i=0;i<12;i++){let x=i*W/11;ctx.fillStyle=n?"rgba(120,160,185,.34)":"rgba(240,250,255,.92)";ctx.beginPath();ctx.moveTo(x,H*.75);ctx.lineTo(x+W/13,H*.25);ctx.lineTo(x+W/7,H*.75);ctx.fill()}for(let i=0;i<130;i++){let x=rnd(i*3)*W,y=(rnd(i*9)*H+t*(15+rnd(i)*35))%H;ctx.fillStyle=n?"rgba(220,240,255,.35)":"rgba(255,255,255,.7)";ctx.fillRect(x,y,2,2)}}
function city(t,n){for(let i=0;i<18;i++){let x=rnd(i*9)*W,w=40+rnd(i*3)*90,h=180+rnd(i*4)*360;ctx.fillStyle=n?"rgba(6,15,28,.9)":"rgba(30,54,72,.78)";ctx.fillRect(x,H-h,w,h);for(let yy=H-h+15;yy<H;yy+=26)for(let xx=x+8;xx<x+w-5;xx+=18){ctx.fillStyle=n?"rgba(255,205,92,.5)":"rgba(210,232,242,.28)";ctx.fillRect(xx,yy,6,9)}}}
function neon(t){for(let i=0;i<18;i++){let x=rnd(i*7)*W,y=H*.2+rnd(i*4)*H*.65;ctx.fillStyle=`rgba(${120+i%3*50},${50+i%4*35},255,.22)`;ctx.fillRect(x,y,2,2)}for(let i=0;i<8;i++){let x=i*W/7;ctx.strokeStyle="rgba(55,240,255,.18)";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,H);ctx.lineTo(x+100,H*.1);ctx.stroke()}}
function volcano(t){ctx.fillStyle="rgba(255,85,25,.18)";for(let i=0;i<10;i++){let x=rnd(i*5)*W;ctx.beginPath();ctx.arc(x,H*.72,70+rnd(i)*80,0,Math.PI*2);ctx.fill()}ctx.fillStyle="#2a1010";ctx.beginPath();ctx.moveTo(0,H*.8);for(let x=0;x<=W;x+=70)ctx.lineTo(x,H*.58+Math.sin(x*.01)*70);ctx.lineTo(W,H);ctx.fill()}
function temple(t){for(let i=0;i<9;i++){let x=i*W/8;ctx.fillStyle="rgba(36,62,42,.75)";ctx.fillRect(x,H*.32+rnd(i)*80,45,H);ctx.fillStyle="rgba(90,120,70,.4)";ctx.beginPath();ctx.arc(x+22,H*.3,80,0,Math.PI*2);ctx.fill()}}
function skyZone(t){for(let i=0;i<10;i++){let x=rnd(i*8)*W,y=H*.15+rnd(i*5)*H*.55;ctx.fillStyle="rgba(255,255,255,.6)";ctx.beginPath();ctx.ellipse(x,y,80,22,0,0,Math.PI*2);ctx.fill()}}
function voidZone(t){for(let i=0;i<160;i++){let x=rnd(i*2)*W,y=rnd(i*6)*H;ctx.fillStyle="rgba(190,220,255,.6)";ctx.fillRect(x,y,1.5,1.5)}}

function platformColor(p){const b=biome(p.index),metal=p.metal;return b==="JUNGLE"?["#91b66a","#253c29"]:b==="SNOW"?["#f3fbff","#4d6878"]:b==="CITY"?["#aab5bd","#28343e"]:b==="NEON"?["#7efff1","#2b2871"]:b==="VOLCANO"?["#ff884e","#35100c"]:["#d4c68c","#3b3520"]}
function drawPlatforms(){
 for(const p of platforms){let y=p.y-state.cameraY;if(y<-40||y>H+40)continue;const c=platformColor(p),g=ctx.createLinearGradient(0,y,0,y+p.h);g.addColorStop(0,c[0]);g.addColorStop(.38,c[0]);g.addColorStop(1,c[1]);ctx.save();ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=18;ctx.fillStyle=g;roundRect(p.x,y,p.w,p.h,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="rgba(255,255,255,.35)";roundRect(p.x+5,y+2,p.w-10,3,2);ctx.fill();if(p.metal){ctx.strokeStyle="rgba(255,255,255,.15)";ctx.lineWidth=1;for(let x=p.x+12;x<p.x+p.w;x+=18){ctx.beginPath();ctx.moveTo(x,y+6);ctx.lineTo(x+5,y+13);ctx.stroke()}}ctx.restore()}
}
function drawBoss(t){if(!state.boss)return;const b=state.boss,y=b.y-state.cameraY;ctx.save();ctx.translate(b.x,y);ctx.shadowBlur=28;ctx.shadowColor="rgba(255,70,80,.5)";let g=ctx.createRadialGradient(0,0,5,0,0,58);g.addColorStop(0,"#fff");g.addColorStop(.12,"#ff6b6b");g.addColorStop(.7,"#64232f");g.addColorStop(1,"#160b12");ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,48,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle="#ffcf7a";ctx.lineWidth=3;for(let i=0;i<8;i++){let a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*32,Math.sin(a)*32);ctx.lineTo(Math.cos(a)*70,Math.sin(a)*70);ctx.stroke()}ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-14,-8,7,0,Math.PI*2);ctx.arc(14,-8,7,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawPlayer(t){
 const x=player.x+player.w/2,y=player.y-state.cameraY+player.h/2;ctx.save();ctx.translate(x,y);ctx.rotate(Math.max(-.18,Math.min(.18,player.vx*.00045)));
 // web trail
 if(Math.abs(player.vx)>40||player.vy<-500){ctx.strokeStyle="rgba(225,245,255,.23)";ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-22,20+i*4);ctx.quadraticCurveTo(-50-i*15,28+i*6,-65-i*20,14+i*9);ctx.stroke()}}
 if(state.jetpack){ctx.fillStyle="#303d47";roundRect(-24,-14,48,28,9);ctx.fill();for(let i=0;i<2;i++){ctx.fillStyle=i?"#ffd86b":"#ff6b36";ctx.beginPath();ctx.moveTo(-10+i*20,13);ctx.lineTo(-3+i*20,42+Math.sin(t*30+i)*6);ctx.lineTo(5+i*20,13);ctx.fill()}}
 ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(0,37,25,6,0,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle="#121922";ctx.lineWidth=8;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(-9,18);ctx.lineTo(-16,33);ctx.moveTo(9,18);ctx.lineTo(16,33);ctx.stroke();
 const suit=ctx.createLinearGradient(-17,-20,17,23);suit.addColorStop(0,"#f0f6fa");suit.addColorStop(.35,"#465462");suit.addColorStop(1,"#10151c");ctx.fillStyle=suit;roundRect(-17,-20,34,44,11);ctx.fill();
 ctx.strokeStyle="rgba(255,255,255,.25)";ctx.lineWidth=1;for(let i=-14;i<=14;i+=7){ctx.beginPath();ctx.moveTo(i,-18);ctx.lineTo(i*.5,19);ctx.stroke()}for(let q=-11;q<=12;q+=7){ctx.beginPath();ctx.arc(0,q,15-Math.abs(q)*.18,0,Math.PI*2);ctx.stroke()}
 ctx.strokeStyle="#17212a";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-14,-9);ctx.lineTo(-29,5);ctx.moveTo(14,-9);ctx.lineTo(29,5);ctx.stroke();
 ctx.fillStyle="#101820";ctx.beginPath();ctx.arc(0,-29,15,0,Math.PI*2);ctx.fill();ctx.fillStyle="#edfaff";ctx.beginPath();ctx.ellipse(-5,-31,5,3,-.2,0,Math.PI*2);ctx.ellipse(5,-31,5,3,.2,0,Math.PI*2);ctx.fill();ctx.restore()
}
function drawParticles(){for(const p of particles){let a=Math.max(0,p.life/p.max);ctx.globalAlpha=a;ctx.fillStyle=p.type==="flame"?"#ff9d38":p.type==="web"?"#dff7ff":p.type==="impact"?"#ffcf7a":"#fff";ctx.beginPath();ctx.arc(p.x,p.y-state.cameraY, p.type==="dust"?3:2.5,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}

function render(t){ctx.clearRect(0,0,W,H);bg(t);drawPlatforms();drawBoss(t);drawParticles();drawPlayer(t)}
function loop(now){if(!state.running)return;const dt=Math.min(.033,(now-state.last)/1000||.016);state.last=now;state.acc+=dt;while(state.acc>=1/120){physics(1/120);state.acc-=1/120}render(now/1000);requestAnimationFrame(loop)}

async function loadLeaderboard(){
 const box=$("leaderboard"),data=window.SPIDER_CONFIG||{};box.innerHTML="<div class='row'><span>—</span><span>Загрузка...</span><span></span></div>";
 if(!data.SUPABASE_URL||!data.SUPABASE_ANON_KEY){box.innerHTML="<div class='row'><span>•</span><span>Онлайн-таблица не настроена</span><span>README</span></div>";return}
 try{const r=await fetch(`${data.SUPABASE_URL}/rest/v1/scores?select=name,score,created_at&order=score.desc&limit=10`,{headers:{apikey:data.SUPABASE_ANON_KEY,Authorization:`Bearer ${data.SUPABASE_ANON_KEY}`}});if(!r.ok)throw 0;const rows=await r.json();box.innerHTML=rows.length?rows.map((x,i)=>`<div class="row"><span>${i+1}</span><span>${esc(x.name)}</span><span class="pts">${x.score}</span></div>`).join(""):"<div class='row'><span>•</span><span>Пока пусто</span><span></span></div>"}catch{box.innerHTML="<div class='row'><span>!</span><span>Ошибка загрузки рейтинга</span><span></span></div>"}
}
async function submitScore(){
 const name=($("nameInput").value.trim()||"Игрок").slice(0,16),d=window.SPIDER_CONFIG||{};$("submitScore").disabled=true;
 if(!d.SUPABASE_URL||!d.SUPABASE_ANON_KEY){$("submitScore").disabled=false;return}
 try{const r=await fetch(`${d.SUPABASE_URL}/rest/v1/scores`,{method:"POST",headers:{apikey:d.SUPABASE_ANON_KEY,Authorization:`Bearer ${d.SUPABASE_ANON_KEY}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({name,score:state.score})});if(!r.ok)throw 0;await loadLeaderboard()}catch{alert("Не удалось сохранить результат.")}finally{$("submitScore").disabled=false}
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function endGame(){state.running=false;state.over=true;$("lifeOverlay").classList.add("hidden");$("gameOverOverlay").classList.remove("hidden");$("finalResult").textContent=`Высота: ${state.score} платформ · Монеты: ${state.coins}`;loadLeaderboard()}
$("submitScore").onclick=submitScore;$("continueBtn").onclick=continueLife;$("endLifeBtn").onclick=endGame;
$("startBtn").onclick=()=>{state.over=false;state.running=true;$("startOverlay").classList.add("hidden");resetWorld();updateHud();requestAnimationFrame(loop)};
$("restartBtn").onclick=()=>location.reload();updateHud();
})();
