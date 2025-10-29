/* -----------------------------------------------------------
   Quiz App (frontend only)
   - Random subset each quiz (10/25/50/100/Full) using clean sampling
   - Mastery loop: missed items return until correct
   - Adaptive buffer: when newly-wrong count hits 15% of quiz size (ceil, min 1),
     inject those wrong items to the FRONT immediately; reset the counter
   - Track total submissions; compute first-try % at end
   - Checkbox ONLY if the stem literally contains "(Select all that apply.)"
   - Keyboard:
       * Enter submits, then Enter again advances
       * A–Z toggles matching option; for radios, pressing the same letter
         again de-selects it
----------------------------------------------------------- */

const el = (id) => document.getElementById(id);
const launcher = el('launcher');
const quiz = el('quiz');
const summary = el('summary');

const moduleSel = el('moduleSel');
const lengthBtns = el('lengthBtns');
const startBtn = el('startBtn');

const runCounter = el('runCounter');
const remainingCounter = el('remainingCounter');

const qNumber = el('qNumber');
const questionText = el('questionText');
const optionsForm = el('optionsForm');

const submitBtn = el('submitBtn');
const nextBtn = el('nextBtn');
const feedback = el('feedback');
const answerLine = el('answerLine');
const rationale = el('rationale');
const resetQuizBtn = el('resetQuizBtn');

const fta = el('fta');
const totalSub = el('totalSub');
const restartBtn = el('restartBtn');
const reviewList = el('reviewList');

let state = null;
let currentInputsByLetter = {};

const EXACT_SATA = /\(Select all that apply\.\)/i;

/* ----------------- auto-discover modules from backend ----------------- */
async function discoverModules(){
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('modules endpoint not available');
    const data = await res.json();
    const mods = (data.modules || []).filter(Boolean);
    if (mods.length) {
      moduleSel.innerHTML = mods.map(m => `<option value="${m}">${m}</option>`).join('');
    }
  } catch {
    // Fallback: keep whatever is in HTML; optional HEAD probe for Pharm_Quiz_HESI
    fetch('/Pharm_Quiz_HESI.json', { method: 'HEAD' })
      .then(r => { if (r.ok) moduleSel.add(new Option('Pharm_Quiz_HESI', 'Pharm_Quiz_HESI')); })
      .catch(() => {});
  }
}
discoverModules();

/* --------------------------- length selection -------------------------- */
let pickedLength = 10;
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-len]');
  if (!btn) return;
  [...lengthBtns.querySelectorAll('.seg-btn')].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pickedLength = btn.dataset.len === 'full' ? 'full' : parseInt(btn.dataset.len, 10);
});

/* ----------------------------- quiz controls -------------------------- */
startBtn.addEventListener('click', startQuiz);

restartBtn.addEventListener('click', () => {
  summary.classList.add('hidden');
  launcher.classList.remove('hidden');
  runCounter.textContent = '';
  remainingCounter.textContent = '';
});

resetQuizBtn.addEventListener('click', resetQuiz);

function resetQuiz(){
  state = null;
  quiz.classList.add('hidden');
  summary.classList.add('hidden');
  launcher.classList.remove('hidden');
  runCounter.textContent = '';
  remainingCounter.textContent = '';
  optionsForm.innerHTML = '';
  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';
  rationale.textContent = '';
  submitBtn.disabled = true;
  nextBtn.disabled = true;
  currentInputsByLetter = {};
}

/* ---------------------------- keyboard hooks -------------------------- */
document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;

  // Enter behavior
  if (e.key === 'Enter') {
    const canSubmit = !submitBtn.disabled;
    const canNext = !nextBtn.disabled;
    if (canSubmit) {
      e.preventDefault();
      handleSubmit();
    } else if (canNext) {
      e.preventDefault();
      loadNext();
    }
    return;
  }

  // Letter toggle behavior (A–Z)
  const letter = (e.key && e.key.length === 1) ? e.key.toUpperCase() : '';
  if (letter && currentInputsByLetter[letter]) {
    e.preventDefault();
    const input = currentInputsByLetter[letter];

    if (input.type === 'checkbox') {
      input.checked = !input.checked;
    } else {
      // radio: press again to de-select
      input.checked = input.checked ? false : true;
    }
    updateSubmitEnabled();
  }
});

/* ------------------------------ start quiz ---------------------------- */
async function startQuiz() {
  startBtn.disabled = true;

  try {
    const selected = moduleSel.value;
    if (!selected) throw new Error('Select a module first.');
    const bankName = `${selected}.json`;
    const res = await fetch(`/${bankName}?_=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch ${bankName}`);
    const data = await res.json();

    const all = normalizeQuestions(data);
    const chosen = sampleQuestions(all, pickedLength);

    state = {
      pool: chosen.map(q => ({ ...q, attempts: 0, mastered: false })),
      queue: [],                 // remaining new items
      idx: -1,
      shownCount: 0,
      totalFirstTry: 0,
      totalRequested: chosen.length,
      totalSubmissions: 0,
      review: []
    };

    // Initial queue = all chosen
    state.queue = [...state.pool];

    // init adaptive buffer (15%)
    initAdaptiveBufferForQuiz();

    launcher.classList.add('hidden');
    summary.classList.add('hidden');
    quiz.classList.remove('hidden');

    updateCounters();
    nextBtn.disabled = true;
    feedback.textContent = '';
    feedback.className = 'feedback';
    answerLine.innerHTML = '';
    rationale.textContent = '';

    loadNext();
  } catch (err) {
    alert(err.message || 'Could not load questions.');
  } finally {
    startBtn.disabled = false;
  }
}

