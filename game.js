(() => {
  "use strict";
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const muzyka = new Audio("assets/muzyka.mp3");
  muzyka.loop = true;
  muzyka.volume = 0.4;
  const W = 960, H = 540, WORLD = 5160, FLOOR = 455, GOAL = 500;
  const G = 1720, SPEED = 315, JUMP = -680;
  const ALL_IMAGES = ["pies_idle","pies_run1","pies_run2","pies_run3","pies_jump","pies_land","pies_happy","pies_duzy","beton","cegla","plan","piwo","pacholek","kolce","prezent","tlo_1"];
  const pics = {};
  for (const k of ALL_IMAGES) {
    const image = new Image();
    image.src = `assets/${k}.${k.startsWith("tlo_") ? "jpg" : "png"}`;
    pics[k] = image;
  }
  const ground = [
    {x:0,w:625}, {x:800,w:570}, {x:1540,w:520}, {x:2230,w:518},
    {x:2920,w:530}, {x:3630,w:450}, {x:4258,w:482}, {x:4920,w:240}
  ].map(p => ({...p, y:FLOOR, h:120, kind:"earth"}));
  const platforms = [
    {x:315,y:341,w:116,h:24,kind:"metal"},
    {x:1020,y:340,w:118,h:24,kind:"metal"},
    {x:1295,y:346,w:112,h:24,kind:"metal"},
    {x:1735,y:339,w:116,h:24,kind:"metal"},
    {x:1980,y:347,w:112,h:24,kind:"metal"},
    {x:2370,y:340,w:118,h:24,kind:"metal"},
    {x:2660,y:350,w:106,h:24,kind:"metal"},
    {x:3035,y:339,w:120,h:24,kind:"metal"},
    {x:3370,y:350,w:108,h:24,kind:"metal"},
    {x:3780,y:340,w:114,h:24,kind:"metal"},
    {x:3960,y:348,w:108,h:24,kind:"metal"},
    {x:4470,y:342,w:118,h:24,kind:"metal"}
  ];
  const crates = [];
  const solids = [...ground,...platforms];
  const obstacles = [
    {x:350,y:FLOOR-57,w:46,h:57,type:"pacholek"},
    {x:1120,y:FLOOR-41,w:74,h:41,type:"kolce"},
    {x:1755,y:FLOOR-57,w:46,h:57,type:"pacholek"},
    {x:2435,y:FLOOR-41,w:72,h:41,type:"kolce"},
    {x:3140,y:FLOOR-57,w:46,h:57,type:"pacholek"},
    {x:3875,y:FLOOR-41,w:74,h:41,type:"kolce"},
    {x:4510,y:FLOOR-57,w:46,h:57,type:"pacholek"},
    {x:1347,y:platforms[2].y-32,w:53,h:32,type:"kolce"},
    {x:4008,y:platforms[10].y-32,w:53,h:32,type:"kolce"}
  ];
  const checkpointSpots = [1605,3690];
  const giftX = 5050;
  const types = [
    {key:"cegla", points:10},{key:"piwo",points:25},{key:"beton",points:20},
    {key:"plan",points:20}
  ];
  function makePickups() {
    const arr=[];let id=0;
    const add=(x,y,key)=>{
      const type=types.find(t=>t.key===key);
      arr.push({id:id++,x,y,type:key,points:type.points,got:false});
    };
    const onGround = [
      [205,"beton"],[550,"beton"],
      [862,"piwo"],[1170,"cegla"],[1300,"beton"],
      [1598,"plan"],[1885,"cegla"],
      [2300,"beton"],[2550,"cegla"],[2702,"piwo"],
      [2965,"plan"],[3212,"beton"],
      [3700,"beton"],[3935,"beton"],
      [4328,"beton"],[4620,"beton"],
      [4700,"plan"]
    ];
    for (const [x,key] of onGround) add(x,FLOOR-86,key);
    [0,1,3,5,7,9,11].forEach((i,j)=>{
      const p=platforms[i];
      add(p.x+p.w/2,p.y-62,j===1?"beton":"plan");
    });
    [[713,315,"beton"],[1448,307,"plan"],
     [2835,314,"beton"],[4150,307,"plan"]].forEach(([x,y,key])=>add(x,y,key));
    return arr;
  }
  const initialPickups = makePickups();
  const input = {left:false,right:false,jump:false};
  let jumpRequested = false;
  let state = "menu", player, pickups, score=0, lives=3, camera=0, elapsed=0;
  let levelInfo="", infoTimer=0, particles=[], sceneTime=0;
  let lastTime = 0, invincible=0, checkpoint=110, highScore=0;
  const buttonAreas = [];
  const buttons = [...document.querySelectorAll("[data-control]")];

  function fresh() {
    player = {x:112, y:FLOOR-80, w:68,h:80, vx:0,vy:0, dir:1, grounded:true, coyote:0, frame:0};
    pickups = initialPickups.map(o => ({...o}));
    score=0;lives=3;camera=0;elapsed=0;particles=[];
    checkpoint=110; invincible=0; infoTimer=3;levelInfo="Zbierz 500 punktów i znajdź prezent!";
    state="playing";
    if (muzyka.paused) {
      muzyka.play().catch(error => console.log("Błąd muzyki:", error));
    }
    Object.keys(input).forEach(k => input[k]=false);
    buttons.forEach(b=>b.classList.remove("pressed"));
  }
  function note(s,duration=2.2){levelInfo=s;infoTimer=duration;}
  function collide(a,b){return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;}
  const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
  const rand=(min,max)=>min+Math.random()*(max-min);

  function spark(x,y,colors,n=14){
    for(let i=0;i<n;i++){
      particles.push({x,y,vx:rand(-195,195),vy:rand(-295,-85),life:rand(.35,.8),max:.8,clr:colors[i%colors.length],sz:rand(3,7)});
    }
  }
  function hurt(fall=false){
    if (invincible>0 && !fall) return;
    lives--;invincible=1.7;
    spark(player.x+35,player.y+40,["#ffda47","#ffffff","#ff5d57"],18);
    if(lives<=0){state="lost";Object.keys(input).forEach(k=>input[k]=false);return;}
    if(fall){player.x=checkpoint;player.y=FLOOR-80;player.vx=0;player.vy=0;player.grounded=true;note("Uwaga na przepaście! -1 życie",1.8);}
    else {player.vy=-380;player.x=clamp(player.x-(player.dir*45),4,WORLD-player.w-3);note("Aj! Uważaj na przeszkody! -1 życie",1.8);}
  }
  function jump(){if(state==="playing")jumpRequested=true;else if(state==="menu"||state==="lost"||state==="won")fresh();}
  function update(dt){
    sceneTime+=dt;
    if(state!=="playing") {updateParticles(dt);return;}
    elapsed+=dt;
    infoTimer=Math.max(0,infoTimer-dt);
    invincible=Math.max(0,invincible-dt);
    const dir=Number(input.right)-Number(input.left);
    player.vx=dir*SPEED;
    if(dir!==0)player.dir=dir;
    if(player.grounded)player.coyote=.11;
    else player.coyote=Math.max(0,player.coyote-dt);
    if(jumpRequested && player.coyote>0){
      player.vy=JUMP;player.grounded=false;player.coyote=0;
      spark(player.x+player.w/2,player.y+player.h,["#fff5ad","#d4a774"],6);
    }
    jumpRequested=false;
    const oldBottom=player.y+player.h;
    player.x=clamp(player.x+player.vx*dt,0,WORLD-player.w);
    player.vy=Math.min(1000,player.vy+G*dt);
    player.y+=player.vy*dt;
    player.grounded=false;
    for(const s of solids){
      if(player.vy>=0 && player.x+player.w-12>s.x && player.x+12<s.x+s.w &&
         oldBottom<=s.y+14 && player.y+player.h>=s.y && player.y+player.h <=s.y+100){
        player.y=s.y-player.h;player.vy=0;player.grounded=true;
      }
    }
    if(player.y>H+90){hurt(true);}
    for(const h of obstacles){
      const danger={x:h.x+9,y:h.y+9,w:h.w-18,h:h.h-11};
      if(collide(player,danger))hurt(false);
    }
    for(const p of pickups){
      if(p.got)continue;
      if(Math.abs(p.x-(player.x+player.w/2))<52 && Math.abs(p.y-(player.y+player.h/2))<68){
        p.got=true;score+=p.points;
        spark(p.x,p.y,["#ffef86","#ffc63f","#ffffff"],10);
        note(`${label(p.type)}  +${p.points} pkt`,1.25);
        if(score>=GOAL && score-p.points<GOAL){note("500 PUNKTÓW! Znajdź prezent na końcu! 🎁",3.5);}
      }
    }
    for(const p of checkpointSpots) {
      if(player.x>=p && checkpoint<p){checkpoint=p; note("Punkt kontrolny zapisany!",1.4);}
    }
    if (player.x+player.w>giftX-40 && score>=GOAL) {
      score=Math.max(score,GOAL); highScore=Math.max(score,highScore);state="won";
      spark(giftX,FLOOR-136,["#fcd85d","#fb5ca8","#6fd6ff","#a5ed67"],75);
    } else if(player.x>giftX-95 && score<GOAL){
      player.x=giftX-95;note(`Do prezentu brakuje ${GOAL-score} pkt. Wróć po materiały!`,.9);
    }
    player.frame+=dt*(Math.abs(dir)>0&&player.grounded?10:2);
    const target=clamp(player.x-W*.36,0,WORLD-W);
    camera+=((target-camera)*Math.min(1,dt*7.5));
    updateParticles(dt);
  }
  function updateParticles(dt){
    for (const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=580*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0).slice(-230);
  }
  const label=t=>({cegla:"Cegła",piwo:"Piwo",beton:"Beton",plan:"Plan budowy"}[t]||t);

  function round(x,y,w,h,r=12){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function txt(s,x,y,size=24,color="#fff",align="center",weight="900") {
    ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui, Arial, sans-serif`;
    ctx.textAlign=align;ctx.textBaseline="middle";ctx.fillText(s,x,y);
  }
  function panel(x,y,w,h,color="#6f4227e8"){
    ctx.fillStyle="#2d1e17aa";round(x+3,y+5,w,h,13);ctx.fill();
    ctx.fillStyle=color;round(x,y,w,h,13);ctx.fill();
    ctx.strokeStyle="#ffd47a";ctx.lineWidth=2;ctx.stroke();
  }
  function img(name,x,y,w,h){const im=pics[name];if(im&&im.complete&&im.naturalWidth){ctx.drawImage(im,x,y,w,h);return true;}return false;}
  function background(){
    ctx.fillStyle="#9dcced";ctx.fillRect(0,0,W,H);
    const im=pics.tlo_1;
    if(im&&im.complete&&im.naturalWidth){
      const coverScale=Math.max(W/im.naturalWidth,H/im.naturalHeight);
      const bgScale=coverScale*1.18;
      const drawW=im.naturalWidth*bgScale;
      const drawH=im.naturalHeight*bgScale;
      const maxShift=Math.max(0,drawW-W);
      const worldProgress=clamp(camera/Math.max(1,WORLD-W),0,1);
      const shift=worldProgress*maxShift;
      const yOffset=(H-drawH)*0.18;
      ctx.imageSmoothingEnabled=true;
      ctx.drawImage(im,-shift,yOffset,drawW,drawH);
    }
    const fog=ctx.createLinearGradient(0,0,0,H);
    fog.addColorStop(0,"#ffffff00");fog.addColorStop(.65,"#fff8da11");fog.addColorStop(1,"#f8da9730");
    ctx.fillStyle=fog;ctx.fillRect(0,0,W,H);
  }
  function drawPits(){
    for(let i=0;i<ground.length-1;i++){
      const a=ground[i].x+ground[i].w-camera,b=ground[i+1].x-camera;
      if(b<0||a>W)continue;
      const grad=ctx.createLinearGradient(0,FLOOR,0,H);
      grad.addColorStop(0,"#2e2b2e");grad.addColorStop(1,"#101a22");
      ctx.fillStyle=grad;ctx.fillRect(a,FLOOR,b-a,H-FLOOR);
      ctx.fillStyle="#faab4a";
      for(let s=0;s<2;s++){
        const edge=s===0?a-10:b;
        ctx.fillRect(edge,FLOOR-8,10,9);
        ctx.fillStyle="#44382c";ctx.fillRect(edge+3,FLOOR-8,3,9);
        ctx.fillStyle="#faab4a";
      }
      ctx.fillStyle="#b0ccd233";
      for(let k=0;k<5;k++){
        const px=a+((k*43+i*13)%(b-a));
        ctx.fillRect(px,FLOOR+36+(k%2)*22,14,3);
      }
    }
  }
  function tile(s){
    const x=s.x-camera;
    if(x+s.w<-10||x>W+10)return;
    if(s.kind==="earth"){
      ctx.fillStyle="#815132";ctx.fillRect(x,s.y,s.w,H-s.y+90);
      const earth=ctx.createLinearGradient(0,s.y,0,H);earth.addColorStop(0,"#b47b48");earth.addColorStop(1,"#75472d");
      ctx.fillStyle=earth;ctx.fillRect(x,s.y+12,s.w,H-s.y+90);
      ctx.save();ctx.beginPath();ctx.rect(x,s.y+14,s.w,H-s.y+90);ctx.clip();
      for(let row=0;row<4;row++)for(let col=0;col<Math.ceil(s.w/50)+1;col++){
        const bx=x+col*50+(row%2)*23,by=s.y+22+row*35;
        ctx.fillStyle=(col+row)%3===0?"#885330":"#9e683e";
        round(bx+3,by+1,44,26,4);ctx.fill();
        ctx.strokeStyle="#d19a5d55";ctx.lineWidth=2;ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, s.y - 8, s.w, 30);
      ctx.clip();

      ctx.fillStyle = "#548d29";
      ctx.fillRect(x, s.y - 5, s.w, 21);
      ctx.fillStyle = "#80c63f";
      ctx.fillRect(x, s.y - 8, s.w, 14);
      ctx.fillStyle = "#b2e16b";
      ctx.fillRect(x + 2, s.y - 7, Math.max(0, s.w - 4), 4);

      for (let q = 30; q < s.w - 30; q += 31) {
        ctx.fillStyle = "#70ad35";
        ctx.beginPath();
        ctx.ellipse(x + q, s.y + 9, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#467c22";
      ctx.fillRect(x, s.y + 3, 3, 13);
      ctx.fillRect(x + s.w - 3, s.y + 3, 3, 13);
      ctx.restore();
    }else if(s.kind==="crate"){
      if(!img("skrzynia",x,s.y,s.w,s.h)){
        ctx.fillStyle="#ab753d";ctx.fillRect(x,s.y,s.w,s.h);
        ctx.strokeStyle="#523625";ctx.lineWidth=4;ctx.strokeRect(x+2,s.y+2,s.w-4,s.h-4);
        ctx.beginPath();ctx.moveTo(x+8,s.y+8);ctx.lineTo(x+s.w-8,s.y+s.h-8);ctx.moveTo(x+s.w-8,s.y+8);ctx.lineTo(x+8,s.y+s.h-8);ctx.stroke();
      }
    }else if(s.kind==="concrete"){
      ctx.fillStyle="#5b6067aa";round(x+4,s.y+6,s.w,s.h,3);ctx.fill();
      ctx.fillStyle="#a6abb1";round(x,s.y,s.w,s.h,4);ctx.fill();
      ctx.strokeStyle="#66666b";ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle="#dfe3e3";ctx.fillRect(x+7,s.y+4,s.w-14,4);
      ctx.fillStyle="#6c7176";
      for(let i=23;i<s.w;i+=53){ctx.beginPath();ctx.arc(x+i,s.y+13,3,0,Math.PI*2);ctx.fill();}
    }else if(s.kind==="brick"){
      ctx.fillStyle="#9c402f";round(x,s.y,s.w,s.h,3);ctx.fill();
      ctx.fillStyle="#e8774c";ctx.fillRect(x+2,s.y+2,s.w-4,6);
      ctx.strokeStyle="#f5ad7b";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x,s.y+11);ctx.lineTo(x+s.w,s.y+11);
      for(let i=35;i<s.w;i+=68){ctx.moveTo(x+i,s.y);ctx.lineTo(x+i,s.y+11);ctx.moveTo(x+i+34,s.y+11);ctx.lineTo(x+i+34,s.y+22);}ctx.stroke();
    }else if(s.kind==="metal"){
      ctx.fillStyle="#59616a99";round(x+3,s.y+5,s.w,s.h,5);ctx.fill();
      ctx.fillStyle="#68727b";round(x-2,s.y-3,s.w+4,s.h+6,6);ctx.fill();
      ctx.fillStyle="#b8c2ca";round(x+2,s.y+1,s.w-4,s.h-4,3);ctx.fill();
      ctx.fillStyle="#d9dee1";round(x+9,s.y+3,s.w-18,5,2);ctx.fill();
      ctx.fillStyle="#8c969e";round(x+8,s.y+13,s.w-16,5,2);ctx.fill();
      ctx.fillStyle="#66717a";
      for(let i=1;i<=3;i++){
        ctx.beginPath();ctx.arc(x+s.w*i/4,s.y+16,3.4,0,Math.PI*2);ctx.fill();
      }
      ctx.strokeStyle="#48545d";ctx.lineWidth=2;round(x-2,s.y-3,s.w+4,s.h+6,6);ctx.stroke();
    }else{
      ctx.fillStyle="#4a3529aa";round(x+4,s.y+7,s.w,18,4);ctx.fill();
      ctx.fillStyle="#d4a06b";round(x,s.y,s.w,20,4);ctx.fill();
      ctx.strokeStyle="#734329";ctx.lineWidth=3;ctx.stroke();
      ctx.strokeStyle="#f8d1a0";ctx.lineWidth=2;
      for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+8,s.y+i*4);ctx.lineTo(x+s.w-8,s.y+i*4);ctx.stroke();}
      ctx.fillStyle="#5c3d30";for(let i=20;i<s.w;i+=70){ctx.fillRect(x+i,s.y+7,5,5);}
    }
  }

  function drawCheckpoints(){
    for(const cx of checkpointSpots){
      const sx=cx-camera;if(sx<-80||sx>W+50)continue;
      ctx.strokeStyle="#6b4231";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(sx,FLOOR);ctx.lineTo(sx,FLOOR-100);ctx.stroke();
      ctx.fillStyle=cx<=checkpoint?"#ffe16e":"#ff9552";
      ctx.beginPath();ctx.moveTo(sx,FLOOR-100);ctx.lineTo(sx+46,FLOOR-80);ctx.lineTo(sx,FLOOR-60);ctx.fill();
      txt("🐾",sx+17,FLOOR-81,19);
    }
  }
  function drawPickups(){
    for(const p of pickups){
      if(p.got)continue;
      const x=p.x-camera;if(x<-90||x>W+90)continue;
      const float=Math.sin(sceneTime*4.1+p.id)*5;
      const size=p.type==="plan"?58:p.type==="beton"?57:p.type==="piwo"?59:52;
      const y=p.y+float;
      ctx.fillStyle="#ffec7a40";ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
      if(!img(p.type,x-size/2,y-size/2,size,size)){
        ctx.fillStyle="#ffd756";round(x-size/2,y-size/2,size,size,12);ctx.fill();
      }
    }
  }
  function drawObstacles(){
    for(const h of obstacles){
      const x=h.x-camera;if(x<-120||x>W+90)continue;
      ctx.fillStyle="#55341d52";ctx.beginPath();ctx.ellipse(x+h.w/2,h.y+h.h+3,h.w*.47,7,0,0,2*Math.PI);ctx.fill();
      if(!img(h.type,x-5,h.y-8,h.w+10,h.h+10)){
        ctx.fillStyle="#e65c31";round(x,h.y,h.w,h.h,7);ctx.fill();
      }
    }
  }
  function drawPlayer(){
    if(!player)return;
    const x=player.x-camera,y=player.y;
    ctx.fillStyle="#46361d50";ctx.beginPath();ctx.ellipse(x+player.w/2,Math.min(FLOOR+3,y+player.h+2),38,8,0,0,Math.PI*2);ctx.fill();
    if(invincible>0 && Math.floor(sceneTime*13)%2===0)return;
    const running=Math.abs(player.vx)>15&&player.grounded;
    const key=!player.grounded?"pies_jump":running?["pies_run1","pies_run2","pies_run3"][Math.floor(player.frame)%3]:"pies_idle";
    ctx.save();
    if(player.dir<0){ctx.translate(x+player.w/2,0);ctx.scale(-1,1);ctx.translate(-(x+player.w/2),0);}
    const bob=running?Math.sin(player.frame*Math.PI)*2:Math.sin(sceneTime*3)*1.5;
    if(!img(key,x-17,y-20+bob,103,106)){
      ctx.fillStyle="#29272a";round(x,y,player.w,player.h,25);ctx.fill();
      ctx.fillStyle="#ffd23b";round(x+15,y+18,40,20,5);ctx.fill();
    }
    ctx.restore();
  }
  function drawGift(){
    const gx=giftX-camera;
    if(gx<-210||gx>W+180)return;
    const bob=Math.sin(sceneTime*2.5)*4;
    ctx.fillStyle="#50311d80";ctx.beginPath();ctx.ellipse(gx,FLOOR+2,70,11,0,0,2*Math.PI);ctx.fill();
    const a=score>=GOAL?1:.57;
    ctx.save();ctx.globalAlpha=a;
    const glow=ctx.createRadialGradient(gx,FLOOR-92,14,gx,FLOOR-92,130);
    glow.addColorStop(0,"#fff4a0aa");glow.addColorStop(1,"#fff4a000");ctx.fillStyle=glow;ctx.beginPath();ctx.arc(gx,FLOOR-92,130,0,2*Math.PI);ctx.fill();
    img("prezent",gx-92,FLOOR-183+bob,184,175);
    ctx.restore();
    panel(gx-111,FLOOR-215,222,40,score>=GOAL?"#568637eb":"#6b4b39e8");
    txt(score>=GOAL?"🎁 ODBIERZ PREZENT":"🔒 POTRZEBA 500 PKT",gx,FLOOR-195,17,"#fff");
  }
  function drawParticles(){
    ctx.save();
    for(const p of particles){const x=p.x-camera;if(x<-20||x>W+20)continue;
      ctx.globalAlpha=clamp(p.life/.5,0,1);ctx.fillStyle=p.clr;
      ctx.save();ctx.translate(x,p.y);ctx.rotate(p.vx*.004*sceneTime);ctx.fillRect(-p.sz/2,-p.sz/2,p.sz,p.sz);ctx.restore();
    }
    ctx.restore();
  }
  function drawHeart(x,y,on=true){
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(0.88, 0.88);

    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-14, 3, -20, -5, -20, -14);
    ctx.bezierCurveTo(-20, -24, -10, -28, 0, -18);
    ctx.bezierCurveTo(10, -28, 20, -24, 20, -14);
    ctx.bezierCurveTo(20, -5, 14, 3, 0, 12);
    ctx.closePath();

    ctx.save();
    ctx.translate(1.4,1.8);
    ctx.fillStyle = on ? "#8e2130aa" : "#6d625e88";
    ctx.fill();
    ctx.restore();

    const grad = ctx.createLinearGradient(0,-24,0,14);
    if(on){
      grad.addColorStop(0, "#ff7a84");
      grad.addColorStop(.55, "#ff5967");
      grad.addColorStop(1, "#f04356");
    }else{
      grad.addColorStop(0, "#c8b5ae");
      grad.addColorStop(1, "#a8968e");
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = on ? "#fff2db" : "#e8ddd5";
    ctx.lineWidth = 2.4;
    ctx.stroke();

    if(on){
      ctx.fillStyle = "#ffffffaa";
      ctx.beginPath();
      ctx.ellipse(-6,-10,4.6,2.8,-0.45,0,Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }
  function hud(){
    panel(17,14,153,49);for(let i=0;i<3;i++)drawHeart(47+i*47,46,i<lives);
    panel(270,12,420,61);
    txt(`PUNKTY  ${score} / ${GOAL}`,480,34,23,"#fff4c4");
    round(308,56,344,9,5);ctx.fillStyle="#3b251c";ctx.fill();
    ctx.fillStyle="#ffd75b";round(308,56,Math.max(0,344*Math.min(1,score/GOAL)),9,5);ctx.fill();
    panel(908,14,40,49);txt("Ⅱ",928,39,22);
    if(infoTimer>0){
      const alpha=Math.min(1,infoTimer/.4);
      ctx.save();ctx.globalAlpha=alpha;
      panel(180,83,600,43,"#523822df");txt(levelInfo,480,104,20,"#fff8e6");ctx.restore();
    }
    ctx.fillStyle="#613b28bb";round(344,505,272,20,11);ctx.fill();
    txt("START",362,515,10,"#ffdd99");txt("🎁",595,515,16);
    ctx.fillStyle="#ffc448";round(396,511,Math.max(2,170*player.x/(WORLD-230)),7,4);ctx.fill();
  }
  function drawOverlay(){
    ctx.fillStyle="#1b243d6b";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#fff6e0f1";round(197,68,566,414,26);ctx.fill();
    ctx.strokeStyle="#b57a42";ctx.lineWidth=5;ctx.stroke();
    if(state==="menu"){
      txt("PIES BUDOWLANY",480,124,43,"#673d23");
      txt("MISJA URODZINOWA",480,168,22,"#b46b2e");
      img("pies_duzy",223,221,212,219);
      txt("Misja: znajdź prezent!",595,220,19,"#70452c");
      const lines=["Zbieraj beton, piwo, cegły i plany budowy.", "Uważaj na kolce i pachołki!", "Zdobądź 500 punktów i odbierz prezent 🎁"];
      lines.forEach((s,i)=>txt(s,594,256+i*34,14,"#6d4932","center","700"));
      uiButton("ZAGRAJ",467,356,254,65);
      txt("Ruch: ← → / A D   •   Skok: Spacja / ↑",480,464,15,"#705339");
    }else if(state==="paused"){
      txt("PAUZA",480,190,55,"#673d23");
      txt("Piesek chwilę odpoczywa 🐾",480,252,24,"#705039");
      uiButton("WRÓĆ DO GRY",328,335,304,68);
    }else if(state==="lost"){
      img("pies_idle",408,160,145,145);
      txt("KONIEC GRY",480,116,47,"#873f29");
      txt(`Zdobyte punkty: ${score}`,480,324,24,"#75472d");
      txt("Spróbuj jeszcze raz!",480,356,21,"#75472d");
      uiButton("ZAGRAJ PONOWNIE",325,399,310,62);
    }else if(state==="won"){
      for(let i=0;i<18;i++){
        const px=240+(i*79+sceneTime*19)%480,py=96+(i*43+sceneTime*43)%340;
        ctx.fillStyle=["#ffb844","#fa6ca8","#78cfff","#a3e369"][i%4];
        ctx.save();ctx.translate(px,py);ctx.rotate(sceneTime+i);ctx.fillRect(-4,-6,8,12);ctx.restore();
      }
      txt("WSZYSTKIEGO",480,112,43,"#b64136");
      txt("NAJLEPSZEGO! 🎉",480,152,37,"#b64136");
      txt("Z okazji urodzin życzę Ci:",480,202,18,"#75472d");
      txt("- Jak co roku zdrowia, szczęścia, pieniędzy, miłości itd.",225,233,14,"#75472d","left","700");
      txt("- Tradycyjnie kasy, chlania i ruchania.",225,261,14,"#75472d","left","700");
      txt("- Zdrowych kolan, pleców i w ogóle wszystkiego zdrowego.",225,289,14,"#75472d","left","700");
      txt("- Dużo premii i milionów w pracy za nicnierobienie.",225,317,14,"#75472d","left","700");
      txt("- Zajebistej fury, która by się nie psuła, taniego paliwa i domu z basenem.",225,345,14,"#75472d","left","700");
      txt("- No i jeszcze wszystkiego, o czym marzysz! ❤️",225,373,14,"#75472d","left","700");
      uiButton("ZAGRAJ PONOWNIE",329,405,302,56);
    }
  }
  function uiButton(text,x,y,w,h){
    ctx.fillStyle="#7c4d29";round(x+2,y+5,w,h,14);ctx.fill();
    const grad=ctx.createLinearGradient(0,y,0,y+h);grad.addColorStop(0,"#ffe1a0");grad.addColorStop(1,"#eaa44a");
    ctx.fillStyle=grad;round(x,y,w,h,14);ctx.fill();
    ctx.strokeStyle="#754321";ctx.lineWidth=3;ctx.stroke();
    txt(text,x+w/2,y+h/2,24,"#56301d");
    buttonAreas.push({x,y,w,h});
  }
  function draw(){
    document.getElementById("touch-ui").classList.toggle("hidden",state!=="playing");
    buttonAreas.length=0;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    background();
    ctx.save();ctx.fillStyle="#ffffff17";ctx.fillRect(0,FLOOR,W,H-FLOOR);ctx.restore();
    drawPits();ground.forEach(tile);platforms.forEach(tile);crates.forEach(tile);
    drawCheckpoints();drawPickups();drawObstacles();drawGift();drawPlayer();drawParticles();
    if(state==="playing")hud();
    if(state!=="playing")drawOverlay();
    ctx.restore();
  }
  function frame(now){
    const dt=Math.min(.033,(now-lastTime)/1000||.016);lastTime=now;
    update(dt);draw();requestAnimationFrame(frame);
  }
  function useCanvasClick(clientX,clientY){
    const rect=canvas.getBoundingClientRect();const x=(clientX-rect.left)*W/rect.width;
    const y=(clientY-rect.top)*H/rect.height;
    if(state==="playing"){
      if(x>895&&y<80){state="paused";return;}
      return;
    }
    if(state==="paused"){state="playing";return;}
    if(buttonAreas.some(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h))fresh();
  }
  canvas.addEventListener("pointerdown",event=>{
    event.preventDefault(); useCanvasClick(event.clientX,event.clientY);
  });
  window.addEventListener("keydown",event=>{
    if(["ArrowLeft","ArrowRight","ArrowUp","Space"].includes(event.code))event.preventDefault();
    if(event.code==="Escape"||event.code==="KeyP"){
      if(state==="playing")state="paused";else if(state==="paused")state="playing";
      return;
    }
    if(event.code==="ArrowLeft"||event.code==="KeyA")input.left=true;
    if(event.code==="ArrowRight"||event.code==="KeyD")input.right=true;
    if(["ArrowUp","Space","KeyW"].includes(event.code)){
      if(!input.jump)jump();input.jump=true;
    }
    if(event.code==="Enter"&&state!=="playing"){if(state==="paused")state="playing";else fresh();}
  });
  window.addEventListener("keyup",event=>{
    if(event.code==="ArrowLeft"||event.code==="KeyA")input.left=false;
    if(event.code==="ArrowRight"||event.code==="KeyD")input.right=false;
    if(["ArrowUp","Space","KeyW"].includes(event.code))input.jump=false;
  });
  window.addEventListener("blur",()=>{
    input.left=input.right=input.jump=false;
    buttons.forEach(b=>b.classList.remove("pressed"));
    if(state==="playing")state="paused";
  });
  for(const b of buttons){
    const key=b.dataset.control;
    const pressed=new Set();
    const release=(event)=>{if(event){event.preventDefault();pressed.delete(event.pointerId);}else pressed.clear();
      if(!pressed.size){input[key]=false;b.classList.remove("pressed");}
    };
    b.addEventListener("pointerdown",event=>{
      event.preventDefault();event.stopPropagation();
      b.setPointerCapture(event.pointerId);pressed.add(event.pointerId);
      if(key==="jump"&&!input.jump)jump();
      input[key]=true;b.classList.add("pressed");
    });
    b.addEventListener("pointerup",release);
    b.addEventListener("pointercancel",release);
    b.addEventListener("lostpointercapture",release);
    b.addEventListener("contextmenu",e=>e.preventDefault());
  }
  player={x:112,y:FLOOR-80,w:68,h:80,vx:0,vy:0,dir:1,grounded:true,frame:0};
  pickups=initialPickups.map(o=>({...o}));
  requestAnimationFrame(frame);
})();