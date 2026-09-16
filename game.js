const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const scoreEl=document.getElementById('score'),coinsEl=document.getElementById('coins'),livesEl=document.getElementById('lives');
const shopMessage=document.getElementById('shopMessage'),startScreen=document.getElementById('startScreen'),gameOverScreen=document.getElementById('gameOverScreen'),lifeScreen=document.getElementById('lifeScreen');
const finalScore=document.getElementById('finalScore'),finalCoins=document.getElementById('finalCoins');
const keys={left:false,right:false};let W=0,H=0,DPR=1,gameState='menu',score=0,coins=0,lives=0,jumpsUsed=0,tripleJumpAvailable=false,jetpackActive=false,jetpackTargetY=0,jetpackTrailTime=0,cameraY=0,cameraTargetY=0,platforms=[],highestPlatformY=0,lastLanded=-1,dayNight=0,dayNightTarget=0,messageTimer=0,lastTime=performance.now(),acc=0;
const DT=1/120,PHYS={gravity:1700,moveSpeed:430,jump:-760,second:-730,jetpack:-980};
let player={x:0,y:0,w:42,h:62,vx:0,vy:0,prevY:0,onGround:false};

function resize(){DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;canvas.width=W*DPR;canvas.height=H*DPR;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.setTransform(DPR,0,0,DPR,0,0)}addEventListener('resize',resize);resize();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function seeded(n){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)}
function biomeForScore(s){return s<50?0:s<100?1:2}
function blendFor(s){return s<50?clamp((s-43)/14,0,1):s<100?clamp((s-93)/14,0,1):0}

function setupPlatforms(){platforms=[];const sy=H-90;platforms.push({id:0,x:W/2-90,y:sy,w:180,h:20,biome:0,moving:false,vx:0});highestPlatformY=sy;let x=W/2-90;for(let i=1;i<180;i++){highestPlatformY-=78+seeded(i*3.1)*34;const w=120+seeded(i*5.7)*70;x=clamp(x+(seeded(i*7.2)-.5)*220,20,Math.max(20,W-w-20));platforms.push({id:i,x,y:highestPlatformY,w,h:18,biome:biomeForScore(i),moving:i>=25&&i%8===0,vx:(seeded(i*9.8)>.5?1:-1)*(45+seeded(i*4.4)*45)})}}

function resetGame(){score=0;coins=0;lives=0;jumpsUsed=0;tripleJumpAvailable=false;jetpackActive=false;jetpackTargetY=0;cameraY=0;cameraTargetY=0;lastLanded=-1;dayNight=0;dayNightTarget=0;setupPlatforms();const p=platforms[0];player.x=p.x+p.w/2-player.w/2;player.y=p.y-player.h;player.prevY=player.y;player.vy=0;player.onGround=true;updateHUD();updateButtons()}
function updateHUD(){scoreEl.textContent=score;coinsEl.textContent=coins;livesEl.textContent=lives}
function msg(t){shopMessage.textContent=t;messageTimer=2.2}
function updateButtons(){document.getElementById('jetpackBtn').disabled=gameState!=='playing'||jetpackActive||coins<50;document.getElementById('tripleBtn').disabled=gameState!=='playing'||tripleJumpAvailable||coins<25;document.getElementById('lifeBtn').disabled=gameState!=='playing'||coins<200}
function start(){resetGame();gameState='playing';startScreen.classList.add('hidden');gameOverScreen.classList.add('hidden');lifeScreen.classList.add('hidden')}
function finish(){gameState='gameover';finalScore.textContent=score;finalCoins.textContent=coins;gameOverScreen.classList.remove('hidden')}
function jump(){if(gameState!=='playing'||jetpackActive)return;const max=tripleJumpAvailable?3:2;if(jumpsUsed>=max)return;player.vy=jumpsUsed===0?PHYS.jump:PHYS.second;jumpsUsed++;player.onGround=false}
function land(p){player.y=p.y-player.h;player.vy=0;player.onGround=true;jumpsUsed=0;if(p.id!==lastLanded){lastLanded=p.id;const oldM=Math.floor(score/5),newScore=Math.max(score,p.id),newM=Math.floor(newScore/5);score=newScore;if(newM>oldM){coins+=(newM-oldM)*5;msg(`+${(newM-oldM)*5} 🪙`)}dayNightTarget=score%2?1:0;updateHUD();updateButtons()}}
function buyJet(){if(coins<50){msg('Нужно 50 🪙');return}coins-=50;jetpackActive=true;jetpackTargetY=player.y-50*95;player.vy=PHYS.jetpack;msg('🚀 Джетпак активирован!');updateHUD();updateButtons()}
function buyTriple(){if(coins<25){msg('Нужно 25 🪙');return}coins-=25;tripleJumpAvailable=true;jumpsUsed=0;msg('🕷️ Тройной прыжок куплен!');updateHUD();updateButtons()}
function buyLife(){if(coins<200){msg('Нужно 200 🪙');return}coins-=200;lives++;msg('❤️ Дополнительная жизнь получена!');updateHUD();updateButtons()}

