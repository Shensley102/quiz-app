/* ============================================================
   Fishbone Diagram Quiz Utilities
   Shared functions for lab data, SVG generation, and validation
   ============================================================ */

// Lab Values Database - All 5 Categories
const LAB_DATA = {
  CBC: {
    displayName: 'Complete Blood Count (CBC)',
    shortName: 'CBC',
    labs: [
      { name: 'WBC', units: '5,000-10,000/mm³', display: 'WBC\n5,000-10,000/mm³' },
      { name: 'Hgb (Male)', units: '14-17 g/dL', display: 'Hgb (Male)\n14-17 g/dL' },
      { name: 'Hct (Male)', units: '42-52%', display: 'Hct (Male)\n42-52%' },
      { name: 'Platelets', units: '150,000-400,000/mm³', display: 'Platelets\n150,000-400,000/mm³' }
    ]
  },
  BMP: {
    displayName: 'Basic Metabolic Panel (BMP)',
    shortName: 'BMP',
    labs: [
      { name: 'Na⁺', units: '135-145 mEq/L', display: 'Na⁺\n135-145 mEq/L' },
      { name: 'K⁺', units: '3.5-5.0 mEq/L', display: 'K⁺\n3.5-5.0 mEq/L' },
      { name: 'Cl⁻', units: '95-105 mEq/L', display: 'Cl⁻\n95-105 mEq/L' },
      { name: 'CO₂', units: '23-30 mEq/L', display: 'CO₂\n23-30 mEq/L' },
      { name: 'BUN', units: '7-20 mg/dL', display: 'BUN\n7-20 mg/dL' },
      { name: 'Creatinine', units: '0.7-1.4 mg/dL', display: 'Creatinine\n0.7-1.4 mg/dL' },
      { name: 'Glucose', units: '70-100 mg/dL', display: 'Glucose\n70-100 mg/dL' },
      { name: 'Ca²⁺', units: '8.5-10.5 mg/dL', display: 'Ca²⁺\n8.5-10.5 mg/dL' }
    ]
  },
  Liver: {
    displayName: 'Liver Panel',
    shortName: 'Liver',
    labs: [
      { name: 'AST', units: '10-40 U/L', display: 'AST\n10-40 U/L' },
      { name: 'ALT', units: '10-55 U/L', display: 'ALT\n10-55 U/L' },
      { name: 'ALP', units: '30-120 U/L', display: 'ALP\n30-120 U/L' },
      { name: 'T-Bilirubin', units: '0.3-1.0 mg/dL', display: 'T-Bilirubin\n0.3-1.0 mg/dL' }
    ]
  },
  Coagulation: {
    displayName: 'Coagulation Panel',
    shortName: 'Coagulation',
    labs: [
      { name: 'PT', units: '11-13 seconds', display: 'PT\n11-13 seconds' },
      { name: 'INR', units: '0.8-1.2', display: 'INR\n0.8-1.2' },
      { name: 'aPTT', units: '30-40 seconds', display: 'aPTT\n30-40 seconds' },
      { name: 'PTT', units: '60-70 seconds', display: 'PTT\n60-70 seconds' }
    ]
  },
  ABG: {
    displayName: 'Arterial Blood Gas (ABG)',
    shortName: 'ABG',
    labs: [
      { name: 'pH', units: '7.35-7.45', display: 'pH\n7.35-7.45' },
      { name: 'PaCO₂', units: '35-45 mmHg', display: 'PaCO₂\n35-45 mmHg' },
      { name: 'HCO₃⁻', units: '22-26 mEq/L', display: 'HCO₃⁻\n22-26 mEq/L' },
      { name: 'PaO₂', units: '80-100 mmHg', display: 'PaO₂\n80-100 mmHg' },
      { name: 'O₂ Sat', units: '≥95%', display: 'O₂ Sat\n≥95%' }
    ]
  }
};

