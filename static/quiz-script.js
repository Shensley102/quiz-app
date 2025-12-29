/* -----------------------------------------------------------
   Study Guru Quiz App (quiz-script.js)
   Compatible with quiz.html template
   
   Features:
   - Preloaded data support (window.preloadedQuizData)
   - Auto-start from URL parameters
   - NCLEX weighted category selection
   - Least-asked question prioritization
   - Progress tracking via StudyGuruProgress
   - Mastery-based requeue system
   - Resume quiz support
   
   PATCH NOTES:
   - Fixed progress store API compatibility (answeredThisWeek, clearAll)
   - Added preloaded quiz data support for NCLEX pages
   - Added NCLEX weighted question selection
   - Retry runs don't increment weekly count
------------------------------------------------------------ */

(function () {
  'use strict';

  // -----------------------------------------------------------
  // NCLEX Category Weights (Official NCLEX-RN Test Plan)
  // -----------------------------------------------------------
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

  // -----------------------------------------------------------
  // State
  // -----------------------------------------------------------
  const state = {
    questions: [],
    moduleName: '',
    category: '',
    isComprehensive: false,
    isCategoryQuiz: false,
    quizLength: 10,
    autostart: false
  };

  // Current quiz run
  let run = null;

  // Element cache
  const els = {};

  // -----------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------
  function $(sel) {
    return document.querySelector(sel);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getProgressStore() {
    return window.StudyGuruProgress || null;
  }

  // -----------------------------------------------------------
  // Weighted Question Selection
  // -----------------------------------------------------------
  function selectQuestionsWithWeighting(allQuestions, quizLength, isComprehensive, isCategoryQuiz) {
    console.log('[Quiz] selectQuestionsWithWeighting:', {
      totalQuestions: allQuestions.length,
      quizLength,
      isComprehensive,
      isCategoryQuiz
    });

    const store = getProgressStore();
    const attemptsMap = store && store.getAttemptsMap ? store.getAttemptsMap() : {};

    function sortByLeastAttempts(questions) {
      return [...questions].sort((a, b) => {
        const attemptsA = attemptsMap[a.id] || 0;
        const attemptsB = attemptsMap[b.id] || 0;
        if (attemptsA !== attemptsB) return attemptsA - attemptsB;
        return Math.random() - 0.5;
      });
    }

    function selectWithRatio(questions, count) {
      if (count <= 0 || questions.length === 0) return [];
      if (questions.length <= count) return shuffle([...questions]);

      const sorted = sortByLeastAttempts(questions);
      const halfCount = Math.ceil(count / 2);
      const leastAsked = sorted.slice(0, halfCount);
      const remainder = sorted.slice(halfCount);
      const randomPick = shuffle(remainder).slice(0, count - halfCount);

      return shuffle([...leastAsked, ...randomPick]);
    }

    // 10Q comprehensive: 100% least-asked
    if (isComprehensive && quizLength === 10) {
      console.log('[Quiz] Using 100% least-asked selection for 10Q');
      const sorted = sortByLeastAttempts(allQuestions);
      return sorted.slice(0, Math.min(quizLength, allQuestions.length));
    }

    // Category quiz: 1:1 ratio
    if (isCategoryQuiz) {
      console.log('[Quiz] Using 1:1 ratio for category quiz');
      return selectWithRatio(allQuestions, quizLength);
    }

    // Comprehensive 25/50/100Q: NCLEX weighted
    if (isComprehensive && quizLength > 10) {
      console.log('[Quiz] Using NCLEX weighted selection for', quizLength, 'questions');

      const byCategory = {};
      allQuestions.forEach(q => {
        const cat = q.category || 'Uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(q);
      });

      const selected = [];

      for (const [category, weight] of Object.entries(NCLEX_CATEGORY_WEIGHTS)) {
        const categoryQuestions = byCategory[category] || [];
        if (categoryQuestions.length === 0) continue;

        const targetCount = Math.round(quizLength * weight);
        if (targetCount === 0) continue;

        const categorySelected = selectWithRatio(categoryQuestions, targetCount);
        selected.push(...categorySelected);
        console.log(`[Quiz] ${category}: target=${targetCount}, selected=${categorySelected.length}`);
      }

      // Fill if needed
      if (selected.length < quizLength) {
        const selectedIds = new Set(selected.map(q => q.id));
        const remaining = allQuestions.filter(q => !selectedIds.has(q.id));
        const extra = selectWithRatio(remaining, quizLength - selected.length);
        selected.push(...extra);
      }

      return shuffle(selected).slice(0, quizLength);
    }

    // Default: 1:1 ratio
    return selectWithRatio(allQuestions, quizLength);
  }

  // -----------------------------------------------------------
  // Question ID normalization
  // -----------------------------------------------------------
  function ensureQuestionId(q, index) {
    if (!q.id) {
      const base = (q.question || q.prompt || '').slice(0, 60);
      let hash = 0;
      for (let i = 0; i < base.length; i++) {
        hash = ((hash << 5) - hash) + base.charCodeAt(i);
        hash |= 0;
      }
      q.id = `q_${Math.abs(hash).toString(36)}_${index}`;
    }
    return q;
  }

  // -----------------------------------------------------------
  // Element Caching
  // -----------------------------------------------------------
  function cacheElements() {
    els.launcher = $('#launcher');
    els.quiz = $('#quiz');
    els.summary = $('#summary');

    els.moduleSel = $('#moduleSel');
    els.lengthBtns = $('#lengthBtns');
    els.startBtn = $('#startBtn');
    els.resumeBtn = $('#resumeBtn');

    els.questionText = $('#questionText');
    els.optionsForm = $('#optionsForm');
    els.submitBtn = $('#submitBtn');
    els.feedback = $('#feedback');
    els.rationale = $('#rationale');
    els.answerLine = $('#answerLine');

    els.progressFill = $('#progressFill');
    els.progressLabel = $('#progressLabel');
    els.runCounter = $('#runCounter');
    els.remainingCounter = $('#remainingCounter');
    els.countersBox = $('#countersBox');

    els.firstTrySummary = $('#firstTrySummary');
    els.reviewList = $('#reviewList');
    els.retryMissedBtn = $('#retryMissedBtn');
    els.restartBtnSummary = $('#restartBtnSummary');
    els.summaryActions = $('#summaryActions');
  }

  // -----------------------------------------------------------
  // View Management
  // -----------------------------------------------------------
  function showView(viewName) {
    if (els.launcher) els.launcher.classList.toggle('hidden', viewName !== 'launcher');
    if (els.quiz) els.quiz.classList.toggle('hidden', viewName !== 'quiz');
    if (els.summary) els.summary.classList.toggle('hidden', viewName !== 'summary');
  }

  // -----------------------------------------------------------
  // Quiz Building
  // -----------------------------------------------------------
  function buildRun(questions, opts = {}) {
    const normalized = questions.map((q, i) => ensureQuestionId({ ...q }, i));

    const requested = opts.count || 10;
    const isComprehensive = opts.isComprehensive || state.isComprehensive;
    const isCategoryQuiz = opts.isCategoryQuiz || state.isCategoryQuiz;

    let selected;
    if (opts.isRetry) {
      // Retry: use questions as-is
      selected = shuffle(normalized);
    } else if (isComprehensive || isCategoryQuiz) {
      selected = selectQuestionsWithWeighting(normalized, requested, isComprehensive, isCategoryQuiz);
    } else {
      selected = shuffle(normalized).slice(0, Math.min(requested, normalized.length));
    }

    return {
      isRetry: !!opts.isRetry,
      isComprehensive,
      isCategoryQuiz,
      quizLength: selected.length,
      queue: selected.slice(),
      missedQueue: [],
      mastered: new Set(),
      correctFirstTry: 0,
      incorrectFirstTry: 0,
      totalAttempts: 0,
      questionNumber: 0,
      current: null,
      answered: false,
      perQuestion: [],
      requeueThreshold: 3,
      requeueBatchSize: 3
    };
  }

  // -----------------------------------------------------------
  // Quiz Flow
  // -----------------------------------------------------------
  function startQuiz() {
    if (!state.questions || state.questions.length === 0) {
      alert('No questions available.');
      return;
    }

    run = buildRun(state.questions, {
      count: state.quizLength,
      isComprehensive: state.isComprehensive,
      isCategoryQuiz: state.isCategoryQuiz,
      isRetry: false
    });

    console.log('[Quiz] Starting quiz with', run.quizLength, 'questions');
    clearResumeData();
    showView('quiz');
    if (els.countersBox) els.countersBox.classList.remove('hidden');
    nextQuestion();
  }

  function startRetryQuiz() {
    if (!run) return;

    const missed = run.perQuestion
      .filter(p => !p.correct)
      .map(p => p.questionObj)
      .filter(Boolean);

    if (missed.length === 0) {
      alert('No missed questions to retry.');
      return;
    }

    run = buildRun(missed, {
      count: missed.length,
      isRetry: true
    });

    console.log('[Quiz] Starting retry with', run.quizLength, 'questions');
    showView('quiz');
    if (els.countersBox) els.countersBox.classList.remove('hidden');
    nextQuestion();
  }

  function nextQuestion() {
    if (!run) return;

    // Check if done
    if (run.queue.length === 0) {
      finishQuiz();
      return;
    }

    // Get next question
    const q = run.queue.shift();
    run.current = q;
    run.answered = false;
    run.questionNumber++;

    // Update UI
    updateProgress();
    renderQuestion(q);

    // Save for resume
    saveResumeData();
  }

  function updateProgress() {
    const total = run.quizLength;
    const mastered = run.mastered.size;
    const remaining = run.queue.length;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    if (els.progressFill) els.progressFill.style.width = `${pct}%`;
    if (els.progressLabel) els.progressLabel.textContent = `${pct}% mastered`;
    if (els.runCounter) els.runCounter.textContent = `Question ${run.questionNumber} of ${total}`;
    if (els.remainingCounter) els.remainingCounter.textContent = `${remaining} remaining`;
  }

  function renderQuestion(q) {
    // Clear previous
    if (els.feedback) {
      els.feedback.classList.add('hidden');
      els.feedback.textContent = '';
      els.feedback.className = 'feedback hidden';
    }
    if (els.rationale) {
      els.rationale.classList.add('hidden');
      els.rationale.textContent = '';
    }
    if (els.answerLine) {
      els.answerLine.classList.add('hidden');
      els.answerLine.textContent = '';
    }

    // Show question
    if (els.questionText) {
      els.questionText.textContent = q.question || q.prompt || q.text || '(No question text)';
    }

    // Render options
    if (els.optionsForm) {
      els.optionsForm.innerHTML = '';

      const choices = q.choices || q.options || [];
      const shuffledChoices = shuffle(choices.map((c, i) => ({
        text: typeof c === 'string' ? c : (c.text || c.label || ''),
        originalIndex: i,
        correct: typeof c === 'object' ? c.correct : false
      })));

      shuffledChoices.forEach((choice, idx) => {
        const label = document.createElement('label');
        label.className = 'option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'answer';
        input.value = idx;
        input.dataset.originalIndex = choice.originalIndex;
        input.dataset.correct = choice.correct;
        input.dataset.text = choice.text;

        const span = document.createElement('span');
        span.textContent = choice.text;

        label.appendChild(input);
        label.appendChild(span);
        els.optionsForm.appendChild(label);

        // Enable submit when an option is selected
        input.addEventListener('change', () => {
          if (els.submitBtn) els.submitBtn.disabled = false;
        });
      });
    }

    // Reset submit button
    if (els.submitBtn) {
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Submit';
      els.submitBtn.dataset.mode = 'submit';
    }
  }

  function handleSubmit() {
    if (!run || !run.current) return;

    const mode = els.submitBtn?.dataset.mode;

    if (mode === 'submit') {
      // Submit answer
      const selected = els.optionsForm?.querySelector('input[name="answer"]:checked');
      if (!selected) return;

      run.answered = true;
      run.totalAttempts++;

      const q = run.current;
      const isCorrect = checkAnswer(selected, q);

      // Record attempt
      let rec = run.perQuestion.find(p => p.id === q.id);
      if (!rec) {
        rec = { id: q.id, correct: null, attempts: 0, questionObj: q };
        run.perQuestion.push(rec);
      }
      rec.attempts++;

      if (isCorrect) {
        if (rec.correct === null) {
          rec.correct = true;
          run.correctFirstTry++;
        }
        run.mastered.add(q.id);
        showFeedback(true, q);
      } else {
        if (rec.correct === null) {
          rec.correct = false;
          run.incorrectFirstTry++;
        }
        run.missedQueue.push(q);

        // Requeue if threshold reached
        if (run.missedQueue.length >= run.requeueThreshold) {
          const batch = run.missedQueue.splice(0, run.requeueBatchSize);
          run.queue = batch.concat(run.queue);
        }

        showFeedback(false, q, selected.dataset.text);
      }

      // Change button to Next
      if (els.submitBtn) {
        els.submitBtn.textContent = 'Next Question';
        els.submitBtn.dataset.mode = 'next';
        els.submitBtn.disabled = false;
      }

      // Disable options
      els.optionsForm?.querySelectorAll('input').forEach(inp => {
        inp.disabled = true;
      });

      updateProgress();
      saveResumeData();

    } else if (mode === 'next') {
      nextQuestion();
    }
  }

  function checkAnswer(selectedInput, q) {
    // Check if choice has correct property
    if (selectedInput.dataset.correct === 'true') return true;

    // Check against q.answer or q.correct
    const answer = q.answer ?? q.correct ?? q.correctAnswer;
    if (answer == null) return false;

    const originalIndex = parseInt(selectedInput.dataset.originalIndex, 10);
    const selectedText = selectedInput.dataset.text;

    // If answer is a number (index)
    if (typeof answer === 'number') {
      return originalIndex === answer;
    }

    // If answer is a string
    if (typeof answer === 'string') {
      return selectedText.trim().toLowerCase() === answer.trim().toLowerCase();
    }

    return false;
  }

  function showFeedback(isCorrect, q, userAnswer = null) {
    if (!els.feedback) return;

    els.feedback.classList.remove('hidden');

    if (isCorrect) {
      els.feedback.className = 'feedback correct';
      els.feedback.textContent = '✅ Correct!';
    } else {
      els.feedback.className = 'feedback incorrect';
      const correctAnswer = getCorrectAnswerText(q);
      els.feedback.textContent = `❌ Incorrect.`;

      if (els.answerLine && correctAnswer) {
        els.answerLine.classList.remove('hidden');
        els.answerLine.textContent = `Correct answer: ${correctAnswer}`;
      }
    }

    // Show rationale if available
    if (els.rationale && q.rationale) {
      els.rationale.classList.remove('hidden');
      els.rationale.textContent = q.rationale;
    }
  }

  function getCorrectAnswerText(q) {
    const choices = q.choices || q.options || [];
    const answer = q.answer ?? q.correct ?? q.correctAnswer;

    // Check for choice with correct: true
    for (const c of choices) {
      if (typeof c === 'object' && c.correct === true) {
        return c.text || c.label || '';
      }
    }

    // If answer is an index
    if (typeof answer === 'number' && choices[answer]) {
      const c = choices[answer];
      return typeof c === 'string' ? c : (c.text || c.label || '');
    }

    // If answer is a string
    if (typeof answer === 'string') {
      return answer;
    }

    return '';
  }

  // -----------------------------------------------------------
  // Quiz Completion
  // -----------------------------------------------------------
  function finishQuiz() {
    console.log('[Quiz] Quiz complete');

    showView('summary');

    const total = run.quizLength;
    const correct = run.correctFirstTry;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Summary text
    if (els.firstTrySummary) {
      els.firstTrySummary.innerHTML = `
        <div class="summary-stat">
          <span class="stat-value">${correct}/${total}</span>
          <span class="stat-label">Correct First Try (${pct}%)</span>
        </div>
      `;
    }

    // Show/hide retry button
    const missedCount = run.perQuestion.filter(p => !p.correct).length;
    if (els.retryMissedBtn) {
      els.retryMissedBtn.classList.toggle('hidden', missedCount === 0);
    }

    // Build review list
    if (els.reviewList) {
      els.reviewList.innerHTML = '';

      run.perQuestion.forEach(p => {
        const q = p.questionObj;
        if (!q) return;

        const div = document.createElement('div');
        div.className = `review-item ${p.correct ? 'review-correct' : 'review-incorrect'}`;

        const correctAnswer = getCorrectAnswerText(q);

        div.innerHTML = `
          <div class="review-question">${p.correct ? '✅' : '❌'} ${q.question || q.prompt || ''}</div>
          <div class="review-correct-answer"><strong>Answer:</strong> ${correctAnswer}</div>
          ${q.rationale ? `<div class="review-rationale"><strong>Rationale:</strong> ${q.rationale}</div>` : ''}
        `;

        els.reviewList.appendChild(div);
      });
    }

    // Add return button
    if (els.summaryActions && window.backUrl) {
      let returnBtn = els.summaryActions.querySelector('.return-btn');
      if (!returnBtn) {
        returnBtn = document.createElement('a');
        returnBtn.className = 'return-btn';
        returnBtn.href = window.backUrl;
        returnBtn.textContent = `← Return to ${window.backLabel || 'Home'}`;
        els.summaryActions.appendChild(returnBtn);
      }
    }

    // Record to progress store
    const store = getProgressStore();
    if (store) {
      // Only count non-retry quizzes toward weekly total
      if (!run.isRetry && store.recordCompletedQuiz) {
        store.recordCompletedQuiz(total);
        console.log(`[Quiz] Recorded ${total} questions to weekly count`);
      }

      // Record attempts for least-asked tracking
      if (store.recordQuizAttempts) {
        const ids = run.perQuestion.map(p => p.id).filter(Boolean);
        store.recordQuizAttempts(ids);
      }

      // Record category scores
      if (store.recordCategoryScore) {
        const categoryResults = {};
        run.perQuestion.forEach(p => {
          const cat = p.questionObj?.category;
          if (!cat) return;
          if (!categoryResults[cat]) categoryResults[cat] = { correct: 0, total: 0 };
          categoryResults[cat].total++;
          if (p.correct) categoryResults[cat].correct++;
        });

        for (const [cat, res] of Object.entries(categoryResults)) {
          const catPct = Math.round((res.correct / res.total) * 100);
          store.recordCategoryScore(cat, catPct);
        }
      }
    }

    clearResumeData();
  }

  // -----------------------------------------------------------
  // Resume Support
  // -----------------------------------------------------------
  const RESUME_KEY = 'study_guru_resume_v2';

  function saveResumeData() {
    if (!run) return;

    const data = {
      moduleName: state.moduleName,
      category: state.category,
      isComprehensive: run.isComprehensive,
      isCategoryQuiz: run.isCategoryQuiz,
      isRetry: run.isRetry,
      quizLength: run.quizLength,
      queue: run.queue,
      missedQueue: run.missedQueue,
      mastered: Array.from(run.mastered),
      correctFirstTry: run.correctFirstTry,
      incorrectFirstTry: run.incorrectFirstTry,
      totalAttempts: run.totalAttempts,
      questionNumber: run.questionNumber,
      perQuestion: run.perQuestion.map(p => ({
        id: p.id,
        correct: p.correct,
        attempts: p.attempts,
        questionObj: p.questionObj
      }))
    };

    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Quiz] Failed to save resume data:', e);
    }
  }

  function loadResumeData() {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearResumeData() {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch (e) {}
  }

  function resumeQuiz() {
    const data = loadResumeData();
    if (!data) return;

    run = {
      isRetry: data.isRetry || false,
      isComprehensive: data.isComprehensive || false,
      isCategoryQuiz: data.isCategoryQuiz || false,
      quizLength: data.quizLength || 10,
      queue: data.queue || [],
      missedQueue: data.missedQueue || [],
      mastered: new Set(data.mastered || []),
      correctFirstTry: data.correctFirstTry || 0,
      incorrectFirstTry: data.incorrectFirstTry || 0,
      totalAttempts: data.totalAttempts || 0,
      questionNumber: data.questionNumber || 0,
      current: null,
      answered: false,
      perQuestion: data.perQuestion || [],
      requeueThreshold: 3,
      requeueBatchSize: 3
    };

    showView('quiz');
    if (els.countersBox) els.countersBox.classList.remove('hidden');
    nextQuestion();
  }

  function checkResumeAvailable() {
    const data = loadResumeData();
    const available = !!(data && data.queue && data.queue.length > 0);
    if (els.resumeBtn) {
      els.resumeBtn.classList.toggle('hidden', !available);
    }
    return available;
  }

  // -----------------------------------------------------------
  // Event Setup
  // -----------------------------------------------------------
  function setupEvents() {
    // Start button
    if (els.startBtn) {
      els.startBtn.addEventListener('click', startQuiz);
    }

    // Resume button
    if (els.resumeBtn) {
      els.resumeBtn.addEventListener('click', resumeQuiz);
    }

    // Submit/Next button
    if (els.submitBtn) {
      els.submitBtn.addEventListener('click', handleSubmit);
    }

    // Retry missed button
    if (els.retryMissedBtn) {
      els.retryMissedBtn.addEventListener('click', startRetryQuiz);
    }

    // Restart button
    if (els.restartBtnSummary) {
      els.restartBtnSummary.addEventListener('click', () => {
        showView('launcher');
      });
    }

    // Length buttons
    if (els.lengthBtns) {
      els.lengthBtns.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          els.lengthBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const len = btn.dataset.len;
          state.quizLength = len === 'full' ? state.questions.length : parseInt(len, 10);
        });
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && els.submitBtn && !els.submitBtn.disabled) {
        e.preventDefault();
        handleSubmit();
      }
    });
  }

  // -----------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------
  function init() {
    console.log('[Quiz] Initializing...');

    cacheElements();
    setupEvents();

    // Load preloaded data
    if (window.preloadedQuizData && window.preloadedQuizData.questions) {
      const pd = window.preloadedQuizData;

      state.questions = pd.questions;
      state.moduleName = pd.moduleName || '';
      state.category = pd.category || '';
      state.isComprehensive = pd.isComprehensive || false;
      state.isCategoryQuiz = pd.isCategoryQuiz || false;
      state.autostart = pd.autostart || false;

      // Parse quiz length
      const len = pd.quizLength;
      if (len === 'full' || !len) {
        state.quizLength = state.questions.length;
      } else {
        state.quizLength = parseInt(len, 10) || 10;
      }

      console.log('[Quiz] Loaded preloaded data:', {
        questionCount: state.questions.length,
        moduleName: state.moduleName,
        isComprehensive: state.isComprehensive,
        isCategoryQuiz: state.isCategoryQuiz,
        autostart: state.autostart,
        quizLength: state.quizLength
      });

      // Enable start button
      if (els.startBtn) els.startBtn.disabled = false;

      // Hide module selector for preloaded quizzes
      if (els.moduleSel) els.moduleSel.style.display = 'none';
      const moduleLabel = els.launcher?.querySelector('label[for="moduleSel"]');
      if (moduleLabel) moduleLabel.style.display = 'none';

      // Set active length button
      if (els.lengthBtns) {
        els.lengthBtns.querySelectorAll('.seg-btn').forEach(btn => {
          btn.classList.remove('active');
          const btnLen = btn.dataset.len;
          if (btnLen === 'full' && state.quizLength === state.questions.length) {
            btn.classList.add('active');
          } else if (parseInt(btnLen, 10) === state.quizLength) {
            btn.classList.add('active');
          }
        });
      }

      // Auto-start if requested
      if (state.autostart) {
        console.log('[Quiz] Auto-starting quiz...');
        setTimeout(startQuiz, 100);
        return;
      }
    }

    // Check for resume
    checkResumeAvailable();

    // Show launcher
    showView('launcher');
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