/* ------------------------- normalization helpers ---------------------- */
function normalizeQuestions(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.questions || raw.items || []);
  return arr.map((it, i) => {
    const id = it.id || `Q${i+1}`;
    const stem = it.question || it.prompt || it.stem || '';
    const options = normalizeOptions(it.options || it.choices);
    const correctLetters = extractCorrectLetters(it);
    const rationale = it.rationale || it.explanation || it.reason || '';

    return { id, question: stem, options, correctLetters, rationale };
  }).filter(q => {
    return Object.keys(q.options).length && q.correctLetters.length;
  });
}

function normalizeOptions(opts) {
  const out = {};
  if (!opts) return out;

  for (const key of Object.keys(opts)) {
    const k = key.trim().toUpperCase();
    if (/^[A-Z]$/.test(k) && String(opts[key]).trim()) {
      out[k] = String(opts[key]).trim();
    }
  }

  if (Object.keys(out).length === 0 && Array.isArray(opts)) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    opts.forEach((txt, i) => {
      if (String(txt).trim()) out[letters[i]] = String(txt).trim();
    });
  }
  return out;
}

function extractCorrectLetters(it) {
  const candidateKeys = ['answer', 'answers', 'correct', 'correct_answers', 'Correct', 'Answer'];
  let raw = null;
  for (const k of candidateKeys) {
    if (k in it) { raw = it[k]; break; }
  }
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw.map(String).map(s => s.trim().toUpperCase()).filter(isLetter);
  }
  const s = String(raw).toUpperCase();
  const letters = s.match(/[A-Z]/g);
  return letters ? letters.filter(isLetter) : [];
}

function isLetter(x){ return /^[A-Z]$/.test(x); }

