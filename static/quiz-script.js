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

/* ---------- Extract category from URL path ---------- */
function getCategoryFromPath() {
  const path = window.location.pathname;
  // Match /quiz/{category}/{module} or /quiz-fill-blank/{category}/{module}
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
    'NCLEX_Lab_Values': 'NCLEX Lab Values - Multiple Choice',
    'NCLEX_Lab_Values_Fill_In_The_Blank': 'NCLEX Lab Values - Fill in the Blank',
    // Pharmacology Categories
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

/* ---------- Get module description ---------- */
function getModuleDescription(moduleName, category) {
  const descriptions = {
    'CCRN_Test_1_Combined_QA': 'Practice exam covering core critical care concepts including cardiovascular, respiratory, and neurological emergencies.',
    'CCRN_Test_2_Combined_QA': 'Practice exam with additional critical care scenarios focusing on multisystem organ failure and complex patient management.',
    'CCRN_Test_3_Combined_QA': 'Practice exam covering advanced topics including pharmacology, procedures, and professional caring practices.',
    'NCLEX_Lab_Values': 'Test your knowledge with NCLEX-style multiple choice questions. Each question includes detailed rationales.',
    'HESI_Comp_Quiz_1': 'Comprehensive HESI practice questions from Exit Exam and study guides.',
    'HESI_Comp_Quiz_2': 'Comprehensive HESI practice questions from Exit Exam and study guides.',
    'HESI_Comp_Quiz_3': 'Comprehensive HESI practice questions from Exit Exam and study guides.',
  };
  if (descriptions[moduleName]) return descriptions[moduleName];
  if (category === 'Nursing_Certifications') return 'Certification exam practice questions with detailed rationales.';
  if (category === 'HESI') return 'HESI exam preparation questions with detailed rationales.';
  if (category === 'Lab_Values') return 'Lab values practice questions with detailed rationales.';
  if (category === 'Pharmacology') return 'Pharmacology practice questions covering drug classifications and nursing implications.';
  return 'Practice questions with detailed rationales to reinforce your understanding.';
}

/* ---------- Get badge class for module ---------- */
function getBadgeClass(moduleName, category) {
  if (moduleName.includes('CCRN')) return 'badge-ccrn';
  return 'badge-standard';
}

/* ---------- Get badge text for module ---------- */
function getBadgeText(moduleName, category) {
  if (moduleName.includes('CCRN')) return 'CCRN PRACTICE TEST';
  if (category === 'Nursing_Certifications') return 'CERTIFICATION PREP';
  if (category === 'HESI') return 'HESI PREP';
  return 'STANDARD';
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

/* ---------- State ---------- */
let allQuestions = [];
let currentCategory = null; // Track current category for JSON URL construction
let run = {
  bank: '', displayName: '', category: '', order: [], masterPool: [], i: 0,
  answered: new Map(), uniqueSeen: new Set(), thresholdWrong: 0,
  wrongSinceLast: [], totalQuestionsAnswered: 0, isFullBank: false, isRetry: false,
};
let lastQuizMissedQuestions = [];

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'quizRunState_v1';
function serializeRun() {
  if (!run || !run.order?.length) return null;
  return JSON.stringify({
    bank: run.bank, displayName: run.displayName, category: run.category,
    order: run.order.map(q => ({ id:q.id, stem:q.stem, options:q.options, correctLetters:q.correctLetters, rationale:q.rationale, type:q.type })),
    masterPool: run.masterPool.map(q => q.id), i: run.i,
    answered: Array.from(run.answered.entries()), uniqueSeen: Array.from(run.uniqueSeen),
    thresholdWrong: run.thresholdWrong, wrongSinceLast: run.wrongSinceLast.map(q => q.id),
    totalQuestionsAnswered: run.totalQuestionsAnswered, isFullBank: run.isFullBank, isRetry: run.isRetry,
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
      const qq = { id:String(q.id), stem:String(q.stem||''), options:q.options||{}, correctLetters:(q.correctLetters||[]), rationale:String(q.rationale||''), type:String(q.type||'single_select') };
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
    };
    return { run: restored, title: data.title || defaultTitle };
  } catch { return null; }
}
function clearSavedState(){ try { localStorage.removeItem(STORAGE_KEY); } catch {} }
function getNotMasteredFromRun(runData) { return runData.masterPool.filter(q => !runData.answered.get(q.id)?.correct).length; }

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
      currentCategory = run.category; // Restore category
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
      type: (isSelectAll || q.type === 'multiple_select') ? 'multiple_select' : 'single_select',
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

function getColorClass(wrongCount, maxWrong) {
  if (wrongCount === 0) return '';
  if (wrongCount <= maxWrong * 0.33) return 'yellow';
  if (wrongCount <= maxWrong * 0.66) return 'orange';
  return 'red';
}

function setupCategoryDisplay() {
  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get('category');
  const categoryTitles = { 'HESI': 'HESI Exit Comprehensive Study Quizzes', 'Patient Care Management': 'Patient Care Management', 'Nursing Certifications': 'Nursing Certifications', 'Pharmacology': 'Pharmacology', 'Lab Values': 'Lab Values - Multiple Choice' };
  const moduleSelectionTitles = { 'HESI': 'HESI Study Material', 'Patient Care Management': 'Patient Care Management Study Material', 'Nursing Certifications': 'Nursing Certifications Study Material', 'Pharmacology': 'Pharmacology Study Material', 'Lab Values': 'Lab Values Study Material' };
  const categoryDescriptions = { 'HESI': 'The Comprehensive Quiz 1, 2, and 3 are questions gathered from HESI Exit Exam and HESI Comprehensive study guides' };
  if (category) {
    const displayTitle = categoryTitles[category] || category;
    const displayDescription = categoryDescriptions[category] || '';
    const quizTitle = document.getElementById('quizTitle');
    if (quizTitle) quizTitle.textContent = moduleSelectionTitles[category] || category;
    const quizDescription = document.getElementById('quizDescription');
    if (quizDescription) {
      if (displayDescription) { quizDescription.textContent = displayDescription; quizDescription.style.display = 'block'; }
      else { quizDescription.style.display = 'none'; }
    }
  }
}

/* ---------- Render Question ---------- */
function renderQuestion(q){
  if (!qText || !form) return;
  qText.textContent = q.stem;
  form.innerHTML = '';
  if (feedback) { feedback.textContent = ''; feedback.className = 'feedback hidden'; }
  if (answerLine) { answerLine.innerHTML = ''; answerLine.classList.add('hidden'); }
  if (rationaleBox) { rationaleBox.textContent = ''; rationaleBox.classList.add('hidden'); }
  const isMulti = (q.type === 'multiple_select');
  const letters = Object.keys(q.options).sort();
  letters.forEach(letter => {
    const optDiv = document.createElement('div');
    optDiv.className = 'opt';
    optDiv.dataset.letter = letter;
    const inp = document.createElement('input');
    inp.type = isMulti ? 'checkbox' : 'radio';
    inp.name = 'answer';
    inp.id = 'opt-' + letter;
    inp.value = letter;
    const lbl = document.createElement('label');
    lbl.setAttribute('for', 'opt-' + letter);
    const keySpan = document.createElement('span');
    keySpan.className = 'k';
    keySpan.textContent = letter;
    const answerSpan = document.createElement('span');
    answerSpan.className = 'ans';
    answerSpan.textContent = q.options[letter];
    lbl.appendChild(keySpan);
    lbl.appendChild(answerSpan);
    optDiv.appendChild(inp);
    optDiv.appendChild(lbl);
    form.appendChild(optDiv);
    optDiv.addEventListener('click', (e) => {
      if (e.target === lbl || e.target === keySpan || e.target === answerSpan) {
        e.preventDefault();
        inp.checked = !inp.checked;
        onSelectionChanged();
      }
    });
  });
  setActionState('submit');
  updateHoverClasses();
}

function currentQuestion() { return run.order?.[run.i] || null; }
function getUserLetters(){
  if (!form) return [];
  const checked = [...form.querySelectorAll('input:checked')];
  return checked.map(inp => inp.value).sort();
}
function onSelectionChanged(){
  if (!submitBtn) return;
  const hasSelection = getUserLetters().length > 0;
  submitBtn.disabled = !hasSelection;
  updateHoverClasses();
}
function setActionState(mode){
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
function formatCorrectAnswers(q){
  return (q.correctLetters || []).map(l => '<strong>' + escapeHTML(l) + '</strong>. ' + escapeHTML(q.options[l]||'')).join('<br>');
}
function highlightAnswers(q, userLetters, isCorrect) {
  if (!form) return;
  const correctLetters = q.correctLetters || [];
  form.querySelectorAll('.opt').forEach(optDiv => {
    const letter = optDiv.dataset.letter;
    const isCorrectAnswer = correctLetters.includes(letter);
    const wasSelected = userLetters.includes(letter);
    optDiv.classList.remove('correct-answer', 'wrong-answer');
    if (isCorrect && wasSelected) optDiv.classList.add('correct-answer');
    else if (!isCorrect && wasSelected && !isCorrectAnswer) optDiv.classList.add('wrong-answer');
  });
}

/* ---------- Counters / Progress Bar ---------- */
function updateCounters(){
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;
  if (runCounter) runCounter.textContent = 'Question: ' + run.totalQuestionsAnswered;
  if (remainingCounter) remainingCounter.textContent = 'Remaining to master: ' + remaining;
  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;
  if (progressFill) progressFill.style.width = percentage + '%';
  if (progressLabel) progressLabel.textContent = percentage + '% mastered';
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);
  updateProgressBar();
  saveRunState();
}
function recordAnswer(q, userLetters, isCorrect){
  const firstTime = !run.answered.has(q.id);
  const entry = run.answered.get(q.id) || { firstTryCorrect: null, correct: false, userLetters: [] };
  if (firstTime) entry.firstTryCorrect = !!isCorrect;
  entry.correct = !!isCorrect;
  entry.userLetters = userLetters.slice();
  run.answered.set(q.id, entry);
}
function getNotMastered(){ return run.masterPool.filter(q => !run.answered.get(q.id)?.correct); }
function nextIndex(){
  const nextIdx = (run.i ?? 0) + 1;
  if (nextIdx < run.order.length) { run.i = nextIdx; return { fromBuffer: false, q: run.order[run.i] }; }
  const allCorrect = run.masterPool.every(q => run.answered.get(q.id)?.correct);
  if (!allCorrect) {
    const notMastered = getNotMastered();
    if (notMastered.length > 0) {
      run.wrongSinceLast = [];
      run.order.push(...notMastered);
      run.i = nextIdx;
      return { fromBuffer: true, q: run.order[run.i] };
    }
  }
  return { fromBuffer: false, q: null };
}

/* ---------- Start / End ---------- */
async function startQuiz(){
  if (!lengthBtns || !moduleSel || !startBtn) return;
  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  if (!lenBtn) {
    alert('Pick Length Of Quiz Before Starting');
    lengthBtns.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const bank = moduleSel.value;
  const displayName = prettifyModuleName(bank);
  const qty = (lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10));
  const isFullBank = (qty === 'full');
  
  // Determine category - check multiple sources
  const category = window.preloadedCategory || getCategoryFromPath() || currentCategory;
  
  if (!category) {
    console.error('[Quiz] Could not determine category for module:', bank);
    alert('Error: Could not determine quiz category. Please try navigating from the category page.');
    return;
  }
  
  currentCategory = category; // Store for later use
  
  setHeaderTitle(displayName);
  document.title = displayName + ' - Nurse Success Study Hub';
  const quizTitle = $('quizTitle');
  if (quizTitle) quizTitle.textContent = displayName;
  startBtn.disabled = true;
  
  try {
    let rawData;
    
    // Check for preloaded data first
    if (window.storedPreloadedData && window.storedPreloadedData.moduleName === bank) {
      console.log('[Quiz] Using preloaded data for:', bank);
      rawData = window.storedPreloadedData.questions;
    } else {
      // Build correct JSON URL path: /modules/{category}/{module}.json
      const jsonUrl = buildModuleJsonUrl(category, bank);
      
      if (!jsonUrl) {
        alert('Error: Could not build quiz URL');
        startBtn.disabled = false;
        return;
      }
      
      console.log('[Quiz] Fetching from:', jsonUrl);
      
      const res = await fetch(jsonUrl, { cache: 'no-store' });
      if (!res.ok) {
        console.error('[Quiz] Fetch failed:', res.status, res.statusText);
        alert('Could not load quiz. Status: ' + res.status + '. Make sure you are online or the quiz is cached for offline use.');
        startBtn.disabled = false;
        setHeaderTitle(defaultTitle);
        document.title = 'Quiz - Nurse Success Study Hub';
        return;
      }
      rawData = await res.json();
    }
    
    allQuestions = normalizeQuestions(rawData);
    const sampled = sampleQuestions(allQuestions, qty);
    const shuffledQuestions = sampled.map((q) => shuffleQuestionOptions(q));
    
    run = {
      bank, displayName, category, order: [...shuffledQuestions], masterPool: [...shuffledQuestions],
      i: 0, answered: new Map(), uniqueSeen: new Set(), thresholdWrong: 0,
      wrongSinceLast: [], totalQuestionsAnswered: 1, isFullBank: isFullBank, isRetry: false,
    };
    
    const total = run.masterPool.length;
    const frac = (qty === 'full' || (typeof qty === 'number' && qty >= 100)) ? 0.05 : 0.15;
    run.thresholdWrong = Math.max(1, Math.ceil(total * frac));
    
    if (launcher) launcher.classList.add('hidden');
    if (summary) summary.classList.add('hidden');
    if (quiz) quiz.classList.remove('hidden');
    if (countersBox) countersBox.classList.remove('hidden');
    if (resetAll) resetAll.classList.remove('hidden');
    
    const q0 = run.order[0];
    run.uniqueSeen.add(q0.id);
    renderQuestion(q0);
    updateCounters();
    startBtn.disabled = false;
  } catch (err) {
    console.error('Error starting quiz:', err);
    alert('Error loading quiz. Please check your connection and try again.');
    if (startBtn) startBtn.disabled = false;
  }
}

async function startRetryQuiz(missedQuestions) {
  if (!missedQuestions || missedQuestions.length === 0) { alert('No missed questions to retry'); return; }
  const displayName = run.displayName + ' - Retry Missed Questions';
  const category = run.category || currentCategory;
  setHeaderTitle(displayName);
  document.title = displayName + ' - Nurse Success Study Hub';
  const quizTitle = $('quizTitle');
  if (quizTitle) quizTitle.textContent = displayName;
  const shuffledQuestions = missedQuestions.map((q) => shuffleQuestionOptions(q));
  run = {
    bank: run.bank, displayName: displayName, category: category, order: [...shuffledQuestions], masterPool: [...shuffledQuestions],
    i: 0, answered: new Map(), uniqueSeen: new Set(), thresholdWrong: 0,
    wrongSinceLast: [], totalQuestionsAnswered: 1, isFullBank: false, isRetry: true,
  };
  const total = run.masterPool.length;
  run.thresholdWrong = Math.max(1, Math.ceil(total * 0.15));
  if (launcher) launcher.classList.add('hidden');
  if (summary) summary.classList.add('hidden');
  if (quiz) quiz.classList.remove('hidden');
  if (countersBox) countersBox.classList.remove('hidden');
  if (resetAll) resetAll.classList.remove('hidden');
  const q0 = run.order[0];
  run.uniqueSeen.add(q0.id);
  renderQuestion(q0);
  updateCounters();
}

function endRun(){
  if (quiz) quiz.classList.add('hidden');
  if (summary) summary.classList.remove('hidden');
  if (countersBox) countersBox.classList.add('hidden');
  setHeaderTitle(run.displayName || run.bank || defaultTitle);
  document.title = run.displayName || run.bank || 'Quiz - Nurse Success Study Hub';
  if (restartBtn2) restartBtn2.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const uniq = [...run.answered.values()];
  const ftCorrect = uniq.filter(x => x.firstTryCorrect).length;
  const totalUnique = uniq.length;
  lastQuizMissedQuestions = run.masterPool.filter(q => {
    const ans = run.answered.get(q.id);
    return ans && ans.firstTryCorrect === false;
  });
  if (retryMissedBtn) {
    if (lastQuizMissedQuestions.length > 0 && !run.isRetry) {
      retryMissedBtn.classList.remove('hidden');
      const missedCount = document.getElementById('missedCount');
      if (missedCount) missedCount.textContent = lastQuizMissedQuestions.length;
    } else {
      retryMissedBtn.classList.add('hidden');
    }
  }
  if (firstTrySummary) {
    if (totalUnique > 0){
      firstTrySummary.classList.remove('hidden');
      firstTrySummary.innerHTML = '<div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center;"><div><strong>First-try mastery:</strong> <span id="firstTryPct">0%</span> (<span id="firstTryCount">0</span> / <span id="firstTryTotal">0</span>)</div><div><strong>Total Questions Answered:</strong> <span>' + run.totalQuestionsAnswered + '</span></div></div>';
      const firstTryPct = document.getElementById('firstTryPct');
      const firstTryCount = document.getElementById('firstTryCount');
      const firstTryTotal = document.getElementById('firstTryTotal');
      if (firstTryPct) firstTryPct.textContent = Math.round((ftCorrect / totalUnique) * 100) + '%';
      if (firstTryCount) firstTryCount.textContent = ftCorrect;
      if (firstTryTotal) firstTryTotal.textContent = totalUnique;
    } else {
      firstTrySummary.classList.add('hidden');
    }
  }
  if (reviewList) {
    reviewList.innerHTML = '';
    const questionWrongCount = {};
    run.order.forEach(q => { questionWrongCount[q.id] = (questionWrongCount[q.id] || 0) + 1; });
    const maxWrong = Math.max(...Object.values(questionWrongCount));
    const sortedQuestions = [...run.order].sort((a, b) => {
      const ansA = run.answered.get(a.id);
      const ansB = run.answered.get(b.id);
      if (ansA?.correct !== ansB?.correct) return ansA?.correct ? 1 : -1;
      const countA = questionWrongCount[a.id] || 1;
      const countB = questionWrongCount[b.id] || 1;
      return countB - countA;
    });
    const displayedIds = new Set();
    sortedQuestions.forEach(q => {
      if (displayedIds.has(q.id)) return;
      displayedIds.add(q.id);
      const row = document.createElement('div');
      const ans = run.answered.get(q.id);
      row.className = 'rev-item ' + (ans?.correct ? 'ok' : 'bad');
      const qEl = document.createElement('div'); qEl.className = 'rev-q'; qEl.textContent = q.stem;
      const wrongCountEl = document.createElement('div'); 
      wrongCountEl.className = 'rev-wrong-count';
      const wrongCount = Math.max(0, questionWrongCount[q.id] - 1);
      wrongCountEl.textContent = 'Times marked wrong: ' + wrongCount;
      const colorClass = getColorClass(wrongCount, maxWrong);
      if (colorClass) wrongCountEl.classList.add(colorClass);
      const caEl = document.createElement('div'); caEl.className = 'rev-ans';
      caEl.innerHTML = '<strong>Correct Answer:</strong><br>' + formatCorrectAnswers(q);
      const rEl = document.createElement('div'); rEl.className = 'rev-rationale';
      rEl.innerHTML = '<strong>Rationale:</strong> ' + escapeHTML(q.rationale || '');
      row.appendChild(qEl); 
      row.appendChild(wrongCountEl);
      row.appendChild(caEl); 
      row.appendChild(rEl);
      reviewList.appendChild(row);
    });
  }
  clearSavedState();
}

/* ---------- Event wiring ---------- */
if (lengthBtns) {
  lengthBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active')?'true':'false'));
  });
}
if (startBtn) startBtn.addEventListener('click', startQuiz);
if (form) form.addEventListener('change', onSelectionChanged);
if (submitBtn) submitBtn.addEventListener('click', handleSubmitClick);

