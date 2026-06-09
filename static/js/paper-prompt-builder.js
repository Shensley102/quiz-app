/* ============================================================
   AI Paper Prompt Builder
   - Builds an AI-readable academic paper prompt
   - Uses localStorage only; no backend required
   ============================================================ */

(function() {
  'use strict';

  const STORAGE_KEY = 'sg:v1:paperPromptBuilderDraft';

  const form = document.getElementById('paperPromptForm');
  const output = document.getElementById('generatedPrompt');
  const missingBox = document.getElementById('missingInfoBox');
  const sourcePairsContainer = document.getElementById('sourcePairs');
  const paperSetupDetails = document.getElementById('paperSetupDetails');
  const paperDependentContent = document.getElementById('paperDependentContent');

  const PAPER_TYPE_CONFIG = {
    'Research paper': {
      heading: '2. Research Paper Details',
      intro: 'Use these fields to define the research question, evidence plan, and formal paper structure.',
      focusLabel: 'Research question / narrowed focus',
      focusPlaceholder: 'Example: How do nurse staffing ratios affect patient safety outcomes in adult acute-care units?',
      evidenceLabel: 'Source strategy / evidence requirements',
      evidencePlaceholder: 'Example: Peer-reviewed nursing studies from the last 5 years, one policy source, and statistics from provided articles.',
      structureLabel: 'Research-paper sections or methodology notes',
      structurePlaceholder: 'Example: Introduction, background, literature support, implications for practice, conclusion.',
      roleFocus: 'research-focused academic paper',
      promptGuidance: '- Develop a focused research question and thesis.\n- Organize evidence into clear themes and connect every claim to provided or verified sources.\n- Emphasize scholarly synthesis, background context, and implications.'
    },
    'Argumentative essay': {
      heading: '2. Argumentative Essay Details',
      intro: 'Use these fields to define the claim, supporting reasons, and counterargument plan.',
      focusLabel: 'Position / claim to argue',
      focusPlaceholder: 'Example: Hospitals should adopt minimum nurse staffing ratios because they improve patient safety.',
      evidenceLabel: 'Supporting reasons / evidence plan',
      evidencePlaceholder: 'Example: Patient outcomes, staff retention, cost-benefit evidence, and required class sources.',
      structureLabel: 'Counterargument / rebuttal expectations',
      structurePlaceholder: 'Example: Address concerns about cost and staffing shortages, then rebut with evidence.',
      roleFocus: 'argumentative academic essay',
      promptGuidance: '- State a debatable thesis and keep the paper centered on proving that claim.\n- Use topic sentences, evidence, analysis, and transitions to build the argument.\n- Include and rebut opposing viewpoints when appropriate.'
    },
    'Literature review': {
      heading: '2. Literature Review Details',
      intro: 'Use these fields to define the review purpose, source boundaries, and synthesis themes.',
      focusLabel: 'Review purpose / research question',
      focusPlaceholder: 'Example: What does recent evidence show about burnout interventions for ICU nurses?',
      evidenceLabel: 'Source inclusion criteria',
      evidencePlaceholder: 'Example: Peer-reviewed studies from 2020-2026, adult ICU settings, intervention-focused articles.',
      structureLabel: 'Themes / synthesis categories',
      structurePlaceholder: 'Example: Staffing interventions, resilience training, leadership support, gaps in research.',
      roleFocus: 'literature review',
      promptGuidance: '- Synthesize sources by theme instead of summarizing one article at a time.\n- Compare findings, methods, limitations, and gaps across the literature.\n- Avoid making unsupported practice recommendations unless the assignment asks for them.'
    },
    'Case study': {
      heading: '2. Case Study Details',
      intro: 'Use these fields to capture the case context, analysis framework, and recommended solution.',
      focusLabel: 'Case background / scenario details',
      focusPlaceholder: 'Example: Briefly describe the patient, organization, clinical situation, or problem scenario.',
      evidenceLabel: 'Assessment criteria / theory / framework',
      evidencePlaceholder: 'Example: Use ABCDE assessment, nursing process, leadership theory, ethical framework, or provided rubric criteria.',
      structureLabel: 'Recommended intervention / outcome expectations',
      structurePlaceholder: 'Example: Identify the problem, analyze causes, propose interventions, and evaluate expected outcomes.',
      roleFocus: 'case study analysis',
      promptGuidance: '- Keep the analysis anchored to the facts of the case.\n- Apply the required framework, theory, rubric, or clinical reasoning steps.\n- Separate assessment, analysis, recommendations, and evaluation clearly.'
    },
    'Reflection paper': {
      heading: '2. Reflection Paper Details',
      intro: 'Use these fields to connect the experience, course concepts, and personal/professional growth.',
      focusLabel: 'Experience / event being reflected on',
      focusPlaceholder: 'Example: A clinical interaction, class activity, ethical dilemma, or learning experience.',
      evidenceLabel: 'Course concept / theory connection',
      evidencePlaceholder: 'Example: Connect the reflection to communication, patient safety, leadership, ethics, or a required reading.',
      structureLabel: 'Reflection model / learning outcome',
      structurePlaceholder: 'Example: Gibbs cycle, what happened/so what/now what, lessons learned, future practice changes.',
      roleFocus: 'reflection paper',
      promptGuidance: '- Balance personal insight with academic connection to course concepts.\n- Use first person if the assignment allows it.\n- Move beyond description by explaining what was learned and how it changes future practice.'
    },
    'Discussion post / response': {
      heading: '2. Discussion Post Details',
      intro: 'Use these fields to define the prompt, post type, and response requirements.',
      focusLabel: 'Discussion prompt / question to answer',
      focusPlaceholder: 'Example: Paste the discussion board prompt or the peer post you need to respond to.',
      evidenceLabel: 'Initial post or reply requirements',
      evidencePlaceholder: 'Example: Initial post with one scholarly source, or two peer replies with one citation each.',
      structureLabel: 'Tone / response structure notes',
      structurePlaceholder: 'Example: Conversational but scholarly, 250 words, ask one follow-up question, cite APA 7.',
      roleFocus: 'discussion post or peer response',
      promptGuidance: '- Answer the discussion prompt directly and concisely.\n- Use a scholarly but natural discussion-board tone.\n- If it is a peer response, acknowledge the peer\'s point, add evidence or insight, and ask a meaningful follow-up question when appropriate.'
    }
  };

  if (!form || !output) return;

  function $(id) {
    return document.getElementById(id);
  }

  function value(id) {
    const el = $(id);
    return el ? String(el.value || '').trim() : '';
  }

  function paperTypeValue() {
    return value('paperType');
  }

  function selectedPaperConfig() {
    return PAPER_TYPE_CONFIG[paperTypeValue()] || null;
  }

  function checkedValues(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
  }

  function yesNo(condition) {
    return condition ? '[x]' : '[ ]';
  }

  function listOrNone(items) {
    return items && items.length ? items.map(item => `- ${item}`).join('\n') : '- Not specified';
  }

  function fieldLine(label, val) {
    return `${label}: ${val || 'Not specified'}`;
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

  function paperSpecificPromptText(config) {
    if (!config) return 'Not provided';

    return [
      fieldLine(config.focusLabel, value('paperFocus')),
      fieldLine(config.evidenceLabel, value('evidencePlan')),
      fieldLine(config.structureLabel, value('structureNotes'))
    ].join('\n');
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
    const paperType = paperTypeValue();
    const paperConfig = selectedPaperConfig();

    if (!paperType || !paperConfig) {
      output.value = '';
      output.placeholder = 'Select a paper type to begin building your AI prompt.';
      return '';
    }

    output.placeholder = '';
    const sourceRules = checkedValues('sourceRules');
    const writingTasks = checkedValues('writingTasks');
    const contentHelp = checkedValues('contentHelp');
    const shouldWriteEntirePaper = writingTasks.some(task => task.includes('Write the entire paper'));
    const citationStyle = value('citationStyle');
    const otherCitationStyle = value('otherCitationStyle');
    const finalCitationStyle = citationStyle === 'Other' ? (otherCitationStyle || 'Other / custom') : citationStyle;

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

    const prompt = `<role>
You are an academic writing assistant and paper-planning coach. Help me create a strong, well-organized ${paperConfig.roleFocus} while following the assignment instructions, rubric, citation style, and source rules I provide.
</role>

<context>
${fieldLine('Paper topic', value('topic'))}
${fieldLine('Course / class', value('course'))}
${fieldLine('Academic level', value('academicLevel'))}
${fieldLine('Audience / instructor expectations', value('audience'))}
${fieldLine('Paper type', paperType)}
${fieldLine('Required length', requiredLengthText())}
${fieldLine('Due date / timeline', value('dueDate'))}
</context>

<paper_type_specific_details>
${paperSpecificPromptText(paperConfig)}

Paper-type guidance:
${paperConfig.promptGuidance}
</paper_type_specific_details>

<citation_and_format_requirements>
${fieldLine('Citation style', finalCitationStyle)}
${fieldLine('Font / spacing / page setup', value('pageSetup'))}
${fieldLine('Required sections', value('requiredSections'))}
${yesNo(value('titlePage') === 'yes')} Include title page if required by the selected style or assignment.
${yesNo(value('abstract') === 'yes')} Include abstract if required by the assignment or citation style.
${yesNo(value('referencePage') === 'yes')} Include References / Works Cited / Bibliography page as appropriate.
</citation_and_format_requirements>

<source_rules>
${listOrNone(sourceRules)}

IMPORTANT SOURCE DOCUMENTATION NOTE:
Before writing the paper, check whether I have provided enough source documentation. Source documentation may include PDFs, article links, DOI, author names, publication dates, page numbers, textbook excerpts, screenshots, or pasted source text.

If source documentation is missing or incomplete, do not invent citations, quotes, authors, article titles, DOI numbers, page numbers, or reference entries. Ask me for the missing source documentation first.

${yesNo(needsSources && !sourcePairsProvided)} Source documentation may be missing and should be requested before final drafting.
</source_rules>

<assignment_materials>
Assignment instructions:
${value('assignmentInstructions') || 'Not provided'}

Rubric / grading criteria:
${value('rubric') || 'Not provided'}

Required sources and source documentation:
${sourcePairsPromptText()}
</assignment_materials>

<thesis_and_argument>
Working thesis:
${value('thesis') || 'Not provided'}

Main argument / angle:
${value('argumentAngle') || 'Not provided'}

Key points that must be included:
${value('keyPoints') || 'Not provided'}

Counterargument or opposing viewpoint to address:
${value('counterargument') || 'Not provided'}

${yesNo(contentHelp.length)} If any thesis, argument, key point, or counterargument details are blank or weak, develop appropriate content for that part using the assignment instructions, rubric, topic, academic level, and source rules.
</thesis_and_argument>

<writing_tasks_requested>
${listOrNone(writingTasks)}
</writing_tasks_requested>

<style_and_quality_rules>
- Use clear academic writing.
- Match the requested academic level and audience.
- Keep the paper organized with logical flow between sections.
- Support claims with provided or verified sources.
- Use in-text citations according to the selected citation style.
- Do not fabricate citations, quotes, statistics, page numbers, article titles, or source details.
- If the assignment instructions conflict with general citation-style rules, prioritize the assignment instructions and tell me about the conflict.
- If any required information is missing, ask targeted follow-up questions before writing the final paper.
</style_and_quality_rules>

<output_format>
First, give me a missing-information checklist.
Second, give me a recommended thesis improvement if needed.
Third, create a detailed paper outline.
${shouldWriteEntirePaper ? 'Fourth, write the entire paper from start to finish after completing the missing-information and source-documentation check. If critical assignment details or source documentation needed for citations are missing, ask for those first instead of inventing them.' : 'Fourth, wait for my approval before writing the full paper unless I specifically ask you to draft immediately.'}
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
      if (Array.isArray(state.paperType)) {
        state.paperType = state.paperType[0] || '';
      }

      const migratedSourcePair = state.requiredSources || state.sourceDocumentation
        ? [{ source: state.requiredSources || '', documentation: state.sourceDocumentation || '' }]
        : null;

      renderSourcePairs(Array.isArray(state.sourcePairs) ? state.sourcePairs : migratedSourcePair);

      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.dataset.sourcePairField) return;
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(state[el.name]) && state[el.name].includes(el.value);
        } else {
          const key = el.id || el.name;
          if (state[key] !== undefined) el.value = state[key];
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

    if (!paperTypeValue()) {
      missingBox.classList.remove('hidden', 'good');
      missingBox.innerHTML = '<strong>Start here:</strong> Select a paper type to reveal the paper-specific fields.';
      $('paperType')?.focus();
      return;
    }
    if (!value('topic')) problems.push('Add the paper topic.');

    const requiredLengthProblem = requiredLengthMissingMessage();
    if (requiredLengthProblem) problems.push(requiredLengthProblem);
    if (!citationStyle) problems.push('Select a citation style, such as APA, MLA, Chicago, AMA, or IEEE.');
    if (citationStyle === 'Other' && !value('otherCitationStyle')) problems.push('Type the custom citation style.');
    if (!value('assignmentInstructions')) problems.push('Paste the assignment instructions if you have them.');
    if (!value('rubric')) problems.push('Paste the rubric or grading criteria if you have it.');

    const citationsWanted = sourceRules.some(rule =>
      rule.includes('sources') || rule.includes('citations') || rule.includes('References') || rule.includes('Works Cited') || rule.includes('bibliography')
    );

    if (citationsWanted && !hasSourcePairInfo()) {
      problems.push('Add at least one source pair with the required source and its matching documentation.');
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
    if (!paperTypeValue()) {
      missingBox.classList.remove('hidden', 'good');
      missingBox.innerHTML = '<strong>Paper type needed:</strong> Select a paper type before copying the prompt.';
      $('paperType')?.focus();
      return;
    }

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
    if (!paperTypeValue()) {
      missingBox.classList.remove('hidden', 'good');
      missingBox.innerHTML = '<strong>Paper type needed:</strong> Select a paper type before downloading the prompt.';
      $('paperType')?.focus();
      return;
    }

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


  function updatePaperSpecificFields(clearValues) {
    const config = selectedPaperConfig();
    const hasPaperType = Boolean(config);

    paperSetupDetails?.classList.toggle('hidden', !hasPaperType);
    paperDependentContent?.classList.toggle('hidden', !hasPaperType);

    if (clearValues) {
      form.querySelectorAll('[data-paper-specific="true"]').forEach(el => {
        el.value = '';
      });
    }

    if (!hasPaperType) {
      output.value = '';
      output.placeholder = 'Select a paper type to begin building your AI prompt.';
      missingBox?.classList.add('hidden');
      return;
    }

    const heading = $('paperTypeDetailsHeading');
    const intro = $('paperTypeDetailsIntro');
    const focusLabel = $('paperFocusLabel');
    const evidenceLabel = $('evidencePlanLabel');
    const structureLabel = $('structureNotesLabel');
    const focus = $('paperFocus');
    const evidence = $('evidencePlan');
    const structure = $('structureNotes');

    if (heading) heading.textContent = config.heading;
    if (intro) intro.textContent = config.intro;
    if (focusLabel) focusLabel.textContent = config.focusLabel;
    if (evidenceLabel) evidenceLabel.textContent = config.evidenceLabel;
    if (structureLabel) structureLabel.textContent = config.structureLabel;
    if (focus) focus.placeholder = config.focusPlaceholder;
    if (evidence) evidence.placeholder = config.evidencePlaceholder;
    if (structure) structure.placeholder = config.structurePlaceholder;

  }

  function resetForm() {
    if (!window.confirm('Clear this paper prompt form?')) return;
    form.reset();
    renderSourcePairs([{}]);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    missingBox.classList.add('hidden');
    updatePaperSpecificFields(false);
    buildPrompt();
  }

  let previousPaperType = paperTypeValue();

  form.addEventListener('input', () => {
    buildPrompt();
    saveDraft();
  });

  form.addEventListener('change', event => {
    if (event.target?.id === 'paperType') {
      const nextPaperType = paperTypeValue();
      updatePaperSpecificFields(Boolean((previousPaperType || nextPaperType) && previousPaperType !== nextPaperType));
      previousPaperType = nextPaperType;
    } else {
      updatePaperSpecificFields(false);
    }

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

  loadDraft();
  updatePaperSpecificFields(false);
  previousPaperType = paperTypeValue();
  buildPrompt();
})();