/* ---------------------------- random sampling ------------------------- */
function randomInt(max){
  if (max <= 0) return 0;
  if (window.crypto && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function sampleQuestions(arr, requested){
  const copy = arr.slice();
  if (requested === 'full' || requested >= copy.length) return copy;

  const k = Math.max(0, requested | 0);
  // partial Fisher–Yates
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, k);
}

/* ----------------------- submit/grade + flow -------------------------- */
submitBtn.addEventListener('click', handleSubmit);
nextBtn.addEventListener('click', loadNext);

function handleSubmit(){
  const q = state?.pool[state?.idx];
  if (!q) return;

  const picked = [...optionsForm.querySelectorAll('input:checked')].map(i => i.value);
  if (picked.length === 0) return;

  state.totalSubmissions += 1;
  q.attempts += 1;

  const correctSet = new Set(q.correctLetters);
  const pickedSet = new Set(picked.map(s => s.toUpperCase()));
  const isCorrect = setsEqual(correctSet, pickedSet);

  const fullCorrectText = formatCorrectAnswers(q);

  if (isCorrect) {
    if (q.attempts === 1) state.totalFirstTry += 1;
    q.mastered = true;

    feedback.textContent = 'Correct!';
    feedback.className = 'feedback ok';
    answerLine.innerHTML = `<div class="answerText">${escapeHTML(fullCorrectText)}</div>`;
    rationale.textContent = q.rationale || '';

    // if this was in the pre-injection buffer for some reason, drop it
    removeFromWrongBufferById(q.id);
  } else {
    feedback.textContent = 'Incorrect.';
    feedback.className = 'feedback bad';
    answerLine.innerHTML = `
      <div class="answerLabel">Correct Answer:</div>
      <div class="answerText">${escapeHTML(fullCorrectText)}</div>
    `;
    rationale.textContent = q.rationale || '';

    // ADAPTIVE: buffer wrongs instead of pushing to back
    addToWrongBuffer(q);
    wrongSinceInjection += 1;
  }

  // record for review
  const correctLettersCopy = [...correctSet];
  const pickedLettersCopy = [...pickedSet];
  if (isCorrect && !state.review.find(r => r.q.id === q.id)) {
    state.review.push({ q, correctLetters: correctLettersCopy, userLetters: pickedLettersCopy, wasCorrect: true });
  } else if (!isCorrect) {
    const existing = state.review.find(r => r.q.id === q.id);
    if (existing) {
      existing.userLetters = pickedLettersCopy;
      existing.wasCorrect = false;
    } else {
      state.review.push({ q, correctLetters: correctLettersCopy, userLetters: pickedLettersCopy, wasCorrect: false });
    }
  }

  submitBtn.disabled = true;
  nextBtn.disabled = false;

  updateCounters();
}

function loadNext() {
  if (!state) return;

  // If queue is empty but buffer has items OR threshold reached, inject buffer to FRONT
  maybeInjectWrongBuffer();

  if (state.queue.length === 0) {
    // nothing left (buffer handled above)
    finishQuiz();
    return;
  }

  const q = state.queue.shift();
  state.idx = state.pool.findIndex(p => p.id === q.id);
  state.shownCount += 1;

  updateCounters();
  renderQuestion(q);
}

/* ------------------------- adaptive buffer (15%) ----------------------- */
let totalTarget = 0;             // total questions selected for this quiz
let reinjectThreshold = 1;       // ceil(15% of totalTarget), min 1
let wrongBuffer = [];            // wrong since last injection
let wrongBufferSet = new Set();  // track ids to avoid dupes
let wrongSinceInjection = 0;

function initAdaptiveBufferForQuiz() {
  totalTarget = state.totalRequested;
  reinjectThreshold = Math.max(1, Math.ceil(totalTarget * 0.15)); // 15%
  wrongBuffer = [];
  wrongBufferSet.clear();
  wrongSinceInjection = 0;
}

function addToWrongBuffer(q) {
  if (!wrongBufferSet.has(q.id)) {
    wrongBuffer.push(q);
    wrongBufferSet.add(q.id);
  }
}

function removeFromWrongBufferById(id) {
  if (wrongBufferSet.has(id)) {
    wrongBuffer = wrongBuffer.filter(x => x.id !== id);
    wrongBufferSet.delete(id);
  }
}

function maybeInjectWrongBuffer() {
  // Inject if threshold met OR queue drained while buffer has items
  if ((wrongSinceInjection >= reinjectThreshold && wrongBuffer.length) ||
      (state.queue.length === 0 && wrongBuffer.length)) {
    state.queue = wrongBuffer.splice(0).concat(state.queue);
    wrongBufferSet.clear();
    wrongSinceInjection = 0;
    updateCounters();
  }
}

/* -------------------------- rendering helpers ------------------------- */
function renderQuestion(q) {
  const isMulti = EXACT_SATA.test(q.question);
  const type = isMulti ? 'checkbox' : 'radio';

  questionText.textContent = q.question;
  optionsForm.innerHTML = '';
  currentInputsByLetter = {};

  const letters = Object.keys(q.options);

  letters.forEach(letter => {
    const id = `opt-${letter}`;
    const label = document.createElement('label');
    label.className = 'opt';
    label.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = type;
    input.name = 'opts';
    input.value = letter;
    input.id = id;

    currentInputsByLetter[letter.toUpperCase()] = input;

    const text = document.createElement('div');
    text.innerHTML = `<span class="letter">${letter}.</span> ${escapeHTML(q.options[letter])}`;

    label.append(input, text);
    optionsForm.appendChild(label);
  });

  optionsForm.addEventListener('change', updateSubmitEnabled, { once: true });

  submitBtn.disabled = true;
  nextBtn.disabled = true;

  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';
  rationale.textContent = q.rationale || '';
}

function updateSubmitEnabled(){
  submitBtn.disabled = optionsForm.querySelectorAll('input:checked').length === 0;
}

function updateCounters() {
  // Running number shown to learner
  runCounter.textContent = state ? `Question: ${state.shownCount}` : '';
  // Remaining includes queue + buffer
  const remaining = (state ? state.queue.length : 0) + wrongBuffer.length;
  remainingCounter.textContent = `Remaining to master: ${remaining}`;
}

function setsEqual(a, b){
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function formatCorrectAnswers(q){
  const map = {};
  for (const [letter, txt] of Object.entries(q.options)) {
    map[letter.toUpperCase()] = txt;
  }
  const letters = q.correctLetters.slice().sort();
  const joined = letters.map(L => `${L} — ${map[L] ?? ''}`).join('; ');
  return joined || q.correctLetters.join(', ');
}

/* ---------------------------- finish & review ------------------------- */
function finishQuiz(){
  quiz.classList.add('hidden');
  summary.classList.remove('hidden');

  const pct = Math.round((state.totalFirstTry / state.totalRequested) * 100);
  fta.textContent = `First-Try Accuracy: ${pct}% (${state.totalFirstTry} / ${state.totalRequested})`;
  totalSub.textContent = `Total answers submitted: ${state.totalSubmissions}`;

  reviewList.innerHTML = '';
  state.pool.forEach(q => {
    const div = document.createElement('div');
    div.className = 'reviewItem';

    const qEl = document.createElement('div');
    qEl.className = 'reviewQ';
    qEl.textContent = q.question;

    const aEl = document.createElement('div');
    aEl.className = 'reviewA';
    aEl.textContent = `Correct: ${formatCorrectAnswers(q)}`;

    const rEl = document.createElement('div');
    rEl.className = 'reviewR';
    rEl.textContent = q.rationale || '';

    div.append(qEl, aEl, rEl);
    reviewList.appendChild(div);
  });

  runCounter.textContent = '';
  remainingCounter.textContent = '';
}

/* ------------------------------- utils -------------------------------- */
function escapeHTML(s = ''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
