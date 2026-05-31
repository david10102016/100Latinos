// ============================================================
//  SUPABASE INIT
// ============================================================
let sb = null, channel = null, currentRole = null;

function initSupabase() {
  if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL === 'PEGA_TU_URL_AQUI') {
    showStatus('⚠ Configurá supabase-config.js', 'disconnected'); return false;
  }
  try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); return true; }
  catch(e) { showStatus('Error Supabase', 'disconnected'); return false; }
}

// ============================================================
//  DEFAULT STATE & QUESTIONS
// ============================================================
const DEFAULT_STATE = {
  phase: 'waiting', qIdx: 0, maxQ: 5, maxFails: 3,
  currentTeam: -1, scores: [0,0], wrongs: [0,0],
  revealed: [], roundPoints: 0,
  names: ['Equipo Azul','Equipo Rojo'],
  school: 'Satélite Norte — Warnes'
};

const DEFAULT_QUESTIONS = [
  { q:'¿Cuál es el transporte más usado para llegar al colegio?', active:true,
    resp:[{t:'Moto',v:38},{t:'A pie',v:25},{t:'Trufi / micro',v:18},{t:'Me traen mis papás',v:12},{t:'Bicicleta',v:7}] },
  { q:'¿Qué es lo primero que hacés al llegar a casa?', active:true,
    resp:[{t:'Tirarme en la cama',v:41},{t:'Comer lo que sea',v:30},{t:'Cambiarme el uniforme',v:18},{t:'Salir a jugar',v:8},{t:'Ponerme a estudiar',v:3}] },
  { q:'¿Qué es lo más esperado del recreo?', active:true,
    resp:[{t:'Comer',v:40},{t:'Ver a mis amigos',v:27},{t:'El partido de fútbol',v:20},{t:'Escapar del salón',v:9},{t:'Tus besos',v:4}] },
  { q:'¿Cuál es la excusa más usada para no entregar la tarea?', active:true,
    resp:[{t:'No entendí nada',v:35},{t:'Se me olvidó',v:28},{t:'Estaba malo/a',v:22},{t:'La hice pero no la traje',v:10},{t:'No había tarea',v:5}] },
  { q:'¿Qué materia nadie quiere que empiece?', active:true,
    resp:[{t:'Matemáticas',v:45},{t:'Física',v:28},{t:'Química',v:15},{t:'La del profe que grita',v:8},{t:'Todas por igual',v:4}] },
  { q:'¿Qué es lo que más distrae en clase?', active:true,
    resp:[{t:'El compañero gracioso',v:38},{t:'Mirar por la ventana',v:27},{t:'Pensar en el recreo',v:20},{t:'Pasar notitas',v:11},{t:'Esa persona que te gusta',v:4}] },
  { q:'¿Cómo llegás al colegio un lunes?', active:true,
    resp:[{t:'Dormido/a caminando',v:42},{t:'Tarde como siempre',v:26},{t:'De mal humor sin razón',v:18},{t:'Rezando que cancelen algo',v:10},{t:'Bien y motivado/a',v:4}] },
  { q:'¿Qué frase del profe ya todos memorizaron?', active:true,
    resp:[{t:'Esto entra en el parcial',v:40},{t:'Silencio por favor',v:28},{t:'Eso lo vieron antes',v:18},{t:'El que no entregó que pase',v:10},{t:'Último aviso',v:4}] },
  { q:'¿Qué hacés cuando el profe sale del salón?', active:true,
    resp:[{t:'El salón explota en caos',v:44},{t:'Me cambio de asiento',v:24},{t:'Hablo con el de al lado',v:18},{t:'Salgo a dar una vuelta',v:10},{t:'Sigo estudiando',v:4}] },
  { q:'¿Cuál es la mejor excusa para llegar tarde?', active:true,
    resp:[{t:'El trufi no pasó',v:36},{t:'Me quedé dormido/a',v:30},{t:'Se me olvidó algo en casa',v:18},{t:'Había mucho tráfico',v:10},{t:'No hay excusa, llegué tarde',v:6}] }
];

