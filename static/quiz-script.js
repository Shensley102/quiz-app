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
   - Subcategory filtering for grouped modules
   - Retry missed questions feature
   - NCLEX Comprehensive weighted quiz support
   - NCLEX Performance Stats tracking
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

/*
 * Extract a human‑readable question prompt from a quiz object. The NCLEX data
 * sometimes uses different property names (e.g. `stem` or `prompt`) instead
 * of the `question` or `text` fields expected by the existing code. When
 * neither `question` nor `text` is present this helper iterates over a list of
 * potential keys and falls back to the first non‑empty string found.
 *
 * @param {Object} q The question object
 * @returns {String} A string representing the question text
 */
function getQuestionContent(q) {
  if (!q || typeof q !== 'object') return '';
  // Preferred keys in order of precedence
  const preferred = ['question', 'text', 'stem', 'prompt', 'description', 'question_text', 'title'];
  for (const key of preferred) {
    if (q[key]) return String(q[key]);
  }
  // Fallback: return the first non‑empty string property that isn't clearly an answer, options or metadata
  const exclude = new Set(['answer', 'correct_answer', 'options', 'category', 'rationale', 'id']);
  for (const [k, v] of Object.entries(q)) {
    if (!exclude.has(k) && typeof v === 'string' && v.trim()) {
      return v;
    }
  }
  return '';
}

// ========== NCLEX PERFORMANCE STATS MODULE ==========

const NCLEX_STATS_KEY = 'nclexPerformanceStats';

/**
 * Load current NCLEX performance stats from localStorage
 * @returns {Object} Performance stats object or empty object if none exist
 */
