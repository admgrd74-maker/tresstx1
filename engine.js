/* =======================================================================
   MOTEUR DE L'APP ÉLÈVE
   Lit une leçon (window.MT_LESSON) et la joue : tableau, voix, bip, micro.
   Format de leçon : voir docs/FORMAT.md
   ======================================================================= */

const NAMES = {prof:"Professeur", eleve1:"Élève 1", eleve2:"Élève 2", moi:"Vous"};

const REVEAL_TYPES = {
  prono:        { label:'se dit',       svg:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'                                                    },
  traduction:   { label:'veut dire',    svg:'<line x1="17" y1="1" x2="17" y2="11"/><path d="M13 5l4-4 4 4"/><line x1="7" y1="13" x2="7" y2="23"/><path d="M3 19l4 4 4-4"/>'                   },
  construction: { label:'se construit', svg:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
  contraction:  { label:'contraction',  svg:'<polyline points="5 7 2 12 5 17"/><polyline points="19 7 22 12 19 17"/><line x1="2" y1="12" x2="22" y2="12"/>'                                    },
  expression:   { label:"s'utilise",    svg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'                                                                        },
};
// Donne une "voix" distincte par personnage en démo (pitch/débit).
// En production, chaque rôle a son propre fichier audio ElevenLabs.
const PROSODY = {prof:{rate:.95,pitch:1.0}, eleve1:{rate:.92,pitch:1.12}, eleve2:{rate:.84,pitch:1.27}};

const $ = id => document.getElementById(id);
let LESSON = window.MT_LESSON;
let idx=0, paused=false, ttsOn=true, USER_NAME="", moiCount=0;
let mediaRec=null, recChunks=[], lastBlob=null, revealTimers=[], cardSeq=0, ambientAudio=null;
let boardIdx=-1; // index de l'état tableau actif (format changeBoard)
let lessonElapsed=0; // secondes absolues écoulées depuis le début de la leçon (audio uniquement)

/* ---------- machine à mots (roulette tableau) ---------- */
let slotWords       = [];    // [{...reveal}] triés par at absolu — tous les mots de la leçon
let slotActive      = -1;    // index du mot actif (milieu pleine couleur), -1 = aucun
let slotScroll      = 0;     // décalage scroll utilisateur (0 = mot courant, +N = N mots en arrière)
let slotScrollReady = false; // les listeners touchstart/move/end sont-ils installés ?
const SLOT_H        = 220;   // hauteur fixe d'un slot en px
let waveAudioCtx=null, waveAnimId=null; // visualisation waveform client
let running=false, currentAudio=null; // garde contre double run() + audio courant
let bipAudio=null; // élément Audio pré-déverrouillé pour le bip (iOS)

/* ---------- voix de démo ---------- */
let voices=[];
function loadVoices(){ voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if(window.speechSynthesis){ loadVoices(); speechSynthesis.onvoiceschanged=loadVoices; }
function voiceFor(role,lang){
  const pref = lang==="en" ? "en" : "fr";
  const list = voices.filter(v=>v.lang.toLowerCase().startsWith(pref));
  if(!list.length) return null;
  const order={prof:0,eleve1:1,eleve2:2,moi:0};
  return list[(order[role]||0)%list.length];
}

/* ---------- tableau ---------- */
/* Efface les cartes temporaires ; les cartes sans removeAt (data-persistent) survivent.
   Les cartes avec data-remove-at futur survivent aussi — leur suppression sera déclenchée
   par le tick audio du prochain step. */
function clearBoard(){
  const slate=$("slate");
  [...slate.querySelectorAll('.card:not([data-persistent])')].forEach(c=>{
    const ra=parseFloat(c.dataset.removeAt||'0');
    if(!ra||lessonElapsed>=ra) c.remove();
    // sinon on garde la carte, le tick du step suivant la retirera au bon moment
  });
  fitBoard();
}
/* Réinitialisation complète (début de leçon, restart). */
function clearAllBoard(){ $("slate").innerHTML=""; }
/* Renvoie la carte persistante dont le texte correspond, ou null. */
function persistentCardFor(en){
  if(!en) return null;
  for(const c of $("slate").querySelectorAll('.card[data-persistent]')){
    const w=c.querySelector('.cword');
    if(w && w.textContent.trim()===en.trim()) return c;
  }
  return null;
}

/* applyReveals(reveals, audio)
   - Avec audio : sync sur timeupdate → timing précis calé sur la vraie position audio.
   - Sans audio  : fallback setTimeout (TTS ou step sans fichier). */
function applyReveals(reveals, audio){
  clearRevealTimers();
  if(!reveals?.length) return;

  if(audio){
    const shown={}, keys={};
    function tick(){
      if(paused) return;
      const t=audio.currentTime;
      const absT=lessonElapsed+t; // temps absolu depuis début de leçon
      reveals.forEach((r,i)=>{
        const at=r.at||0, removeAt=r.removeAt>0?r.removeAt:Infinity;
        if(!shown[i] && absT>=at){ // apparition : temps absolu depuis début leçon
          shown[i]=true;
          const pers=persistentCardFor(r.en);
          if(pers){
            keys[i]=pers.dataset.cardKey;
            if(r.removeAt>0){ delete pers.dataset.persistent; pers.dataset.removeAt=String(r.removeAt); }
          } else {
            keys[i]=addCard(r);
          }
        }
        if(shown[i] && !shown['rm'+i] && absT>=removeAt){ // disparition : temps absolu
          shown['rm'+i]=true; if(keys[i]) removeCard(keys[i]);
        }
      });
      // Retire aussi les cartes cross-step (board précédent) dont le removeAt absolu est dépassé
      $("slate").querySelectorAll('.card[data-remove-at]').forEach(c=>{
        const ra=parseFloat(c.dataset.removeAt);
        if(!isNaN(ra)&&absT>=ra) removeCard(c.dataset.cardKey);
      });
    }
    audio.addEventListener('timeupdate', tick);
    revealTimers.push({audio, tick}); // stocké pour cleanup
    tick(); // vérifier immédiatement (gère at:0)
    return;
  }

  // Fallback : setTimeout
  (reveals||[]).forEach(r=>{
    const ref={key:null};
    const doAdd=()=>{
      if(!paused){
        const pers=persistentCardFor(r.en);
        if(pers){
          ref.key=pers.dataset.cardKey;
          if(r.removeAt>0) delete pers.dataset.persistent;
        } else {
          ref.key=addCard(r);
        }
      }
    };
    // at est absolu → convertir en délai relatif au step courant
    const atDelay=r.at>0?Math.max(0,(r.at-lessonElapsed)*1000):0;
    if(atDelay<=0) doAdd();
    else revealTimers.push(setTimeout(doAdd,atDelay));
    if(r.removeAt>0){
      const delay=Math.max(0,(r.removeAt-lessonElapsed)*1000); // removeAt absolu → délai relatif
      revealTimers.push(setTimeout(()=>{ if(!paused&&ref.key) removeCard(ref.key); },delay));
    }
  });
}

function applyBoardForStep(stepIdx, audio){
  clearRevealTimers();
  // Réinitialise la piste si elle a été détruite (ex. après réponse BIP)
  if(!document.getElementById('slotTrack')) initSlotTrack();
  // Déclenche un nouveau board si nécessaire (même logique qu'avant)
  if(LESSON.boards){
    const hasFromStep=LESSON.boards.some(b=>b.fromStep!==undefined);
    if(hasFromStep){
      const state=LESSON.boards.find(b=>b.fromStep===stepIdx);
      if(state) addBoardToSlotTrack(state.reveals);
    } else {
      const step=LESSON.steps[stepIdx];
      if(step?.changeBoard){
        boardIdx++;
        if(boardIdx<LESSON.boards.length) addBoardToSlotTrack(LESSON.boards[boardIdx].reveals);
      }
    }
  }
  // Branche tickSlot sur l'audio du step
  if(audio){
    function slotTick(){ tickSlot(lessonElapsed+audio.currentTime); }
    audio.addEventListener('timeupdate', slotTick);
    revealTimers.push({audio, tick: slotTick});
    slotTick(); // vérification immédiate (gère at:0)
  } else {
    tickSlot(lessonElapsed);
  }
}
/* Dalles typographiques : chaque mot est indépendant.
   szH est un plafond par nombre de cartes (heuristique tenant compte du contenu
   complet de la carte : texte FR + étiquette + phon + padding).
   szW contraint les mots longs à rester lisibles en largeur.
   → les mots courts et longs restent dans la même plage de taille. */
/* Mise à jour en place — sans détacher les cartes du DOM pour éviter
   de rejouer fadeup sur les cartes existantes. */
function relayoutSlate(sl){
  const allCards=[...sl.querySelectorAll('[data-card-key]')];
  const live=allCards.filter(c=>!c.classList.contains('removing'));
  const n=live.length;
  sl.style.display='flex'; sl.style.flexDirection='column';
  sl.style.alignItems='stretch'; sl.style.gap='3px';
  if(n===0) return;
  const slW=sl.offsetWidth;
  const szH = n===1 ? 88 : n===2 ? 58 : n===3 ? 40 : 28;
  live.forEach((card)=>{
    card.style.flex='0 0 auto'; card.style.minWidth='0'; card.style.alignItems='flex-start';
    card.style.position=''; card.style.pointerEvents='';
    delete card.dataset.side;
    const en=card.querySelector('.cword');
    if(en){
      const len=en.textContent.trim().length||1;
      const szW=slW>0 ? Math.max(37, Math.floor(slW*0.84/(len*0.62))) : szH;
      en.style.fontSize=Math.min(szH,szW)+'px';
    }
  });
}
function fitBoard(){ relayoutSlate($("slate")); }

function addCard(r){
  const key='k'+(++cardSeq);
  const c=document.createElement("div"); c.dataset.cardKey=key;
  if(r.type==='image'){
    c.className="card image-card";
    const img=document.createElement("img"); img.src=r.src||""; img.alt="";
    c.appendChild(img);
  } else {
    c.className="card"+(r.q?" q":"");
    c.dataset.cat=r.cat||'prono';
    if(r.size) c.dataset.size=r.size;
    const typeDef=REVEAL_TYPES[r.cat||'prono']||REVEAL_TYPES.prono;
    // Badge type — en tête de carte, avant le FR
    const lbl=document.createElement("div"); lbl.className="ctype-label cat-"+(r.cat||'prono');
    const ico=document.createElementNS("http://www.w3.org/2000/svg","svg");
    ico.setAttribute("width","12"); ico.setAttribute("height","12");
    ico.setAttribute("viewBox","0 0 24 24"); ico.setAttribute("fill","none");
    ico.setAttribute("stroke","white"); ico.setAttribute("stroke-width","2");
    ico.setAttribute("stroke-linecap","round"); ico.setAttribute("stroke-linejoin","round");
    ico.innerHTML=typeDef.svg||""; ico.className="ctype-icon";
    const ltxt=document.createElement("span"); ltxt.textContent=typeDef.label;
    lbl.appendChild(ico); lbl.appendChild(ltxt);
    c.appendChild(lbl);
    // FR (optionnel)
    if(r.fr&&r.fr.trim()){
      const fr=document.createElement("div"); fr.className="cword-fr"; fr.textContent=r.fr;
      c.appendChild(fr);
    }
    // EN (mot principal)
    const w=document.createElement("div"); w.className="cword"; w.textContent=r.en;
    c.appendChild(w);
    // Phon en bas (optionnel)
    if(r.phon&&r.phon.trim()){
      const p=document.createElement("div"); p.className="cphon cat-"+(r.cat||'prono');
      p.textContent=r.phon;
      c.appendChild(p);
    }
  }
  if(!r.removeAt || r.removeAt<=0) c.dataset.persistent="1";
  else c.dataset.removeAt=String(r.removeAt); // removeAt absolu, vérifié par tick cross-step
  // Bloquer la transition font-size sur la nouvelle carte le temps que fitBoard()
  // calcule la bonne taille — évite qu'elle apparaisse en train de grandir.
  const newEn=c.querySelector('.cword');
  if(newEn) newEn.style.transition='none';
  $("slate").appendChild(c);
  fitBoard();
  requestAnimationFrame(()=>{
    if(newEn) newEn.style.transition='';
    c.classList.add('fadeup');
  });
  return key;
}
function removeCard(key){
  const c=$("slate").querySelector('[data-card-key="'+key+'"]');
  if(!c) return;
  // Figer la position visuelle avant de sortir du flux flex
  const r=c.getBoundingClientRect(), sr=$("slate").getBoundingClientRect();
  c.style.top=(r.top-sr.top)+'px';
  c.style.left=(r.left-sr.left)+'px';
  c.style.width=r.width+'px';
  c.style.position='absolute'; c.style.pointerEvents='none';
  c.classList.add("removing");
  setTimeout(()=>{ c.remove(); fitBoard(); },620);
}

/* ═══════════════════════════════════════════════════════════
   MACHINE À MOTS — roulette / slot machine
   Tous les reveals de la leçon s'enchaînent comme un flux TikTok :
     · slot du haut   = mot précédent (gris + fondu vers le haut)
     · slot du milieu = mot actif (pleine couleur)
     · slot du bas    = prochain mot (gris + fondu vers le bas)
   Scroll tactile : glisser vers le bas pour voir l'historique.
   ═══════════════════════════════════════════════════════════ */

/* Réinitialise la liste des mots — les mots seront ajoutés dynamiquement
   board par board via addBoardToSlotTrack(). */
function buildSlotWords(){ slotWords=[]; }

/* Appelé quand un board se déclenche : calcule le temps absolu de chaque
   reveal et l'ajoute à la piste DOM (sans reconstruire toute la piste). */
function addBoardToSlotTrack(reveals){
  const track=document.getElementById('slotTrack');
  if(!track||!reveals?.length) return;
  reveals.forEach(r=>{
    if(r.type==='image') return;
    const w=Object.assign({},r);
    // _absAt = temps absolu depuis le début de la leçon
    // Si r.at dépasse lessonElapsed = timing futur précis dans l'audio courant.
    // Sinon (r.at=0 ou passé) = apparition immédiate dès ce board.
    w._absAt = (r.at && r.at>lessonElapsed) ? r.at : lessonElapsed;
    const i=slotWords.length;
    slotWords.push(w);
    const el=document.createElement('div');
    el.className='card slot'; el.dataset.slotIdx=i; el.dataset.cat=w.cat||'prono';
    el.innerHTML=slotCardHTML(w);
    track.appendChild(el);
  });
  updateSlotClasses();
}

/* Taille de police pour Barlow Condensed dans les slots. */
function slotFontSize(en){
  const l=(en||'').length;
  if(l<=9) return 72;
  if(l<=12) return 65; if(l<=16) return 60;
  return 34;
}

function slotFontSizeFr(fr){
  const l=(fr||'').length;
  if(l<=9) return 24;
  if(l<=13) return 22;
  return 20;
}

/* Génère le HTML interne d'une carte de slot. */
function slotCardHTML(r){
  const td=REVEAL_TYPES[r.cat||'prono']||REVEAL_TYPES.prono;
  const sz=slotFontSize(r.en||'');
  const isPhrase=(r.en||'').length>12;

  let h=`<div class="ctype-label cat-${r.cat||'prono'}">
    <svg class="ctype-icon" width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${td.svg||''}
    </svg><span>${td.label}</span></div>`;

  if(r.fr?.trim()){
    const szFr=slotFontSizeFr(r.fr);
    const vwFr=(szFr/3.75).toFixed(1);
    const frCls=isPhrase?'cword-fr fr-phrase':'cword-fr';
    h+=`<div class="${frCls}" style="font-size:min(${szFr}px,${vwFr}vw)">${r.fr}</div>`;
  }
  const vw=(sz/3.75).toFixed(1);
  h+=`<div class="cword" style="font-size:min(${sz}px,${vw}vw)">${r.en||''}</div>`;
  /* Phonétique : uniquement pour les mots courts (pas utile pour les phrases) */
  if(!isPhrase && r.phon?.trim()) h+=`<div class="cphon cat-${r.cat||'prono'}">${r.phon}</div>`;
  return h;
}

/* Centre vertical de la zone de lecture (en px depuis le haut du slate). */
function slotCenterY(){
  const h=$("slate").offsetHeight||820;
  return 80+(h-80-160)/2; // padding-top:80, padding-bottom:160
}

/* Positionne la piste (avec ou sans animation CSS transition). */
function updateTrackPos(animated){
  const track=document.getElementById('slotTrack');
  if(!track) return;
  const displayIdx=slotActive<0?-1:slotActive-slotScroll;
  const cy=slotCenterY();
  const y=Math.round(cy-SLOT_H/2-displayIdx*SLOT_H);
  // Courbe avec léger overshoot : la piste dépasse de quelques px puis se cale (clic roulette)
  track.style.transition=animated?'transform .55s cubic-bezier(.3,1.12,.4,1)':'none';
  track.style.transform='translateY('+y+'px)';
}

/* Met à jour les classes CSS d'état sur chaque slot. */
function updateSlotClasses(){
  const displayIdx=slotActive<0?-1:slotActive-slotScroll;
  document.querySelectorAll('#slotTrack .slot').forEach(el=>{
    const i=parseInt(el.dataset.slotIdx);
    el.className='card slot'; // reset
    if(i===displayIdx)        el.classList.add('slot-active');
    else if(i===displayIdx-1) el.classList.add('slot-prev');
    else if(i===displayIdx+1) el.classList.add('slot-next');
    else if(i<displayIdx)     el.classList.add('slot-history');
    else                      el.classList.add('slot-future');
    el.dataset.cat=slotWords[i]?.cat||'prono'; // préserve la couleur de badge
  });
}

/* Active un slot : anime la piste vers le nouveau mot actif. */
function activateSlot(idx){
  if(idx===slotActive) return;
  slotActive=idx;
  if(slotScroll>0) slotScroll=0; // retour automatique au mot courant
  updateSlotClasses();
  updateTrackPos(true);
}

/* Appelé à chaque tick audio : cherche le mot correspondant au temps absolu.
   Utilise w._absAt (calculé lors de l'ajout du board) et non r.at brut. */
function tickSlot(absT){
  if(!slotWords.length) return;
  let next=-1;
  for(let i=slotWords.length-1;i>=0;i--){
    if((slotWords[i]._absAt||0)<=absT){ next=i; break; }
  }
  if(next!==slotActive) activateSlot(next);
}

/* Crée (ou recrée) la piste DOM — éventuellement peuplée avec slotWords existants
   (ex. réinit après réponse BIP, les mots déjà vus doivent réapparaître). */
function initSlotTrack(){
  const slate=$("slate");
  slate.innerHTML='';
  const track=document.createElement('div');
  track.id='slotTrack'; track.className='slot-track';
  slate.appendChild(track);
  slotWords.forEach((r,i)=>{
    const el=document.createElement('div');
    el.className='card slot'; el.dataset.slotIdx=i; el.dataset.cat=r.cat||'prono';
    el.innerHTML=slotCardHTML(r);
    track.appendChild(el);
  });
  updateSlotClasses();
  updateTrackPos(false);
  if(!slotScrollReady){ setupSlotScroll(); slotScrollReady=true; }
}

/* Installe les listeners de scroll tactile sur le slate (une seule fois). */
function setupSlotScroll(){
  const slate=$("slate");
  let y0=0, scroll0=0;
  slate.addEventListener('touchstart',e=>{
    y0=e.touches[0].clientY;
    scroll0=slotScroll;
    const t=document.getElementById('slotTrack');
    if(t) t.style.transition='none';
  },{passive:true});
  slate.addEventListener('touchmove',e=>{
    const t=document.getElementById('slotTrack');
    if(!t) return;
    const dy=e.touches[0].clientY-y0;
    const cy=slotCenterY();
    const displayIdx=slotActive<0?-1:slotActive-scroll0;
    const baseY=cy-SLOT_H/2-displayIdx*SLOT_H;
    t.style.transform='translateY('+(Math.round(baseY+dy))+'px)';
    e.preventDefault();
  },{passive:false});
  slate.addEventListener('touchend',e=>{
    const dy=e.changedTouches[0].clientY-y0;
    const delta=Math.round(dy/SLOT_H); // nombre de slots à décaler
    const maxScroll=slotActive<0?0:slotActive; // ne pas scroller plus loin que le 1er mot
    slotScroll=Math.max(0,Math.min(maxScroll,scroll0+delta));
    updateSlotClasses();
    updateTrackPos(true);
  },{passive:true});
}
function clearRevealTimers(){
  revealTimers.forEach(t=>{
    if(typeof t==='number') clearTimeout(t);
    else if(t?.audio) t.audio.removeEventListener('timeupdate',t.tick);
  });
  revealTimers=[];
}

/* ---------- audio / voix ---------- */
function speakStep(step, preloadedAudio){
  return new Promise(res=>{
    if(preloadedAudio||step.audio){
      const a=preloadedAudio||new Audio(step.audio);
      currentAudio=a;
      a.onended=()=>{ lessonElapsed+=isFinite(a.duration)&&a.duration>0?a.duration:0; currentAudio=null; res(); };
      a.onerror=()=>{ currentAudio=null; res(); };
      a.play().catch(()=>{ currentAudio=null; res(); });
      return;
    }
    if(!ttsOn || !window.speechSynthesis || !step.speak){
      const n=(step.speak||[]).reduce((a,s)=>a+s[0].length,0);
      return setTimeout(res, Math.max(850, n*55));
    }
    const pr=PROSODY[step.role]||PROSODY.prof; let i=0;
    (function nx(){
      if(paused||i>=step.speak.length) return res();
      const [t,l]=step.speak[i++]; const u=new SpeechSynthesisUtterance(t);
      u.lang=l==="en"?"en-US":"fr-FR"; const v=voiceFor(step.role,l); if(v)u.voice=v;
      u.rate=pr.rate*(l==="en"?.93:1); u.pitch=pr.pitch; u.onend=nx; u.onerror=nx; speechSynthesis.speak(u);
    })();
  });
}
function sayName(step){
  // PRODUCTION : jouer ici le clip "prénom" généré 1x via ElevenLabs (step.nameClip si présent).
  return new Promise(res=>{
    if(step && step.nameClip){ const a=new Audio(step.nameClip); a.onended=res; a.onerror=res; a.play().catch(res); return; }
    const line="À toi, "+USER_NAME+" !";
    if(!ttsOn||!window.speechSynthesis) return setTimeout(res,900);
    const u=new SpeechSynthesisUtterance(line); u.lang="fr-FR"; const v=voiceFor("prof","fr"); if(v)u.voice=v; u.rate=.95;
    u.onend=res; u.onerror=res; speechSynthesis.speak(u);
  });
}
function generateChimeWAV(){
  const SR=22050, dur=0.72, N=Math.floor(SR*dur);
  const ab=new ArrayBuffer(44+N*2), dv=new DataView(ab);
  const str=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  str(0,'RIFF'); dv.setUint32(4,36+N*2,true); str(8,'WAVE');
  str(12,'fmt '); dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,SR,true); dv.setUint32(28,SR*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
  str(36,'data'); dv.setUint32(40,N*2,true);
  for(let i=0;i<N;i++){
    const t=i/SR; let v=0;
    // C5 (523Hz) — note 1
    if(t<0.50) v+=Math.sin(2*Math.PI*523*t)*Math.exp(-t*5.5)*0.22;
    // A5 (880Hz) — note 2, légèrement décalée
    if(t>=0.11&&t<0.72){
      const t2=t-0.11;
      v+=Math.sin(2*Math.PI*880*t)*(t2<0.015?t2/0.015:Math.exp(-(t2-0.015)*4))*0.18;
    }
    dv.setInt16(44+i*2, Math.max(-32767,Math.min(32767,Math.round(v*32767))), true);
  }
  const u8=new Uint8Array(ab); let s='';
  for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  return 'data:audio/wav;base64,'+btoa(s);
}
function initBipAudio(){
  if(bipAudio) return;
  try{
    bipAudio=new Audio(generateChimeWAV());
    bipAudio.load();
    // Déverrouillage iOS : play puis pause immédiat dans le geste utilisateur
    const p=bipAudio.play();
    if(p) p.then(()=>{ bipAudio.pause(); bipAudio.currentTime=0; }).catch(()=>{});
  }catch(e){}
}
function beep(){
  if(!bipAudio) return;
  bipAudio.currentTime=0;
  bipAudio.play().catch(()=>{});
}

/* ---------- ambiance ---------- */
function startAmbient(src){
  if(!src) return;
  ambientAudio=new Audio(src); ambientAudio.loop=true; ambientAudio.volume=0.13;
  ambientAudio.play().catch(()=>{});
}
function stopAmbient(){
  if(!ambientAudio) return;
  const a=ambientAudio; ambientAudio=null; let v=a.volume;
  const t=setInterval(()=>{ v-=0.015; if(v<=0){a.pause();clearInterval(t);}else a.volume=v; },80);
}

/* ---------- waveform visualisation ---------- */
function stopWaveViz(){
  if(waveAnimId){ cancelAnimationFrame(waveAnimId); waveAnimId=null; }
  if(waveAudioCtx){ try{ waveAudioCtx.close(); }catch(e){} waveAudioCtx=null; }
  const canvas=$("moiWave");
  if(canvas){ canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height); }
}
function startIdleWave(){
  // Onde décorative animée — démarre dès le tour du client sans micro
  stopWaveViz();
  const canvas=$("moiWave"); if(!canvas) return;
  let t=0;
  const ctx=canvas.getContext("2d");
  const W=canvas.width, H=canvas.height;
  (function draw(){
    waveAnimId=requestAnimationFrame(draw);
    t+=0.038;
    ctx.clearRect(0,0,W,H);
    ctx.beginPath();
    ctx.strokeStyle="rgba(52,211,153,.45)";
    ctx.lineWidth=2; ctx.lineJoin="round";
    for(let i=0;i<=W;i++){
      const y=H/2+Math.sin(i*0.07+t)*5+Math.sin(i*0.13+t*1.5)*2.5;
      i===0?ctx.moveTo(i,y):ctx.lineTo(i,y);
    }
    ctx.stroke();
  })();
}
function startWaveViz(stream){
  // Onde audio temps réel — remplace l'onde décorative pendant l'enregistrement
  stopWaveViz();
  const canvas=$("moiWave"); if(!canvas) return;
  try{
    waveAudioCtx=new AudioContext();
    const analyser=waveAudioCtx.createAnalyser(); analyser.fftSize=128;
    waveAudioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf=new Uint8Array(analyser.fftSize);
    const ctx=canvas.getContext("2d");
    const W=canvas.width, H=canvas.height;
    (function draw(){
      waveAnimId=requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(buf);
      ctx.clearRect(0,0,W,H);
      ctx.beginPath();
      ctx.strokeStyle="rgba(52,211,153,.92)";
      ctx.lineWidth=2; ctx.lineJoin="round";
      const step=W/buf.length;
      buf.forEach((v,i)=>{
        const x=i*step, y=(v/128-1)*(H/2)+H/2;
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      });
      ctx.stroke();
    })();
  }catch(e){ startIdleWave(); }
}

/* ---------- scène vocale ---------- */
function charName(role){
  if(role==="moi") return USER_NAME||"Vous";
  return (LESSON.characters||{})[role]?.name || NAMES[role];
}
function initVocalStage(){
  ['prof','eleve1','eleve2'].forEach(r=>{
    const lbl=$('vsl-'+r); if(lbl) lbl.textContent=charName(r);
  });
}
function setSpeaker(role){
  // badge caché (moteur)
  $("speaker").textContent=NAMES[role]; $("speaker").dataset.who=role==="moi"?"vous":role;

  const isMoi=role==="moi";

  // positions et état actif des sièges
  if(!isMoi){
    const others=['prof','eleve1','eleve2'].filter(r=>r!==role);
    const s=$('vs-'+role); if(s) s.dataset.pos='center';
    if(others[0]){ const s2=$('vs-'+others[0]); if(s2) s2.dataset.pos='left'; }
    if(others[1]){ const s3=$('vs-'+others[1]); if(s3) s3.dataset.pos='right'; }
  }
  ['prof','eleve1','eleve2'].forEach(r=>{
    const seat=$('vs-'+r); if(!seat) return;
    const wasActive = seat.classList.contains('vs-active');
    seat.classList.toggle('vs-active', !isMoi && r===role);
    const isNowActive = seat.classList.contains('vs-active');
    if(!wasActive && isNowActive && typeof gsap!=='undefined'){
      gsap.from(seat.querySelector('.char-av'), { scale:.72, duration:.65, ease:'elastic.out(1,.5)', clearProps:'scale' });
    }
  });

  // panel micro : désactivé si pas le tour du client
  const panel=$("panel");
  if(panel) panel.classList.toggle('disabled', !isMoi);
  if(isMoi && typeof gsap!=='undefined'){
    gsap.from('#panel .bip-card', { y:14, opacity:0, scale:.96, duration:.50, ease:'cubic-bezier(.16,1,.3,1)', clearProps:'all' });
  }
}
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

function updateProgress(){
  const total=LESSON.steps.length;
  const pct=total>0 ? Math.round(idx/total*100) : 0;
  const fill=$("progressFill");
  const lbl=$("progressPct");
  const steps=$("progressSteps");
  if(fill)  fill.style.width=pct+'%';
  if(lbl)   lbl.textContent=pct+'%';
  if(steps) steps.textContent=idx+' / '+total;
}

async function run(){
  if(running) return;
  running=true;
  while(idx<LESSON.steps.length && !paused){
    const step=LESSON.steps[idx];
    setSpeaker(step.role);
    $("stage").textContent=step.tag?"("+step.tag+")":"";
    const stepAudio=step.audio ? new Audio(step.audio) : null;
    applyBoardForStep(idx, stepAudio);
    if(step.role==="moi"){ await yourTurn(step); idx++; updateProgress(); continue; }
    $("caption").innerHTML=step.fr||"";
    await speakStep(step, stepAudio); await wait(280); idx++; updateProgress();
  }
  running=false;
  if(idx>=LESSON.steps.length && !paused) finish();
}

function showBipZone(step){
  const bz=$("bipZone"); if(!bz) return;
  // Titre : bip.title si défini, sinon défaut
  const title = step.bip?.title || "Comment dit-on en anglais :";
  // Phrase : bip.question si défini, sinon step précédent (question du prof), sinon vide
  const prevFr = idx>0 ? LESSON.steps[idx-1]?.fr||"" : "";
  const phrase = (step.bip?.question || step.fr || prevFr).replace(/<[^>]+>/g,"").trim();
  const titleEl = bz.querySelector(".bip-q-title");
  if(titleEl) titleEl.textContent = title;
  $("bipPhrase").textContent = phrase;
  const _len = phrase.length;
  $("bipPhrase").style.fontSize = (_len < 18 ? 38 : _len < 32 ? 30 : _len < 48 ? 24 : 19) + 'px';
  const context = step.bip?.context || step.context || "";
  const ctxEl = $("bipContext");
  if(ctxEl){ ctxEl.textContent = context; ctxEl.style.display = context ? "" : "none"; }
  bz.style.display="flex";
  if(typeof gsap!=='undefined'){
    gsap.from(bz, { opacity:0, duration:.30, ease:'power2.out', clearProps:'opacity' });
    // Mots de la phrase
    if(typeof SplitText!=='undefined'){
      const st=new SplitText('#bipPhrase',{type:'words'});
      gsap.from(st.words,{ opacity:0, y:20, stagger:.08, duration:.55, delay:.10, ease:'cubic-bezier(.16,1,.3,1)', onComplete:()=>st.revert() });
    }
    gsap.from('#voirRepBtn',{ opacity:0, y:8, duration:.40, delay:.35, ease:'power2.out', clearProps:'all' });
  }
  const voirBtn=$("voirRepBtn");
  const revenirBtn=$("revenirBtn");
  if(voirBtn) voirBtn.onclick=()=>{
    bz.style.display="none";
    const rep=step.bip?.reponse;
    if(rep?.reveals?.length){ clearAllBoard(); rep.reveals.forEach(r=>addCard(r)); }
    if(rep?.audio){
      const a=new Audio(rep.audio);
      currentAudio=a;
      a.onended=()=>{ currentAudio=null; };
      a.onerror=()=>{ currentAudio=null; };
      a.play().catch(()=>{});
    }
    const panel=$("panel"); if(panel) panel.classList.add("answer-shown");
  };
  if(revenirBtn) revenirBtn.onclick=()=>{
    const panel=$("panel"); if(panel) panel.classList.remove("answer-shown");
    showBipZone(step);
  };
}
function hideBipZone(){
  const bz=$("bipZone"); if(bz) bz.style.display="none";
}

function yourTurn(step){
  return new Promise(async resolve=>{
    moiCount++; beep();
    $("caption").innerHTML='<b>À toi, '+USER_NAME+' !</b> Réponds à voix haute, puis continue.';
    showBipZone(step);
    startIdleWave(); // onde décorative immédiate
    const mic=$("mic"); mic.disabled=false; mic.classList.add("live");
    $("micLabel").textContent="maintiens pour parler";
    $("contBtn").style.display="flex";
    if(typeof gsap!=='undefined') gsap.from('#contBtn', { scale:.88, opacity:0, duration:.38, ease:'back.out(1.4)', clearProps:'all' });
    lastBlob=null; $("replayBtn").disabled=true;
    const cont=$("contBtn");
    function done(){
      hideBipZone();
      mic.disabled=true; mic.classList.remove("live","rec");
      cont.style.display="none";
      cont.removeEventListener("click",done);
      $("micLabel").textContent="en écoute…";
      stopWaveViz();
      const panel=$("panel");
      if(panel){ panel.classList.add("disabled"); panel.classList.remove("answer-shown"); }
      resolve();
    }
    cont.addEventListener("click",done);
  });
}

/* ---------- micro ---------- */
async function startRec(){
  const mic=$("mic"); if(mic.disabled) return;
  mic.classList.add("rec"); $("micLabel").textContent="● enregistrement…";
  if(!navigator.mediaDevices||!window.MediaRecorder) return;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    startWaveViz(stream);
    recChunks=[]; mediaRec=new MediaRecorder(stream); mediaRec.ondataavailable=e=>recChunks.push(e.data);
    mediaRec.onstop=()=>{ lastBlob=new Blob(recChunks,{type:"audio/webm"}); $("replayBtn").disabled=false; stream.getTracks().forEach(t=>t.stop()); };
    mediaRec.start();
  }catch(e){}
}
function stopRec(){
  const mic=$("mic"); mic.classList.remove("rec"); $("micLabel").textContent="maintiens pour parler";
  stopWaveViz();
  if(mediaRec&&mediaRec.state==="recording") mediaRec.stop();
  // Reprend l'onde décorative si c'est encore le tour du client
  if(mic.classList.contains("live")) startIdleWave();
}

/* ---------- contrôles ---------- */
function finish(){ stopAmbient(); $("recapHi").textContent="Bravo, "+USER_NAME+" !"; $("recapCount").textContent=moiCount; $("recap").classList.remove("hidden"); }
function enter(){
  initBipAudio(); // crée et déverrouille l'Audio dans le geste utilisateur (iOS)
  USER_NAME=($("nameInput").value.trim())||"l'ami"; ttsOn=$("ttsChk").checked;
  $("topTag").textContent="● "+(LESSON.title||"Méthode audio"); $("signup").classList.add("hidden");
  if(window.speechSynthesis){ speechSynthesis.cancel(); speechSynthesis.resume(); }
  initVocalStage();
  const pbtn=$("playBtn"); if(pbtn) pbtn.classList.add("paused");
  idx=0; boardIdx=-1; paused=false; moiCount=0; lessonElapsed=0;
  slotActive=-1; slotScroll=0;
  clearAllBoard();
  buildSlotWords();
  initSlotTrack();
  startAmbient(LESSON.ambient); updateProgress(); run();
}
function restart(){
  paused=true;
  if(currentAudio){ currentAudio.pause(); currentAudio=null; }
  stopAmbient(); clearRevealTimers(); stopWaveViz();
  if(window.speechSynthesis) speechSynthesis.cancel();
  $("recap").classList.add("hidden");
  const panel=$("panel"); if(panel) panel.classList.add("disabled");
  const rbtn=$("playBtn"); if(rbtn) rbtn.classList.add("paused");
  setTimeout(()=>{
    hideBipZone(); idx=0; boardIdx=-1; paused=false; moiCount=0; lessonElapsed=0;
    $("contBtn").style.display="none";
    slotActive=-1; slotScroll=0;
    clearAllBoard();
    buildSlotWords();
    initSlotTrack();
    run();
  },200);
}
function importLesson(file){
  const r=new FileReader();
  r.onload=e=>{ try{
    LESSON=JSON.parse(e.target.result);
    $("topTag").textContent="● "+(LESSON.title||"Méthode audio");
    initVocalStage();
  }catch(err){ alert("Fichier de leçon illisible."); } };
  r.readAsText(file);
}

/* ---------- sélecteur de leçons ---------- */
async function chargerLeconDefaut(){
  try{
    const r=await fetch('lesson-default.mtlesson');
    if(!r.ok) return;
    LESSON=await r.json();
    initVocalStage();
  }catch(e){}
}
async function chargerManifest(){
  try{
    const r=await fetch('../lessons/index.json');
    if(!r.ok) throw new Error();
    const manifest=await r.json();
    if(!manifest.length) throw new Error();
    afficherSelecteur(manifest);
  }catch(e){ chargerLeconDefaut(); }
}
function pairLabel(pair){ return({'fr-en':'FR → EN','fr-es':'FR → ES','fr-de':'FR → DE','fr-it':'FR → IT'}[pair]||pair); }
function afficherSelecteur(manifest){
  const picker=$('lessonPicker'), cards=$('lpCards');
  picker.style.display='';
  manifest.forEach((item,i)=>{
    const btn=document.createElement('button'); btn.className='lesson-card'+(i===0?' sel':'');
    btn.innerHTML='<span class="lc-title">'+item.title+'</span><span class="lc-pair">'+pairLabel(item.pair)+'</span>';
    btn.onclick=()=>choisirLecon(item,btn);
    cards.appendChild(btn);
  });
  choisirLecon(manifest[0],cards.firstChild);
}
async function choisirLecon(item,cardEl){
  $('lpCards').querySelectorAll('.lesson-card').forEach(c=>c.classList.remove('sel'));
  cardEl.classList.add('sel');
  try{
    const r=await fetch(item.file);
    if(!r.ok) throw new Error();
    LESSON=await r.json();
    initVocalStage();
  }catch(e){ alert('Impossible de charger la leçon : '+item.title+'.'); }
}
chargerManifest();

function togglePause(){
  const btn=$("playBtn"); if(!btn) return;
  if(paused){ // reprendre
    paused=false;
    btn.classList.add("paused"); // icône pause visible = leçon en cours
    document.body.classList.remove("lesson-paused");
    if(currentAudio) currentAudio.play().catch(()=>{});
    if(window.speechSynthesis) speechSynthesis.resume();
    if(!running) run();
  } else { // mettre en pause
    paused=true;
    btn.classList.remove("paused"); // icône play visible = leçon en pause
    document.body.classList.add("lesson-paused");
    if(currentAudio) currentAudio.pause();
    if(window.speechSynthesis) speechSynthesis.pause();
  }
}

/* ---------- événements ---------- */
if(typeof gsap!=='undefined' && typeof SplitText!=='undefined') gsap.registerPlugin(SplitText);

$("enterBtn").onclick=enter;
$("nameInput").addEventListener("keydown",e=>{ if(e.key==="Enter") enter(); });
$("restartBtn").onclick=restart; $("againBtn").onclick=restart;
$("replayBtn").onclick=()=>{ if(lastBlob) new Audio(URL.createObjectURL(lastBlob)).play(); };
$("playBtn").onclick=togglePause;
$("importBtn").onclick=()=>$("fileImport").click();
$("fileImport").onchange=function(){ if(this.files[0]) importLesson(this.files[0]); this.value=""; };
const mic=$("mic");
mic.addEventListener("mousedown",startRec);
mic.addEventListener("touchstart",e=>{e.preventDefault();startRec();},{passive:false});
window.addEventListener("mouseup",stopRec); window.addEventListener("touchend",stopRec);
