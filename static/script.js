/* -----------------------------------------------------------
   Final-Semester-Study-Guide - Quiz Frontend
   One-button flow:
     - Submit ➜ Next (same size, green) after submission
   Counting & grading:
     - Question counts every attempt (retries included)
     - Remaining only drops on correct submission
     - First-try % = (# first-try correct / total unique)
   Plus: SATA line breaks, scroll-to-bottom after submit,
         dynamic title, 5%/15% reinforcement, keyboard shortcuts.
   Results page: "Your answer" REMOVED.
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter        = $('runCounter');
const remainingCounter  = $('remainingCounter');

// Launcher
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');

// Quiz UI
const quiz          = $('quiz');
const questionText  = $('questionText');
const optionsForm   = $('optionsForm');
const submitBtn     = $('submitBtn');   // morphs from Submit ➜ Next
const nextBtn       = $('nextBtn');     // backup/alt button (hidden in CSS)
const feedback      = $('feedback');
const answerLine    = $('answerLine');
const rationale     = $('rationale');

// Titles
const pageTitleEl      = $('pageTitle');
const defaultTitleText = pageTitleEl?.textContent || document.title;
const defaultDocTitle  = document.title;

// Results
const summary       = $('summary');
const reviewEl      = $('review');
const reviewList    = $('reviewList');
const firstTryWrap  = $('firstTrySummary');
const firstTryPctEl = $('firstTryPct');
const firstTryCntEl = $('firstTryCount');
const firstTryTotEl = $('firstTryTotal');

// State
let state = null;
let currentInputsByLetter = {};
let pickedLength = 10;
let btnMode = 'submit';  // 'submit' | 'next'

// Allow "(Select all that apply)" with or without a period
const EXACT_SATA = /\(select all that apply\)?/i;

/* ---------- Module discovery ---------- */
async function discoverModules() {
  try {
    const res = await fetch(`/modules?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const mods = (data.modules || []).filter(Boolean);
    if (mods.length) {
      moduleSel.innerHTML = mods.map(m => `<option value="${m}">${m}</option>`).join('');
    }
  } catch {
    // Fallbacks if /modules isn't available
    fetch('/Module_1.json', { method: 'HEAD' })
      .then(r => { if (r.ok) moduleSel.add(new Option('Module_1', 'Module_1')); else return fetch('/Pharm_Quiz_HESI.json', { method: 'HEAD' }); })
      .then(r => { if (r && r.ok) moduleSel.add(new Option('Pharm_Quiz_HESI', 'Pharm_Quiz_HESI')); })
      .catch(() => {});
  }
}
discoverModules();

/* ---------- Length selection ---------- */
lengthBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-len]');
  if (!btn) return;
  [...lengthBtns.querySelectorAll('.seg-btn')].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pickedLength = btn.dataset.len === 'full' ? 'full' : parseInt(btn.dataset.len, 10);
});

/* ---------- Helpers ---------- */
function randomInt(max){
  if (max <= 0) return 0;
  if (crypto?.getRandomValues) { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % max; }
  return Math.floor(Math.random() * max);
}
function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) { const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function sampleQuestions(all, req){
  const a = all.slice();
  if (req === 'full' || req >= a.length) return shuffleInPlace(a);
  const k = Math.max(0, req|0);
  for (let i = 0; i < k; i++) { const j = i + randomInt(a.length - i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

/* ---------- Normalize banks ---------- */
function normalizeQuestions(raw){
  const items = Array.isArray(raw) ? raw : (raw.questions || raw.Questions || []);
  let idCounter = 1;
  return items.map((item) => {
    const q = {};
    q.id = item.id || `q${idCounter++}`;
    q.question = (item.question || item.stem || item.prompt || '').toString().trim();

    let options = item.options || item.choices || item.answers || item.Options || null;
    if (Array.isArray(options)) {
      // array ➜ letters
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const out = {};
      options.forEach((opt, i) => { out[letters[i]] = (opt ?? '').toString(); });
      q.options = out;
    } else if (options && typeof options === 'object') {
      // already keyed
      const out = {};
      for (const [k, v] of Object.entries(options)) {
        const L = (k || '').toString().trim().toUpperCase();
        if (/^[A-Z]$/.test(L)) out[L] = (v ?? '').toString();
      }
      q.options = out;
    } else {
      q.options = {};
    }

    const corr = item.correct ?? item.correctAnswer ?? item.correct_answers ?? item.correctAnswers
               ?? item.answer ?? item.Answer ?? item.Correct ?? item.correct_answer ?? item.correctAnswers;
    q.correctLetters = toLetterArray(corr, q.options);

    q.rationale = (item.rationale || item.explanation || item.reason || '').toString();
    q.type = item.type || (EXACT_SATA.test(q.question) ? 'multi_select' : 'single');

    // first correct ➜ mastered
    if (Array.isArray(item.firstTryCorrect))
      q.firstTryCorrect = !!item.firstTryCorrect[0];

    return q;
  }).filter(q => q.question && Object.keys(q.options).length);
}

function toLetterArray(val, optionsObj){
  if (!val) return [];
  const letters = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  if (Array.isArray(val)) {
    const out = [];
    for (const v of val) {
      if (typeof v === 'string' && letters.has(v.toUpperCase())) out.push(v.toUpperCase());
      else if (typeof v === 'number') { const L = indexToLetter(v|0); if (optionsObj[L]) out.push(L); }
      else if (typeof v === 'string') { const L = findLetterByText(v, optionsObj); if (L) out.push(L); }
    }
    return [...new Set(out)];
  }
  if (typeof val === 'string') {
    const s = val.toUpperCase(), found = s.match(/[A-Z]/g);
    if (found) return [...new Set(found)];
    const L = findLetterByText(val, optionsObj);
    return L ? [L] : [];
  }
  if (typeof val === 'number') { const L = indexToLetter(val|0); return optionsObj[L] ? [L] : []; }
  return [];
}
function indexToLetter(i){ return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i] || 'A'; }
function findLetterByText(text, optionsObj){
  const t = (text ?? '').toString().trim().replace(/\s+/g,' ').toLowerCase();
  if (!t) return null;
  for (const [L, v] of Object.entries(optionsObj)) {
    const s = (v ?? '').toString().trim().replace(/\s+/g,' ').toLowerCase();
    if (s && (s === t || s.includes(t) || t.includes(s))) return L;
  }
  return null;
}

/* ---------- Build state for a run ---------- */
function buildRunState(all, reqLength){
  const queue = sampleQuestions(all, reqLength);
  return {
    all,
    questions: queue.slice(),
    queue,
    totalRequested: queue.length,
    attempts: 0,
    masteredCount: 0,
    isFullRun: reqLength === 'full',
    review: []                    // ✅ initialize review to avoid errors on first submit
  };
}

/* ---------- Adaptive "wrong buffer" ---------- */
let wrongBuffer = [];
let wrongBufferSet = new Set();
let wrongSinceInjection = 0;
let reinjectThreshold = 1;

function initAdaptiveBufferForQuiz(){
  wrongBuffer = []; wrongBufferSet = new Set(); wrongSinceInjection = 0;
  const n = state.totalRequested || 0;
  const pct = state.isFullRun ? 0.05 : 0.15;            // 5% for full, 15% otherwise
  reinjectThreshold = Math.max(1, Math.ceil(n * pct));
}
function addToWrongBuffer(q){ if (!wrongBufferSet.has(q.id)) { wrongBuffer.push(q); wrongBufferSet.add(q.id); } }
function removeFromWrongBufferById(id){
  if (wrongBufferSet.has(id)) { wrongBuffer = wrongBuffer.filter(x => x.id !== id); wrongBufferSet.delete(id); }
}
function maybeInjectWrongBuffer(){
  if ((wrongSinceInjection >= reinjectThreshold && wrongBuffer.length) ||
      (state.queue.length === 0 && wrongBuffer.length)) {
    state.queue = wrongBuffer.splice(0).concat(state.queue);
    wrongBufferSet.clear();
    wrongSinceInjection = 0;
  }
}

/* ---------- One-button mode ---------- */
function setButtonMode(mode){
  btnMode = mode;
  if (mode === 'submit') {
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('success'); // blue (default)
    submitBtn.disabled = true;             // enabled once an option is chosen
  } else {
    submitBtn.textContent = 'Next';
    submitBtn.classList.add('success');    // green
    submitBtn.disabled = false;
  }
}

// Single handler for both actions
submitBtn.addEventListener('click', () => {
  if (btnMode === 'submit') handleSubmit();
  else if (btnMode === 'next') goNext();
});
nextBtn.addEventListener('click', goNext); // backup/alt button (hidden in CSS)

/* ---------- Start / Reset ---------- */
async function startQuiz(){
  launcher.classList.add('hidden');
  quiz.classList.remove('hidden');
  summary.classList.add('hidden');

  const mod = moduleSel?.value || 'Module_1';
  document.title = `${mod} — ${defaultDocTitle}`;
  if (pageTitleEl) pageTitleEl.textContent = `${mod} — ${defaultTitleText}`;

  const questions = await loadModule(mod);
  state = buildRunState(questions, pickedLength);
  initAdaptiveBufferForQuiz();

  loadNext();  // ✅ alias to goNext()
}
function resetQuiz(){
  document.title = defaultDocTitle;
  if (pageTitleEl) pageTitleEl.textContent = defaultTitleText;

  launcher.classList.remove('hidden');
  quiz.classList.add('hidden');
  summary.classList.add('hidden');
  state = null;
  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';
  rationale.textContent = '';
  rationale.classList.add('hidden');
  updateCounters();
}

/* ---------- Load module ---------- */
async function loadModule(name){
  // Serve "<name>.json" from the repo root via Flask whitelist
  const url = `/${encodeURIComponent(name)}.json?_=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Cannot load ${name}`);
  const data = await res.json();
  const questions = normalizeQuestions(data);
  // Shuffle options for each question
  questions.forEach(q => {
    const letters = Object.keys(q.options);
    const shuffled = shuffleInPlace(letters.slice());
    const out = {}; shuffled.forEach(L => out[L] = q.options[L]);
    q.options = out;
  });
  return questions;
}

/* ---------- Render question ---------- */
function updateCounters(){
  if (!state) { runCounter.textContent = 'Question: 0'; remainingCounter.textContent = 'Remaining to master: 0'; return; }
  const qIndex = (state.attempts || 0) + 1;  // attempts count includes retries
  runCounter.textContent = `Question: ${qIndex}`;
  const remain = Math.max(0, (state.questions || []).filter(q => !q.mastered).length);
  remainingCounter.textContent = `Remaining to master: ${remain}`;
}

function renderQuestion(q){
  const isMulti = q.type === 'multi_select' || EXACT_SATA.test(q.question);
  const type = isMulti ? 'checkbox' : 'radio';
  optionsForm.setAttribute('role', isMulti ? 'group' : 'radiogroup');

  questionText.textContent = q.question;
  optionsForm.innerHTML = '';
  currentInputsByLetter = {};

  for (const letter of Object.keys(q.options)) {
    const id = `opt-${letter}`;
    const label = document.createElement('label');
    label.className = 'opt';
    label.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = type; input.name = 'opt'; input.id = id; input.value = letter;

    const span = document.createElement('span');
    span.innerHTML = `<span class="letter">${letter}.</span> ${escapeHTML(q.options[letter])}`;

    currentInputsByLetter[letter] = input;
    label.append(input, span);
    optionsForm.appendChild(label);
  }

  // Avoid duplicate listeners between renders
  optionsForm.onchange = updateSubmitEnabled;

  feedback.textContent = '';
  feedback.className = 'feedback';
  answerLine.innerHTML = '';

  rationale.textContent = '';
  rationale.classList.add('hidden');

  setButtonMode('submit'); // reset for new question

  updateCounters();        // show attempts+1
  requestAnimationFrame(() => { quiz.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function updateSubmitEnabled(){
  if (btnMode === 'submit') submitBtn.disabled = !optionsForm.querySelector('input:checked');
}
function setsEqual(aSet, bSet){
  if (aSet.size !== bSet.size) return false;
  for (const v of aSet) if (!bSet.has(v)) return false;
  return true;
}
function formatCorrectAnswers(q){
  const letters = q.correctLetters || [];
  const parts = letters.map(L => `${L}. ${q.options[L] || ''}`);
  // Force line breaks for SATA-like answers
  return parts.join('<br>');
}

/* ---------- Submit / Next ---------- */
function handleSubmit(){
  const q = state?.current;
  if (!q) return;

  const picked = [...optionsForm.querySelectorAll('input:checked')].map(i => i.value);
  if (!picked.length) return;

  const correctSet = new Set(q.correctLetters || []);
  const pickedSet  = new Set(picked.map(x => x.toUpperCase()));

  const isCorrect = setsEqual(correctSet, pickedSet);

  // track correctness internally
  const correctLettersCopy = [...correctSet];
  const pickedLettersCopy  = [...pickedSet];
  const existing = state.review.find(r => r.qid === q.id);
  if (existing) {
    existing.ok = isCorrect;
    existing.picked = pickedLettersCopy;
  } else {
    state.review.push({ qid: q.id, q: q.question, ok: isCorrect, picked: pickedLettersCopy, correct: correctLettersCopy, rationale: q.rationale, options: q.options });
  }

  state.attempts += 1;

  const fullCorrectText = formatCorrectAnswers(q);

  // Record first-try outcome exactly once
  if (state.current && state.current.firstTryCorrect === undefined) {
    state.current.firstTryCorrect = !!isCorrect;
  }

  if (isCorrect) {
    if (!q.mastered) {
      q.mastered = true;
      state.masteredCount += 1;     // Remaining only drops here
      removeFromWrongBufferById(q.id);
    }
    feedback.textContent = 'Correct!';
    feedback.className = 'feedback ok';
    answerLine.innerHTML = `<div class="answerText">${fullCorrectText}</div>`;
  } else {
    feedback.textContent = 'Incorrect.';
    feedback.className = 'feedback bad';
    answerLine.innerHTML = `
      <div class="answerLabel">Correct Answer:</div>
      <div class="answerText">${fullCorrectText}</div>
    `;
    addToWrongBuffer(q);
    wrongSinceInjection += 1;
  }

  // Rationale only after submit
  if (q.rationale && q.rationale.trim()) {
    rationale.textContent = q.rationale;
    rationale.classList.remove('hidden');
  }

  setButtonMode('next');
  scrollToBottomSmooth();
}
function goNext(){
  if (!state) return;

  maybeInjectWrongBuffer();

  if (state.queue.length === 0) {
    // End of run
    quiz.classList.add('hidden');
    summary.classList.remove('hidden');

    const total = state.totalRequested || 0;
    const first = state.questions.filter(q => q.firstTryCorrect === true).length;
    const pct = total ? Math.round((first / total) * 100) : 0;

    if (firstTryPctEl) firstTryPctEl.textContent = `${pct}%`;
    if (firstTryCntEl) firstTryCntEl.textContent = String(first);
    if (firstTryTotEl) firstTryTotEl.textContent = String(total);
    if (firstTryWrap) firstTryWrap.classList.remove('hidden');

    reviewEl.open = false;
    reviewList.innerHTML = state.review.map(buildReviewItemHTML).join('');

    runCounter.textContent = `Run complete — ${total} questions`;
    remainingCounter.textContent = '';
    return;
  }

  const q = state.queue.shift();
  state.current = q;
  renderQuestion(q);
}

// ✅ Alias used by startQuiz (fixes "loadNext is not defined")
function loadNext(){ goNext(); }

/* ---------- Review rendering ---------- */
function buildReviewItemHTML(r){
  const statusClass = r.ok ? 'ok' : 'bad';
  const picked = (r.picked || []).sort().join(', ') || '—';
  const correct = (r.correct || []).sort().join(', ');
  const ansLines = (r.correct || []).map(L => `<div>${L}. ${escapeHTML(r.options[L] || '')}</div>`).join('');
  const rat = r.rationale ? `<div class="rev-rationale"><strong>Rationale:</strong> ${escapeHTML(r.rationale)}</div>` : '';
  return `
    <div class="rev-item ${statusClass}">
      <div class="rev-q">${escapeHTML(r.q)}</div>
      <div class="rev-ans"><strong>Correct:</strong><br>${ansLines}</div>
      ${rat}
    </div>
  `;
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (btnMode === 'submit') handleSubmit();
    else if (btnMode === 'next') goNext();
    return;
  }
  const code = e.code || '';
  const m = code.match(/^Key([A-Z])$/);
  if (m) {
    const L = m[1];
    const input = currentInputsByLetter[L];
    if (!input) return;
    e.preventDefault();
    if (input.type === 'checkbox') input.checked = !input.checked;
    else if (input.type === 'radio') {
      input.checked = !input.checked ? true : false;
      if (input.checked) [...optionsForm.querySelectorAll('input[type="radio"]')].forEach(r => { if (r !== input) r.checked = false; });
    }
    updateSubmitEnabled();
  }
});

/* ---------- Events ---------- */
startBtn.addEventListener('click', startQuiz);

// Reset (quiz + results)
[
  document.getElementById('restartBtn'),
  document.getElementById('restartBtnSummary'),
  document.getElementById('resetBtn'),
  document.querySelector('[data-reset]'),
  document.querySelector('.reset-quiz')
].filter(Boolean).forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); resetQuiz(); }));

document.addEventListener('click', (e) => {
  const t = e.target.closest('#restartBtn, #restartBtnSummary, #resetBtn, [data-reset], .reset-quiz');
  if (!t) return; e.preventDefault(); resetQuiz();
});

/* ---------- Utils ---------- */
function escapeHTML(s=''){
  return (s ?? '')
    .toString()
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* Smoothly scroll the entire page to the very bottom AFTER rationale paints */
function scrollToBottomSmooth() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  });
}
