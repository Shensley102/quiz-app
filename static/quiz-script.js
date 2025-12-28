/* -----------------------------------------------------------
   Nurse Success Study Hub - Quiz Application
   - Complete quiz functionality with module selection
   - Category-specific module filtering
   - Keyboard shortcuts support
   - Progress tracking and mastery system
   - Detailed performance review
   - LocalStorage persistence for resuming quizzes
   - Resume only works with Full Module Question Bank
   - Shows remaining questions count on resume button
   - Subcategory filtering for category pages
   ----------------------------------------------------------- */

/* ---------- Utilities ---------- */
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function isTextEditingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function scrollToBottomSmooth() {
  // Keep it simple; avoid "jump" on mobile
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/* ---------- Global State ---------- */
const STORAGE_KEY = 'nurseSuccessStudyHub.quizState.v2';

const run = {
  category: '',
  module: '',
  moduleLabel: '',
  lengthMode: '10',
  pool: [],
  masterPool: [],
  current: null,
  idx: 0,
  correct: 0,
  answered: new Map(), // qid -> { userLetters, correctRememberedBool }
  missed: [],
  history: [],
  startedAt: null,
};

let allContent = [];
let categoryModules = [];
let lastQuizMissedQuestions = [];

/* ---------- DOM ---------- */
// Controls
const categorySel = $('categorySel');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');
const resumeBtn  = $('resumeBtn');

// Quiz UI
const quiz         = $('quiz');
const qText        = $('questionText');
const form         = $('optionsForm');
const submitBtn    = $('submitBtn');
const feedback     = $('feedback');
const answerLine   = $('answerLine');
const rationaleBox = $('rationale');

// Summary
const summary     = $('summary');
const summaryBody = $('summaryBody');
const restartBtn  = $('restartBtn');
const retryMissedBtn = $('retryMissedBtn');

// Progress UI
const progressBar  = $('progressBar');
const progressFill = $('progressFill');
const progressLabel = $('progressLabel');

const masteryLabel = $('masteryLabel');
const counterLabel = $('counterLabel');

/* ---------- Data Loading ---------- */
async function loadQuizContent(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  const data = await res.json();
  return data;
}

async function loadAllContent() {
  // This app uses fixtures listed in quiz-content.fixtures.json
  const fixturesRes = await fetch('/static/js/quiz-content.fixtures.json');
  if (!fixturesRes.ok) throw new Error('Failed to load quiz-content.fixtures.json');
  const fixtures = await fixturesRes.json();

  const items = [];
  for (const file of fixtures.files || []) {
    const data = await loadQuizContent(file.path);
    // Each file is usually an array
    if (Array.isArray(data)) {
      data.forEach((q) => items.push({ ...q, __source: file.path }));
    } else if (data && Array.isArray(data.questions)) {
      data.questions.forEach((q) => items.push({ ...q, __source: file.path }));
    }
  }
  return items;
}

/* ---------- Category & Module Setup ---------- */
function unique(arr) {
  return Array.from(new Set(arr));
}

function normalizeCategory(q) {
  return (q.category || q.Category || q.CATEGORY || '').trim();
}

function normalizeModule(q) {
  return (q.module || q.Module || q.MODULE || '').trim();
}

function setupCategoryDisplay() {
  // Populate categories from content once loaded
  // (called after content load)
}

function initModules() {
  // Populate module dropdown based on category
  // (called after content load)
}

function setModulesForCategory(category) {
  categoryModules = unique(
    allContent
      .filter(q => normalizeCategory(q) === category)
      .map(q => normalizeModule(q))
      .filter(Boolean)
  ).sort();

  // Update module select
  if (moduleSel) {
    moduleSel.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Select module';
    moduleSel.appendChild(defaultOpt);

    categoryModules.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      moduleSel.appendChild(opt);
    });
  }
}

function populateCategories() {
  const categories = unique(allContent.map(q => normalizeCategory(q)).filter(Boolean)).sort();
  if (!categorySel) return;
  categorySel.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select category';
  categorySel.appendChild(defaultOpt);

  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySel.appendChild(opt);
  });
}

/* ---------- Question Normalization ---------- */
function getQuestionContent(q) {
  // Attempt to find a question stem prompt across varying schemas
  return (
    q.question ||
    q.text ||
    q.stem ||
    q.prompt ||
    q.Question ||
    q.Text ||
    q.Stem ||
    q.Prompt ||
    ''
  );
}

