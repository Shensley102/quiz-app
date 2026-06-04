/* ============================================================
   AI Paper Prompt Builder
   - Builds an AI-readable academic paper prompt
   - Uses localStorage only; no backend required
   ============================================================ */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg:v1:paperPromptBuilderDraft';
  const PAPER_TYPES_URL = '/static/data/academic-paper-types.json';

  const form = document.getElementById('paperPromptForm');
  const output = document.getElementById('generatedPrompt');
  const missingBox = document.getElementById('missingInfoBox');
  const sourcePairsContainer = document.getElementById('sourcePairs');
  const paperTypeSelect = document.getElementById('paperTypeSelect');
  const paperTypePreview = document.getElementById('paperTypeCriteriaPreview');

  let paperTypeProfiles = {};
  let pendingPaperTypeValue = '';

  if (!form || !output) return;

  function $(id) {
    return document.getElementById(id);
  }

  function value(id) {
    const el = $(id);
    return el ? String(el.value || '').trim() : '';
  }

  function checkedValues(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
  }

  function selectedPaperTypeValue() {
    return paperTypeSelect ? String(paperTypeSelect.value || '').trim() : checkedValues('paperType')[0] || '';
  }

  function selectedPaperTypeProfile() {
    const key = selectedPaperTypeValue();
    return key ? paperTypeProfiles[key] || null : null;
  }

  function selectedPaperTypeLabel() {
    const profile = selectedPaperTypeProfile();
    return profile?.label || selectedPaperTypeValue() || 'Not specified';
  }

  function yesNo(condition) {
    return condition ? '[x]' : '[ ]';
  }

  function normalizeList(items) {
    if (Array.isArray(items)) return items.map(item => String(item || '').trim()).filter(Boolean);
    if (typeof items === 'string' && items.trim()) return [items.trim()];
    return [];
  }

  function textOrDefault(valueToCheck) {
    if (Array.isArray(valueToCheck)) return normalizeList(valueToCheck).join('; ') || 'Not specified.';
    const text = String(valueToCheck || '').trim();
    return text || 'Not specified.';
  }

  function listOrNone(items) {
    const list = normalizeList(items);
    return list.length ? list.map(item => `- ${item}`).join('\n') : '- Not specified.';
  }

  function compactListText(items) {
    const list = normalizeList(items);
    return list.length ? list.join('; ') : 'Not specified.';
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function fieldLine(label, val) {
    return `${label}: ${val || 'Not specified'}`;
  }


  function profileField(profile, fieldName) {
    return profile && Object.prototype.hasOwnProperty.call(profile, fieldName) ? profile[fieldName] : undefined;
  }

  function planningLength(profile) {
    return textOrDefault(profileField(profile, 'planning_length') || profileField(profile, 'typical_length'));
  }

  function fallbackPromptInstruction(profile, label) {
    const purpose = textOrDefault(profileField(profile, 'purpose'));
    return `Help plan and shape this ${label} so it fulfills its academic purpose${purpose !== 'Not specified.' ? `: ${purpose}` : '.'}`;
  }

  function paperTypeCriteriaText(profile) {
    const label = selectedPaperTypeLabel();
    return `<paper_type_criteria>
This is a ${label}.

Purpose:
${textOrDefault(profileField(profile, 'purpose'))}

Usual academic level:
${textOrDefault(profileField(profile, 'usual_level'))}

Planning length:
${planningLength(profile)}

Typical citation styles:
${listOrNone(profileField(profile, 'typical_citation_styles'))}

Expected sections:
${listOrNone(profileField(profile, 'required_sections'))}

Evidence expectations:
${listOrNone(profileField(profile, 'evidence_expectations'))}

Common pitfalls to avoid:
${listOrNone(profileField(profile, 'common_pitfalls'))}

Assessment focus:
${listOrNone(profileField(profile, 'assessment_focus'))}
</paper_type_criteria>`;
  }

  function promptInstructionText(profile) {
    const label = selectedPaperTypeLabel();
    return textOrDefault(profileField(profile, 'prompt_instruction')) === 'Not specified.'
      ? fallbackPromptInstruction(profile, label)
      : textOrDefault(profileField(profile, 'prompt_instruction'));
  }

  function renderCriteriaPreview() {
    if (!paperTypePreview) return;
    const profile = selectedPaperTypeProfile();

    if (!selectedPaperTypeValue()) {
      paperTypePreview.innerHTML = '<p class="criteria-empty">Select a paper type to preview the genre-specific criteria used in the generated prompt.</p>';
      return;
    }

    if (!profile) {
      paperTypePreview.innerHTML = '<p class="criteria-empty">Paper type criteria are loading or unavailable. The prompt will use safe “Not specified” fallbacks until the JSON loads.</p>';
      return;
    }

    const previewItems = [
      ['Purpose', textOrDefault(profileField(profile, 'purpose'))],
      ['Expected structure', compactListText(profileField(profile, 'required_sections'))],
      ['Evidence expectations', compactListText(profileField(profile, 'evidence_expectations'))],
      ['Common pitfalls', compactListText(profileField(profile, 'common_pitfalls'))],
      ['Assessment focus', compactListText(profileField(profile, 'assessment_focus'))]
    ];

    paperTypePreview.innerHTML = previewItems.map(([label, text]) => `
      <div class="criteria-preview-row">
        <strong>${escapeHtml(label)}:</strong>
        <span>${escapeHtml(text)}</span>
      </div>`).join('');
  }

  function normalizePaperTypesData(data) {
    const rawTypes = data && typeof data === 'object' ? (data.paper_types || data) : {};
    return Object.fromEntries(Object.entries(rawTypes || {}).filter(([, profile]) => profile && typeof profile === 'object'));
  }

  function findPaperTypeKeyByStoredValue(storedValue) {
    const stored = String(storedValue || '').trim();
    if (!stored) return '';
    if (paperTypeProfiles[stored]) return stored;
    const storedLower = stored.toLowerCase();
    const match = Object.entries(paperTypeProfiles).find(([key, profile]) =>
      key.toLowerCase() === storedLower || String(profile?.label || '').toLowerCase() === storedLower
    );
    return match ? match[0] : stored;
  }

  function populatePaperTypeOptions() {
    if (!paperTypeSelect) return;
    const current = pendingPaperTypeValue || paperTypeSelect.value;
    paperTypeSelect.innerHTML = '<option value="">Select one</option>';

    Object.entries(paperTypeProfiles).forEach(([key, profile]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = profile?.label || key.replace(/_/g, ' ');
      paperTypeSelect.appendChild(option);
    });

    const restoredValue = findPaperTypeKeyByStoredValue(current);
    if (restoredValue && Array.from(paperTypeSelect.options).some(option => option.value === restoredValue)) {
      paperTypeSelect.value = restoredValue;
    }
    pendingPaperTypeValue = '';
    renderCriteriaPreview();
    buildPrompt();
  }

  async function loadPaperTypes() {
    if (!paperTypeSelect) return;
    try {
      const response = await fetch(PAPER_TYPES_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      paperTypeProfiles = normalizePaperTypesData(data);
      populatePaperTypeOptions();
    } catch (e) {
      console.warn('[PaperPromptBuilder] Could not load academic paper type criteria:', e);
      renderCriteriaPreview();
      buildPrompt();
    }
  }

  function sourcePairCount() {
    return sourcePairsContainer ? sourcePairsContainer.querySelectorAll('.source-pair-card').length : 0;
  }

  function updateSourcePairLabels() {
    if (!sourcePairsContainer) return;
    const cards = Array.from(sourcePairsContainer.querySelectorAll('.source-pair-card'));
    cards.forEach((card, index) => {
      const number = index + 1;
      const title = card.querySelector('.source-pair-title');
      const sourceLabel = card.querySelector('.source-label');
      const documentationLabel = card.querySelector('.documentation-label');
      const removeBtn = card.querySelector('.source-remove-btn');

      if (title) title.textContent = `Source ${number}`;
      if (sourceLabel) sourceLabel.textContent = `Source ${number} required source / source list`;
      if (documentationLabel) documentationLabel.textContent = `Source ${number} documentation provided`;
      if (removeBtn) removeBtn.classList.toggle('hidden', cards.length === 1);
    });
  }

  function addSourcePair(pair) {
    if (!sourcePairsContainer) return;

    const card = document.createElement('div');
    card.className = 'source-pair-card';
    card.innerHTML = `
      <div class="source-pair-card-header">
        <h3 class="source-pair-title">Source</h3>
        <button type="button" class="tool-btn secondary source-remove-btn">Remove source</button>
      </div>
      <div class="source-pair-grid">
        <div class="prompt-field full">
          <label class="source-label">Required source / source list</label>
          <textarea data-source-pair-field="source" placeholder="Paste source title, link, DOI, textbook chapter, or instructor-required source here."></textarea>
        </div>
        <div class="prompt-field full">
          <label class="documentation-label">Source documentation provided</label>
          <textarea data-source-pair-field="documentation" placeholder="Paste excerpts, article details, citation info, page numbers, PDF notes, or uploaded-file notes for this source here."></textarea>
        </div>
      </div>`;

    card.querySelector('[data-source-pair-field="source"]').value = pair?.source || '';
    card.querySelector('[data-source-pair-field="documentation"]').value = pair?.documentation || '';
    card.querySelector('.source-remove-btn').addEventListener('click', () => {
      card.remove();
      if (!sourcePairCount()) addSourcePair({});
      updateSourcePairLabels();
      buildPrompt();
      saveDraft();
    });

    sourcePairsContainer.appendChild(card);
    updateSourcePairLabels();
  }

  function renderSourcePairs(pairs) {
    if (!sourcePairsContainer) return;
    sourcePairsContainer.innerHTML = '';
    const usablePairs = Array.isArray(pairs) && pairs.length ? pairs : [{}];
    usablePairs.forEach(pair => addSourcePair(pair));
    updateSourcePairLabels();
  }

  function collectSourcePairs(options) {
    if (!sourcePairsContainer) return [];
    const includeEmpty = Boolean(options?.includeEmpty);

    return Array.from(sourcePairsContainer.querySelectorAll('.source-pair-card')).map(card => {
      const source = String(card.querySelector('[data-source-pair-field="source"]')?.value || '').trim();
      const documentation = String(card.querySelector('[data-source-pair-field="documentation"]')?.value || '').trim();
      return { source, documentation };
    }).filter(pair => includeEmpty || pair.source || pair.documentation);
  }

  function sourcePairsPromptText() {
    const pairs = collectSourcePairs();
    if (!pairs.length) return 'Not provided';

    return pairs.map((pair, index) => {
      return `- Source ${index + 1}:\n  Required source / source list: ${pair.source || 'Not provided'}\n  Source documentation provided: ${pair.documentation || 'Not provided'}`;
    }).join('\n');
  }

  function hasSourcePairInfo() {
    return collectSourcePairs().length > 0;
  }

  function incompleteSourcePairs() {
    return collectSourcePairs().map((pair, index) => ({ ...pair, number: index + 1 })).filter(pair => !pair.source || !pair.documentation);
  }

  function requiredLengthText() {
    const length = value('lengthRequirement');
    const unit = value('lengthUnit');
    return length && unit ? `${length} ${unit}` : '';
  }

  function requiredLengthMissingMessage() {
    const length = value('lengthRequirement');
    const unit = value('lengthUnit');

    if (!length && !unit) return 'Enter the required length and select Words or Pages before copying the prompt.';
    if (!length) return 'Enter the required length number before copying the prompt.';
    if (!Number.isFinite(Number(length)) || Number(length) < 1) return 'Enter a required length of 1 or more before copying the prompt.';
    if (!unit) return 'Select Words or Pages for the required length before copying the prompt.';
    return '';
  }

  function buildPrompt() {
    const sourceRules = checkedValues('sourceRules');
    const writingTasks = checkedValues('writingTasks');
    const contentHelp = checkedValues('contentHelp');
    const shouldWriteEntirePaper = writingTasks.some(task => task.includes('Write the entire paper'));
    const citationStyle = value('citationStyle');
    const otherCitationStyle = value('otherCitationStyle');
    const finalCitationStyle = citationStyle === 'Other' ? (otherCitationStyle || 'Other / custom') : citationStyle;
    const profile = selectedPaperTypeProfile();
    const paperTypeLabel = selectedPaperTypeLabel();

    const needsSources = sourceRules.some(rule =>
      rule.includes('Use only the sources I provide') ||
      rule.includes('peer-reviewed') ||
      rule.includes('sources from the last') ||
      rule.includes('in-text citations') ||
      rule.includes('References') ||
      rule.includes('Works Cited') ||
      rule.includes('bibliography')
    );

    const sourcePairsProvided = hasSourcePairInfo();
    const sourceRequirements = [
      listOrNone(sourceRules),
      '',
      'Required sources and source documentation:',
      sourcePairsPromptText()
    ].join('\n');
    const additionalRequirements = [
      value('pageSetup') ? `Font / spacing / page setup: ${value('pageSetup')}` : '',
      value('requiredSections') ? `Instructor-required sections/headings: ${value('requiredSections')}` : '',
      `Title page: ${value('titlePage') || 'Not specified'}`,
      `Abstract: ${value('abstract') || 'Not specified'}`,
      `Reference / Works Cited / Bibliography page: ${value('referencePage') || 'Not specified'}`,
      value('rubric') ? `Rubric / grading criteria:\n${value('rubric')}` : '',
      value('thesis') ? `Working thesis:\n${value('thesis')}` : '',
      value('argumentAngle') ? `Main argument / angle:\n${value('argumentAngle')}` : '',
      value('keyPoints') ? `Key points that must be included:\n${value('keyPoints')}` : '',
      value('counterargument') ? `Counterargument or opposing viewpoint to address:\n${value('counterargument')}` : '',
      contentHelp.length ? 'If thesis, argument, key point, or counterargument details are blank or weak, develop appropriate content using the assignment instructions, rubric, topic, academic level, and source rules.' : '',
      writingTasks.length ? `Selected output options:\n${listOrNone(writingTasks)}` : ''
    ].filter(Boolean).join('\n\n');

    const prompt = `<role>
You are an academic writing assistant and paper-planning coach specializing in ${value('academicLevel') || 'Not specified'} ${value('course') || 'Not specified'} writing.
</role>

<context>
${fieldLine('Paper topic', value('topic'))}
${fieldLine('Course / class', value('course'))}
${fieldLine('Academic level', value('academicLevel'))}
${fieldLine('Audience / instructor expectations', value('audience'))}
${fieldLine('Paper type', paperTypeLabel)}
${fieldLine('Required length', requiredLengthText())}
${fieldLine('Due date / timeline', value('dueDate'))}
${fieldLine('Citation style', finalCitationStyle)}
Source requirements:
${sourceRequirements}

Assignment instructions:
${value('assignmentInstructions') || 'Not provided'}

Additional requirements:
${additionalRequirements || 'Not provided'}
</context>

${paperTypeCriteriaText(profile)}

<prompt_instruction>
${promptInstructionText(profile)}
</prompt_instruction>

<task>
Create the requested academic writing support for this assignment based on the selected output options.
</task>

<rules>
- Follow the instructor’s assignment instructions first.
- Match the student’s academic level.
- Follow the required citation style.
- Do not invent sources, studies, quotes, statistics, page numbers, or references.
- If sources are needed but not provided, mark where citations are needed.
- If assignment details are missing, state what is missing instead of guessing.
- Keep the work appropriate for academic use.
- Do not write a final full paper unless the user specifically asks for a draft.
- For research-heavy papers, prioritize structure, evidence planning, synthesis, and citation needs.
- Use the selected paper type criteria to shape the outline, thesis, evidence expectations, and checklist.
${yesNo(needsSources && !sourcePairsProvided)} Source documentation may be missing and should be requested before final drafting.
${shouldWriteEntirePaper ? '- The user selected a full-paper draft option; still confirm critical missing assignment details and source documentation before drafting.' : '- Wait for approval before writing the full paper unless the user specifically asks for a draft.'}
</rules>

<output_format>
Return the response using these sections:

1. Assignment goal
2. Paper type expectations
3. Working thesis, research question, or central purpose
4. Recommended outline
5. Section-by-section writing guidance
6. Evidence/source needs
7. Common mistakes to avoid
8. Final checklist before submission
</output_format>`;

    output.value = prompt;
    return prompt;
  }

  function collectFormState() {
    const state = {};
    form.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.dataset.sourcePairField) return;
      if (!el.id && !el.name) return;
      const key = el.id || el.name;
      if (el.type === 'checkbox') {
        if (!state[el.name]) state[el.name] = [];
        if (el.checked) state[el.name].push(el.value);
      } else {
        state[key] = el.value;
      }
    });
    state.sourcePairs = collectSourcePairs({ includeEmpty: true });
    return state;
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectFormState()));
    } catch (e) {
      console.warn('[PaperPromptBuilder] Could not save draft:', e);
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      const migratedSourcePair = state.requiredSources || state.sourceDocumentation
        ? [{ source: state.requiredSources || '', documentation: state.sourceDocumentation || '' }]
        : null;

      renderSourcePairs(Array.isArray(state.sourcePairs) ? state.sourcePairs : migratedSourcePair);
      if (Array.isArray(state.paperType)) pendingPaperTypeValue = state.paperType[0] || '';
      if (state.paperTypeSelect) pendingPaperTypeValue = state.paperTypeSelect;

      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.dataset.sourcePairField) return;
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(state[el.name]) && state[el.name].includes(el.value);
        } else {
          const key = el.id || el.name;
          if (key === 'paperTypeSelect') {
            const storedPaperType = state.paperTypeSelect || (Array.isArray(state.paperType) ? state.paperType[0] : state.paperType);
            if (storedPaperType !== undefined) {
              pendingPaperTypeValue = storedPaperType;
              el.value = findPaperTypeKeyByStoredValue(storedPaperType);
            }
          } else if (state[key] !== undefined) {
            el.value = state[key];
          }
        }
      });
    } catch (e) {
      console.warn('[PaperPromptBuilder] Could not load draft:', e);
      renderSourcePairs([{}]);
    }
  }

  function checkMissingInfo() {
    const problems = [];
    const citationStyle = value('citationStyle');
    const sourceRules = checkedValues('sourceRules');

    if (!value('topic')) problems.push('Add the paper topic.');
    if (!selectedPaperTypeValue()) problems.push('Select a paper type.');

    const requiredLengthProblem = requiredLengthMissingMessage();
    if (requiredLengthProblem) problems.push(requiredLengthProblem);
    if (!citationStyle) problems.push('Recommended: select a citation style, such as APA, MLA, Chicago, AMA, or IEEE.');
    if (citationStyle === 'Other' && !value('otherCitationStyle')) problems.push('Type the custom citation style.');
    if (!value('assignmentInstructions')) problems.push('Paste the assignment instructions if you have them.');
    if (!value('rubric')) problems.push('Paste the rubric or grading criteria if you have it.');

    const citationsWanted = sourceRules.some(rule =>
      rule.includes('sources') || rule.includes('citations') || rule.includes('References') || rule.includes('Works Cited') || rule.includes('bibliography')
    );

    if (citationsWanted && !hasSourcePairInfo()) {
      problems.push('Recommended: add at least one source pair with the required source and its matching documentation.');
    }

    incompleteSourcePairs().forEach(pair => {
      if (!pair.source) problems.push(`Add required source details for Source ${pair.number}.`);
      if (!pair.documentation) problems.push(`Add matching source documentation for Source ${pair.number}.`);
    });

    if (!checkedValues('writingTasks').length) problems.push('Select what you want the AI to create: outline, thesis, draft, citations, revision, etc.');

    missingBox.classList.remove('hidden', 'good');
    if (!problems.length) {
      missingBox.classList.add('good');
      missingBox.innerHTML = '<strong>Looks good.</strong> The prompt has the core information an AI needs. Still double-check that source documentation is complete before asking for final citations.';
    } else {
      missingBox.innerHTML = '<strong>Missing / recommended information:</strong><ul>' + problems.map(p => `<li>${p}</li>`).join('') + '</ul>';
    }
  }

  function showRequiredLengthError(message) {
    missingBox.classList.remove('hidden', 'good');
    missingBox.innerHTML = `<strong>Required length needed:</strong> ${message}`;
    window.alert(message);

    if (!value('lengthRequirement')) {
      $('lengthRequirement')?.focus();
    } else {
      $('lengthUnit')?.focus();
    }
  }

  async function copyPrompt() {
    const requiredLengthProblem = requiredLengthMissingMessage();
    if (requiredLengthProblem) {
      showRequiredLengthError(requiredLengthProblem);
      return;
    }

    buildPrompt();
    try {
      await navigator.clipboard.writeText(output.value);
      missingBox.classList.remove('hidden');
      missingBox.classList.add('good');
      missingBox.innerHTML = '<strong>Copied.</strong> Paste this into ChatGPT, Claude, Gemini, or another AI tool.';
    } catch (e) {
      output.focus();
      output.select();
      document.execCommand('copy');
    }
  }

  function downloadPrompt() {
    buildPrompt();
    const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paper-writing-ai-prompt.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetForm() {
    if (!window.confirm('Clear this paper prompt form?')) return;
    form.reset();
    renderSourcePairs([{}]);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    missingBox.classList.add('hidden');
    buildPrompt();
    renderCriteriaPreview();
  }

  form.addEventListener('input', () => {
    buildPrompt();
    saveDraft();
  });

  form.addEventListener('change', () => {
    buildPrompt();
    saveDraft();
  });

  $('copyPromptBtn')?.addEventListener('click', copyPrompt);
  $('downloadPromptBtn')?.addEventListener('click', downloadPrompt);
  $('checkMissingBtn')?.addEventListener('click', checkMissingInfo);
  $('resetPromptBtn')?.addEventListener('click', resetForm);
  $('addSourcePairBtn')?.addEventListener('click', () => {
    addSourcePair({});
    buildPrompt();
    saveDraft();
  });

  paperTypeSelect?.addEventListener('change', renderCriteriaPreview);

  loadDraft();
  loadPaperTypes();
  renderCriteriaPreview();
  buildPrompt();
})();