let STATE     = { ...DEFAULT_STATE };
let QUESTIONS = DEFAULT_QUESTIONS.map(q => ({...q}));

// ============================================================
//  AUDIO
// ============================================================
let actx = null;
const AC = () => { if (!actx) actx = new (window.AudioContext||window.webkitAudioContext)(); return actx; };

function tone(freq, type, start, duration, vol=.25) {
  const c=AC(), o=c.createOscillator(), g=c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type=type; o.frequency.value=freq;
  const s=c.currentTime+start;
  g.gain.setValueAtTime(vol,s);
  g.gain.exponentialRampToValueAtTime(.001,s+duration);
  o.start(s); o.stop(s+duration+.01);
}

function sndCorrect() { [[523,.0],[659,.12],[784,.24],[1047,.36]].forEach(([f,t])=>tone(f,'sine',t,.35,.28)); }
function sndReveal()  { const c=AC(),o=c.createOscillator(),g=c.createGain(); o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.setValueAtTime(440,c.currentTime);o.frequency.linearRampToValueAtTime(880,c.currentTime+.18);g.gain.setValueAtTime(.22,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.35);o.start();o.stop(c.currentTime+.36); }
function sndWrong()   { [[220,.0,'sawtooth'],[185,.18,'sawtooth'],[150,.36,'sawtooth']].forEach(([f,t,y])=>tone(f,y,t,.28,.32)); tone(80,'sine',.0,.65,.2); }
function sndSteal()   { [[200,.0],[220,.15],[200,.3],[180,.45]].forEach(([f,t])=>tone(f,'triangle',t,.2,.25)); }
function sndWin()     { [[523,.0],[523,.12],[523,.24],[415,.36],[523,.48],[622,.6],[784,.72]].forEach(([f,t])=>tone(f,'triangle',t,.28,.3)); }

// ============================================================
//  VIEW SWITCHING
// ============================================================
function showView(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  el('view-'+id).classList.add('active');
}
function goRole() {
  el('winner-overlay').classList.remove('show');
  showView('role'); currentRole=null;
  if(channel){channel.unsubscribe();channel=null;}
}

// ============================================================
//  ROLE ENTRY
// ============================================================
async function enterRole(role) {
  currentRole = role;
  showView(role);
  await loadState();
  renderFromState();
  subscribeRealtime();
  if (role==='admin') loadAdminData();
}

// ============================================================
//  SUPABASE — LOAD / SAVE
// ============================================================
async function loadState() {
  if (!sb) return;
  showStatus('Sincronizando...','syncing');
  try {
    const {data,error} = await sb.from('game_state').select('*').eq('id',1).single();
    if (error||!data) { showStatus('Sin datos','disconnected'); return; }
    STATE     = {...DEFAULT_STATE, ...data.state};
    QUESTIONS = (data.questions && data.questions.length) ? data.questions : DEFAULT_QUESTIONS.map(q=>({...q}));
    showStatus('Conectado','connected'); setTimeout(hideStatus,2000);
  } catch(e) { showStatus('Error de conexión','disconnected'); }
}

async function saveState() {
  if (!sb) return;
  try { await sb.from('game_state').upsert({id:1, state:STATE, questions:QUESTIONS}); }
  catch(e) { console.error('saveState',e); }
}

// ============================================================
//  REALTIME
// ============================================================
function subscribeRealtime() {
  if (!sb||channel) return;
  channel = sb.channel('game')
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'game_state'}, payload => {
      const prev = JSON.parse(JSON.stringify(STATE));
      STATE     = {...DEFAULT_STATE, ...payload.new.state};
      QUESTIONS = payload.new.questions || QUESTIONS;
      detectAndAnimate(prev);
      renderFromState();
    })
    .subscribe(s => { if(s==='SUBSCRIBED'){showStatus('En vivo ●','connected');setTimeout(hideStatus,2000);} });
}