function normalizeOptions(q) {
  // Supports multiple option schemas:
  // - q.options: { A: "...", B: "...", ... }
  // - q.choices: { A: "...", ... }
  // - q.answers: array of strings => will map to A,B,C...
  const opts = q.options || q.choices || q.answers || q.Answers || q.OPTIONS || null;

  if (!opts) return {};

  if (Array.isArray(opts)) {
    const out = {};
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    opts.forEach((t, i) => {
      out[letters[i]] = t;
    });
    return out;
  }

  // object map
  const out = {};
  Object.keys(opts).forEach((k) => {
    out[String(k).toUpperCase().trim()] = opts[k];
  });
  return out;
}

function normalizeAnswer(q) {
  // Supports:
  // - q.correct: "A" or ["A","B"]
  // - q.answer
  // - q.correct_answer
  // - q.correctAnswers
  // - q.correct_answers
  const ans =
    q.correct ||
    q.answer ||
    q.correct_answer ||
    q.correctAnswer ||
    q.correctAnswers ||
    q.correct_answers ||
    q.correctAnswersText ||
    q.correctAnswerText ||
    '';

  if (Array.isArray(ans)) {
    return ans.map(a => String(a).toUpperCase().trim());
  }

  // sometimes comma-separated
  const s = String(ans).trim();
  if (s.includes(',')) {
    return s.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
  }

  return [s.toUpperCase().trim()];
}

