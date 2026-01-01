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
   - Fixed field names: stem, options, correct (NCLEX format)
   - Fixed HTML structure: .opt wrapper with .k and .ans spans
   - Fixed correct answer detection for ["C"] letter format
   - Matches existing CSS styling in style.css
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
  // Dynamic Requeue Threshold
  // -----------------------------------------------------------
  function getRequeueThreshold(quizLength) {
    if (quizLength <= 10) return 2;
    if (quizLength <= 25) return 5;
    return 10;  // 50 and 100+
  }

  // -----------------------------------------------------------
  // Question Field Helpers
  // -----------------------------------------------------------
  
  // Get question text (handles multiple field names)
  function getQuestionText(q) {
    return q.stem || q.question || q.prompt || q.text || q.content || '(No question text)';
  }

  // Get choices array (handles multiple field names)
  function getChoices(q) {
    return q.options || q.choices || q.answers || [];
  }

  // Get correct answer index from question
  // Handles: ["C"], "C", 2, "Answer text"
  function getCorrectIndex(q) {
    const choices = getChoices(q);

    // Check for choice object with correct: true
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      if (typeof c === 'object' && c.correct === true) {
        return i;
      }
    }

    // Check correct field (NCLEX format: ["C"] or "C")
    if (q.correct !== undefined) {
      const correctVal = q.correct;

      // Array of letters: ["C"]
      if (Array.isArray(correctVal) && correctVal.length > 0) {
        const letter = correctVal[0].toUpperCase();
        return LETTERS.indexOf(letter);
      }
      
      // Single letter: "C"
      if (typeof correctVal === 'string' && correctVal.length === 1) {
        return LETTERS.indexOf(correctVal.toUpperCase());
      }
      
      // Number index
      if (typeof correctVal === 'number') {
        return correctVal;
      }
    }

    // Check answer field
    if (q.answer !== undefined) {
      const answer = q.answer;

      if (typeof answer === 'number') {
        return answer;
      }
      
      if (typeof answer === 'string' && answer.length === 1) {
        return LETTERS.indexOf(answer.toUpperCase());
      }
    }

    // Check correctAnswer field
    if (q.correctAnswer !== undefined) {
      const ca = q.correctAnswer;
      if (typeof ca === 'number') return ca;
      if (typeof ca === 'string' && ca.length === 1) {
        return LETTERS.indexOf(ca.toUpperCase());
      }
    }

    return -1;
  }

  // Check if selected answer is correct
  function isCorrectAnswer(q, selectedOriginalIndex) {
    const correctIdx = getCorrectIndex(q);
    return correctIdx === selectedOriginalIndex;
  }

  // Get correct answer text for display (uses display letters after shuffle)
  function getCorrectAnswerText(q) {
    const choices = getChoices(q);
    const correctIndices = getCorrectIndices(q);
    
    // Build array of {displayLetter, text}
    const answers = correctIndices.map(origIdx => {
      const displayLetter = run?.shuffleMap?.[origIdx] || LETTERS[origIdx];
      const c = choices[origIdx];
      const text = typeof c === 'string' ? c : (c.text || c.label || String(c));
      return { displayLetter, text };
    });
    
    // Sort by display letter (A, B, C...)
    answers.sort((a, b) => a.displayLetter.localeCompare(b.displayLetter));
    
    // For multi-select, format vertically
    if (isMultiSelect(q)) {
      return answers.map(a => `${a.displayLetter}: ${a.text}`).join('\n');
    }
    
    // For single-select, format inline
    return answers.map(a => `${a.displayLetter}. ${a.text}`).join('');
  }

  // Check if question is multi-select
  function isMultiSelect(q) {
    if (q.type === 'multi_select' || q.type === 'multiple_select' || q.type === 'multi-select') {
      return true;
    }
    // Also check if correct has multiple answers
    if (Array.isArray(q.correct) && q.correct.length > 1) {
      return true;
    }
    return false;
  }

  // Get all correct answer indices for multi-select
  function getCorrectIndices(q) {
    const indices = [];
    
    // Check correct field (NCLEX format: ["A", "C"])
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
    
    // If no indices found, fall back to single correct
    if (indices.length === 0) {
      const single = getCorrectIndex(q);
      if (single !== -1) indices.push(single);
    }
    
    return indices;
  }

  // Check if selected answers are correct (handles both single and multi-select)
  function checkAnswerCorrect(q, selectedIndices) {
    const correctIndices = getCorrectIndices(q);
    
    // Must have same number of selections as correct answers
    if (selectedIndices.length !== correctIndices.length) return false;
    
    // All selected must be in correct, and all correct must be selected
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
      // 2:1 ratio - 2 least-asked : 1 random (67% least-asked)
      const twoThirdsCount = Math.ceil((count * 2) / 3);
      const leastAsked = sorted.slice(0, twoThirdsCount);
      const remainder = sorted.slice(twoThirdsCount);
      const randomPick = shuffle(remainder).slice(0, count - twoThirdsCount);

      return shuffle([...leastAsked, ...randomPick]);
    }

    // 10Q comprehensive: 100% least-asked
    if (isComprehensive && quizLength === 10) {
      console.log('[Quiz] Using 100% least-asked selection for 10Q');
      const sorted = sortByLeastAttempts(allQuestions);
      return sorted.slice(0, Math.min(quizLength, allQuestions.length));
    }

    // Category quiz: 2:1 ratio (2 least-asked : 1 random)
    if (isCategoryQuiz) {
      console.log('[Quiz] Using 2:1 ratio for category quiz');
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

    // Default: 2:1 ratio (2 least-asked : 1 random)
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
      requeueThreshold: getRequeueThreshold(selected.length)
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
    
    // Center quiz card after first question loads
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
    
    // Center quiz card after first question loads
    setTimeout(() => {
      const quizCard = document.getElementById('quiz');
      if (quizCard) {
        quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function nextQuestion() {
    if (!run) return;

    // Check if all questions are mastered - quiz complete!
    if (run.mastered.size === run.quizLength) {
      finishQuiz();
      return;
    }

    // If queue is empty but still have missed questions, move them back
    if (run.queue.length === 0 && run.missedQueue.length > 0) {
      run.queue = run.missedQueue.splice(0);  // Move all missed to queue
    }

    // If still no questions (shouldn't happen), end quiz
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
    const remaining = total - mastered;  // Questions still need to be answered correctly
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

    if (els.progressFill) els.progressFill.style.width = `${pct}%`;
    if (els.progressLabel) els.progressLabel.textContent = `${pct}% mastered`;
    if (els.runCounter) els.runCounter.textContent = `Question: ${run.questionNumber}`;
    if (els.remainingCounter) els.remainingCounter.textContent = `Questions Remaining: ${remaining}`;
  }

  // -----------------------------------------------------------
  // Render Question - FIXED HTML STRUCTURE
  // Uses .opt wrapper, .k letter badge, .ans text span
  // Uses checkbox for multi-select, radio for single-select
  // -----------------------------------------------------------
  function renderQuestion(q) {
    // Clear feedback
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

    // Show question text - NOW USING getQuestionText() which checks 'stem'
    if (els.questionText) {
      els.questionText.textContent = getQuestionText(q);
    }

    // Determine if multi-select
    const multiSelect = isMultiSelect(q);
    const inputType = multiSelect ? 'checkbox' : 'radio';

    // Render options with CORRECT HTML structure
    if (els.optionsForm) {
      els.optionsForm.innerHTML = '';
      els.optionsForm.className = 'options';
      if (multiSelect) {
        els.optionsForm.classList.add('is-multi-select');
      }

      const choices = getChoices(q);
      
      // Build choice objects with original indices
      const choiceObjects = choices.map((c, i) => ({
        text: typeof c === 'string' ? c : (c.text || c.label || String(c)),
        originalIndex: i
      }));
      
      // Shuffle choices
      const shuffledChoices = shuffle(choiceObjects);

      // Store mapping: originalIndex -> displayLetter for correct answer display
      run.shuffleMap = {};
      shuffledChoices.forEach((choice, displayIdx) => {
        run.shuffleMap[choice.originalIndex] = LETTERS[displayIdx];
      });

      shuffledChoices.forEach((choice, displayIdx) => {
        const displayLetter = LETTERS[displayIdx];
        
        // Create .opt wrapper div
        const optDiv = document.createElement('div');
        optDiv.className = 'opt';
        optDiv.dataset.originalIndex = choice.originalIndex;
        optDiv.dataset.displayIndex = displayIdx;

        // Create input (radio or checkbox based on question type)
        const input = document.createElement('input');
        input.type = inputType;
        input.name = 'answer';
        input.id = `opt${displayIdx}`;
        input.value = displayIdx;
        input.dataset.originalIndex = choice.originalIndex;
        input.dataset.text = choice.text;

        // Create label
        const label = document.createElement('label');
        label.htmlFor = `opt${displayIdx}`;

        // Create .k letter badge span
        const letterSpan = document.createElement('span');
        letterSpan.className = 'k';
        letterSpan.textContent = displayLetter;

        // Create .ans answer text span
        const ansSpan = document.createElement('span');
        ansSpan.className = 'ans';
        ansSpan.textContent = choice.text;

        // Assemble: label contains letter badge + answer text
        label.appendChild(letterSpan);
        label.appendChild(ansSpan);
        
        // opt contains input + label
        optDiv.appendChild(input);
        optDiv.appendChild(label);
        
        els.optionsForm.appendChild(optDiv);

        // Enable submit when selected + add has-selection class
        input.addEventListener('change', () => {
          updateSubmitButtonState();
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

  // Update submit button state based on selections
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

    if (mode === 'submit') {
      const checkedInputs = els.optionsForm?.querySelectorAll('input[name="answer"]:checked');
      if (!checkedInputs || checkedInputs.length === 0) return;

      run.answered = true;
      run.totalAttempts++;

      const q = run.current;
      const multiSelect = isMultiSelect(q);
      
      // Get all selected original indices
      const selectedIndices = Array.from(checkedInputs).map(inp => 
        parseInt(inp.dataset.originalIndex, 10)
      );
      
      // Check if answer is correct
      const isCorrect = checkAnswerCorrect(q, selectedIndices);

      // Record attempt
      let rec = run.perQuestion.find(p => p.id === q.id);
      if (!rec) {
        rec = { id: q.id, correct: null, attempts: 0, questionObj: q };
        run.perQuestion.push(rec);
      }
      rec.attempts++;

      // Get all .opt elements and correct indices
      const allOpts = els.optionsForm.querySelectorAll('.opt');
      const correctIndices = getCorrectIndices(q);

      // Add submitted class to form - removes all highlighting
      els.optionsForm.classList.add('submitted');

      if (isCorrect) {
        if (rec.correct === null) {
          rec.correct = true;
          run.correctFirstTry++;
        }
        run.mastered.add(q.id);
        showFeedback(true, q);

        // Add checkmark icons to all correct answers (which user selected correctly)
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
        run.missedQueue.push(q);

        // When threshold reached, move all missed questions back to queue
        if (run.missedQueue.length >= run.requeueThreshold) {
          run.queue = run.queue.concat(run.missedQueue.splice(0));
        }

        showFeedback(false, q);

        // Add icons: X for wrong selections, checkmark for correct answers
        allOpts.forEach(opt => {
          const origIdx = parseInt(opt.dataset.originalIndex, 10);
          const wasSelected = selectedIndices.includes(origIdx);
          const isCorrectAnswer = correctIndices.includes(origIdx);
          
          if (wasSelected && !isCorrectAnswer) {
            // User selected a wrong answer - show X
            addResultIcon(opt, 'wrong');
          }
          if (isCorrectAnswer) {
            // This is a correct answer - show checkmark
            addResultIcon(opt, 'correct');
          }
        });
      }

      // Change button to Next
      if (els.submitBtn) {
        els.submitBtn.textContent = 'Next →';
        els.submitBtn.dataset.mode = 'next';
        els.submitBtn.disabled = false;
      }

      // Disable all inputs
      els.optionsForm?.querySelectorAll('input').forEach(inp => {
        inp.disabled = true;
      });

      // Scroll to show rationale/feedback
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
      // Center quiz card in viewport for new question
      nextQuestion();
      // Small delay to ensure DOM is updated before scrolling
      setTimeout(() => {
        const quizCard = document.getElementById('quiz');
        if (quizCard) {
          quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  }

  /**
   * Add a result icon (✓ or ✗) to an option
   * @param {HTMLElement} optElement - The .opt div element
   * @param {string} type - 'correct' or 'wrong'
   */
  function addResultIcon(optElement, type) {
    const label = optElement.querySelector('label');
    if (!label) return;
    
    // Check if icon already exists
    if (label.querySelector('.result-icon')) return;
    
    // Create the icon span
    const iconSpan = document.createElement('span');
    iconSpan.className = `result-icon ${type}`;
    iconSpan.textContent = type === 'correct' ? '✓' : '✗';
    
    // Insert at the beginning of the label (before the letter badge)
    label.insertBefore(iconSpan, label.firstChild);
  }

  // -----------------------------------------------------------
  // Show Feedback
  // -----------------------------------------------------------
  function showFeedback(isCorrect, q) {
    if (!els.feedback) return;

    els.feedback.classList.remove('hidden');

    if (isCorrect) {
      els.feedback.className = 'feedback ok';
      els.feedback.textContent = 'Correct!';
    } else {
      els.feedback.className = 'feedback bad';
      els.feedback.textContent = 'Incorrect';
    }

    // Always show correct answer (for both correct and incorrect)
    const correctAnswer = getCorrectAnswerText(q);
    if (els.answerLine && correctAnswer) {
      els.answerLine.classList.remove('hidden');
      // Convert newlines to <br> for multi-select vertical display
      const formattedAnswer = correctAnswer.replace(/\n/g, '<br>');
      els.answerLine.innerHTML = `<strong>Correct Answer:</strong><br>${formattedAnswer}`;
    }

    // Show rationale if available
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

    // Determine color based on score
    let scoreColor = '#f44336'; // Red < 60%
    if (pct >= 77) scoreColor = '#4caf50'; // Green >= 77%
    else if (pct >= 60) scoreColor = '#ff9800'; // Orange 60-76%

    if (els.firstTrySummary) {
      els.firstTrySummary.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 3.5em; font-weight: 800; color: ${scoreColor};">${pct}%</div>
          <div style="font-size: 1.1em; color: #666; margin-top: 8px;">${correct}/${total} Correct First Try</div>
        </div>
      `;
    }

    // Show/hide retry button and update missed count
    const missedCount = run.perQuestion.filter(p => !p.correct).length;
    if (els.retryMissedBtn) {
      els.retryMissedBtn.classList.toggle('hidden', missedCount === 0);
      
      // Update the missed count display
      const missedCountDisplay = document.getElementById('missedCountDisplay');
      if (missedCountDisplay) {
        missedCountDisplay.textContent = `(${missedCount})`;
      }
      
      // Adjust Start New Quiz width when Retry is hidden (takes 5/6 of space)
      if (missedCount === 0 && els.restartBtnSummary) {
        els.restartBtnSummary.style.flex = '5';
      } else if (els.restartBtnSummary) {
        els.restartBtnSummary.style.flex = '4';
      }
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
        const questionText = getQuestionText(q);
        // Convert newlines to <br> for multi-select vertical display
        const formattedAnswer = correctAnswer.replace(/\n/g, '<br>');

        div.innerHTML = `
          <div class="review-question"><strong>${p.correct ? '✅' : '❌'}</strong> ${questionText}</div>
          <div class="review-correct-answer"><strong>Correct Answer:</strong><br>${formattedAnswer}</div>
          ${q.rationale ? `<div class="review-rationale"><strong>Rationale:</strong> ${q.rationale}</div>` : ''}
        `;

        els.reviewList.appendChild(div);
      });
    }

    // Add return button with flex: 1 (same as Retry for 1:4:1 ratio)
    if (els.summaryActions && window.backUrl) {
      let returnBtn = els.summaryActions.querySelector('.return-btn');
      if (!returnBtn) {
        returnBtn = document.createElement('a');
        returnBtn.className = 'return-btn';
        returnBtn.style.cssText = 'flex: 1; min-width: 0;';
        returnBtn.href = window.backUrl;
        returnBtn.innerHTML = '<span>← Return to NCLEX</span><span>Learning Page</span>';
        els.summaryActions.appendChild(returnBtn);
      }
    }

    // Record to progress store
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
      requeueThreshold: getRequeueThreshold(data.quizLength || 10)
    };

    showView('quiz');
    if (els.countersBox) els.countersBox.classList.remove('hidden');
    nextQuestion();
    
    // Center quiz card after first question loads
    setTimeout(() => {
      const quizCard = document.getElementById('quiz');
      if (quizCard) {
        quizCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  function checkResumeAvailable() {
    const data = loadResumeData();
    // Resume available if there are questions in queue OR missedQueue, AND not all mastered
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

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      // Don't handle if we're not in quiz mode or question is answered
      if (!run || !els.optionsForm) return;
      
      const key = e.key.toUpperCase();
      
      // Letter keys A-H to select/deselect options
      const letterIndex = LETTERS.indexOf(key);
      if (letterIndex !== -1 && !run.answered) {
        const input = els.optionsForm.querySelector(`#opt${letterIndex}`);
        if (input && !input.disabled) {
          e.preventDefault();
          
          const multiSelect = isMultiSelect(run.current);
          
          if (multiSelect) {
            // Multi-select: toggle the checkbox
            input.checked = !input.checked;
          } else {
            // Single-select: toggle behavior
            if (input.checked) {
              // Deselect if already selected
              input.checked = false;
            } else {
              // Select this one (radio buttons auto-deselect others)
              input.checked = true;
            }
          }
          
          // Update submit button state
          updateSubmitButtonState();
        }
      }
      
      // Enter key for Submit/Next
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
        setTimeout(startQuiz, 100);
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
