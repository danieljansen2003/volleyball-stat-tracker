import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let firebaseReady=false, auth=null, db=null, currentUser=null, cloudReady=false;

try{
  if(firebaseConfig && !String(firebaseConfig.apiKey).includes("PASTE_")){
    const fbApp=initializeApp(firebaseConfig);
    auth=getAuth(fbApp);
    db=getFirestore(fbApp);
    firebaseReady=true;
  }
}catch(e){console.warn("Firebase config needed", e)}

function cloudDoc(){return currentUser ? doc(db,"users",currentUser.uid,"app","current") : null}

async function saveCloudState(){
  if(!firebaseReady || !currentUser || !cloudReady) return;
  try{
    await setDoc(cloudDoc(), {state, updatedAt:serverTimestamp(), email:currentUser.email||""}, {merge:true});
  }catch(e){console.error("Cloud save failed", e)}
}

async function loadCloudState(){
  if(!firebaseReady || !currentUser) return false;
  const snap=await getDoc(cloudDoc());
  if(snap.exists() && snap.data().state){
    state=snap.data().state;
    if(!state.digs) state.digs=[];
    localStorage.setItem("vb_v5", JSON.stringify(state));
    return true;
  }
  return false;
}

async function saveCloudGame(game){
  if(!firebaseReady || !currentUser || !game) return;
  try{await setDoc(doc(db,"users",currentUser.uid,"savedGames",game.id), {...game, updatedAt:serverTimestamp()});}
  catch(e){console.error("Cloud game save failed", e)}
}

async function loadCloudGames(){
  if(!firebaseReady || !currentUser) return [];
  const snap=await getDocs(collection(db,"users",currentUser.uid,"savedGames"));
  return snap.docs.map(d=>d.data()).sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
}

async function deleteCloudGame(id){
  if(!firebaseReady || !currentUser || !id) return;
  await deleteDoc(doc(db,"users",currentUser.uid,"savedGames",id));
}

function updateAuthUI(){
  const status=document.getElementById("authStatus");
  const signIn=document.getElementById("googleSignIn");
  const signOutBtn=document.getElementById("googleSignOut");
  if(!status || !signIn || !signOutBtn) return;
  if(!firebaseReady){
    status.textContent="Firebase config needed. Edit firebase-config.js, then redeploy.";
    signIn.disabled=true;
    signOutBtn.style.display="none";
    return;
  }
  if(currentUser){
    status.textContent=`Signed in as ${currentUser.email || currentUser.displayName}. Cloud sync is on.`;
    signIn.style.display="none";
    signOutBtn.style.display="inline-block";
  }else{
    status.textContent="Not signed in. Data saves locally until you sign in.";
    signIn.style.display="inline-block";
    signIn.disabled=false;
    signOutBtn.style.display="none";
  }
}

async function signInGoogle(){
  if(!firebaseReady) return alert("Add Firebase config first.");
  await signInWithPopup(auth, new GoogleAuthProvider());
}

async function signOutGoogle(){
  if(firebaseReady) await signOut(auth);
}

if(firebaseReady){
  onAuthStateChanged(auth, async user=>{
    currentUser=user;
    updateAuthUI();
    if(user){
      const loaded=await loadCloudState();
      cloudReady=true;
      if(!loaded) await saveCloudState();
      render();
    }else{
      cloudReady=false;
      render();
    }
  });
}