function updatePlatforms(dt){for(const p of platforms)if(p.moving){p.x+=p.vx*dt;if(p.x<=10){p.x=10;p.vx=Math.abs(p.vx)}if(p.x+p.w>=W-10){p.x=W-10-p.w;p.vx=-Math.abs(p.vx)}}while(highestPlatformY>cameraY-H*2){const i=platforms.length;highestPlatformY-=78+seeded(i*3.1)*34;const w=120+seeded(i*5.7)*70;const prev=platforms[platforms.length-1];const x=clamp(prev.x+(seeded(i*7.2)-.5)*220,20,Math.max(20,W-w-20));platforms.push({id:i,x,y:highestPlatformY,w,h:18,biome:biomeForScore(i),moving:i>=25&&i%8===0,vx:(seeded(i*9.8)>.5?1:-1)*(45+seeded(i*4.4)*45)})}platforms=platforms.filter(p=>p.y<cameraY+H+250)}

function update(dt){if(gameState!=='playing')return;if(messageTimer>0&&(messageTimer-=dt)<=0)shopMessage.textContent='';dayNight+=(dayNightTarget-dayNight)*Math.min(1,dt*3.5);
if(keys.left&&!keys.right)player.x-=PHYS.moveSpeed*dt;if(keys.right&&!keys.left)player.x+=PHYS.moveSpeed*dt;player.x=clamp(player.x,8,W-player.w-8);player.prevY=player.y;
if(jetpackActive){jetpackTrailTime+=dt;player.vy=PHYS.jetpack;player.y+=player.vy*dt;if(player.y<=jetpackTargetY){player.y=jetpackTargetY;player.vy=100;jetpackActive=false;msg('🚀 Джетпак завершён!');updateButtons()}}else{player.vy+=PHYS.gravity*dt;player.y+=player.vy*dt}
updatePlatforms(dt);
if(!jetpackActive&&player.vy>=0){const pb=player.prevY+player.h,cb=player.y+player.h;for(const p of platforms){if(player.x+player.w>p.x&&player.x<p.x+p.w&&pb<=p.y&&cb>=p.y){land(p);break}}}
const desired=player.y-H*.42;if(desired<cameraTargetY)cameraTargetY=desired;cameraY+=(cameraTargetY-cameraY)*Math.min(1,dt*6);
if(player.y-cameraY>H+140){if(lives>0){gameState='life';lifeScreen.classList.remove('hidden')}else finish()}updateButtons()}

