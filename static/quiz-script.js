/* ============================================================
   Quiz Script - Nurse Success Study Hub
   
   Handles:
   - Module selection and quiz launching
   - Question display and answer handling
   - Progress tracking integration
   - Autostart for comprehensive/category quizzes
   - Quiz summary and review
   ============================================================ */

(function() {
  'use strict';

  // ============================================================
  // DOM ELEMENTS
  // ============================================================
  
  const launcher = document.getElementById('launcher');
  const moduleSel = document.getElementById('moduleSel');
  const lengthBtns = document.querySelectorAll('.seg-btn');
  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  
  const quizCard = document.getElementById('quiz');
  const countersBox = document.getElementById('countersBox');
  const runCounter = document.getElementById('runCounter');
  const remainingCounter = document.getElementById('remainingCounter');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  const questionText = document.getElementById('questionText');
  const optionsForm = document.getElementById('optionsForm');
  const submitBtn = document.getElementById('submitBtn');
  const feedback = document.getElementById('feedback');
  const answerLine = document.getElementById('answerLine');
  const rationale = document.getElementById('rationale');
  
  const summaryCard = document.getElementById('summary');
  const summaryTitle = document.getElementById('summaryTitle');
  const firstTrySummary = document.getElementById('firstTrySummary');
  const retryMissedBtn = document.getElementById('retryMissedBtn');
  const restartBtnSummary = document.getElementById('restartBtnSummary');
  const reviewList = document.getElementById('reviewList');
  const resetAllBtn = document.getElementById('resetAll');
  const summaryActions = document.getElementById('summaryActions');

  // ============================================================
  // STATE VARIABLES
  // ============================================================
  
  let allQuestions = [];
  let quizQuestions = [];
  let currentIndex = 0;
  let selectedAnswer = null;
  let correctCount = 0;
  let incorrectCount = 0;
  let answeredQuestions = []; // Track all answered questions with results
  let missedQuestions = []; // Questions answered incorrectly
  let selectedLength = 50;
  let moduleName = '';
  let category = '';
  let isRetryMode = false;

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  
  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Get stable ID for a question
   */
  function getQuestionId(question, index) {
    if (question.id) return String(question.id);
    if (question.stable_id) return question.stable_id;
    return `${moduleName}::${index}`;
  }

  /**
   * Select questions based on length and prioritize least attempted
   */
  function selectQuestions(questions, length) {
    if (length === 'full' || length >= questions.length) {
      return shuffleArray(questions);
    }
    
    const numQuestions = parseInt(length, 10);
    
    // Use progress store to prioritize least attempted questions
    if (window.StudyGuruProgress) {
      const sorted = window.StudyGuruProgress.sortByLeastAttempted(questions);
      // Take the least attempted, then shuffle them
      const selected = sorted.slice(0, numQuestions);
      return shuffleArray(selected);
    }
    
    // Fallback: random selection
    return shuffleArray(questions).slice(0, numQuestions);
  }

  /**
   * Format module name for display
   */
  function formatModuleName(name) {
    return name.replace(/_/g, ' ');
  }

  // ============================================================
  // UI UPDATE FUNCTIONS
  // ============================================================
  
  function showElement(el) {
    if (el) el.classList.remove('hidden');
  }
  
  function hideElement(el) {
    if (el) el.classList.add('hidden');
  }

  function updateProgress() {
    const total = quizQuestions.length;
    const answered = currentIndex;
    const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    
    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }
    if (progressLabel) {
      progressLabel.textContent = `${percent}% correct`;
    }
    if (runCounter) {
      runCounter.textContent = `Question ${currentIndex + 1} of ${total}`;
    }
    if (remainingCounter) {
      remainingCounter.textContent = `${total - currentIndex - 1} remaining`;
    }
  }

  function updateCounters() {
    showElement(countersBox);
    updateProgress();
  }

  // ============================================================
  // QUESTION DISPLAY
  // ============================================================
  
  function displayQuestion() {
    if (currentIndex >= quizQuestions.length) {
      showSummary();
      return;
    }

    const question = quizQuestions[currentIndex];
    selectedAnswer = null;
    
    // Reset UI
    hideElement(feedback);
    hideElement(answerLine);
    hideElement(rationale);
    submitBtn.disabled = true;
    submitBtn.dataset.mode = 'submit';
    submitBtn.textContent = 'Submit';
    
    // Display question text
    questionText.innerHTML = question.question || question.text || '';
    
    // Build options
    optionsForm.innerHTML = '';
    const options = question.options || question.choices || [];
    
    options.forEach((option, idx) => {
      const letter = String.fromCharCode(65 + idx); // A, B, C, D...
      const optionText = typeof option === 'string' ? option : option.text || option;
      
      const label = document.createElement('label');
      label.className = 'option-label';
      label.innerHTML = `
        <input type="radio" name="answer" value="${letter}" class="option-input">
        <span class="option-text"><strong>${letter}.</strong> ${optionText}</span>
      `;
      
      label.addEventListener('click', () => {
        selectedAnswer = letter;
        submitBtn.disabled = false;
        
        // Update visual selection
        optionsForm.querySelectorAll('.option-label').forEach(l => {
          l.classList.remove('selected');
        });
        label.classList.add('selected');
      });
      
      optionsForm.appendChild(label);
    });
    
    updateCounters();
  }

  // ============================================================
  // ANSWER HANDLING
  // ============================================================
  
  function handleSubmit() {
    if (submitBtn.dataset.mode === 'submit') {
      checkAnswer();
    } else {
      nextQuestion();
    }
  }

  function checkAnswer() {
    const question = quizQuestions[currentIndex];
    
    // Get correct answer - handle various formats
    let correctAnswer = question.correct_answer || question.answer || question.correctAnswer;
    
    // Normalize to letter format
    if (typeof correctAnswer === 'number') {
      correctAnswer = String.fromCharCode(65 + correctAnswer);
    } else if (typeof correctAnswer === 'string') {
      correctAnswer = correctAnswer.trim().toUpperCase().charAt(0);
    }
    
    const isCorrect = selectedAnswer === correctAnswer;
    
    // Update counters
    if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
      missedQuestions.push({
        ...question,
        userAnswer: selectedAnswer,
        originalIndex: currentIndex
      });
    }
    
    // Track answered question
    answeredQuestions.push({
      question: question,
      userAnswer: selectedAnswer,
      correctAnswer: correctAnswer,
      isCorrect: isCorrect,
      index: currentIndex
    });
    
    // Show feedback
    showFeedback(isCorrect, correctAnswer, question);
    
    // Update button
    submitBtn.dataset.mode = 'next';
    submitBtn.textContent = currentIndex < quizQuestions.length - 1 ? 'Next Question' : 'See Results';
    submitBtn.disabled = false;
    
    // Highlight options
    optionsForm.querySelectorAll('.option-label').forEach(label => {
      const input = label.querySelector('input');
      const value = input.value;
      
      if (value === correctAnswer) {
        label.classList.add('correct');
      } else if (value === selectedAnswer && !isCorrect) {
        label.classList.add('incorrect');
      }
      
      // Disable further selection
      input.disabled = true;
    });
    
    updateProgress();
  }

  function showFeedback(isCorrect, correctAnswer, question) {
    // Main feedback
    feedback.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    feedback.innerHTML = isCorrect 
      ? '<strong>✓ Correct!</strong>' 
      : '<strong>✗ Incorrect</strong>';
    showElement(feedback);
    
    // Show correct answer if wrong
    if (!isCorrect) {
      const options = question.options || question.choices || [];
      const correctIndex = correctAnswer.charCodeAt(0) - 65;
      const correctText = options[correctIndex];
      const correctDisplay = typeof correctText === 'string' ? correctText : correctText?.text || correctText;
      
      answerLine.innerHTML = `<strong>Correct Answer:</strong> ${correctAnswer}. ${correctDisplay}`;
      showElement(answerLine);
    }
    
    // Show rationale if available
    const rationaleText = question.rationale || question.explanation || question.reason;
    if (rationaleText) {
      rationale.innerHTML = `<strong>Rationale:</strong> ${rationaleText}`;
      showElement(rationale);
    }
  }

  function nextQuestion() {
    currentIndex++;
    displayQuestion();
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  
  function showSummary() {
    hideElement(quizCard);
    hideElement(launcher);
    showElement(summaryCard);
    
    const total = quizQuestions.length;
    const percent = Math.round((correctCount / total) * 100);
    
    // Update title based on score
    let emoji = '🎉';
    if (percent < 50) emoji = '📚';
    else if (percent < 70) emoji = '💪';
    else if (percent < 85) emoji = '👏';
    
    summaryTitle.textContent = `${emoji} Quiz Complete!`;
    
    // First try summary
    firstTrySummary.innerHTML = `
      <div class="score-display">
        <div class="score-main">${percent}%</div>
        <div class="score-detail">${correctCount} of ${total} correct</div>
      </div>
      <div class="score-breakdown">
        <span class="score-correct">✓ ${correctCount} Correct</span>
        <span class="score-incorrect">✗ ${incorrectCount} Incorrect</span>
      </div>
    `;
    
    // Show/hide retry button
    if (missedQuestions.length > 0 && !isRetryMode) {
      showElement(retryMissedBtn);
      const missedDisplay = document.getElementById('missedCountDisplay');
      if (missedDisplay) {
        missedDisplay.textContent = `(${missedQuestions.length} questions)`;
      }
    } else {
      hideElement(retryMissedBtn);
    }
    
    // Add return button dynamically
    const existingReturnBtn = summaryActions.querySelector('.return-btn');
    if (!existingReturnBtn) {
      const backUrl = window.backUrl || '/';
      const backLabel = window.backLabel || 'Home';
      
      const returnBtn = document.createElement('a');
      returnBtn.href = backUrl;
      returnBtn.className = 'return-btn';
      returnBtn.style.flex = '1';
      returnBtn.style.minWidth = '0';
      returnBtn.innerHTML = `<span>Return to</span><span style="font-size: 0.85em; opacity: 0.9;">${backLabel}</span>`;
      summaryActions.appendChild(returnBtn);
    }
    
    // Build review list
    buildReviewList();
    
    // Record progress
    recordQuizProgress();
  }

  function buildReviewList() {
    reviewList.innerHTML = '';
    
    answeredQuestions.forEach((item, idx) => {
      const q = item.question;
      const options = q.options || q.choices || [];
      
      const div = document.createElement('div');
      div.className = `review-item ${item.isCorrect ? 'review-correct' : 'review-incorrect'}`;
      
      // Get correct answer text
      const correctIndex = item.correctAnswer.charCodeAt(0) - 65;
      const correctText = options[correctIndex];
      const correctDisplay = typeof correctText === 'string' ? correctText : correctText?.text || correctText;
      
      let html = `
        <div class="review-question"><strong>Q${idx + 1}:</strong> ${q.question || q.text}</div>
        <div class="review-correct-answer"><strong>Correct:</strong> ${item.correctAnswer}. ${correctDisplay}</div>
      `;
      
      if (!item.isCorrect) {
        const userIndex = item.userAnswer.charCodeAt(0) - 65;
        const userText = options[userIndex];
        const userDisplay = typeof userText === 'string' ? userText : userText?.text || userText;
        html += `<div class="review-your-answer" style="color: #c62828;"><strong>Your answer:</strong> ${item.userAnswer}. ${userDisplay}</div>`;
      }
      
      const rationaleText = q.rationale || q.explanation || q.reason;
      if (rationaleText) {
        html += `<div class="review-rationale">${rationaleText}</div>`;
      }
      
      div.innerHTML = html;
      reviewList.appendChild(div);
    });
  }

  function recordQuizProgress() {
    if (!window.StudyGuruProgress) return;
    
    // Record completed quiz count
    window.StudyGuruProgress.recordCompletedQuiz(quizQuestions.length);
    
    // Record attempts for each question
    const questionIds = quizQuestions.map((q, idx) => getQuestionId(q, idx));
    window.StudyGuruProgress.recordQuizAttempts(questionIds);
    
    // Record category score if applicable
    const quizCategory = quizQuestions[0]?.category || category;
    if (quizCategory) {
      const percent = Math.round((correctCount / quizQuestions.length) * 100);
      window.StudyGuruProgress.recordCategoryScore(quizCategory, percent);
    }
  }

  // ============================================================
  // QUIZ CONTROL FUNCTIONS
  // ============================================================
  
  function startQuiz(questions, length) {
    // Reset state
    currentIndex = 0;
    selectedAnswer = null;
    correctCount = 0;
    incorrectCount = 0;
    answeredQuestions = [];
    missedQuestions = [];
    isRetryMode = false;
    
    // Select questions
    quizQuestions = selectQuestions(questions, length);
    
    // Update UI
    hideElement(launcher);
    hideElement(summaryCard);
    showElement(quizCard);
    showElement(resetAllBtn);
    
    // Display first question
    displayQuestion();
  }

  function startRetryQuiz() {
    if (missedQuestions.length === 0) return;
    
    // Reset state but keep missed questions
    currentIndex = 0;
    selectedAnswer = null;
    correctCount = 0;
    incorrectCount = 0;
    answeredQuestions = [];
    isRetryMode = true;
    
    // Use missed questions
    quizQuestions = shuffleArray(missedQuestions.map(q => {
      // Remove tracking properties
      const { userAnswer, originalIndex, ...question } = q;
      return question;
    }));
    missedQuestions = [];
    
    // Update UI
    hideElement(summaryCard);
    showElement(quizCard);
    
    // Display first question
    displayQuestion();
  }

  function resetQuiz() {
    hideElement(quizCard);
    hideElement(summaryCard);
    hideElement(resetAllBtn);
    showElement(launcher);
    
    // Reset state
    currentIndex = 0;
    correctCount = 0;
    incorrectCount = 0;
    answeredQuestions = [];
    missedQuestions = [];
    quizQuestions = [];
  }

  // ============================================================
  // MODULE LOADING
  // ============================================================
  
  async function loadModules() {
    try {
      const response = await fetch('/modules');
      const data = await response.json();
      
      if (data.modules && Array.isArray(data.modules)) {
        moduleSel.innerHTML = '<option value="">-- Select a Module --</option>';
        data.modules.forEach(mod => {
          const option = document.createElement('option');
          option.value = mod;
          option.textContent = formatModuleName(mod);
          moduleSel.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  }

  async function loadModuleQuestions(modName) {
    // First check if we have fixtures
    try {
      const response = await fetch('/static/quiz-content.fixtures.json');
      const fixtures = await response.json();
      
      if (fixtures[modName]) {
        return fixtures[modName].questions || [];
      }
    } catch (e) {
      // No fixtures, continue to API
    }
    
    // This would need an API endpoint - for now return empty
    console.warn(`No questions found for module: ${modName}`);
    return [];
  }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  
  // Length buttons
  lengthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      lengthBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedLength = btn.dataset.len;
    });
  });

  // Module selection
  if (moduleSel) {
    moduleSel.addEventListener('change', () => {
      startBtn.disabled = !moduleSel.value;
    });
  }

  // Start button
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (allQuestions.length > 0) {
        startQuiz(allQuestions, selectedLength);
      } else if (moduleSel && moduleSel.value) {
        moduleName = moduleSel.value;
        const questions = await loadModuleQuestions(moduleName);
        if (questions.length > 0) {
          allQuestions = questions;
          startQuiz(allQuestions, selectedLength);
        }
      }
    });
  }

  // Submit/Next button
  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmit);
  }

  // Retry missed button
  if (retryMissedBtn) {
    retryMissedBtn.addEventListener('click', startRetryQuiz);
  }

  // Restart button
  if (restartBtnSummary) {
    restartBtnSummary.addEventListener('click', () => {
      if (allQuestions.length > 0) {
        startQuiz(allQuestions, selectedLength);
      } else {
        resetQuiz();
      }
    });
  }

  // Reset button
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the quiz?')) {
        resetQuiz();
      }
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled && quizCard && !quizCard.classList.contains('hidden')) {
      handleSubmit();
    }
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================
  
  function init() {
    console.log('[Quiz] Initializing...');
    
    // Check for preloaded quiz data
    if (window.preloadedQuizData && window.preloadedQuizData.questions && window.preloadedQuizData.questions.length > 0) {
      console.log('[Quiz] Found preloaded data:', {
        questionCount: window.preloadedQuizData.questions.length,
        moduleName: window.preloadedQuizData.moduleName,
        autostart: window.preloadedQuizData.autostart,
        quizLength: window.preloadedQuizData.quizLength
      });
      
      allQuestions = window.preloadedQuizData.questions;
      moduleName = window.preloadedQuizData.moduleName || 'Quiz';
      category = window.preloadedQuizData.category || '';
      
      // Determine quiz length
      const length = window.preloadedQuizData.quizLength || 'full';
      if (length !== 'full') {
        selectedLength = parseInt(length, 10) || 50;
        
        // Update length button UI
        lengthBtns.forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.len === length || btn.dataset.len === String(selectedLength)) {
            btn.classList.add('active');
          }
        });
      }
      
      // Check for autostart
      if (window.preloadedQuizData.autostart) {
        console.log('[Quiz] Autostarting quiz with length:', selectedLength);
        hideElement(launcher);
        startQuiz(allQuestions, selectedLength);
        return;
      }
      
      // Enable start button for preloaded data
      if (startBtn) {
        startBtn.disabled = false;
      }
      
      // Hide module selector since we have preloaded data
      if (moduleSel) {
        moduleSel.style.display = 'none';
        const label = document.querySelector('label[for="moduleSel"]');
        if (label) label.style.display = 'none';
      }
    } else {
      // No preloaded data - load modules for selection
      console.log('[Quiz] No preloaded data, loading module list');
      loadModules();
    }
    
    // Offline indicator
    function updateOfflineIndicator() {
      const indicator = document.getElementById('offlineIndicator');
      if (indicator) {
        if (navigator.onLine) {
          indicator.classList.add('hidden');
        } else {
          indicator.classList.remove('hidden');
        }
      }
    }
    
    window.addEventListener('online', updateOfflineIndicator);
    window.addEventListener('offline', updateOfflineIndicator);
    updateOfflineIndicator();
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
