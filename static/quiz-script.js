/* -----------------------------------------------------------
   Study Guru Quiz App (quiz-script.js)
   - Category/module selection
   - Quiz start, progress, mastery/requeue
   - Weekly counter + least-asked
   - Fishbone / fill-in-the-blank support
   - Resume quiz support
   - NCLEX weighted category selection
   - Preloaded data support (no JSON fetch needed)

   PATCH NOTE:
   - Retry runs (run.isRetry === true) no longer increment weekly count.
   - Supports window.preloadedQuizData for server-injected questions
   - NCLEX comprehensive quizzes use weighted category distribution
------------------------------------------------------------ */

(function () {
  'use strict';

  // -----------------------------------------------------------
  // Global / State
  // -----------------------------------------------------------
  const state = {
    content: null,
    categories: [],
    selectedCategory: null,
    selectedSubcategory: null,
    selectedModuleKey: null,
    selectedCount: 10,
    mode: 'mcq', // 'mcq' | 'fill' | 'fishbone-mcq' | 'fishbone-fill'
    quiz: null,
    resumeAvailable: false,
    // Preloaded data flags
    isComprehensive: false,
    isCategoryQuiz: false
  };

  // "run" is the active quiz runtime object
  let run = null;

  // Elements cache
  const els = {};

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
  // Utilities
  // -----------------------------------------------------------
  function $(sel) {
    return document.querySelector(sel);
  }

  function $all(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function safeJsonParse(str, fallback = null) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatPct(n) {
    if (!Number.isFinite(n)) return '0%';
    return `${Math.round(n)}%`;
  }

  // -----------------------------------------------------------
  // Progress Store helpers (if present)
  // -----------------------------------------------------------
  function getProgressStore() {
    return window.StudyGuruProgress || null;
  }

  // -----------------------------------------------------------
  // Weighted Question Selection (NCLEX)
  // -----------------------------------------------------------
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
    const store = getProgressStore();
    const attemptsMap = store && store.getAttemptsMap ? store.getAttemptsMap() : {};
    
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
      if (questions.length <= count) return shuffle([...questions]);
      
      const sorted = sortByLeastAttempts(questions);
      const halfCount = Math.ceil(count / 2);
      
      // Take least-asked half
      const leastAsked = sorted.slice(0, halfCount);
      
      // Take random from remainder
      const remainder = sorted.slice(halfCount);
      const randomPick = shuffle(remainder).slice(0, count - halfCount);
      
      return shuffle([...leastAsked, ...randomPick]);
    }
    
    // CASE 1: Comprehensive 10Q - 100% least-asked, no weighting
    if (isComprehensive && quizLength === 10) {
      console.log('[Quiz] Using 100% least-asked selection for 10Q comprehensive');
      const sorted = sortByLeastAttempts(allQuestions);
      return sorted.slice(0, Math.min(quizLength, allQuestions.length));
    }
    
    // CASE 2: Category quiz (any length) - 1:1 ratio within single category
    if (isCategoryQuiz) {
      console.log('[Quiz] Using 1:1 ratio for category quiz');
      return selectWithRatio(allQuestions, quizLength);
    }
    
    // CASE 3: Comprehensive 25/50/100Q - NCLEX weighted + 1:1 ratio per category
    if (isComprehensive && quizLength > 10) {
      console.log('[Quiz] Using NCLEX weighted selection for', quizLength, 'questions');
      
      // Group questions by category
      const byCategory = {};
      allQuestions.forEach(q => {
        const cat = q.category || 'Uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(q);
      });
      
      const selected = [];
      
      // Select from each category according to weight
      for (const [category, weight] of Object.entries(NCLEX_CATEGORY_WEIGHTS)) {
        const categoryQuestions = byCategory[category] || [];
        if (categoryQuestions.length === 0) continue;
        
        // Calculate target count for this category
        const targetCount = Math.round(quizLength * weight);
        if (targetCount === 0) continue;
        
        // Use 1:1 ratio selection within category
        const categorySelected = selectWithRatio(categoryQuestions, targetCount);
        selected.push(...categorySelected);
        
        console.log(`[Quiz] ${category}: target=${targetCount}, selected=${categorySelected.length}`);
      }
      
      // Handle any uncategorized questions
      const uncategorized = byCategory['Uncategorized'] || [];
      if (uncategorized.length > 0 && selected.length < quizLength) {
        const remaining = quizLength - selected.length;
        const extra = selectWithRatio(uncategorized, remaining);
        selected.push(...extra);
      }
      
      // If we don't have enough, fill from any category
      if (selected.length < quizLength) {
        const selectedIds = new Set(selected.map(q => q.id));
        const remaining = allQuestions.filter(q => !selectedIds.has(q.id));
        const needed = quizLength - selected.length;
        const extra = selectWithRatio(remaining, needed);
        selected.push(...extra);
      }
      
      // Trim if we have too many (due to rounding)
      const final = shuffle(selected).slice(0, quizLength);
      console.log('[Quiz] Final weighted selection:', final.length, 'questions');
      return final;
    }
    
    // CASE 4: Default fallback - simple 1:1 ratio
    console.log('[Quiz] Using default 1:1 ratio selection');
    return selectWithRatio(allQuestions, quizLength);
  }

  // -----------------------------------------------------------
  // Content Loading
  // -----------------------------------------------------------
  async function loadContent() {
    // Check for preloaded data first (from server-side injection)
    if (window.preloadedQuizData) {
      console.log('[Quiz] Using preloaded quiz data');
      
      // Store preload flags
      state.isComprehensive = window.preloadedQuizData.isComprehensive || false;
      state.isCategoryQuiz = window.preloadedQuizData.isCategoryQuiz || false;
      
      // If we have direct questions array (from NCLEX pages)
      if (window.preloadedQuizData.questions) {
        state.content = {
          preloaded: true,
          questions: window.preloadedQuizData.questions,
          moduleName: window.preloadedQuizData.moduleName || 'Quiz',
          category: window.preloadedQuizData.category || 'General'
        };
        state.categories = [state.content.category];
        
        // Auto-select for preloaded quizzes
        state.selectedCategory = state.content.category;
        state.selectedSubcategory = 'default';
        state.selectedModuleKey = state.content.moduleName;
        
        console.log('[Quiz] Preloaded data:', {
          moduleName: state.content.moduleName,
          category: state.content.category,
          questionCount: state.content.questions.length,
          isComprehensive: state.isComprehensive,
          isCategoryQuiz: state.isCategoryQuiz
        });
        return;
      }
      
      // If we have categories structure
      if (window.preloadedQuizData.categories) {
        state.content = window.preloadedQuizData;
        state.categories = Object.keys(window.preloadedQuizData.categories || {});
        return;
      }
    }
    
    // Fallback: fetch from JSON file (for non-NCLEX pages)
    try {
      const res = await fetch('/static/js/quiz-content.fixtures.json', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load quiz content fixtures. HTTP ${res.status}`);
      }
      const data = await res.json();
      state.content = data;
      state.categories = Object.keys(data.categories || {});
    } catch (e) {
      // If no preloaded data and fetch fails, check if we should auto-start
      if (window.preloadedQuizData) {
        console.log('[Quiz] Using preloaded data, ignoring fetch error');
        return;
      }
      throw e;
    }
  }

  // -----------------------------------------------------------
  // UI Setup
  // -----------------------------------------------------------
  function cacheElements() {
    els.app = $('#app');
    els.categoryList = $('#categoryList');
    els.subcategoryList = $('#subcategoryList');
    els.moduleList = $('#moduleList');
    els.quizControls = $('#quizControls');
    els.countSelect = $('#countSelect');
    els.modeSelect = $('#modeSelect');
    els.startBtn = $('#startQuizBtn');
    els.resumeBtn = $('#resumeQuizBtn');
    els.resetBtn = $('#resetProgressBtn');

    els.quizView = $('#quizView');
    els.quizTitle = $('#quizTitle');
    els.progressText = $('#progressText');
    els.progressBarFill = $('#progressBarFill');

    els.questionContainer = $('#questionContainer');
    els.answerContainer = $('#answerContainer');

    els.feedback = $('#feedback');
    els.nextBtn = $('#nextBtn');
    els.quitBtn = $('#quitBtn');
    els.retryMissedBtn = $('#retryMissedBtn');

    els.resultsView = $('#resultsView');
    els.resultsSummary = $('#resultsSummary');
    els.resultsDetails = $('#resultsDetails');
    els.backHomeBtn = $('#backHomeBtn');

    els.weeklyCount = $('#weeklyCount');
    els.weeklyLabel = $('#weeklyLabel');

    els.miniToast = $('#miniToast');
  }

  function showToast(msg) {
    if (!els.miniToast) return;
    els.miniToast.textContent = msg;
    els.miniToast.classList.add('show');
    setTimeout(() => els.miniToast.classList.remove('show'), 2200);
  }

  function setView(viewName) {
    // views: home, quiz, results
    const home = $('#homeView');
    const quiz = els.quizView;
    const results = els.resultsView;

    if (home) home.style.display = viewName === 'home' ? 'block' : 'none';
    if (quiz) quiz.style.display = viewName === 'quiz' ? 'block' : 'none';
    if (results) results.style.display = viewName === 'results' ? 'block' : 'none';
  }

  function updateWeeklyUI() {
    const store = getProgressStore();
    if (!store || !els.weeklyCount) return;

    const weekly = store.getWeeklyCount ? store.getWeeklyCount() : null;
    if (weekly == null) return;

    els.weeklyCount.textContent = weekly;
    if (els.weeklyLabel) {
      els.weeklyLabel.textContent = weekly === 1 ? 'question answered this week' : 'questions answered this week';
    }
  }

  function updateCategoryList() {
    if (!els.categoryList) return;
    els.categoryList.innerHTML = '';

    state.categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        state.selectedCategory = cat;
        state.selectedSubcategory = null;
        state.selectedModuleKey = null;
        updateSubcategoryList();
        updateModuleList();
        updateControlsEnabled();
      });
      els.categoryList.appendChild(btn);
    });
  }

  function getSubcategoriesForCategory(cat) {
    if (!state.content || !state.content.categories) return [];
    const c = state.content.categories[cat];
    if (!c) return [];
    const subcats = Object.keys(c.subcategories || {});
    return subcats;
  }

  function updateSubcategoryList() {
    if (!els.subcategoryList) return;
    els.subcategoryList.innerHTML = '';

    if (!state.selectedCategory) return;

    const subs = getSubcategoriesForCategory(state.selectedCategory);
    subs.forEach((sub) => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.textContent = sub;
      btn.addEventListener('click', () => {
        state.selectedSubcategory = sub;
        state.selectedModuleKey = null;
        updateModuleList();
        updateControlsEnabled();
      });
      els.subcategoryList.appendChild(btn);
    });
  }

  function getModulesForSelection(cat, subcat) {
    if (!state.content || !state.content.categories) return [];
    const c = state.content.categories[cat];
    if (!c) return [];
    const s = (c.subcategories || {})[subcat];
    if (!s) return [];
    return Object.keys(s.modules || {});
  }

  function updateModuleList() {
    if (!els.moduleList) return;
    els.moduleList.innerHTML = '';

    if (!state.selectedCategory || !state.selectedSubcategory) return;

    const mods = getModulesForSelection(state.selectedCategory, state.selectedSubcategory);
    mods.forEach((modKey) => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.textContent = modKey;
      btn.addEventListener('click', () => {
        state.selectedModuleKey = modKey;
        updateControlsEnabled();
      });
      els.moduleList.appendChild(btn);
    });
  }

  function updateControlsEnabled() {
    // For preloaded quizzes, always enable
    if (state.content && state.content.preloaded) {
      if (els.startBtn) els.startBtn.disabled = false;
      return;
    }
    
    const ready = !!(state.selectedCategory && state.selectedSubcategory && state.selectedModuleKey);
    if (els.startBtn) els.startBtn.disabled = !ready;
  }

  function setupControls() {
    if (els.countSelect) {
      els.countSelect.addEventListener('change', (e) => {
        state.selectedCount = parseInt(e.target.value, 10) || 10;
      });
    }
    if (els.modeSelect) {
      els.modeSelect.addEventListener('change', (e) => {
        state.mode = e.target.value;
      });
    }
    if (els.startBtn) {
      els.startBtn.addEventListener('click', () => {
        startQuiz();
      });
    }
    if (els.resumeBtn) {
      els.resumeBtn.addEventListener('click', () => {
        resumeQuiz();
      });
    }
    if (els.resetBtn) {
      els.resetBtn.addEventListener('click', () => {
        const store = getProgressStore();
        if (!store) return;
        if (confirm('Reset all progress? This will clear mastery, weekly count, and stats.')) {
          store.resetAll();
          showToast('Progress reset');
          updateWeeklyUI();
          setupCategoryDisplay();
          showResumeIfAny();
        }
      });
    }

    if (els.nextBtn) {
      els.nextBtn.addEventListener('click', () => {
        nextQuestion();
      });
    }
    if (els.quitBtn) {
      els.quitBtn.addEventListener('click', () => {
        if (confirm('Quit this quiz? Your progress will be saved for resume.')) {
          saveRunForResume();
          endQuizToHome();
        }
      });
    }
    if (els.retryMissedBtn) {
      els.retryMissedBtn.addEventListener('click', () => {
        startRetryQuiz();
      });
    }
    if (els.backHomeBtn) {
      els.backHomeBtn.addEventListener('click', () => {
        endQuizToHome();
      });
    }
  }

  // -----------------------------------------------------------
  // Category display / progress
  // -----------------------------------------------------------
  function setupCategoryDisplay() {
    // highlight selections and show mastery summaries if desired
    const store = getProgressStore();
    if (!store) return;

    // Optional: update category buttons with mastery info etc.
    // This implementation is minimal.
  }

  // -----------------------------------------------------------
  // Quiz Data Access
  // -----------------------------------------------------------
  function getQuestionsForSelection(cat, subcat, modKey, mode) {
    // For preloaded content, return questions directly
    if (state.content && state.content.preloaded) {
      return state.content.questions || [];
    }
    
    if (!state.content || !state.content.categories) return [];
    const c = state.content.categories[cat];
    if (!c) return [];
    const s = (c.subcategories || {})[subcat];
    if (!s) return [];
    const m = (s.modules || {})[modKey];
    if (!m) return [];

    // mode-specific sources
    // Each module can have: mcq, fill, fishboneMcq, fishboneFill arrays (depending on fixtures)
    if (mode === 'fill') return m.fill || m.fillInBlank || [];
    if (mode === 'fishbone-mcq') return m.fishboneMcq || [];
    if (mode === 'fishbone-fill') return m.fishboneFill || [];
    return m.mcq || m.questions || [];
  }

  function normalizeQuestion(q) {
    // Ensure each question has an id and consistent fields
    const nq = Object.assign({}, q);
    if (!nq.id) {
      // create a semi-stable id from prompt text
      const base = (nq.question || nq.prompt || JSON.stringify(nq)).slice(0, 80);
      nq.id = `q_${hashString(base)}`;
    }
    return nq;
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  // -----------------------------------------------------------
  // Quiz Run Lifecycle
  // -----------------------------------------------------------
  function buildRun(questions, opts = {}) {
    const store = getProgressStore();
    const normalized = questions.map(normalizeQuestion);

    // Filter out already-mastered questions for normal runs,
    // but allow forcing full set for retries if opts.forceAll.
    let pool = normalized;
    if (store && !opts.forceAll) {
      pool = normalized.filter(q => !store.isMastered(q.id));
    }

    // If everything mastered, just use full set so user can still quiz
    if (pool.length === 0) pool = normalized;

    // Select N using weighted selection if applicable
    const requested = opts.count || 10;
    const isComprehensive = opts.isComprehensive || state.isComprehensive || false;
    const isCategoryQuiz = opts.isCategoryQuiz || state.isCategoryQuiz || false;
    
    let selected;
    if (opts.useWeighting !== false && (isComprehensive || isCategoryQuiz)) {
      // Use weighted selection for NCLEX quizzes
      selected = selectQuestionsWithWeighting(pool, requested, isComprehensive, isCategoryQuiz);
    } else {
      // Simple shuffle selection for other quizzes
      selected = shuffle(pool).slice(0, Math.min(requested, pool.length));
    }

    const r = {
      createdAt: nowIso(),
      category: state.selectedCategory,
      subcategory: state.selectedSubcategory,
      moduleKey: state.selectedModuleKey,
      mode: state.mode,
      isRetry: !!opts.isRetry,
      isComprehensive: isComprehensive,
      isCategoryQuiz: isCategoryQuiz,
      requestedCount: requested,

      masterPool: selected,          // the original selection
      quizLength: selected.length,   // IMPORTANT: this is counted toward weekly on completion (unless retry)
      queue: selected.slice(),       // questions remaining to master
      missedQueue: [],               // questions missed that may be re-queued
      mastered: new Set(),           // ids mastered during this run
      correctCount: 0,
      incorrectCount: 0,
      attempts: 0,                   // number of question screens attempted (includes retries)
      questionNumber: 0,             // 1-based index of screens shown
      current: null,
      currentAnswered: false,
      currentCorrect: false,

      // Requeue logic
      requeueThreshold: 3,           // when missedQueue hits this, requeue them to front
      requeueBatchSize: 3,

      // Stats for results
      perQuestion: [], // {id, correct, attempts}
    };

    return r;
  }

  function startQuiz() {
    const qs = getQuestionsForSelection(
      state.selectedCategory,
      state.selectedSubcategory,
      state.selectedModuleKey,
      state.mode
    );

    if (!qs || qs.length === 0) {
      alert('No questions available for that selection.');
      return;
    }

    run = buildRun(qs, { 
      count: state.selectedCount, 
      isRetry: false, 
      forceAll: false,
      isComprehensive: state.isComprehensive,
      isCategoryQuiz: state.isCategoryQuiz
    });

    // Clear any previous resume data once a fresh quiz starts
    clearResumeData();

    // Update UI
    setView('quiz');
    updateQuizTitle();
    renderNextFromQueue();
  }

  function startRetryQuiz() {
    if (!run) return;
    // Build retry pool from missed questions in last run's results
    const missed = (run.perQuestion || []).filter(p => p.correct === false).map(p => p.questionObj).filter(Boolean);

    if (!missed || missed.length === 0) {
      alert('No missed questions to retry.');
      return;
    }

    run = buildRun(missed, { 
      count: missed.length, 
      isRetry: true, 
      forceAll: true,
      useWeighting: false  // Don't use weighting for retries
    });
    setView('quiz');
    updateQuizTitle();
    renderNextFromQueue();
  }

  function updateQuizTitle() {
    if (!els.quizTitle) return;
    const parts = [];
    if (run?.category) parts.push(run.category);
    if (run?.subcategory && run.subcategory !== 'default') parts.push(run.subcategory);
    if (run?.moduleKey) parts.push(run.moduleKey);
    const base = parts.join(' / ') || 'Quiz';
    const tag = run?.isRetry ? ' (Retry)' : '';
    els.quizTitle.textContent = `${base}${tag}`;
  }

  function endQuizToHome() {
    run = null;
    setView('home');
    updateWeeklyUI();
    showResumeIfAny();
  }

  // -----------------------------------------------------------
  // Resume Quiz Persistence
  // -----------------------------------------------------------
  const RESUME_KEY = 'study_guru_resume_run_v1';

  function saveRunForResume() {
    if (!run) return;

    const serializable = {
      createdAt: run.createdAt,
      category: run.category,
      subcategory: run.subcategory,
      moduleKey: run.moduleKey,
      mode: run.mode,
      isRetry: run.isRetry,
      isComprehensive: run.isComprehensive,
      isCategoryQuiz: run.isCategoryQuiz,
      requestedCount: run.requestedCount,
      quizLength: run.quizLength,
      masterPool: run.masterPool,
      queue: run.queue,
      missedQueue: run.missedQueue,
      mastered: Array.from(run.mastered || []),
      correctCount: run.correctCount,
      incorrectCount: run.incorrectCount,
      attempts: run.attempts,
      questionNumber: run.questionNumber,
      perQuestion: (run.perQuestion || []).map(p => ({
        id: p.id,
        correct: p.correct,
        attempts: p.attempts
      }))
    };

    localStorage.setItem(RESUME_KEY, JSON.stringify(serializable));
  }

  function loadResumeData() {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const data = safeJsonParse(raw, null);
    if (!data) return null;
    return data;
  }

  function clearResumeData() {
    localStorage.removeItem(RESUME_KEY);
  }

  function showResumeIfAny() {
    const data = loadResumeData();
    state.resumeAvailable = !!data;
    if (els.resumeBtn) {
      els.resumeBtn.style.display = state.resumeAvailable ? 'inline-flex' : 'none';
    }
  }

  function resumeQuiz() {
    const data = loadResumeData();
    if (!data) return;

    // restore selection
    state.selectedCategory = data.category;
    state.selectedSubcategory = data.subcategory;
    state.selectedModuleKey = data.moduleKey;
    state.mode = data.mode || 'mcq';

    // restore run
    run = {
      createdAt: data.createdAt,
      category: data.category,
      subcategory: data.subcategory,
      moduleKey: data.moduleKey,
      mode: data.mode,
      isRetry: !!data.isRetry,
      isComprehensive: !!data.isComprehensive,
      isCategoryQuiz: !!data.isCategoryQuiz,
      requestedCount: data.requestedCount,
      quizLength: data.quizLength,
      masterPool: (data.masterPool || []).map(normalizeQuestion),
      queue: (data.queue || []).map(normalizeQuestion),
      missedQueue: (data.missedQueue || []).map(normalizeQuestion),
      mastered: new Set(data.mastered || []),
      correctCount: data.correctCount || 0,
      incorrectCount: data.incorrectCount || 0,
      attempts: data.attempts || 0,
      questionNumber: data.questionNumber || 0,
      current: null,
      currentAnswered: false,
      currentCorrect: false,
      requeueThreshold: 3,
      requeueBatchSize: 3,
      perQuestion: (data.perQuestion || []).map(p => Object.assign({}, p))
    };

    setView('quiz');
    updateQuizTitle();
    renderNextFromQueue();
  }

  // -----------------------------------------------------------
  // Rendering / Flow
  // -----------------------------------------------------------
  function renderNextFromQueue() {
    if (!run) return;

    // If queue empty, finish
    if (!run.queue || run.queue.length === 0) {
      finishQuiz();
      return;
    }

    // Pop next
    const q = run.queue.shift();
    run.current = q;
    run.currentAnswered = false;
    run.currentCorrect = false;
    run.questionNumber += 1;

    updateProgressUI();
    renderQuestion(q);
    renderAnswers(q);

    if (els.feedback) els.feedback.textContent = '';
    if (els.nextBtn) els.nextBtn.disabled = true;

    // Save resume on each render
    saveRunForResume();
  }

  function updateProgressUI() {
    if (!els.progressText || !els.progressBarFill) return;

    const total = run.quizLength || (run.masterPool ? run.masterPool.length : 0);
    const remaining = run.queue.length;
    const masteredCount = run.mastered.size;

    // Progress is based on mastery for the original quiz length
    const pct = total > 0 ? (masteredCount / total) * 100 : 0;
    els.progressText.textContent = `Mastered ${masteredCount}/${total} • Remaining ${remaining}`;
    els.progressBarFill.style.width = `${clamp(pct, 0, 100)}%`;
  }

  function renderQuestion(q) {
    if (!els.questionContainer) return;

    // Clear
    els.questionContainer.innerHTML = '';

    const prompt = q.question || q.prompt || q.text || '(No question text)';
    const h = document.createElement('div');
    h.className = 'question-text';
    h.textContent = prompt;
    els.questionContainer.appendChild(h);

    // Optional: extra info
    if (q.stem) {
      const s = document.createElement('div');
      s.className = 'question-stem';
      s.textContent = q.stem;
      els.questionContainer.appendChild(s);
    }
  }

  function renderAnswers(q) {
    if (!els.answerContainer) return;
    els.answerContainer.innerHTML = '';

    // Mode-specific render
    if (run.mode === 'fill' || run.mode === 'fishbone-fill') {
      renderFillBlank(q);
      return;
    }

    renderMcq(q);
  }

  function renderMcq(q) {
    const choices = q.choices || q.options || [];
    const shuffled = shuffle(choices.map((c) => (typeof c === 'string' ? { text: c } : c)));

    shuffled.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = choice.text || choice.label || '(choice)';
      btn.addEventListener('click', () => {
        onAnswerSelected(choice, q);
      });
      els.answerContainer.appendChild(btn);
    });
  }

  function renderFillBlank(q) {
    const wrapper = document.createElement('div');
    wrapper.className = 'fill-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fill-input';
    input.placeholder = 'Type your answer...';

    const submit = document.createElement('button');
    submit.className = 'answer-btn';
    submit.textContent = 'Submit';
    submit.addEventListener('click', () => {
      onFillSubmit(input.value, q);
    });

    wrapper.appendChild(input);
    wrapper.appendChild(submit);
    els.answerContainer.appendChild(wrapper);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onFillSubmit(input.value, q);
    });
  }

  // -----------------------------------------------------------
  // Answer Handling
  // -----------------------------------------------------------
  function onAnswerSelected(choice, q) {
    if (!run || run.currentAnswered) return;

    run.currentAnswered = true;
    run.attempts += 1;

    // Determine correctness
    const correct = isChoiceCorrect(choice, q);
    run.currentCorrect = correct;

    recordQuestionAttempt(q, correct);

    if (correct) {
      run.correctCount += 1;
      markMastered(q);
      showFeedback(true, q);
    } else {
      run.incorrectCount += 1;
      handleIncorrect(q);
      showFeedback(false, q);
    }

    if (els.nextBtn) els.nextBtn.disabled = false;
    saveRunForResume();
  }

  function onFillSubmit(value, q) {
    if (!run || run.currentAnswered) return;

    run.currentAnswered = true;
    run.attempts += 1;

    const correct = isFillCorrect(value, q);
    run.currentCorrect = correct;

    recordQuestionAttempt(q, correct);

    if (correct) {
      run.correctCount += 1;
      markMastered(q);
      showFeedback(true, q);
    } else {
      run.incorrectCount += 1;
      handleIncorrect(q);
      showFeedback(false, q, value);
    }

    if (els.nextBtn) els.nextBtn.disabled = false;
    saveRunForResume();
  }

  function isChoiceCorrect(choice, q) {
    // Common formats:
    // - q.answer is index or string
    // - q.correct is string
    // - choice.correct boolean
    if (choice && typeof choice === 'object' && choice.correct === true) return true;

    const ans = q.answer ?? q.correct ?? q.correctAnswer;
    if (ans == null) return false;

    // If ans is a number index in original choices
    if (typeof ans === 'number') {
      const original = (q.choices || q.options || [])[ans];
      if (original == null) return false;
      const originalText = typeof original === 'string' ? original : (original.text || original.label);
      const selectedText = choice.text || choice.label;
      return (originalText || '').trim() === (selectedText || '').trim();
    }

    // If ans is a string (match)
    if (typeof ans === 'string') {
      const selectedText = choice.text || choice.label || '';
      return ans.trim().toLowerCase() === selectedText.trim().toLowerCase();
    }

    return false;
  }

  function isFillCorrect(input, q) {
    const ans = q.answer ?? q.correct ?? q.correctAnswer ?? q.expected ?? '';
    const user = (input || '').trim().toLowerCase();
    const expected = (ans || '').trim().toLowerCase();

    if (!expected) return false;

    // allow arrays of acceptable answers
    if (Array.isArray(ans)) {
      return ans.some(a => (a || '').trim().toLowerCase() === user);
    }

    return user === expected;
  }

  function showFeedback(isCorrect, q, userValue = null) {
    if (!els.feedback) return;

    if (isCorrect) {
      els.feedback.textContent = '✅ Correct';
      els.feedback.className = 'feedback correct';
    } else {
      const ans = q.answer ?? q.correct ?? q.correctAnswer ?? q.expected;
      const ansText = Array.isArray(ans) ? ans.join(', ') : ans;
      els.feedback.textContent = `❌ Incorrect. Answer: ${ansText || '(unknown)'}${userValue != null ? ` (you: ${userValue})` : ''}`;
      els.feedback.className = 'feedback incorrect';
    }

    // disable answer buttons
    $all('.answer-btn').forEach(b => {
      b.disabled = true;
    });
    const fillInput = $('.fill-input');
    if (fillInput) fillInput.disabled = true;
  }

  function recordQuestionAttempt(q, correct) {
    // Track perQuestion attempts for results + retry pool
    const id = q.id;
    let rec = run.perQuestion.find(p => p.id === id);
    if (!rec) {
      rec = { id, correct: null, attempts: 0, questionObj: q };
      run.perQuestion.push(rec);
    }
    rec.attempts += 1;
    // Correct stays true if ever correct; false only if never corrected
    if (correct) rec.correct = true;
    else if (rec.correct !== true) rec.correct = false;
  }

  function markMastered(q) {
    const store = getProgressStore();
    run.mastered.add(q.id);
    if (store) store.setMastered(q.id, true);
  }

  function handleIncorrect(q) {
    // Add to missed queue for requeue system
    run.missedQueue.push(q);

    // If we reached threshold, requeue missed questions
    if (run.missedQueue.length >= run.requeueThreshold) {
      const batch = run.missedQueue.splice(0, run.requeueBatchSize);
      // Put missed batch back to front of queue
      run.queue = batch.concat(run.queue);
    }
  }

  function nextQuestion() {
    if (!run) return;

    // If current question answered correctly, it's mastered.
    // If incorrect, it may be requeued by handleIncorrect.

    // Remove current from screen and proceed
    renderNextFromQueue();
  }

  // -----------------------------------------------------------
  // Finish / Results
  // -----------------------------------------------------------
  function finishQuiz() {
    if (!run) return;

    // Determine total questions in THIS quiz selection (not retries through requeue).
    const totalQuestions = run.quizLength || (run.masterPool ? run.masterPool.length : 0);

    // Update results UI
    setView('results');

    // Hide retry button unless there are missed
    const missedCount = (run.perQuestion || []).filter(p => p.correct === false).length;
    if (els.retryMissedBtn) {
      els.retryMissedBtn.style.display = missedCount > 0 ? 'inline-flex' : 'none';
    }

    // Build summary
    const masteredCount = run.mastered.size;
    const pct = totalQuestions > 0 ? (masteredCount / totalQuestions) * 100 : 0;

    if (els.resultsSummary) {
      const retryTag = run.isRetry ? ' (Retry run — not counted toward weekly)' : '';
      els.resultsSummary.textContent =
        `Mastered ${masteredCount}/${totalQuestions} (${formatPct(pct)}) • Correct: ${run.correctCount} • Incorrect: ${run.incorrectCount} • Attempts: ${run.attempts}${retryTag}`;
    }

    // Detail list
    if (els.resultsDetails) {
      els.resultsDetails.innerHTML = '';
      const ul = document.createElement('ul');
      ul.className = 'results-list';

      (run.perQuestion || []).forEach((p) => {
        const li = document.createElement('li');
        const status = p.correct ? '✅' : '❌';
        li.textContent = `${status} ${p.id} • attempts: ${p.attempts}`;
        ul.appendChild(li);
      });

      els.resultsDetails.appendChild(ul);
    }

    // Save category score to progress store
    const store = getProgressStore();
    if (store && store.recordCategoryScore) {
      // Compute category-level percent correct in this run by category field if available
      // Minimal: just store pct for the specific module selection
      const key = `${run.category} / ${run.subcategory} / ${run.moduleKey}`;
      store.recordCategoryScore(key, Math.round(pct));
    }

    // If your content includes category tags per question, store those too (optional)
    // E.g. q.categoryTag
    if (store && store.recordCategoryScore && (run.perQuestion || []).length > 0) {
      const categoryResults = {};
      run.perQuestion.forEach((p) => {
        const q = p.questionObj;
        const category = q && (q.categoryTag || q.category || q.tag);
        if (!category) return;
        categoryResults[category] = categoryResults[category] || { correct: 0, total: 0 };
        categoryResults[category].total += 1;
        if (p.correct) categoryResults[category].correct += 1;
      });

      if (categoryResults && Object.keys(categoryResults).length > 0) {
        for (const [category, result] of Object.entries(categoryResults)) {
          const catPct = Math.round((result.correct / result.total) * 100);
          store.recordCategoryScore(category, catPct);
        }
      }
      console.log('[Quiz] Category scores saved to progress store');
    }

    // ========== WEEKLY QUESTION COUNT ==========
    // Only count ORIGINAL quizzes toward the weekly counter.
    // Retry runs (e.g., "Retry Missed Questions") should NOT add to the weekly total.
    if (window.StudyGuruProgress) {
      if (!run.isRetry) {
        window.StudyGuruProgress.recordCompletedQuiz(totalQuestions);
        console.log(`[Quiz] Recorded ${totalQuestions} completed questions to weekly count`);
      } else {
        console.log('[Quiz] Retry run detected; skipping weekly question count increment');
      }

      // Record attempts for each question in the quiz (for least-asked tracking)
      if (window.StudyGuruProgress.recordQuizAttempts) {
        const questionIds = run.masterPool.map(q => q.id).filter(Boolean);
        window.StudyGuruProgress.recordQuizAttempts(questionIds);
        console.log(`[Quiz] Recorded attempts for ${questionIds.length} questions`);
      }
    }
    // ========== END WEEKLY QUESTION COUNT ==========

    // clear resume data since quiz completed
    clearResumeData();

    // Update weekly UI on results screen if shown there
    updateWeeklyUI();
  }

  // -----------------------------------------------------------
  // Home init / display (progress summaries, etc)
  // -----------------------------------------------------------
  function initModules() {
    // Populate default selections
    if (els.countSelect) els.countSelect.value = String(state.selectedCount);
    if (els.modeSelect) els.modeSelect.value = state.mode;

    updateCategoryList();
    updateSubcategoryList();
    updateModuleList();
    updateControlsEnabled();
    updateWeeklyUI();
    setupCategoryDisplay();
  }

  // -----------------------------------------------------------
  // Auto-start support for preloaded quizzes
  // -----------------------------------------------------------
  function checkAutoStart() {
    // Check URL for autostart parameter
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === 'true';
    const quizLength = parseInt(params.get('quiz_length'), 10) || 10;
    
    if (autostart && state.content && state.content.preloaded) {
      console.log('[Quiz] Auto-starting quiz with length:', quizLength);
      state.selectedCount = quizLength;
      startQuiz();
    }
  }

  // -----------------------------------------------------------
  // App Init
  // -----------------------------------------------------------
  async function init() {
    cacheElements();
    setupControls();

    try {
      await loadContent();
    } catch (e) {
      console.error(e);
      alert('Failed to load content. Please refresh.');
      return;
    }

    setView('home');
    initModules();
    showResumeIfAny();
    
    // Check for auto-start
    checkAutoStart();
  }

  // Start
  document.addEventListener('DOMContentLoaded', init);
})();
