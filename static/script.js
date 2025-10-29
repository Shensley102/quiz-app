/* ===========================
   Study Quiz — Frontend only
   =========================== */

const MODULES_FALLBACK = {
  "Module_1": "Module_1.json",
  "Module_2": "Module_2.json",
  "Module_3": "Module_3.json",
  "Pharm_Quiz_HESI": "Pharm_Quiz_HESI.json"
};

const els = {
  launcher: document.getElementById('launcher'),
  moduleSelect: document.getElementById('moduleSelect'),
  lengthBtns: Array.from(document.querySelectorAll('.len-btn')),
  startBtn: document.getElementById('startBtn'),

  quiz: document.getElementById('quizArea'),
  quizTitle: document.getElementById('quizTitle'),
  progress: document.getElementById('progress'),
  qText: document.getElementById('questionText'),
  form: document.getElementById('optionsForm'),
  submit: document.getElementById('submitBtn'),
  next: document.getElementById('nextBtn'),
  feedback: document.getElementById('feedback'),
  rationale: document.getElementById('rationale'),
  reset: document.getElementById('resetBtn'),

  done: document.getElementById('done'),
  firstTry: document.getElementById('firstTry'),
  totalAnswers: document.getElementById('totalAnswers'),
  newQuizBtn: document.getElementById('newQuizBtn'),
};

let MODULE_MAP = {};
let currentLength = 10;

// state for a running quiz
let state = null;

/* -----------------------------
   Utilities
------------------------------ */
const letters = i => String.fromCharCode(65 + i); // 0->A
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const scrollIntoViewSoft = (node, block = 'start') => {
  if (!node) return;
  try { node.scrollIntoView({behavior: 'smooth', block}); }
  catch { node.scrollIntoView(); }
};

async function loadJSON(path) {
  const res = await fetch(path, {cache: 'no-store'});
  if (!res.ok) throw new Error(`Fetch failed ${path} ${res.status}`);
  return res.json();
}

async function loadModuleList() {
  // Try /modules.json then /static/modules.json else fallback
  try {
    MODULE_MAP = await loadJSON('/modules.json');
  } catch {
    try {
      MODULE_MAP = await loadJSON('/static/modules.json');
    } catch {
      console.warn('[modules] Falling back to default map');
      MODULE_MAP = MODULES_FALLBACK;
    }
  }
  // Populate select
  els.moduleSelect.innerHTML = '';
  Object.keys(MODULE_MAP).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.moduleSelect.appendChild(opt);
  });
}

function currentModuleName() {
  return els.moduleSelect.value || Object.keys(MODULE_MAP)[0];
}

/* -----------------------------
   Launcher wiring
------------------------------ */
els.lengthBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    els.lengthBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLength = btn.dataset.len === 'full' ? 'full' : parseInt(btn.dataset.len, 10);
  });
});

els.startBtn.addEventListener('click', async () => {
  const mod = currentModuleName();
  const path = MODULE_MAP[mod];
  if (!path) {
    alert('Module not found.');
    return;
  }
  let bank;
  try {
    bank = await loadJSON(`/${path}`);
  } catch {
    try {
      bank = await loadJSON(`/static/${path}`);
    } catch (e) {
      console.error(e);
      alert('Unable to load module file.');
      return;
    }
  }
  startQuiz(mod, normalizeBank(bank));
});

/* -----------------------------
   Normalize incoming JSON
   Expecting array of:
   { id, stem, options: [..], correct: ["A","C"], rationale, type: "multi"|"multi_select" }
------------------------------ */
function normalizeBank(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.questions)) return raw.questions;
  return [];
}

/* -----------------------------
   Start Quiz
------------------------------ */
function startQuiz(moduleName, questions) {
  // length
  const list = shuffle(questions);
  const count = currentLength === 'full' ? list.length : Math.min(list.length, currentLength);
  const chosen = list.slice(0, count);

  const threshold = Math.max(1, Math.floor(count * 0.15)); // 15%

  state = {
    moduleName,
    bank: chosen,
    total: count,
    queue: chosen.map((q, idx) => ({...q, _idx: idx})), // embed unique index
    pos: 0,
    wrongBucket: [],
    threshold,

    // mastery / scoring
    seen: new Set(),               // tracks if a question has been seen at least once
    firstTryCorrect: 0,            // numerator
    totalSubmits: 0,               // denominator for "Total answers submitted"
    firstTryMap: new Map(),        // q._idx -> {answered: boolean, gotRightOnFirst: boolean}
  };

  // UI swap
  els.launcher.classList.add('hidden');
  els.done.classList.add('hidden');
  els.quiz.classList.remove('hidden');

  els.quizTitle.textContent = moduleName.replaceAll('_',' ');
  renderCurrent();
}

