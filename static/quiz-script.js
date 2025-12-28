/* -----------------------------------------------------------
   Nurse Success Study Hub - Quiz Application
   (UPDATED: auto-start when preloaded data is present +
    selection UX + hover + keyboard behavior)
   ----------------------------------------------------------- */

/* ---------- Utilities ---------- */
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function isTextEditingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

function scrollToBottomSmooth() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/* ---------- Global State ---------- */
const run = {
  pool: [],
  current: null,
  idx: 0,
  correct: 0,
  answered: new Map(),
  missed: [],
  history: [],
  startedAt: null,
};

let allContent = []; // may not be used if preloaded
let categoryModules = [];

/* ---------- DOM ---------- */
const launcher   = $('launcher');
const moduleSel  = $('moduleSel');
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');
const resumeBtn  = $('resumeBtn');

const quiz        = $('quiz');
const qText       = $('questionText');
const form        = $('optionsForm');
const submitBtn   = $('submitBtn');
const feedback    = $('feedback');
const answerLine  = $('answerLine');
const rationale   = $('rationale');

const summary     = $('summary');
const restartBtn  = $('restartBtn');
const retryMissed = $('retryMissedBtn');

const counterLabel = $('counterLabel');

/* ---------- Helpers ---------- */
function getQuestionContent(q) {
  return q.question || q.text || q.stem || q.prompt || '';
}

function normalizeOptions(q) {
  const opts = q.options || q.choices || q.answers || {};
  if (Array.isArray(opts)) {
    const out = {};
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    opts.forEach((t, i) => out[letters[i]] = t);
    return out;
  }
  return Object.keys(opts).reduce((acc, k) => {
    acc[k.toUpperCase()] = opts[k];
    return acc;
  }, {});
}

function normalizeAnswer(q) {
  const ans = q.correct || q.answer || q.correct_answer || q.correctAnswers || q.correct_answers || '';
  if (Array.isArray(ans)) return ans.map(x => x.toUpperCase());
  return [String(ans).toUpperCase().trim()];
}

function getSelectedAnswers() {
  if (!form) return [];
  return Array.from(form.querySelectorAll('input:checked')).map(i => i.value.toUpperCase());
}

function updateCounters() {
  if (counterLabel) {
    const total = run.pool.length;
    const current = clamp(run.idx + 1, 1, total);
    counterLabel.textContent = `${current} / ${total}`;
  }
}

/* ---------- AUTO-START / LAUNCHER ---------- */
async function initModules() {
  // Check for preloaded quiz data (injected by template)
  const raw = window.preloadedQuizData;
  const preloadedQuestions = Array.isArray(raw)
    ? raw
    : (raw && Array.isArray(raw.questions) ? raw.questions : null);

  const params = new URLSearchParams(window.location.search);
  const urlQuizLength = params.get('quiz_length');
  const autoStartFlag = params.get('autostart') === 'true';

  if (preloadedQuestions && preloadedQuestions.length) {
    // Preloaded scenario
    const moduleName =
      window.preloadedModuleName ||
      (raw && raw.moduleName) ||
      '';
    const quizLength =
      window.quizLength ||
      urlQuizLength ||
      (raw && raw.quizLength) ||
      'full';

    const shouldAutoStart = autoStartFlag || !!urlQuizLength;

    // If auto-start (quiz_length in URL or autostart flag)
    if (shouldAutoStart) {
      startQuiz(moduleName, preloadedQuestions, quizLength);
      return;
    }

    // Otherwise leave launcher visible and populate only this single module option
    if (moduleSel) {
      moduleSel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = moduleName;
      opt.textContent = moduleName;
      moduleSel.appendChild(opt);
      moduleSel.value = moduleName;
    }

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.addEventListener('click', () => {
        startQuiz(moduleName, preloadedQuestions, quizLength);
      }, { once: true });
    }
    return;
  }

  // No preloaded → show regular launcher
  if (moduleSel) {
    moduleSel.disabled = false;
  }
  if (startBtn) startBtn.disabled = false;
}

/* ---------- START QUIZ ---------- */
function startQuiz(moduleName, questions, quizLength) {
  run.pool = Array.isArray(questions) ? questions.slice() : [];
  run.idx = 0;
  if (launcher) launcher.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  showQuestionAt(run.idx);
}

