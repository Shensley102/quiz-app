/* -----------------------------------------------------------
   Nurse Success Study Hub - Fill-in-the-Blank Quiz
   - Text input answer format
   - Case-insensitive exact matching
   - Support for single and double blank answers
   - Individual blank feedback (correct/incorrect per field)
   - Progress tracking and mastery system
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
const lengthBtns = $('lengthBtns');
const startBtn   = $('startBtn');

// Quiz UI
const quiz         = $('quiz');
const qText        = $('questionText');
const inputArea    = $('inputArea');
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

/* ---------- Utilities ---------- */
function escapeHTML(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

const randomInt = (n) => Math.floor(Math.random() * n);

/* ---------- Get module from URL path ---------- */
function getModuleFromPath() {
  const path = window.location.pathname;
  // Match /quiz/MODULE_NAME pattern
  const match = path.match(/\/quiz\/([^\/]+)$/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  return null;
}

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); 
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleQuestions(all, req){
  const a = all.slice();
  if (req === 'full' || req >= a.length) return shuffleInPlace(a);
  const k = Math.max(0, req|0);
  for (let i = 0; i < k; i++) { 
    const j = i + randomInt(a.length - i); 
    [a[i], a[j]] = [a[j], a[i]]; 
  }
  return a.slice(0, k);
}

function scrollToBottomSmooth() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  });
}

function scrollToQuizTop() {
  if (!quiz) return;
  quiz.scrollIntoView({ behavior: 'auto', block: 'start' });
}

/* ---------- Answer Validation ---------- */
function normalizeAnswer(str) {
  // Lowercase, trim whitespace, normalize common variations
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/−/g, '-')  // Normalize different minus signs
    .replace(/–/g, '-')
    .replace(/—/g, '-');
}

function checkAnswer(userInput, correctAnswer) {
  const userNorm = normalizeAnswer(userInput);
  const correctNorm = normalizeAnswer(correctAnswer);
  
  // Direct match
  if (userNorm === correctNorm) return true;
  
  // Handle numeric comparisons (e.g., "135" matches "135.0" or "135")
  const userNum = parseFloat(userNorm);
  const correctNum = parseFloat(correctNorm);
  if (!isNaN(userNum) && !isNaN(correctNum) && userNum === correctNum) {
    return true;
  }
  
  // Handle alternative formats for common answers
  const alternatives = {
    'negative': ['neg', 'none', '0', 'absent'],
    'positive': ['pos', '+'],
    'vitamin k': ['vit k', 'vitamin-k'],
    'calcium gluconate': ['calcium', 'ca gluconate'],
    'protamine sulfate': ['protamine'],
    'hypocalcemia': ['low calcium', 'low ca'],
    'hyperkalemia': ['high potassium', 'high k'],
    'hypokalemia': ['low potassium', 'low k'],
    'metabolic': ['met'],
    'respiratory': ['resp'],
    'primary': ['1st', 'first'],
    'low': ['decreased', 'dec', '↓'],
    'high': ['elevated', 'increased', 'inc', '↑'],
    'hco3': ['bicarbonate', 'bicarb', 'hco3-'],
  };
  
  // Check if user input matches any alternatives for the correct answer
  for (const [key, alts] of Object.entries(alternatives)) {
    if (correctNorm === key || correctNorm.includes(key)) {
      if (alts.some(alt => userNorm === alt || userNorm.includes(alt))) {
        return true;
      }
    }
    // Also check reverse - if user typed the key and answer is an alt
    if (userNorm === key) {
      if (alts.some(alt => correctNorm === alt || correctNorm.includes(alt))) {
        return true;
      }
    }
  }
  
  return false;
}

/* ---------- State ---------- */
let allQuestions = [];
let run = {
  bank: '',
  displayName: '',
  order: [],
  masterPool: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  thresholdWrong: 0,
  wrongSinceLast: [],
  totalQuestionsAnswered: 0,
  isFullBank: false,
  isRetry: false,
};

let lastQuizMissedQuestions = [];

/* ---------- Normalize Questions ---------- */
function normalizeQuestions(data){
  const arr = Array.isArray(data) ? data : (data?.questions || []);
  return arr.map((q, idx) => {
    // Ensure answer is always an array
    let answers = [];
    if (Array.isArray(q.answer)) {
      answers = q.answer.map(a => String(a || ''));
    } else if (q.answer) {
      answers = [String(q.answer)];
    }
    
    return {
      id: String(q.id || idx),
      stem: String(q.question || q.stem || ''),
      answer: answers,
      display_answer: String(q.display_answer || answers.join(' - ')),
      rationale: String(q.rationale || ''),
      blankCount: answers.length
    };
  });
}

