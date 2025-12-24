/**
 * QUIZ-SCRIPT.JS INTEGRATION TEMPLATE
 * 
 * This shows the EXACT structure of where to add PART 2 code
 * Copy the sections marked "ADD THIS" and paste into your quiz-script.js
 */

// ============================================
// SECTION 1: TOP OF FILE (after opening comment)
// ============================================

// Quiz Script

// ========== HESI PERFORMANCE STATS MODULE (PART 2) - ADD THIS ==========

const HESI_STATS_KEY = 'hesiPerformanceStats';

function loadHesiStats() {
  try {
    const raw = localStorage.getItem(HESI_STATS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading HESI stats:', e);
    return {};
  }
}

function saveHesiStats(stats) {
  try {
    localStorage.setItem(HESI_STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving HESI stats:', e);
  }
}

function updateHesiStats(categoryResults) {
  const stats = loadHesiStats();
  
  for (const [category, result] of Object.entries(categoryResults)) {
    if (!stats[category]) {
      stats[category] = {
        totalAnswered: 0,
        totalCorrect: 0,
        lastUpdated: null
      };
    }
    
    stats[category].totalAnswered += result.total;
    stats[category].totalCorrect += result.correct;
    stats[category].lastUpdated = new Date().toISOString();
  }
  
  saveHesiStats(stats);
  console.log('HESI stats updated:', stats);
  
  return stats;
}

function clearHesiStats() {
  try {
    localStorage.removeItem(HESI_STATS_KEY);
    console.log('HESI stats cleared');
  } catch (e) {
    console.error('Error clearing HESI stats:', e);
  }
}

// ========== END HESI PERFORMANCE STATS MODULE ==========

// [YOUR EXISTING QUIZ CODE CONTINUES HERE - DO NOT MODIFY]
// All your existing functions, variables, event listeners stay the same
// ...

// ============================================
// SECTION 2: IN finishQuiz() FUNCTION
// ============================================

// Around line 700-750, you'll find the finishQuiz() function with this code:

function finishQuiz() {
    // ... existing code ...
    
    const categoryResults = {};
    
    run.masterPool.forEach(q => {
        const rec = run.answered.get(q.id);
        if (rec && rec.firstTry) {
            firstTryTotal++;
            
            if (run.isComprehensive && q.category) {
                if (!categoryResults[q.category]) {
                    categoryResults[q.category] = { correct: 0, total: 0 };
                }
                categoryResults[q.category].total++;
                
                if (rec.correct) {
                    firstTryCorrect++;
                    categoryResults[q.category].correct++;
                } else {
                    missed.push(rec);
                }
            } else {
                if (rec.correct) firstTryCorrect++;
                else missed.push(rec);
            }
        }
    });
    
    // ADD THIS BLOCK RIGHT HERE (same indentation as run.masterPool.forEach):
    
    // PART 2: Update HESI performance stats (comprehensive only)
    if (run.isComprehensive && !run.isCategoryQuiz && Object.keys(categoryResults).length > 0) {
        updateHesiStats(categoryResults);
    }
    
    // ... rest of finishQuiz() continues as normal ...
}

/**
 * HOW TO APPLY THIS:
 * 
 * 1. Open your current quiz-script.js file
 * 
 * 2. After "// Quiz Script" comment at the top, paste this entire block:
 *    (The HESI_STATS_KEY and all 4 functions starting from line 5)
 * 
 * 3. Find your finishQuiz() function (search for "finishQuiz")
 * 
 * 4. Find the categoryResults forEach loop inside finishQuiz()
 * 
 * 5. RIGHT AFTER that forEach loop's closing "});", add:
 *    if (run.isComprehensive && !run.isCategoryQuiz && Object.keys(categoryResults).length > 0) {
 *        updateHesiStats(categoryResults);
 *    }
 * 
 * 6. Save the file
 * 
 * That's it! The rest of your quiz-script.js stays exactly the same.
 */
