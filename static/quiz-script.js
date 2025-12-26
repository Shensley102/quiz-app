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
   - Auto-start functionality for direct quiz links
   - Server-side preloaded quiz data support
   - Custom header display for preloaded data
   - Module selector hidden for preloaded quizzes
   - FIXED: Correct JSON path construction for offline mode
   - Dynamic length options based on question count
   - NCLEX-weighted question selection for comprehensive quizzes
   - Category-based performance tracking with localStorage
   - Enhanced summary screen with category breakdown
   - FIXED: Submit/Next button and keyboard interactions
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
const lengthSelectorContainer = $('lengthSelectorContainer');
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

/* ---------- NCLEX Category Weights ---------- */
const NCLEX_WEIGHTS = {
  'Management of Care': 0.18,
  'Safety and Infection Control': 0.13,
  'Health Promotion and Maintenance': 0.09,
  'Psychosocial Integrity': 0.09,
  'Basic Care and Comfort': 0.09,
  'Pharmacological and Parenteral Therapies': 0.16,
  'Reduction of Risk Potential': 0.12,
  'Physiological Adaptation': 0.14
};

/* ---------- Performance Stats Storage Key ---------- */
const HESI_STATS_KEY = 'hesiPerformanceStats';

/* ========== HESI PERFORMANCE STATS MODULE (PART 2) ========== */

/**
 * Load current HESI performance stats from localStorage
 * @returns {Object} Performance stats object or empty object if none exist
 */