const $=id=>document.getElementById(id);
const statTypes={
 attack:[['kill','Kill','green',true],['attempt','Attempt','gold',true],['attackError','Error','red',true]],
 block:[['soloBlock','Solo Block','green',false],['blockAssist','Block Assist','blue',false],['blockAttempt','Attempt','gold',false],['blockError','Error','red',false]],
 defense:[['dig','Dig','blue',true],['digError','Error','red',true]],
 reception:[['rec3','3 Exc','green',false],['rec2','2 Good','blue',false],['rec1','1 Poor','gold',false],['rec0','0 Err','red',false]],
 setting:[['assist','Assist','purple',false],['setAttempt','Attempt','gold',false],['setError','Error','red',false]],
 serve:[['ace','Ace','green',false],['serveAttempt','Attempt','gold',false],['serveError','Error','red',false]]
};
const labels={kill:'Kill',attempt:'Attempt',attackError:'Attack Error',soloBlock:'Solo Block',blockAssist:'Block Assist',blockAttempt:'Block Attempt',blockError:'Block Error',dig:'Dig',digError:'Dig Error',rec3:'3 Exc',rec2:'2 Good',rec1:'1 Poor',rec0:'0 Err',assist:'Assist',setAttempt:'Set Attempt',setError:'Set Error',ace:'Ace',serveAttempt:'Serve Attempt',serveError:'Serve Error'};
function blank(){return {points:0,kills:0,attacks:0,attackErrors:0,blockSolo:0,blockAssist:0,blockAttempts:0,blockErrors:0,digs:0,digErrors:0,rec3:0,rec2:0,rec1:0,rec0:0,assists:0,setAttempts:0,setErrors:0,aces:0,serveAttempts:0,serveErrors:0,notes:''}}
const names=['Joe','Bob','Mary','Jill','Sy','Hurbert','Jack','Player 8','Player 9','Player 10','Player 11'];
const pos=['OH','MB','S','L','OH','MB','RS','','','',''];
let state=JSON.parse(localStorage.getItem('vb_v5')||'null')||{
 team:'US',opp:'THEM',selected:0,set:1,score:{us:0,them:0},activeSetView:'all',
 roster:names.map((n,i)=>({id:Date.now()+''+i,name:n,pos:pos[i],stats:blank()})),
 sets:[{set:1,us:0,them:0,events:[]}],
 attacks:[], matchNotes:''
};
let pending=null, editingAttackId=null;
let undoStack=[];
let redoStack=[];
function snapshot(){
 return JSON.stringify({
  team:state.team,opp:state.opp,selected:state.selected,set:state.set,score:state.score,activeSetView:state.activeSetView,
  roster:state.roster,sets:state.sets,attacks:state.attacks,digs:state.digs||[],matchNotes:state.matchNotes
 });
}
function restoreSnapshot(snap){
 state=JSON.parse(snap);
 if(!state.digs)state.digs=[];
 save();
 render();
}
function pushHistory(){
 undoStack.push(snapshot());
 if(undoStack.length>75)undoStack.shift();
 redoStack=[];
}
function undoLast(){
 if(!undoStack.length)return;
 redoStack.push(snapshot());
 restoreSnapshot(undoStack.pop());
}
function redoLast(){
 if(!redoStack.length)return;
 undoStack.push(snapshot());
 restoreSnapshot(redoStack.pop());
}

let editingGameIndex=null;

function savedGames(){return JSON.parse(localStorage.getItem('vb_saved_games')||'[]')}
function setSavedGames(games){localStorage.setItem('vb_saved_games',JSON.stringify(games))}
function archiveCurrentGame(){
 const hasEvents=state.sets.some(s=>s.events.length)||state.score.us||state.score.them||state.attacks.length;
 if(!hasEvents)return;
 const games=savedGames();
 const stamp=new Date().toLocaleString();
 games.unshift({
  id:crypto.randomUUID?crypto.randomUUID():Date.now()+'',
  name:`${state.team} vs ${state.opp} - ${stamp}`,
  savedAt:Date.now(),
  game:JSON.parse(JSON.stringify(state))
 });
 setSavedGames(games);
 saveCloudGame(games[0]);
}
function newBlankMatch(){
 return {
  team:state.team||'US',opp:state.opp||'THEM',selected:0,set:1,score:{us:0,them:0},activeSetView:'all',
  roster:state.roster.map((p,i)=>({id:p.id||Date.now()+''+i,name:p.name,pos:p.pos,stats:blank()})),
  sets:[{set:1,us:0,them:0,events:[]}],
  attacks:[],digs:[],matchNotes:''
 };
}

