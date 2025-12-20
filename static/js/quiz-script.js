/**
 * Quiz Script - Nurse Success Study Hub
 * Handles quiz initialization, question navigation, answer tracking, and results display
 * 
 * Supports multiple JSON formats:
 * 1. Wrapped: {module, questions: [...]}
 * 2. Array: [{stem, options, correct, type}]
 */

'use strict';

// Global quiz state
let quizState = {
    data: null,
    currentQuestion: 0,
    answers: {},
    startTime: null,
    endTime: null,
    config: {}
};

/**
 * Normalize quiz data from various formats
 * Converts all formats to standardized internal structure
 * @param {*} rawData - Raw data from API
 * @returns {Array} Normalized questions array
 */
function normalizeQuizData(rawData) {
    if (!rawData) {
        throw new Error('No quiz data provided');
    }
    
    let questionsArray = [];
    
    // Check if it's an array (direct format - CCRN style)
    if (Array.isArray(rawData)) {
        questionsArray = rawData;
    }
    // Check if it's an object with questions property (wrapped format - Patient_Care_Management style)
    else if (typeof rawData === 'object' && Array.isArray(rawData.questions)) {
        questionsArray = rawData.questions;
    }
    else {
        console.error('[Quiz] Unrecognized data structure:', rawData);
        throw new Error('Unrecognized quiz data structure');
    }
    
    // Normalize each question
    return questionsArray.map((q, index) => {
        try {
            // Use stem (actual field name) or question (fallback)
            const questionText = q.stem || q.question;
            if (!questionText) {
                throw new Error(`Question ${index} missing stem/question field`);
            }
            
            // Get options array (may be strings or objects)
            const rawOptions = q.options || [];
            if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
                throw new Error(`Question ${index} missing options array`);
            }
            
            // Get correct answer(s) as array of letters (A, B, C, etc.)
            const correctLetters = Array.isArray(q.correct) ? q.correct : [q.correct];
            if (!correctLetters || correctLetters.length === 0) {
                throw new Error(`Question ${index} missing correct answer(s)`);
            }
            
            // Convert correct letters to indices (A=0, B=1, C=2, etc.)
            const correctIndices = correctLetters.map(letter => {
                const index = letter.toUpperCase().charCodeAt(0) - 65;
                if (index < 0 || index >= rawOptions.length) {
                    console.warn(`[Quiz] Invalid correct answer letter "${letter}" for question "${questionText}"`);
                }
                return index;
            });
            
            // Convert options to standardized format
            const normalizedOptions = rawOptions.map((opt, optIndex) => ({
                text: typeof opt === 'string' ? opt : (opt.text || String(opt)),
                isCorrect: correctIndices.includes(optIndex)
            }));
            
            // Determine question type
            const questionType = q.type === 'multi_select' ? 'multi_select' : 'single_select';
            
            return {
                id: q.id || `q_${index}`,
                question: questionText,
                stem: questionText, // Keep both for compatibility
                options: normalizedOptions,
                correct: correctIndices,
                correctLetters: correctLetters,
                rationale: q.rationale || '',
                type: questionType,
                // Preserve original for debugging
                _original: q
            };
        } catch (error) {
            console.error(`[Quiz] Error normalizing question ${index}:`, error.message);
            throw error;
        }
    });
}

/**
 * Initialize quiz with data
 * @param {Object} quizData - Quiz JSON data from API
 * @param {Object} config - Quiz configuration (categoryName, quizId, quizName)
 */
window.initializeQuiz = function(quizData, config) {
    console.log('[Quiz] Initializing quiz:', config.quizName);
    console.log('[Quiz] Raw data received:', quizData);
    
    try {
        // Normalize quiz data to standard format
        const normalizedData = normalizeQuizData(quizData);
        
        if (!normalizedData || normalizedData.length === 0) {
            throw new Error('No questions found after normalization');
        }
        
        // Store quiz state
        quizState.data = normalizedData;
        quizState.config = config;
        quizState.startTime = Date.now();
        quizState.answers = {};
        quizState.currentQuestion = 0;
        
        // Update UI
        document.getElementById('total-count').textContent = normalizedData.length;
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('quiz-content').style.display = 'block';
        
        // Display first question
        displayQuestion(0);
        
        console.log(`[Quiz] Successfully loaded and normalized ${normalizedData.length} questions`);
    } catch (error) {
        console.error('[Quiz] Initialization error:', error);
        showError(`Failed to initialize quiz: ${error.message}`);
    }
};

