/* ============================================================
   Fishbone MCQ Quiz - Multiple Choice Mode
   - Dropdown selection for lab names
   - Answer validation
   - Progress tracking
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

  // Render fishbone image with positioned dropdowns
  const imagePath = `/static/images/fishbone-${categoryKey.toLowerCase()}.png`;
  const correctLabNames = getCorrectLabNames(categoryKey);
  const positionLabels = correctLabNames.map((_, idx) => `Place ${idx + 1}`);
  
  // Build the fishbone container with image and positioned dropdowns
  let fishboneHTML = `<div style="position: relative; display: inline-block; width: 100%; padding: 40px 20px;">
    <img src="${imagePath}" alt="${categoryKey} fishbone diagram" style="width: 100%; max-width: 100%; height: auto;">
    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">`;
  
  // Position dropdowns based on place number and total count
  const totalPlaces = correctLabNames.length;
  correctLabNames.forEach((labName, idx) => {
    let topPercent, leftPercent;
    
    // Calculate positions based on total places - ON the fishbone branches
    if (totalPlaces <= 4) {
      // Standard 4-place positioning - ON branches
      const positions = [
        { top: 25, left: 25 },   // Place 1 - top left branch
        { top: 25, left: 75 },   // Place 2 - top right branch
        { top: 75, left: 75 },   // Place 3 - bottom right branch
        { top: 50, left: 50 }    // Place 4 - center
      ];
      const pos = positions[idx] || { top: 50, left: 50 };
      topPercent = pos.top;
      leftPercent = pos.left;
    } else if (totalPlaces === 5) {
      // 5-place positioning - ON branches
      const positions = [
        { top: 20, left: 20 },   // Place 1 - top left
        { top: 20, left: 80 },   // Place 2 - top right
        { top: 80, left: 80 },   // Place 3 - bottom right
        { top: 80, left: 50 },   // Place 4 - bottom center
        { top: 50, left: 50 }    // Place 5 - center
      ];
      const pos = positions[idx] || { top: 50, left: 50 };
      topPercent = pos.top;
      leftPercent = pos.left;
    } else if (totalPlaces === 6) {
      // 6-place positioning - ON branches
      const positions = [
        { top: 15, left: 20 },   // Place 1 - top left
        { top: 15, left: 80 },   // Place 2 - top right
        { top: 85, left: 80 },   // Place 3 - bottom right
        { top: 50, left: 85 },   // Place 4 - right center
        { top: 30, left: 50 },   // Place 5 - top center
        { top: 70, left: 50 }    // Place 6 - bottom center
      ];
      const pos = positions[idx] || { top: 50, left: 50 };
      topPercent = pos.top;
      leftPercent = pos.left;
    } else if (totalPlaces === 7) {
      // 7-place positioning (Electrolytes) - ON branches
      const positions = [
        { top: 20, left: 20 },   // Place 1 - top left
        { top: 40, left: 35 },   // Place 2 - middle left
        { top: 20, left: 80 },   // Place 3 - top right
        { top: 50, left: 85 },   // Place 4 - right center
        { top: 40, left: 65 },   // Place 5 - middle right
        { top: 60, left: 50 },   // Place 6 - bottom center
        { top: 80, left: 35 }    // Place 7 - bottom left
      ];
      const pos = positions[idx] || { top: 50, left: 50 };
      topPercent = pos.top;
      leftPercent = pos.left;
    } else {
      // 8-place positioning - ON branches
      const positions = [
        { top: 15, left: 20 },   // Place 1 - top left
        { top: 35, left: 20 },   // Place 2 - middle left
        { top: 80, left: 20 },   // Place 3 - bottom left
        { top: 50, left: 85 },   // Place 4 - right center
        { top: 15, left: 80 },   // Place 5 - top right
        { top: 35, left: 80 },   // Place 6 - middle right
        { top: 75, left: 80 },   // Place 7 - bottom right
        { top: 90, left: 50 }    // Place 8 - bottom center
      ];
      const pos = positions[idx] || { top: 50, left: 50 };
      topPercent = pos.top;
      leftPercent = pos.left;
    }
    
    fishboneHTML += `<div style="position: absolute; top: ${topPercent}%; left: ${leftPercent}%; transform: translate(-50%, -50%); pointer-events: all; width: 140px;">
      <label style="font-weight: 700; font-size: 12px; color: #1a1a1a; display: block; margin-bottom: 4px;">Place ${idx + 1}</label>
      <select id="branch-${idx}" class="fishbone-dropdown" data-branch="${idx}" style="width: 100%; padding: 8px 6px; font-size: 13px; border: 2px solid #e0e0e0; border-radius: 6px; cursor: pointer;">
        <option value="Select">Select</option>
      </select>
    </div>`;
  });
  
  fishboneHTML += `</div></div>`;
  $('fishboneDisplay').innerHTML = fishboneHTML;
  
  // Now populate the dropdowns
  const dropdowns = document.querySelectorAll('.fishbone-dropdown');
  dropdowns.forEach((dropdown, idx) => {
    category.labs.forEach(lab => {
      const option = document.createElement('option');
      option.value = lab.name;
      option.textContent = lab.name;
      dropdown.appendChild(option);
    });

    // Restore previous answer if exists
    if (quizAnswers[currentQuestionIndex]) {
      dropdown.value = quizAnswers[currentQuestionIndex][idx] || 'Select';
    }

    // Add change listener
    dropdown.addEventListener('change', () => {
      clearFeedback();
      hideResultsBreakdown();
      updateSubmitButton();
    });
  });

  enableSubmit();
}

// Check if all dropdowns are filled
function isAnswerComplete() {
  const dropdowns = document.querySelectorAll('.fishbone-dropdown');
  return Array.from(dropdowns).every(dd => dd.value !== 'Select');
}

// Update submit button state
function updateSubmitButton() {
  const submitBtn = $('submitBtn');
  submitBtn.disabled = !isAnswerComplete();
}

// Collect selected values
function getSelectedAnswers() {
  const dropdowns = document.querySelectorAll('.fishbone-dropdown');
  return Array.from(dropdowns).map(dd => dd.value);
}

// Handle submit
function handleSubmit() {
  if (!isAnswerComplete()) {
    showError('Please select an option for each position before submitting.');
    return;
  }

  const categoryKey = categoryOrder[currentQuestionIndex];
  const correctLabNames = getCorrectLabNames(categoryKey);
  const selectedValues = getSelectedAnswers();

  // Store answer
  quizAnswers[currentQuestionIndex] = selectedValues;

  // Check if correct
  const isCorrect = validateMCQAnswers(selectedValues, correctLabNames);
  quizCorrect[currentQuestionIndex] = isCorrect;

  // Show feedback
  showFeedback(isCorrect);

  // Show results breakdown
  const breakdown = getMCQResultsBreakdown(selectedValues, correctLabNames);
  showResultsBreakdown(breakdown, correctLabNames, selectedValues);

  // Disable submit, enable next
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
    feedbackText.innerHTML = '✓ Correct! You got all the lab names right!';
  } else {
    feedbackText.innerHTML = '✗ Incorrect. Review the correct answers below.';
  }
}

// Show results breakdown
function showResultsBreakdown(breakdown, correctLabNames, selectedValues) {
  const resultsBreakdown = $('resultsBreakdown');
  const breakdownContent = $('breakdownContent');

  resultsBreakdown.classList.add('show');

  // Dynamically generate position labels based on number of labs
  const positionLabels = correctLabNames.map((_, idx) => `Place ${idx + 1}`);
  let html = '';
  
  correctLabNames.forEach((correct, idx) => {
    const userSelected = selectedValues[idx];
    const isMatch = userSelected === correct;
    const position = positionLabels[idx] || `Position ${idx + 1}`;

    html += `
      <div class="results-item ${isMatch ? 'correct' : 'incorrect'}">
        <div><strong>${position}:</strong></div>
        <div>
          <div>Your answer: <strong>${escapeXML(userSelected)}</strong></div>
          <div>Correct answer: <strong>${escapeXML(correct)}</strong></div>
        </div>
      </div>
    `;
  });

  html += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.1); font-weight: 700;">You got ${breakdown.correct}/${breakdown.total} correct (${breakdown.percentage}%)</div>`;

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

// Enable/disable submit
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
    $('scoreSubtext').textContent = 'You mastered all lab categories!';
  } else if (correctCount >= 4) {
    $('scoreMessage').textContent = 'Excellent Work! 🌟';
    $('scoreSubtext').textContent = 'You got most of them right. Great job!';
  } else if (correctCount >= 3) {
    $('scoreMessage').textContent = 'Good Effort! 💪';
    $('scoreSubtext').textContent = 'Keep practicing to master all categories.';
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
  if (e.key === 'Enter') {
    if (!$('submitBtn').hidden && !$('submitBtn').disabled) {
      handleSubmit();
    } else if (!$('nextBtn').classList.contains('hidden')) {
      handleNext();
    }
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initQuiz);
