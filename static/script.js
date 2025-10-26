/* -----------------------------------------------------------
   Quiz App (frontend only)
   - Random subset each quiz (10/25/50/100/Full) using clean sampling
   - Mastery loop: missed items return until correct
   - Track total submissions; compute first-try % at end
   - Checkbox ONLY if the stem literally contains "(Select all that apply.)"
   - Keyboard:
       * Enter submits, then Enter again advances
       * A–Z toggles matching option; for radios, pressing the same letter
         again de-selects it
   - NEW: auto-discover Module_*.json via /modules
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

// length selection
let pickedLength = 10;
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-len]');
  if (!btn) return;
  [...lengthBtns.querySelectorAll('.seg-btn')].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pickedLength = btn.dataset.len === 'full' ? 'full' : parseInt(btn.dataset.len, 10);
});

startBtn.addEventListener('click', startQuiz);

restartBtn.addEventListener('click', () => {
  summary.classList.add('hidden');
  launcher.classList.remove('hidden');
  runCounter.textContent = '';
  remainingCounter.textContent = '';
});

// explicit reset during quiz
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

/* Keyboard controls */
document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;

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

/* NEW: auto-discover modules from the backend */
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
    // Fallback: keep whatever options are already present in the HTML
  }
}
discoverModules(); // run on load (script is defer'd)

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

    // clean random sampling per run
    const chosen = sampleQuestions(all, pickedLength);

    state = {
      pool: chosen.map(q => ({ ...q, attempts: 0, mastered: false })),
      queue: [],
      idx: -1,
      shownCount: 0,
      totalFirstTry: 0,
      totalRequested: chosen.length,
      totalSubmissions: 0,
      review: []
    };

    state.queue = [...state.pool];

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

/* ------------------------- helpers ------------------------- */

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

/* exact-size random sample (no memory across runs) */
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

function setHidden(node, yes){ node.classList.toggle('hidden', yes); }
function updateSubmitEnabled(){
  submitBtn.disabled = optionsForm.querySelectorAll('input:checked').length === 0;
}

function updateCounters() {
  runCounter.textContent = state ? `Question: ${state.shownCount}` : '';
  remainingCounter.textContent = state ? `Remaining to master: ${state.queue.length}` : '';
}

/* ----------------------- rendering ----------------------- */

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
  rationale.textContent = '';
}

/* ----------------------- flow ----------------------- */

function loadNext() {
  if (!state) return;

  if (state.queue.length === 0) {
    finishQuiz();
    return;
  }

  const q = state.queue.shift();
  state.idx = state.pool.findIndex(p => p.id === q.id);
  state.shownCount += 1;

  updateCounters();
  renderQuestion(q);
}

submitBtn.addEventListener('click', handleSubmit);
nextBtn.addEventListener('click', loadNext);

function handleSubmit(){
  const q = state.pool[state.idx];
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
  } else {
    feedback.textContent = 'Incorrect.';
    feedback.className = 'feedback bad';
    answerLine.innerHTML = `
      <div class="answerLabel">Correct Answer:</div>
      <div class="answerText">${escapeHTML(fullCorrectText)}</div>
    `;
    rationale.textContent = q.rationale || '';
    state.queue.push(q);
  }

  // store for review
  if (isCorrect && !state.review.find(r => r.q.id === q.id)) {
    state.review.push({ q, correctLetters: [...correctSet], userLetters: [...pickedSet], wasCorrect: true });
  } else if (!isCorrect) {
    const existing = state.review.find(r => r.q.id === q.id);
    if (existing) {
      existing.userLetters = [...pickedSet];
      existing.wasCorrect = false;
    } else {
      state.review.push({ q, correctLetters: [...correctSet], userLetters: [...pickedSet], wasCorrect: false });
    }
  }

  submitBtn.disabled = true;
  nextBtn.disabled = false;

  updateCounters();
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

/* ----------------------- finish ----------------------- */

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

/* ----------------------- utils ----------------------- */

function escapeHTML(s = ''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
