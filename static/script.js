/* ---------- Config ---------- */
const MODULE_FILES = {
  Module_1: 'Module_1.json',
  Module_2: 'Module_2.json',
  Module_3: 'Module_3.json',
  Pharm_Quiz_HESI: 'Pharm_Quiz_HESI.json'
};
// Strict phrase for SATA detection (per your rule)
const SATA_PHRASE = '(Select all that apply.)';

/* ---------- Elements ---------- */
const appTitle = document.getElementById('appTitle');
const moduleSelect = document.getElementById('moduleSelect');
const lengthChips = [...document.querySelectorAll('.chip')];
const startBtn = document.getElementById('startBtn');

const setupCard = document.getElementById('setupCard');
const quizCard = document.getElementById('quizCard');
const doneCard = document.getElementById('doneCard');

const questionText = document.getElementById('questionText');
const optionsForm = document.getElementById('optionsForm');
const submitBtn = document.getElementById('submitBtn');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');

const progressText = document.getElementById('progressText');
const runningCounter = document.getElementById('runningCounter');

const feedback = document.getElementById('feedback');
const rationale = document.getElementById('rationale');

const restartBtn = document.getElementById('restartBtn');
const firstTry = document.getElementById('firstTry');
const totalAnswers = document.getElementById('totalAnswers');

/* ---------- State ---------- */
let pool = [];                 // all loaded questions for module
let queue = [];                // active quiz queue (random subset)
let idx = 0;                   // pointer into queue
let isMulti = false;           // current question type (by phrase)

let keyListenerActive = false;

let stagingWrong = [];         // collects wrong questions until threshold reached
let wrongThreshold = 1;        // 15% of queue length

let runningAnswerCount = 0;    // total submissions until mastered
let firstTryCorrect = 0;       // how many were right on first sight
let seenOnce = new Set();      // question IDs already seen at least once

let selectedLen = 10;          // chosen length

/* ---------- Utils ---------- */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function prettyName(key){
  return key.replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
}
function scrollToEl(el, where='start'){
  el?.scrollIntoView({behavior:'smooth', block:where});
}
function getLengthChoice(){
  const active = lengthChips.find(c=>c.classList.contains('active'));
  const v = active?.dataset.len || '10';
  return v === 'full' ? 'full' : parseInt(v,10);
}
function sameSet(a,b){
  if(a.length!==b.length) return false;
  const A=[...a].sort().join('|');
  const B=[...b].sort().join('|');
  return A===B;
}
function mapCorrectLines(q){
  const lines = q.correct.map(letter=>{
    const i = LETTERS.indexOf(letter);
    const txt = q.options[i] ?? '';
    return `${letter} — ${txt}`;
  });
  return lines;
}

function renderAnswerLines(lines, cls='answer-lines'){
  const box = document.createElement('div');
  box.className = cls;
  lines.forEach(line=>{
    const d = document.createElement('div');
    d.className = 'answer-line';
    d.textContent = line;
    box.appendChild(d);
  });
  return box;
}

/* ---------- Data ---------- */
async function loadModule(name){
  const file = MODULE_FILES[name];
  const res = await fetch(file, {cache:'no-store'});
  if(!res.ok) throw new Error(`Could not load ${file}`);
  const data = await res.json();
  // Basic normalization: expecting [{id, stem, options[], correct[], rationale}]
  return data;
}

/* ---------- Quiz lifecycle ---------- */
function buildQueue(raw, wantLen){
  const cloned = raw.map(q=>({...q}));
  shuffle(cloned);
  let len = wantLen==='full' ? cloned.length : Math.min(wantLen, cloned.length);
  return cloned.slice(0, len);
}

function resetRuntimeCounters(total){
  idx = 0;
  runningAnswerCount = 0;
  firstTryCorrect = 0;
  seenOnce.clear();
  stagingWrong = [];
  wrongThreshold = Math.max(1, Math.floor(total * 0.15)); // 15% rule
}

