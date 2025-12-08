/* ============================================================
   Fishbone Fill-in-the-Blank Quiz - Text Input Mode
   - Text input for lab value ranges
   - Flexible answer validation
   - Detailed feedback breakdown
   ============================================================ */

const $ = (id) => document.getElementById(id);

// State
let currentQuestionIndex = 0;
const categoryOrder = getCategoryOrder();
const totalQuestions = 5;
let quizAnswers = [];
let quizCorrect = [];

// Initialize quiz
function initQuiz() {
  quizAnswers = [];
  quizCorrect = [];
  currentQuestionIndex = 0;
  displayQuestion();
}

// Display current question
function displayQuestion() {
  const categoryKey = categoryOrder[currentQuestionIndex];
  const category = LAB_DATA[categoryKey];

  // Update progress
  $('currentQuestion').textContent = currentQuestionIndex + 1;
  const progressPercent = ((currentQuestionIndex + 1) / totalQuestions) * 100;
  $('progressFill').style.width = `${progressPercent}%`;

  // Clear previous state
  clearFeedback();
  hideResultsBreakdown();

  // Render fishbone
  const svgHTML = generateFishboneSVG(categoryKey);
  $('fishboneDisplay').innerHTML = svgHTML;

  // Generate input fields with lab names labeled
  const inputsContainer = $('inputsContainer');
  inputsContainer.innerHTML = '';

  const labs = category.labs;
  
  labs.forEach((lab, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'input-group';

    const label = document.createElement('label');
    label.className = 'input-label';
    label.textContent = `Place ${idx + 1} - ${lab.name}:`;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `branch-${idx}`;
    input.className = 'fishbone-input';
    input.dataset.branch = idx;
    input.dataset.lab = lab.name;
    input.placeholder = 'Enter value or range';
    input.autocomplete = 'off';

    // Restore previous answer if exists
    if (quizAnswers[currentQuestionIndex]) {
      input.value = quizAnswers[currentQuestionIndex][idx] || '';
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    inputsContainer.appendChild(wrapper);

    // Add input listener
    input.addEventListener('input', () => {
      clearFeedback();
      hideResultsBreakdown();
      updateSubmitButton();
    });

    // Tab and Enter support
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isAnswerComplete()) {
          handleSubmit();
        }
      }
    });
  });

  // Focus first input
  const firstInput = inputsContainer.querySelector('.fishbone-input');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }

  enableSubmit();
}

// Check if all inputs are filled
function isAnswerComplete() {
  const inputs = document.querySelectorAll('.fishbone-input');
  return Array.from(inputs).every(input => input.value.trim().length > 0);
}

// Update submit button state
function updateSubmitButton() {
  const submitBtn = $('submitBtn');
  submitBtn.disabled = !isAnswerComplete();
}

// Collect input values
function getUserInputs() {
  const inputs = document.querySelectorAll('.fishbone-input');
  return Array.from(inputs).map(input => input.value.trim());
}