function detectAndAnimate(prev) {
  if (currentRole!=='projector' && currentRole!=='spectator') return;
  const pw = prev.wrongs||[0,0];
  if (STATE.wrongs[0]>pw[0] || STATE.wrongs[1]>pw[1]) { if(currentRole==='projector') triggerXExplosion(); sndWrong(); }
  const pr = prev.revealed||[];
  if ((STATE.revealed||[]).some((v,i)=>v&&!pr[i]) && currentRole==='projector') sndReveal();
  if (STATE.phase==='stealing' && prev.phase!=='stealing') sndSteal();
  if (STATE.phase==='gameover' && prev.phase!=='gameover') { sndWin(); spawnConfetti(); showWinner(); }
}

// ============================================================
//  RENDER
// ============================================================
function renderFromState() {
  updateNames(); updateScores(); updateXs();
  updateQuestion(); updateBoard(); updateTurn();
  updatePhase(); updatePot(); updateQBadge();
  if (STATE.phase==='gameover') { sndWin(); spawnConfetti(); showWinner(); }
}

function updateNames() {
  const n = STATE.names||['Equipo 1','Equipo 2'];
  ['pres','proj','spec'].forEach(p => {
    setText(`${p}-t1name`, n[0]);
    setText(`${p}-t2name`, n[1]);
  });
  setText('role-school-tag', STATE.school||'—');
  setText('spec-school', STATE.school||'—');
  setText('btn-whot1', n[0]);
  setText('btn-whot2', n[1]);
}

function updateScores() {
  [0,1].forEach(t => ['pres','proj','spec'].forEach(p => setText(`${p}-t${t+1}pts`, (STATE.scores||[0,0])[t])));
}

function updateXs() {
  const maxF = STATE.maxFails||3;
  [0,1].forEach(t => {
    const w = (STATE.wrongs||[0,0])[t];
    ['pres','proj','spec'].forEach(p => {
      const wrap = el(`${p}-t${t+1}xs`); if(!wrap) return;
      const cls  = p==='proj'?'proj-x':p==='pres'?'px':'spec-x';
      wrap.innerHTML = '';
      for(let i=0;i<maxF;i++){
        const d=document.createElement('div');
        d.className=cls+(i<w?' on':'');
        d.textContent=i<w?'X':'';
        wrap.appendChild(d);
      }
    });
    // Active highlight
    ['pres','proj','spec'].forEach(p=>{
      const c1=el(`${p}-t1card`), c2=el(`${p}-t2card`); if(!c1||!c2) return;
      c1.classList.toggle('active', STATE.currentTeam===0);
      c2.classList.toggle('active', STATE.currentTeam===1);
    });
  });
}

function updateQuestion() {
  const q = currentQuestion();
  const txt = q ? q.q : 'Esperando la primera pregunta...';
  ['pres-qtext','proj-qtext','spec-qtext'].forEach(id=>setText(id,txt));
  if(el('proj-inner')&&el('proj-waiting')){
    const w = STATE.phase==='waiting' || !q;
    el('proj-inner').style.display   = w ? 'none' : 'flex';
    el('proj-waiting').style.display = w ? 'flex' : 'none';
  }
}

function updateBoard() {
  const q   = currentQuestion(); if(!q){['pres-board','proj-board','spec-board'].forEach(id=>el(id)&&(el(id).innerHTML=''));return;}
  const rev = STATE.revealed||[];
  const maxV= Math.max(...q.resp.map(r=>r.v));

  // --- PRESENTER board: conductor sees all answers, taps to reveal ---
  const pb = el('pres-board'); if(pb){
    pb.innerHTML='';
    q.resp.forEach((r,i)=>{
      const done = rev[i];
      const btn  = document.createElement('button');
      btn.className = 'pres-abtn' + (done?' revealed':'');
      btn.disabled  = !!done;
      btn.onclick   = ()=>presRevealOne(i);
      btn.innerHTML = `
        <div class="pres-anum">${i+1}</div>
        <div class="pres-atext">${r.t}</div>
        <div class="pres-apts">${r.v}</div>
        <div class="pres-atag">${done?'✓ Revelada':'Tocar para revelar'}</div>
      `;
      pb.appendChild(btn);
    });
  }

  // --- PROJECTOR board ---
  const prb = el('proj-board'); if(prb){
    prb.innerHTML='';
    q.resp.forEach((r,i)=>{
      const d=document.createElement('div');
      d.className='proj-ans'+(rev[i]?' revealed':'');
      d.innerHTML=`
        <div class="proj-anum">${i+1}</div>
        <div class="proj-atext">${rev[i]?r.t:'???'}</div>
        <div class="proj-abar-wrap"><div class="proj-abar" style="width:${rev[i]?Math.round(r.v/maxV*100):0}%"></div></div>
        <div class="proj-avotes">${r.v}</div>
      `;
      prb.appendChild(d);
    });
  }

  // --- SPECTATOR board ---
  const sb2 = el('spec-board'); if(sb2){
    sb2.innerHTML='';
    q.resp.forEach((r,i)=>{
      const d=document.createElement('div');
      d.className='spec-arow'+(rev[i]?' revealed':'');
      d.innerHTML=`<div class="spec-anum">${i+1}</div><div class="spec-atext">${rev[i]?r.t:'???'}</div><div class="spec-avotes">${r.v}</div>`;
      sb2.appendChild(d);
    });
  }
}

