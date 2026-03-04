/* ============================================================
   Study Guru Progress Store
   
   Device-only (no login) progress tracking that works offline.
   - Tracks questions answered this week
   - Tracks per-question attempt counts
   - Tracks category performance (scores over time)
   - Tracks CFRN/CCRN mastery IDs with target-date cycles
   - Tracks CFRN/CCRN cycle-specific category performance
   - All data stored on-device only (localStorage)
   - Persists across sessions
   - Updates across tabs via storage event
   ============================================================ */

(function() {
  'use strict';

  // Storage key prefix (versioned for future migrations)
  const PREFIX = 'sg:v1:';
  const ATTEMPTS_KEY     = PREFIX + 'attemptsByQuestion';
  const DAILY_KEY        = PREFIX + 'dailyAnsweredCounts';
  const CATEGORY_PERF_KEY = PREFIX + 'categoryPerformance';

  // Mastery / Cycle keys per bank
  const MASTERED_KEYS = {
    cfrn: PREFIX + 'cfrnMasteredIds',
    ccrn: PREFIX + 'ccrnMasteredIds'
  };
  const TARGET_KEYS = {
    cfrn: PREFIX + 'cfrnTargetDate',
    ccrn: PREFIX + 'ccrnTargetDate'
  };
  const CYCLE_PERF_KEYS = {
    cfrn: PREFIX + 'cfrnCyclePerf',
    ccrn: PREFIX + 'ccrnCyclePerf'
  };

  // How many days of daily counts to keep
  const DAILY_RETENTION_DAYS = 21;

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  function safeJsonParse(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); }
    catch (e) {
      console.warn('[ProgressStore] JSON parse error:', e);
      return fallback;
    }
  }

  function getTodayISO() {
    const now = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day   = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseISODate(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function getWeekStartMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function isSameWeek(date1, date2) {
    return getWeekStartMonday(date1).getTime() === getWeekStartMonday(date2).getTime();
  }

  function isInCurrentWeek(isoDate) {
    return isSameWeek(parseISODate(isoDate), new Date());
  }

  // ============================================================
  // CORE STORAGE FUNCTIONS
  // ============================================================

  function loadAttempts() {
    return safeJsonParse(localStorage.getItem(ATTEMPTS_KEY), {});
  }

  function saveAttempts(attempts) {
    try { localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts)); }
    catch (e) { console.error('[ProgressStore] Failed to save attempts:', e); }
  }

  function loadDailyCounts() {
    return safeJsonParse(localStorage.getItem(DAILY_KEY), {});
  }

  function saveDailyCounts(counts) {
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(counts)); }
    catch (e) { console.error('[ProgressStore] Failed to save daily counts:', e); }
  }

  function pruneDailyCounts(counts) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAILY_RETENTION_DAYS);
    cutoffDate.setHours(0, 0, 0, 0);
    const pruned = {};
    for (const [dateStr, count] of Object.entries(counts)) {
      if (parseISODate(dateStr) >= cutoffDate) pruned[dateStr] = count;
    }
    return pruned;
  }

  // ============================================================
  // GLOBAL CATEGORY PERFORMANCE FUNCTIONS
  // ============================================================

  function loadCategoryPerformance() {
    return safeJsonParse(localStorage.getItem(CATEGORY_PERF_KEY), {});
  }

  function saveCategoryPerformance(data) {
    try { localStorage.setItem(CATEGORY_PERF_KEY, JSON.stringify(data)); }
    catch (e) { console.error('[ProgressStore] Failed to save category performance:', e); }
  }

  function recordCategoryScore(categoryName, percentage) {
    if (!categoryName) return;
    const perfData = loadCategoryPerformance();
    if (!perfData[categoryName]) perfData[categoryName] = { scores: [] };
    perfData[categoryName].scores.push(Math.round(percentage));
    if (perfData[categoryName].scores.length > 50)
      perfData[categoryName].scores = perfData[categoryName].scores.slice(-50);
    saveCategoryPerformance(perfData);
  }

  function getCategoryAverage(categoryName) {
    if (!categoryName) return null;
    const perfData = loadCategoryPerformance();
    const catData  = perfData[categoryName];
    if (!catData || !catData.scores || catData.scores.length === 0) return null;
    const sum = catData.scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / catData.scores.length);
  }

  function getAllCategoryAverages() {
    const perfData = loadCategoryPerformance();
    const averages = {};
    for (const [cat, catData] of Object.entries(perfData)) {
      if (catData.scores && catData.scores.length > 0) {
        const sum = catData.scores.reduce((a, b) => a + b, 0);
        averages[cat] = Math.round(sum / catData.scores.length);
      }
    }
    return averages;
  }

  function getCategoryAttemptCount(categoryName) {
    if (!categoryName) return 0;
    const perfData = loadCategoryPerformance();
    return perfData[categoryName]?.scores?.length || 0;
  }

  function clearCategoryPerformance() {
    try { localStorage.removeItem(CATEGORY_PERF_KEY); }
    catch (e) { console.error('[ProgressStore] Failed to clear category performance:', e); }
  }

  // ============================================================
  // MASTERY ID TRACKING  (per bank: 'cfrn' | 'ccrn')
  // ============================================================

  /**
   * Returns a Set of question IDs that have been mastered this cycle.
   * @param {'cfrn'|'ccrn'} bank
   * @returns {Set<string>}
   */
  function getMasteredIds(bank) {
    const key = MASTERED_KEYS[bank];
    if (!key) return new Set();
    const arr = safeJsonParse(localStorage.getItem(key), []);
    return new Set(arr);
  }

  /**
   * Add question IDs to the mastered set for this bank.
   * @param {'cfrn'|'ccrn'} bank
   * @param {string[]} ids
   */
  function addMasteredIds(bank, ids) {
    const key = MASTERED_KEYS[bank];
    if (!key || !ids || !ids.length) return;
    const existing = getMasteredIds(bank);
    ids.forEach(id => { if (id) existing.add(id); });
    try { localStorage.setItem(key, JSON.stringify(Array.from(existing))); }
    catch (e) { console.error('[ProgressStore] Failed to save mastered IDs:', e); }
    console.log(`[ProgressStore] ${bank.toUpperCase()} mastered IDs: ${existing.size} total`);
  }

  /**
   * Number of mastered questions for this bank.
   * @param {'cfrn'|'ccrn'} bank
   * @returns {number}
   */
  function getMasteredCount(bank) {
    return getMasteredIds(bank).size;
  }

  /**
   * Clear all mastered IDs for a bank (cycle reset).
   * @param {'cfrn'|'ccrn'} bank
   */
  function clearMasteredIds(bank) {
    const key = MASTERED_KEYS[bank];
    if (!key) return;
    try { localStorage.removeItem(key); }
    catch (e) { console.error('[ProgressStore] Failed to clear mastered IDs:', e); }
  }

  // ============================================================
  // TARGET DATE  (per bank)
  // ============================================================

  /**
   * Get the stored target date for a bank.
   * @param {'cfrn'|'ccrn'} bank
   * @returns {string|null} YYYY-MM-DD or null
   */
  function getTargetDate(bank) {
    const key = TARGET_KEYS[bank];
    if (!key) return null;
    return localStorage.getItem(key) || null;
  }

  /**
   * Set the target date for a bank.
   * @param {'cfrn'|'ccrn'} bank
   * @param {string} dateStr YYYY-MM-DD
   */
  function setTargetDate(bank, dateStr) {
    const key = TARGET_KEYS[bank];
    if (!key || !dateStr) return;
    try { localStorage.setItem(key, dateStr); }
    catch (e) { console.error('[ProgressStore] Failed to save target date:', e); }
  }

  /**
   * Clear the target date for a bank.
   * @param {'cfrn'|'ccrn'} bank
   */
  function clearTargetDate(bank) {
    const key = TARGET_KEYS[bank];
    if (!key) return;
    try { localStorage.removeItem(key); }
    catch (e) {}
  }

  /**
   * Check if today is AFTER the target date and reset the cycle if so.
   * Should be called on page load.
   * @param {'cfrn'|'ccrn'} bank
   * @returns {boolean} true if a reset occurred
   */
  function checkAndResetCycle(bank) {
    const targetDate = getTargetDate(bank);
    if (!targetDate) return false;

    const today = getTodayISO();
    // Reset the day AFTER the target date (today > targetDate)
    if (today > targetDate) {
      clearMasteredIds(bank);
      clearTargetDate(bank);
      clearCyclePerf(bank);
      console.log(`[ProgressStore] ${bank.toUpperCase()} study cycle reset — target date has passed`);
      return true;
    }
    return false;
  }

  // ============================================================
  // CYCLE CATEGORY PERFORMANCE  (per bank, resets with cycle)
  // ============================================================

  function loadCyclePerf(bank) {
    const key = CYCLE_PERF_KEYS[bank];
    if (!key) return {};
    return safeJsonParse(localStorage.getItem(key), {});
  }

  function saveCyclePerf(bank, data) {
    const key = CYCLE_PERF_KEYS[bank];
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch (e) { console.error('[ProgressStore] Failed to save cycle performance:', e); }
  }

  /**
   * Record a category quiz score for a specific bank's cycle.
   * @param {'cfrn'|'ccrn'} bank
   * @param {string} categoryName
   * @param {number} percentage 0-100
   */
  function recordCycleCategoryScore(bank, categoryName, percentage) {
    if (!bank || !categoryName) return;
    const data = loadCyclePerf(bank);
    if (!data[categoryName]) data[categoryName] = { scores: [] };
    data[categoryName].scores.push(Math.round(percentage));
    if (data[categoryName].scores.length > 50)
      data[categoryName].scores = data[categoryName].scores.slice(-50);
    saveCyclePerf(bank, data);
  }

  /**
   * Get average scores for all categories in this bank's cycle.
   * @param {'cfrn'|'ccrn'} bank
   * @returns {Object} Map of categoryName -> average percentage
   */
  function getAllCycleCategoryAverages(bank) {
    const data = loadCyclePerf(bank);
    const averages = {};
    for (const [cat, catData] of Object.entries(data)) {
      if (catData.scores && catData.scores.length > 0) {
        const sum = catData.scores.reduce((a, b) => a + b, 0);
        averages[cat] = Math.round(sum / catData.scores.length);
      }
    }
    return averages;
  }

  /**
   * Clear all cycle performance data for a bank.
   * @param {'cfrn'|'ccrn'} bank
   */
  function clearCyclePerf(bank) {
    const key = CYCLE_PERF_KEYS[bank];
    if (!key) return;
    try { localStorage.removeItem(key); }
    catch (e) {}
  }

  // ============================================================
  // PUBLIC API - QUESTION TRACKING
  // ============================================================

  function recordCompletedQuiz(questionCount) {
    if (!questionCount || questionCount <= 0) return;
    const today = getTodayISO();
    let dailyCounts = loadDailyCounts();
    dailyCounts[today] = (dailyCounts[today] || 0) + questionCount;
    dailyCounts = pruneDailyCounts(dailyCounts);
    saveDailyCounts(dailyCounts);
    console.log(`[ProgressStore] Recorded ${questionCount} completed questions. Today: ${dailyCounts[today]}`);
  }

  function recordQuizAttempts(questionIds) {
    if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) return;
    const attempts = loadAttempts();
    for (const qId of questionIds) {
      if (qId) attempts[qId] = (attempts[qId] || 0) + 1;
    }
    saveAttempts(attempts);
    console.log(`[ProgressStore] Recorded attempts for ${questionIds.length} questions`);
  }

  function getAttemptsForQuestions(questionIds) {
    if (!questionIds || !Array.isArray(questionIds)) return {};
    const allAttempts = loadAttempts();
    const result = {};
    for (const qId of questionIds) result[qId] = allAttempts[qId] || 0;
    return result;
  }

  function sortByLeastAttempted(questions) {
    if (!questions || !Array.isArray(questions)) return [];
    const attempts = loadAttempts();
    return [...questions].sort((a, b) => {
      const attemptsA = attempts[a.id] || 0;
      const attemptsB = attempts[b.id] || 0;
      return attemptsA - attemptsB;
    });
  }

  // Deprecated — kept for backward compatibility
  function recordAnswered(stableId) {
    if (!stableId) return;
    const attempts = loadAttempts();
    attempts[stableId] = (attempts[stableId] || 0) + 1;
    saveAttempts(attempts);
  }

  function answeredThisWeek() {
    const dailyCounts = loadDailyCounts();
    let total = 0;
    for (const [dateStr, count] of Object.entries(dailyCounts)) {
      if (isInCurrentWeek(dateStr)) total += count;
    }
    return total;
  }

  function getAttempts(stableId) {
    if (!stableId) return 0;
    return loadAttempts()[stableId] || 0;
  }

  function getAttemptsMap() {
    return loadAttempts();
  }

  function answeredToday() {
    return loadDailyCounts()[getTodayISO()] || 0;
  }

  function getDailyHistory(days = 7) {
    const dailyCounts = loadDailyCounts();
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({ date: dateStr, count: dailyCounts[dateStr] || 0 });
    }
    return result;
  }

  function clearAll() {
    try {
      localStorage.removeItem(ATTEMPTS_KEY);
      localStorage.removeItem(DAILY_KEY);
      localStorage.removeItem(CATEGORY_PERF_KEY);
      Object.values(MASTERED_KEYS).forEach(k => localStorage.removeItem(k));
      Object.values(TARGET_KEYS).forEach(k => localStorage.removeItem(k));
      Object.values(CYCLE_PERF_KEYS).forEach(k => localStorage.removeItem(k));
      console.log('[ProgressStore] All progress data cleared');
    } catch (e) {
      console.error('[ProgressStore] Failed to clear data:', e);
    }
  }

  function getStableId(question, moduleName, index) {
    if (question.stable_id) return question.stable_id;
    if (question.id) return String(question.id);
    return `${moduleName || 'unknown'}::${index}`;
  }

  // ============================================================
  // EXPORT PUBLIC API
  // ============================================================

  window.StudyGuruProgress = {
    // Question tracking
    recordCompletedQuiz,
    recordQuizAttempts,
    recordAnswered,        // Deprecated but kept for compatibility
    answeredThisWeek,
    answeredToday,
    getAttempts,
    getAttemptsMap,
    getAttemptsForQuestions,
    sortByLeastAttempted,
    getDailyHistory,
    getStableId,

    // Global category performance tracking
    recordCategoryScore,
    getCategoryAverage,
    getAllCategoryAverages,
    getCategoryAttemptCount,
    clearCategoryPerformance,

    // Mastery ID tracking (CFRN / CCRN)
    getMasteredIds,
    getMasteredCount,
    addMasteredIds,
    clearMasteredIds,

    // Target date
    getTargetDate,
    setTargetDate,
    clearTargetDate,
    checkAndResetCycle,

    // Cycle category performance (CFRN / CCRN)
    recordCycleCategoryScore,
    getAllCycleCategoryAverages,
    clearCyclePerf,

    // Utility
    clearAll,

    // Constants
    PREFIX
  };

  console.log('[ProgressStore] Initialized. Weekly count:', answeredThisWeek());

})();
