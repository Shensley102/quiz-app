/* -----------------------------------------------------------
   Fill-in-the-Blank Quiz - Lab Values
   - Text input validation
   - Exact answer matching with flexible spacing
   - Case-insensitive comparison
   - Two-part answer support (ranges)
   - Color-coded input feedback
   - Progress tracking
   - LocalStorage persistence
----------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

// DOM elements
const startBtn = $('startBtn');
const setupCard = $('setup');
const quizCard = $('quiz');
const summaryCard = $('summary');
const lengthBtns = $('lengthBtns');

const questionText = $('questionText');
const answerInputs = $('answerInputs');
const submitBtn = $('submitBtn');
const feedback = $('feedback');
const answerLine = $('answerLine');
const rationale = $('rationale');

const runCounter = $('runCounter');
const remainingCounter = $('remainingCounter');
const progressFill = $('progressFill');
const progressLabel = $('progressLabel');

const restartBtn = $('restartBtn');
const resetAllBtn = $('resetAll');
const retryMissedBtn = $('retryMissedBtn');
const firstTrySummary = $('firstTrySummary');
const reviewList = $('reviewList');

/* ---------- State ---------- */
let allQuestions = [];
let run = {
  order: [],
  masterPool: [],
  i: 0,
  answered: new Map(),
  uniqueSeen: new Set(),
  wrongSinceLast: [],
  totalQuestionsAnswered: 0,
  isFullBank: false,
  isRetry: false,
};

let lastQuizMissedQuestions = [];

/* ---------- Persistence ---------- */
const STORAGE_KEY = 'fillBlankRunState_v1';

function serializeRun() {
  if (!run || !run.order?.length) return null;
  return JSON.stringify({
    order: run.order.map(q => ({ id: q.id, question: q.question, answer: q.answer, display_answer: q.display_answer, rationale: q.rationale })),
    masterPool: run.masterPool.map(q => q.id),
    i: run.i,
    answered: Array.from(run.answered.entries()),
    uniqueSeen: Array.from(run.uniqueSeen),
    wrongSinceLast: run.wrongSinceLast.map(q => q.id),
    totalQuestionsAnswered: run.totalQuestionsAnswered,
    isFullBank: run.isFullBank,
    isRetry: run.isRetry,
  });
}

function saveRunState() {
  try {
    const s = serializeRun();
    if (s) localStorage.setItem(STORAGE_KEY, s);
  } catch {}
}

function loadRunState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    const qById = new Map();
    const restoredOrder = (data.order || []).map(q => {
      const qq = { id: q.id, question: q.question, answer: q.answer, display_answer: q.display_answer, rationale: q.rationale };
      qById.set(qq.id, qq);
      return qq;
    });
    const idToQ = (id) => qById.get(id) || null;

    const restored = {
      order: restoredOrder,
      masterPool: (data.masterPool || []).map(idToQ).filter(Boolean),
      i: Math.max(0, parseInt(data.i || 0, 10)),
      answered: new Map(Array.isArray(data.answered) ? data.answered : []),
      uniqueSeen: new Set(Array.isArray(data.uniqueSeen) ? data.uniqueSeen : []),
      wrongSinceLast: (data.wrongSinceLast || []).map(idToQ).filter(Boolean),
      totalQuestionsAnswered: Math.max(0, parseInt(data.totalQuestionsAnswered || 0, 10)),
      isFullBank: Boolean(data.isFullBank),
      isRetry: Boolean(data.isRetry),
    };
    return restored;
  } catch {
    return null;
  }
}

function clearSavedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/* ---------- Utilities ---------- */
const randomInt = (n) => Math.floor(Math.random() * n);

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleQuestions(all, req) {
  const a = all.slice();
  if (req === 'full' || req >= a.length) return shuffleInPlace(a);
  const k = Math.max(0, req | 0);
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(a.length - i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

function escapeHTML(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function scrollToBottomSmooth() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    });
  });
}

function scrollToQuizTop() {
  if (!quizCard) return;
  quizCard.scrollIntoView({ behavior: 'auto', block: 'start' });
}

/* ---------- Answer validation ---------- */
function normalizeAnswer(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s.-]/g, '');
}

function isAnswerCorrect(userAnswers, correctAnswers) {
  if (!Array.isArray(userAnswers) || !Array.isArray(correctAnswers)) return false;

  if (userAnswers.length !== correctAnswers.length) return false;

  const normalized = userAnswers.map(normalizeAnswer).sort();
  const expectedNormalized = correctAnswers.map(normalizeAnswer).sort();

  return normalized.every((ans, idx) => {
    const expected = expectedNormalized[idx];
    return ans === expected || ans.includes(expected) || expected.includes(ans);
  });
}