/* ---------- RENDER QUESTION ---------- */
function renderQuestion(q) {
  if (!q || !form) return;

  run.current = q;
  qText.innerHTML = getQuestionContent(q);

  const opts = normalizeOptions(q);
  const correctAnswers = normalizeAnswer(q);
  const isMultiSelect = correctAnswers.length > 1;

  form.classList.toggle('is-multi-select', isMultiSelect);
  form.classList.toggle('is-single-select', !isMultiSelect);
  form.classList.remove('has-selection');

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
    label.htmlFor = input.id;
    label.innerHTML = `<strong>${letter}.</strong> ${text}`;

    const toggleSelection = (e) => {
      if (submitBtn && submitBtn.dataset.mode !== 'submit') return;
      if (input.disabled) return;
      e.preventDefault();
      input.checked = !input.checked;
      onSelectionChanged();
      try { input.focus({ preventScroll: true }); }
      catch { input.focus(); }
    };

    div.addEventListener('click', toggleSelection);
    label.addEventListener('click', toggleSelection);
    input.addEventListener('change', onSelectionChanged);

    div.appendChild(input);
    div.appendChild(label);
    form.appendChild(div);
  });

  feedback.classList.add('hidden');
  answerLine.classList.add('hidden');
  rationale.classList.add('hidden');

  onSelectionChanged();
  setActionState('submit');
  updateCounters();
}

/* ---------- SELECTION HANDLING ---------- */
function onSelectionChanged() {
  if (!submitBtn) return;
  const selected = getSelectedAnswers();
  submitBtn.disabled = selected.length === 0;

  if (form.classList.contains('is-single-select')) {
    form.classList.toggle('has-selection', selected.length > 0);
  } else {
    form.classList.remove('has-selection');
  }
}

/* ---------- SUBMIT / NEXT HANDLING ---------- */
function handleSubmit() {
  const q = run.current;
  if (!q) return;

  const userLetters = getSelectedAnswers();
  const correctLetters = normalizeAnswer(q);

  const isCorrect =
    userLetters.length === correctLetters.length &&
    userLetters.every(l => correctLetters.includes(l));

  feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
  feedback.classList.remove('hidden');
  feedback.classList.toggle('ok', isCorrect);
  feedback.classList.toggle('bad', !isCorrect);

  highlightAnswers(q, userLetters);

  answerLine.innerHTML = `<strong>Correct Answer:</strong> ${correctLetters.join(', ')}`;
  answerLine.classList.remove('hidden');

  if (rationale) {
    rationale.textContent = q.rationale || '';
    rationale.classList.remove('hidden');
  }

  form.querySelectorAll('input').forEach(i => i.disabled = true);

  setActionState('next');

  run.history.push({ q, userLetters, correctLetters, isCorrect });

  scrollToBottomSmooth();
}

function handleNext() {
  run.idx++;
  if (run.idx >= run.pool.length) {
    endQuiz();
  } else {
    showQuestionAt(run.idx);
  }
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
}

/* ---------- ANSWER HIGHLIGHTING ---------- */
function highlightAnswers(q, userLetters) {
  form.querySelectorAll('.option').forEach(div => {
    const input = div.querySelector('input');
    const letter = input.value.toUpperCase();
    div.classList.remove('correct','incorrect','missed');

    const correctLetters = normalizeAnswer(q);

    if (correctLetters.includes(letter) && userLetters.includes(letter)) {
      div.classList.add('correct');
    } else if (!correctLetters.includes(letter) && userLetters.includes(letter)) {
      div.classList.add('incorrect');
    } else if (correctLetters.includes(letter) && !userLetters.includes(letter)) {
      div.classList.add('missed');
    }
  });
}

/* ---------- BUTTON STATE ---------- */
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

/* ---------- KEYBOARD SUPPORT ---------- */
document.addEventListener('keydown', (e) => {
  if (!quiz || quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    if (submitBtn && !submitBtn.disabled) submitBtn.click();
    return;
  }

  const char = /^[A-Z]$/i.test(e.key) && e.key.toUpperCase();
  if (char && submitBtn && submitBtn.dataset.mode === 'submit') {
    const input = document.getElementById(`opt-${char}`);
    if (input && !input.disabled) {
      input.checked = !input.checked;
      onSelectionChanged();
    }
  }
});

/* ---------- STARTUP ---------- */
window.addEventListener('load', () => initModules());