function handleSubmitClick() {
  if (!submitBtn) return;
  if (submitBtn.dataset.mode === 'next') {
    scrollToQuizTop();
    const next = nextIndex();
    const q = next.q;
    if (!q) return endRun();
    run.uniqueSeen.add(q.id);
    run.totalQuestionsAnswered++;
    renderQuestion(q);
    updateCounters();
    return;
  }
  const q = currentQuestion();
  if (!q) return;
  const userLetters = getUserLetters();
  const correctLetters = (q.correctLetters || []).slice().sort();
  const isCorrect = JSON.stringify(userLetters) === JSON.stringify(correctLetters);
  recordAnswer(q, userLetters, isCorrect);
  if (!isCorrect) {
    run.wrongSinceLast.push(q);
    if (run.wrongSinceLast.length >= run.thresholdWrong) {
      const seen = new Set(); const uniqueBatch = [];
      for (const item of run.wrongSinceLast) {
        if (!seen.has(item.id)) { seen.add(item); uniqueBatch.push(item); }
      }
      run.wrongSinceLast = [];
      if (uniqueBatch.length) run.order.splice(run.i + 1, 0, ...uniqueBatch);
    }
  }
  if (feedback) {
    feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    feedback.classList.remove('ok','bad', 'hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }
  highlightAnswers(q, userLetters, isCorrect);
  if (answerLine) { answerLine.innerHTML = '<strong>Correct Answer:</strong><br>' + formatCorrectAnswers(q); answerLine.classList.remove('hidden'); }
  if (rationaleBox) { rationaleBox.textContent = q.rationale || ''; rationaleBox.classList.remove('hidden'); }
  if (form) form.querySelectorAll('input').forEach(i => i.disabled = true);
  setActionState('next');
  scrollToBottomSmooth();
  updateCounters();
}

if (resetAll) resetAll.addEventListener('click', () => { clearSavedState(); location.reload(); });
if (restartBtn2) restartBtn2.addEventListener('click', () => { location.reload(); });
if (retryMissedBtn) retryMissedBtn.addEventListener('click', () => { startRetryQuiz(lastQuizMissedQuestions); });

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if (!quiz || quiz.classList.contains('hidden')) return;
  if (isTextEditingTarget(e.target)) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const key = e.key || '';
  const upper = key.toUpperCase();
  if (key === 'Enter') {
    e.preventDefault();
    if (submitBtn && !submitBtn.disabled) submitBtn.click();
    return;
  }
  if (/^[A-Z]$/.test(upper) && submitBtn && submitBtn.dataset.mode === 'submit') {
    const input = document.getElementById('opt-' + upper);
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
    progressFill.style.width = percentage + '%';
    const r = Math.round(47 + (76 - 47) * (percentage / 100));
    const g = Math.round(97 + (175 - 97) * (percentage / 100));
    const b = Math.round(243 + (80 - 243) * (percentage / 100));
    progressFill.style.backgroundColor = 'rgb(' + r + ', ' + g + ', ' + b + ')';
  }
  if (progressLabel) progressLabel.textContent = percentage + '% mastered';
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);
}