/* ---------- Render question ---------- */
function renderQuestion(q) {
  if (!questionText || !answerInputs) return;

  questionText.textContent = q.question;
  answerInputs.innerHTML = '';

  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'feedback hidden';
  }
  if (answerLine) {
    answerLine.innerHTML = '';
    answerLine.classList.add('hidden');
  }
  if (rationale) {
    rationale.textContent = '';
    rationale.classList.add('hidden');
  }

  const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
  const inputCount = answers.length;

  const inputsContainer = document.createElement('div');
  inputsContainer.className = 'fill-blank-inputs';

  answers.forEach((_, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';

    const label = document.createElement('label');
    label.textContent = inputCount > 1 ? `Blank ${idx + 1}:` : 'Answer:';
    label.className = 'input-label';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fill-blank-input';
    input.id = `answer-${idx}`;
    input.placeholder = 'Type your answer';
    input.autocomplete = 'off';

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    inputsContainer.appendChild(wrapper);
  });

  answerInputs.appendChild(inputsContainer);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submit Answer';
    submitBtn.dataset.mode = 'submit';
  }
}

function getUserAnswers() {
  const inputs = answerInputs?.querySelectorAll('.fill-blank-input') || [];
  return Array.from(inputs).map(inp => inp.value.trim()).filter(v => v.length > 0);
}

function getAllAnswerInputs() {
  return answerInputs?.querySelectorAll('.fill-blank-input') || [];
}

function onInputChanged() {
  if (!submitBtn) return;
  const inputs = getAllAnswerInputs();
  const allFilled = Array.from(inputs).every(inp => inp.value.trim().length > 0);
  submitBtn.disabled = !allFilled;
}

/* ---------- Get current question ---------- */
function currentQuestion() {
  return run.order?.[run.i] || null;
}

/* ---------- Get not mastered ---------- */
function getNotMastered() {
  return run.masterPool.filter(q => !run.answered.get(q.id)?.correct);
}

/* ---------- Next index ---------- */
function nextIndex() {
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

/* ---------- Update counters ---------- */
function updateCounters() {
  const remaining = getNotMastered().length;
  const total = run.masterPool.length;

  if (runCounter) runCounter.textContent = `Question: ${run.totalQuestionsAnswered}`;
  if (remainingCounter) remainingCounter.textContent = `Remaining to master: ${remaining}`;

  const masteredCount = total - remaining;
  const percentage = total ? Math.floor((masteredCount / total) * 100) : 0;

  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressLabel) progressLabel.textContent = `${percentage}% mastered`;

  const r = Math.round(47 + (76 - 47) * (percentage / 100));
  const g = Math.round(97 + (175 - 97) * (percentage / 100));
  const b = Math.round(243 + (80 - 243) * (percentage / 100));
  if (progressFill) progressFill.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

  saveRunState();
}

/* ---------- Record answer ---------- */
function recordAnswer(q, userAnswers, isCorrect) {
  const firstTime = !run.answered.has(q.id);
  const entry = run.answered.get(q.id) || { firstTryCorrect: null, correct: false, userAnswers: [] };
  if (firstTime) entry.firstTryCorrect = !!isCorrect;
  entry.correct = !!isCorrect;
  entry.userAnswers = userAnswers.slice();
  run.answered.set(q.id, entry);
}

