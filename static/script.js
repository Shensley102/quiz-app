/* -----------------------------------------------------------
   Quiz App (frontend only)
   - Random subset each quiz (10/25/50/100/Full)
   - Mastery loop: missed items return until correct
   - Track total submissions; compute first-try % at end
   - Checkbox ONLY if the stem literally contains "(Select all that apply.)"
   - Keyboard: Enter submits; Enter again advances
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
const rationale = el('rationale');

const fta = el('fta');
const totalSub = el('totalSub');
const restartBtn = el('restartBtn');
const reviewList = el('reviewList');

let state = null;

const EXACT_SATA = /\(Select all that apply\.\)/i; // must contain this phrase (per your requirement)

// get selected length
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

/* Keyboard: Enter to submit, then Enter to go next */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const canSubmit = !submitBtn.disabled && !quiz.classList.contains('hidden');
  const canNext = !nextBtn.disabled && !quiz.classList.contains('hidden');
  if (canSubmit) {
    e.preventDefault();
    handleSubmit();
  } else if (canNext) {
    e.preventDefault();
    loadNext();
  }
});

async function startQuiz() {
  startBtn.disabled = true;

  try {
    const bankName = `${moduleSel.value}.json`;
    const res = await fetch(`/${bankName}?_=${Date.now()}`);
    if (!res.ok) throw new Error(`Failed to fetch ${bankName}`);
    const data = await res.json();

    const all = normalizeQuestions(data);
    const chosen = pickRandomSubset(all, pickedLength);

    state = {
      pool: chosen.map(q => ({ ...q, attempts: 0, mastered: false })),
      queue: [],
      idx: -1,
      shownCount: 0,          // running question number visible to learner
      totalFirstTry: 0,
      totalRequested: chosen.length,
      totalSubmissions: 0,
      review: []              // { q, correctLetters, userLetters, wasCorrect }
    };

    // initial queue = all chosen
    state.queue = [...state.pool];

    launcher.classList.add('hidden');
    summary.classList.add('hidden');
    quiz.classList.remove('hidden');

    updateCounters();
    nextBtn.disabled = true;
    feedback.textContent = '';
    rationale.textContent = '';

    loadNext();
  } catch (err) {
    alert(err.message || 'Could not load questions.');
    startBtn.disabled = false;
  } finally {
    startBtn.disabled = false;
  }
}

/* ------------------------- helpers ------------------------- */

function normalizeQuestions(raw) {
  // Expect each item with at least:
  // { id, question, options: {A:"",B:"",C:"",D:""...}, answer or answers or correct, rationale }
  // Be tolerant of minor schema differences.

  const arr = Array.isArray(raw) ? raw : (raw.questions || raw.items || []);
  return arr.map((it, i) => {
    const id = it.id || `Q${i+1}`;
    const stem = it.question || it.prompt || it.stem || '';
    const options = normalizeOptions(it.options || it.choices);
    const correctLetters = extractCorrectLetters(it);
    const rationale = it.rationale || it.explanation || it.reason || '';

    return { id, question: stem, options, correctLetters, rationale };
  }).filter(q => {
    // Keep only questions that have at least one option and a valid answer
    return Object.keys(q.options).length && q.correctLetters.length;
  });
}

function normalizeOptions(opts) {
  // Ensure a {A: "...", B: "..."} object with ordered letters
  const out = {};
  if (!opts) return out;

  // If it's already keyed by letters
  for (const key of Object.keys(opts)) {
    const k = key.trim().toUpperCase();
    if (/^[A-Z]$/.test(k) && String(opts[key]).trim()) {
      out[k] = String(opts[key]).trim();
    }
  }

  // If empty, maybe it's an array
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
  // string like "B", "B, D", "B and D"
  const s = String(raw).toUpperCase();
  const letters = s.match(/[A-Z]/g);
  return letters ? letters.filter(isLetter) : [];
}

function isLetter(x){ return /^[A-Z]$/.test(x); }

function pickRandomSubset(arr, requested) {
  const copy = [...arr];
  shuffle(copy);
  if (requested === 'full') return copy;
  return copy.slice(0, Math.min(requested, copy.length));
}

function shuffle(a){
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}

function setHidden(node, yes){ node.classList.toggle('hidden', yes); }

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

    const text = document.createElement('div');
    text.innerHTML = `<span class="letter">${letter}.</span> ${escapeHTML(q.options[letter])}`;

    label.append(input, text);
    optionsForm.appendChild(label);
  });

  // enable submit only when at least one choice selected
  optionsForm.addEventListener('change', () => {
    submitBtn.disabled = optionsForm.querySelectorAll('input:checked').length === 0;
  }, { once: true });

  submitBtn.disabled = true;
  nextBtn.disabled = true;

  feedback.textContent = '';
  feedback.className = 'feedback';
  rationale.textContent = '';
}

/* ----------------------- flow ----------------------- */

function loadNext() {
  if (!state) return;

  // finished?
  if (state.queue.length === 0) {
    finishQuiz();
    return;
  }

  // rotate next question
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

  // Strict set equality for multi; single is the same comparison logic.
  const isCorrect = setsEqual(correctSet, pickedSet);

  const fullCorrectText = formatCorrectAnswers(q);
  if (isCorrect) {
    if (q.attempts === 1) state.totalFirstTry += 1;
    q.mastered = true;
    feedback.textContent = `Correct! ${fullCorrectText}`;
    feedback.className = 'feedback ok';
    rationale.textContent = q.rationale || '';
    // don't requeue
  } else {
    feedback.textContent = `Incorrect. Correct: ${fullCorrectText}`;
    feedback.className = 'feedback bad';
    rationale.textContent = q.rationale || '';
    // requeue this question to end
    state.queue.push(q);
  }

  // Save for review (only once per question when mastered; or append last attempt)
  if (isCorrect && !state.review.find(r => r.q.id === q.id)) {
    state.review.push({ q, correctLetters: [...correctSet], userLetters: [...pickedSet], wasCorrect: true });
  } else if (!isCorrect) {
    // update or insert last attempt for display (optional)
    const existing = state.review.find(r => r.q.id === q.id);
    if (existing) {
      existing.userLetters = [...pickedSet];
      existing.wasCorrect = false;
    } else {
      state.review.push({ q, correctLetters: [...correctSet], userLetters: [...pickedSet], wasCorrect: false });
    }
  }

  // After submit, disable controls until Next
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

  // Build review (always show all items with correct answers + rationale)
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
