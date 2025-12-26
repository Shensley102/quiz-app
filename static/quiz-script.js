/* -----------------------------------------------------------
   Nurse Success Study Hub - Quiz Application
   - Complete quiz functionality with module selection
   - Category-specific module filtering
   - Keyboard shortcuts support (A-E for answers, Enter for submit/next)
   - Progress tracking and mastery system
   - Detailed performance review
   - LocalStorage persistence for resuming quizzes
   - Resume only works with Full Module Question Bank
   - Shows remaining questions count on resume button
   - Subcategory filtering for grouped modules
   - Supports both array-based and object-based options
   - Supports single_select and multi_select question types
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// Top info
const runCounter       = $('runCounter');
const remainingCounter = $('remainingCounter');
const countersBox      = $('countersBox');

// Progress bar
const progressBar   = $('progressBar');
const progressFill  = $('progressFill');
const progressLabel = $('progressLabel');

// Page title handling
const pageTitle    = $('pageTitle');
const defaultTitle = pageTitle?.textContent || 'Quiz - Nurse Success Study Hub';
const setHeaderTitle = (t) => { if (pageTitle) pageTitle.textContent = t; };

// Launcher
const launcher   = $('launcher');
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
const summary          = $('summary');
const firstTrySummary  = $('firstTrySummary');
const reviewList       = $('reviewList');
const restartBtn2      = $('restartBtnSummary');
const resetAll         = $('resetAll');
const retryMissedBtn   = $('retryMissedBtn');

// Track whether current question has been submitted (prevents answer changes after submit)
let questionSubmitted = false;

// Track missed questions for retry functionality
let lastQuizMissedQuestions = [];

/* ---------- Pretty names for modules ---------- */
function prettifyModuleName(name) {
  const raw = String(name || '');

  const normalized = raw
    .replace(/moduele/gi, 'module')
    .replace(/question(?:s)?[-_]?bank/gi, 'Question Bank')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');

  const capitalised = normalized
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return capitalised
    .replace(/\bQa\b/gi, 'Q&A')
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bThe\b/g, 'the')
    .replace(/\bA\b/g, 'a')
    .replace(/\bHesi\b/gi, 'HESI')
    .replace(/\bNclex\b/gi, 'NCLEX')
    .replace(/\bCcrn\b/gi, 'CCRN')
    .replace(/\bPharm\b/gi, 'Pharmacology')
    .replace(/\bCns\b/gi, 'CNS')
    .replace(/(?:^|\s)(\w)/g, (m, c) => m.replace(c, c.toUpperCase()));
}

/* ---------- Category/Icon display ---------- */
function setupCategoryDisplay() {
  const categoryParam = new URLSearchParams(window.location.search).get('cat');
  if (!categoryParam) return;

  const categoryMappings = {
    'Patient_Care_Management': { icon: '🏥', title: 'Patient Care Management', description: 'Comprehensive patient care and nursing management topics' },
    'Pharmacology': { icon: '💊', title: 'Pharmacology', description: 'Drug classifications, mechanisms, and nursing implications' },
    'Lab_Values': { icon: '🔬', title: 'Lab Values', description: 'Laboratory values interpretation and clinical significance' },
    'Nursing_Certifications': { icon: '📜', title: 'Nursing Certifications', description: 'Certification exam preparation materials' },
    'HESI': { icon: '📚', title: 'HESI Exam Prep', description: 'Comprehensive HESI exam preparation' }
  };

  const mapping = categoryMappings[categoryParam];
  if (!mapping) return;

  const { icon, title: category, description: categoryDescription } = mapping;
  const displayTitle = category;
  const displayDescription = categoryDescription;

  const categoryIcon = $('categoryIcon');
  const categoryTitle = $('categoryTitle');
  const categoryDesc = $('categoryDescription');

  if (categoryIcon) categoryIcon.textContent = icon;
  if (categoryTitle) categoryTitle.textContent = displayTitle;
  if (categoryDesc) {
    if (displayDescription) {
      categoryDesc.textContent = displayDescription;
      categoryDesc.style.display = 'block';
    } else {
      categoryDesc.style.display = 'none';
    }
  }

  const headerSummary = $('categoryHeaderSummary');
  if (headerSummary) {
    const categoryIconSummary = $('categoryIconSummary');
    const summaryTitle = $('summaryTitle');
    const summaryDescription = $('summaryDescription');
    if (categoryIconSummary) categoryIconSummary.textContent = icon;
    if (summaryTitle) summaryTitle.textContent = displayTitle;
    if (summaryDescription) {
      if (displayDescription) {
        summaryDescription.textContent = displayDescription;
        summaryDescription.style.display = 'block';
      } else {
        summaryDescription.style.display = 'none';
      }
    }
  }
}