function loadHesiStats() {
  try {
    const raw = localStorage.getItem(HESI_STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading HESI stats:', e);
    return {};
  }
}

/**
 * Save HESI performance stats to localStorage
 * @param {Object} stats - Stats object to save
 */
function saveHesiStats(stats) {
  try {
    localStorage.setItem(HESI_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving HESI stats:', e);
  }
}

/**
 * Update HESI performance stats based on quiz results
 * Only called for COMPREHENSIVE quizzes, not category quizzes
 * @param {Object} categoryResults - Object with category scores
 * @returns {Object} Updated stats object
 */
function updateHesiStats(categoryResults) {
  // Load existing stats
  const stats = loadHesiStats();
  
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
  saveHesiStats(stats);
  console.log('HESI stats updated:', stats);
  
  return stats;
}

/**
 * Clear all HESI performance stats (for testing or reset)
 */
function clearHesiStats() {
  try {
    localStorage.removeItem(HESI_STATS_KEY);
    console.log('HESI stats cleared');
  } catch (e) {
    console.error('Error clearing HESI stats:', e);
  }
}

/* ========== END HESI PERFORMANCE STATS MODULE ========== */

/* ---------- Extract category from URL path ---------- */
function getCategoryFromPath() {
  const path = window.location.pathname;
  const match = path.match(/\/(?:quiz|quiz-fill-blank)\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return null;
}

/* ---------- Extract module from URL path ---------- */
function getModuleFromPath() {
  const path = window.location.pathname;
  const match = path.match(/\/(?:quiz|quiz-fill-blank)\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return decodeURIComponent(match[2]);
  }
  return null;
}

/* ---------- Get URL parameters ---------- */
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/* ---------- Build correct JSON URL for module ---------- */
function buildModuleJsonUrl(category, moduleName) {
  if (!category || !moduleName) {
    console.error('[Quiz] Missing category or module name for JSON URL');
    return null;
  }
  return `/modules/${encodeURIComponent(category)}/${encodeURIComponent(moduleName)}.json`;
}

/* ---------- Pretty names for modules ---------- */
function prettifyModuleName(name) {
  const raw = String(name || '');
  const normalized = raw.replace(/moduele/gi, 'module').replace(/question(?!s)/gi, 'Questions').replace(/__/g, '_').trim();

  const map = {
    'Pharm_Quiz_1': 'Pharm Quiz 1',
    'Pharm_Quiz_2': 'Pharm Quiz 2',
    'Pharm_Quiz_3': 'Pharm Quiz 3',
    'Pharm_Quiz_4': 'Pharm Quiz 4',
    'Learning_Questions_Module_1_2': 'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_1_2_': 'Learning Questions Module 1 and 2',
    'Learning_Questions_Module_3_4': 'Learning Questions Module 3 and 4',
    'Learning_Questions_Module_3_4_': 'Learning Questions Module 3 and 4',
    'Module_1': 'Module 1',
    'Module_2': 'Module 2',
    'Module_3': 'Module 3',
    'Module_4': 'Module 4',
    'CCRN_Test_1_Combined_QA': 'CCRN Test 1',
    'CCRN_Test_2_Combined_QA': 'CCRN Test 2',
    'CCRN_Test_3_Combined_QA': 'CCRN Test 3',
    'HESI_Delegating': 'HESI Delegating',
    'HESI_Leadership': 'HESI Leadership',
    'Hesi_Management': 'HESI Management',
    'HESI_Comprehensive': 'HESI Comprehensive',
    'HESI_Comp_Quiz_1': 'HESI Comprehensive Quiz 1',
    'HESI_Comp_Quiz_2': 'HESI Comprehensive Quiz 2',
    'HESI_Comp_Quiz_3': 'HESI Comprehensive Quiz 3',
    'HESI_Maternity': 'HESI Maternity',
    'HESI_Adult_Health': 'HESI Adult Health',
    'HESI_Clinical_Judgment': 'HESI Clinical Judgment',
    'HESI_Comprehensive_Master_Categorized': 'HESI NCLEX Comprehensive',
    'NCLEX_Lab_Values': 'NCLEX Lab Values - Multiple Choice',
    'NCLEX_Lab_Values_Fill_In_The_Blank': 'NCLEX Lab Values - Fill in the Blank',
    'Cardiovascular_Pharm': 'Cardiovascular Drugs',
    'CNS_Psychiatric_Pharm': 'CNS & Psychiatric Drugs',
    'Anti_Infectives_Pharm': 'Anti-Infectives',
    'Endocrine_Metabolic_Pharm': 'Endocrine & Metabolic Drugs',
    'Respiratory_Pharm': 'Respiratory Drugs',
    'Gastrointestinal_Pharm': 'Gastrointestinal Drugs',
    'Pain_Management_Pharm': 'Pain Management',
    'Hematologic_Oncology_Pharm': 'Hematologic & Oncology Drugs',
    'Renal_Electrolytes_Pharm': 'Renal & Electrolyte Drugs',
    'Musculoskeletal_Pharm': 'Musculoskeletal Drugs',
    'Immunologic_Biologics_Pharm': 'Immunologic & Biologics',
    'High_Alert_Medications_Pharm': 'High-Alert Medications',
  };
  if (map[normalized]) return map[normalized];

  const m = /^(?:Pharm[_\s]+Quiz[_\s]+)(\d+)$/i.exec(normalized.replace(/_/g, ' '));
  if (m) return 'Pharm Quiz ' + m[1];

  const cleaned = normalized.replace(/_/g, ' ');
  const m2 = /^Learning\s+Questions?\s+Module\s+(\d+)\s+(\d+)$/i.exec(cleaned);
  if (m2) return 'Learning Questions Module ' + m2[1] + ' and ' + m2[2];

  const m3 = /^CCRN[_\s]+Test[_\s]+(\d+)/i.exec(normalized.replace(/_/g, ' '));
  if (m3) return 'CCRN Test ' + m3[1];

  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------- Utilities ---------- */
function escapeHTML(s=''){
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
const randomInt = (n) => Math.floor(Math.random() * n);
function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sampleQuestions(all, req){
  const a = all.slice();
  if (req === 'full' || req >= a.length) return shuffleInPlace(a);
  const k = Math.max(0, req|0);
  for (let i = 0; i < k; i++) { const j = i + randomInt(a.length - i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
}

/* ---------- NCLEX-Weighted Question Selection ---------- */
function sampleQuestionsWeighted(allQuestions, targetCount) {
  const byCategory = {};
  for (const cat of Object.keys(NCLEX_WEIGHTS)) {
    byCategory[cat] = [];
  }
  byCategory['Uncategorized'] = [];
  
  allQuestions.forEach(q => {
    const cat = q.category || 'Uncategorized';
    if (byCategory[cat]) {
      byCategory[cat].push(q);
    } else {
      byCategory['Uncategorized'].push(q);
    }
  });
  
  const targets = {};
  let totalAllocated = 0;
  
  for (const [cat, weight] of Object.entries(NCLEX_WEIGHTS)) {
    const target = Math.round(targetCount * weight);
    targets[cat] = target;
    totalAllocated += target;
  }
  
  const diff = targetCount - totalAllocated;
  if (diff !== 0) {
    targets['Management of Care'] += diff;
  }
  
  const selected = [];
  const deficits = {};
  
  for (const [cat, target] of Object.entries(targets)) {
    const available = byCategory[cat] || [];
    const shuffled = shuffleInPlace([...available]);
    
    if (shuffled.length >= target) {
      selected.push(...shuffled.slice(0, target));
    } else {
      selected.push(...shuffled);
      deficits[cat] = target - shuffled.length;
    }
  }
  
  let totalDeficit = Object.values(deficits).reduce((a, b) => a + b, 0);
  
  if (totalDeficit > 0) {
    const surplusCategories = Object.entries(targets)
      .filter(([cat, target]) => {
        const available = byCategory[cat]?.length || 0;
        const used = Math.min(available, target);
        return available > used;
      })
      .sort((a, b) => {
        const surplusA = (byCategory[a[0]]?.length || 0) - a[1];
        const surplusB = (byCategory[b[0]]?.length || 0) - b[1];
        return surplusB - surplusA;
      });
    
    for (const [cat, target] of surplusCategories) {
      if (totalDeficit <= 0) break;
      
      const available = byCategory[cat] || [];
      const alreadyUsed = Math.min(available.length, target);
      const surplus = available.length - alreadyUsed;
      
      if (surplus > 0) {
        const toTake = Math.min(surplus, totalDeficit);
        const extra = available.slice(alreadyUsed, alreadyUsed + toTake);
        selected.push(...extra);
        totalDeficit -= toTake;
      }
    }
  }
  
  return shuffleInPlace(selected);
}

function scrollToBottomSmooth() {
  requestAnimationFrame(() => { requestAnimationFrame(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }); });
}
function scrollToQuizTop() {
  if (!quiz) return;
  quiz.scrollIntoView({ behavior: 'auto', block: 'start' });
}
function isTextEditingTarget(el){
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/* ---------- Dynamic Length Options ---------- */
function updateLengthOptions(totalQuestions) {
  if (!lengthBtns || !lengthSelectorContainer) return;
  
  if (totalQuestions < 30) {
    lengthSelectorContainer.classList.add('hidden');
    lengthBtns.innerHTML = '<button class="length-btn active" data-len="full" style="display:none;">Full</button>';
    return;
  }
  
  lengthSelectorContainer.classList.remove('hidden');
  lengthBtns.innerHTML = '';
  
  if (totalQuestions >= 100) {
    const options = [
      { len: '10', text: '10 Questions' },
      { len: '25', text: '25 Questions' },
      { len: '50', text: '50 Questions' },
      { len: 'full', text: 'Full Module Question Bank' }
    ];
    
    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'length-btn' + (idx === 0 ? ' active' : '');
      btn.setAttribute('data-len', opt.len);
      btn.textContent = opt.text;
      lengthBtns.appendChild(btn);
    });
  } else {
    const halfCount = Math.round(totalQuestions / 2);
    const options = [
      { len: '10', text: '10 Questions' },
      { len: String(halfCount), text: halfCount + ' Questions' },
      { len: 'full', text: 'Full Module Question Bank' }
    ];
    
    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'length-btn' + (idx === 0 ? ' active' : '');
      btn.setAttribute('data-len', opt.len);
      btn.textContent = opt.text;
      lengthBtns.appendChild(btn);
    });
  }
  
  attachLengthButtonHandlers();
}

function attachLengthButtonHandlers() {
  if (!lengthBtns) return;
  
  lengthBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('.length-btn');
    if (!btn) return;
    lengthBtns.querySelectorAll('.length-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

/* ---------- State ---------- */
let allQuestions = [];
let currentCategory = null;
let questionSubmitted = false; // Track if current question has been submitted
let run = {
  bank: '', displayName: '', category: '', order: [], masterPool: [], i: 0,
  answered: new Map(), uniqueSeen: new Set(), thresholdWrong: 0,
  wrongSinceLast: [], totalQuestionsAnswered: 0, isFullBank: false, isRetry: false,
  isComprehensive: false, isCategoryQuiz: false,
};
let lastQuizMissedQuestions = [];

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'quizRunState_v1';
function serializeRun() {
  if (!run || !run.order?.length) return null;
  return JSON.stringify({
    bank: run.bank, displayName: run.displayName, category: run.category,
    order: run.order.map(q => ({ id:q.id, stem:q.stem, options:q.options, correctLetters:q.correctLetters, rationale:q.rationale, type:q.type, category: q.category })),
    masterPool: run.masterPool.map(q => q.id), i: run.i,
    answered: Array.from(run.answered.entries()), uniqueSeen: Array.from(run.uniqueSeen),
    thresholdWrong: run.thresholdWrong, wrongSinceLast: run.wrongSinceLast.map(q => q.id),
    totalQuestionsAnswered: run.totalQuestionsAnswered, isFullBank: run.isFullBank, isRetry: run.isRetry,
    isComprehensive: run.isComprehensive, isCategoryQuiz: run.isCategoryQuiz,
    title: pageTitle?.textContent || defaultTitle,
  });
}
function saveRunState() { try { const s = serializeRun(); if (s) localStorage.setItem(STORAGE_KEY, s); } catch {} }
function loadRunState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const qById = new Map();
    const restoredOrder = (data.order || []).map(q => {
      const qq = { id:String(q.id), stem:String(q.stem||''), options:q.options||{}, correctLetters:(q.correctLetters||[]), rationale:String(q.rationale||''), type:String(q.type||'single_select'), category: q.category || '' };
      qById.set(qq.id, qq);
      return qq;
    });
    const idToQ = (id) => qById.get(id) || null;
    const restored = {
      bank: String(data.bank||''), displayName: String(data.displayName || prettifyModuleName(data.bank || '')),
      category: String(data.category || ''),
      order: restoredOrder, masterPool: (data.masterPool||[]).map(idToQ).filter(Boolean),
      i: Math.max(0, parseInt(data.i||0,10)), answered: new Map(Array.isArray(data.answered)?data.answered:[]),
      uniqueSeen: new Set(Array.isArray(data.uniqueSeen)?data.uniqueSeen:[]),
      thresholdWrong: Math.max(1, parseInt(data.thresholdWrong||1,10)),
      wrongSinceLast: (data.wrongSinceLast||[]).map(idToQ).filter(Boolean),
      totalQuestionsAnswered: Math.max(0, parseInt(data.totalQuestionsAnswered||0,10)),
      isFullBank: Boolean(data.isFullBank), isRetry: Boolean(data.isRetry),
      isComprehensive: Boolean(data.isComprehensive), isCategoryQuiz: Boolean(data.isCategoryQuiz),
    };
    return { run: restored, title: data.title || defaultTitle };
  } catch { return null; }
}
function clearSavedState(){ try { localStorage.removeItem(STORAGE_KEY); } catch {} }
function getNotMasteredFromRun(runData) { return runData.masterPool.filter(q => !runData.answered.get(q.id)?.correct).length; }

/* ---------- HESI Performance Stats Management ---------- */
// Note: loadHesiStats, saveHesiStats, updateHesiStats are already defined above

function showResumeIfAny(){
  const s = loadRunState();
  const resumeContainer = document.getElementById('resumeContainer');
  if (!resumeContainer) return;
  if (!s || !s.run?.order?.length || !s.run?.isFullBank || s.run?.isRetry) {
    resumeContainer.classList.add('hidden');
    return;
  }
  resumeContainer.classList.remove('hidden');
  const remainingQuestions = getNotMasteredFromRun(s.run);
  const remainingCountEl = document.getElementById('remainingQuestionsCount');
  if (remainingCountEl) remainingCountEl.textContent = remainingQuestions + ' questions remaining';
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      run = s.run;
      currentCategory = run.category;
      questionSubmitted = false; // Reset submission state
      setHeaderTitle(run.displayName || run.bank || defaultTitle);
      document.title = run.displayName ? run.displayName + ' - Nurse Success Study Hub' : (run.bank ? run.bank + ' - Nurse Success Study Hub' : 'Quiz - Nurse Success Study Hub');
      const quizTitle = $('quizTitle');
      if (quizTitle) quizTitle.textContent = run.displayName || run.bank || defaultTitle;
      if (launcher) launcher.classList.add('hidden');
      if (summary) summary.classList.add('hidden');
      if (quiz) quiz.classList.remove('hidden');
      if (countersBox) countersBox.classList.remove('hidden');
      if (resetAll) resetAll.classList.remove('hidden');
      const q = currentQuestion();
      if (q) { run.uniqueSeen.add(q.id); renderQuestion(q); updateCounters(); }
    };
  }
}

/* ---------- Normalize & shuffle ---------- */
function normalizeQuestions(data){
  const arr = Array.isArray(data) ? data : (data?.questions || []);
  return arr.map(q => {
    let optionsObj = {};
    if (Array.isArray(q.options)) {
      q.options.forEach((text, idx) => { optionsObj[String.fromCharCode(65 + idx)] = String(text || ''); });
    } else if (q.options && typeof q.options === 'object') {
      optionsObj = { ...q.options };
    }
    let correctLetters = [];
    if (Array.isArray(q.correctLetters)) correctLetters = q.correctLetters.slice();
    else if (Array.isArray(q.correct)) correctLetters = q.correct.slice();
    else if (q.correctAnswer) correctLetters = [q.correctAnswer];
    else if (q.answer) correctLetters = [q.answer];
    const stemText = String(q.question || q.stem || '');
    const isSelectAll = /select all that apply/i.test(stemText);
    return {
      id: String(q.id || Math.random()), stem: stemText, options: optionsObj,
      correctLetters: correctLetters.length > 0 ? correctLetters : ['A'],
      rationale: String(q.rationale || ''),
      type: (isSelectAll || q.type === 'multiple_select' || q.type === 'multi_select') ? 'multiple_select' : 'single_select',
      category: q.category || '',
    };
  });
}
function shuffleQuestionOptions(q){
  const letters = Object.keys(q.options).sort();
  const shuffled = shuffleInPlace([...letters]);
  const newOpts = {}; const oldToNew = {};
  shuffled.forEach((oldLetter, idx) => {
    const newLetter = String.fromCharCode(65 + idx);
    oldToNew[oldLetter] = newLetter;
    newOpts[newLetter] = q.options[oldLetter];
  });
  return { ...q, options: newOpts, correctLetters: q.correctLetters.map(l => oldToNew[l] || l).sort() };
}

/* ---------- Update hover classes ---------- */
function updateHoverClasses(){
  if (!form) return;
  const hasSelection = getUserLetters().length > 0;
  const isMultiSelect = form.querySelector('input[type="checkbox"]') !== null;
  if (hasSelection && !isMultiSelect) { form.classList.add('has-selection'); form.classList.remove('is-multi-select'); }
  else if (isMultiSelect) { form.classList.add('is-multi-select'); form.classList.remove('has-selection'); }
  else { form.classList.remove('has-selection'); form.classList.remove('is-multi-select'); }
}

/* ---------- Toggle answer selection (supports deselection for radio buttons) ---------- */
function toggleAnswer(letter) {
  if (!form || questionSubmitted) return; // Block if already submitted
  
  const input = form.querySelector(`input[value="${letter}"]`);
  if (!input) return;
  
  if (input.type === 'checkbox') {
    // Checkbox: simple toggle
    input.checked = !input.checked;
  } else {
    // Radio button: toggle behavior (click same = deselect)
    if (input.checked) {
      input.checked = false;
    } else {
      input.checked = true;
    }
  }
  
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/* ---------- Render ---------- */
function renderQuestion(q){
  if (!q) return;
  
  // Reset submission state for new question
  questionSubmitted = false;
  
  const isMulti = q.type === 'multiple_select';
  const qIndexForDisplay = run.uniqueSeen.size;
  const totalForDisplay = Math.max(run.masterPool.length, qIndexForDisplay);
  
  if (progressBar && progressFill && progressLabel) {
    progressBar.classList.remove('hidden');
    const pct = (qIndexForDisplay / totalForDisplay) * 100;
    progressFill.style.width = pct + '%';
    progressLabel.textContent = `Question ${qIndexForDisplay} of ${totalForDisplay}`;
  }
  
  qText.innerHTML = escapeHTML(q.stem) + (isMulti ? '<span class="multi-hint">(Select all that apply)</span>' : '');
  
  const letters = Object.keys(q.options).sort();
  const inputType = isMulti ? 'checkbox' : 'radio';
  
  form.innerHTML = letters.map((letter, idx) => {
    const id = 'opt-' + letter;
    return `<label class="option-label" for="${id}">
      <input type="${inputType}" name="answer" id="${id}" value="${letter}" data-idx="${idx}">
      <span class="option-letter">${escapeHTML(letter)}</span>
      <span class="option-text">${escapeHTML(q.options[letter])}</span>
    </label>`;
  }).join('');
  
  // Add click handlers for option labels (for toggle behavior on radio buttons)
  form.querySelectorAll('.option-label').forEach(label => {
    label.addEventListener('click', (e) => {
      if (questionSubmitted) {
        e.preventDefault();
        return;
      }
      
      const input = label.querySelector('input');
      if (!input) return;
      
      // For radio buttons, implement toggle (deselect if already selected)
      if (input.type === 'radio' && input.checked) {
        e.preventDefault();
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
  
  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      updateHoverClasses();
      // Don't auto-focus submit for radio - let user confirm with Enter or click
    });
  });
  
  updateHoverClasses();
  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit Answer';
  submitBtn.classList.remove('hidden');
  feedback.classList.add('hidden');
  answerLine.textContent = '';
  rationaleBox.textContent = '';
  scrollToQuizTop();
}

function currentQuestion(){ return run.order[run.i] || null; }
function getUserLetters(){ return [...form.querySelectorAll('input:checked')].map(i => i.value).sort(); }

function updateCounters(){
  if (!countersBox) return;
  const seenCount = run.uniqueSeen.size;
  const totalBankSize = run.masterPool.length;
  const remaining = Math.max(0, totalBankSize - seenCount);
  
  if (runCounter) runCounter.textContent = run.totalQuestionsAnswered || 0;
  if (remainingCounter) remainingCounter.textContent = remaining;
}

function arraysEqual(a, b){ return a.length === b.length && a.every((v, i) => v === b[i]); }

/* ---------- Submit Answer ---------- */
function doSubmit(){
  if (questionSubmitted) return; // Already submitted
  
  const q = currentQuestion();
  if (!q) return;
  const sel = getUserLetters();
  if (!sel.length) { alert('Please select an answer.'); return; }
  
  // Mark as submitted
  questionSubmitted = true;
  
  const correct = arraysEqual(sel, q.correctLetters);
  const existing = run.answered.get(q.id);
  
  if (!existing) {
    run.answered.set(q.id, { q, correct, selectedLetters: sel, firstTry: true });
    run.totalQuestionsAnswered++;
  } else if (!existing.correct && correct) {
    existing.correct = true;
    run.totalQuestionsAnswered++;
  }
  
  if (!correct && !run.wrongSinceLast.some(x => x.id === q.id)) run.wrongSinceLast.push(q);
  
  form.querySelectorAll('.option-label').forEach(lbl => {
    const input = lbl.querySelector('input');
    const letter = input?.value;
    if (!letter) return;
    const isCorrect = q.correctLetters.includes(letter);
    const wasChosen = sel.includes(letter);
    lbl.classList.remove('highlight-correct', 'highlight-wrong', 'highlight-missed');
    if (isCorrect) lbl.classList.add('highlight-correct');
    else if (wasChosen && !isCorrect) lbl.classList.add('highlight-wrong');
  });
  
  const correctText = q.correctLetters.map(l => `${l}. ${q.options[l] || ''}`).join(', ');
  answerLine.innerHTML = `<strong>Correct answer:</strong> ${escapeHTML(correctText)}`;
  
  if (q.rationale) rationaleBox.innerHTML = `<strong>Rationale:</strong> ${escapeHTML(q.rationale)}`;
  else rationaleBox.textContent = '';
  
  feedback.textContent = correct ? '✓ Correct! Click or press Enter for next question →' : '✗ Incorrect. Click or press Enter for next question →';
  feedback.className = 'feedback ' + (correct ? 'correct' : 'wrong');
  feedback.classList.remove('hidden');
  
  submitBtn.classList.add('hidden');
  updateCounters();
  saveRunState();
  scrollToBottomSmooth();
}

/* ---------- Next Question ---------- */
function doNext(){
  if (!questionSubmitted) return; // Can only advance after submission
  
  if (run.i + 1 >= run.order.length) {
    if (run.wrongSinceLast.length >= run.thresholdWrong) {
      const toReinject = run.wrongSinceLast.splice(0, run.wrongSinceLast.length);
      shuffleInPlace(toReinject);
      run.order.push(...toReinject);
    }
  }
  
  run.i++;
  const q = currentQuestion();
  
  if (!q) {
    clearSavedState();
    finishQuiz();
    return;
  }
  
  run.uniqueSeen.add(q.id);
  renderQuestion(shuffleQuestionOptions(q));
  updateCounters();
  saveRunState();
}

/* ---------- Quiz Completion ---------- */
function finishQuiz(){
  if (quiz) quiz.classList.add('hidden');
  if (countersBox) countersBox.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (resetAll) resetAll.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');
  
  let firstTryCorrect = 0, firstTryTotal = 0;
  const missed = [];
  const categoryResults = {};
  
  run.masterPool.forEach(q => {
    const rec = run.answered.get(q.id);
    if (rec && rec.firstTry) {
      firstTryTotal++;
      
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
  
  lastQuizMissedQuestions = missed.map(m => m.q);
  const pct = firstTryTotal > 0 ? Math.round((firstTryCorrect / firstTryTotal) * 100) : 0;
  
  if (run.isComprehensive && !run.isCategoryQuiz && Object.keys(categoryResults).length > 0) {
    updateHesiStats(categoryResults);
  }
  
  if (firstTrySummary) {
    firstTrySummary.innerHTML = `
      <div class="summary-score">
        <div class="score-circle ${pct >= 75 ? 'green' : pct >= 60 ? 'yellow' : 'red'}">
          <span class="score-number">${pct}%</span>
        </div>
        <div class="score-details">
          <p><strong>${firstTryCorrect}</strong> of <strong>${firstTryTotal}</strong> correct on first try</p>
          <p class="score-message">${pct >= 85 ? 'Excellent work! 🎉' : pct >= 75 ? 'Great job! Keep it up! 👍' : pct >= 60 ? 'Good effort! Review the missed questions. 📚' : 'Keep practicing! Review the rationales carefully. 💪'}</p>
        </div>
      </div>
    `;
    
    if (run.isComprehensive && Object.keys(categoryResults).length > 0) {
      const categoryBreakdownHTML = buildCategoryBreakdown(categoryResults);
      firstTrySummary.innerHTML += categoryBreakdownHTML;
    }
  }
  
  if (retryMissedBtn) {
    if (missed.length > 0) {
      retryMissedBtn.classList.remove('hidden');
      retryMissedBtn.textContent = `Retry ${missed.length} Missed Question${missed.length > 1 ? 's' : ''}`;
    } else {
      retryMissedBtn.classList.add('hidden');
    }
  }
  
  if (reviewList) {
    if (missed.length > 0) {
      reviewList.innerHTML = '<h3>Questions to Review</h3>' + missed.map((rec, idx) => {
        const q = rec.q;
        const correctText = q.correctLetters.map(l => `${l}. ${q.options[l] || ''}`).join(', ');
        const selectedText = rec.selectedLetters.map(l => `${l}. ${q.options[l] || ''}`).join(', ');
        return `
          <div class="review-item">
            <div class="review-question"><strong>${idx + 1}.</strong> ${escapeHTML(q.stem)}</div>
            <div class="review-your-answer wrong">Your answer: ${escapeHTML(selectedText)}</div>
            <div class="review-correct-answer">Correct: ${escapeHTML(correctText)}</div>
            ${q.rationale ? `<div class="review-rationale">${escapeHTML(q.rationale)}</div>` : ''}
            ${q.category ? `<div class="review-category"><span class="category-tag">${escapeHTML(q.category)}</span></div>` : ''}
          </div>
        `;
      }).join('');
    } else {
      reviewList.innerHTML = '<p class="all-correct">🎉 Perfect score! No questions to review.</p>';
    }
  }
  
  scrollToQuizTop();
}

/* ---------- Category Breakdown for HESI Comprehensive ---------- */
function buildCategoryBreakdown(categoryResults) {
  const sortedCategories = Object.entries(categoryResults)
    .sort((a, b) => {
      const weightA = NCLEX_WEIGHTS[a[0]] || 0;
      const weightB = NCLEX_WEIGHTS[b[0]] || 0;
      return weightB - weightA;
    });
  
  let html = '<div class="category-breakdown">';
  html += '<h3>📊 Performance by NCLEX Category</h3>';
  html += '<div class="category-results">';
  
  sortedCategories.forEach(([category, result]) => {
    const pct = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;
    const colorClass = pct >= 75 ? 'green' : pct >= 60 ? 'yellow' : 'red';
    const weight = NCLEX_WEIGHTS[category] || 0;
    const needsWork = pct < 70;
    
    html += `
      <div class="category-result-item ${needsWork ? 'needs-work' : ''}">
        <div class="category-result-header">
          <span class="category-name">${escapeHTML(category)}</span>
          <span class="category-weight">${Math.round(weight * 100)}% NCLEX</span>
        </div>
        <div class="category-result-bar">
          <div class="category-bar-fill ${colorClass}" style="width: ${pct}%"></div>
        </div>
        <div class="category-result-stats">
          <span class="category-score ${colorClass}">${pct}%</span>
          <span class="category-count">${result.correct}/${result.total}</span>
        </div>
        ${needsWork ? `<a href="/category/HESI/category/${encodeURIComponent(category)}" class="practice-weak-btn">Practice this category →</a>` : ''}
      </div>
    `;
  });
  
  html += '</div></div>';
  
  const weakAreas = sortedCategories.filter(([cat, res]) => {
    const pct = res.total > 0 ? Math.round((res.correct / res.total) * 100) : 0;
    return pct < 70;
  });
  
  if (weakAreas.length > 0) {
    html += `
      <div class="weak-areas-prompt">
        <h4>⚠️ Areas Needing Attention</h4>
        <p>You scored below 70% in ${weakAreas.length} categor${weakAreas.length > 1 ? 'ies' : 'y'}. Consider practicing these areas:</p>
        <div class="weak-areas-list">
          ${weakAreas.map(([cat]) => `<a href="/category/HESI/category/${encodeURIComponent(cat)}" class="weak-area-link">${escapeHTML(cat)}</a>`).join('')}
        </div>
      </div>
    `;
  }
  
  return html;
}

/* ---------- Retry Missed Questions ---------- */
function startRetryMissed(){
  if (lastQuizMissedQuestions.length === 0) return;
  
  const questionsToRetry = lastQuizMissedQuestions.map(q => ({ ...q }));
  shuffleInPlace(questionsToRetry);
  
  run = {
    bank: run.bank, displayName: run.displayName + ' (Retry)', category: run.category,
    order: questionsToRetry.slice(), masterPool: questionsToRetry.slice(),
    i: 0, answered: new Map(), uniqueSeen: new Set(),
    thresholdWrong: Math.max(1, Math.ceil(questionsToRetry.length / 3)),
    wrongSinceLast: [], totalQuestionsAnswered: 0, isFullBank: false, isRetry: true,
    isComprehensive: false, isCategoryQuiz: false,
  };
  
  lastQuizMissedQuestions = [];
  questionSubmitted = false; // Reset submission state
  
  if (summary) summary.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  if (resetAll) resetAll.classList.remove('hidden');
  
  const q = currentQuestion();
  if (q) {
    run.uniqueSeen.add(q.id);
    renderQuestion(shuffleQuestionOptions(q));
    updateCounters();
    saveRunState();
  }
}

/* ---------- Start Quiz ---------- */
async function startQuiz(moduleName, length, displayName, preloadedData, isComprehensive = false, isCategoryQuiz = false){
  currentCategory = getCategoryFromPath() || getUrlParam('category') || 'HESI';
  questionSubmitted = false; // Reset submission state
  
  let questions;
  
  if (preloadedData) {
    questions = normalizeQuestions(preloadedData);
  } else {
    const jsonUrl = buildModuleJsonUrl(currentCategory, moduleName);
    if (!jsonUrl) {
      alert('Error: Could not determine module location.');
      return;
    }
    
    try {
      const resp = await fetch(jsonUrl);
      if (!resp.ok) throw new Error('Failed to load quiz data: ' + resp.status);
      const data = await resp.json();
      questions = normalizeQuestions(data);
    } catch (e) {
      console.error('Failed to load quiz:', e);
      alert('Failed to load quiz. Please try again.');
      return;
    }
  }
  
  if (!questions || questions.length === 0) {
    alert('No questions found in this module.');
    return;
  }
  
  allQuestions = questions;
  
  let selectedQuestions;
  const numLength = length === 'full' ? questions.length : parseInt(length, 10);
  
  if (isComprehensive && numLength >= 25) {
    selectedQuestions = sampleQuestionsWeighted(questions, numLength);
  } else {
    selectedQuestions = sampleQuestions(questions, numLength);
  }
  
  const isFullBank = length === 'full' || numLength >= questions.length;
  
  run = {
    bank: moduleName, displayName: displayName || prettifyModuleName(moduleName),
    category: currentCategory,
    order: selectedQuestions.map(q => shuffleQuestionOptions(q)),
    masterPool: selectedQuestions.slice(),
    i: 0, answered: new Map(), uniqueSeen: new Set(),
    thresholdWrong: Math.max(1, Math.ceil(selectedQuestions.length / 3)),
    wrongSinceLast: [], totalQuestionsAnswered: 0, isFullBank, isRetry: false,
    isComprehensive, isCategoryQuiz,
  };
  
  lastQuizMissedQuestions = [];
  
  setHeaderTitle(run.displayName);
  document.title = run.displayName + ' - Nurse Success Study Hub';
  const quizTitle = $('quizTitle');
  if (quizTitle) quizTitle.textContent = run.displayName;
  
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
    if (isFullBank) saveRunState();
  }
}

/* ---------- Reset Quiz ---------- */
function resetQuiz(){
  if (!confirm('Are you sure you want to reset and start over?')) return;
  clearSavedState();
  questionSubmitted = false; // Reset submission state
  
  if (quiz) quiz.classList.add('hidden');
  if (summary) summary.classList.add('hidden');
  if (countersBox) countersBox.classList.add('hidden');
  if (progressBar) progressBar.classList.add('hidden');
  if (resetAll) resetAll.classList.add('hidden');
  
  if (launcher) launcher.classList.remove('hidden');
  showResumeIfAny();
  
  setHeaderTitle(defaultTitle);
  document.title = 'Quiz - Nurse Success Study Hub';
}

/* ---------- Initialize ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const preloadedData = window.PRELOADED_QUIZ_DATA || null;
  const preloadedModule = window.PRELOADED_MODULE_NAME || null;
  const autoStart = window.AUTO_START_QUIZ || false;
  const isComprehensive = window.IS_COMPREHENSIVE || false;
  const isCategoryQuiz = window.IS_CATEGORY_QUIZ || false;
  
  const urlQuizLength = getUrlParam('quiz_length');
  
  if (preloadedData && preloadedData.questions) {
    const questionCount = preloadedData.questions.length;
    updateLengthOptions(questionCount);
    
    const moduleSelector = $('moduleSelector');
    if (moduleSelector) moduleSelector.classList.add('hidden');
    
    const displayName = window.CUSTOM_HEADER_TITLE || prettifyModuleName(preloadedModule);
    setHeaderTitle(displayName);
    
    if (autoStart || urlQuizLength) {
      const length = urlQuizLength || 'full';
      startQuiz(preloadedModule, length, displayName, preloadedData, isComprehensive, isCategoryQuiz);
      return;
    }
  }
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const activeLen = lengthBtns?.querySelector('.length-btn.active');
      const length = activeLen?.dataset?.len || 'full';
      
      if (preloadedData) {
        const displayName = window.CUSTOM_HEADER_TITLE || prettifyModuleName(preloadedModule);
        startQuiz(preloadedModule, length, displayName, preloadedData, isComprehensive, isCategoryQuiz);
      } else if (moduleSel) {
        const moduleName = moduleSel.value;
        if (!moduleName) {
          alert('Please select a module.');
          return;
        }
        startQuiz(moduleName, length, prettifyModuleName(moduleName), null, false, false);
      }
    });
  }
  
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      doSubmit();
    });
  }
  
  if (feedback) {
    feedback.addEventListener('click', doNext);
  }
  
  if (restartBtn2) {
    restartBtn2.addEventListener('click', resetQuiz);
  }
  if (resetAll) {
    resetAll.addEventListener('click', resetQuiz);
  }
  
  if (retryMissedBtn) {
    retryMissedBtn.addEventListener('click', startRetryMissed);
  }
  
  // Global keyboard handler
  document.addEventListener('keydown', (e) => {
    // Skip if typing in an input field
    if (isTextEditingTarget(e.target)) return;
    
    // Skip if modifier keys are pressed (except Shift for capital letters)
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    
    const key = e.key.toUpperCase();
    
    // Handle letter keys A-E for answer selection
    if (['A', 'B', 'C', 'D', 'E'].includes(key)) {
      // Only allow selection if quiz is visible and question not yet submitted
      if (quiz && !quiz.classList.contains('hidden') && !questionSubmitted) {
        toggleAnswer(key);
        e.preventDefault();
      }
      return;
    }
    
    // Handle Enter and Space for Submit/Next
    if (e.key === 'Enter' || e.key === ' ') {
      // Prevent default scrolling for Space
      if (e.key === ' ') {
        e.preventDefault();
      }
      
      // Check if quiz interface is active
      if (!quiz || quiz.classList.contains('hidden')) return;
      
      if (!questionSubmitted) {
        // Question not yet submitted - try to submit
        if (submitBtn && !submitBtn.classList.contains('hidden') && !submitBtn.disabled) {
          doSubmit();
          e.preventDefault();
        }
      } else {
        // Question already submitted - advance to next
        if (feedback && !feedback.classList.contains('hidden')) {
          doNext();
          e.preventDefault();
        }
      }
    }
  });
  
  attachLengthButtonHandlers();
  showResumeIfAny();
});

window.startQuiz = startQuiz;
window.doSubmit = doSubmit;
window.doNext = doNext;
window.resetQuiz = resetQuiz;
