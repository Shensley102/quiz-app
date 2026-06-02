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

  function yesNo(condition) {
    return condition ? '[x]' : '[ ]';
  }

  function listOrNone(items) {
    return items && items.length ? items.map(item => `- ${item}`).join('\n') : '- Not specified';
  }

  function fieldLine(label, val) {
    return `${label}: ${val || 'Not specified'}`;
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
    const paperTypes = checkedValues('paperType');
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

    const sourceDocumentation = value('sourceDocumentation');
    const requiredSources = value('requiredSources');

    const prompt = `<role>
You are an academic writing assistant and paper-planning coach. Help me create a strong, well-organized paper while following the assignment instructions, rubric, citation style, and source rules I provide.
</role>

<context>
${fieldLine('Paper topic', value('topic'))}
${fieldLine('Course / class', value('course'))}
${fieldLine('Academic level', value('academicLevel'))}
${fieldLine('Audience / instructor expectations', value('audience'))}
${fieldLine('Paper type', paperTypes.length ? paperTypes.join(', ') : 'Not specified')}
${fieldLine('Required length', requiredLengthText())}
${fieldLine('Due date / timeline', value('dueDate'))}
</context>

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

${yesNo(needsSources && !sourceDocumentation && !requiredSources)} Source documentation may be missing and should be requested before final drafting.
</source_rules>

<assignment_materials>
Assignment instructions:
${value('assignmentInstructions') || 'Not provided'}

Rubric / grading criteria:
${value('rubric') || 'Not provided'}

Required sources or source list:
${requiredSources || 'Not provided'}

Source documentation pasted or uploaded:
${sourceDocumentation || 'Not provided'}
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
      if (!el.id && !el.name) return;
      const key = el.id || el.name;
      if (el.type === 'checkbox') {
        if (!state[el.name]) state[el.name] = [];
        if (el.checked) state[el.name].push(el.value);
      } else {
        state[key] = el.value;
      }
    });
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
      if (!raw) return;
      const state = JSON.parse(raw);
      form.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'checkbox') {
          el.checked = Array.isArray(state[el.name]) && state[el.name].includes(el.value);
        } else {
          const key = el.id || el.name;
          if (state[key] !== undefined) el.value = state[key];
        }
      });
    } catch (e) {
      console.warn('[PaperPromptBuilder] Could not load draft:', e);
    }
  }

  function checkMissingInfo() {
    const problems = [];
    const citationStyle = value('citationStyle');
    const sourceRules = checkedValues('sourceRules');

    if (!value('topic')) problems.push('Add the paper topic.');
    if (!checkedValues('paperType').length) problems.push('Select at least one paper type.');

    const requiredLengthProblem = requiredLengthMissingMessage();
    if (requiredLengthProblem) problems.push(requiredLengthProblem);
    if (!citationStyle) problems.push('Select a citation style, such as APA, MLA, Chicago, AMA, or IEEE.');
    if (citationStyle === 'Other' && !value('otherCitationStyle')) problems.push('Type the custom citation style.');
    if (!value('assignmentInstructions')) problems.push('Paste the assignment instructions if you have them.');
    if (!value('rubric')) problems.push('Paste the rubric or grading criteria if you have it.');

    const citationsWanted = sourceRules.some(rule =>
      rule.includes('sources') || rule.includes('citations') || rule.includes('References') || rule.includes('Works Cited') || rule.includes('bibliography')
    );

    if (citationsWanted && !value('requiredSources') && !value('sourceDocumentation')) {
      problems.push('Add source documentation: PDFs, article links, DOI, author/date/title info, textbook excerpts, page numbers, or pasted source text.');
    }

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
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    missingBox.classList.add('hidden');
    buildPrompt();
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

  loadDraft();
  buildPrompt();
})();