function getSelectedAnswers() {
  if (!form) return [];
  const inputs = Array.from(form.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
  return inputs.filter(i => i.checked).map(i => i.value.toUpperCase());
}

/* ---------- Quiz State Persistence ---------- */
function serializeRunState() {
  const answeredObj = {};
  for (const [qid, v] of run.answered.entries()) {
    answeredObj[qid] = v;
  }
  return {
    category: run.category,
    module: run.module,
    moduleLabel: run.moduleLabel,
    lengthMode: run.lengthMode,
    pool: run.pool,
    masterPool: run.masterPool,
    idx: run.idx,
    correct: run.correct,
    answered: answeredObj,
    missed: run.missed,
    history: run.history,
    startedAt: run.startedAt,
  };
}

function saveState() {
  try {
    const data = serializeRunState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // ignore
  }
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function showResumeIfAny() {
  const state = loadState();
  if (!resumeBtn) return;

  if (!state || !state.pool || !Array.isArray(state.pool) || state.pool.length === 0) {
    resumeBtn.classList.add('hidden');
    return;
  }

  // Only allow resume for Full Module Question Bank
  // (in this app, that's lengthMode === 'all' or 'full' etc)
  const lengthMode = state.lengthMode || '';
  const isFull = String(lengthMode).toLowerCase().includes('all') || String(lengthMode).toLowerCase().includes('full');

  if (!isFull) {
    resumeBtn.classList.add('hidden');
    return;
  }

  const remaining = Math.max(0, (state.pool.length || 0) - (state.idx || 0));
  resumeBtn.textContent = `Resume (${remaining} remaining)`;
  resumeBtn.classList.remove('hidden');
}

/* ---------- Quiz Start / Resume ---------- */
function buildPool(category, moduleName) {
  // Get all questions for category/module
  const pool = allContent.filter(q =>
    normalizeCategory(q) === category &&
    normalizeModule(q) === moduleName
  );

  // Ensure each question has a stable id
  pool.forEach((q, idx) => {
    if (!q.id) q.id = `${category}|${moduleName}|${q.__source || 'src'}|${idx}`;
  });

  return pool;
}

function setActionState(mode) {
  if (!submitBtn) return;

  if (mode === 'submit') {
    submitBtn.textContent = 'Submit';
    submitBtn.dataset.mode = 'submit';
    submitBtn.disabled = true;
  } else {
    submitBtn.textContent = 'Next →';
    submitBtn.dataset.mode = 'next';
    submitBtn.disabled = false;
  }
}

function resetRun() {
  run.pool = [];
  run.masterPool = [];
  run.current = null;
  run.idx = 0;
  run.correct = 0;
  run.answered = new Map();
  run.missed = [];
  run.history = [];
  run.startedAt = Date.now();
}

function startQuiz(category, moduleName, lengthMode) {
  resetRun();

  run.category = category;
  run.module = moduleName;
  run.moduleLabel = moduleName;
  run.lengthMode = lengthMode;

  const pool = buildPool(category, moduleName);
  run.masterPool = pool.slice();

  let usePool = pool.slice();

  // Length mode can be "10", "20", "50", "all" etc
  if (String(lengthMode).toLowerCase() !== 'all' && String(lengthMode).toLowerCase() !== 'full') {
    const n = parseInt(lengthMode, 10);
    if (!Number.isNaN(n) && n > 0) {
      usePool = shuffle(usePool).slice(0, n);
    }
  }

  run.pool = usePool;

  // Show quiz
  if (quiz) quiz.classList.remove('hidden');
  if (summary) summary.classList.add('hidden');

  // Render first
  run.idx = 0;
  showQuestionAt(run.idx);

  saveState();
}

function resumeQuizFromState(state) {
  resetRun();

  run.category = state.category || '';
  run.module = state.module || '';
  run.moduleLabel = state.moduleLabel || run.module;
  run.lengthMode = state.lengthMode || 'all';
  run.pool = state.pool || [];
  run.masterPool = state.masterPool || run.pool;

  run.idx = state.idx || 0;
  run.correct = state.correct || 0;
  run.missed = state.missed || [];
  run.history = state.history || [];
  run.startedAt = state.startedAt || Date.now();

  run.answered = new Map();
  const answered = state.answered || {};
  Object.keys(answered).forEach((qid) => run.answered.set(qid, answered[qid]));

  // Show quiz
  if (quiz) quiz.classList.remove('hidden');
  if (summary) summary.classList.add('hidden');

  showQuestionAt(run.idx);
}

function getNotMastered() {
  // For progress bar, use remaining questions in masterPool not yet answered correctly
  const notMastered = run.masterPool.filter((q) => {
    const rec = run.answered.get(q.id);
    return !(rec && rec.correctRememberedBool);
  });
  return notMastered;
}

function updateCounters() {
  if (counterLabel) {
    const total = run.pool.length;
    const current = clamp(run.idx + 1, 1, Math.max(1, total));
    counterLabel.textContent = `${current} / ${total}`;
  }

  if (masteryLabel) {
    const remaining = getNotMastered().length;
    masteryLabel.textContent = `${remaining} not mastered`;
  }
}

/* ---------- Rendering ---------- */
function renderQuestion(q) {
  if (!q) return;

  run.current = q;

  // Update question text. Use getQuestionContent() to support NCLEX
  // questions which may define their prompt under keys such as `stem` or
  // `prompt` instead of the `question`/`text` fields.
  if (qText) {
    const content = getQuestionContent(q);
    qText.innerHTML = content || '';
  }

  // Build options
  const opts = normalizeOptions(q);
  const correctAnswers = normalizeAnswer(q);
  const isMultiSelect = correctAnswers.length > 1;

  // Track single vs multi-select for CSS hover behavior
  if (form) {
    form.classList.toggle('is-multi-select', isMultiSelect);
    form.classList.toggle('is-single-select', !isMultiSelect);

    // Reset hover-disable state every new question
    form.classList.remove('has-selection');
  }

  if (form) {
    form.innerHTML = '';

    Object.entries(opts).forEach(([letter, text]) => {
      const div = document.createElement('div');
      div.className = 'option';

      const input = document.createElement('input');
      input.type = isMultiSelect ? 'checkbox' : 'radio';
      input.name = 'answer';
      input.id = `opt-${letter}`;
      input.value = letter;

      const label = document.createElement('label');
      label.htmlFor = `opt-${letter}`;
      label.innerHTML = `<strong>${letter}.</strong> ${text}`;

      div.appendChild(input);
      div.appendChild(label);
      form.appendChild(div);

      // Click handler:
      // - Supports select + de-select (including radios)
      // - Prevents label default toggle from causing double-toggles
      div.addEventListener('click', (e) => {
        // Don't allow changing answers after submission (Next mode)
        if (submitBtn && submitBtn.dataset.mode !== 'submit') return;
        if (input.disabled) return;

        e.preventDefault();

        // Toggle selection
        input.checked = !input.checked;

        onSelectionChanged();

        // Remember last choice for accessibility/UX
        try {
          input.focus({ preventScroll: true });
        } catch {
          input.focus();
        }
      });

      input.addEventListener('change', onSelectionChanged);
    });
  }

  // Reset UI
  if (feedback) {
    feedback.textContent = '';
    feedback.classList.add('hidden');
    feedback.classList.remove('ok', 'bad');
  }

  if (answerLine) {
    answerLine.innerHTML = '';
    answerLine.classList.add('hidden');
  }

  if (rationaleBox) {
    rationaleBox.textContent = '';
    rationaleBox.classList.add('hidden');
  }

  setActionState('submit');
  updateCounters();
  updateProgressBar();
}

function onSelectionChanged() {
  if (!submitBtn) return;

  const selected = getSelectedAnswers();
  submitBtn.disabled = selected.length === 0;

  // Single-select: once ANY option is selected, disable hover highlight.
  // Multi-select: keep hover highlight active even after selections.
  if (form) {
    const isSingle = form.classList.contains('is-single-select');
    if (isSingle) {
      form.classList.toggle('has-selection', selected.length > 0);
    } else {
      form.classList.remove('has-selection');
    }
  }
}

function highlightAnswers(q, userLetters, isCorrect) {
  if (!form) return;

  const correctLetters = normalizeAnswer(q);

  form.querySelectorAll('.option').forEach(div => {
    const input = div.querySelector('input');
    if (!input) return;

    const letter = input.value.toUpperCase();
    const isUserSelected = userLetters.includes(letter);
    const isCorrectAnswer = correctLetters.includes(letter);

    div.classList.remove('correct', 'incorrect', 'missed');

    if (isCorrectAnswer && isUserSelected) {
      div.classList.add('correct');
    } else if (isCorrectAnswer && !isUserSelected) {
      div.classList.add('missed');
    } else if (!isCorrectAnswer && isUserSelected) {
      div.classList.add('incorrect');
    }
  });
}

function showAnswerLine(q) {
  if (!answerLine) return;

  const correctLetters = normalizeAnswer(q);
  answerLine.innerHTML = `<strong>Correct Answer:</strong> ${correctLetters.join(', ')}`;
  answerLine.classList.remove('hidden');
}

function showQuestionAt(idx) {
  const q = run.pool[idx];
  if (!q) {
    endQuiz();
    return;
  }
  renderQuestion(q);
}

function endQuiz() {
  if (quiz) quiz.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');

  // Build summary body
  if (summaryBody) {
    const total = run.pool.length;
    const score = total ? Math.round((run.correct / total) * 100) : 0;

    summaryBody.innerHTML = `
      <p><strong>Category:</strong> ${run.category}</p>
      <p><strong>Module:</strong> ${run.moduleLabel}</p>
      <p><strong>Score:</strong> ${run.correct} / ${total} (${score}%)</p>
    `;
  }

  // Store missed for retry
  lastQuizMissedQuestions = run.missed.slice();

  // Save state cleared
  clearState();
  showResumeIfAny();
}

/* ---------- Submit / Next ---------- */
function handleSubmit() {
  const q = run.current;
  if (!q) return;

  const userLetters = getSelectedAnswers();
  if (userLetters.length === 0) return;

  const correctLetters = normalizeAnswer(q);

  // Check if correct
  const isCorrect =
    userLetters.length === correctLetters.length &&
    userLetters.every(l => correctLetters.includes(l));

  // Record answer
  const existing = run.answered.get(q.id);
  const correctRememberedBool = !!isCorrect;

  run.answered.set(q.id, {
    userLetters,
    correctRememberedBool,
    ts: Date.now(),
  });

  if (isCorrect) run.correct += 1;
  else run.missed.push(q);

  run.history.push({
    id: q.id,
    userLetters,
    correctLetters,
    isCorrect,
    category: run.category,
    module: run.module,
  });

  // Save state
  saveState();

  // Update UI
  if (feedback) {
    feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    feedback.classList.remove('ok', 'bad', 'hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  // Mark that selection has been made (for single-select hover disabling)
  if (form && form.classList.contains('is-single-select')) {
    form.classList.add('has-selection');
  }

  // Highlight correct and wrong answers in the options
  highlightAnswers(q, userLetters, isCorrect);

  // Show correct answer line + rationale
  showAnswerLine(q);

  if (rationaleBox) {
    rationaleBox.textContent = q.rationale || '';
    rationaleBox.classList.remove('hidden');
  }

  // Lock inputs
  if (form) {
    form.querySelectorAll('input').forEach(i => i.disabled = true);
  }

  setActionState('next');

  scrollToBottomSmooth();
  updateCounters();
}

function handleNext() {
  // advance
  run.idx += 1;

  if (run.idx >= run.pool.length) {
    endQuiz();
    return;
  }

  showQuestionAt(run.idx);
  saveState();
}

/* ---------- Retry Missed ---------- */
function startRetryQuiz(missedQuestions) {
  resetRun();

  // Keep same category/module label but use missed list
  run.category = (missedQuestions[0] && normalizeCategory(missedQuestions[0])) || run.category;
  run.module = (missedQuestions[0] && normalizeModule(missedQuestions[0])) || run.module;
  run.moduleLabel = run.module;

  // Ensure ids exist
  missedQuestions.forEach((q, idx) => {
    if (!q.id) q.id = `retry|${run.category}|${run.module}|${q.__source || 'src'}|${idx}`;
  });

  run.pool = shuffle(missedQuestions.slice());
  run.masterPool = run.pool.slice();
  run.lengthMode = 'retry';
  run.idx = 0;

  if (quiz) quiz.classList.remove('hidden');
  if (summary) summary.classList.add('hidden');

  showQuestionAt(run.idx);
  saveState();
}

/* ---------- Event Wiring ---------- */
if (categorySel) {
  categorySel.addEventListener('change', () => {
    const cat = categorySel.value || '';
    setModulesForCategory(cat);
  });
}

if (moduleSel) {
  moduleSel.addEventListener('change', () => {
    // no-op; start button handles
  });
}

if (lengthBtns) {
  lengthBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-length]');
    if (!btn) return;
    const len = btn.dataset.length || '10';
    run.lengthMode = len;

    // toggle active class
    Array.from(lengthBtns.querySelectorAll('button[data-length]')).forEach(b => {
      b.classList.toggle('active', b === btn);
    });
  });
}

if (startBtn) {
  startBtn.addEventListener('click', () => {
    const cat = categorySel ? categorySel.value : '';
    const mod = moduleSel ? moduleSel.value : '';
    if (!cat || !mod) return;

    const len = run.lengthMode || '10';
    startQuiz(cat, mod, len);
  });
}

if (resumeBtn) {
  resumeBtn.addEventListener('click', () => {
    const state = loadState();
    if (!state) return;
    resumeQuizFromState(state);
  });
}

if (submitBtn) {
  submitBtn.addEventListener('click', () => {
    const mode = submitBtn.dataset.mode || 'submit';
    if (mode === 'submit') handleSubmit();
    else handleNext();
  });
}

if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    clearState();
    location.reload();
  });
}