// Get ordered category keys for 5 total questions (1 per category)
function getCategoryOrder() {
  return ['CBC', 'BMP', 'Liver', 'Coagulation', 'ABG'];
}

// Get correct lab names for a category
function getCorrectLabNames(categoryKey) {
  const category = LAB_DATA[categoryKey];
  if (!category) return [];
  return category.labs.map(lab => lab.name);
}

// Get correct lab ranges for a category (for fill-in-the-blank)
function getCorrectLabRanges(categoryKey) {
  const category = LAB_DATA[categoryKey];
  if (!category) return [];
  return category.labs.map(lab => lab.units);
}

// Generate SVG Fishbone Diagram - COMPACT HORIZONTAL LAYOUT
function generateFishboneSVG(categoryKey, highlightMode = false) {
  const category = LAB_DATA[categoryKey];
  if (!category) return '';

  const labs = category.labs;
  const labCount = labs.length;

  // SVG dimensions - more compact horizontal layout
  const width = 1000;
  const height = 300;
  const spineStartX = 150;
  const spineEndX = 950;
  const spineMidY = height / 2;

  // Branch configuration
  const branchLength = 100;
  const branchAngle = 35;

  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width: 100%; height: auto; margin: 20px 0;">`;

  // Spine line (main horizontal line)
  svg += `<line x1="${spineStartX}" y1="${spineMidY}" x2="${spineEndX}" y2="${spineMidY}" stroke="#2f61f3" stroke-width="5" stroke-linecap="round" />`;

  // Head/destination circle and label
  svg += `<circle cx="${spineEndX}" cy="${spineMidY}" r="15" fill="#2f61f3" />`;
  svg += `<text x="${spineEndX - 22}" y="${spineMidY + 6}" font-size="16" font-weight="700" fill="#fff" text-anchor="middle">${category.shortName}</text>`;

  // Distribute branches evenly along the spine
  const branchCount = labs.length;
  const spineLength = spineEndX - spineStartX;
  const spacingX = spineLength / (branchCount + 1);

  // Generate branches
  labs.forEach((lab, idx) => {
    // Position along spine
    const spineConnectX = spineStartX + (idx + 1) * spacingX;
    const spineConnectY = spineMidY;

    // Alternate branches above and below
    const isAbove = idx % 2 === 0;
    
    // Calculate branch endpoint
    const angleRad = (branchAngle * Math.PI) / 180;
    const branchEndX = spineConnectX - branchLength * Math.cos(angleRad);
    const branchVertical = branchLength * Math.sin(angleRad);
    const branchEndY = isAbove ? spineConnectY - branchVertical : spineConnectY + branchVertical;

    // Connection point on spine (small circle)
    svg += `<circle cx="${spineConnectX}" cy="${spineConnectY}" r="2.5" fill="#2f61f3" />`;

    // Branch line
    svg += `<line x1="${spineConnectX}" y1="${spineConnectY}" x2="${branchEndX}" y2="${branchEndY}" stroke="#45B7D1" stroke-width="3" stroke-linecap="round" />`;

    // Circle at branch end
    svg += `<circle cx="${branchEndX}" cy="${branchEndY}" r="9" fill="#45B7D1" />`;

    // Lab name text - positioned at branch endpoint
    const textOffset = isAbove ? -40 : 40;
    const textX = branchEndX - 20;
    const textY = branchEndY + textOffset;
    
    // Split display text into lines
    const lines = lab.display.split('\n');
    svg += `<text x="${textX}" y="${textY}" font-size="11" font-weight="700" text-anchor="middle" fill="#1a1a1a">`;
    lines.forEach((line, i) => {
      const lineY = textY + (i * 14);
      svg += `<tspan x="${textX}" y="${lineY}">${escapeXML(line)}</tspan>`;
    });
    svg += `</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// Escape XML special characters
function escapeXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Generate MCQ dropdown options
function generateDropdownHTML(branchIndex, categoryKey, selectedValue = 'Select') {
  const category = LAB_DATA[categoryKey];
  if (!category) return '';

  const labs = category.labs;
  let html = `<select id="branch-${branchIndex}" class="fishbone-dropdown" data-branch="${branchIndex}">
    <option value="Select">Select</option>`;

  labs.forEach(lab => {
    const selected = selectedValue === lab.name ? 'selected' : '';
    html += `<option value="${escapeXML(lab.name)}" ${selected}>${escapeXML(lab.name)}</option>`;
  });

  html += `</select>`;
  return html;
}

// Generate fill-in-the-blank input field
function generateInputHTML(branchIndex, labName) {
  return `<input type="text" id="branch-${branchIndex}" class="fishbone-input" data-branch="${branchIndex}" data-lab="${escapeXML(labName)}" placeholder="Type range/value" autocomplete="off" />`;
}

// Normalize answer for validation
function normalizeAnswer(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\d.%-]/g, '');
}

// Check MCQ answers
function validateMCQAnswers(selectedValues, correctLabNames) {
  if (!Array.isArray(selectedValues) || !Array.isArray(correctLabNames)) {
    return false;
  }

  const selected = selectedValues.filter(v => v !== 'Select' && v !== '').sort();
  const correct = correctLabNames.slice().sort();

  if (selected.length !== correct.length) {
    return false;
  }

  return selected.every((val, idx) => val === correct[idx]);
}

// Check fill-in-the-blank answers with flexible matching
function validateFillInTheBlankAnswers(userInputs, correctRanges) {
  if (!Array.isArray(userInputs) || !Array.isArray(correctRanges)) {
    return false;
  }

  if (userInputs.length !== correctRanges.length) {
    return false;
  }

  return userInputs.every((userInput, idx) => {
    const normalized = normalizeAnswer(userInput);
    const expected = normalizeAnswer(correctRanges[idx]);
    
    // Exact match
    if (normalized === expected) return true;
    
    // Partial match for ranges (e.g., "135145" matches "135-145")
    if (normalized.includes(expected.split('-')[0]) || expected.includes(normalized.split('-')[0])) {
      return true;
    }

    return false;
  });
}

// Get MCQ results breakdown
function getMCQResultsBreakdown(selectedValues, correctLabNames) {
  const correctCount = selectedValues.filter((val, idx) => {
    return val === 'Select' ? false : val === correctLabNames[idx];
  }).length;

  const total = correctLabNames.length;
  return {
    correct: correctCount,
    total: total,
    percentage: Math.round((correctCount / total) * 100)
  };
}

// Get fill-in results breakdown
function getFillInResultsBreakdown(userInputs, correctRanges) {
  const results = [];
  
  userInputs.forEach((input, idx) => {
    const normalized = normalizeAnswer(input);
    const expected = normalizeAnswer(correctRanges[idx]);
    const isCorrect = normalized === expected || normalized.includes(expected.split('-')[0]) || expected.includes(normalized.split('-')[0]);
    
    results.push({
      index: idx,
      correct: isCorrect,
      userAnswer: input,
      correctAnswer: correctRanges[idx]
    });
  });

  const correctCount = results.filter(r => r.correct).length;
  const total = results.length;

  return {
    correct: correctCount,
    total: total,
    percentage: Math.round((correctCount / total) * 100),
    details: results
  };
}

// Utility: Scroll to element smoothly
function scrollToElement(element) {
  if (!element) return;
  setTimeout(() => {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Utility: Get all elements with class
function getAllByClass(className) {
  return document.querySelectorAll(`.${className}`);
}

// Utility: Set element HTML safely
function setElementHTML(element, html) {
  if (!element) return;
  element.innerHTML = html;
}

// Utility: Add class to element
function addClass(element, className) {
  if (element && className) {
    element.classList.add(className);
  }
}

// Utility: Remove class from element
function removeClass(element, className) {
  if (element && className) {
    element.classList.remove(className);
  }
}

// Utility: Check if element has class
function hasClass(element, className) {
  return element && element.classList.contains(className);
}