function checkAutoStart() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('autostart') === 'true';
}

/* ---------- Initialize modules with preselect and preloaded data ---------- */
async function initModulesWithPreselect() {
  const moduleFromPath = getModuleFromPath();
  const categoryFromPath = getCategoryFromPath();
  const autostart = checkAutoStart();
  const hasPreloadedData = window.preloadedQuizData && window.preloadedModuleName;
  
  // Set current category from path or preloaded data
  currentCategory = window.preloadedCategory || categoryFromPath;
  
  if (hasPreloadedData) {
    const displayName = prettifyModuleName(window.preloadedModuleName);
    const category = window.preloadedCategory || categoryFromPath || '';
    const description = getModuleDescription(window.preloadedModuleName, category);
    const badgeClass = getBadgeClass(window.preloadedModuleName, category);
    const badgeText = getBadgeText(window.preloadedModuleName, category);
    
    currentCategory = category; // Store category
    
    const quizTitle = $('quizTitle');
    if (quizTitle) quizTitle.textContent = displayName;

    if (launcher) launcher.classList.remove('hidden');
    if (summary) summary.classList.add('hidden');
    if (quiz) quiz.classList.add('hidden');
    if (countersBox) countersBox.classList.add('hidden');
    if (resetAll) resetAll.classList.add('hidden');

    const moduleSelectorGroup = document.getElementById('moduleSelectorGroup');
    if (moduleSelectorGroup) moduleSelectorGroup.classList.add('hidden-for-preloaded');

    const preloadedTitleWrapper = document.getElementById('preloadedTitleWrapper');
    if (preloadedTitleWrapper) preloadedTitleWrapper.style.display = 'block';

    // Set dynamic preloaded header content
    const preloadedBadge = document.getElementById('preloadedBadge');
    const preloadedTitle = document.getElementById('preloadedTitle');
    const preloadedDescription = document.getElementById('preloadedDescription');
    
    if (preloadedBadge) { preloadedBadge.textContent = badgeText; preloadedBadge.className = 'launcher-badge ' + badgeClass; }
    if (preloadedTitle) preloadedTitle.textContent = displayName;
    if (preloadedDescription) preloadedDescription.textContent = description;

    const defaultTitleEl = document.getElementById('defaultTitle');
    if (defaultTitleEl) defaultTitleEl.style.display = 'none';

    if (moduleSel) {
      moduleSel.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = window.preloadedModuleName;
      opt.textContent = displayName;
      opt.selected = true;
      moduleSel.appendChild(opt);
      moduleSel.disabled = true;
    }

    window.storedPreloadedData = { questions: window.preloadedQuizData, moduleName: window.preloadedModuleName };
    return;
  }

  if (!moduleSel) return;
  
  const preloadedTitleWrapper = document.getElementById('preloadedTitleWrapper');
  if (preloadedTitleWrapper) preloadedTitleWrapper.style.display = 'none';

  const defaultTitleEl = document.getElementById('defaultTitle');
  if (defaultTitleEl) defaultTitleEl.style.display = 'block';

  const moduleSelectorGroup = document.getElementById('moduleSelectorGroup');
  if (moduleSelectorGroup) moduleSelectorGroup.classList.remove('hidden-for-preloaded');
  
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category') || categoryFromPath;
    const subcategory = urlParams.get('subcategory');
    let modules = [];
    
    // Store the category for later use
    if (category) {
      currentCategory = category;
    }
    
    if (category) {
      const endpoint = '/api/category/' + encodeURIComponent(category) + '/modules';
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (res.ok) { const json = await res.json(); modules = Array.isArray(json.modules) ? json.modules : []; }
    } else {
      const res = await fetch('/modules', { cache: 'no-store' });
      if (res.ok) { const json = await res.json(); modules = Array.isArray(json.modules) ? json.modules : []; }
    }
    
    if (subcategory && category) {
      const moduleGroupings = {
        'Nursing Certifications': { 'CCRN': ['CCRN_Test_1_Combined_QA', 'CCRN_Test_2_Combined_QA', 'CCRN_Test_3_Combined_QA'] },
        'Pharmacology': { 'Pharm Quizzes': ['Pharm_Quiz_1', 'Pharm_Quiz_2', 'Pharm_Quiz_3', 'Pharm_Quiz_4'] }
      };
      if (moduleGroupings[category] && moduleGroupings[category][subcategory]) {
        const allowedModules = moduleGroupings[category][subcategory];
        modules = modules.filter(m => allowedModules.includes(m));
      }
    }
    
    modules = modules.filter(m => !m.includes('Fill_In_The_Blank'));
    moduleSel.innerHTML = '';
    if (!modules.length && !moduleFromPath) { moduleSel.innerHTML = '<option value="">No modules available</option>'; return; }

    modules.forEach(mod => {
      const opt = document.createElement('option');
      opt.value = mod;
      opt.textContent = prettifyModuleName(mod);
      if (moduleFromPath && mod === moduleFromPath) opt.selected = true;
      moduleSel.appendChild(opt);
    });
    
    if (moduleFromPath && !modules.includes(moduleFromPath)) {
      const opt = document.createElement('option');
      opt.value = moduleFromPath;
      opt.textContent = prettifyModuleName(moduleFromPath);
      opt.selected = true;
      moduleSel.insertBefore(opt, moduleSel.firstChild);
    }
    
    if (moduleFromPath) {
      const displayName = prettifyModuleName(moduleFromPath);
      const quizTitle = $('quizTitle');
      if (quizTitle) quizTitle.textContent = displayName;
    }

    if (autostart && moduleFromPath) {
      const lengthBtnsAll = document.querySelectorAll('#lengthBtns .seg-btn');
      lengthBtnsAll.forEach(btn => btn.classList.remove('active'));
      lengthBtnsAll.forEach(btn => {
        if (btn.dataset.len === 'full') { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
      });
      setTimeout(() => { startQuiz(); }, 100);
    }
  } catch (err) {
    console.error('Error loading modules:', err);
    if (moduleSel) moduleSel.innerHTML = '<option value="">Error loading modules</option>';
  }
}

/* ---------- Init ---------- */
setupCategoryDisplay();
initModulesWithPreselect();
showResumeIfAny();