/* -----------------------------
   Render current question
------------------------------ */
function renderCurrent() {
  const remaining = state.queue.slice(state.pos);
  if (remaining.length === 0) {
    // finished
    finishQuiz();
    return;
  }

  const q = remaining[0];
  els.progress.textContent = `Question ${state.total - remaining.length + 1} of ${state.total}`;

  // question text
  els.qText.textContent = q.stem || '';

  // form options
  els.form.innerHTML = '';
  const isMulti = (q.type || '').toLowerCase().includes('multi_select') || (q.type || '').toLowerCase().includes('select');
  const inputType = isMulti ? 'checkbox' : 'radio';
  const name = `choice-${q._idx}`;

  (q.options || []).forEach((txt, i) => {
    const id = `${name}-${i}`;
    const line = document.createElement('div');
    line.className = 'opt';
    const input = document.createElement('input');
    input.type = inputType;
    input.name = name;
    input.id = id;
    input.value = letters(i);
    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `<strong>${letters(i)}.</strong>&nbsp; ${escapeHTML(txt)}`;
    line.appendChild(input);
    line.appendChild(label);
    els.form.appendChild(line);
  });

  // reset controls/feedback
  els.feedback.classList.add('hidden');
  els.feedback.textContent = '';
  els.feedback.classList.remove('ok','err');
  els.rationale.classList.add('hidden');
  els.rationale.textContent = '';

  els.submit.disabled = false;
  els.next.disabled = true;

  // focus first control
  const first = els.form.querySelector('input');
  if (first) first.focus({preventScroll:true});

  // ensure top
  scrollIntoViewSoft(document.querySelector('.card'), 'start');
}

/* -----------------------------
   Submit & Next handlers
------------------------------ */
els.submit.addEventListener('click', ev => {
  ev.preventDefault();
  handleSubmit();
});

els.next.addEventListener('click', ev => {
  ev.preventDefault();
  advance();
});

els.reset.addEventListener('click', () => hardReset());

els.newQuizBtn.addEventListener('click', () => {
  // go back to launcher with current selections intact
  els.done.classList.add('hidden');
  els.launcher.classList.remove('hidden');
});

function getUserSelection() {
  const inputs = Array.from(els.form.querySelectorAll('input'));
  const chosen = inputs.filter(i => i.checked).map(i => i.value);
  return chosen;
}

function setFeedback({correct, q, wasFirstAttempt}) {
  // Build nice answer text(s)
  const correctLetters = (q.correct || []);
  const lines = correctLetters.map(letter => {
    const idx = letter.charCodeAt(0) - 65;
    const text = (q.options && q.options[idx]) ? q.options[idx] : '';
    return `${letter} — ${text}`;
  });

  els.feedback.classList.remove('ok','err');
  els.feedback.classList.remove('hidden');

  if (correct) {
    els.feedback.classList.add('ok');
    // line 1
    els.feedback.textContent = 'Correct!';
    // line 2+: correct answer(s) under the correctness line
    els.feedback.appendChild(document.createElement('br'));
    els.feedback.appendChild(document.createTextNode(lines.join('\n')));
  } else {
    els.feedback.classList.add('err');
    els.feedback.textContent = 'Incorrect.';
    // then label & answers
    els.feedback.appendChild(document.createElement('br'));
    const label = document.createElement('div');
    label.style.fontWeight = '700';
    label.textContent = 'Correct Answer:';
    els.feedback.appendChild(label);
    els.feedback.appendChild(document.createTextNode(lines.join('\n')));
  }

  // SATA: one answer per line already handled via '\n' and CSS white-space
  // Show rationale only after submit
  if (q.rationale) {
    els.rationale.textContent = q.rationale;
    els.rationale.classList.remove('hidden');
  }

  // Scroll to feedback area
  setTimeout(() => scrollIntoViewSoft(els.rationale, 'center'), 30);

  // lock submit; enable next
  els.submit.disabled = true;
  els.next.disabled = false;
}