function setTitleForModule(name){
  appTitle.textContent = `${prettyName(name)} — Study Quiz`;
}

/* ---------- Render Question ---------- */
function renderCurrent(){
  const q = queue[idx];
  if(!q){ return finish(); }

  // decide multi-select strictly by phrase in the stem
  isMulti = q.stem.includes(SATA_PHRASE);

  // header
  progressText.textContent = `Question ${idx+1} of ${queue.length}`;
  runningCounter.textContent = `Remaining (to master): ${queue.length - idx}`;

  // content
  questionText.textContent = q.stem; // no bold, slightly larger via CSS

  // options
  optionsForm.innerHTML = '';
  const type = isMulti ? 'checkbox' : 'radio';

  q.options.forEach((opt, i)=>{
    const id = `opt_${i}`;
    const letter = LETTERS[i];

    const wrap = document.createElement('label');
    wrap.className = 'option';
    wrap.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = type;
    input.name = 'optGroup';
    input.id = id;
    input.dataset.letter = letter;

    const letterEl = document.createElement('div');
    letterEl.className = 'letter';
    letterEl.textContent = `${letter}.`;

    const txt = document.createElement('div');
    txt.className = 'text';
    txt.textContent = opt;

    wrap.appendChild(input);
    wrap.appendChild(letterEl);
    wrap.appendChild(txt);
    optionsForm.appendChild(wrap);
  });

  // controls
  nextBtn.disabled = true;
  submitBtn.disabled = false;

  // feedback & rationale
  feedback.innerHTML = '';
  rationale.classList.add('hidden');
  rationale.textContent = '';

  // allow keyboard toggling for this question
  activateKeyboard();
  scrollToEl(quizCard, 'start');
}

function collectSelection(){
  const inputs = [...optionsForm.querySelectorAll('input')];
  const chosen = inputs.filter(i=>i.checked).map(i=>i.dataset.letter);
  return chosen;
}

function gradeCurrent(){
  const q = queue[idx];
  const chosen = collectSelection();
  if(chosen.length===0) return {ok:null};
  const ok = sameSet(chosen, q.correct);
  return {ok, chosen, q};
}

function showFeedback({ok, q}){
  feedback.innerHTML = '';

  if(ok){
    // “Correct.” then the answer wording (each on its own line)
    const head = document.createElement('div');
    head.className='ok';
    head.textContent='Correct!';
    feedback.appendChild(head);

    const lines = mapCorrectLines(q);
    feedback.appendChild(renderAnswerLines(lines));

  } else {
    const head = document.createElement('div');
    head.className='err';
    head.textContent='Incorrect.';
    feedback.appendChild(head);

    const cap = document.createElement('div');
    cap.className='ok';
    cap.textContent='Correct Answer:';
    cap.style.marginTop = '6px';
    feedback.appendChild(cap);

    const lines = mapCorrectLines(q);
    feedback.appendChild(renderAnswerLines(lines));
  }

  if(q.rationale){
    rationale.textContent = q.rationale;
    rationale.classList.remove('hidden');
  } else {
    rationale.classList.add('hidden');
    rationale.textContent = '';
  }

  // scroll down to reveal the full explanation
  scrollToEl(feedback, 'start');
}

function disableInputs(){
  optionsForm.querySelectorAll('input').forEach(i=>i.disabled=true);
}
function enableInputs(){
  optionsForm.querySelectorAll('input').forEach(i=>i.disabled=false);
}

function injectWrongIfThreshold(){
  if(stagingWrong.length >= wrongThreshold){
    // place them immediately next
    const after = idx + 1;
    // keep order they were missed (first missed should appear first)
    queue.splice(after, 0, ...stagingWrong);
    stagingWrong = [];
  }
}