/* ---------- Run state ---------- */
const run = {
  bank: null,
  masterPool: [],
  order: [],
  i: 0,
  answered: new Map(),
  firstTry: new Map(),
  wrongSinceLast: [],
  thresholdWrong: 3,
  displayName: '',
  uniqueSeen: new Set(),
  totalQuestionsAnswered: 0
};

/* ---------- Module registry and filtering ---------- */
let MODULES = {};

function getFilteredModules() {
  const params = new URLSearchParams(window.location.search);
  const categoryFilter = params.get('cat');
  const subcategoryFilter = params.get('sub');

  if (!categoryFilter) return MODULES;

  const filtered = {};
  for (const [key, value] of Object.entries(MODULES)) {
    if (value.category === categoryFilter) {
      if (!subcategoryFilter || value.subcategory === subcategoryFilter) {
        filtered[key] = value;
      }
    }
  }
  return filtered;
}

/* ---------- Normalize question format ---------- */
function normalizeQuestions(rawQuestions) {
  return rawQuestions.map((q, idx) => {
    const normalized = { ...q };

    // Ensure ID exists
    if (!normalized.id) {
      normalized.id = `q_${idx}_${Date.now()}`;
    }

    // Handle options - convert array to object if needed
    // JSON format: "options": ["Option A text", "Option B text", ...]
    // Code expects: { A: "Option A text", B: "Option B text", ... }
    if (Array.isArray(normalized.options)) {
      const optObj = {};
      const letters = 'ABCDEFGHIJ'.split('');
      normalized.options.forEach((opt, i) => {
        if (i < letters.length) {
          optObj[letters[i]] = opt;
        }
      });
      normalized.options = optObj;
    }

    // Handle correct answers - ensure it's an array of letters
    // JSON format: "correct": ["A"] or "correct": ["A", "B", "C"]
    // Code expects: correctLetters as array of letters
    if (normalized.correct) {
      if (Array.isArray(normalized.correct)) {
        normalized.correctLetters = normalized.correct.slice().sort();
      } else if (typeof normalized.correct === 'string') {
        normalized.correctLetters = [normalized.correct];
      }
    }

    // Fallback for old format with correctLetters already set
    if (!normalized.correctLetters && normalized.correctAnswer) {
      if (Array.isArray(normalized.correctAnswer)) {
        normalized.correctLetters = normalized.correctAnswer.slice().sort();
      } else {
        normalized.correctLetters = [normalized.correctAnswer];
      }
    }

    // Ensure correctLetters exists
    if (!normalized.correctLetters) {
      normalized.correctLetters = [];
    }

    // Normalize type field
    // JSON uses: "type": "single_select" or "type": "multi_select"
    if (!normalized.type) {
      // Default to single_select if not specified
      normalized.type = normalized.correctLetters.length > 1 ? 'multi_select' : 'single_select';
    }
    // Also support "multiple_select" as alias for "multi_select"
    if (normalized.type === 'multiple_select') {
      normalized.type = 'multi_select';
    }

    return normalized;
  });
}

/* ---------- Shuffle helpers ---------- */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleQuestionOptions(q) {
  const options = q.options || {};
  const letters = Object.keys(options).sort();
  if (letters.length === 0) return q;

  const shuffledLetters = shuffleArray(letters);
  const letterMap = {};
  shuffledLetters.forEach((oldLetter, idx) => {
    letterMap[oldLetter] = letters[idx];
  });

  const newOptions = {};
  shuffledLetters.forEach((oldLetter, idx) => {
    newOptions[letters[idx]] = options[oldLetter];
  });

  const newCorrect = (q.correctLetters || []).map(l => letterMap[l]).sort();

  return {
    ...q,
    options: newOptions,
    correctLetters: newCorrect
  };
}

/* ---------- LocalStorage helpers ---------- */
function getStorageKey() {
  return `quizState_${run.bank || 'default'}`;
}