function handleSubmit() {
  const remaining = state.queue.slice(state.pos);
  if (remaining.length === 0) return;
  const q = remaining[0];

  const chosen = getUserSelection();
  if (chosen.length === 0) {
    alert('Please make a selection.');
    return;
  }

  // score bookkeeping
  state.totalSubmits += 1;

  const sortedChosen = chosen.slice().sort().join('|');
  const sortedCorrect = (q.correct || []).slice().sort().join('|');
  const gotIt = (sortedChosen === sortedCorrect);

  // first-try tracking
  if (!state.firstTryMap.has(q._idx)) {
    state.firstTryMap.set(q._idx, {answered:true, correct:gotIt});
    if (gotIt) state.firstTryCorrect += 1;
  }

  // mastery queue logic
  if (gotIt) {
    // remove this question from queue
    state.pos += 1;
  } else {
    // add to wrong bucket
    state.wrongBucket.push(q);
    // and also advance past it in queue (do NOT requeue at tail now)
    state.pos += 1;

    // When wrong bucket hits threshold, inject them immediately to the front
    if (state.wrongBucket.length >= state.threshold) {
      const front = state.queue.slice(0, state.pos);
      const tail = state.queue.slice(state.pos);
      state.queue = front.concat(state.wrongBucket).concat(tail);
      state.wrongBucket = []; // reset bucket (as requested)
      // do not change pos; the next render will pick from newly inserted wrongs
    }
  }

  // feedback
  setFeedback({correct: gotIt, q});
}

function advance() {
  renderCurrent();           // will detect if finished
  // Scroll back to top of card for the next question
  setTimeout(() => scrollIntoViewSoft(document.querySelector('.card'), 'start'), 20);
}

function finishQuiz() {
  // If any residual wrongs remain, put them now (final loop)
  if (state.wrongBucket.length > 0) {
    const tailFront = state.queue.slice(0, state.pos);
    const tailBack = state.queue.slice(state.pos);
    state.queue = tailFront.concat(state.wrongBucket).concat(tailBack);
    state.wrongBucket = [];
    // rerender to continue mastering
    renderCurrent();
    return;
  }

  // done for real
  els.quiz.classList.add('hidden');
  els.done.classList.remove('hidden');

  const firstTryPct = state.total ? Math.round((state.firstTryCorrect / state.total) * 100) : 0;
  els.firstTry.textContent = `First-Try Accuracy: ${firstTryPct}% (${state.firstTryCorrect} / ${state.total})`;
  els.totalAnswers.textContent = `Total answers submitted: ${state.totalSubmits}`;
}

function hardReset() {
  // Return to launcher
  state = null;
  els.quiz.classList.add('hidden');
  els.done.classList.add('hidden');
  els.launcher.classList.remove('hidden');
}

/* -----------------------------
   Keyboard helpers
   - letters toggle answers (press again to de-select)
   - Enter: Submit; after feedback, Enter triggers Next
------------------------------ */
document.addEventListener('keydown', (ev) => {
  if (els.quiz.classList.contains('hidden')) return;

  const k = ev.key.toUpperCase();
  const isLetter = /^[A-Z]$/.test(k);

  if (isLetter) {
    const inputs = Array.from(els.form.querySelectorAll('input'));
    const target = inputs.find(i => i.value === k);
    if (target) {
      ev.preventDefault();

      if (target.type === 'radio') {
        // toggle behavior for radio: uncheck if already checked
        if (target.checked) {
          target.checked = false;
        } else {
          // uncheck others then check this
          inputs.filter(i => i.type === 'radio').forEach(i => (i.checked = false));
          target.checked = true;
        }
      } else {
        // checkbox: toggle
        target.checked = !target.checked;
      }
    }
  }

  if (ev.key === 'Enter') {
    const submitDisabled = els.submit.disabled;
    if (!submitDisabled) {
      ev.preventDefault();
      els.submit.click();
    } else if (!els.next.disabled) {
      ev.preventDefault();
      els.next.click();
    }
  }
});

/* -----------------------------
   Small helpers
------------------------------ */
function escapeHTML(s=''){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* -----------------------------
   Boot
------------------------------ */
loadModuleList();