function sky(){const n=dayNight,g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,n>.5?'#07132d':'#67c7ff');g.addColorStop(1,n>.5?'#243b65':'#dff7ff');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);if(n>.12){ctx.globalAlpha=n;for(let i=0;i<90;i++){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(seeded(i*2.17)*W,seeded(i*5.91)*H*.72,.6+seeded(i*8.13)*1.6,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}ctx.globalAlpha=n;ctx.fillStyle='#fff4c7';ctx.beginPath();ctx.arc(W*.82,95,32,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1-n;ctx.fillStyle='#fff0a6';ctx.beginPath();ctx.arc(W*.82,95,36,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
function jungle(a){ctx.save();ctx.globalAlpha=a;const o1=(cameraY*.08)%260,o2=(cameraY*.15)%190;ctx.fillStyle='#2c7a45';for(let x=-100;x<W+120;x+=120){const xx=x-o1;ctx.beginPath();ctx.moveTo(xx,H);ctx.lineTo(xx+35,150);ctx.lineTo(xx+100,H);ctx.fill()}ctx.fillStyle='#174f35';for(let x=-80;x<W+120;x+=90){const xx=x-o2;ctx.beginPath();ctx.moveTo(xx,H);ctx.lineTo(xx+25,260);ctx.lineTo(xx+70,H);ctx.fill()}ctx.restore()}
function snow(a){ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#eaf5ff';ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=100)ctx.lineTo(x,280+Math.sin((x+cameraY*.1)*.008)*45);ctx.lineTo(W,H);ctx.closePath();ctx.fill();ctx.fillStyle='#b8d5e8';ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W;x+=120)ctx.lineTo(x,390+Math.sin((x-cameraY*.1)*.007)*70);ctx.lineTo(W,H);ctx.closePath();ctx.fill();ctx.restore()}
function city(a){ctx.save();ctx.globalAlpha=a;const base=H-50;for(let i=0;i<15;i++){const x=i*95-(cameraY*.04%95),h=150+seeded(i*11.2)*270;ctx.fillStyle=i%2?'#263c55':'#1e3148';ctx.fillRect(x,base-h,72,h);ctx.fillStyle='#ffd85a';for(let y=base-h+22;y<base-12;y+=30){if(seeded(i*100+y)>.28)ctx.fillRect(x+13,y,8,12);if(seeded(i*100+y+4)>.35)ctx.fillRect(x+40,y,8,12)}}ctx.restore()}
function background(){sky();const b=biomeForScore(score),bl=blendFor(score);if(b===0){jungle(1-bl);if(bl)snow(bl)}else if(b===1){snow(1-bl);if(bl)city(bl)}else city(1)}

function platform(p){const y=p.y-cameraY;if(y<-40||y>H+40)return;const b=biomeForScore(p.id);if(b===0){ctx.fillStyle='#6b4529';ctx.fillRect(p.x,y,p.w,p.h);ctx.fillStyle='#42a85f';ctx.fillRect(p.x,y,p.w,6)}else if(b===1){ctx.fillStyle='#d9efff';ctx.fillRect(p.x,y,p.w,p.h);ctx.fillStyle='#91bfdc';ctx.fillRect(p.x,y+p.h-4,p.w,4)}else{ctx.fillStyle='#3b4d66';ctx.fillRect(p.x,y,p.w,p.h);ctx.fillStyle='#8aa0b8';ctx.fillRect(p.x,y,p.w,5)}}
function playerDraw(){const x=player.x,y=player.y-cameraY;ctx.save();if(jetpackActive){const pulse=8+Math.sin(jetpackTrailTime*25)*5;ctx.fillStyle='#ffb300';ctx.beginPath();ctx.moveTo(x+11,y+55);ctx.lineTo(x+18,y+62+pulse);ctx.lineTo(x+24,y+55);ctx.closePath();ctx.fill();ctx.fillStyle='#ff5a36';ctx.beginPath();ctx.moveTo(x+14,y+55);ctx.lineTo(x+19,y+55+pulse-7);ctx.lineTo(x+22,y+55);ctx.closePath();ctx.fill();ctx.fillStyle='#46566b';ctx.fillRect(x-3,y+25,9,24);ctx.fillRect(x+36,y+25,9,24)}ctx.fillStyle='#151922';ctx.fillRect(x+8,y+22,26,31);ctx.fillStyle='#b72832';ctx.beginPath();ctx.arc(x+21,y+16,16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(x+15,y+14,5,8,-.25,0,Math.PI*2);ctx.ellipse(x+27,y+14,5,8,.25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e5e7eb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+21,y+29);ctx.lineTo(x+21,y+43);ctx.moveTo(x+21,y+32);ctx.lineTo(x+14,y+28);ctx.moveTo(x+21,y+35);ctx.lineTo(x+13,y+36);ctx.moveTo(x+21,y+38);ctx.lineTo(x+14,y+44);ctx.moveTo(x+21,y+32);ctx.lineTo(x+28,y+28);ctx.moveTo(x+21,y+35);ctx.lineTo(x+29,y+36);ctx.moveTo(x+21,y+38);ctx.lineTo(x+28,y+44);ctx.stroke();ctx.restore()}
function render(){ctx.setTransform(DPR,0,0,DPR,0,0);background();for(const p of platforms)platform(p);playerDraw()}
function loop(now){const d=Math.min((now-lastTime)/1000,.05);lastTime=now;acc+=d;while(acc>=DT){update(DT);acc-=DT}render();requestAnimationFrame(loop)}

function setKey(k,v){keys[k]=v}
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyA'||e.code==='ArrowLeft')setKey('left',true);if(e.code==='KeyD'||e.code==='ArrowRight')setKey('right',true);if(['Space','KeyW','ArrowUp'].includes(e.code)&&!e.repeat)jump()});
addEventListener('keyup',e=>{if(e.code==='KeyA'||e.code==='ArrowLeft')setKey('left',false);if(e.code==='KeyD'||e.code==='ArrowRight')setKey('right',false)});addEventListener('blur',()=>{keys.left=keys.right=false});
canvas.addEventListener('pointerdown',e=>{if(e.button===0)jump()});
function hold(el,k){const d=e=>{e.preventDefault();setKey(k,true)},u=e=>{e.preventDefault();setKey(k,false)};el.addEventListener('pointerdown',d);el.addEventListener('pointerup',u);el.addEventListener('pointercancel',u);el.addEventListener('pointerleave',u)}
hold(document.getElementById('leftBtn'),'left');hold(document.getElementById('rightBtn'),'right');
document.getElementById('jetpackBtn').onclick=buyJet;document.getElementById('tripleBtn').onclick=buyTriple;document.getElementById('lifeBtn').onclick=buyLife;
document.getElementById('startBtn').onclick=start;document.getElementById('restartBtn').onclick=start;
document.getElementById('useLifeBtn').onclick=()=>{if(lives<=0)return finish();lives--;lifeScreen.classList.add('hidden');gameState='playing';let safe=platforms.filter(p=>p.y>cameraY-H*.4&&p.y<cameraY+H).sort((a,b)=>Math.abs(a.y-(cameraY+H*.45))-Math.abs(b.y-(cameraY+H*.45)))[0]||platforms[0];player.x=safe.x+safe.w/2-player.w/2;player.y=safe.y-player.h;player.prevY=player.y;player.vy=0;jumpsUsed=0;updateHUD();updateButtons()};
document.getElementById('endBtn').onclick=()=>{lifeScreen.classList.add('hidden');finish()};
resetGame();requestAnimationFrame(loop);