function updateTurn() {
  const n = (STATE.names||['Equipo 1','Equipo 2']);
  const t = STATE.currentTeam;
  setText('proj-turn', t>=0 ? n[t] : '—');
  setText('pres-phase', phaseLabel());
  setText('spec-phase', phaseLabel());
}

function updatePhase() {
  const badge = el('proj-phase-badge'); if(!badge) return;
  badge.className='proj-phase-badge';
  if(STATE.phase==='stealing'){badge.classList.add('stealing');badge.textContent='🔴 ROBO';}
  else{badge.classList.add('playing');badge.textContent=STATE.phase==='waiting'?'Esperando':'Jugando';}
}

function updatePot() {
  const p = STATE.roundPoints||0;
  ['pres-pot','proj-pot','spec-pot'].forEach(id=>setText(id,p));
}

function updateQBadge() {
  const t=`P ${(STATE.qIdx||0)+1}/${STATE.maxQ||5}`;
  ['pres-qbadge','proj-qbadge'].forEach(id=>setText(id,t));
}

function phaseLabel() {
  const n=(STATE.names||['Equipo 1','Equipo 2'])[STATE.currentTeam>=0?STATE.currentTeam:0];
  if(STATE.phase==='waiting')   return '⏳ Elegí quién empieza';
  if(STATE.phase==='playing')   return `▶ Turno de ${n}`;
  if(STATE.phase==='stealing')  return `🔴 ROBO — ${n} tiene 1 intento`;
  if(STATE.phase==='roundover') return '✅ Ronda terminada — asigná los puntos';
  if(STATE.phase==='gameover')  return '🏆 ¡Juego terminado!';
  return '—';
}

function currentQuestion() {
  const qs = QUESTIONS.filter(q=>q.active!==false);
  return qs[STATE.qIdx]||null;
}

// ============================================================
//  PRESENTER ACTIONS
// ============================================================
async function presSetTeam(t) {
  STATE.currentTeam = t; STATE.phase='playing';
  renderFromState(); await saveState();
  presToast(`▶ Turno de ${STATE.names[t]} — revelá respuestas o marcá fallos`,'info');
}

async function presRevealOne(idx) {
  const q=currentQuestion(); if(!q||(STATE.revealed||[])[idx]) return;
  if(!STATE.revealed) STATE.revealed=new Array(q.resp.length).fill(false);
  STATE.revealed[idx]=true;
  STATE.roundPoints=(STATE.roundPoints||0)+q.resp[idx].v;
  sndReveal();
  const allRevealed = q.resp.every((_,i)=>STATE.revealed[i]);
  if(allRevealed){
    presToast(`✓ ${q.resp[idx].t} +${q.resp[idx].v} — Todo revelado, presioná ＋ Sumar puntos`,'ok');
  } else {
    presToast(`✓ ${q.resp[idx].t} +${q.resp[idx].v} — Seguí revelando o presioná ＋ Sumar puntos`,'ok');
  }
  renderFromState(); await saveState();
}