function saveState() {
  const state = {
    bank: run.bank,
    masterPool: run.masterPool,
    order: run.order,
    i: run.i,
    answered: Array.from(run.answered.entries()),
    firstTry: Array.from(run.firstTry.entries()),
    wrongSinceLast: run.wrongSinceLast,
    displayName: run.displayName,
    uniqueSeen: Array.from(run.uniqueSeen),
    totalQuestionsAnswered: run.totalQuestionsAnswered
  };
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save quiz state:', e);
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (!saved) return null;
    const state = JSON.parse(saved);
    return state;
  } catch (e) {
    console.warn('Could not load quiz state:', e);
    return null;
  }
}

function clearSavedState() {
  try {
    localStorage.removeItem(getStorageKey());
  } catch (e) {
    console.warn('Could not clear quiz state:', e);
  }
}

/* ---------- Show resume button if saved state exists ---------- */
function showResumeIfAny() {
  if (!resumeBtn) return;

  const filteredModules = getFilteredModules();
  const moduleKeys = Object.keys(filteredModules);

  for (const moduleKey of moduleKeys) {
    run.bank = moduleKey;
    const state = loadState();
    if (state && state.masterPool && state.i < state.order.length) {
      const remaining = getNotMasteredFromState(state);
      resumeBtn.textContent = `Resume Last Quiz (${remaining} remaining)`;
      resumeBtn.classList.remove('hidden');
      resumeBtn.onclick = () => resumeQuiz(state);
      return;
    }
  }

  resumeBtn.classList.add('hidden');
}

function getNotMasteredFromState(state) {
  const answeredMap = new Map(state.answered || []);
  return state.masterPool.filter(q => !answeredMap.get(q.id)?.correct).length;
}

function resumeQuiz(state) {
  run.bank = state.bank;
  run.masterPool = state.masterPool;
  run.order = state.order;
  run.i = state.i;
  run.answered = new Map(state.answered);
  run.firstTry = new Map(state.firstTry);
  run.wrongSinceLast = state.wrongSinceLast || [];
  run.displayName = state.displayName || '';
  run.uniqueSeen = new Set(state.uniqueSeen || []);
  run.totalQuestionsAnswered = state.totalQuestionsAnswered || 0;

  if (launcher) launcher.classList.add('hidden');
  if (summary) summary.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  if (resetAll) resetAll.classList.remove('hidden');

  const q = currentQuestion();
  if (q) {
    renderQuestion(q);
    updateCounters();
  }
}

/* ---------- Render Question ---------- */
function renderQuestion(q) {
  if (!qText || !form) return;

  // Reset submission state for new question
  questionSubmitted = false;

  qText.textContent = q.stem;
  form.innerHTML = '';

  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'feedback hidden';
  }
  if (answerLine) {
    answerLine.innerHTML = '';
    answerLine.classList.add('hidden');
  }
  if (rationaleBox) {
    rationaleBox.textContent = '';
    rationaleBox.classList.add('hidden');
  }

  // Determine if multi-select based on type field
  const isMulti = (q.type === 'multi_select' || q.type === 'multiple_select');
  const options = q.options || {};
  const letters = Object.keys(options).sort();

  letters.forEach(letter => {
    const optDiv = document.createElement('div');
    optDiv.className = 'opt';
    optDiv.dataset.letter = letter;

    const inp = document.createElement('input');
    inp.type = isMulti ? 'checkbox' : 'radio';
    inp.name = 'answer';
    inp.id = `opt-${letter}`;
    inp.value = letter;

    const lbl = document.createElement('label');
    lbl.setAttribute('for', `opt-${letter}`);
    lbl.dataset.letter = letter;

    const keySpan = document.createElement('span');
    keySpan.className = 'k';
    keySpan.textContent = letter;

    const answerSpan = document.createElement('span');
    answerSpan.className = 'ans';
    answerSpan.textContent = options[letter];

    lbl.appendChild(keySpan);
    lbl.appendChild(answerSpan);

    optDiv.appendChild(inp);
    optDiv.appendChild(lbl);
    form.appendChild(optDiv);

    // Click handler for the entire option div (handles both click on label and div)
    optDiv.addEventListener('click', (e) => {
      // Don't process if question already submitted
      if (questionSubmitted) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // If clicking directly on the input, let native behavior handle it for checkboxes
      // For radio buttons, we need special handling to allow deselection
      if (e.target === inp) {
        if (!isMulti) {
          // Radio button - check if already checked to allow deselection
          if (inp.checked) {
            // Will be checked after this event, so it was already checked
            // Actually, for radio onclick, it fires after state change
            // We need to use mousedown to catch the state before change
          }
        }
        // For checkboxes, native toggle works fine
        onSelectionChanged();
        return;
      }

      // Clicking on label, keySpan, answerSpan, or optDiv
      e.preventDefault();
      e.stopPropagation();

      if (isMulti) {
        // Checkbox - just toggle
        inp.checked = !inp.checked;
      } else {
        // Radio button - allow deselection
        if (inp.checked) {
          // Already selected, deselect it
          inp.checked = false;
        } else {
          // Not selected, select it (and deselect others via radio behavior)
          // First uncheck all radios, then check this one
          form.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
          inp.checked = true;
        }
      }

      onSelectionChanged();
    });

    // For radio buttons, also handle mousedown on input to detect if already checked
    if (!isMulti) {
      inp.addEventListener('mousedown', function(e) {
        if (questionSubmitted) {
          e.preventDefault();
          return;
        }
        // Store current checked state
        this._wasChecked = this.checked;
      });

      inp.addEventListener('click', function(e) {
        if (questionSubmitted) {
          e.preventDefault();
          return;
        }
        // If it was already checked before this click, uncheck it
        if (this._wasChecked) {
          this.checked = false;
        }
        onSelectionChanged();
      });
    }
  });

  setActionState('submit');
  updateHoverClasses();
}