if (retryMissedBtn) {
  retryMissedBtn.addEventListener('click', () => {
    startRetryQuiz(lastQuizMissedQuestions);
  });
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if (!quiz || quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  const key = e.key || '';
  const upper = key.toUpperCase();

  if (key === 'Enter') {
    e.preventDefault();
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.click();
    }
    return;
  }

  if (/^[A-Z]$/.test(upper) && submitBtn && submitBtn.dataset.mode === 'submit') {
    const input = document.getElementById(`opt-${upper}`);
    if (!input || input.disabled) return;
    e.preventDefault();
    input.checked = !input.checked;
    onSelectionChanged();
  }
});

/* ---------- Progress bar update ---------- */
function updateProgressBar() {
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;
  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
    // Transition from blue (#2f61f3) to green (#4caf50) based on percentage
    const r = Math.round(47 + (76 - 47) * (percentage / 100));
    const g = Math.round(97 + (175 - 97) * (percentage / 100));
    const b = Math.round(243 + (80 - 243) * (percentage / 100));
    progressFill.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
  if (progressLabel) progressLabel.textContent = `${percentage}% mastered`;
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);
}

/* ---------- Init ---------- */
(async function init() {
  try {
    allContent = await loadAllContent();
    populateCategories();
    showResumeIfAny();
  } catch (e) {
    console.error(e);
  }
})();
