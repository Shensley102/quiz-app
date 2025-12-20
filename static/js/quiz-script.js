/**
 * Quiz Script - Nurse Success Study Hub
 * Handles quiz initialization, question navigation, answer tracking, and results display
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
 * Initialize quiz with data
 * @param {Object} quizData - Quiz JSON data from API
 * @param {Object} config - Quiz configuration (categoryName, quizId, quizName)
 */
window.initializeQuiz = function(quizData, config) {
    console.log('[Quiz] Initializing quiz:', config.quizName);
    
    // Validate quiz data
    if (!quizData || !Array.isArray(quizData)) {
        console.error('[Quiz] Invalid quiz data structure');
        showError('Invalid quiz data format');
        return;
    }
    
    // Store quiz state
    quizState.data = quizData;
    quizState.config = config;
    quizState.startTime = Date.now();
    quizState.answers = {};
    quizState.currentQuestion = 0;
    
    // Update UI
    document.getElementById('total-count').textContent = quizData.length;
    document.getElementById('loading-state').style.display = 'none';
    document.getElementById('quiz-content').style.display = 'block';
    
    // Display first question
    displayQuestion(0);
    
    console.log(`[Quiz] Loaded ${quizData.length} questions`);
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
    
    // Check question type
    if (question.type === 'fill-in-the-blank' || question.type === 'fill_in_the_blank') {
        questionHTML += buildFillInTheBlankQuestion(question);
    } else {
        // Default to multiple choice
        questionHTML += buildMultipleChoiceQuestion(question, questionIndex);
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
 * Build multiple choice question HTML
 */
function buildMultipleChoiceQuestion(question, questionIndex) {
    const options = question.options || [];
    const answer = quizState.answers[questionIndex];
    
    let html = '<div class="question-options">';
    
    options.forEach((option, optionIndex) => {
        const optionId = `option-${questionIndex}-${optionIndex}`;
        const isSelected = answer === optionIndex;
        const isCorrect = option.correct === true;
        
        // Determine option class
        let optionClass = 'option-item';
        if (isSelected) optionClass += ' selected';
        if (answer !== undefined && answer !== null && isCorrect && isSelected) {
            optionClass += ' correct';
        }
        if (answer !== undefined && answer !== null && !isCorrect && isSelected) {
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
                    <span class="option-text">${escapeHtml(option.text || option)}</span>
                </label>
            </div>
        `;
    });
    
    html += '</div>';
    
    // Add rationale if answer was selected
    if (answer !== undefined && answer !== null && options[answer]) {
        const selectedOption = options[answer];
        const rationale = selectedOption.rationale || '';
        
        html += `
            <div class="rationale-section">
                <h3 class="rationale-title">Explanation</h3>
                <div class="rationale-content">${escapeHtml(rationale)}</div>
            </div>
        `;
    }
    
    return html;
}

/**
 * Build fill-in-the-blank question HTML
 */
function buildFillInTheBlankQuestion(question, questionIndex) {
    const answer = quizState.answers[questionIndex] || '';
    const correctAnswer = question.answer || question.correct_answer || '';
    const isAnswered = answer !== '';
    const isCorrect = answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim();
    
    let html = `
        <div class="fill-blank-section">
            <label class="blank-label">Your Answer:</label>
            <input type="text" 
                   id="blank-answer" 
                   class="blank-input"
                   value="${escapeHtml(answer)}"
                   placeholder="Type your answer here..."
                   autocomplete="off">
    `;
    
    if (isAnswered) {
        html += `
            <div class="answer-status ${isCorrect ? 'correct' : 'incorrect'}">
                <span class="status-icon">${isCorrect ? '✓' : '✗'}</span>
                <span class="status-text">${isCorrect ? 'Correct!' : 'Incorrect'}</span>
            </div>
            
            <div class="rationale-section">
                <h3 class="rationale-title">Correct Answer</h3>
                <div class="correct-answer">${escapeHtml(correctAnswer)}</div>
                ${question.rationale ? `
                    <h3 class="rationale-title" style="margin-top: 1rem;">Explanation</h3>
                    <div class="rationale-content">${escapeHtml(question.rationale)}</div>
                ` : ''}
            </div>
        `;
    }
    
    html += '</div>';
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
    
    if (question.type === 'fill-in-the-blank' || question.type === 'fill_in_the_blank') {
        const input = document.getElementById('blank-answer');
        if (input) {
            quizState.answers[questionIndex] = input.value;
        }
    } else {
        const selected = document.querySelector(`input[name="question-${questionIndex}"]:checked`);
        if (selected) {
            quizState.answers[questionIndex] = parseInt(selected.value);
        }
    }
}

/**
 * Restore previous answer for question
 */
function restoreAnswer(questionIndex) {
    const answer = quizState.answers[questionIndex];
    
    if (answer === undefined) return;
    
    const question = quizState.data[questionIndex];
    
    if (question.type === 'fill-in-the-blank' || question.type === 'fill_in_the_blank') {
        // Answer already restored in build function
        return;
    }
    
    // For multiple choice, click the radio button
    const radio = document.querySelector(`input[name="question-${questionIndex}"][value="${answer}"]`);
    if (radio) {
        radio.checked = true;
    }
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
 * Handle text input
 */
document.addEventListener('input', function(event) {
    if (event.target.id === 'blank-answer') {
        saveAnswer();
        // Refresh display to show correctness
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
    
    quizState.data.forEach((question, index) => {
        const answer = quizState.answers[index];
        
        if (answer === undefined || answer === null || answer === '') {
            unanswered++;
        } else {
            if (question.type === 'fill-in-the-blank' || question.type === 'fill_in_the_blank') {
                const correctAnswer = question.answer || question.correct_answer || '';
                if (answer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()) {
                    correct++;
                }
            } else {
                const options = question.options || [];
                if (options[answer] && options[answer].correct === true) {
                    correct++;
                }
            }
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
        quizName: quizState.config.quizName
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
    return String(text).replace(/[&<>"']/g, m => map[m]);
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

console.log('[Quiz Script] Loaded and ready');