/* ---------- Get color class for wrong count ---------- */
function getColorClass(wrongCount, maxWrong) {
  if (wrongCount === 0) return '';
  if (wrongCount <= maxWrong * 0.33) return 'yellow';
  if (wrongCount <= maxWrong * 0.66) return 'orange';
  return 'red';
}

/* ---------- Render Question ---------- */
function renderQuestion(q){
  if (!qText || !inputArea) return;
  
  qText.textContent = q.stem;
  inputArea.innerHTML = '';
  
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

  // Create input fields based on number of blanks
  const inputContainer = document.createElement('div');
  inputContainer.className = 'input-container';
  
  for (let i = 0; i < q.blankCount; i++) {
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';
    
    if (q.blankCount > 1) {
      const label = document.createElement('label');
      label.textContent = i === 0 ? 'First value:' : 'Second value:';
      label.setAttribute('for', `answer-${i}`);
      inputWrapper.appendChild(label);
    }
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `answer-${i}`;
    input.className = 'answer-input';
    input.placeholder = q.blankCount > 1 ? `Enter value ${i + 1}...` : 'Type your answer...';
    input.autocomplete = 'off';
    input.spellcheck = false;
    
    // Auto-focus first input
    if (i === 0) {
      setTimeout(() => input.focus(), 100);
    }
    
    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // If there's a next input, focus it; otherwise submit
        const nextInput = document.getElementById(`answer-${i + 1}`);
        if (nextInput && !nextInput.disabled) {
          nextInput.focus();
        } else if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }
    });
    
    input.addEventListener('input', onInputChanged);
    
    inputWrapper.appendChild(input);
    
    // Add status indicator
    const status = document.createElement('span');
    status.className = 'input-status';
    status.id = `status-${i}`;
    inputWrapper.appendChild(status);
    
    inputContainer.appendChild(inputWrapper);
  }
  
  inputArea.appendChild(inputContainer);
  
  setActionState('submit');
}

function currentQuestion() {
  return run.order?.[run.i] || null;
}

function getUserAnswers(){
  const answers = [];
  const q = currentQuestion();
  if (!q) return answers;
  
  for (let i = 0; i < q.blankCount; i++) {
    const input = document.getElementById(`answer-${i}`);
    answers.push(input ? input.value : '');
  }
  return answers;
}

function onInputChanged(){
  if (!submitBtn) return;
  const answers = getUserAnswers();
  const hasInput = answers.some(a => a.trim().length > 0);
  submitBtn.disabled = !hasInput;
}

function setActionState(mode){
  if (!submitBtn) return;
  submitBtn.dataset.mode = mode;

  if (mode === 'submit') {
    submitBtn.textContent = 'Submit';
    submitBtn.classList.remove('btn-blue');
    submitBtn.classList.add('primary');
    submitBtn.disabled = getUserAnswers().every(a => a.trim().length === 0);
  } else {
    submitBtn.textContent = 'Next';
    submitBtn.classList.remove('primary');
    submitBtn.classList.add('btn-blue');
    submitBtn.disabled = false;
  }
}

/* ---------- Counters / Progress Bar ---------- */
function updateCounters(){
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;

  if (runCounter) runCounter.textContent = `Question: ${run.totalQuestionsAnswered}`;
  if (remainingCounter) remainingCounter.textContent = `Remaining to master: ${remaining}`;

  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressLabel) progressLabel.textContent = `${percentage}% mastered`;
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);

  updateProgressBar();
}

function recordAnswer(q, userAnswers, isCorrect, blankResults){
  const firstTime = !run.answered.has(q.id);
  const entry = run.answered.get(q.id) || { firstTryCorrect: null, correct: false, userAnswers: [], blankResults: [] };
  if (firstTime) entry.firstTryCorrect = !!isCorrect;
  entry.correct = !!isCorrect;
  entry.userAnswers = userAnswers.slice();
  entry.blankResults = blankResults.slice();
  run.answered.set(q.id, entry);
}

function getNotMastered(){
  return run.masterPool.filter(q => !run.answered.get(q.id)?.correct);
}