async function presWrong() {
  const t=STATE.currentTeam<0?0:STATE.currentTeam;
  STATE.currentTeam=t;
  if(!STATE.wrongs) STATE.wrongs=[0,0];

  // Si ya estamos en fase robo, este es el único intento del equipo robador — termina la ronda
  if(STATE.phase==='stealing'){
    STATE.wrongs[t]++;
    triggerXExplosion(); sndWrong();
    STATE.phase='stealfailed';
    STATE.roundPoints=0; // nadie se lleva los puntos
    presToast(`🔴 Robo fallido — presioná 👁 Revelar todo para mostrar las respuestas`,'bad');
    renderFromState(); await saveState();
    return;
  }

  // Turno normal
  STATE.wrongs[t]++;
  triggerXExplosion(); sndWrong();
  const maxF=STATE.maxFails||3;
  if(STATE.wrongs[t]>=maxF){
    // Auto-switch al equipo contrario para robar
    STATE.currentTeam=1-t;
    STATE.phase='stealing';
    presToast(`3 FALLOS — pasa automáticamente a ${STATE.names[STATE.currentTeam]} — tiene 1 intento de robo`,'bad');
    sndSteal();
  } else {
    presToast(`Fallo ${STATE.wrongs[t]} de ${maxF} — seguí revelando respuestas`,'bad');
  }
  renderFromState(); await saveState();
}

async function presRevealAll() {
  const q=currentQuestion(); if(!q) return;
  const isFailed = STATE.phase==='stealfailed';
  if(!STATE.revealed) STATE.revealed=new Array(q.resp.length).fill(false);
  let added=0;
  q.resp.forEach((r,i)=>{if(!STATE.revealed[i]){STATE.revealed[i]=true;added+=r.v;}});
  if(!isFailed) STATE.roundPoints=(STATE.roundPoints||0)+added;
  STATE.phase='roundover';
  renderFromState(); await saveState();
  presToast('👁 Todo revelado — presioná ＋ Sumar puntos para asignarlos','info');
}

async function presPassPoints() {
  // Bloquear si no hay puntos en el pozo (robo fallido u otro caso sin puntos)
  if(!STATE.roundPoints || STATE.roundPoints===0 || STATE.phase==='stealfailed'){
    presToast('Sin puntos en el pozo — presioná Siguiente →','info');
    return;
  }
  const t=STATE.currentTeam<0?0:STATE.currentTeam;
  STATE.scores[t]=(STATE.scores[t]||0)+(STATE.roundPoints||0);
  STATE.roundPoints=0; STATE.phase='roundover';
  presToast(`✅ +puntos para ${STATE.names[t]} — presioná Siguiente →`,'ok');
  sndCorrect(); renderFromState(); await saveState();
}

async function presNext() {
  STATE.qIdx=(STATE.qIdx||0)+1;
  const qs=QUESTIONS.filter(q=>q.active!==false);
  if(STATE.qIdx>=Math.min(STATE.maxQ||5,qs.length)){
    STATE.phase='gameover'; renderFromState(); await saveState(); showWinner(); return;
  }
  STATE.currentTeam=-1; STATE.phase='waiting';
  STATE.wrongs=[0,0]; STATE.revealed=[]; STATE.roundPoints=0;
  renderFromState(); await saveState();
  presToast('Nueva ronda — elegí quién empieza','info');
}

async function presReset() {
  if(!confirm('¿Reiniciar la partida? Se pierden todos los puntos.')) return;
  STATE={...DEFAULT_STATE,names:STATE.names,school:STATE.school,maxQ:STATE.maxQ,maxFails:STATE.maxFails};
  el('winner-overlay').classList.remove('show');
  renderFromState(); await saveState();
  if(currentRole) showView(currentRole);
  presToast('🔄 Partida reiniciada — elegí quién empieza','info');
}

function presToast(msg,type) {
  const t=el('pres-toast'); if(!t) return;
  t.textContent=msg; t.className=`show ${type}`;
  clearTimeout(presToast._t);
  presToast._t=setTimeout(()=>t.className='',2200);
}