/* ---------- Start quiz ---------- */
async function startQuiz() {
  if (!lengthBtns || !startBtn) return;

  const lenBtn = lengthBtns.querySelector('.seg-btn.active');
  if (!lenBtn) {
    alert('Pick Length Of Quiz Before Starting');
    lengthBtns.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const qty = lenBtn.dataset.len === 'full' ? 'full' : parseInt(lenBtn.dataset.len, 10);
  const isFullBank = qty === 'full';

  startBtn.disabled = true;

  try {
    let rawData;

    if (window.storedPreloadedData && window.storedPreloadedData.moduleName === 'NCLEX_Lab_Values_Fill_In_The_Blank') {
      rawData = window.storedPreloadedData.questions;
    } else {
      const moduleName = 'NCLEX_Lab_Values_Fill_In_The_Blank';
      const jsonUrl = `/modules/Lab_Values/${moduleName}.json`;

      const res = await fetch(jsonUrl, { cache: 'no-store' });
      if (!res.ok) {
        alert(`Could not load quiz data (${res.status})`);
        startBtn.disabled = false;
        return;
      }
      rawData = await res.json();
    }

    allQuestions = Array.isArray(rawData) ? rawData : (rawData.questions || []);

    const sampled = sampleQuestions(allQuestions, qty);

    run = {
      order: [...sampled],
      masterPool: [...sampled],
      i: 0,
      answered: new Map(),
      uniqueSeen: new Set(),
      wrongSinceLast: [],
      totalQuestionsAnswered: 1,
      isFullBank: isFullBank,
      isRetry: false,
    };

    if (setupCard) setupCard.classList.add('hidden');
    if (summaryCard) summaryCard.classList.add('hidden');
    if (quizCard) quizCard.classList.remove('hidden');

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

/* ---------- Handle submit ---------- */
function handleSubmit() {
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
  const correctAnswers = Array.isArray(q.answer) ? q.answer : [q.answer];
  const isCorrect = isAnswerCorrect(userAnswers, correctAnswers);

  recordAnswer(q, userAnswers, isCorrect);

  if (!isCorrect) {
    run.wrongSinceLast.push(q);
  }

  if (feedback) {
    feedback.textContent = isCorrect ? '✓ Correct!' : '✗ Incorrect';
    feedback.classList.remove('hidden');
    feedback.classList.add(isCorrect ? 'ok' : 'bad');
  }

  if (answerLine) {
    answerLine.innerHTML = `<strong>Correct Answer:</strong> ${escapeHTML(q.display_answer || String(q.answer))}`;
    answerLine.classList.remove('hidden');
  }

  if (rationale) {
    rationale.textContent = q.rationale || '';
    rationale.classList.remove('hidden');
  }

  const inputs = getAllAnswerInputs();
  inputs.forEach(inp => inp.disabled = true);

  if (submitBtn) {
    submitBtn.textContent = 'Next';
    submitBtn.dataset.mode = 'next';
    submitBtn.disabled = false;
  }

  scrollToBottomSmooth();
  updateCounters();
}

/* ---------- End run ---------- */
function endRun() {
  if (quizCard) quizCard.classList.add('hidden');
  if (summaryCard) summaryCard.classList.remove('hidden');

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
      if (missedCount) {
        missedCount.textContent = lastQuizMissedQuestions.length;
      }
    } else {
      retryMissedBtn.classList.add('hidden');
    }
  }

  if (firstTrySummary) {
    if (totalUnique > 0) {
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

    const maxWrong = Math.max(...Object.values(questionWrongCount), 1);

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
      qEl.textContent = q.question;

      const wrongCountEl = document.createElement('div');
      wrongCountEl.className = 'rev-wrong-count';
      const wrongCount = Math.max(0, questionWrongCount[q.id] - 1);
      wrongCountEl.textContent = `Times marked wrong: ${wrongCount}`;

      const caEl = document.createElement('div');
      caEl.className = 'rev-ans';
      caEl.innerHTML = `<strong>Correct Answer:</strong> ${escapeHTML(q.display_answer || String(q.answer))}`;

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

  clearSavedState();
}

/* ---------- Event listeners ---------- */
if (lengthBtns) {
  lengthBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

if (startBtn) {
  startBtn.addEventListener('click', startQuiz);
}

if (answerInputs) {
  answerInputs.addEventListener('input', onInputChanged);
}

if (submitBtn) {
  submitBtn.addEventListener('click', handleSubmit);
}

if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    location.reload();
  });
}

if (resetAllBtn) {
  resetAllBtn.addEventListener('click', () => {
    clearSavedState();
    location.reload();
  });
}

if (retryMissedBtn) {
  retryMissedBtn.addEventListener('click', () => {
    if (!lastQuizMissedQuestions.length) return;

    const shuffled = shuffleInPlace([...lastQuizMissedQuestions]);

    run = {
      order: [...shuffled],
      masterPool: [...shuffled],
      i: 0,
      answered: new Map(),
      uniqueSeen: new Set(),
      wrongSinceLast: [],
      totalQuestionsAnswered: 1,
      isFullBank: false,
      isRetry: true,
    };

    if (setupCard) setupCard.classList.add('hidden');
    if (summaryCard) summaryCard.classList.add('hidden');
    if (quizCard) quizCard.classList.remove('hidden');

    const q0 = run.order[0];
    run.uniqueSeen.add(q0.id);
    renderQuestion(q0);
    updateCounters();
  });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const saved = loadRunState();
  if (saved && saved.order?.length && saved.isFullBank && !saved.isRetry) {
    run = saved;
    const resumeContainer = document.getElementById('resumeContainer');
    if (resumeContainer) {
      resumeContainer.classList.remove('hidden');
      const remainingQuestions = getNotMastered().length;
      const remainingCountEl = document.getElementById('remainingQuestionsCount');
      if (remainingCountEl) {
        remainingCountEl.textContent = `${remainingQuestions} questions remaining`;
      }
      const resumeBtn = document.getElementById('resumeBtn');
      if (resumeBtn) {
        resumeBtn.onclick = () => {
          if (setupCard) setupCard.classList.add('hidden');
          if (summaryCard) summaryCard.classList.add('hidden');
          if (quizCard) quizCard.classList.remove('hidden');

          const q = currentQuestion();
          if (q) {
            run.uniqueSeen.add(q.id);
            renderQuestion(q);
            updateCounters();
          }
        };
      }
    }
  }
});