function currentQuestion() {
  return run.order?.[run.i] || null;
}

function getUserLetters() {
  if (!form) return [];
  const checked = [...form.querySelectorAll('input:checked')];
  return checked.map(inp => inp.value).sort();
}

function onSelectionChanged() {
  if (!submitBtn) return;
  const hasSelection = getUserLetters().length > 0;
  submitBtn.disabled = !hasSelection;
  updateHoverClasses();
}

function updateHoverClasses() {
  if (!form) return;
  form.querySelectorAll('.opt').forEach(opt => {
    const inp = opt.querySelector('input');
    if (inp && inp.checked) {
      opt.classList.add('selected');
    } else {
      opt.classList.remove('selected');
    }
  });
}

function setActionState(mode) {
  if (!submitBtn) return;
  submitBtn.dataset.mode = mode;

  if (mode === 'submit') {
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('btn-blue');
    submitBtn.classList.add('primary');
    submitBtn.disabled = getUserLetters().length === 0;
  } else {
    submitBtn.textContent = 'Next';
    submitBtn.classList.remove('primary');
    submitBtn.classList.add('btn-blue');
    submitBtn.disabled = false;
  }
}

/* ---------- Toggle answer by letter (for keyboard shortcuts) ---------- */
function toggleAnswerByLetter(letter) {
  if (questionSubmitted) return;

  const input = document.getElementById(`opt-${letter}`);
  if (!input || input.disabled) return;

  const isMulti = input.type === 'checkbox';

  if (isMulti) {
    // Checkbox - just toggle
    input.checked = !input.checked;
  } else {
    // Radio button - toggle behavior
    if (input.checked) {
      // Already checked, uncheck it
      input.checked = false;
    } else {
      // Not checked, check it (automatically unchecks others)
      input.checked = true;
    }
  }

  onSelectionChanged();
}