// ============================================================
//  X EXPLOSION
// ============================================================
function triggerXExplosion() {
  const flash=el('x-flash'), letter=el('x-blast-letter');
  flash.className=''; letter.className='';
  void letter.offsetWidth;
  flash.className='boom'; letter.className='boom';
  setTimeout(()=>{flash.className='';letter.className='';},750);
  spawnXParticles();
}

function spawnXParticles() {
  const cx=window.innerWidth/2, cy=window.innerHeight/2;
  for(let i=0;i<16;i++){
    const d=document.createElement('div'); d.className='xp';
    const angle=(Math.PI*2/16)*i+(Math.random()*.3);
    const dist=100+Math.random()*200, size=1.8+Math.random()*3.5;
    d.textContent='X'; d.style.fontSize=size+'rem';
    d.style.left=cx+'px'; d.style.top=cy+'px';
    d.style.marginLeft=-(size*7)+'px'; d.style.marginTop=-(size*8)+'px';
    d.style.setProperty('--tx',`translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist}px)`);
    d.style.setProperty('--r',(Math.random()*180-90)+'deg');
    d.style.setProperty('--d',(.4+Math.random()*.5)+'s');
    d.style.animationDelay=(Math.random()*.12)+'s';
    document.body.appendChild(d); setTimeout(()=>d.remove(),1200);
  }
}

// ============================================================
//  WINNER
// ============================================================
function showWinner() {
  const s=STATE.scores||[0,0], n=STATE.names||['Equipo 1','Equipo 2'];
  const w=s[0]>s[1]?0:s[1]>s[0]?1:-1;
  setText('win-title', w>=0?`¡Ganó ${n[w]}!`:'¡Empate!');
  setText('win-scores', `${n[0]}: ${s[0]} pts  —  ${n[1]}: ${s[1]} pts`);
  el('winner-overlay').classList.add('show');
  sndWin(); spawnConfetti();
}

function spawnConfetti() {
  const cols=['#F5C400','#FF2D2D','#00D4FF','#00E676','#FF9500','#DA40FF'];
  for(let i=0;i<90;i++){
    const c=document.createElement('div'); c.className='cf';
    c.style.left=Math.random()*100+'vw';
    c.style.background=cols[Math.floor(Math.random()*cols.length)];
    c.style.animationDuration=(1.5+Math.random()*2.5)+'s';
    c.style.animationDelay=(Math.random()*1.8)+'s';
    c.style.transform=`rotate(${Math.random()*360}deg)`;
    document.body.appendChild(c); setTimeout(()=>c.remove(),5000);
  }
}

// ============================================================
//  ADMIN
// ============================================================
async function loadAdminData() {
  if(sb) await loadState();
  if(!QUESTIONS||QUESTIONS.length===0){
    QUESTIONS=DEFAULT_QUESTIONS.map(q=>({...q})); await saveState();
  }
  el('adm-school').value   = STATE.school||'';
  el('adm-t1').value       = (STATE.names||[])[0]||'';
  el('adm-t2').value       = (STATE.names||[])[1]||'';
  el('adm-maxq').value     = STATE.maxQ||5;
  el('adm-maxfails').value = STATE.maxFails||3;
  renderAdminQList();
}