function save(){if(!state.digs)state.digs=[];localStorage.setItem('vb_v5',JSON.stringify(state)); saveCloudState()}
function currentSet(){return state.sets[state.sets.length-1]}
function player(){return state.roster[state.selected]}
function initials(n){return (n||'?').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function totalStats(filterSet='all', playerId=null){
 let stats={}; Object.keys(blank()).forEach(k=>stats[k]=0);
 state.sets.forEach(s=>{
  if(filterSet!=='all' && s.set!=filterSet)return;
  s.events.forEach(e=>{
   if(playerId && e.playerId!==playerId)return;
   applyToStats(stats,e.type,1,false);
  })
 });
 return stats;
}
function playerSetStats(p,filterSet='all'){return totalStats(filterSet,p.id)}
function applyToStats(s,type,dir=1,score=true){
 if(type==='kill'){s.kills+=dir;s.attacks+=dir;s.points+=dir}
 if(type==='attempt')s.attacks+=dir;
 if(type==='attackError'){s.attackErrors+=dir;s.attacks+=dir}
 if(type==='soloBlock'){s.blockSolo+=dir;s.points+=dir}
 if(type==='blockAssist'){s.blockAssist+=dir;s.points+=dir}
 if(type==='blockAttempt')s.blockAttempts+=dir;
 if(type==='blockError')s.blockErrors+=dir;
 if(type==='dig')s.digs+=dir;
 if(type==='digError')s.digErrors+=dir;
 if(type==='rec3')s.rec3+=dir;if(type==='rec2')s.rec2+=dir;if(type==='rec1')s.rec1+=dir;if(type==='rec0')s.rec0+=dir;
 if(type==='assist')s.assists+=dir;if(type==='setAttempt')s.setAttempts+=dir;if(type==='setError')s.setErrors+=dir;
 if(type==='ace'){s.aces+=dir;s.points+=dir}
 if(type==='serveAttempt')s.serveAttempts+=dir;
 if(type==='serveError')s.serveErrors+=dir;
}
function scoreFor(type){
 if(['kill','soloBlock','blockAssist','ace'].includes(type))return 'us';
 if(['attackError','serveError','blockError','digError','rec0','setError'].includes(type))return 'them';
 return null;
}
function logEvent(type, attackMeta=null){
 pushHistory();
 let p=player();
 let ev={id:crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random()+'',type,playerId:p.id,set:state.set,time:Date.now()};
 currentSet().events.push(ev);
 applyToStats(p.stats,type,1);
 let scoreTeam=scoreFor(type);
 if(scoreTeam){state.score[scoreTeam]++;currentSet()[scoreTeam]=state.score[scoreTeam]}
 if(attackMeta){
  if(type==='dig' || type==='digError'){
    ev.digId=attackMeta.id;
    state.digs.push({...attackMeta,eventId:ev.id,type,playerId:p.id,set:state.set,time:Date.now()});
  } else {
    ev.attackId=attackMeta.id;
    state.attacks.push({...attackMeta,eventId:ev.id,type,playerId:p.id,set:state.set,time:Date.now()});
  }
 }
 save(); render();
}
function openCourt(type){pending={type,playerId:player().id,id:crypto.randomUUID?crypto.randomUUID():Date.now()+''};$('modalTitle').textContent=`${labels[type]} — place on court`;$('modalSub').textContent=(type==='dig'||type==='digError')?'Click where the dig happened':'Click where the ball landed';$('modal').classList.remove('hidden')}
function chooseSub(menu){
 $('subActions').innerHTML=statTypes[menu].map(([type,label,color,needsCourt])=>`<button class="${color}" data-log="${type}" data-court="${needsCourt}">${label}</button>`).join('');
}
function render(){ if(!state.digs)state.digs=[]; updateAuthUI(); 
 $('teamLabel').textContent=state.team;$('oppLabel').textContent=state.opp;$('usScore').textContent=state.score.us;$('themScore').textContent=state.score.them;$('setNumber').textContent=state.set;
 renderPlayers(); renderSelected(); renderTeamMetrics(); renderSummary(); renderDonut(); drawRadar(); renderCorrectionPanel(); renderHeatFilters(); renderHeatmap(); renderStats(); renderSets(); renderRoster(); renderSetup(); save();
}

function renderCorrectionPanel(){
 const box=$('correctionPanel'); if(!box)return;
 const p=player();
 const s=p.stats;
 const items=[
  ['kill','Kill',s.kills],
  ['attackError','Attack Error',s.attackErrors],
  ['soloBlock','Solo Block',s.blockSolo],
  ['blockAssist','Block Assist',s.blockAssist],
  ['dig','Dig',s.digs],
  ['digError','Dig Error',s.digErrors],
  ['assist','Set Assist',s.assists],
  ['ace','Ace',s.aces],
  ['serveError','Serve Error',s.serveErrors],
  ['rec3','Reception 3',s.rec3],
  ['rec2','Reception 2',s.rec2],
  ['rec1','Reception 1',s.rec1],
  ['rec0','Reception Error',s.rec0]
 ];
 box.innerHTML='<div class="correction-title">Quick Corrections</div>'+items.map(([type,label,count])=>`<button class="minus-stat" data-minus-stat="${type}" ${count<=0?'disabled':''}>− ${label}</button>`).join('');
}
function removeLatestStat(type){
 const p=player();
 if(!p || !p.stats)return;

 // Do not allow subtracting below zero.
 const fieldMap={
  kill:'kills', attackError:'attackErrors', soloBlock:'blockSolo', blockAssist:'blockAssist',
  dig:'digs', digError:'digErrors', assist:'assists', ace:'aces', serveError:'serveErrors',
  rec3:'rec3', rec2:'rec2', rec1:'rec1', rec0:'rec0'
 };
 const field=fieldMap[type];
 if(field && (p.stats[field]||0)<=0)return;

 pushHistory();

 // Find and remove latest matching event for this player if it exists.
 let found=null, foundSet=null;
 for(let i=state.sets.length-1;i>=0;i--){
   const s=state.sets[i];
   for(let j=s.events.length-1;j>=0;j--){
     const ev=s.events[j];
     if(ev.playerId===p.id && ev.type===type){
       found={ev,index:j};
       foundSet=s;
       break;
     }
   }
   if(found)break;
 }

 if(found && foundSet){
   foundSet.events.splice(found.index,1);
   if(found.ev.attackId)state.attacks=state.attacks.filter(a=>a.id!==found.ev.attackId);
   if(found.ev.digId)state.digs=(state.digs||[]).filter(a=>a.id!==found.ev.digId);
 }

 // Directly subtract the stat impact. This fixes corrections even if the event log was missing.
 if(type==='kill'){p.stats.kills=Math.max(0,p.stats.kills-1);p.stats.attacks=Math.max(0,p.stats.attacks-1);p.stats.points=Math.max(0,p.stats.points-1)}
 if(type==='attackError'){p.stats.attackErrors=Math.max(0,p.stats.attackErrors-1);p.stats.attacks=Math.max(0,p.stats.attacks-1)}
 if(type==='soloBlock'){p.stats.blockSolo=Math.max(0,p.stats.blockSolo-1);p.stats.points=Math.max(0,p.stats.points-1)}
 if(type==='blockAssist'){p.stats.blockAssist=Math.max(0,p.stats.blockAssist-1);p.stats.points=Math.max(0,p.stats.points-1)}
 if(type==='dig'){p.stats.digs=Math.max(0,p.stats.digs-1)}
 if(type==='digError'){p.stats.digErrors=Math.max(0,p.stats.digErrors-1)}
 if(type==='assist'){p.stats.assists=Math.max(0,p.stats.assists-1)}
 if(type==='ace'){p.stats.aces=Math.max(0,p.stats.aces-1);p.stats.points=Math.max(0,p.stats.points-1)}
 if(type==='serveError'){p.stats.serveErrors=Math.max(0,p.stats.serveErrors-1)}
 if(type==='rec3'){p.stats.rec3=Math.max(0,p.stats.rec3-1)}
 if(type==='rec2'){p.stats.rec2=Math.max(0,p.stats.rec2-1)}
 if(type==='rec1'){p.stats.rec1=Math.max(0,p.stats.rec1-1)}
 if(type==='rec0'){p.stats.rec0=Math.max(0,p.stats.rec0-1)}

 // Fix scoreboard if the removed stat awarded a point.
 const scoringTeam=scoreFor(type);
 if(scoringTeam){
   state.score[scoringTeam]=Math.max(0,state.score[scoringTeam]-1);
   currentSet()[scoringTeam]=state.score[scoringTeam];
 }

 save();
 render();
}
function renderPlayers(){
 $('playerList').innerHTML=state.roster.map((p,i)=>`<div class="player-row ${i===state.selected?'active':''}" data-player="${i}"><span>${i+1}</span><span>${p.name||'Player '+(i+1)}</span></div>`).join('');
}
function renderSelected(){
 let p=player();$('selectedName').textContent=p.name;$('selectedPos').textContent='Position: '+(p.pos||'—');$('avatar').textContent=initials(p.name);$('notes').value=p.stats.notes||'';
}
function renderTeamMetrics(){
 let s=totalStats('all');let err=s.attackErrors+s.serveErrors+s.blockErrors+s.digErrors+s.rec0+s.setErrors;
 $('mPoints').textContent=state.score.us;$('mKills').textContent=s.kills;$('mBlocks').textContent=s.blockSolo+s.blockAssist;$('mErrors').textContent=err;$('mHit').textContent=s.attacks?((s.kills-s.attackErrors)/s.attacks).toFixed(3):'—';
}
function renderSummary(){
 let s=player().stats;let err=s.attackErrors+s.serveErrors+s.blockErrors+s.digErrors+s.rec0+s.setErrors;
 $('playerSummary').innerHTML=[
 ['⭐ Points',s.points],['👐 Set Ast',s.assists],['🏐 Kills',s.kills],['🛡️ Digs',s.digs],['🛡️ Blocks',s.blockSolo+s.blockAssist],['📊 Rec Avg',recAvg(s)],['🎯 Aces:SErr',`${s.aces}:${s.serveErrors}`],['⚠ Errors',err]
 ].map(r=>`<p>${r[0]} <strong>${r[1]}</strong></p>`).join('');
}
function recAvg(s){let n=s.rec3+s.rec2+s.rec1+s.rec0;return n?((3*s.rec3+2*s.rec2+s.rec1)/n).toFixed(2):'—'}
function renderDonut(){
 let s=player().stats;let vals=[s.blockSolo+s.blockAssist,s.kills,s.aces+s.serveAttempts,s.digs,s.assists], total=vals.reduce((a,b)=>a+b,0)||1, colors=['#37a2ff','#10d76d','#ffb000','#00c8ff','#ff7a1a'];let acc=0,parts=[];
 if(vals.every(v=>v===0)){
  colors.forEach((color,i)=>{let deg=360/colors.length;parts.push(`${color} ${acc}deg ${acc+deg}deg`);acc+=deg});
}else{
  vals.forEach((v,i)=>{let deg=v/total*360;if(deg>0){parts.push(`${colors[i]} ${acc}deg ${acc+deg}deg`)};acc+=deg});
}
 $('donut').style.setProperty('--donut-bg',`conic-gradient(${parts.join(',')})`);
 $('legend').innerHTML=[
  ['Block',vals[0],'#37a2ff'],['Attack',vals[1],'#10d76d'],['Serve',vals[2],'#ffb000'],['Dig',vals[3],'#00c8ff'],['Setting',vals[4],'#ff7a1a']
 ].map(([name,val,color])=>`<div><span style="background:${color}"></span>${name} ${Math.round(val/total*100)}%</div>`).join('');
}
function drawRadar(){
 let c=$('radar'),ctx=c.getContext('2d'),s=player().stats;ctx.clearRect(0,0,c.width,c.height);let cx=c.width/2,cy=140,r=105,axes=['Defense','Attack','Serve','Setting','Block'],vals=[s.digs, s.kills+s.attacks, s.aces+s.serveAttempts, s.assists+s.setAttempts, s.blockSolo+s.blockAssist+s.blockAttempts].map(v=>Math.min(1,v/10));
 ctx.strokeStyle='#1f57a4';ctx.fillStyle='#9fb3df';ctx.font='12px Segoe UI';
 for(let ring=1;ring<=5;ring++){ctx.beginPath();for(let i=0;i<5;i++){let a=-Math.PI/2+i*2*Math.PI/5,x=cx+Math.cos(a)*r*ring/5,y=cy+Math.sin(a)*r*ring/5;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.stroke()}
 ctx.beginPath();vals.forEach((v,i)=>{let a=-Math.PI/2+i*2*Math.PI/5,x=cx+Math.cos(a)*r*v,y=cy+Math.sin(a)*r*v;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fillStyle='rgba(0,191,255,.32)';ctx.fill();ctx.strokeStyle='#22c7ff';ctx.lineWidth=3;ctx.stroke();ctx.lineWidth=1;
 axes.forEach((t,i)=>{let a=-Math.PI/2+i*2*Math.PI/5;ctx.fillStyle='#aab9d8';ctx.fillText(t,cx+Math.cos(a)*(r+22)-22,cy+Math.sin(a)*(r+22))});
}
function heatMode(){return $('heatType')?.value||'attack'}
function filteredAttacks(){
 let pid=$('heatPlayer')?.value||'all', set=$('heatSet')?.value||'all';
 return state.attacks.filter(a=>(pid==='all'||a.playerId===pid)&&(set==='all'||String(a.set)===set));
}
function filteredDigs(){
 let pid=$('heatPlayer')?.value||'all', set=$('heatSet')?.value||'all';
 return (state.digs||[]).filter(a=>(pid==='all'||a.playerId===pid)&&(set==='all'||String(a.set)===set));
}
function renderHeatFilters(){
 let hp=$('heatPlayer'),hs=$('heatSet'),ss=$('statsSet'); if(!hp)return;
 let curP=hp.value||'all', curH=hs.value||'all', curS=ss.value||'all';
 hp.innerHTML='<option value="all">All Players</option>'+state.roster.map((p,i)=>`<option value="${p.id}">#${i+1} ${p.name}</option>`).join('');
 hp.value=[...hp.options].some(o=>o.value===curP)?curP:'all';
 let opts='<option value="all">Whole Game</option>'+state.sets.map(s=>`<option value="${s.set}">Set ${s.set}</option>`).join('');
 hs.innerHTML=opts;hs.value=[...hs.options].some(o=>o.value===curH)?curH:'all';ss.innerHTML=opts;ss.value=[...ss.options].some(o=>o.value===curS)?curS:'all';
}
function attackClass(type){
 if(type==='kill') return 'kill';
 if(type==='attackError' || type==='digError') return 'error';
 if(type==='dig') return 'dig';
 return 'attempt';
}
function renderHeatmap(){
 let court=$('heatCourt'); if(!court)return;
 [...court.querySelectorAll('.dot,.heat-spot')].forEach(d=>d.remove());
 const mode=heatMode();
 $('heatTitle').textContent=mode==='dig'?'Dig Heatmap':'Attack Heatmap';
 let items=mode==='dig'?filteredDigs():filteredAttacks();

 // Real heatmap layer: each spot stacks, so dense areas become brighter.
 items.forEach(a=>{
  let h=document.createElement('div');
  h.className='heat-spot '+attackClass(a.type);
  h.style.left=(a.x*100)+'%';
  h.style.top=(a.y*100)+'%';
  court.appendChild(h);
 });

 items.forEach(a=>{
  let d=document.createElement('div');
  d.className='dot '+attackClass(a.type);
  d.style.left=(a.x*100)+'%';
  d.style.top=(a.y*100)+'%';
  d.dataset.attack=a.id;
  d.title=labels[a.type]+' - Set '+a.set;
  court.appendChild(d);
 });

 if(mode==='dig'){
   $('attackList').innerHTML=items.slice(-10).reverse().map(a=>`<div class="pill ${attackClass(a.type)}" data-attack="${a.id}">${labels[a.type]} S${a.set}</div>`).join('')||'<p class="muted">No digs yet.</p>';
   let digs=items.filter(a=>a.type==='dig').length, errors=items.filter(a=>a.type==='digError').length;
   $('heatTotals').innerHTML=`<p>Total: ${items.length} | Digs: ${digs} | Errors: ${errors}</p><p class="heat-key"><span class="key dig"></span>Dig <span class="key error"></span>Error</p>`;
 } else {
   $('attackList').innerHTML=items.slice(-10).reverse().map(a=>`<div class="pill ${attackClass(a.type)}" data-attack="${a.id}">${labels[a.type]} S${a.set}</div>`).join('')||'<p class="muted">No attacks yet.</p>';
   let kills=items.filter(a=>a.type==='kill').length, errors=items.filter(a=>a.type==='attackError').length, attempts=items.filter(a=>a.type==='attempt').length;
   let hit=items.length?((kills-errors)/items.length).toFixed(3):'—';
   $('heatTotals').innerHTML=`<p>Total: ${items.length} | Kills: ${kills} | Attempts: ${attempts} | Errors: ${errors} | Hit%: ${hit}</p><p class="heat-key"><span class="key kill"></span>Kill <span class="key attempt"></span>Attempt <span class="key error"></span>Error</p>`;
 }
}
function renderStats(){
 let filter=$('statsSet')?.value||'all', headers=['Player','Pts','K','Att','Hit%','Blk','Ace','SAtt','Digs','Ast','RecAvg','Err'];
 $('statsTable').innerHTML='<thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+state.roster.map((p,i)=>{
  let s=playerSetStats(p,filter), err=s.attackErrors+s.serveErrors+s.blockErrors+s.digErrors+s.rec0+s.setErrors, hit=s.attacks?((s.kills-s.attackErrors)/s.attacks).toFixed(3):'—';
  return `<tr><td>#${i+1} ${p.name}</td><td>${s.points}</td><td>${s.kills}</td><td>${s.attacks}</td><td>${hit}</td><td>${s.blockSolo+s.blockAssist}</td><td>${s.aces}</td><td>${s.serveAttempts}</td><td>${s.digs}</td><td>${s.assists}</td><td>${recAvg(s)}</td><td class="red">${err}</td></tr>`
 }).join('')+'</tbody>';
}
function renderSets(){
 $('setTabs').innerHTML='<button class="'+(state.activeSetView==='all'?'active':'')+'" data-setview="all">Full Game</button>'+state.sets.map(s=>`<button class="${state.activeSetView===s.set?'active':''}" data-setview="${s.set}">Set ${s.set}</button>`).join('');
 let usSets=state.sets.filter(s=>s.us>s.them && (s.us>=25||s.them>=25)).length, themSets=state.sets.filter(s=>s.them>s.us && (s.us>=25||s.them>=25)).length;
 $('setsUs').textContent=usSets;$('setsThem').textContent=themSets;
 let filter=state.activeSetView;
 let headers=['Player','Pts','K','Att','Hit%','Blk','Ace','SAtt','Digs','Ast','RecAvg','Err'];
 $('setsTable').innerHTML='<thead><tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+state.roster.map((p,i)=>{
  let s=playerSetStats(p,filter), err=s.attackErrors+s.serveErrors+s.blockErrors+s.digErrors+s.rec0+s.setErrors, hit=s.attacks?((s.kills-s.attackErrors)/s.attacks).toFixed(3):'—';
  return `<tr><td>#${i+1} ${p.name}</td><td>${s.points}</td><td>${s.kills}</td><td>${s.attacks}</td><td>${hit}</td><td>${s.blockSolo+s.blockAssist}</td><td>${s.aces}</td><td>${s.serveAttempts}</td><td>${s.digs}</td><td>${s.assists}</td><td>${recAvg(s)}</td><td class="red">${err}</td></tr>`
 }).join('')+'</tbody>';
}
function renderRoster(){
 $('rosterGrid').innerHTML=state.roster.map((p,i)=>`<div class="card roster-card"><div class="avatar">${initials(p.name)||i+1}</div><div><input data-rname="${i}" value="${escapeHtml(p.name)}" placeholder="#${i+1} Name"><input data-rpos="${i}" value="${escapeHtml(p.pos)}" placeholder="Position (OH, MB...)"></div></div>`).join('');
}
async function renderSavedGames(){
 const box=$('savedGamesList'); if(!box)return;
 let games=savedGames();
 if(firebaseReady && currentUser){
   try{
     const cloudGames=await loadCloudGames();
     const map=new Map();
     [...games,...cloudGames].forEach(g=>map.set(g.id,g));
     games=[...map.values()].sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
     setSavedGames(games);
   }catch(e){console.warn("Cloud saved games failed", e)}
 }
 box.innerHTML=games.length?games.map((g,i)=>`<div class="saved-game-row">
  <strong>${escapeHtml(g.name)}</strong>
  <span>${new Date(g.savedAt).toLocaleString()}${currentUser?' · cloud':''}</span>
  <div>
    <button data-load-game="${i}">Load</button>
    <button data-rename-game="${i}">Rename</button>
    <button class="danger-btn" data-delete-game="${i}">Delete</button>
  </div>
 </div>`).join(''):'<p class="muted">No saved games yet.</p>';
}
function renderSetup(){$('teamName').value=state.team;$('oppName').value=state.opp;$('matchNotes').value=state.matchNotes||'';renderSavedGames()}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function removeEvent(ev){
 let p=state.roster.find(x=>x.id===ev.playerId); if(p)applyToStats(p.stats,ev.type,-1);
 let st=state.sets.find(s=>s.set===ev.set); if(st){st.events=st.events.filter(e=>e.id!==ev.id)}
 let scoreTeam=scoreFor(ev.type); if(scoreTeam && ev.set===state.set){state.score[scoreTeam]=Math.max(0,state.score[scoreTeam]-1);currentSet()[scoreTeam]=state.score[scoreTeam]}
}
function editAttack(id){editingAttackId=id;let a=state.attacks.find(x=>x.id===id)||((state.digs||[]).find(x=>x.id===id));if(!a)return;let options=(a.type==='dig'||a.type==='digError')?[['dig','Dig'],['digError','Error']]:statTypes.attack;$('editResult').innerHTML=options.map(([t,l])=>`<option value="${t}">${l}</option>`).join('');$('editResult').value=a.type;$('editSet').innerHTML=state.sets.map(s=>`<option value="${s.set}">Set ${s.set}</option>`).join('');$('editSet').value=a.set;$('editModal').classList.remove('hidden')}
document.body.addEventListener('click',e=>{
 if(e.target.id==='googleSignIn')signInGoogle();
 if(e.target.id==='googleSignOut')signOutGoogle();
 const tab=e.target.closest('.tab');
 const playerRow=e.target.closest('[data-player]');
 const menuBtn=e.target.closest('[data-menu]');
 const logBtn=e.target.closest('[data-log]');
 const scoreBtn=e.target.closest('[data-score]');
 const attackDot=e.target.closest('[data-attack]');
 const setViewBtn=e.target.closest('[data-setview]');
 const minusBtn=e.target.closest('[data-minus-stat]');

 if(tab){document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));tab.classList.add('active');$(tab.dataset.page).classList.add('active');render()}
 if(playerRow){state.selected=Number(playerRow.dataset.player);$('subActions').innerHTML='';render()}
 if(minusBtn){removeLatestStat(minusBtn.dataset.minusStat)}
 if(menuBtn)chooseSub(menuBtn.dataset.menu);
 if(logBtn){let type=logBtn.dataset.log;if(logBtn.dataset.court==='true')openCourt(type);else{logEvent(type);$('subActions').innerHTML=''}}
 if(scoreBtn){pushHistory();let [team,d]=scoreBtn.dataset.score.split(':');state.score[team]=Math.max(0,state.score[team]+Number(d));currentSet()[team]=state.score[team];render()}
 if(e.target.id==='nextSet'){pushHistory();state.set++;state.score={us:0,them:0};state.sets.push({set:state.set,us:0,them:0,events:[]});render()}
 if(e.target.id==='undoBtn')undoLast();
 if(e.target.id==='redoBtn')redoLast();
 if(e.target.id==='resetMatch'&&confirm('Save this game and start a new one?')){pushHistory();archiveCurrentGame();state=newBlankMatch();render()}
 if(e.target.id==='skipCourt'){logEvent(pending.type);pending=null;$('modal').classList.add('hidden');$('subActions').innerHTML=''}
 if(e.target.id==='clearHeat'&&confirm('Clear filtered heatmap dots?')){pushHistory();
  if(heatMode()==='dig'){
    let ids=filteredDigs().map(a=>a.id);
    state.digs=state.digs.filter(a=>!ids.includes(a.id));
    state.sets.forEach(s=>s.events.slice().forEach(ev=>{if(ev.digId&&ids.includes(ev.digId))removeEvent(ev)}));
  }else{
    let ids=filteredAttacks().map(a=>a.id);
    state.attacks=state.attacks.filter(a=>!ids.includes(a.id));
    state.sets.forEach(s=>s.events.slice().forEach(ev=>{if(ev.attackId&&ids.includes(ev.attackId))removeEvent(ev)}));
  }
  render()
 }
 if(attackDot)editAttack(attackDot.dataset.attack);
 if(setViewBtn){state.activeSetView=setViewBtn.dataset.setview==='all'?'all':Number(setViewBtn.dataset.setview);render()}
 if(e.target.id==='cancelEdit')$('editModal').classList.add('hidden');
 if(e.target.id==='deleteAttack'){pushHistory();let ev=state.sets.flatMap(s=>s.events).find(ev=>ev.attackId===editingAttackId||ev.digId===editingAttackId);if(ev)removeEvent(ev);state.attacks=state.attacks.filter(x=>x.id!==editingAttackId);state.digs=(state.digs||[]).filter(x=>x.id!==editingAttackId);$('editModal').classList.add('hidden');render()}
 if(e.target.id==='saveAttack'){pushHistory();let a=state.attacks.find(x=>x.id===editingAttackId)||((state.digs||[]).find(x=>x.id===editingAttackId)), ev=state.sets.flatMap(s=>s.events).find(ev=>ev.attackId===editingAttackId||ev.digId===editingAttackId);if(a&&ev){removeEvent(ev);a.type=$('editResult').value;a.set=Number($('editSet').value);let setObj=state.sets.find(s=>s.set===a.set);if(!setObj){setObj={set:a.set,us:0,them:0,events:[]};state.sets.push(setObj)}ev.type=a.type;ev.set=a.set;setObj.events.push(ev);let p=state.roster.find(x=>x.id===ev.playerId);if(p)applyToStats(p.stats,ev.type,1);let scoreTeam=scoreFor(ev.type);if(scoreTeam&&ev.set===state.set){state.score[scoreTeam]++;currentSet()[scoreTeam]=state.score[scoreTeam]}}$('editModal').classList.add('hidden');render()}
 if(e.target.id==='downloadCsv')downloadStatsCsv();
 if(e.target.id==='exportJson'){let blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='volleyball-match.json';a.click()}
 if(e.target.id==='importJsonBtn')$('importJson').click();
 if(e.target.dataset.loadGame){let g=savedGames()[Number(e.target.dataset.loadGame)];if(g&&confirm('Load this saved game? Current unsaved game will be replaced.')){state=g.game;render()}}
 if(e.target.dataset.deleteGame){let games=savedGames(),i=Number(e.target.dataset.deleteGame);if(confirm('Delete this saved game?')){let deleted=games.splice(i,1)[0];setSavedGames(games);if(deleted)deleteCloudGame(deleted.id);renderSavedGames()}}
 if(e.target.dataset.renameGame){editingGameIndex=Number(e.target.dataset.renameGame);$('gameNameEdit').value=savedGames()[editingGameIndex].name;$('gameModal').classList.remove('hidden')}
 if(e.target.id==='cancelGameName')$('gameModal').classList.add('hidden');
 if(e.target.id==='saveGameName'){let games=savedGames();if(games[editingGameIndex]){games[editingGameIndex].name=$('gameNameEdit').value.trim()||games[editingGameIndex].name;setSavedGames(games);saveCloudGame(games[editingGameIndex])}$('gameModal').classList.add('hidden');renderSavedGames()}
});
$('modalCourt').addEventListener('click',e=>{let r=e.currentTarget.getBoundingClientRect();let x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;logEvent(pending.type,{id:pending.id,x,y});pending=null;$('modal').classList.add('hidden');$('subActions').innerHTML='';});
document.body.addEventListener('input',e=>{
 if(e.target.id==='notes'){player().stats.notes=e.target.value;save()}
 if(e.target.id==='teamName'){state.team=e.target.value;render()}
 if(e.target.id==='oppName'){state.opp=e.target.value;render()}
 if(e.target.id==='matchNotes'){state.matchNotes=e.target.value;save()}
 if(e.target.dataset.rname){state.roster[Number(e.target.dataset.rname)].name=e.target.value;render()}
 if(e.target.dataset.rpos){state.roster[Number(e.target.dataset.rpos)].pos=e.target.value;render()}
});
$('heatType').addEventListener('change',renderHeatmap);$('heatPlayer').addEventListener('change',renderHeatmap);$('heatSet').addEventListener('change',renderHeatmap);$('statsSet').addEventListener('change',renderStats);
$('importJson').addEventListener('change',e=>{let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{state=JSON.parse(r.result);render()};r.readAsText(f)});
render();