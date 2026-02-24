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
   - Fill-in-the-blank question support
   - Image question support
   
   PATCH NOTES:
   - Percentage-based missed question requeue thresholds
     10Q: unchanged (end-of-queue fallback only)
     25Q: 20% = 5 missed → immediate front-of-queue injection
     50Q: 16% = 8 missed → immediate front-of-queue injection
     100Q: 10% = 10 missed → immediate front-of-queue injection
   - Requeued questions are shuffled (randomized order)
   - Answer positions re-randomized on each render (existing behavior)
   - Requeue counter resets after each injection
   
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

  // Letter labels for options
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

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
  // Requeue Threshold
  // -----------------------------------------------------------
  // Returns the number of missed questions that triggers an
  // immediate front-of-queue injection.
  // 10Q: returns Infinity — no threshold, fallback only
  // 25Q: 20% = 5
  // 50Q: 16% = 8
  // 100Q: 10% = 10
  function getRequeueThreshold(quizLength) {
    if (quizLength <= 10) return Infinity;   // 10Q: no mid-quiz requeue
    if (quizLength <= 25) return Math.round(quizLength * 0.20);  // 25Q → 5
    if (quizLength <= 50) return Math.round(quizLength * 0.16);  // 50Q → 8
    return Math.round(quizLength * 0.10);                        // 100Q → 10
  }

  // -----------------------------------------------------------
  // Question Field Helpers
  // -----------------------------------------------------------
  
  function getQuestionText(q) {
    return q.stem || q.question || q.prompt || q.text || q.content || '(No question text)';
  }

  function getChoices(q) {
    const raw = q.options || q.choices || q.answers || [];
    
    if (Array.isArray(raw)) {
      return raw;
    }
    
    if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw).sort((a, b) => {
        const idxA = LETTERS.indexOf(a.toUpperCase());
        const idxB = LETTERS.indexOf(b.toUpperCase());
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        return a.localeCompare(b);
      });
      return keys.map(k => raw[k]);
    }
    
    return [];
  }

  function getCorrectIndex(q) {
    const choices = getChoices(q);

    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      if (typeof c === 'object' && c.correct === true) {
        return i;
      }
    }

    if (q.correct !== undefined) {
      const correctVal = q.correct;

      if (Array.isArray(correctVal) && correctVal.length > 0) {
        const letter = correctVal[0].toUpperCase();
        return LETTERS.indexOf(letter);
      }
      
      if (typeof correctVal === 'string' && correctVal.length === 1) {
        return LETTERS.indexOf(correctVal.toUpperCase());
      }
      
      if (typeof correctVal === 'number') {
        return correctVal;
      }
    }

    if (q.answer !== undefined) {
      const answer = q.answer;

      if (typeof answer === 'number') {
        return answer;
      }
      
      if (typeof answer === 'string' && answer.length === 1) {
        return LETTERS.indexOf(answer.toUpperCase());
      }
    }

    if (q.correctAnswer !== undefined) {
      const ca = q.correctAnswer;
      if (typeof ca === 'number') return ca;
      if (typeof ca === 'string' && ca.length === 1) {
        return LETTERS.indexOf(ca.toUpperCase());
      }
    }

    return -1;
  }

  function isCorrectAnswer(q, selectedOriginalIndex) {
    const correctIdx = getCorrectIndex(q);
    return correctIdx === selectedOriginalIndex;
  }

  function getCorrectAnswerText(q) {
    const choices = getChoices(q);
    const correctIndices = getCorrectIndices(q);
    
    const answers = correctIndices.map(origIdx => {
      const displayLetter = run?.shuffleMap?.[origIdx] || LETTERS[origIdx];
      const c = choices[origIdx];
      const text = typeof c === 'string' ? c : (c.text || c.label || String(c));
      return { displayLetter, text };
    });
    
    answers.sort((a, b) => a.displayLetter.localeCompare(b.displayLetter));
    
    if (isMultiSelect(q)) {
      return answers.map(a => `${a.displayLetter}: ${a.text}`).join('\n');
    }
    
    return answers.map(a => `${a.displayLetter}. ${a.text}`).join('');
  }

  function isMultiSelect(q) {
    if (q.type === 'multi_select' || q.type === 'multiple_select' || q.type === 'multi-select') {
      return true;
    }
    if (Array.isArray(q.correct) && q.correct.length > 1) {
      return true;
    }
    return false;
  }

  function getCorrectIndices(q) {
    const indices = [];
    
    if (q.correct !== undefined && Array.isArray(q.correct)) {
      q.correct.forEach(val => {
        if (typeof val === 'string' && val.length === 1) {
          const idx = LETTERS.indexOf(val.toUpperCase());
          if (idx !== -1) indices.push(idx);
        } else if (typeof val === 'number') {
          indices.push(val);
        }
      });
    }
    
    if (indices.length === 0) {
      const single = getCorrectIndex(q);
      if (single !== -1) indices.push(single);
    }
    
    return indices;
  }

  function checkAnswerCorrect(q, selectedIndices) {
    const correctIndices = getCorrectIndices(q);
    
    if (selectedIndices.length !== correctIndices.length) return false;
    
    const selectedSet = new Set(selectedIndices);
    const correctSet = new Set(correctIndices);
    
    for (const idx of selectedIndices) {
      if (!correctSet.has(idx)) return false;
    }
    for (const idx of correctIndices) {
      if (!selectedSet.has(idx)) return false;
    }
    
    return true;
  }

  // -----------------------------------------------------------
  // Image Question Helpers
  // -----------------------------------------------------------

  function hasQuestionImage(q) {
    return !!(q.image && typeof q.image === 'string' && q.image.trim().length > 0);
  }

  function getQuestionImageUrl(q) {
    if (!hasQuestionImage(q)) return null;
    
    const imagePath = q.image.trim();
    
    if (imagePath.startsWith('/') || imagePath.startsWith('http')) {
      return imagePath;
    }
    
    return `/static/images/${imagePath}`;
  }

  function renderQuestionImage(q) {
    if (!hasQuestionImage(q)) return null;
    
    const imageUrl = getQuestionImageUrl(q);
    if (!imageUrl) return null;
    
    const container = document.createElement('div');
    container.className = 'question-image-container';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Question image';
    img.className = 'question-image';
    
    img.addEventListener('load', () => {
      container.classList.add('loaded');
    });
    
    img.addEventListener('error', () => {
      console.warn('[Quiz] Failed to load question image:', imageUrl);
      container.classList.add('error');
      container.innerHTML = '<div class="question-image-error">Image could not be loaded</div>';
    });
    
    container.appendChild(img);
    return container;
  }

  // -----------------------------------------------------------
  // Fill-in-the-Blank Helpers
  // -----------------------------------------------------------

  function isFitbQuestion(q) {
    return q.type === 'fill_in_the_blank' || 
           q.type === 'fitb' || 
           q.type === 'fill-in-the-blank' ||
           q.type === 'multi_fill_in_the_blank' ||
           !getChoices(q) || 
           getChoices(q).length === 0;
  }

  function normalizeAnswer(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    return str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  function getFitbCorrectAnswers(q) {
    let answers = [];

    if (!q.correct) {
      if (q.correctAnswer) {
        answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      } else if (q.answer) {
        answers = Array.isArray(q.answer) ? q.answer : [q.answer];
      } else {
        return [];
      }
    } else {
      answers = Array.isArray(q.correct) ? q.correct : [q.correct];
    }

    const flattened = [];
    answers.forEach(item => {
      if (Array.isArray(item)) {
        item.forEach(subItem => {
          flattened.push(String(subItem));
        });
      } else {
        flattened.push(String(item));
      }
    });

    return flattened;
  }

  function isFitbAnswerCorrect(userAnswer, q) {
    const correctAnswers = getFitbCorrectAnswers(q);
    if (correctAnswers.length === 0) return false;

    const normalized = normalizeAnswer(userAnswer);
    if (!normalized) return false;

    for (const correct of correctAnswers) {
      if (normalizeAnswer(correct) === normalized) {
        return true;
      }
    }
    return false;
  }

  function getFitbCorrectAnswerText(q) {
    if (!q.correct) {
      if (q.correctAnswer) {
        const ca = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
        return ca.map(c => String(c)).join(', ');
      }
      if (q.answer) {
        const a = Array.isArray(q.answer) ? q.answer : [q.answer];
        return a.map(c => String(c)).join(', ');
      }
      return '(No correct answer defined)';
    }

    const rawCorrect = Array.isArray(q.correct) ? q.correct : [q.correct];
    
    const isMultiBlank = rawCorrect.length > 0 && Array.isArray(rawCorrect[0]);
    
    if (isMultiBlank) {
      const blankAnswers = rawCorrect.map((blankOptions, idx) => {
        const opts = Array.isArray(blankOptions) ? blankOptions : [blankOptions];
        const options = opts.map(o => String(o)).join(' or ');
        return `Blank ${idx + 1}: ${options}`;
      });
      return blankAnswers.join(' | ');
    }

    const answers = rawCorrect.map(c => String(c));
    return answers.length > 0 ? answers.join(', ') : '(No correct answer defined)';
  }

  function countBlanks(stem) {
    if (!stem) return 0;
    const matches = stem.match(/____/g);
    return matches ? matches.length : 0;
  }

  function getFitbCorrectAnswersForBlank(q, blankIndex) {
    let rawCorrect = null;
    
    if (q.correct) {
      rawCorrect = q.correct;
    } else if (q.correctAnswer) {
      rawCorrect = q.correctAnswer;
    } else if (q.answer) {
      rawCorrect = q.answer;
    }
    
    if (!rawCorrect) {
      return [];
    }
    
    if (!Array.isArray(rawCorrect)) {
      rawCorrect = [rawCorrect];
    }
    
    const isNestedFormat = rawCorrect.length > 0 && Array.isArray(rawCorrect[0]);
    
    if (isNestedFormat) {
      const blankAnswers = rawCorrect[blankIndex];
      if (!blankAnswers) {
        return [];
      }
      if (Array.isArray(blankAnswers)) {
        return blankAnswers.map(a => String(a));
      }
      return [String(blankAnswers)];
    }
    
    if (blankIndex === 0) {
      return rawCorrect.map(a => String(a));
    }
    
    return [];
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
      const twoThirdsCount = Math.ceil((count * 2) / 3);
      const leastAsked = sorted.slice(0, twoThirdsCount);
      const remainder = sorted.slice(twoThirdsCount);
      const randomPick = shuffle(remainder).slice(0, count - twoThirdsCount);

      return shuffle([...leastAsked, ...randomPick]);
    }

    if (isComprehensive && quizLength === 10) {
      console.log('[Quiz] Using 100% least-asked selection for 10Q');
      const sorted = sortByLeastAttempts(allQuestions);
      return sorted.slice(0, Math.min(quizLength, allQuestions.length));
    }

    if (isCategoryQuiz) {
      if (quizLength <= 10) {
        console.log('[Quiz] Using 100% least-asked selection for 10Q category quiz');
        const sorted = sortByLeastAttempts(allQuestions);
        return sorted.slice(0, Math.min(quizLength, allQuestions.length));
      }
      console.log('[Quiz] Using 2:1 ratio for category quiz with', quizLength, 'questions');
      return selectWithRatio(allQuestions, quizLength);
    }

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

      if (selected.length < quizLength) {
        const selectedIds = new Set(selected.map(q => q.id));
        const remaining = allQuestions.filter(q => !selectedIds.has(q.id));
        const extra = selectWithRatio(remaining, quizLength - selected.length);
        selected.push(...extra);
      }

      return shuffle(selected).slice(0, quizLength);
    }

    return selectWithRatio(allQuestions, quizLength);
  }

  // -----------------------------------------------------------
  // Question ID normalization
  // -----------------------------------------------------------
  function ensureQuestionId(q, index) {
    if (!q.id) {
      const base = getQuestionText(q).slice(0, 60);
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
    els.resetBtn = $('#resetBtn');
  }

  // -----------------------------------------------------------
  // View Management
  // -----------------------------------------------------------
  function showView(viewName) {
    if (els.launcher) els.launcher.classList.toggle('hidden', viewName !== 'launcher');
    if (els.quiz) els.quiz.classList.toggle('hidden', viewName !== 'quiz');
    if (els.summary) els.summary.classList.toggle('hidden', viewName !== 'summary');
    if (els.resetBtn) els.resetBtn.classList.toggle('hidden', viewName !== 'quiz');
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
      selected = shuffle(normalized);
    } else if (isComprehensive || isCategoryQuiz) {
      selected = selectQuestionsWithWeighting(normalized, requested, isComprehensive, isCategoryQuiz);
    } else {
      selected = shuffle(normalized).slice(0, Math.min(requested, normalized.length));
    }

    const threshold = getRequeueThreshold(selected.length);
    console.log(`[Quiz] Requeue threshold: ${threshold === Infinity ? 'disabled (10Q)' : threshold + ' missed questions'}`);

    return {
      isRetry: !!opts.isRetry,
      isComprehensive,
      isCategoryQuiz,
      quizLength: selected.length,
      queue: selected.slice(),
      missedQueue: [],
      missedSinceLastRequeue: 0,   // ← counter that resets after each injection
      mastered: new Set(),
      correctFirstTry: 0,
      incorrectFirstTry: 0,
      totalAttempts: 0,
      questionNumber: 0,
      current: null,
      answered: false,
      perQuestion: [],
      requeueThreshold: threshold
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
    if (els.resetBtn) els.resetBtn.classList.remove('hidden');
    nextQuestion();
    
    setTimeout(() => {
      const quizCard = document.getElementById('quiz');
      if (quizCard) {
        quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function resetQuiz() {
    if (!run || !state.questions) return;

    console.log('[Quiz] Resetting quiz...');
    
    run = buildRun(state.questions, {
      count: state.quizLength,
      isComprehensive: state.isComprehensive,
      isCategoryQuiz: state.isCategoryQuiz,
      isRetry: false
    });

    console.log('[Quiz] Quiz reset with', run.quizLength, 'new questions');
    clearResumeData();
    
    run.questionNumber = 0;
    nextQuestion();
    
    setTimeout(() => {
      const quizCard = document.getElementById('quiz');
      if (quizCard) {
        quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
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
    
    setTimeout(() => {
      const quizCard = document.getElementById('quiz');
      if (quizCard) {
        quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function nextQuestion() {
    if (!run) return;

    // Quiz complete when all questions mastered
    if (run.mastered.size === run.quizLength) {
      finishQuiz();
      return;
    }

    // Fallback: if queue is empty but missed questions remain, move them all back
    if (run.queue.length === 0 && run.missedQueue.length > 0) {
      run.queue = shuffle(run.missedQueue.splice(0));
      run.missedSinceLastRequeue = 0;
      console.log('[Quiz] Fallback requeue: moved all missed to front of queue');
    }

    if (run.queue.length === 0) {
      finishQuiz();
      return;
    }

    const q = run.queue.shift();
    run.current = q;
    run.answered = false;
    run.questionNumber++;

    updateProgress();
    renderQuestion(q);
    saveResumeData();
  }

  function updateProgress() {
    const total = run.quizLength;
    const mastered = run.mastered.size;
    const remaining = total - mastered;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    if (els.progressFill) els.progressFill.style.width = `${pct}%`;
    if (els.progressLabel) els.progressLabel.textContent = `${pct}% mastered`;
    if (els.runCounter) els.runCounter.textContent = `Question: ${run.questionNumber}`;
    if (els.remainingCounter) els.remainingCounter.textContent = `Questions Remaining: ${remaining}`;
  }

  // -----------------------------------------------------------
  // Render Question
  // -----------------------------------------------------------
  function renderQuestion(q) {
    if (isFitbQuestion(q)) {
      return renderFitbQuestion(q);
    }
    renderMcqQuestion(q);
  }

  function clearQuestionImage() {
    const existingContainer = document.querySelector('.question-image-container');
    if (existingContainer) {
      existingContainer.remove();
    }
  }

  // -----------------------------------------------------------
  // Render Fill-in-the-Blank Question
  // -----------------------------------------------------------
  function renderFitbQuestion(q) {
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

    clearQuestionImage();

    if (hasQuestionImage(q) && els.questionText) {
      const imageContainer = renderQuestionImage(q);
      if (imageContainer) {
        els.questionText.parentNode.insertBefore(imageContainer, els.questionText);
      }
    }

    if (els.questionText) {
      els.questionText.textContent = getQuestionText(q);
    }

    const blankCount = countBlanks(getQuestionText(q));
    
    if (blankCount > 1) {
      return renderMultiBlankFitbQuestion(q, blankCount);
    }

    return renderSingleBlankFitbQuestion(q);
  }

  function renderSingleBlankFitbQuestion(q) {
    const blankLabel = q.blank_label || 'Your answer';

    if (els.optionsForm) {
      els.optionsForm.innerHTML = '';
      els.optionsForm.className = 'fitb-container';
      els.optionsForm.dataset.questionType = 'fitb';
      els.optionsForm.dataset.blankCount = '1';

      const wrapper = document.createElement('div');
      wrapper.className = 'fitb-input-wrapper';

      const label = document.createElement('div');
      label.className = 'fitb-label';
      label.textContent = blankLabel;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'fitb-input';
      input.id = 'fitbInput';
      input.placeholder = 'Type your answer here...';
      input.dataset.qid = q.id;
      input.dataset.blankIndex = '0';
      input.autocomplete = 'off';

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      els.optionsForm.appendChild(wrapper);

      input.focus();

      input.addEventListener('input', () => {
        updateFitbSubmitButtonState();
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim().length > 0 && els.submitBtn && !els.submitBtn.disabled) {
          e.preventDefault();
          handleSubmit();
        }
      });
    }

    if (els.submitBtn) {
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Submit';
      els.submitBtn.dataset.mode = 'submit';
    }
  }

  function renderMultiBlankFitbQuestion(q, blankCount) {
    if (els.optionsForm) {
      els.optionsForm.innerHTML = '';
      els.optionsForm.className = 'fitb-container';
      els.optionsForm.dataset.questionType = 'fitb';
      els.optionsForm.dataset.blankCount = String(blankCount);

      for (let i = 0; i < blankCount; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'fitb-input-wrapper';

        const label = document.createElement('div');
        label.className = 'fitb-label';
        label.textContent = `Blank ${i + 1}`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fitb-input';
        input.id = `fitbInput${i}`;
        input.placeholder = `Blank ${i + 1} answer...`;
        input.dataset.qid = q.id;
        input.dataset.blankIndex = String(i);
        input.autocomplete = 'off';

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        els.optionsForm.appendChild(wrapper);

        if (i === 0) {
          input.focus();
        }

        input.addEventListener('input', () => {
          updateFitbSubmitButtonState();
        });

        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && els.submitBtn && !els.submitBtn.disabled) {
            e.preventDefault();
            handleSubmit();
          }
        });
      }
    }

    if (els.submitBtn) {
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Submit';
      els.submitBtn.dataset.mode = 'submit';
    }
  }

  function updateFitbSubmitButtonState() {
    if (!els.optionsForm || !els.submitBtn) return;

    const blankCount = parseInt(els.optionsForm.dataset.blankCount || '1', 10);
    let allFilled = true;

    for (let i = 0; i < blankCount; i++) {
      const input = document.getElementById(`fitbInput${i}`) || document.getElementById('fitbInput');
      if (!input || !input.value.trim()) {
        allFilled = false;
        break;
      }
    }

    els.submitBtn.disabled = !allFilled;
  }

  // -----------------------------------------------------------
  // Render MCQ Question
  // -----------------------------------------------------------
  function renderMcqQuestion(q) {
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

    clearQuestionImage();

    if (hasQuestionImage(q) && els.questionText) {
      const imageContainer = renderQuestionImage(q);
      if (imageContainer) {
        els.questionText.parentNode.insertBefore(imageContainer, els.questionText);
      }
    }

    if (els.questionText) {
      els.questionText.textContent = getQuestionText(q);
    }

    const multiSelect = isMultiSelect(q);
    const inputType = multiSelect ? 'checkbox' : 'radio';

    if (els.optionsForm) {
      els.optionsForm.innerHTML = '';
      els.optionsForm.className = 'options';
      els.optionsForm.dataset.questionType = 'mcq';
      if (multiSelect) {
        els.optionsForm.classList.add('is-multi-select');
      }

      const choices = getChoices(q);
      
      const choiceObjects = choices.map((c, i) => ({
        text: typeof c === 'string' ? c : (c.text || c.label || String(c)),
        originalIndex: i
      }));
      
      // Shuffle answer positions — re-randomized on every render including requeues
      const shuffledChoices = shuffle(choiceObjects);

      run.shuffleMap = {};
      shuffledChoices.forEach((choice, displayIdx) => {
        run.shuffleMap[choice.originalIndex] = LETTERS[displayIdx];
      });

      shuffledChoices.forEach((choice, displayIdx) => {
        const displayLetter = LETTERS[displayIdx];
        
        const optDiv = document.createElement('div');
        optDiv.className = 'opt';
        optDiv.dataset.originalIndex = choice.originalIndex;
        optDiv.dataset.displayIndex = displayIdx;

        const input = document.createElement('input');
        input.type = inputType;
        input.name = 'answer';
        input.id = `opt${displayIdx}`;
        input.value = displayIdx;
        input.dataset.originalIndex = choice.originalIndex;
        input.dataset.text = choice.text;

        const label = document.createElement('label');
        label.htmlFor = `opt${displayIdx}`;

        const letterSpan = document.createElement('span');
        letterSpan.className = 'k';
        letterSpan.textContent = displayLetter;

        const ansSpan = document.createElement('span');
        ansSpan.className = 'ans';
        ansSpan.textContent = choice.text;

        label.appendChild(letterSpan);
        label.appendChild(ansSpan);
        
        optDiv.appendChild(input);
        optDiv.appendChild(label);
        
        els.optionsForm.appendChild(optDiv);

        input.addEventListener('change', () => {
          updateSubmitButtonState();
        });
      });
    }

    if (els.submitBtn) {
      els.submitBtn.disabled = true;
      els.submitBtn.textContent = 'Submit';
      els.submitBtn.dataset.mode = 'submit';
    }
  }

  function updateSubmitButtonState() {
    if (!els.optionsForm || !els.submitBtn) return;
    
    const checked = els.optionsForm.querySelectorAll('input[name="answer"]:checked');
    const hasSelection = checked.length > 0;
    
    els.submitBtn.disabled = !hasSelection;
    
    if (hasSelection) {
      els.optionsForm.classList.add('has-selection');
    } else {
      els.optionsForm.classList.remove('has-selection');
    }
  }

  // -----------------------------------------------------------
  // Handle Submit/Next
  // -----------------------------------------------------------
  function handleSubmit() {
    if (!run || !run.current) return;

    const mode = els.submitBtn?.dataset.mode;
    const q = run.current;
    const isFitb = isFitbQuestion(q);

    // ===== FITB SUBMISSION =====
    if (isFitb) {
      const blankCount = countBlanks(getQuestionText(q));
      
      const userAnswers = [];
      let allAnswered = true;
      
      for (let i = 0; i < blankCount; i++) {
        const input = document.getElementById(`fitbInput${i}`) || document.getElementById('fitbInput');
        if (!input) {
          allAnswered = false;
          break;
        }
        const answer = input.value.trim();
        if (!answer) {
          allAnswered = false;
          break;
        }
        userAnswers.push(answer);
      }

      if (!allAnswered) {
        alert('Please fill in all blanks');
        return;
      }

      if (mode === 'submit') {
        run.answered = true;
        run.totalAttempts++;

        let isCorrect = true;
        const blankResults = [];
        
        for (let i = 0; i < blankCount; i++) {
          const correctAnswersForBlank = getFitbCorrectAnswersForBlank(q, i);
          const userAnswer = userAnswers[i];
          
          let blankCorrect = false;
          for (const correctAns of correctAnswersForBlank) {
            if (normalizeAnswer(userAnswer) === normalizeAnswer(correctAns)) {
              blankCorrect = true;
              break;
            }
          }
          
          blankResults.push(blankCorrect);
          
          if (!blankCorrect) {
            isCorrect = false;
          }
        }

        let rec = run.perQuestion.find(p => p.id === q.id);
        if (!rec) {
          rec = { id: q.id, correct: null, attempts: 0, questionObj: q };
          run.perQuestion.push(rec);
        }
        rec.attempts++;

        for (let i = 0; i < blankCount; i++) {
          const input = document.getElementById(`fitbInput${i}`) || document.getElementById('fitbInput');
          if (input) {
            input.disabled = true;
            input.classList.remove('wrong', 'correct');
            if (blankResults[i]) {
              input.classList.add('correct');
            } else {
              input.classList.add('wrong');
            }
          }
        }

        if (isCorrect) {
          if (rec.correct === null) {
            rec.correct = true;
            run.correctFirstTry++;
          }
          run.mastered.add(q.id);
        } else {
          if (rec.correct === null) {
            rec.correct = false;
            run.incorrectFirstTry++;
          }
          // Add to missedQueue and check threshold
          run.missedQueue.push(q);
          run.missedSinceLastRequeue++;
          checkAndInjectMissedQuestions();
        }

        const wrappers = els.optionsForm.querySelectorAll('.fitb-input-wrapper');
        wrappers.forEach((wrapper, idx) => {
          const existingIcon = wrapper.querySelector('.fitb-result-icon');
          if (existingIcon) existingIcon.remove();

          const icon = document.createElement('span');
          icon.className = `fitb-result-icon ${blankResults[idx] ? 'correct' : 'wrong'}`;
          icon.textContent = blankResults[idx] ? '✓' : '✗';
          wrapper.appendChild(icon);
        });

        showFeedback(isCorrect, q, true);

        if (els.submitBtn) {
          els.submitBtn.textContent = 'Next →';
          els.submitBtn.dataset.mode = 'next';
          els.submitBtn.disabled = false;
        }

        setTimeout(() => {
          if (els.answerLine && !els.answerLine.classList.contains('hidden')) {
            els.answerLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (els.feedback && !els.feedback.classList.contains('hidden')) {
            els.feedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);

        updateProgress();
        saveResumeData();

      } else if (mode === 'next') {
        nextQuestion();
        setTimeout(() => {
          const quizCard = document.getElementById('quiz');
          if (quizCard) {
            quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
      }
      return;
    }

    // ===== MCQ SUBMISSION =====

    if (mode === 'submit') {
      const checkedInputs = els.optionsForm?.querySelectorAll('input[name="answer"]:checked');
      if (!checkedInputs || checkedInputs.length === 0) return;

      run.answered = true;
      run.totalAttempts++;

      const multiSelect = isMultiSelect(q);
      
      const selectedIndices = Array.from(checkedInputs).map(inp => 
        parseInt(inp.dataset.originalIndex, 10)
      );
      
      const isCorrect = checkAnswerCorrect(q, selectedIndices);

      let rec = run.perQuestion.find(p => p.id === q.id);
      if (!rec) {
        rec = { id: q.id, correct: null, attempts: 0, questionObj: q };
        run.perQuestion.push(rec);
      }
      rec.attempts++;

      const allOpts = els.optionsForm.querySelectorAll('.opt');
      const correctIndices = getCorrectIndices(q);

      els.optionsForm.classList.add('submitted');

      if (isCorrect) {
        if (rec.correct === null) {
          rec.correct = true;
          run.correctFirstTry++;
        }
        run.mastered.add(q.id);
        showFeedback(true, q, false);

        allOpts.forEach(opt => {
          const origIdx = parseInt(opt.dataset.originalIndex, 10);
          if (selectedIndices.includes(origIdx)) {
            addResultIcon(opt, 'correct');
          }
        });
      } else {
        if (rec.correct === null) {
          rec.correct = false;
          run.incorrectFirstTry++;
        }

        // Add to missedQueue, increment counter, then check threshold
        run.missedQueue.push(q);
        run.missedSinceLastRequeue++;
        checkAndInjectMissedQuestions();

        showFeedback(false, q, false);

        allOpts.forEach(opt => {
          const origIdx = parseInt(opt.dataset.originalIndex, 10);
          const wasSelected = selectedIndices.includes(origIdx);
          const isCorrectAnswer = correctIndices.includes(origIdx);
          
          if (wasSelected && !isCorrectAnswer) {
            addResultIcon(opt, 'wrong');
          }
          if (isCorrectAnswer) {
            addResultIcon(opt, 'correct');
          }
        });
      }

      if (els.submitBtn) {
        els.submitBtn.textContent = 'Next →';
        els.submitBtn.dataset.mode = 'next';
        els.submitBtn.disabled = false;
      }

      els.optionsForm?.querySelectorAll('input').forEach(inp => {
        inp.disabled = true;
      });

      setTimeout(() => {
        if (els.rationale && !els.rationale.classList.contains('hidden')) {
          els.rationale.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (els.feedback && !els.feedback.classList.contains('hidden')) {
          els.feedback.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      updateProgress();
      saveResumeData();

    } else if (mode === 'next') {
      nextQuestion();
      setTimeout(() => {
        const quizCard = document.getElementById('quiz');
        if (quizCard) {
          quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  }

  // -----------------------------------------------------------
  // Percentage-Based Missed Question Injection  (NEW)
  // -----------------------------------------------------------
  // Called every time a question is answered incorrectly.
  // When missedSinceLastRequeue hits the threshold:
  //   1. Shuffle the accumulated missed questions
  //   2. Inject them at the FRONT of the queue (next to be asked)
  //   3. Remove them from missedQueue
  //   4. Reset the counter
  // 10Q quizzes: threshold is Infinity, so this never fires.
  // The end-of-queue fallback in nextQuestion() catches any
  // remaining missed questions regardless.
  function checkAndInjectMissedQuestions() {
    if (run.requeueThreshold === Infinity) return;  // 10Q: skip
    if (run.missedSinceLastRequeue < run.requeueThreshold) return;

    // Grab and shuffle the questions that have accumulated since last injection
    const toInject = shuffle(run.missedQueue.splice(0));

    // Inject at front of queue so they're asked immediately after current question
    run.queue = toInject.concat(run.queue);

    // Reset the per-cycle counter
    run.missedSinceLastRequeue = 0;

    console.log(`[Quiz] Threshold hit (${run.requeueThreshold}): injected ${toInject.length} missed questions at front of queue`);
  }

  function addResultIcon(optElement, type) {
    const label = optElement.querySelector('label');
    if (!label) return;
    
    if (label.querySelector('.result-icon')) return;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = `result-icon ${type}`;
    iconSpan.textContent = type === 'correct' ? '✓' : '✗';
    
    label.insertBefore(iconSpan, label.firstChild);
  }

  // -----------------------------------------------------------
  // Show Feedback
  // -----------------------------------------------------------
  function showFeedback(isCorrect, q, isFitb = false) {
    if (!els.feedback) return;

    els.feedback.classList.remove('hidden');

    if (isCorrect) {
      els.feedback.className = 'feedback ok';
      els.feedback.textContent = 'Correct!';
    } else {
      els.feedback.className = 'feedback bad';
      els.feedback.textContent = 'Incorrect';
    }

    const correctAnswer = isFitb ? getFitbCorrectAnswerText(q) : getCorrectAnswerText(q);
    if (els.answerLine && correctAnswer) {
      els.answerLine.classList.remove('hidden');
      if (isFitb) {
        els.answerLine.innerHTML = `<strong>Correct Answer:</strong> ${correctAnswer}`;
      } else {
        const formattedAnswer = correctAnswer.replace(/\n/g, '<br>');
        els.answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formattedAnswer}`;
      }
    }

    if (els.rationale && q.rationale) {
      els.rationale.classList.remove('hidden');
      els.rationale.innerHTML = `<strong>Rationale:</strong> ${q.rationale}`;
    }
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

    let scoreColor = '#f44336';
    if (pct >= 77) scoreColor = '#4caf50';
    else if (pct >= 60) scoreColor = '#ff9800';

    if (els.firstTrySummary) {
      els.firstTrySummary.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 3.5em; font-weight: 800; color: ${scoreColor};">${pct}%</div>
          <div style="font-size: 1.1em; color: #666; margin-top: 8px;">${correct}/${total} Correct First Try</div>
        </div>
      `;
    }

    const missedCount = run.perQuestion.filter(p => !p.correct).length;
    if (els.retryMissedBtn) {
      els.retryMissedBtn.classList.toggle('hidden', missedCount === 0);
      
      const missedCountDisplay = document.getElementById('missedCountDisplay');
      if (missedCountDisplay) {
        missedCountDisplay.textContent = `(${missedCount})`;
      }
      
      if (missedCount === 0 && els.restartBtnSummary) {
        els.restartBtnSummary.style.flex = '5';
      } else if (els.restartBtnSummary) {
        els.restartBtnSummary.style.flex = '4';
      }
    }

    if (els.reviewList) {
      els.reviewList.innerHTML = '';

      run.perQuestion.forEach(p => {
        const q = p.questionObj;
        if (!q) return;

        const div = document.createElement('div');
        div.className = `review-item ${p.correct ? 'review-correct' : 'review-incorrect'}`;

        const isFitb = isFitbQuestion(q);
        const correctAnswer = isFitb ? getFitbCorrectAnswerText(q) : getCorrectAnswerText(q);
        const questionText = getQuestionText(q);
        
        let answerHtml;
        if (isFitb) {
          answerHtml = `<div class="review-correct-answer"><strong>Correct Answer:</strong> ${correctAnswer}</div>`;
        } else {
          const formattedAnswer = correctAnswer.replace(/\n/g, '<br>');
          answerHtml = `<div class="review-correct-answer"><strong>Correct Answer:</strong><br>${formattedAnswer}</div>`;
        }

        let imageHtml = '';
        if (hasQuestionImage(q)) {
          const imageUrl = getQuestionImageUrl(q);
          imageHtml = `<div class="review-image"><img src="${imageUrl}" alt="Question image" /></div>`;
        }

        div.innerHTML = `
          <div class="review-question"><strong>${p.correct ? '✅' : '❌'}</strong> ${questionText}</div>
          ${imageHtml}
          ${answerHtml}
          ${q.rationale ? `<div class="review-rationale"><strong>Rationale:</strong> ${q.rationale}</div>` : ''}
        `;

        els.reviewList.appendChild(div);
      });
    }

    if (els.summaryActions && window.backUrl) {
      let returnBtn = els.summaryActions.querySelector('.return-btn');
      if (!returnBtn) {
        returnBtn = document.createElement('a');
        returnBtn.className = 'return-btn';
        returnBtn.style.cssText = 'flex: 1; min-width: 0;';
        returnBtn.href = window.backUrl;
        const label = window.backLabel || 'Learning Page';
        returnBtn.innerHTML = `<span>← Return to</span><span>${label}</span>`;
        els.summaryActions.appendChild(returnBtn);
      }
    }

    const store = getProgressStore();
    if (store) {
      if (!run.isRetry && store.recordCompletedQuiz) {
        store.recordCompletedQuiz(total);
        console.log(`[Quiz] Recorded ${total} questions to weekly count`);
      }

      if (store.recordQuizAttempts) {
        const ids = run.perQuestion.map(p => p.id).filter(Boolean);
        store.recordQuizAttempts(ids);
      }

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
      missedSinceLastRequeue: run.missedSinceLastRequeue,
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
      missedSinceLastRequeue: data.missedSinceLastRequeue || 0,
      mastered: new Set(data.mastered || []),
      correctFirstTry: data.correctFirstTry || 0,
      incorrectFirstTry: data.incorrectFirstTry || 0,
      totalAttempts: data.totalAttempts || 0,
      questionNumber: data.questionNumber || 0,
      current: null,
      answered: false,
      perQuestion: data.perQuestion || [],
      requeueThreshold: getRequeueThreshold(data.quizLength || 10)
    };

    showView('quiz');
    if (els.countersBox) els.countersBox.classList.remove('hidden');
    nextQuestion();
    
    setTimeout(() => {
      const quizCard = document.getElementById('quiz');
      if (quizCard) {
        quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function checkResumeAvailable() {
    const data = loadResumeData();
    const mastered = data?.mastered?.length || 0;
    const quizLength = data?.quizLength || 0;
    const hasQuestionsLeft = (data?.queue?.length > 0) || (data?.missedQueue?.length > 0);
    const notComplete = mastered < quizLength;
    const available = !!(data && hasQuestionsLeft && notComplete);
    if (els.resumeBtn) {
      els.resumeBtn.classList.toggle('hidden', !available);
    }
    return available;
  }

  // -----------------------------------------------------------
  // Event Setup
  // -----------------------------------------------------------
  function setupEvents() {
    if (els.startBtn) {
      els.startBtn.addEventListener('click', startQuiz);
    }

    if (els.resetBtn) {
      els.resetBtn.addEventListener('click', resetQuiz);
    }

    if (els.resumeBtn) {
      els.resumeBtn.addEventListener('click', resumeQuiz);
    }

    if (els.submitBtn) {
      els.submitBtn.addEventListener('click', handleSubmit);
    }

    if (els.retryMissedBtn) {
      els.retryMissedBtn.addEventListener('click', startRetryQuiz);
    }

    if (els.restartBtnSummary) {
      els.restartBtnSummary.addEventListener('click', () => {
        showView('launcher');
      });
    }

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

    document.addEventListener('keydown', (e) => {
      if (!run || !els.optionsForm) return;
      
      const key = e.key.toUpperCase();
      
      if (!isFitbQuestion(run.current)) {
        const letterIndex = LETTERS.indexOf(key);
        if (letterIndex !== -1 && !run.answered) {
          const input = els.optionsForm.querySelector(`#opt${letterIndex}`);
          if (input && !input.disabled) {
            e.preventDefault();
            
            const multiSelect = isMultiSelect(run.current);
            
            if (multiSelect) {
              input.checked = !input.checked;
            } else {
              if (input.checked) {
                input.checked = false;
              } else {
                input.checked = true;
              }
            }
            
            updateSubmitButtonState();
          }
        }
      }
      
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

    if (window.preloadedQuizData && window.preloadedQuizData.questions) {
      const pd = window.preloadedQuizData;

      state.questions = pd.questions;
      state.moduleName = pd.moduleName || '';
      state.category = pd.category || '';
      state.isComprehensive = pd.isComprehensive || false;
      state.isCategoryQuiz = pd.isCategoryQuiz || false;
      state.autostart = pd.autostart || false;

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

      if (els.startBtn) els.startBtn.disabled = false;

      if (els.moduleSel) els.moduleSel.style.display = 'none';
      const moduleLabel = els.launcher?.querySelector('label[for="moduleSel"]');
      if (moduleLabel) moduleLabel.style.display = 'none';

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

      if (state.autostart) {
        console.log('[Quiz] Auto-starting quiz...');
        if (els.launcher) els.launcher.classList.add('hidden');
        if (els.launcher) els.launcher.style.display = 'none';
        setTimeout(startQuiz, 50);
        return;
      }
    }

    checkResumeAvailable();
    showView('launcher');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