function loadNclexStats() {
  try {
    const raw = localStorage.getItem(NCLEX_STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading NCLEX stats:', e);
    return {};
  }
}

/**
 * Save NCLEX performance stats to localStorage
 * @param {Object} stats - Stats object to save
 */
function saveNclexStats(stats) {
  try {
    localStorage.setItem(NCLEX_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving NCLEX stats:', e);
  }
}

/**
 * Update NCLEX performance stats based on quiz results
 * Only called for COMPREHENSIVE quizzes, not category quizzes
 * @param {Object} categoryResults - Object with category scores
 * @returns {Object} Updated stats object
 */
function updateNclexStats(categoryResults) {
  // Load existing stats
  const stats = loadNclexStats();
  
  // Update each category
  for (const [category, result] of Object.entries(categoryResults)) {
    if (!stats[category]) {
      stats[category] = {
        totalAnswered: 0,
        totalCorrect: 0,
        lastUpdated: null
      };
    }
    
    // Add to running totals
    stats[category].totalAnswered += result.total;
    stats[category].totalCorrect += result.correct;
    stats[category].lastUpdated = new Date().toISOString();
  }
  
  // Save updated stats
  saveNclexStats(stats);
  console.log('NCLEX stats updated:', stats);
  
  return stats;
}

/**
 * Clear all NCLEX performance stats (for testing or reset)
 */
function clearNclexStats() {
  try {
    localStorage.removeItem(NCLEX_STATS_KEY);
    console.log('NCLEX stats cleared');
  } catch (e) {
    console.error('Error clearing NCLEX stats:', e);
  }
}

/**
 * Check if this quiz should update NCLEX stats
 * Only comprehensive quizzes (not category-specific) should update stats
 */
function shouldUpdateNclexStats() {
  // Check if this is the NCLEX comprehensive master quiz
  const currentModule = run.moduleName || '';
  return currentModule === 'NCLEX_Comprehensive_Master_Categorized' && 
         run.isComprehensive === true && 
         run.isCategoryQuiz !== true;
}

// ========== END NCLEX PERFORMANCE STATS MODULE ==========


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

/* ---------- Pretty names for modules ---------- */
function prettifyModuleName(name) {
  const raw = String(name || '');

  const normalized = raw
    .replace(/moduele/gi, 'module')
    .replace(/question(?:s)?[-_\s]?bank/gi, '')
    .replace(/[-_]/g, ' ')
    .replace(/\.json$/i, '')
    .trim();

  const titled = normalized
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return titled
    .replace(/\bNclex\b/gi, 'NCLEX')
    .replace(/\bHesi\b/gi, 'HESI')
    .replace(/\bCcrn\b/gi, 'CCRN')
    .replace(/\bPccn\b/gi, 'PCCN')
    .replace(/\bCmsrn\b/gi, 'CMSRN')
    .replace(/\bRn\b/gi, 'RN')
    .replace(/\bLpn\b/gi, 'LPN')
    .replace(/\bIcu\b/gi, 'ICU')
    .replace(/\bEr\b/gi, 'ER')
    .replace(/\bEkg\b/gi, 'EKG')
    .replace(/\bEcg\b/gi, 'ECG')
    .replace(/\bIv\b/gi, 'IV')
    .replace(/\bCpr\b/gi, 'CPR')
    .replace(/\bBls\b/gi, 'BLS')
    .replace(/\bAcls\b/gi, 'ACLS')
    .replace(/\bPals\b/gi, 'PALS')
    .replace(/\bAdn\b/gi, 'ADN')
    .replace(/\bBsn\b/gi, 'BSN')
    .replace(/\bMsn\b/gi, 'MSN')
    .replace(/\bDnp\b/gi, 'DNP')
    .replace(/\bPhd\b/gi, 'PhD')
    .replace(/\bOb\b/gi, 'OB')
    .replace(/\bGyn\b/gi, 'GYN')
    .replace(/\bPt\b/gi, 'PT')
    .replace(/\bOt\b/gi, 'OT')
    .replace(/\bCna\b/gi, 'CNA')
    .replace(/\bMa\b/gi, 'MA')
    .replace(/\bLvn\b/gi, 'LVN')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- Module registry with paths ---------- */
const MODULE_REGISTRY = {
  // NCLEX Comprehensive (formerly HESI)
  'NCLEX_Comprehensive_Master_Categorized': '/modules/NCLEX/NCLEX_Comprehensive_Master_Categorized.json',
  
  // Lab Values
  'Lab_Values_Fishbone': '/modules/Lab_Values/Lab_Values_Fishbone.json',
  'Lab_Values_Module': '/modules/Lab_Values/Lab_Values_Module.json',
  
  // Patient Care Management
  'Patient_Care_Management_Learning_Questions_Module_1': '/modules/Patient_Care_Management/Patient_Care_Management_Learning_Questions_Module_1.json',
  'Patient_Care_Management_Learning_Questions_Module_2': '/modules/Patient_Care_Management/Patient_Care_Management_Learning_Questions_Module_2.json',
  'Patient_Care_Management_Learning_Questions_Module_3_4': '/modules/Patient_Care_Management/Patient_Care_Management_Learning_Questions_Module_3_4.json',
  
  // Pharmacology
  'Pharmacology_Comprehensive': '/modules/Pharmacology/Pharmacology_Comprehensive.json',
  'Pharmacology_Cardiac_Drugs': '/modules/Pharmacology/Pharmacology_Cardiac_Drugs.json',
  'Pharmacology_Respiratory_Drugs': '/modules/Pharmacology/Pharmacology_Respiratory_Drugs.json',
  'Pharmacology_GI_Drugs': '/modules/Pharmacology/Pharmacology_GI_Drugs.json',
  'Pharmacology_Endocrine_Drugs': '/modules/Pharmacology/Pharmacology_Endocrine_Drugs.json',
  'Pharmacology_Neuro_Drugs': '/modules/Pharmacology/Pharmacology_Neuro_Drugs.json',
  'Pharmacology_Antibiotics': '/modules/Pharmacology/Pharmacology_Antibiotics.json',
  'Pharmacology_Pain_Management': '/modules/Pharmacology/Pharmacology_Pain_Management.json',
  'Pharmacology_Psych_Drugs': '/modules/Pharmacology/Pharmacology_Psych_Drugs.json',
  'Pharmacology_Immune_Drugs': '/modules/Pharmacology/Pharmacology_Immune_Drugs.json',
  'Pharmacology_Blood_Drugs': '/modules/Pharmacology/Pharmacology_Blood_Drugs.json',
  
  // Nursing Certifications
  'CCRN_Module': '/modules/Nursing_Certifications/CCRN/CCRN_Module.json',
  'PCCN_Module': '/modules/Nursing_Certifications/PCCN/PCCN_Module.json',
  'CMSRN_Module': '/modules/Nursing_Certifications/CMSRN/CMSRN_Module.json',
};

/* ---------- State ---------- */
let run = {
  moduleName: '',
  masterPool: [],
  queue: [],
  answered: new Map(),
  current: null,
  isRetry: false,
  isComprehensive: false,
  isCategoryQuiz: false,
};

let lastQuizMissedQuestions = [];

/* ---------- Utility functions ---------- */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getStorageKey(moduleName) {
  return `quiz_state_${moduleName}`;
}

function clearSavedState() {
  if (run.moduleName) {
    localStorage.removeItem(getStorageKey(run.moduleName));
  }
}

function saveState() {
  if (!run.moduleName || run.queue.length === 0) return;
  
  const state = {
    moduleName: run.moduleName,
    masterPool: run.masterPool,
    queue: run.queue,
    answered: Array.from(run.answered.entries()),
    isComprehensive: run.isComprehensive,
    isCategoryQuiz: run.isCategoryQuiz,
    savedAt: Date.now()
  };
  
  try {
    localStorage.setItem(getStorageKey(run.moduleName), JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

function loadState(moduleName) {
  try {
    const raw = localStorage.getItem(getStorageKey(moduleName));
    if (!raw) return null;
    
    const state = JSON.parse(raw);
    
    // Validate state
    if (!state.masterPool || !state.queue || !state.answered) return null;
    
    return state;
  } catch (e) {
    console.error('Failed to load state:', e);
    return null;
  }
}

/* ---------- Question handling ---------- */
function getNotMastered() {
  return run.masterPool.filter(q => {
    const rec = run.answered.get(q.id);
    return !rec || !rec.correct;
  });
}

function pickNext() {
  if (run.queue.length === 0) {
    const remaining = getNotMastered();
    if (remaining.length === 0) return null;
    run.queue = shuffleArray(remaining);
  }
  return run.queue.shift();
}

function normalizeOptions(q) {
  if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
    // Already in {A: "...", B: "..."} format
    return q.options;
  }
  
  if (Array.isArray(q.options)) {
    const opts = {};
    q.options.forEach((opt, i) => {
      opts[String.fromCharCode(65 + i)] = opt;
    });
    return opts;
  }
  
  return {};
}

function normalizeAnswer(q) {
  let ans = q.answer || q.correct_answer || '';
  
  if (Array.isArray(ans)) {
    return ans.map(a => String(a).toUpperCase().trim());
  }
  
  return [String(ans).toUpperCase().trim()];
}

function renderQuestion(q) {
  if (!q) return;
  
  run.current = q;
  
  // Update question text.  Use getQuestionContent() to support NCLEX
  // questions which may define their prompt under keys such as `stem` or
  // `prompt` instead of the `question`/`text` fields. This fallback
  // ensures that the question text is always visible instead of
  // displaying a blank area with only answer options.
  if (qText) {
    const content = getQuestionContent(q);
    qText.innerHTML = content || '';
  }
  
  // Build options
  const opts = normalizeOptions(q);
  const correctAnswers = normalizeAnswer(q);
  const isMultiSelect = correctAnswers.length > 1;
  
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
      
      // Click handler for the div
      div.addEventListener('click', (e) => {
        if (e.target !== input) {
          input.checked = !input.checked;
          onSelectionChanged();
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
}

function getSelectedAnswers() {
  if (!form) return [];
  
  const inputs = form.querySelectorAll('input:checked');
  return Array.from(inputs).map(i => i.value.toUpperCase());
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

function formatCorrectAnswers(q) {
  const opts = normalizeOptions(q);
  const correct = normalizeAnswer(q);
  
  return correct.map(letter => {
    const text = opts[letter] || '';
    return `<strong>${letter}.</strong> ${text}`;
  }).join('<br>');
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

function scrollToBottomSmooth() {
  setTimeout(() => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
  }, 100);
}

function updateCounters() {
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;
  const answered = run.answered.size;
  
  if (runCounter) runCounter.textContent = answered;
  if (remainingCounter) remainingCounter.textContent = remaining;
  
  if (countersBox) {
    countersBox.classList.toggle('hidden', total === 0);
  }
}

/* ---------- Submit / Next handling ---------- */
if (submitBtn) {
  submitBtn.addEventListener('click', () => {
    const mode = submitBtn.dataset.mode;
    
    if (mode === 'submit') {
      handleSubmit();
    } else {
      handleNext();
    }
  });
}

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
  const isFirstTry = !existing;
  
  run.answered.set(q.id, {
    id: q.id,
    question: q.question || q.text,
    userAnswer: userLetters,
    correctAnswer: correctLetters,
    correct: isCorrect,
    firstTry: isFirstTry,
    options: normalizeOptions(q),
    rationale: q.rationale || '',
    category: q.category || ''
  });
  
  // Save state
  saveState();
  
  // Update UI
  if (feedback) {
    feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    feedback.classList.remove('ok','bad', 'hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  // Highlight correct and wrong answers in the options
  highlightAnswers(q, userLetters, isCorrect);

  // Always show the correct answer
  if (answerLine) {
    answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formatCorrectAnswers(q)}`;
    answerLine.classList.remove('hidden');
  }
  
  if (rationaleBox) {
    rationaleBox.textContent = q.rationale || '';
    rationaleBox.classList.remove('hidden');
  }

  if (form) {
    form.querySelectorAll('input').forEach(i => i.disabled = true);
  }
  
  setActionState('next');

  scrollToBottomSmooth();
  updateCounters();
}

function handleNext() {
  const remaining = getNotMastered();
  
  if (remaining.length === 0) {
    finishQuiz();
  } else {
    const next = pickNext();
    if (next) {
      renderQuestion(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      finishQuiz();
    }
  }
}

/* ---------- Finish quiz ---------- */
function finishQuiz() {
  if (quiz) quiz.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (countersBox) countersBox.classList.add('hidden');
  
  // Calculate stats
  let firstTryCorrect = 0;
  let firstTryTotal = 0;
  const missed = [];
  const categoryResults = {};
  
  run.masterPool.forEach(q => {
    const rec = run.answered.get(q.id);
    if (rec && rec.firstTry) {
      firstTryTotal++;
      
      // Track category results for comprehensive quizzes
      if (run.isComprehensive && q.category) {
        if (!categoryResults[q.category]) {
          categoryResults[q.category] = { correct: 0, total: 0 };
        }
        categoryResults[q.category].total++;
        
        if (rec.correct) {
          firstTryCorrect++;
          categoryResults[q.category].correct++;
        } else {
          missed.push(rec);
        }
      } else {
        if (rec.correct) firstTryCorrect++;
        else missed.push(rec);
      }
    }
  });
  
  // Update NCLEX stats for comprehensive quizzes (not category quizzes)
  if (shouldUpdateNclexStats() && Object.keys(categoryResults).length > 0) {
    updateNclexStats(categoryResults);
  }
  
  // Store missed for retry
  lastQuizMissedQuestions = missed.map(m => {
    const q = run.masterPool.find(q => q.id === m.id);
    return q;
  }).filter(Boolean);
  
  // Display summary
  const pct = firstTryTotal > 0 ? Math.round((firstTryCorrect / firstTryTotal) * 100) : 0;
  
  if (firstTrySummary) {
    firstTrySummary.innerHTML = `
      <div class="score-display">
        <div class="score-number">${pct}%</div>
        <div class="score-details">${firstTryCorrect} / ${firstTryTotal} correct on first try</div>
      </div>
    `;
    
    // Add category breakdown for comprehensive quizzes
    if (run.isComprehensive && Object.keys(categoryResults).length > 0) {
      let categoryHtml = '<div class="category-breakdown"><h3>Category Breakdown</h3><ul>';
      
      for (const [cat, result] of Object.entries(categoryResults)) {
        const catPct = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;
        const statusClass = catPct >= 80 ? 'good' : catPct >= 60 ? 'fair' : 'needs-work';
        categoryHtml += `<li class="${statusClass}"><span class="cat-name">${cat}</span><span class="cat-score">${result.correct}/${result.total} (${catPct}%)</span></li>`;
      }
      
      categoryHtml += '</ul></div>';
      firstTrySummary.innerHTML += categoryHtml;
    }
  }
  
  // Build review list
  if (reviewList) {
    reviewList.innerHTML = '';
    
    if (missed.length === 0) {
      reviewList.innerHTML = '<p class="all-correct">🎉 Perfect score! All questions answered correctly on first try.</p>';
      if (retryMissedBtn) retryMissedBtn.classList.add('hidden');
    } else {
      missed.forEach((rec, i) => {
        const div = document.createElement('div');
        div.className = 'review-item';
        
        const userAnswerText = rec.userAnswer.map(l => `${l}. ${rec.options[l] || ''}`).join(', ');
        const correctAnswerText = rec.correctAnswer.map(l => `${l}. ${rec.options[l] || ''}`).join(', ');
        
        div.innerHTML = `
          <div class="review-question"><strong>Q${i + 1}:</strong> ${rec.question}</div>
          <div class="review-your-answer"><strong>Your answer:</strong> ${userAnswerText}</div>
          <div class="review-correct-answer"><strong>Correct answer:</strong> ${correctAnswerText}</div>
          ${rec.rationale ? `<div class="review-rationale"><strong>Rationale:</strong> ${rec.rationale}</div>` : ''}
        `;
        
        reviewList.appendChild(div);
      });
      
      if (retryMissedBtn) {
        retryMissedBtn.classList.remove('hidden');
        retryMissedBtn.textContent = `Retry ${missed.length} Missed Questions`;
      }
    }
  }
  
  // Clear saved state on completion
  clearSavedState();
  
  setHeaderTitle(defaultTitle);
}

/* ---------- Retry missed questions ---------- */
function startRetryQuiz(questions) {
  if (!questions || questions.length === 0) return;
  
  run.isRetry = true;
  run.masterPool = questions.map((q, i) => ({
    ...q,
    id: q.id || `retry-${i}`
  }));
  run.queue = shuffleArray([...run.masterPool]);
  run.answered = new Map();
  run.current = null;
  
  if (summary) summary.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (progressBar) progressBar.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  
  setHeaderTitle(`Retry: ${run.moduleName}`);
  
  const first = pickNext();
  if (first) renderQuestion(first);
  
  updateProgressBar();
}

/* ---------- Start quiz ---------- */
function startQuiz(moduleName, questions, quizLength, isComprehensive = false, isCategoryQuiz = false) {
  console.log('[Quiz] Starting quiz:', { moduleName, questionCount: questions.length, quizLength, isComprehensive, isCategoryQuiz });
  
  run.moduleName = moduleName;
  run.isRetry = false;
  run.isComprehensive = isComprehensive;
  run.isCategoryQuiz = isCategoryQuiz;
  
  // Prepare questions
  let pool = questions.map((q, i) => ({
    ...q,
    id: q.id || `${moduleName}-${i}`
  }));
  
  // Apply length limit if specified
  if (quizLength && quizLength !== 'full' && !isNaN(parseInt(quizLength))) {
    const len = parseInt(quizLength);
    if (len < pool.length) {
      pool = shuffleArray(pool).slice(0, len);
    }
  }
  
  run.masterPool = pool;
  run.queue = shuffleArray([...pool]);
  run.answered = new Map();
  run.current = null;
  
  // Hide launcher, show quiz
  if (launcher) launcher.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (progressBar) progressBar.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  
  setHeaderTitle(prettifyModuleName(moduleName));
  
  const first = pickNext();
  if (first) renderQuestion(first);
  
  updateProgressBar();
}

/* ---------- Resume quiz ---------- */
function resumeQuiz(state) {
  run.moduleName = state.moduleName;
  run.masterPool = state.masterPool;
  run.queue = state.queue;
  run.answered = new Map(state.answered);
  run.isComprehensive = state.isComprehensive || false;
  run.isCategoryQuiz = state.isCategoryQuiz || false;
  run.isRetry = false;
  run.current = null;
  
  if (launcher) launcher.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (progressBar) progressBar.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  
  setHeaderTitle(prettifyModuleName(run.moduleName));
  
  const next = pickNext();
  if (next) renderQuestion(next);
  
  updateProgressBar();
}

/* ---------- Show resume button ---------- */
function showResumeIfAny() {
  if (!resumeBtn || !moduleSel) return;
  
  const selected = moduleSel.value;
  if (!selected) {
    resumeBtn.classList.add('hidden');
    return;
  }
  
  const state = loadState(selected);
  if (!state) {
    resumeBtn.classList.add('hidden');
    return;
  }
  
  const remaining = state.masterPool.filter(q => {
    const answered = state.answered.find(([id]) => id === q.id);
    return !answered || !answered[1].correct;
  }).length;
  
  if (remaining > 0) {
    resumeBtn.textContent = `Resume (${remaining} remaining)`;
    resumeBtn.classList.remove('hidden');
  } else {
    resumeBtn.classList.add('hidden');
  }
}

/* ---------- Module loading ---------- */
async function loadModule(moduleName) {
  const path = MODULE_REGISTRY[moduleName];
  
  if (!path) {
    console.error('Module not found:', moduleName);
    return null;
  }
  
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return Array.isArray(data) ? data : (data.questions || []);
  } catch (e) {
    console.error('Failed to load module:', e);
    return null;
  }
}

/* ---------- Category display ---------- */
function setupCategoryDisplay() {
  const categoryDisplay = $('categoryDisplay');
  const categoryInfo = $('categoryInfo');
  
  if (categoryDisplay && window.QUIZ_CATEGORY) {
    categoryDisplay.textContent = `Category: ${window.QUIZ_CATEGORY}`;
    categoryDisplay.classList.remove('hidden');
  }
  
  if (categoryInfo && window.QUIZ_CATEGORY) {
    categoryInfo.textContent = `Practicing: ${window.QUIZ_CATEGORY}`;
    categoryInfo.classList.remove('hidden');
  }
}

/* ---------- Initialize modules ---------- */
async function initModules() {
  // Check for preloaded quiz data (from Flask template)
  if (window.preloadedQuizData && window.preloadedQuizData.questions) {
    console.log('[Quiz] Preloaded data:', {
      hasQuizData: true,
      moduleName: window.preloadedQuizData.moduleName,
      questionCount: window.preloadedQuizData.questions.length,
      quizLength: window.quizLength || window.preloadedQuizData.quizLength,
      isComprehensive: window.isComprehensive || window.preloadedQuizData.isComprehensive
    });
    
    const data = window.preloadedQuizData;
    const quizLength = window.quizLength || data.quizLength || 'full';
    const isComprehensive = window.isComprehensive || data.isComprehensive || false;
    const isCategoryQuiz = window.isCategoryQuiz || data.isCategoryQuiz || false;
    
    console.log('[Quiz] Starting with preloaded data:', {
      module: data.moduleName,
      length: quizLength,
      comprehensive: isComprehensive,
      categoryQuiz: isCategoryQuiz
    });
    
    startQuiz(data.moduleName, data.questions, quizLength, isComprehensive, isCategoryQuiz);
    return;
  }
  
  // Otherwise show module selector
  if (moduleSel) {
    moduleSel.addEventListener('change', () => {
      showResumeIfAny();
      updateLengthButtons();
    });
  }
  
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const selected = moduleSel?.value;
      if (!selected) return;
      
      const questions = await loadModule(selected);
      if (!questions || questions.length === 0) {
        alert('Failed to load questions');
        return;
      }
      
      const lengthBtn = lengthBtns?.querySelector('.active');
      const len = lengthBtn?.dataset.len || 'full';
      
      startQuiz(selected, questions, len);
    });
  }
  
  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      const selected = moduleSel?.value;
      if (!selected) return;
      
      const state = loadState(selected);
      if (state) resumeQuiz(state);
    });
  }
  
  // Length button handlers
  if (lengthBtns) {
    lengthBtns.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        lengthBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }
  
  showResumeIfAny();
  updateLengthButtons();
}

function updateLengthButtons() {
  // Show/hide length buttons based on module question count
  if (!lengthBtns || !moduleSel) return;
  
  const selected = moduleSel.value;
  if (!selected) return;
  
  // For now, show all length options
  lengthBtns.classList.remove('hidden');
}

function isTextEditingTarget(element) {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || element.isContentEditable;
}

if (resetAll) {
  resetAll.addEventListener('click', () => { clearSavedState(); location.reload(); });
}

if (restartBtn2) {
  restartBtn2.addEventListener('click', () => { location.reload(); });
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
setupCategoryDisplay();
initModules();
showResumeIfAny();
