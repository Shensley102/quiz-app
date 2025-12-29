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
   - First-try accuracy scoring (re-queued questions don't affect score)
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

// ========== NCLEX CATEGORY WEIGHTS ==========
// Official NCLEX-RN Test Plan category weights
const NCLEX_CATEGORY_WEIGHTS = {
  'Management of Care': 0.18,
  'Safety and Infection Control': 0.13,
  'Health Promotion and Maintenance': 0.09,
  'Psychosocial Integrity': 0.09,
  'Basic Care and Comfort': 0.09,
  'Pharmacological and Parenteral Therapies': 0.16,
  'Reduction of Risk Potential': 0.12,
  'Physiological Adaptation': 0.14
};

// ========== WEIGHTED QUESTION SELECTION ==========

/**
 * Select questions using weighted category distribution and least-asked priority
 * 
 * @param {Array} allQuestions - Full pool of questions with 'id' and 'category' properties
 * @param {number} quizLength - Desired number of questions
 * @param {boolean} isComprehensive - If true, apply NCLEX category weighting for 25/50/100
 * @param {boolean} isCategoryQuiz - If true, questions are already filtered to one category
 * @returns {Array} Selected questions
 */
function selectQuestionsWithWeighting(allQuestions, quizLength, isComprehensive, isCategoryQuiz) {
  console.log('[Quiz] selectQuestionsWithWeighting:', { 
    totalQuestions: allQuestions.length, 
    quizLength, 
    isComprehensive, 
    isCategoryQuiz 
  });
  
  // Get attempt counts from progress store
  const attemptsMap = window.StudyGuruProgress ? window.StudyGuruProgress.getAttemptsMap() : {};
  
  // Helper: Sort questions by attempts (least first), with random tiebreaker
  function sortByLeastAttempts(questions) {
    return [...questions].sort((a, b) => {
      const attemptsA = attemptsMap[a.id] || 0;
      const attemptsB = attemptsMap[b.id] || 0;
      if (attemptsA !== attemptsB) return attemptsA - attemptsB;
      return Math.random() - 0.5; // Random tiebreaker
    });
  }
  
  // Helper: Select with 1:1 ratio (half least-asked, half random)
  function selectWithRatio(questions, count) {
    if (count <= 0 || questions.length === 0) return [];
    if (questions.length <= count) return shuffleArray([...questions]);
    
    const sorted = sortByLeastAttempts(questions);
    const halfCount = Math.ceil(count / 2);
    
    // Take least-asked half
    const leastAsked = sorted.slice(0, halfCount);
    const leastAskedIds = new Set(leastAsked.map(q => q.id));
    
    // Get remaining questions for random selection
    const remaining = questions.filter(q => !leastAskedIds.has(q.id));
    const randomCount = count - leastAsked.length;
    const randomPicks = shuffleArray(remaining).slice(0, randomCount);
    
    console.log(`[Quiz] Selected ${leastAsked.length} least-asked + ${randomPicks.length} random = ${leastAsked.length + randomPicks.length} total`);
    
    return shuffleArray([...leastAsked, ...randomPicks]);
  }
  
  // ========== CASE 1: Category Quiz (single category, 1:1 ratio) ==========
  if (isCategoryQuiz) {
    console.log('[Quiz] Category quiz - using 1:1 ratio selection');
    return selectWithRatio(allQuestions, quizLength);
  }
  
  // ========== CASE 2: Comprehensive Quiz, 10 questions (100% least-asked, no weighting) ==========
  if (isComprehensive && quizLength === 10) {
    console.log('[Quiz] Comprehensive 10-question quiz - 100% least-asked, no weighting');
    const sorted = sortByLeastAttempts(allQuestions);
    return sorted.slice(0, 10);
  }
  
  // ========== CASE 3: Comprehensive Quiz, 25/50/100 (weighted by category with 1:1 ratio) ==========
  if (isComprehensive && (quizLength === 25 || quizLength === 50 || quizLength === 100)) {
    console.log('[Quiz] Comprehensive weighted quiz - applying NCLEX category weights');
    
    // Group questions by category
    const byCategory = {};
    for (const cat of Object.keys(NCLEX_CATEGORY_WEIGHTS)) {
      byCategory[cat] = allQuestions.filter(q => q.category === cat);
    }
    
    // Calculate target count per category
    const targetCounts = {};
    let totalAllocated = 0;
    
    for (const [cat, weight] of Object.entries(NCLEX_CATEGORY_WEIGHTS)) {
      const target = Math.round(quizLength * weight);
      targetCounts[cat] = target;
      totalAllocated += target;
    }
    
    // Adjust for rounding errors (add/remove from largest category)
    if (totalAllocated !== quizLength) {
      const diff = quizLength - totalAllocated;
      targetCounts['Management of Care'] += diff;
    }
    
    console.log('[Quiz] Category targets:', targetCounts);
    
    // Select from each category with 1:1 ratio
    const selected = [];
    for (const [cat, target] of Object.entries(targetCounts)) {
      const available = byCategory[cat] || [];
      const actualTarget = Math.min(target, available.length);
      
      if (actualTarget > 0) {
        const catSelection = selectWithRatio(available, actualTarget);
        selected.push(...catSelection);
        console.log(`[Quiz] ${cat}: ${catSelection.length}/${target} selected (${available.length} available)`);
      }
    }
    
    // If we're short on questions (some categories don't have enough), fill from any category
    if (selected.length < quizLength) {
      const selectedIds = new Set(selected.map(q => q.id));
      const remaining = allQuestions.filter(q => !selectedIds.has(q.id));
      const needed = quizLength - selected.length;
      const additional = selectWithRatio(remaining, needed);
      selected.push(...additional);
      console.log(`[Quiz] Added ${additional.length} additional questions to reach target`);
    }
    
    return shuffleArray(selected);
  }
  
  // ========== CASE 4: Default (non-comprehensive or 'full' length) ==========
  // Just shuffle and return all or slice to length
  console.log('[Quiz] Default selection - shuffle and slice');
  const shuffled = shuffleArray([...allQuestions]);
  
  if (quizLength && quizLength !== 'full' && !isNaN(parseInt(quizLength))) {
    const len = parseInt(quizLength);
    return shuffled.slice(0, Math.min(len, shuffled.length));
  }
  
  return shuffled;
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
  questionNumber: 0,  // Tracks total questions shown (keeps going up)
  quizLength: 0,      // Original quiz length for threshold calculation
  missedQueue: [],    // Questions waiting to be re-queued when threshold hit
};

let lastQuizMissedQuestions = [];

/**
 * Get the miss threshold percentage based on quiz length
 * @returns {number} Threshold as decimal (e.g., 0.15 for 15%)
 */
function getMissThreshold() {
  const len = run.quizLength;
  if (len <= 10) return 0.20;      // 20% for 10 questions
  if (len <= 50) return 0.15;      // 15% for 25-50 questions
  return 0.10;                      // 10% for 100+ questions
}

/**
 * Get the number of missed questions needed to trigger re-queue
 * @returns {number} Number of missed questions that triggers re-queue
 */
function getMissThresholdCount() {
  const threshold = getMissThreshold();
  return Math.ceil(run.quizLength * threshold);
}

/**
 * Check if missed threshold is reached and re-queue missed questions
 */
function checkAndRequeueMissed() {
  const thresholdCount = getMissThresholdCount();
  
  if (run.missedQueue.length >= thresholdCount) {
    console.log(`[Quiz] Miss threshold reached (${run.missedQueue.length}/${thresholdCount}). Re-queuing missed questions.`);
    
    // Add all missed questions back to the front of the queue (shuffled)
    const missedToRequeue = shuffleArray([...run.missedQueue]);
    run.queue = [...missedToRequeue, ...run.queue];
    
    // Clear the missed queue
    run.missedQueue = [];
  }
}

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
    questionNumber: run.questionNumber,
    quizLength: run.quizLength,
    missedQueue: run.missedQueue,
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
    // First check if there are missed questions waiting
    if (run.missedQueue.length > 0) {
      console.log(`[Quiz] Queue empty, re-queuing ${run.missedQueue.length} missed questions.`);
      run.queue = shuffleArray([...run.missedQueue]);
      run.missedQueue = [];
    } else {
      // No missed queue, check for remaining unmastered questions
      const remaining = getNotMastered();
      if (remaining.length === 0) return null;
      run.queue = shuffleArray(remaining);
    }
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
  // NCLEX questions use 'correct' field; other formats use 'answer' or 'correct_answer'
  // Check 'correct' first to handle NCLEX Comprehensive Master Categorized questions
  let ans = q.correct || q.answer || q.correct_answer || '';
  
  if (Array.isArray(ans)) {
    return ans.map(a => String(a).toUpperCase().trim());
  }
  
  return [String(ans).toUpperCase().trim()];
}

