/* -----------------------------------------------------------
   Nurse Success Study Hub - Quiz Application
   (UPDATED: auto-start when preloaded data is present + selection UX fixes)
   ----------------------------------------------------------- */

/* ---------- Utilities ---------- */
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function isTextEditingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

/* ---------- Global State ---------- */
const run = { pool: [], current: null, idx: 0, correct: 0, answered: new Map(), missed: [], history: [] };

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
  const total = run.pool.length;
  const current = run.idx + 1;
  $('counterLabel')?.textContent = `${current} / ${total}`;
}

/* ---------- QUIZ INIT + AUTO-START ---------- */
async function initModules() {
  const raw = window.preloadedQuizData;
  const preloaded = Array.isArray(raw) ? raw : (raw?.questions || null);
  const params = new URLSearchParams(window.location.search);
  const urlLength = params.get('quiz_length');
  const autostart  = params.get('autostart') === 'true';

  if (preloaded && preloaded.length) {
    const moduleName = window.preloadedModuleName || raw.moduleName || 'Quiz';
    const quizLen = window.quizLength || urlLength || 'full';

    if (autostart || urlLength) {
      startQuiz(moduleName, preloaded, quizLen);
      return;
    }

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
        startQuiz(moduleName, preloaded, quizLen);
      }, { once: true });
    }
    return;
  }

  // otherwise show module selector
  if (moduleSel) {
    moduleSel.disabled = false;
  }
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
  qText.textContent = getQuestionContent(q);

  const opts = normalizeOptions(q);
  const correct = normalizeAnswer(q);
  const isMulti = correct.length > 1;

  form.classList.toggle('is-multi-select', isMulti);
  form.classList.toggle('is-single-select', !isMulti);
  form.classList.remove('has-selection');
  form.innerHTML = '';

  Object.entries(opts).forEach(([letter, text]) => {
    const div = document.createElement('div');
    div.className = 'option';

    const input = document.createElement('input');
    input.type = isMulti ? 'checkbox' : 'radio';
    input.name = 'answer';
    input.id = `opt-${letter}`;
    input.value = letter;

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.innerHTML = `<strong>${letter}.</strong> ${text}`;

    const toggle = (e) => {
      if (submitBtn.dataset.mode !== 'submit') return;
      if (input.disabled) return;
      e.preventDefault();
      input.checked = !input.checked;
      onSelectionChanged();
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    };

    label.addEventListener('click', toggle);
    div.addEventListener('click', toggle);
    input.addEventListener('change', onSelectionChanged);

    div.appendChild(input);
    div.appendChild(label);
    form.appendChild(div);
  });

  feedback.classList.add('hidden');
  answerLine.classList.add('hidden');
  rationale.classList.add('hidden');

  onSelectionChanged();
}

/* ---------- SELECTION HANDLING ---------- */
function onSelectionChanged() {
  if (!submitBtn) return;
  const selected = getSelectedAnswers();
  submitBtn.disabled = !selected.length;

  if (form.classList.contains('is-single-select')) {
    form.classList.toggle('has-selection', selected.length > 0);
  } else {
    form.classList.remove('has-selection');
  }
}

/* ---------- SUBMIT / NEXT ---------- */
function handleSubmit() {
  const q = run.current;
  if (!q) return;

  const user = getSelectedAnswers();
  const correct = normalizeAnswer(q);

  const isCorrect = user.length === correct.length &&
    user.every(l => correct.includes(l));

  highlightAnswers(q, user);
  showAnswerLine(q);

  form.querySelectorAll('input').forEach(i => i.disabled = true);
  submitBtn.textContent = 'Next →';
  submitBtn.dataset.mode = 'next';
}

function handleNext() {
  run.idx++;
  if (run.idx >= run.pool.length) {
    endQuiz();
  } else {
    showQuestionAt(run.idx);
    submitBtn.dataset.mode = 'submit';
    submitBtn.textContent = 'Submit';
  }
}

function showQuestionAt(idx) {
  const q = run.pool[idx];
  renderQuestion(q);
  updateCounters();
}

function endQuiz() {
  quiz.classList.add('hidden');
  summary.classList.remove('hidden');
}

/* ---------- VISUAL ANSWER STYLING ---------- */
function highlightAnswers(q, user) {
  form.querySelectorAll('.option').forEach(div => {
    const input = div.querySelector('input');
    const letter = input.value.toUpperCase();
    div.classList.remove('correct','incorrect','missed');

    const correctLetters = normalizeAnswer(q);
    if (correctLetters.includes(letter) && user.includes(letter)) div.classList.add('correct');
    else if (!correctLetters.includes(letter) && user.includes(letter)) div.classList.add('incorrect');
    else if (correctLetters.includes(letter) && !user.includes(letter)) div.classList.add('missed');
  });
}

function showAnswerLine(q) {
  const correct = normalizeAnswer(q).join(', ');
  answerLine.textContent = `Correct Answer: ${correct}`;
  answerLine.classList.remove('hidden');
}

/* ---------- EVENT LISTENERS ---------- */
submitBtn?.addEventListener('click', () => {
  submitBtn.dataset.mode === 'submit' ? handleSubmit() : handleNext();
});

document.addEventListener('keydown', (e) => {
  if (quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;

  if (e.key === 'Enter' && !submitBtn.disabled) {
    e.preventDefault();
    submitBtn.click();
    return;
  }

  const letterKey = e.key && /^[A-Z]$/i.test(e.key) && e.key.toUpperCase();
  if (letterKey && submitBtn.dataset.mode === 'submit') {
    const input = document.getElementById(`opt-${letterKey}`);
    if (input && !input.disabled) {
      input.checked = !input.checked;
      onSelectionChanged();
    }
  }
});

/* ---------- INIT ---------- */
window.addEventListener('load', () => initModules());
