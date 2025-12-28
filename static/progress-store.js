/* ============================================================
   Study Guru Progress Store
   
   Device-only (no login) progress tracking that works offline.
   - Tracks questions answered this week
   - Tracks per-question attempt counts
   - All data stored on-device only (localStorage)
   - Persists across sessions
   - Updates across tabs via storage event
   ============================================================ */

(function() {
  'use strict';

  // Storage key prefix (versioned for future migrations)
  const PREFIX = 'sg:v1:';
  const ATTEMPTS_KEY = PREFIX + 'attemptsByQuestion';
  const DAILY_KEY = PREFIX + 'dailyAnsweredCounts';
  
  // How many days of daily counts to keep
  const DAILY_RETENTION_DAYS = 21;

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  /**
   * Safe JSON parse with fallback
   * @param {string} str - JSON string to parse
   * @param {*} fallback - Value to return if parse fails
   * @returns {*} Parsed value or fallback
   */
  function safeJsonParse(str, fallback) {
    if (!str) return fallback;
    try {
      return JSON.parse(str);
    } catch (e) {
      console.warn('[ProgressStore] JSON parse error:', e);
      return fallback;
    }
  }

  /**
   * Get today's date as YYYY-MM-DD in local time
   * @returns {string} ISO date string
   */
  function getTodayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse a YYYY-MM-DD string into a Date object (local time, midnight)
   * @param {string} isoDate - Date string in YYYY-MM-DD format
   * @returns {Date} Date object
   */
  function parseISODate(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Get the Monday of the week containing the given date
   * @param {Date} date - Any date
   * @returns {Date} Monday of that week (midnight local time)
   */
  function getWeekStartMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    // getDay() returns 0 for Sunday, 1 for Monday, etc.
    // We want Monday as start, so:
    // If Sunday (0), go back 6 days
    // If Monday (1), go back 0 days
    // If Tuesday (2), go back 1 day, etc.
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Check if two dates are in the same Monday-start week
   * @param {Date} date1 
   * @param {Date} date2 
   * @returns {boolean}
   */
  function isSameWeek(date1, date2) {
    const monday1 = getWeekStartMonday(date1);
    const monday2 = getWeekStartMonday(date2);
    return monday1.getTime() === monday2.getTime();
  }

  /**
   * Check if a date string (YYYY-MM-DD) is in the current week
   * @param {string} isoDate - Date string
   * @returns {boolean}
   */
  function isInCurrentWeek(isoDate) {
    const date = parseISODate(isoDate);
    const today = new Date();
    return isSameWeek(date, today);
  }

  // ============================================================
  // STORAGE FUNCTIONS
  // ============================================================

  /**
   * Load attempts by question from localStorage
   * @returns {Object} Map of stableId -> attempt count
   */
  function loadAttempts() {
    return safeJsonParse(localStorage.getItem(ATTEMPTS_KEY), {});
  }

  /**
   * Save attempts by question to localStorage
   * @param {Object} attempts - Map of stableId -> attempt count
   */
  function saveAttempts(attempts) {
    try {
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
    } catch (e) {
      console.error('[ProgressStore] Failed to save attempts:', e);
    }
  }

  /**
   * Load daily answered counts from localStorage
   * @returns {Object} Map of YYYY-MM-DD -> count
   */
  function loadDailyCounts() {
    return safeJsonParse(localStorage.getItem(DAILY_KEY), {});
  }

  /**
   * Save daily answered counts to localStorage
   * @param {Object} counts - Map of YYYY-MM-DD -> count
   */
  function saveDailyCounts(counts) {
    try {
      localStorage.setItem(DAILY_KEY, JSON.stringify(counts));
    } catch (e) {
      console.error('[ProgressStore] Failed to save daily counts:', e);
    }
  }

  /**
   * Prune daily counts to keep only the last N days
   * @param {Object} counts - Map of YYYY-MM-DD -> count
   * @returns {Object} Pruned counts
   */
  function pruneDailyCounts(counts) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DAILY_RETENTION_DAYS);
    cutoffDate.setHours(0, 0, 0, 0);

    const pruned = {};
    for (const [dateStr, count] of Object.entries(counts)) {
      const date = parseISODate(dateStr);
      if (date >= cutoffDate) {
        pruned[dateStr] = count;
      }
    }
    return pruned;
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Record that a question was answered
   * - Increments attemptsByQuestion[stableId]
   * - Increments dailyAnsweredCounts[today]
   * @param {string} stableId - Stable identifier for the question
   */
  function recordAnswered(stableId) {
    if (!stableId) {
      console.warn('[ProgressStore] recordAnswered called without stableId');
      return;
    }

    // Update attempts by question
    const attempts = loadAttempts();
    attempts[stableId] = (attempts[stableId] || 0) + 1;
    saveAttempts(attempts);

    // Update daily count
    const today = getTodayISO();
    let dailyCounts = loadDailyCounts();
    dailyCounts[today] = (dailyCounts[today] || 0) + 1;
    
    // Prune old entries
    dailyCounts = pruneDailyCounts(dailyCounts);
    saveDailyCounts(dailyCounts);

    console.log(`[ProgressStore] Recorded answer for ${stableId}. Today: ${dailyCounts[today]}, Total attempts: ${attempts[stableId]}`);
  }

  /**
   * Get the total number of questions answered this week (Monday-start)
   * @returns {number} Total answers this week
   */
  function answeredThisWeek() {
    const dailyCounts = loadDailyCounts();
    let total = 0;

    for (const [dateStr, count] of Object.entries(dailyCounts)) {
      if (isInCurrentWeek(dateStr)) {
        total += count;
      }
    }

    return total;
  }

  /**
   * Get the attempt count for a specific question
   * @param {string} stableId - Stable identifier for the question
   * @returns {number} Number of times this question was answered
   */
  function getAttempts(stableId) {
    if (!stableId) return 0;
    const attempts = loadAttempts();
    return attempts[stableId] || 0;
  }

  /**
   * Get the full attempts map (for "least answered first" selection)
   * @returns {Object} Map of stableId -> attempt count
   */
  function getAttemptsMap() {
    return loadAttempts();
  }

  /**
   * Get today's answer count
   * @returns {number} Answers today
   */
  function answeredToday() {
    const dailyCounts = loadDailyCounts();
    const today = getTodayISO();
    return dailyCounts[today] || 0;
  }

  /**
   * Get daily counts for a date range (useful for stats display)
   * @param {number} days - Number of days to include (default 7)
   * @returns {Array} Array of { date, count } objects
   */
  function getDailyHistory(days = 7) {
    const dailyCounts = loadDailyCounts();
    const result = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({
        date: dateStr,
        count: dailyCounts[dateStr] || 0
      });
    }

    return result;
  }

  /**
   * Clear all progress data (for testing/reset)
   */
  function clearAll() {
    try {
      localStorage.removeItem(ATTEMPTS_KEY);
      localStorage.removeItem(DAILY_KEY);
      console.log('[ProgressStore] All progress data cleared');
    } catch (e) {
      console.error('[ProgressStore] Failed to clear data:', e);
    }
  }

  /**
   * Get a stable ID for a question object
   * @param {Object} question - Question object
   * @param {string} moduleName - Module name (fallback)
   * @param {number} index - Question index (fallback)
   * @returns {string} Stable identifier
   */
  function getStableId(question, moduleName, index) {
    if (question.stable_id) return question.stable_id;
    if (question.id) return String(question.id);
    // Fallback to deterministic value
    return `${moduleName || 'unknown'}::${index}`;
  }

  // ============================================================
  // EXPORT PUBLIC API
  // ============================================================

  window.StudyGuruProgress = {
    recordAnswered,
    answeredThisWeek,
    answeredToday,
    getAttempts,
    getAttemptsMap,
    getDailyHistory,
    getStableId,
    clearAll,
    // Constants for external reference
    PREFIX: PREFIX
  };

  console.log('[ProgressStore] Initialized. Weekly count:', answeredThisWeek());

})();