function renderQuestion(q) {
  if (!q) return;
  
  run.current = q;
  
  // Increment question number each time a new question is shown
  run.questionNumber++;
  
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
  
  // Add class to track single vs multi-select for CSS hover behavior
  if (form) {
    form.classList.toggle('is-multi-select', isMultiSelect);
    form.classList.toggle('is-single-select', !isMultiSelect);
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
      
      // Click handler for the div - only toggle when clicking div background
      // Not when clicking input (native) or label (native triggers input)
      div.addEventListener('click', (e) => {
        if (e.target === div) {
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
    const label = div.querySelector('label');
    if (!input || !label) return;
    
    const letter = input.value.toUpperCase();
    const isUserSelected = userLetters.includes(letter);
    const isCorrectAnswer = correctLetters.includes(letter);
    
    // Mark as answered (resets styling)
    div.classList.add('answered');
    
    // Remove any existing result icons
    const existingIcon = label.querySelector('.result-icon');
    if (existingIcon) existingIcon.remove();
    
    // Create result icon span
    const icon = document.createElement('span');
    icon.className = 'result-icon';
    
    if (isCorrectAnswer) {
      // Green checkmark for correct answers (whether user selected or not)
      icon.classList.add('correct');
      icon.textContent = '✓';
      div.classList.add('show-correct');
    } else if (isUserSelected) {
      // Red X for incorrect answers user selected
      icon.classList.add('incorrect');
      icon.textContent = '✗';
      div.classList.add('show-incorrect');
    }
    
    // Insert icon at the beginning of the label (before the letter)
    if (icon.textContent) {
      label.insertBefore(icon, label.firstChild);
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
  
  // Update Question # counter (keeps going up with each question shown)
  if (runCounter) {
    runCounter.textContent = `Question ${run.questionNumber}:`;
  }
  
  // Update Questions Remaining counter (only decreases when answered correctly)
  if (remainingCounter) {
    remainingCounter.textContent = `Questions Remaining: ${remaining}`;
  }
  
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
  
  // Track first-try correctness - this value should NEVER change once set
  // If this is first attempt, record whether it was correct
  // If this is a retry, preserve the original first-try result
  const firstTryCorrect = isFirstTry ? isCorrect : (existing?.firstTryCorrect || false);
  
  run.answered.set(q.id, {
    id: q.id,
    question: getQuestionContent(q),
    userAnswer: userLetters,
    correctAnswer: correctLetters,
    correct: isCorrect,
    firstTry: isFirstTry,
    firstTryCorrect: firstTryCorrect,  // Was it correct on the FIRST attempt?
    options: normalizeOptions(q),
    rationale: q.rationale || '',
    category: q.category || ''
  });
  
  // If incorrect, add to missed queue (will be re-queued when threshold hit)
  if (!isCorrect) {
    // Only add if not already in missed queue
    if (!run.missedQueue.find(mq => mq.id === q.id)) {
      run.missedQueue.push(q);
    }
    // Check if we need to re-queue missed questions
    checkAndRequeueMissed();
  }
  
  // Save state
  saveState();
  
  // Update UI
  if (feedback) {
    feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    feedback.classList.remove('ok','bad', 'hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  // Mark that selection has been made (for single-select hover disabling)
  if (form) form.classList.add('has-selection');

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
  
  // Update counters after answering (remaining will decrease if correct)
  updateCounters();
}

function handleNext() {
  const remaining = getNotMastered();
  
  if (remaining.length === 0) {
    finishQuiz();
  } else {
    // If queue is empty but we still have remaining questions, 
    // add any missed questions back to queue
    if (run.queue.length === 0 && run.missedQueue.length > 0) {
      console.log(`[Quiz] Queue empty, re-queuing ${run.missedQueue.length} missed questions.`);
      run.queue = shuffleArray([...run.missedQueue]);
      run.missedQueue = [];
    }
    
    const next = pickNext();
    if (next) {
      renderQuestion(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // If still no next question but remaining > 0, 
      // rebuild queue from remaining questions
      if (remaining.length > 0) {
        run.queue = shuffleArray([...remaining]);
        run.missedQueue = [];
        const retryNext = pickNext();
        if (retryNext) {
          renderQuestion(retryNext);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          finishQuiz();
        }
      } else {
        finishQuiz();
      }
    }
  }
}

/* ---------- Finish quiz ---------- */
function finishQuiz() {
  if (quiz) quiz.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (countersBox) countersBox.classList.add('hidden');
  
  // Calculate stats based on FIRST-TRY accuracy
  // Total questions = original quiz size (not number of first attempts)
  const totalQuestions = run.quizLength || run.masterPool.length;
  let firstTryCorrect = 0;
  const missed = [];
  const categoryResults = {};
  
  // Count first-try correct for each question in the quiz
  run.masterPool.forEach(q => {
    const rec = run.answered.get(q.id);
    const category = q.category || '';
    
    // Initialize category tracking
    if (category) {
      if (!categoryResults[category]) {
        categoryResults[category] = { correct: 0, total: 0 };
      }
      categoryResults[category].total++;
    }
    
    if (rec) {
      // Check if correct on FIRST try (not eventual correctness)
      if (rec.firstTryCorrect) {
        firstTryCorrect++;
        if (category) {
          categoryResults[category].correct++;
        }
      } else {
        // Missed on first try - add to missed list
        missed.push(rec);
      }
    }
  });
  
  // Save category scores to progress store (for both comprehensive AND category quizzes)
  if (window.StudyGuruProgress && Object.keys(categoryResults).length > 0) {
    for (const [category, result] of Object.entries(categoryResults)) {
      if (result.total > 0) {
        const catPct = Math.round((result.correct / result.total) * 100);
        window.StudyGuruProgress.recordCategoryScore(category, catPct);
      }
    }
    console.log('[Quiz] Category scores saved to progress store');
  }
  
  // ========== WEEKLY QUESTION COUNT ==========
  // Record completed quiz questions (quiz length, not retries)
  if (window.StudyGuruProgress) {
    window.StudyGuruProgress.recordCompletedQuiz(totalQuestions);
    console.log(`[Quiz] Recorded ${totalQuestions} completed questions to weekly count`);
    
    // Record attempts for each question in the quiz (for least-asked tracking)
    const questionIds = run.masterPool.map(q => q.id).filter(Boolean);
    window.StudyGuruProgress.recordQuizAttempts(questionIds);
    console.log(`[Quiz] Recorded attempts for ${questionIds.length} questions`);
  }
  // ========== END WEEKLY QUESTION COUNT ==========
  
  // Update legacy NCLEX stats for comprehensive quizzes only
  if (shouldUpdateNclexStats() && Object.keys(categoryResults).length > 0) {
    updateNclexStats(categoryResults);
  }
  
  // Store missed for retry
  lastQuizMissedQuestions = missed.map(m => {
    const q = run.masterPool.find(q => q.id === m.id);
    return q;
  }).filter(Boolean);
  
  // Calculate percentage: first-try correct / total questions
  const pct = totalQuestions > 0 ? Math.round((firstTryCorrect / totalQuestions) * 100) : 0;
  
  if (firstTrySummary) {
    firstTrySummary.innerHTML = `
      <div class="score-display">
        <div class="score-number">${pct}%</div>
        <div class="score-details">${firstTryCorrect} / ${totalQuestions} correct on first try</div>
      </div>
    `;
    
    // Add category breakdown for quizzes with category data
    if (Object.keys(categoryResults).length > 0) {
      let categoryHtml = '<div class="category-breakdown"><h3>Category Breakdown</h3><ul>';
      
      for (const [cat, result] of Object.entries(categoryResults)) {
        const catPct = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;
        const statusClass = catPct >= 85 ? 'good' : catPct >= 77 ? 'fair' : 'needs-work';
        categoryHtml += `<li class="${statusClass}"><span class="cat-name">${cat}</span><span class="cat-score">${result.correct}/${result.total} (${catPct}%)</span></li>`;
      }
      
      categoryHtml += '</ul></div>';
      firstTrySummary.innerHTML += categoryHtml;
    }
  }
  
  // Build review list - show ALL questions, not just missed
  if (reviewList) {
    reviewList.innerHTML = '';
    
    // Get all answered questions in order
    const allAnswered = [];
    run.masterPool.forEach((q, idx) => {
      const rec = run.answered.get(q.id);
      if (rec) {
        allAnswered.push({ ...rec, originalIndex: idx });
      }
    });
    
    if (allAnswered.length === 0) {
      reviewList.innerHTML = '<p>No questions to review.</p>';
    } else {
      allAnswered.forEach((rec, i) => {
        const div = document.createElement('div');
        div.className = 'review-item';
        
        // Add class based on whether it was correct on first try
        if (rec.firstTryCorrect) {
          div.classList.add('review-correct');
        } else {
          div.classList.add('review-incorrect');
        }
        
        const correctAnswerText = rec.correctAnswer.map(l => `${l}. ${rec.options[l] || ''}`).join(', ');
        
        div.innerHTML = `
          <div class="review-question"><strong>Q${i + 1}:</strong> ${rec.question || 'Question text unavailable'}</div>
          <div class="review-correct-answer"><strong>Correct Answer:</strong> ${correctAnswerText}</div>
          ${rec.rationale ? `<div class="review-rationale"><strong>Rationale:</strong> ${rec.rationale}</div>` : ''}
        `;
        
        reviewList.appendChild(div);
      });
    }
    
    // Show/hide retry button based on missed count
    if (missed.length === 0) {
      if (retryMissedBtn) retryMissedBtn.classList.add('hidden');
    } else {
      if (retryMissedBtn) {
        retryMissedBtn.classList.remove('hidden');
        retryMissedBtn.textContent = `Retry ${missed.length} Missed Questions`;
      }
    }
  }
  
  // Add "Return to Category" button if it doesn't exist
  let returnBtn = $('returnToCategoryBtn');
  if (!returnBtn && summary) {
    // Find the button container (where retryMissedBtn and restartBtnSummary are)
    const buttonContainer = retryMissedBtn?.parentElement || restartBtn2?.parentElement;
    if (buttonContainer) {
      returnBtn = document.createElement('a');
      returnBtn.id = 'returnToCategoryBtn';
      returnBtn.className = 'btn btn-secondary return-btn';
      buttonContainer.appendChild(returnBtn);
    }
  }
  
  // Set the return URL based on category
  if (returnBtn) {
    const backUrl = window.backUrl || '/category/NCLEX';
    const backLabel = window.backLabel || 'NCLEX Comprehensive System';
    returnBtn.href = backUrl;
    returnBtn.textContent = `← Return to ${backLabel}`;
    returnBtn.style.display = 'block';
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
  run.questionNumber = 0;  // Reset question counter for retry
  run.quizLength = run.masterPool.length;  // Set quiz length for threshold
  run.missedQueue = [];    // Reset missed queue
  
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
  run.questionNumber = 0;  // Reset question counter
  run.missedQueue = [];    // Reset missed queue
  
  // Prepare questions - ensure all have IDs
  const preparedQuestions = questions.map((q, i) => ({
    ...q,
    id: q.id || `${moduleName}-${i}`
  }));
  
  // Parse quiz length
  let targetLength = preparedQuestions.length;
  if (quizLength && quizLength !== 'full' && !isNaN(parseInt(quizLength))) {
    targetLength = parseInt(quizLength);
  }
  
  // Use weighted selection for NCLEX quizzes
  let pool;
  if (isComprehensive || isCategoryQuiz) {
    pool = selectQuestionsWithWeighting(preparedQuestions, targetLength, isComprehensive, isCategoryQuiz);
  } else {
    // Standard selection for non-NCLEX quizzes
    pool = shuffleArray([...preparedQuestions]);
    if (targetLength < pool.length) {
      pool = pool.slice(0, targetLength);
    }
  }
  
  run.masterPool = pool;
  run.quizLength = pool.length;  // Store actual quiz length for threshold calculation
  run.queue = shuffleArray([...pool]);
  run.answered = new Map();
  run.current = null;
  
  console.log(`[Quiz] Quiz length: ${run.quizLength}, Miss threshold: ${getMissThresholdCount()} questions (${Math.round(getMissThreshold() * 100)}%)`);
  
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
  run.questionNumber = state.questionNumber || 0;  // Restore question counter
  run.quizLength = state.quizLength || state.masterPool.length;  // Restore quiz length
  run.missedQueue = state.missedQueue || [];  // Restore missed queue
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
  // If the server injected a module payload, use it (no fixtures required).
  const pre = window.preloadedQuizData;
  const preQuestions = Array.isArray(pre)
    ? pre
    : (pre && (pre.questions || pre.Questions || pre.items || pre.data)) || null;

  if (preQuestions && preQuestions.length) {
    const moduleName =
      window.preloadedModuleName ||
      (pre && (pre.moduleName || pre.module || pre.module_name || pre.name)) ||
      'Quiz';

    const quizLength =
      window.quizLength ||
      (pre && (pre.quizLength || pre.quiz_length)) ||
      null;

    const isComprehensive = !!(window.isComprehensive || (pre && (pre.isComprehensive || pre.is_comprehensive)));
    const isCategoryQuiz = !!(window.isCategoryQuiz || (pre && (pre.isCategoryQuiz || pre.is_category_quiz)));

    const shouldAutoStart = !!window.autostart || !!quizLength || isComprehensive || isCategoryQuiz;

    console.log('[Quiz] Preloaded data:', {
      hasQuizData: true,
      moduleName,
      questionCount: preQuestions.length,
      quizLength,
      isComprehensive,
      isCategoryQuiz,
      autostart: window.autostart
    });

    // If we're coming from a "length picker" page (or an autostart link), go straight in.
    if (shouldAutoStart) {
      startQuiz(moduleName, preQuestions, quizLength || 'full', isComprehensive, isCategoryQuiz);
      return;
    }

    // Otherwise, keep the launcher so the user can pick a length, but lock the module.
    if (moduleSel) {
      moduleSel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = moduleName;
      opt.textContent = prettifyModuleName(moduleName);
      moduleSel.appendChild(opt);
      moduleSel.value = moduleName;
      moduleSel.disabled = true;
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

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.addEventListener('click', () => {
        const lengthBtn = lengthBtns?.querySelector('.active');
        const len = lengthBtn?.dataset.len || 'full';
        startQuiz(moduleName, preQuestions, len, isComprehensive, isCategoryQuiz);
      }, { once: true });
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        const state = loadState(moduleName);
        if (state) resumeQuiz(state);
      });
    }

    showResumeIfAny();
    updateLengthButtons();
    return;
  }

  // Otherwise show module selector (standalone / fixtures-less mode)
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