function nextIndex(){
  const nextIdx = (run.i ?? 0) + 1;
  if (nextIdx < run.order.length) {
    run.i = nextIdx;
    return { fromBuffer: false, q: run.order[run.i] };
  }
  
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
  if (!lengthBtns || !startBtn) return;
  
  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  if (!lenBtn) {
    alert('Pick Length Of Quiz Before Starting');
    lengthBtns.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Get module from URL path
  const moduleName = getModuleFromPath() || 'NCLEX_Lab_Values_Fill_In_The_Blank';
  
  const displayName = 'Lab Values - Fill in the Blank';
  const qty = (lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10));
  const isFullBank = (qty === 'full');

  setHeaderTitle(displayName);
  document.title = `${displayName} - Nurse Success Study Hub`;
  
  const quizTitle = $('quizTitle');
  if (quizTitle) {
    quizTitle.textContent = displayName;
  }

  startBtn.disabled = true;

  const jsonUrl = `/${moduleName}.json`;
  
  try {
    const res = await fetch(jsonUrl, { cache: 'no-store' });
    if (!res.ok) {
      alert(`Could not load quiz data`);
      startBtn.disabled = false;
      return;
    }
    const raw = await res.json();
    allQuestions = normalizeQuestions(raw);

    const sampled = sampleQuestions(allQuestions, qty);

    run = {
      bank: moduleName,
      displayName,
      order: [...sampled],
      masterPool: [...sampled],
      i: 0,
      answered: new Map(),
      uniqueSeen: new Set(),
      thresholdWrong: 0,
      wrongSinceLast: [],
      totalQuestionsAnswered: 1,
      isFullBank: isFullBank,
      isRetry: false,
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
    alert('Error loading quiz. Please try again.');
    if (startBtn) startBtn.disabled = false;
  }
}

async function startRetryQuiz(missedQuestions) {
  if (!missedQuestions || missedQuestions.length === 0) {
    alert('No missed questions to retry');
    return;
  }

  const displayName = `Lab Values Fill-in-Blank - Retry Missed`;
  setHeaderTitle(displayName);
  document.title = `${displayName} - Nurse Success Study Hub`;
  
  const quizTitle = $('quizTitle');
  if (quizTitle) {
    quizTitle.textContent = displayName;
  }

  run = {
    bank: run.bank,
    displayName: displayName,
    order: [...missedQuestions],
    masterPool: [...missedQuestions],
    i: 0,
    answered: new Map(),
    uniqueSeen: new Set(),
    thresholdWrong: 0,
    wrongSinceLast: [],
    totalQuestionsAnswered: 1,
    isFullBank: false,
    isRetry: true,
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

  // Collect missed questions
  lastQuizMissedQuestions = run.masterPool.filter(q => {
    const ans = run.answered.get(q.id);
    return ans && ans.firstTryCorrect === false;
  });

  // Show or hide retry button
  if (retryMissedBtn) {
    if (lastQuizMissedQuestions.length > 0 && !run.isRetry) {
      retryMissedBtn.classList.remove('hidden');
      const missedCount = document.getElementById('missedCount');
      if (missedCount) {
        missedCount.textContent = lastQuizMissedQuestions.length;
      }
    } else {
      retryMissedBtn.classList.add('hidden');
    }
  }

  if (firstTrySummary) {
    if (totalUnique > 0){
      firstTrySummary.classList.remove('hidden');
      const summaryHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center;">
          <div>
            <strong>First-try mastery:</strong>
            <span id="firstTryPct">0%</span>
            (<span id="firstTryCount">0</span> / <span id="firstTryTotal">0</span>)
          </div>
          <div>
            <strong>Total Questions Answered:</strong>
            <span>${run.totalQuestionsAnswered}</span>
          </div>
        </div>
      `;
      firstTrySummary.innerHTML = summaryHTML;
      const firstTryPct = document.getElementById('firstTryPct');
      const firstTryCount = document.getElementById('firstTryCount');
      const firstTryTotal = document.getElementById('firstTryTotal');
      if (firstTryPct) firstTryPct.textContent = `${Math.round((ftCorrect / totalUnique) * 100)}%`;
      if (firstTryCount) firstTryCount.textContent = ftCorrect;
      if (firstTryTotal) firstTryTotal.textContent = totalUnique;
    } else {
      firstTrySummary.classList.add('hidden');
    }
  }

  if (reviewList) {
    reviewList.innerHTML = '';
    
    const questionWrongCount = {};
    run.order.forEach(q => {
      questionWrongCount[q.id] = (questionWrongCount[q.id] || 0) + 1;
    });
    
    const maxWrong = Math.max(...Object.values(questionWrongCount));
    
    const sortedQuestions = [...run.order].sort((a, b) => {
      const ansA = run.answered.get(a.id);
      const ansB = run.answered.get(b.id);
      
      if (ansA?.correct !== ansB?.correct) {
        return ansA?.correct ? 1 : -1;
      }
      
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

      const qEl = document.createElement('div'); 
      qEl.className = 'rev-q'; 
      qEl.textContent = q.stem;
      
      const wrongCountEl = document.createElement('div'); 
      wrongCountEl.className = 'rev-wrong-count';
      const wrongCount = Math.max(0, questionWrongCount[q.id] - 1);
      wrongCountEl.textContent = `Times marked wrong: ${wrongCount}`;
      
      const colorClass = getColorClass(wrongCount, maxWrong);
      if (colorClass) {
        wrongCountEl.classList.add(colorClass);
      }
      
      const caEl = document.createElement('div'); 
      caEl.className = 'rev-ans';
      caEl.innerHTML = `<strong>Correct Answer:</strong> ${escapeHTML(q.display_answer)}`;
      
      const rEl = document.createElement('div'); 
      rEl.className = 'rev-rationale';
      rEl.innerHTML = `<strong>Rationale:</strong> ${escapeHTML(q.rationale || '')}`;

      row.appendChild(qEl); 
      row.appendChild(wrongCountEl);
      row.appendChild(caEl); 
      row.appendChild(rEl);
      reviewList.appendChild(row);
    });
  }
}

/* ---------- Event wiring ---------- */
if (lengthBtns) {
  lengthBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn'); 
    if (!btn) return;
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active')?'true':'false'));
  });
}

if (startBtn) {
  startBtn.addEventListener('click', startQuiz);
}

if (submitBtn) {
  submitBtn.addEventListener('click', handleSubmitClick);
}

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

  const userAnswers = getUserAnswers();
  const correctAnswers = q.answer;
  
  // Check each blank individually
  const blankResults = userAnswers.map((userAns, idx) => {
    return checkAnswer(userAns, correctAnswers[idx] || '');
  });
  
  const isCorrect = blankResults.every(r => r === true);

  recordAnswer(q, userAnswers, isCorrect, blankResults);

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
    feedback.textContent = isCorrect ? 'Correct!' : 'Incorrect';
    feedback.classList.remove('ok','bad', 'hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  // Update individual input statuses
  blankResults.forEach((result, idx) => {
    const input = document.getElementById(`answer-${idx}`);
    const status = document.getElementById(`status-${idx}`);
    
    if (input) {
      input.disabled = true;
      input.classList.remove('correct', 'incorrect');
      input.classList.add(result ? 'correct' : 'incorrect');
    }
    
    if (status) {
      status.textContent = result ? '✓' : '✗';
      status.className = 'input-status ' + (result ? 'correct' : 'incorrect');
    }
  });

  // Show correct answer
  if (answerLine) {
    answerLine.innerHTML = `<strong>Correct Answer:</strong> ${escapeHTML(q.display_answer)}`;
    answerLine.classList.remove('hidden');
  }
  
  if (rationaleBox) {
    rationaleBox.textContent = q.rationale || '';
    rationaleBox.classList.remove('hidden');
  }

  setActionState('next');
  scrollToBottomSmooth();
  updateCounters();
}

if (resetAll) {
  resetAll.addEventListener('click', () => { location.reload(); });
}

if (restartBtn2) {
  restartBtn2.addEventListener('click', () => { location.reload(); });
}

if (retryMissedBtn) {
  retryMissedBtn.addEventListener('click', () => {
    startRetryQuiz(lastQuizMissedQuestions);
  });
}

/* ---------- Progress bar update ---------- */
function updateProgressBar() {
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;
  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
    // Transition from blue to green
    const r = Math.round(47 + (76 - 47) * (percentage / 100));
    const g = Math.round(97 + (175 - 97) * (percentage / 100));
    const b = Math.round(243 + (80 - 243) * (percentage / 100));
    progressFill.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }
  if (progressLabel) progressLabel.textContent = `${percentage}% mastered`;
  if (progressBar) progressBar.setAttribute('aria-valuenow', percentage);
}

/* ---------- Init ---------- */
// Auto-detect module from URL and set title
const moduleFromPath = getModuleFromPath();
if (moduleFromPath) {
  const quizTitle = $('quizTitle');
  if (quizTitle) {
    quizTitle.textContent = 'Lab Values - Fill in the Blank';
  }
}