/* ---------- Finish ---------- */
function finish(){
  quizCard.classList.add('hidden');
  doneCard.classList.remove('hidden');

  const firstTryPct = Math.round((firstTryCorrect / queue.length) * 100) || 0;
  firstTry.textContent = `First-Try Accuracy: ${firstTryPct}% (${firstTryCorrect} / ${queue.length})`;
  totalAnswers.textContent = `Total answers submitted: ${runningAnswerCount}`;

  deactivateKeyboard();
  resetBtn.classList.remove('hidden');
}

/* ---------- Keyboard toggle (A/B/C…) + Enter ---------- */
function onKey(e){
  if(!keyListenerActive) return;
  const k = e.key.toLowerCase();

  // A-Z => toggle
  if(k.length===1 && k >= 'a' && k <= 'z'){
    const i = LETTERS.indexOf(k.toUpperCase());
    if(i>=0){
      const input = optionsForm.querySelectorAll('input')[i];
      if(input && !input.disabled){
        if(input.type==='radio'){
          // custom toggle for radios: pressing the same letter again de-selects
          input.checked = input.checked ? false : true;
          // ensure only one radio remains if checked another
          if(input.checked){
            optionsForm.querySelectorAll('input[type=radio]').forEach(r=>{
              if(r!==input) r.checked = false;
            });
          }
        } else {
          input.checked = !input.checked;
        }
      }
    }
  }

  // Enter: submit if available; if already graded, go next
  if(k==='enter'){
    if(!submitBtn.disabled) submitBtn.click();
    else if(!nextBtn.disabled) nextBtn.click();
  }
}
function activateKeyboard(){
  if(!keyListenerActive){
    document.addEventListener('keydown', onKey);
    keyListenerActive = true;
  }
}
function deactivateKeyboard(){
  if(keyListenerActive){
    document.removeEventListener('keydown', onKey);
    keyListenerActive = false;
  }
}

/* ---------- Events ---------- */
lengthChips.forEach(ch=>{
  ch.addEventListener('click', ()=>{
    lengthChips.forEach(c=>c.classList.remove('active'));
    ch.classList.add('active');
  });
});

startBtn.addEventListener('click', async ()=>{
  startBtn.disabled = true;
  try{
    const mod = moduleSelect.value;
    setTitleForModule(mod);
    pool = await loadModule(mod);

    selectedLen = getLengthChoice();
    queue = buildQueue(pool, selectedLen);
    resetRuntimeCounters(queue.length);

    setupCard.classList.add('hidden');
    doneCard.classList.add('hidden');
    quizCard.classList.remove('hidden');
    resetBtn.classList.remove('hidden');

    renderCurrent();
  }catch(err){
    alert(`Failed to start quiz: ${err.message}`);
  }finally{
    startBtn.disabled = false;
  }
});

submitBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  const {ok, chosen, q} = gradeCurrent();
  if(ok===null) return; // no selection

  runningAnswerCount++;

  if(!seenOnce.has(q.id)){
    if(ok) firstTryCorrect++;
    seenOnce.add(q.id);
  }

  showFeedback({ok, q});
  disableInputs();
  submitBtn.disabled = true;
  nextBtn.disabled = false;

  if(!ok){
    // stage this missed item for immediate reinjection upon threshold
    // Push a *new copy* so any future selection state is fresh.
    stagingWrong.push({...q});
    injectWrongIfThreshold();
  }
});

nextBtn.addEventListener('click', ()=>{
  idx++;
  if(idx>=queue.length){
    finish();
    return;
  }
  enableInputs();
  renderCurrent();
});

restartBtn.addEventListener('click', ()=>{
  doneCard.classList.add('hidden');
  setupCard.classList.remove('hidden');
  appTitle.textContent = 'Study Quiz';
});

resetBtn.addEventListener('click', ()=>{
  // Hard reset to start card
  deactivateKeyboard();
  setupCard.classList.remove('hidden');
  quizCard.classList.add('hidden');
  doneCard.classList.add('hidden');
  resetBtn.classList.add('hidden');
  appTitle.textContent = 'Study Quiz';
});

/* ---------- Initial ---------- */
lengthChips[0].classList.add('active');