/* ---------- Answer formatting and highlighting ---------- */
function formatCorrectAnswers(q) {
  const letters = q.correctLetters || [];
  const options = q.options || {};
  return letters.map(l => `<strong>${escapeHTML(l)}</strong>. ${escapeHTML(options[l] || '')}`).join('<br>');
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function highlightAnswers(q, userLetters, isCorrect) {
  if (!form) return;

  const correctLetters = q.correctLetters || [];

  form.querySelectorAll('.opt').forEach(opt => {
    const letter = opt.dataset.letter;
    const isUserSelected = userLetters.includes(letter);
    const isCorrectAnswer = correctLetters.includes(letter);

    opt.classList.remove('correct-answer', 'wrong-answer', 'missed-answer');

    if (isCorrectAnswer && isUserSelected) {
      // User selected a correct answer
      opt.classList.add('correct-answer');
    } else if (isUserSelected && !isCorrectAnswer) {
      // User selected a wrong answer
      opt.classList.add('wrong-answer');
    } else if (isCorrectAnswer && !isUserSelected) {
      // User missed a correct answer
      opt.classList.add('missed-answer');
    }
  });
}

/* ---------- Counter updates ---------- */
function updateCounters() {
  const total = run.masterPool.length;
  const remaining = getNotMastered().length;

  if (runCounter) {
    runCounter.textContent = `Question ${run.i + 1} of ${run.order.length}`;
  }
  if (remainingCounter) {
    remainingCounter.textContent = `${remaining} remaining to master`;
  }

  updateProgressBar();
}

function getNotMastered() {
  return run.masterPool.filter(q => !run.answered.get(q.id)?.correct);
}

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

/* ---------- Record answer ---------- */
function recordAnswer(q, userLetters, isCorrect) {
  const existing = run.answered.get(q.id);
  if (!existing) {
    run.firstTry.set(q.id, isCorrect);
  }
  run.answered.set(q.id, { letters: userLetters, correct: isCorrect });
  saveState();
}

/* ---------- Next question logic ---------- */
function nextIndex() {
  run.i++;
  if (run.i >= run.order.length) {
    return { q: null };
  }
  return { q: run.order[run.i] };
}

/* ---------- End run / summary ---------- */
function endRun() {
  if (quiz) quiz.classList.add('hidden');
  if (countersBox) countersBox.classList.add('hidden');
  if (resetAll) resetAll.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');

  // Calculate stats
  let firstTryCorrect = 0;
  let firstTryTotal = 0;
  const missed = [];

  run.masterPool.forEach(q => {
    const ft = run.firstTry.get(q.id);
    if (ft !== undefined) {
      firstTryTotal++;
      if (ft) firstTryCorrect++;
      else missed.push(q);
    }
  });

  // Store missed questions for retry
  lastQuizMissedQuestions = missed;

  const pct = firstTryTotal ? Math.round((firstTryCorrect / firstTryTotal) * 100) : 0;

  if (firstTrySummary) {
    firstTrySummary.innerHTML = `
      <div class="score-display">
        <span class="score-number">${pct}%</span>
        <span class="score-label">First Try Accuracy</span>
      </div>
      <div class="score-details">
        ${firstTryCorrect} of ${firstTryTotal} correct on first attempt
      </div>
    `;
  }

  // Show/hide retry button
  if (retryMissedBtn) {
    if (missed.length > 0) {
      retryMissedBtn.textContent = `Retry ${missed.length} Missed Question${missed.length > 1 ? 's' : ''}`;
      retryMissedBtn.classList.remove('hidden');
    } else {
      retryMissedBtn.classList.add('hidden');
    }
  }

  // Build review list
  if (reviewList) {
    reviewList.innerHTML = '';

    if (missed.length === 0) {
      reviewList.innerHTML = '<p class="all-correct">🎉 Perfect! You got all questions correct on the first try!</p>';
    } else {
      missed.forEach(q => {
        const div = document.createElement('div');
        div.className = 'review-item';

        const stemP = document.createElement('p');
        stemP.className = 'review-stem';
        stemP.textContent = q.stem;

        const answerP = document.createElement('p');
        answerP.className = 'review-answer';
        answerP.innerHTML = `<strong>Correct:</strong> ${formatCorrectAnswers(q)}`;

        const rationaleP = document.createElement('p');
        rationaleP.className = 'review-rationale';
        rationaleP.textContent = q.rationale || '';

        div.appendChild(stemP);
        div.appendChild(answerP);
        if (q.rationale) div.appendChild(rationaleP);
        reviewList.appendChild(div);
      });
    }
  }

  clearSavedState();
}

/* ---------- Start retry quiz with missed questions ---------- */
function startRetryQuiz(missedQuestions) {
  if (!missedQuestions || missedQuestions.length === 0) return;

  // Reset run state for retry
  run.masterPool = missedQuestions.map(q => ({ ...q }));
  run.order = shuffleArray(run.masterPool).map(q => shuffleQuestionOptions(q));
  run.i = 0;
  run.answered = new Map();
  run.firstTry = new Map();
  run.wrongSinceLast = [];
  run.displayName = 'Retry Missed Questions';
  run.uniqueSeen = new Set();
  run.totalQuestionsAnswered = 0;

  if (summary) summary.classList.add('hidden');
  if (launcher) launcher.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  if (resetAll) resetAll.classList.remove('hidden');

  const q = currentQuestion();
  if (q) {
    run.uniqueSeen.add(q.id);
    renderQuestion(q);
    updateCounters();
  }
}

/* ---------- Scroll helpers ---------- */
function scrollToQuizTop() {
  if (quiz) {
    quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function scrollToBottomSmooth() {
  if (feedback) {
    feedback.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
}

/* ---------- Text editing detection ---------- */
function isTextEditingTarget(target) {
  if (!target) return false;
  const tagName = target.tagName;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName === 'INPUT') {
    const type = target.type?.toLowerCase();
    // Allow keyboard shortcuts for radio/checkbox inputs
    if (type === 'radio' || type === 'checkbox') return false;
    return true;
  }
  if (target.isContentEditable) return true;
  return false;
}

/* ---------- Module initialization ---------- */
function initModules() {
  const params = new URLSearchParams(window.location.search);
  const categoryFilter = params.get('cat');
  const subcategoryFilter = params.get('sub');
  const moduleParam = params.get('module');

  // Define all modules
  MODULES = {
    // Patient Care Management
    'Module_1': { path: '/modules/Patient_Care_Management/Module_1.json', category: 'Patient_Care_Management' },
    'Module_2': { path: '/modules/Patient_Care_Management/Module_2.json', category: 'Patient_Care_Management' },
    'Module_3': { path: '/modules/Patient_Care_Management/Module_3.json', category: 'Patient_Care_Management' },
    'Module_4': { path: '/modules/Patient_Care_Management/Module_4.json', category: 'Patient_Care_Management' },
    'Learning_Questions_Module_1_2': { path: '/modules/Patient_Care_Management/Learning_Questions_Module_1_2.json', category: 'Patient_Care_Management' },
    'Learning_Questions_Module_3_4': { path: '/modules/Patient_Care_Management/Learning_Questions_Module_3_4.json', category: 'Patient_Care_Management' },

    // Pharmacology
    'Anti_Infectives_Pharm': { path: '/modules/Pharmacology/Anti_Infectives_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'CNS_Psychiatric_Pharm': { path: '/modules/Pharmacology/CNS_Psychiatric_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Cardiovascular_Pharm': { path: '/modules/Pharmacology/Cardiovascular_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Endocrine_Metabolic_Pharm': { path: '/modules/Pharmacology/Endocrine_Metabolic_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Gastrointestinal_Pharm': { path: '/modules/Pharmacology/Gastrointestinal_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Hematologic_Oncology_Pharm': { path: '/modules/Pharmacology/Hematologic_Oncology_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'High_Alert_Medications_Pharm': { path: '/modules/Pharmacology/High_Alert_Medications_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Immunologic_Biologics_Pharm': { path: '/modules/Pharmacology/Immunologic_Biologics_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Musculoskeletal_Pharm': { path: '/modules/Pharmacology/Musculoskeletal_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Pain_Management_Pharm': { path: '/modules/Pharmacology/Pain_Management_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Renal_Electrolytes_Pharm': { path: '/modules/Pharmacology/Renal_Electrolytes_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Respiratory_Pharm': { path: '/modules/Pharmacology/Respiratory_Pharm.json', category: 'Pharmacology', subcategory: 'Categories' },
    'Comprehensive_Pharmacology': { path: '/modules/Pharmacology/Comprehensive_Pharmacology.json', category: 'Pharmacology', subcategory: 'Comprehensive' },
    'Pharm_Quiz_1': { path: '/modules/Pharmacology/Pharm_Quiz_1.json', category: 'Pharmacology', subcategory: 'Comprehensive' },
    'Pharm_Quiz_2': { path: '/modules/Pharmacology/Pharm_Quiz_2.json', category: 'Pharmacology', subcategory: 'Comprehensive' },
    'Pharm_Quiz_3': { path: '/modules/Pharmacology/Pharm_Quiz_3.json', category: 'Pharmacology', subcategory: 'Comprehensive' },
    'Pharm_Quiz_4': { path: '/modules/Pharmacology/Pharm_Quiz_4.json', category: 'Pharmacology', subcategory: 'Comprehensive' },

    // Lab Values
    'NCLEX_Lab_Values': { path: '/modules/Lab_Values/NCLEX_Lab_Values.json', category: 'Lab_Values' },

    // Nursing Certifications
    'CCRN_Test_1_Combined_QA': { path: '/modules/Nursing_Certifications/CCRN_Test_1_Combined_QA.json', category: 'Nursing_Certifications' },
    'CCRN_Test_2_Combined_QA': { path: '/modules/Nursing_Certifications/CCRN_Test_2_Combined_QA.json', category: 'Nursing_Certifications' },
    'CCRN_Test_3_Combined_QA': { path: '/modules/Nursing_Certifications/CCRN_Test_3_Combined_QA.json', category: 'Nursing_Certifications' },

    // HESI
    'HESI_Comprehensive_Master_Categorized': { path: '/modules/HESI/HESI_Comprehensive_Master_Categorized.json', category: 'HESI' }
  };

  const filteredModules = getFilteredModules();

  // Auto-start if module specified in URL
  if (moduleParam && filteredModules[moduleParam]) {
    startQuiz(moduleParam, 'full', prettifyModuleName(moduleParam));
    return;
  }

  // Populate module selector
  if (moduleSel) {
    moduleSel.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- Select a Module --';
    moduleSel.appendChild(defaultOpt);

    Object.keys(filteredModules).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = prettifyModuleName(key);
      moduleSel.appendChild(opt);
    });
  }

  // Length button handlers
  attachLengthButtonHandlers();
}

function attachLengthButtonHandlers() {
  if (!lengthBtns) return;

  const buttons = lengthBtns.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function getSelectedLength() {
  if (!lengthBtns) return 'full';
  const activeBtn = lengthBtns.querySelector('button.active');
  return activeBtn?.dataset.len || 'full';
}

/* ---------- Start Quiz ---------- */
async function startQuiz(moduleName, length, displayName, questions = null, skipShuffle = false, showLauncher = true) {
  run.bank = moduleName;
  run.displayName = displayName || prettifyModuleName(moduleName);

  let rawQuestions = questions;

  if (!rawQuestions) {
    const moduleInfo = MODULES[moduleName];
    if (!moduleInfo) {
      console.error('Module not found:', moduleName);
      return;
    }

    try {
      const response = await fetch(moduleInfo.path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      rawQuestions = await response.json();
    } catch (e) {
      console.error('Failed to load module:', e);
      alert('Failed to load quiz module. Please try again.');
      return;
    }
  }

  // Handle nested structure (questions might be in a 'questions' property)
  if (rawQuestions.questions && Array.isArray(rawQuestions.questions)) {
    rawQuestions = rawQuestions.questions;
  }

  // Normalize questions
  const normalized = normalizeQuestions(rawQuestions);

  // Apply length limit
  const lengthMap = { '10': 10, '25': 25, '50': 50, 'full': normalized.length };
  const limit = lengthMap[length] || normalized.length;

  // Shuffle and limit
  let pool = skipShuffle ? normalized : shuffleArray(normalized);
  pool = pool.slice(0, limit);

  // Shuffle options within each question
  if (!skipShuffle) {
    pool = pool.map(q => shuffleQuestionOptions(q));
  }

  run.masterPool = pool;
  run.order = pool.slice();
  run.i = 0;
  run.answered = new Map();
  run.firstTry = new Map();
  run.wrongSinceLast = [];
  run.uniqueSeen = new Set();
  run.totalQuestionsAnswered = 0;

  // Update page title
  document.title = run.displayName ?
    `${run.displayName} - Nurse Success Study Hub` :
    (run.bank ? `${run.bank} - Nurse Success Study Hub` : 'Quiz - Nurse Success Study Hub');

  if (launcher) launcher.classList.add('hidden');
  if (summary) summary.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  if (resetAll) resetAll.classList.remove('hidden');

  const q = currentQuestion();
  if (q) {
    run.uniqueSeen.add(q.id);
    renderQuestion(q);
    updateCounters();
  }
}

/* ---------- Submit handler ---------- */
function doSubmit() {
  if (!submitBtn) return;

  // If already submitted (Next mode), go to next question
  if (submitBtn.dataset.mode === 'next') {
    doNext();
    return;
  }

  const q = currentQuestion();
  if (!q) return;

  const userLetters = getUserLetters();
  if (userLetters.length === 0) return; // No selection

  // Mark question as submitted
  questionSubmitted = true;

  const correctLetters = (q.correctLetters || []).slice().sort();
  const isCorrect = JSON.stringify(userLetters) === JSON.stringify(correctLetters);

  recordAnswer(q, userLetters, isCorrect);

  // Handle wrong answers for re-queuing
  if (!isCorrect) {
    run.wrongSinceLast.push(q);
    if (run.wrongSinceLast.length >= run.thresholdWrong) {
      const seen = new Set();
      const uniqueBatch = [];
      for (const item of run.wrongSinceLast) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          uniqueBatch.push(item);
        }
      }
      run.wrongSinceLast = [];
      if (uniqueBatch.length) {
        run.order.splice(run.i + 1, 0, ...uniqueBatch);
      }
    }
  }

  // Show feedback
  if (feedback) {
    feedback.textContent = isCorrect ? 'Correct! Click or press Enter for next →' : 'Incorrect. Click or press Enter for next →';
    feedback.classList.remove('ok', 'bad', 'hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  // Highlight correct and wrong answers
  highlightAnswers(q, userLetters, isCorrect);

  // Show correct answer
  if (answerLine) {
    answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
    answerLine.classList.remove('hidden');
  }

  // Show rationale
  if (rationaleBox) {
    rationaleBox.textContent = q.rationale || '';
    rationaleBox.classList.remove('hidden');
  }

  // Disable inputs
  if (form) {
    form.querySelectorAll('input').forEach(i => i.disabled = true);
  }

  setActionState('next');
  scrollToBottomSmooth();
  updateCounters();
}

/* ---------- Next question handler ---------- */
function doNext() {
  scrollToQuizTop();
  const next = nextIndex();
  const q = next.q;

  if (!q) {
    return endRun();
  }

  run.uniqueSeen.add(q.id);
  run.totalQuestionsAnswered++;
  renderQuestion(q);
  updateCounters();
}

/* ---------- Reset quiz ---------- */
function resetQuiz() {
  clearSavedState();
  location.reload();
}

/* ---------- Event listeners ---------- */
if (moduleSel) {
  moduleSel.addEventListener('change', () => {
    if (startBtn) {
      startBtn.disabled = !moduleSel.value;
    }
  });
}

if (startBtn) {
  startBtn.addEventListener('click', () => {
    const moduleName = moduleSel?.value;
    if (!moduleName) {
      alert('Please select a module first.');
      return;
    }
    const length = getSelectedLength();
    startQuiz(moduleName, length, prettifyModuleName(moduleName));
  });
}

if (submitBtn) {
  // Handle both click and touch events for mobile
  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    doSubmit();
  });

  // Explicit touch handler for iOS
  submitBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    doSubmit();
  });
}

if (feedback) {
  feedback.addEventListener('click', doNext);
  feedback.addEventListener('touchend', (e) => {
    e.preventDefault();
    doNext();
  });
}

if (restartBtn2) {
  restartBtn2.addEventListener('click', resetQuiz);
}

if (resetAll) {
  resetAll.addEventListener('click', resetQuiz);
}

if (retryMissedBtn) {
  retryMissedBtn.addEventListener('click', () => {
    startRetryQuiz(lastQuizMissedQuestions);
  });
}

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  // Skip if typing in a text input
  if (isTextEditingTarget(e.target)) return;

  // Skip if modifier keys are pressed (except Shift for capitals)
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  // Skip if quiz is not visible
  if (!quiz || quiz.classList.contains('hidden')) return;

  const key = e.key.toUpperCase();

  // Handle letter keys A-E for answer selection (only before submission)
  if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
    if (!questionSubmitted) {
      toggleAnswerByLetter(key);
      e.preventDefault();
    }
    return;
  }

  // Handle Enter for Submit or Next
  if (e.key === 'Enter') {
    e.preventDefault();
    if (!questionSubmitted) {
      // Not yet submitted - try to submit
      if (submitBtn && !submitBtn.disabled) {
        doSubmit();
      }
    } else {
      // Already submitted - go to next question
      doNext();
    }
    return;
  }

  // Handle Space for Submit or Next (same as Enter)
  if (e.key === ' ') {
    e.preventDefault();
    if (!questionSubmitted) {
      if (submitBtn && !submitBtn.disabled) {
        doSubmit();
      }
    } else {
      doNext();
    }
    return;
  }
});

/* ---------- Init ---------- */
setupCategoryDisplay();
initModules();
showResumeIfAny();

// Export for potential external use
window.startQuiz = startQuiz;
window.doSubmit = doSubmit;
window.doNext = doNext;
window.resetQuiz = resetQuiz;