/**
 * Display a question
 * @param {number} questionIndex - Index of question to display
 */
function displayQuestion(questionIndex) {
    if (questionIndex < 0 || questionIndex >= quizState.data.length) {
        console.error('[Quiz] Invalid question index:', questionIndex);
        return;
    }
    
    const question = quizState.data[questionIndex];
    quizState.currentQuestion = questionIndex;
    
    // Update progress
    document.getElementById('progress-count').textContent = questionIndex + 1;
    const progress = ((questionIndex + 1) / quizState.data.length) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    
    // Build question HTML
    let questionHTML = `
        <div class="question-header">
            <h2 class="question-text">${escapeHtml(question.question)}</h2>
            <div class="question-number">Question ${questionIndex + 1} of ${quizState.data.length}</div>
        </div>
    `;
    
    // Build question based on type
    if (question.type === 'multi_select') {
        questionHTML += buildMultiSelectQuestion(question, questionIndex);
    } else {
        // Default to single select
        questionHTML += buildSingleSelectQuestion(question, questionIndex);
    }
    
    // Add navigation buttons
    questionHTML += buildNavigationButtons(questionIndex);
    
    // Render question
    document.getElementById('quiz-content').innerHTML = questionHTML;
    
    // Restore previous answer if exists
    restoreAnswer(questionIndex);
    
    // Scroll to top
    window.scrollTo(0, 0);
}

/**
 * Build single-select question HTML (radio buttons)
 */