function renderAdminQList() {
  const list=el('adm-qlist'); if(!list) return;
  list.innerHTML='';
  if(!QUESTIONS.length){list.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:8px">Sin preguntas. Agregá al menos una.</div>';return;}
  QUESTIONS.forEach((q,i)=>{
    const on=q.active!==false;
    const d=document.createElement('div'); d.className='q-item';
    d.innerHTML=`
      <div class="q-item-num">${i+1}</div>
      <div class="q-item-body">
        <div class="q-item-text" id="qtxt-${i}">${q.q}</div>
        <input class="q-item-edit" id="qedit-${i}" value="${q.q.replace(/"/g,'&quot;')}">
        <div class="q-item-actions">
          <button class="btn btn-ghost btn-xs" onclick="admEditQ(${i})">✏ Editar</button>
          <button class="btn btn-ghost btn-xs" id="qsave-${i}" onclick="admSaveQ(${i})" style="display:none">💾 Guardar</button>
          <button class="btn btn-ghost btn-xs" onclick="admToggleQ(${i})">${on?'Desactivar':'Activar'}</button>
          <button class="btn btn-danger btn-xs" onclick="admDeleteQ(${i})">✕</button>
        </div>
      </div>
      <div class="q-item-badge ${on?'on':'off'}">${on?'Activa':'Inactiva'}</div>
    `;
    list.appendChild(d);
  });
}

function admEditQ(i) {
  el(`qtxt-${i}`).style.display='none';
  el(`qedit-${i}`).style.display='block';
  el(`qsave-${i}`).style.display='inline-flex';
  el(`qedit-${i}`).focus();
}

async function admSaveQ(i) {
  const val=el(`qedit-${i}`).value.trim();
  if(!val) return;
  QUESTIONS[i].q=val;
  await saveState(); renderAdminQList();
}

async function admSaveSettings() {
  STATE.school   = el('adm-school').value.trim()||STATE.school;
  STATE.names    = [el('adm-t1').value.trim()||'Equipo Azul', el('adm-t2').value.trim()||'Equipo Rojo'];
  STATE.maxQ     = parseInt(el('adm-maxq').value)||5;
  STATE.maxFails = parseInt(el('adm-maxfails').value)||3;
  await saveState(); alert('✅ Configuración guardada');
}

function admAddQuestion() {
  const qText=el('adm-nq').value.trim(), rText=el('adm-nr').value.trim();
  if(!qText||!rText){alert('Completá la pregunta y las respuestas');return;}
  const resp=rText.split('\n').map(line=>{const p=line.split(',');return{t:p[0].trim(),v:parseInt(p[1])||10};}).filter(r=>r.t);
  if(resp.length<2){alert('Necesitás al menos 2 respuestas');return;}
  QUESTIONS.push({q:qText,resp,active:true});
  el('adm-nq').value=''; el('adm-nr').value='';
  renderAdminQList(); saveState();
}

async function admToggleQ(i) {
  QUESTIONS[i].active=QUESTIONS[i].active===false?true:false;
  renderAdminQList(); await saveState();
}

async function admDeleteQ(i) {
  if(!confirm('¿Eliminar esta pregunta?')) return;
  QUESTIONS.splice(i,1); renderAdminQList(); await saveState();
}

async function admStartGame() {
  const qs=QUESTIONS.filter(q=>q.active!==false);
  if(!qs.length){alert('Agregá al menos una pregunta');return;}
  // Mezclar preguntas activas aleatoriamente
  shuffleQuestions();
  STATE.qIdx=0; STATE.scores=[0,0]; STATE.wrongs=[0,0];
  STATE.revealed=[]; STATE.roundPoints=0; STATE.currentTeam=-1; STATE.phase='waiting';
  await saveState(); alert('✅ Partida iniciada — preguntas mezcladas aleatoriamente');
}

async function admResetGame() {
  if(!confirm('¿Reiniciar la partida?')) return;
  shuffleQuestions();
  STATE.qIdx=0; STATE.scores=[0,0]; STATE.wrongs=[0,0];
  STATE.revealed=[]; STATE.roundPoints=0; STATE.currentTeam=-1; STATE.phase='waiting';
  await saveState(); alert('✅ Reiniciado — preguntas mezcladas aleatoriamente');
}

// Mezcla solo las preguntas activas, deja inactivas al final
function shuffleQuestions() {
  const active   = QUESTIONS.filter(q=>q.active!==false);
  const inactive = QUESTIONS.filter(q=>q.active===false);
  for(let i=active.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [active[i],active[j]]=[active[j],active[i]];
  }
  QUESTIONS=[...active,...inactive];
}

// ============================================================
//  STATUS BAR
// ============================================================
function showStatus(msg,type){const b=el('status-bar');b.textContent=msg;b.className=`show ${type}`;}
function hideStatus(){el('status-bar').classList.remove('show');}

// ============================================================
//  HELPERS
// ============================================================
function el(id){return document.getElementById(id);}
function setText(id,val){const e=el(id);if(e)e.textContent=val;}

// ============================================================
//  INIT
// ============================================================
window.addEventListener('load', () => {
  initSupabase();
  renderFromState();
});