// Handle submit
function handleSubmit() {
  if (!isAnswerComplete()) {
    showError('Please fill in all fields before submitting.');
    return;
  }

  const categoryKey = categoryOrder[currentQuestionIndex];
  const correctLabRanges = getCorrectLabRanges(categoryKey);
  const userInputs = getUserInputs();

  // Store answer
  quizAnswers[currentQuestionIndex] = userInputs;

  // Check if correct
  const isCorrect = validateFillInTheBlankAnswers(userInputs, correctLabRanges);
  quizCorrect[currentQuestionIndex] = isCorrect;

  // Show feedback
  showFeedback(isCorrect);

  // Show results breakdown
  const breakdown = getFillInResultsBreakdown(userInputs, correctLabRanges);
  showResultsBreakdown(breakdown);

  // Highlight correct/incorrect inputs
  highlightInputs(breakdown);

  // Disable submit, enable next
  disableInputs();
  disableSubmit();
  showNextButton();

  // Scroll to feedback
  setTimeout(() => {
    $('feedbackSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Show feedback
function showFeedback(isCorrect) {
  const feedbackSection = $('feedbackSection');
  const feedbackText = $('feedbackText');

  feedbackSection.classList.add('show');
  feedbackSection.classList.remove('incorrect', 'correct');
  feedbackSection.classList.add(isCorrect ? 'correct' : 'incorrect');

  if (isCorrect) {
    feedbackText.innerHTML = '✓ Correct! You got all the values right!';
  } else {
    feedbackText.innerHTML = '✗ Incorrect. Review the correct answers below.';
  }
}

// Highlight inputs as correct/incorrect
function highlightInputs(breakdown) {
  const inputs = document.querySelectorAll('.fishbone-input');
  
  inputs.forEach((input, idx) => {
    input.classList.remove('correct', 'incorrect');
    
    if (breakdown.details[idx].correct) {
      input.classList.add('correct');
    } else {
      input.classList.add('incorrect');
    }
  });
}

// Show results breakdown
function showResultsBreakdown(breakdown) {
  const resultsBreakdown = $('resultsBreakdown');
  const breakdownContent = $('breakdownContent');

  resultsBreakdown.classList.add('show');

  let html = '';
  breakdown.details.forEach((detail, idx) => {
    const statusClass = detail.correct ? 'correct' : 'incorrect';
    const statusIcon = detail.correct ? '✓' : '✗';

    html += `
      <div class="results-item ${statusClass}">
        <div>
          <div class="results-label">${statusIcon} Place ${idx + 1}</div>
        </div>
        <div class="results-content">
          <div><strong>You entered:</strong> "${escapeXML(detail.userAnswer)}"</div>
          <div><strong>Correct answer:</strong> "${escapeXML(detail.correctAnswer)}"</div>
        </div>
      </div>
    `;
  });

  html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.1); font-weight: 700;">Score: ${breakdown.correct}/${breakdown.total} correct (${breakdown.percentage}%)</div>`;

  breakdownContent.innerHTML = html;
}

// Clear feedback
function clearFeedback() {
  const feedbackSection = $('feedbackSection');
  feedbackSection.classList.remove('show');
}

// Hide results breakdown
function hideResultsBreakdown() {
  $('resultsBreakdown').classList.remove('show');
}

// Show error
function showError(message) {
  const errorMessage = $('errorMessage');
  errorMessage.textContent = message;
  errorMessage.classList.add('show');
  setTimeout(() => {
    errorMessage.classList.remove('show');
  }, 4000);
}

// Disable/enable inputs
function disableInputs() {
  const inputs = document.querySelectorAll('.fishbone-input');
  inputs.forEach(input => input.disabled = true);
}

function enableInputs() {
  const inputs = document.querySelectorAll('.fishbone-input');
  inputs.forEach(input => input.disabled = false);
}

// Disable/enable submit
function disableSubmit() {
  $('submitBtn').disabled = true;
  $('submitBtn').style.opacity = '0.5';
}

function enableSubmit() {
  updateSubmitButton();
}

// Show/hide next button
function showNextButton() {
  const nextBtn = $('nextBtn');
  nextBtn.classList.remove('hidden');
  $('submitBtn').classList.add('hidden');
}

function hideNextButton() {
  const nextBtn = $('nextBtn');
  nextBtn.classList.add('hidden');
  $('submitBtn').classList.remove('hidden');
}

// Go to next question
function handleNext() {
  if (currentQuestionIndex < totalQuestions - 1) {
    currentQuestionIndex++;
    hideNextButton();
    enableInputs();
    displayQuestion();
  } else {
    showFinalResults();
  }
}

// Show final results
function showFinalResults() {
  const quizContent = $('quizContent');
  const finalResults = $('finalResults');

  quizContent.style.display = 'none';
  finalResults.classList.add('show');

  // Calculate score
  const correctCount = quizCorrect.filter(c => c === true).length;
  const score = `${correctCount}/${totalQuestions}`;

  // Display score
  $('scoreDisplay').textContent = score;

  // Determine message
  if (correctCount === totalQuestions) {
    $('scoreMessage').textContent = 'Perfect Score! 🎉';
    $('scoreSubtext').textContent = 'You are a lab values master!';
  } else if (correctCount >= 4) {
    $('scoreMessage').textContent = 'Excellent Work! 🌟';
    $('scoreSubtext').textContent = 'You got most values correct. Great job!';
  } else if (correctCount >= 3) {
    $('scoreMessage').textContent = 'Good Effort! 💪';
    $('scoreSubtext').textContent = 'You are getting closer. Keep practicing!';
  } else {
    $('scoreMessage').textContent = 'Keep Practicing! 📚';
    $('scoreSubtext').textContent = 'Review the lab values and try again.';
  }

  // Scroll to results
  setTimeout(() => {
    finalResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Restart quiz
function handleRestart() {
  currentQuestionIndex = 0;
  quizAnswers = [];
  quizCorrect = [];
  
  const quizContent = $('quizContent');
  const finalResults = $('finalResults');
  
  quizContent.style.display = 'block';
  finalResults.classList.remove('show');
  
  displayQuestion();
  quizContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Go to Lab Values page
function handleHome() {
  window.location.href = '/category/Lab_Values';
}

// Event listeners
$('submitBtn').addEventListener('click', handleSubmit);
$('nextBtn').addEventListener('click', handleNext);
$('restartBtn').addEventListener('click', handleRestart);
$('homeBtn').addEventListener('click', handleHome);

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    if (!$('submitBtn').hidden && !$('submitBtn').disabled) {
      handleSubmit();
    } else if (!$('nextBtn').classList.contains('hidden')) {
      handleNext();
    }
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initQuiz);