function buildSingleSelectQuestion(question, questionIndex) {
    const selectedAnswers = quizState.answers[questionIndex] || [];
    const isAnswered = selectedAnswers.length > 0;
    
    let html = '<div class="question-options">';
    
    question.options.forEach((option, optionIndex) => {
        const optionId = `option-${questionIndex}-${optionIndex}`;
        const isSelected = selectedAnswers.includes(optionIndex);
        const isCorrect = option.isCorrect;
        
        // Determine option class
        let optionClass = 'option-item';
        if (isSelected) optionClass += ' selected';
        if (isAnswered && isCorrect && isSelected) {
            optionClass += ' correct';
        } else if (isAnswered && !isCorrect && isSelected) {
            optionClass += ' incorrect';
        }
        
        html += `
            <div class="${optionClass}">
                <input type="radio" 
                       id="${optionId}" 
                       name="question-${questionIndex}" 
                       value="${optionIndex}"
                       ${isSelected ? 'checked' : ''}
                       class="option-input">
                <label for="${optionId}" class="option-label">
                    <span class="option-text">${escapeHtml(option.text)}</span>
                </label>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Add rationale if answered
    if (isAnswered) {
        html += `
            <div class="rationale-section">
                <h3 class="rationale-title">Explanation</h3>
                <div class="rationale-content">${escapeHtml(question.rationale)}</div>
            </div>
        `;
    }
    
    return html;
}

/**
 * Build multi-select question HTML (checkboxes)
 */
function buildMultiSelectQuestion(question, questionIndex) {
    const selectedAnswers = quizState.answers[questionIndex] || [];
    const isAnswered = selectedAnswers.length > 0;
    
    let html = '<div class="question-options multi-select-options">';
    html += '<p class="select-all-note">(Select all that apply)</p>';
    
    question.options.forEach((option, optionIndex) => {
        const optionId = `option-${questionIndex}-${optionIndex}`;
        const isSelected = selectedAnswers.includes(optionIndex);
        const isCorrect = option.isCorrect;
        
        // Determine option class
        let optionClass = 'option-item';
        if (isSelected) optionClass += ' selected';
        if (isAnswered && isCorrect && isSelected) {
            optionClass += ' correct';
        } else if (isAnswered && !isCorrect && isSelected) {
            optionClass += ' incorrect';
        }
        
        html += `
            <div class="${optionClass}">
                <input type="checkbox" 
                       id="${optionId}" 
                       name="question-${questionIndex}" 
                       value="${optionIndex}"
                       ${isSelected ? 'checked' : ''}
                       class="option-input">
                <label for="${optionId}" class="option-label">
                    <span class="option-text">${escapeHtml(option.text)}</span>
                </label>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Add rationale if answered
    if (isAnswered) {
        const correctAnswers = question.options
            .map((opt, idx) => opt.isCorrect ? question.correctLetters[question.correct.indexOf(idx)] || String.fromCharCode(65 + idx) : null)
            .filter(Boolean)
            .join(', ');
        
        html += `
            <div class="rationale-section">
                <h3 class="rationale-title">Correct Answers: ${correctAnswers}</h3>
                <h3 class="rationale-title">Explanation</h3>
                <div class="rationale-content">${escapeHtml(question.rationale)}</div>
            </div>
        `;
    }
    
    return html;
}

/**
 * Build navigation buttons
 */
function buildNavigationButtons(questionIndex) {
    const isFirst = questionIndex === 0;
    const isLast = questionIndex === quizState.data.length - 1;
    
    let html = '<div class="navigation-buttons">';
    
    if (!isFirst) {
        html += `<button class="btn btn-secondary" onclick="previousQuestion()">← Previous</button>`;
    }
    
    if (!isLast) {
        html += `<button class="btn btn-primary" onclick="nextQuestion()">Next →</button>`;
    } else {
        html += `<button class="btn btn-success" onclick="finishQuiz()">Finish Quiz</button>`;
    }
    
    html += '</div>';
    return html;
}

/**
 * Save answer for current question
 */
function saveAnswer() {
    const questionIndex = quizState.currentQuestion;
    const question = quizState.data[questionIndex];
    
    if (question.type === 'multi_select') {
        // Get all checked checkboxes
        const selected = Array.from(document.querySelectorAll(`input[name="question-${questionIndex}"]:checked`))
            .map(cb => parseInt(cb.value));
        quizState.answers[questionIndex] = selected;
    } else {
        // Get checked radio button
        const selected = document.querySelector(`input[name="question-${questionIndex}"]:checked`);
        if (selected) {
            quizState.answers[questionIndex] = [parseInt(selected.value)];
        } else {
            quizState.answers[questionIndex] = [];
        }
    }
}

/**
 * Restore previous answer for question
 */
function restoreAnswer(questionIndex) {
    const answers = quizState.answers[questionIndex] || [];
    
    if (answers.length === 0) return;
    
    answers.forEach(answerIndex => {
        const question = quizState.data[questionIndex];
        
        if (question.type === 'multi_select') {
            const checkbox = document.querySelector(`input[name="question-${questionIndex}"][value="${answerIndex}"]`);
            if (checkbox) checkbox.checked = true;
        } else {
            const radio = document.querySelector(`input[name="question-${questionIndex}"][value="${answerIndex}"]`);
            if (radio) radio.checked = true;
        }
    });
}

/**
 * Handle option selection
 */
document.addEventListener('change', function(event) {
    if (event.target.classList.contains('option-input')) {
        saveAnswer();
        // Refresh display to show rationale
        displayQuestion(quizState.currentQuestion);
    }
}, true);

/**
 * Navigate to previous question
 */
window.previousQuestion = function() {
    if (quizState.currentQuestion > 0) {
        saveAnswer();
        displayQuestion(quizState.currentQuestion - 1);
    }
};

/**
 * Navigate to next question
 */
window.nextQuestion = function() {
    if (quizState.currentQuestion < quizState.data.length - 1) {
        saveAnswer();
        displayQuestion(quizState.currentQuestion + 1);
    }
};

/**
 * Finish quiz and show results
 */
window.finishQuiz = function() {
    saveAnswer();
    
    quizState.endTime = Date.now();
    const duration = Math.round((quizState.endTime - quizState.startTime) / 1000);
    
    // Calculate score
    let correct = 0;
    let unanswered = 0;
    let details = [];
    
    quizState.data.forEach((question, index) => {
        const answers = quizState.answers[index] || [];
        
        if (answers.length === 0) {
            unanswered++;
            details.push({
                question: question.question,
                userAnswer: 'Unanswered',
                correct: false,
                correctAnswer: question.correctLetters.join(', ')
            });
        } else {
            const correctIndices = question.correct;
            // For single select: check exact match
            // For multi select: check if all selected are correct AND all correct are selected
            const isCorrect = 
                question.type === 'multi_select' 
                    ? answers.length === correctIndices.length && 
                      answers.every(a => correctIndices.includes(a))
                    : answers.length === 1 && correctIndices.includes(answers[0]);
            
            if (isCorrect) {
                correct++;
            }
            
            const userAnswerLetters = answers.map(idx => String.fromCharCode(65 + idx)).join(', ');
            details.push({
                question: question.question,
                userAnswer: userAnswerLetters,
                correct: isCorrect,
                correctAnswer: question.correctLetters.join(', ')
            });
        }
    });
    
    const percentage = Math.round((correct / quizState.data.length) * 100);
    
    // Display results
    displayResults({
        correct: correct,
        total: quizState.data.length,
        unanswered: unanswered,
        percentage: percentage,
        duration: duration,
        categoryName: quizState.config.categoryName,
        quizName: quizState.config.quizName,
        details: details
    });
};

/**
 * Display results
 */
function displayResults(results) {
    let resultsHTML = `
        <div class="results-card">
            <div class="results-header">
                <h2>Quiz Complete!</h2>
                <p class="results-quiz-name">${escapeHtml(results.quizName)}</p>
            </div>
            
            <div class="score-display">
                <div class="score-circle">
                    <div class="score-percentage">${results.percentage}%</div>
                </div>
            </div>
            
            <div class="results-stats">
                <div class="stat-item">
                    <span class="stat-label">Correct</span>
                    <span class="stat-value correct">${results.correct}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total</span>
                    <span class="stat-value">${results.total}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Time</span>
                    <span class="stat-value">${formatDuration(results.duration)}</span>
                </div>
            </div>
            
            <div class="results-message">
                ${getResultMessage(results.percentage)}
            </div>
            
            <div class="results-actions">
                <a href="/category/${results.categoryName}" class="btn btn-primary">
                    Back to Category
                </a>
                <a href="/" class="btn btn-secondary">
                    Home
                </a>
            </div>
        </div>
    `;
    
    document.getElementById('quiz-content').style.display = 'none';
    document.getElementById('results-state').style.display = 'block';
    document.querySelector('.results-content').innerHTML = resultsHTML;
}

/**
 * Get result message based on score
 */
function getResultMessage(percentage) {
    if (percentage === 100) {
        return '<p class="message-excellent">🎉 Perfect Score! Outstanding work!</p>';
    } else if (percentage >= 90) {
        return '<p class="message-great">⭐ Excellent! You mastered this material!</p>';
    } else if (percentage >= 80) {
        return '<p class="message-good">✓ Good job! Keep reviewing to improve further.</p>';
    } else if (percentage >= 70) {
        return '<p class="message-fair">→ Fair. Review the material and try again.</p>';
    } else {
        return '<p class="message-needs-improvement">📚 Keep studying - you\'ll improve with practice!</p>';
    }
}

/**
 * Format duration in seconds to readable format
 */
function formatDuration(seconds) {
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes + 'm ' + secs + 's';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

/**
 * Show error
 */
function showError(message) {
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'none';
    document.getElementById('error-state').style.display = 'flex';
    document.getElementById('error-message').textContent = message;
    console.error('[Quiz] Error:', message);
}

console.log('[Quiz Script] v2.0 - Loaded and ready');
