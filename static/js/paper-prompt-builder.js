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


  const REQUIRED_SECTION_PLACEHOLDERS = {
    'Research paper': 'Example: introduction, background/context, body sections organized by argument/theme/evidence, implications or discussion, conclusion, final source section',
    'Argumentative essay': 'Example: introduction with claim/thesis, supporting reasons, evidence, counterargument, rebuttal, conclusion, final source section if sources are used',
    'Literature review': 'Example: introduction/review purpose, source scope or search criteria, thematic synthesis, patterns/gaps, conclusion, final source section',
    'Case study': 'Example: case overview, problem/issue, assessment or analysis, evidence-based discussion, recommendation/intervention, evaluation, conclusion, final source section if sources are used',
    'Reflection paper': 'Example: experience/context, reflection/analysis, course concept connection, learning/future application, final source section if sources are cited',
    'Discussion post / response': 'Example: direct answer to prompt, evidence/course connection, application, peer response if required, final citations/references at end if sources are cited'
  };

  const CITATION_STYLE_CONFIG = {
    'APA 7': {
      label: 'APA 7 student paper format',
      sourceUrls: ['https://apastyle.apa.org/instructional-aids/student-paper-setup-guide.pdf', 'https://apastyle.apa.org/instructional-aids/reference-examples.pdf', 'https://owl.purdue.edu/owl/research_and_citation/apa_style/apa_formatting_and_style_guide/general_format.html'],
      defaultPageSetup: 'APA 7 student paper format: 1-inch margins, double-spaced text, accessible and consistent font such as 12-point Times New Roman, 11-point Calibri, 11-point Arial, 11-point Georgia, or 10-point Lucida Sans Unicode; page number in the top-right corner on every page; student papers do not need a running head unless the instructor requires one; left-align text with ragged right edge; indent the first line of paragraphs 0.5 inch.',
      referencePageLabel: 'References page',
      inTextCitationType: 'Author-date in-text citations',
      citationMarkerRules: ['Use narrative citations such as Author (Year) or parenthetical citations such as (Author, Year).'],
      locatorRules: ['Page numbers are required for direct quotes and useful/required for specific paraphrases when the instructor asks for precise support.'],
      referenceListRules: ['Use References, not Works Cited.', 'Use DOI links when available in https://doi.org/... format.'],
      quoteRules: ['Include page numbers for direct quotations.'],
      promptRules: ['Use author-date citations.', 'Use References page.', 'Use student-paper title page unless instructor says otherwise.', 'Abstract is included only if assignment/rubric requires it.', 'Student papers use page number in the top-right header and no running head unless required.', 'Use APA 7 page setup and source integrity rules.'],
      sourceIntegrityRules: ['Do not invent authors, dates, titles, journals, DOI numbers, URLs, page numbers, or quotations.']
    },
    'MLA 9': {
      label: 'MLA 9 paper format',
      sourceUrls: ['https://style.mla.org/works-cited/works-cited-a-quick-guide/', 'https://style.mla.org/works-cited/citations-by-format/', 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_general_format.html', 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_in_text_citations_the_basics.html', 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_works_cited_page_basic_format.html', 'https://owl.purdue.edu/owl/research_and_citation/mla_style/mla_formatting_and_style_guide/mla_formatting_quotations.html'],
      defaultPageSetup: 'MLA 9 format: 1-inch margins; double-spaced text throughout; legible 12-point font, commonly Times New Roman unless instructor specifies otherwise; first-line paragraph indents of 0.5 inch; last name and page number in the upper-right header; no separate title page unless instructor requires it or it is a group project; first page should include student name, instructor name, course, and date in the upper-left, followed by a centered title in Title Case with no bold, underline, italics, quotation marks, or special styling unless referring to another work.',
      referencePageLabel: 'Works Cited page',
      inTextCitationType: 'Author-page in-text citations',
      citationMarkerRules: ['Use parenthetical citations such as (Author page) or narrative citations where the author is named in the sentence and the page number appears in parentheses.', 'If no author exists, use a shortened title in the in-text citation.'],
      locatorRules: ['If no page number exists, do not invent one.'],
      referenceListRules: ['Use Works Cited, not References.', 'Works Cited uses MLA core elements and container model.', 'Alphabetize Works Cited entries.', 'Use hanging indents.'],
      quoteRules: ['Use italics for larger standalone works and quotation marks for shorter works.', 'Short quotations use quotation marks; long prose quotations over four lines use MLA block quote formatting.'],
      promptRules: ['Use author-page citations.', 'Use Works Cited.', 'Do not use a title page unless assigned.', 'Do not use an abstract unless assigned.', 'Use MLA first-page heading.', 'Use MLA core elements and container model.', 'Use MLA quote rules.'],
      sourceIntegrityRules: ['Do not invent authors, dates, titles, publishers, page numbers, DOI numbers, URLs, or quotations.']
    },
    'Chicago': {
      label: 'Chicago/Turabian student-paper format',
      sourceUrls: ['https://owl.purdue.edu/owl/research_and_citation/chicago_manual_18th_edition/index.html', 'https://owl.purdue.edu/owl/research_and_citation/chicago_manual_18th_edition/cmos_formatting_and_style_guide/general_format.html', 'https://owl.purdue.edu/owl/research_and_citation/chicago_manual_18th_edition/cmos_formatting_and_style_guide/chicago_manual_of_style_18th_edition.html'],
      defaultPageSetup: 'Chicago/Turabian student paper format: readable 12-point font preferred; margins no smaller than 1 inch; double-spaced main text unless instructor specifies otherwise; page numbers according to instructor requirements; class papers may use either a title page or title on the first page depending on instructor requirements; use Chicago Notes-Bibliography or Chicago Author-Date consistently.',
      referencePageLabel: 'Bibliography / References',
      inTextCitationType: 'Notes-Bibliography footnotes/endnotes or Author-Date parenthetical citations',
      citationMarkerRules: ['Notes-Bibliography uses superscript note numbers with footnotes or endnotes.', 'Author-Date uses author-date parenthetical citations.'],
      locatorRules: ['Use page numbers in notes or parenthetical citations for specific passages, direct quotations, and close paraphrases.'],
      referenceListRules: ['Notes-Bibliography uses Bibliography unless the instructor says full notes are enough.', 'Author-Date uses References page.', 'Alphabetize Bibliography or References entries by author last name or first significant title word if no author exists.'],
      quoteRules: ['Use Chicago quotation and block quotation formatting as required by the instructor.'],
      promptRules: ['Chicago has two systems: Notes-Bibliography and Author-Date.', 'Use Chicago/Turabian student-paper guidance language for class papers.', 'Class papers may use a title page or title on the first page depending on instructor requirements.', 'Abstract is usually assignment-dependent and not automatically required for class papers.'],
      sourceIntegrityRules: ['Do not invent authors, titles, publication facts, page numbers, URLs, DOI numbers, notes, or bibliography entries.']
    },
    'AMA': {
      label: 'AMA Manual of Style guidance',
      sourceUrls: ['https://owl.purdue.edu/owl/research_and_citation/ama_style/index.html', 'https://library.une.edu/research-help/help-with-citations/ama-style/', 'https://www.concordia.ca/library/guides/health/ama-11-citation.html'],
      defaultPageSetup: 'AMA style student/manuscript format: use instructor-required font and spacing; if no instructions are given, use a readable 12-point font, 1-inch margins, and consistent spacing. Use superscript Arabic-number citations in the text and a numbered References list at the end in order of first citation. Title page and abstract are assignment-dependent for student work.',
      referencePageLabel: 'References page',
      inTextCitationType: 'Superscript Arabic-number citations',
      citationMarkerRules: ['Use superscript Arabic-number citations.', 'Number sources in order of first appearance.', 'Use the same superscript number every time the same source is cited again.', 'Place superscript citation numbers outside periods and commas, but inside colons and semicolons.', 'Use hyphens for sequential multiple citations and commas for nonsequential citations.'],
      locatorRules: ['Do not put a superscript citation immediately after a number if it could look like an exponent; revise the sentence.'],
      referenceListRules: ['Use a numbered References page titled References.', 'List references numerically, not alphabetically.', 'Do not combine two sources under one reference number.', 'Use sentence case for article titles.', 'Use abbreviated journal titles when appropriate.', 'Include DOI when available.'],
      quoteRules: ['Use quotation page numbers only when verified.'],
      promptRules: ['Use AMA Manual of Style guidance.', 'Use superscript numbered citations.', 'Number sources by first appearance.', 'Use numbered References.', 'Use same number for repeated citations.', 'Follow AMA punctuation placement for superscripts.', 'Include DOI when available.'],
      sourceIntegrityRules: ['Do not invent authors, titles, journal names, volume/issue data, page ranges, DOI numbers, URLs, or quotation page numbers.']
    },
    'IEEE': {
      label: 'IEEE citation and technical paper guidance',
      sourceUrls: ['https://journals.ieeeauthorcenter.ieee.org/your-role-in-article-production/ieee-editorial-style-manual/', 'https://journals.ieeeauthorcenter.ieee.org/wp-content/uploads/sites/7/IEEE-Editorial-Style-Manual-for-Authors.pdf'],
      defaultPageSetup: 'IEEE technical paper format: use instructor template if provided; otherwise use a clear technical-paper structure with title, author information if required, abstract for technical/research papers, index terms if required, introduction, body sections, conclusion, and References. Use numbered bracket citations such as [1] and list references numerically in order of citation.',
      referencePageLabel: 'References section',
      inTextCitationType: 'Numbered bracket citations such as [1]',
      citationMarkerRules: ['Use IEEE numbered bracket citations such as [1], [2], and [3].', 'Number references in order of first citation.', 'Refer to sources as “in [1]” rather than “in reference [1].”'],
      locatorRules: ['Use specific locators such as [1, Fig. 2], [1, Sec. IV], [1, Ch. 3], or [1, eq. (8)] when needed.'],
      referenceListRules: ['Use a numbered References section.', 'Do not group multiple sources under one reference number.', 'Do not list the same source multiple times for different page numbers or sections.'],
      quoteRules: ['Use IEEE locators when quoting specific figures, sections, chapters, equations, or tables.'],
      promptRules: ['Use IEEE citation and technical paper guidance.', 'Use numbered bracket citations such as [1].', 'Number references by first appearance.', 'Use numbered References section.', 'Use abstract/index terms when required by paper type or template.', 'Use IEEE locators when citing specific figures, sections, chapters, equations, or tables.'],
      sourceIntegrityRules: ['Do not invent authors, titles, conference names, journal names, volume/issue data, page ranges, DOI numbers, URLs, or technical source details.']
    },
    'ASA': {
      label: 'ASA style guidance',
      sourceUrls: ['https://owl.purdue.edu/owl/research_and_citation/asa_style/index.html', 'https://owl.purdue.edu/owl/research_and_citation/asa_style/in_text_citation_references.html', 'https://owl.purdue.edu/owl/research_and_citation/asa_style/references_page_formatting.html', 'https://owl.purdue.edu/owl/research_and_citation/asa_style/manuscript_writing_style.html'],
      defaultPageSetup: 'ASA manuscript format: 12-point Arial font, double-spaced text including footnotes unless instructor specifies otherwise; margins at least 1.25 inches unless instructor specifies otherwise; separate title page for formal manuscripts when required; abstract if required; page numbers consecutive starting with the title page; references section headed REFERENCES.',
      referencePageLabel: 'REFERENCES section',
      inTextCitationType: 'Author-year in-text citations',
      citationMarkerRules: ['Use ASA author-year in-text citations.', 'Cite author last name and year of publication, such as (Gouldner 1963).', 'If the author is named in the sentence, place the year immediately after the author name.', 'Use semicolons between multiple citations.'],
      locatorRules: ['Include page numbers for direct quotes, paraphrases of specific passages, and references to specific passages.', 'Use ASA page format with a colon and no space, such as (Kuhn 1970:71).'],
      referenceListRules: ['Use REFERENCES section.', 'Double-space references and use hanging indents.', 'Alphabetize references by first author last name.', 'Use title case for titles in references.', 'List all authors in the References section unless the work was authored by a committee.'],
      quoteRules: ['Use footnotes/endnotes sparingly and do not mix them unless allowed by ASA guidance.'],
      promptRules: ['Use ASA style guidance.', 'Use author-year citations.', 'Include page numbers for quotes and specific passages using Author Year:Page.', 'Use REFERENCES section.', 'Alphabetize references.', 'Double-space references and use hanging indents.'],
      sourceIntegrityRules: ['Do not invent authors, titles, dates, publisher details, DOI numbers, URLs, page numbers, or quotations.']
    },
    'Vancouver / ICMJE': {
      label: 'Vancouver/ICMJE medical-journal citation guidance',
      sourceUrls: ['https://www.icmje.org/recommendations/browse/manuscript-preparation/preparing-for-submission.html'],
      defaultPageSetup: 'Vancouver/ICMJE medical manuscript format: use instructor or journal template if provided; use numbered in-text citations in the order sources are first mentioned, normally Arabic numerals in parentheses such as (1); use a numbered References list in citation order; title page and abstract are assignment-dependent for student papers or journal-style manuscripts.',
      referencePageLabel: 'References list',
      inTextCitationType: 'Numbered citations in first-mentioned order',
      citationMarkerRules: ['Use numbered citations in the order sources are first mentioned.', 'In-text citations should use Arabic numerals in parentheses, such as (1), unless instructor/journal specifies square brackets or superscripts.', 'Use the same number for repeated citations of the same source.'],
      locatorRules: ['Verify medical references using original sources or PubMed/NLM when possible.'],
      referenceListRules: ['Use a numbered References list in citation order.', 'Journal titles should be abbreviated according to MEDLINE/NLM style when possible.', 'Include DOI when available.'],
      quoteRules: ['Use direct quotations only with verified source location details.'],
      promptRules: ['Use Vancouver/ICMJE medical-journal citation guidance.', 'Use numbered citations in order first mentioned.', 'Use Arabic numerals in parentheses, such as (1), unless instructor/journal specifies otherwise.', 'Use the same number for repeated citations of the same source.', 'Use numbered References list.', 'Verify medical references using original sources or PubMed/NLM when possible.', 'Do not cite AI-generated material as the primary source for scholarly claims.'],
      sourceIntegrityRules: ['Referencing AI-generated material as the primary source is not acceptable.', 'Authors are responsible for accurate citation support.', 'Do not invent authors, article titles, journal names, publication details, page ranges, DOI numbers, URLs, or quotations.']
    },
    'CSE': {
      label: 'CSE scientific writing format',
      sourceUrls: ['https://www.csemanual.org/Tools/CSE-Citation-Quick-Guide.html'],
      defaultPageSetup: 'CSE scientific writing format: use instructor or journal template if provided; select the required CSE system—Citation-Sequence, Citation-Name, or Name-Year; use the matching in-text citation and reference-list order; use a References list unless instructor says otherwise; title page and abstract are assignment-dependent.',
      referencePageLabel: 'References list',
      inTextCitationType: 'CSE Citation-Sequence, Citation-Name, or Name-Year citations',
      citationMarkerRules: ['Citation-Sequence: use numbered citations in the order sources first appear.', 'Citation-Name: alphabetize references first, then number them.', 'Name-Year: use author-year in-text citations.'],
      locatorRules: ['Use the locator format required by the selected CSE system or instructor.'],
      referenceListRules: ['Use References as the final source-section label unless instructor says otherwise.', 'Citation-Sequence references are listed numerically by first appearance.', 'Citation-Name references are alphabetized first, then numbered.', 'Name-Year references are alphabetized by author.'],
      quoteRules: ['Use direct quotations only with verified source location details.'],
      promptRules: ['Use CSE citation guidance.', 'CSE is appropriate for biology, natural sciences, environmental science, and lab/scientific writing.', 'Ask which CSE system is required before final citation formatting if not confirmed.'],
      sourceIntegrityRules: ['Do not invent authors, titles, dates, journal names, publisher details, page numbers, DOI numbers, URLs, or quotations.']
    }
  };

  const GENERIC_REQUIRED_SECTIONS_PLACEHOLDER = 'Example: Introduction, Background, Evidence, Counterargument, Conclusion';

  const APA7_PAPER_TYPE_RULES = makeRules('APA 7', {
    titleDefaults: { research: 'yes', argumentative: 'yes', literature: 'yes', caseStudy: 'yes', reflection: 'yes', discussion: 'no' },
    abstractDefaults: { research: 'unknown', argumentative: 'no', literature: 'unknown', caseStudy: 'no', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'caseStudy', 'reflection', 'discussion'],
    helpers: {
      title: 'APA student papers normally include a title page unless the instructor says otherwise.',
      abstract: 'APA student-paper abstracts are assignment-dependent; include one only if required.',
      reference: 'Use an APA References page for cited sources.'
    }
  });
  const MLA9_PAPER_TYPE_RULES = makeRules('MLA 9', {
    titleDefaults: { all: 'no' },
    abstractDefaults: { all: 'no', literature: 'unknown' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['research', 'argumentative', 'literature', 'caseStudy', 'reflection', 'discussion'],
    lockAbstract: ['research', 'argumentative', 'caseStudy', 'reflection', 'discussion'],
    helpers: {
      title: 'MLA papers normally do not use a separate title page unless assigned or used for a group project; use the MLA first-page heading instead.',
      abstract: 'MLA papers normally do not include an abstract unless specifically assigned.',
      reference: 'Use Works Cited for sources quoted, paraphrased, summarized, or otherwise cited.'
    }
  });
  const CHICAGO_PAPER_TYPE_RULES = makeRules('Chicago', {
    titleDefaults: { all: 'unknown', discussion: 'no' },
    abstractDefaults: { all: 'unknown', argumentative: 'no', caseStudy: 'no', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'caseStudy', 'reflection', 'discussion'],
    helpers: {
      title: 'Chicago/Turabian class papers may use a title page or title on the first page depending on instructor requirements.',
      abstract: 'Chicago class-paper abstracts are assignment-dependent and usually not automatic.',
      reference: 'Use Bibliography for Notes-Bibliography or References for Author-Date unless the instructor says otherwise.'
    }
  });
  const AMA_PAPER_TYPE_RULES = makeRules('AMA', {
    titleDefaults: { all: 'unknown', discussion: 'no' },
    abstractDefaults: { all: 'unknown', argumentative: 'no', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'reflection', 'discussion'],
    helpers: {
      title: 'AMA title pages are assignment-dependent for student papers.',
      abstract: 'AMA abstracts are assignment-dependent; clinical/medical reports may require one.',
      reference: 'Use a numbered AMA References page in order of first citation.'
    }
  });
  const IEEE_PAPER_TYPE_RULES = makeRules('IEEE', {
    titleDefaults: { all: 'unknown', discussion: 'no' },
    abstractDefaults: { research: 'yes', argumentative: 'no', literature: 'unknown', caseStudy: 'unknown', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'reflection', 'discussion'],
    helpers: {
      title: 'IEEE title/byline format depends on the instructor template.',
      abstract: 'IEEE technical/research papers normally include an abstract; other student assignments depend on the template.',
      reference: 'Use a numbered IEEE References section.'
    }
  });
  const ASA_PAPER_TYPE_RULES = makeRules('ASA', {
    titleDefaults: { research: 'yes', all: 'unknown', discussion: 'no' },
    abstractDefaults: { all: 'unknown', argumentative: 'no', caseStudy: 'no', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'caseStudy', 'reflection', 'discussion'],
    helpers: {
      title: 'ASA formal manuscript-style research papers may use a title page; follow instructor requirements.',
      abstract: 'ASA abstracts are assignment-dependent.',
      reference: 'Use an ASA REFERENCES section for cited sources.'
    }
  });
  const VANCOUVER_PAPER_TYPE_RULES = makeRules('Vancouver / ICMJE', {
    titleDefaults: { all: 'unknown', discussion: 'no' },
    abstractDefaults: { all: 'unknown', argumentative: 'no', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'reflection', 'discussion'],
    helpers: {
      title: 'Vancouver/ICMJE title pages are assignment- or journal-template-dependent.',
      abstract: 'Vancouver/ICMJE abstracts are assignment-dependent for student papers and journal-style manuscripts.',
      reference: 'Use a numbered References list in citation order.'
    }
  });
  const CSE_PAPER_TYPE_RULES = makeRules('CSE', {
    titleDefaults: { all: 'unknown', discussion: 'no' },
    abstractDefaults: { all: 'unknown', argumentative: 'no', reflection: 'no', discussion: 'no' },
    referenceDefaults: { reflection: 'unknown' },
    lockTitle: ['discussion'],
    lockAbstract: ['argumentative', 'reflection', 'discussion'],
    helpers: {
      title: 'CSE title pages are assignment- or journal-template-dependent.',
      abstract: 'CSE abstracts are assignment-dependent.',
      reference: 'Use a CSE References list unless the instructor says otherwise.'
    }
  });

  const PAPER_TYPE_FORMAT_RULES = {
    'APA 7': APA7_PAPER_TYPE_RULES,
    'MLA 9': MLA9_PAPER_TYPE_RULES,
    'Chicago': CHICAGO_PAPER_TYPE_RULES,
    'AMA': AMA_PAPER_TYPE_RULES,
    'IEEE': IEEE_PAPER_TYPE_RULES,
    'ASA': ASA_PAPER_TYPE_RULES,
    'Vancouver / ICMJE': VANCOUVER_PAPER_TYPE_RULES,
    'CSE': CSE_PAPER_TYPE_RULES
  };

  function makeRules(styleName, options) {
    const keys = {
      'Research paper': 'research',
      'Argumentative essay': 'argumentative',
      'Literature review': 'literature',
      'Case study': 'caseStudy',
      'Reflection paper': 'reflection',
      'Discussion post / response': 'discussion'
    };

    const sourceLabel = styleName === 'MLA 9' ? 'Works Cited' : styleName === 'ASA' ? 'REFERENCES' : styleName === 'IEEE' ? 'References section' : styleName === 'Vancouver / ICMJE' || styleName === 'CSE' ? 'References list' : styleName === 'Chicago' ? 'Bibliography/References' : 'References';
    return Object.fromEntries(Object.entries(keys).map(([paperType, key]) => {
      const isDiscussion = key === 'discussion';
      const valueFor = (map, fallback = 'yes') => map?.[key] ?? map?.all ?? fallback;
      const titleEnabled = !isDiscussion && !(options.lockTitle || []).includes(key);
      const abstractEnabled = !isDiscussion && !(options.lockAbstract || []).includes(key);
      const referenceDefault = isDiscussion ? 'yes' : valueFor(options.referenceDefaults, 'yes');
      return [paperType, {
        titlePage: { enabled: titleEnabled, defaultValue: valueFor(options.titleDefaults, 'unknown'), helper: isDiscussion ? 'Discussion posts normally do not need a title page unless the instructor requires one.' : options.helpers.title },
        abstract: { enabled: abstractEnabled, defaultValue: valueFor(options.abstractDefaults, 'unknown'), helper: isDiscussion ? 'Discussion posts do not normally include an abstract.' : options.helpers.abstract },
        referencePage: { enabled: true, defaultValue: referenceDefault, helper: isDiscussion ? `Keep ${sourceLabel} entries or citations at the end of the post if sources are cited or required.` : options.helpers.reference },
        requiredSectionsPlaceholder: REQUIRED_SECTION_PLACEHOLDERS[paperType],
        formatNote: `${paperType} in ${styleName} should follow ${sourceLabel} expectations, ${CITATION_STYLE_CONFIG[styleName]?.inTextCitationType || 'the selected citation system'}, and the instructor/rubric.`
      }];
    }));
  }

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

  function getSelectedStyleConfig() {
    return CITATION_STYLE_CONFIG[value('citationStyle')] || null;
  }

  function getSelectedPaperTypeRules() {
    return PAPER_TYPE_FORMAT_RULES[value('citationStyle')]?.[paperTypeValue()] || null;
  }

  function getStyleSystemValue() {
    const citationStyle = value('citationStyle');
    if (citationStyle === 'Chicago') return value('chicagoSystem') || 'Not sure / follow instructor';
    if (citationStyle === 'CSE') return value('cseSystem') || 'Not sure / follow instructor';
    return '';
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

  function formatFieldLabel(fieldId) {
    const label = document.querySelector(`label[for="${fieldId}"]`);
    return label ? label.textContent.replace(/\?$/, '').trim() : fieldId;
  }

  function setFieldHelper(field, helperText, isLocked) {
    const parent = field.closest('.prompt-field');
    if (!parent) return;

    let helper = parent.querySelector('[data-format-helper="true"]');
    if (!helper && helperText) {
      helper = document.createElement('p');
      helper.className = 'field-help format-helper-text';
      helper.dataset.formatHelper = 'true';
      parent.appendChild(helper);
    }

    if (helper) {
      helper.textContent = helperText || '';
      helper.hidden = !helperText;
      helper.classList.toggle('locked-helper', Boolean(isLocked));
    }
  }

  function setAutofilledValue(fieldId, newValue) {
    const field = $(fieldId);
    if (!field || !newValue) return;
    if (!String(field.value || '').trim() || field.dataset.autofilled === 'true') {
      field.value = newValue;
      field.dataset.autofilled = 'true';
    }
  }

  function setFieldLock(fieldId, enabled, helperText, defaultValue) {
    const field = $(fieldId);
    if (!field) return;

    const parent = field.closest('.prompt-field');
    if (!enabled && defaultValue !== undefined) {
      field.value = defaultValue;
      field.dataset.formatAutofilled = 'true';
    } else if (enabled && defaultValue && (!field.value || field.value === 'unknown' || field.dataset.formatWasLocked === 'true' || field.dataset.formatAutofilled === 'true')) {
      field.value = defaultValue;
      field.dataset.formatAutofilled = 'true';
    }

    field.disabled = !enabled;
    field.dataset.formatLocked = String(!enabled);
    field.dataset.formatDisabledReason = enabled ? '' : (helperText || 'This field is normally not used for the selected paper type and citation style.');
    if (!enabled) field.dataset.formatWasLocked = 'true';
    if (enabled) field.dataset.formatWasLocked = 'false';

    if (parent) {
      parent.classList.toggle('locked', !enabled);
      parent.classList.toggle('format-field-disabled', !enabled);
      parent.classList.toggle('format-field-locked', !enabled);
    }

    setFieldHelper(field, helperText, !enabled);
  }

  function updateStyleSystemVisibility() {
    const citationStyle = value('citationStyle');
    $('chicagoSystemField')?.classList.toggle('hidden', citationStyle !== 'Chicago');
    $('cseSystemField')?.classList.toggle('hidden', citationStyle !== 'CSE');
  }

  function sourcePageLabel() {
    const citationStyle = value('citationStyle');
    const chicagoSystem = value('chicagoSystem');
    if (citationStyle === 'Chicago') {
      if (chicagoSystem === 'Notes-Bibliography') return 'Bibliography';
      if (chicagoSystem === 'Author-Date') return 'References page';
      return 'Bibliography / References';
    }
    if (citationStyle === 'Other') return 'Reference / Works Cited / Bibliography page';
    return getSelectedStyleConfig()?.referencePageLabel || 'Reference / Works Cited / Bibliography page';
  }

  function updateReferencePageLabel() {
    const label = document.querySelector('label[for="referencePage"]');
    if (label) label.textContent = `${sourcePageLabel()}?`;
  }

  function resetFormatRules() {
    ['titlePage', 'abstract', 'referencePage'].forEach(fieldId => {
      const field = $(fieldId);
      if (!field) return;
      setFieldLock(fieldId, true, '', undefined);
      delete field.dataset.formatDisabledReason;
      delete field.dataset.formatLocked;
    });

    const pageSetup = $('pageSetup');
    if (pageSetup) {
      const styleDefaults = Object.values(CITATION_STYLE_CONFIG).map(config => config.defaultPageSetup).filter(Boolean);
      if (pageSetup.dataset.autofilled === 'true' || styleDefaults.includes(pageSetup.value)) pageSetup.value = '';
      pageSetup.placeholder = 'Example: Times New Roman 12, double spaced';
      pageSetup.dataset.autofilled = 'false';
    }

    const requiredSections = $('requiredSections');
    if (requiredSections) requiredSections.placeholder = GENERIC_REQUIRED_SECTIONS_PLACEHOLDER;
  }

  function applyFormatRules() {
    const styleConfig = getSelectedStyleConfig();
    const paperRules = getSelectedPaperTypeRules();

    resetFormatRules();
    updateStyleSystemVisibility();
    updateReferencePageLabel();

    if (!styleConfig) return;

    setAutofilledValue('pageSetup', styleConfig.defaultPageSetup);
    $('pageSetup').placeholder = styleConfig.defaultPageSetup;

    if (!paperTypeValue() || !paperRules) return;

    setFieldLock('titlePage', paperRules.titlePage.enabled, paperRules.titlePage.helper, paperRules.titlePage.defaultValue);
    setFieldLock('abstract', paperRules.abstract.enabled, paperRules.abstract.helper, paperRules.abstract.defaultValue);
    setFieldLock('referencePage', paperRules.referencePage.enabled, paperRules.referencePage.helper, paperRules.referencePage.defaultValue);

    const requiredSections = $('requiredSections');
    if (requiredSections) requiredSections.placeholder = paperRules.requiredSectionsPlaceholder;
  }

  function buildDisabledFieldNotes() {
    return ['titlePage', 'abstract', 'referencePage'].map(fieldId => {
      const field = $(fieldId);
      if (!field || !field.disabled) return '';
      return `${formatFieldLabel(fieldId)}: ${field.dataset.formatDisabledReason || 'Normally not used for this style/paper type unless the instructor requires it.'}`;
    }).filter(Boolean);
  }

  function buildSourceIntegrityBlock() {
    const styleConfig = getSelectedStyleConfig();
    return `<source_integrity_rules>
- Do not invent sources, authors, article titles, book titles, journal names, volume/issue numbers, page ranges, DOI numbers, URLs, publication dates, quotations, statistics, or citation entries.
- If citation information is incomplete, ask for the missing source documentation before final citation formatting.
- Match every in-text citation to a final reference entry.
- Match every final reference entry to at least one in-text citation unless the selected style/instructor allows uncited bibliography entries.
- For every source, check for author, title, date, publication/container, DOI/URL, page range, and any source-specific details required by the selected style.
- Use direct quotes only when exact wording and page/paragraph/location information are provided.
- If a source has no page number, do not invent one. Use the locator allowed by the selected style, or omit the locator if the style allows it.
${styleConfig ? listOrNone(styleConfig.sourceIntegrityRules) : '- Follow the selected or custom citation style source-integrity rules.'}
- If assignment instructions conflict with style defaults, follow the assignment instructions and identify the conflict.
</source_integrity_rules>`;
  }

  function buildStyleSpecificTag(citationStyle, system) {
    const tag = {
      'APA 7': 'apa_7_requirements',
      'MLA 9': 'mla_9_requirements',
      'Chicago': 'chicago_requirements',
      'AMA': 'ama_requirements',
      'IEEE': 'ieee_requirements',
      'ASA': 'asa_requirements',
      'Vancouver / ICMJE': 'vancouver_icmje_requirements',
      'CSE': 'cse_requirements',
      'Other': 'custom_citation_requirements'
    }[citationStyle] || 'custom_citation_requirements';
    const lines = {
      'APA 7': ['Use APA 7 formatting and citation rules.', ...CITATION_STYLE_CONFIG['APA 7'].promptRules],
      'MLA 9': ['Use MLA 9 formatting and citation rules.', ...CITATION_STYLE_CONFIG['MLA 9'].promptRules],
      'Chicago': ['Use Chicago/Turabian student-paper guidance.', `Chicago system selected: ${system}`, 'If Notes-Bibliography: use footnotes/endnotes and Bibliography.', 'If Author-Date: use author-date citations and References.', 'If Not sure: ask which system is required before final citation formatting.', 'Follow instructor/rubric over default Chicago assumptions.'],
      'AMA': ['Use AMA Manual of Style guidance.', ...CITATION_STYLE_CONFIG.AMA.promptRules],
      'IEEE': ['Use IEEE citation and technical paper guidance.', ...CITATION_STYLE_CONFIG.IEEE.promptRules],
      'ASA': ['Use ASA style guidance.', ...CITATION_STYLE_CONFIG.ASA.promptRules],
      'Vancouver / ICMJE': ['Use Vancouver/ICMJE medical-journal citation guidance.', ...CITATION_STYLE_CONFIG['Vancouver / ICMJE'].promptRules],
      'CSE': ['Use CSE citation guidance.', `CSE system selected: ${system}`, 'If Citation-Sequence: number sources by first appearance and list references in that order.', 'If Citation-Name: alphabetize references first, assign numbers, and use those numbers in text.', 'If Name-Year: use author-year in-text citations and alphabetized references.', 'If Not sure: ask which CSE system is required before final citation formatting.'],
      'Other': ['Use the custom/instructor-specific citation style exactly as provided.', 'If rules are unclear, ask for the instructor’s examples, style sheet, or citation guide before final formatting.']
    }[citationStyle] || ['Use the selected citation style exactly as provided.'];
    return `<${tag}>\n${listOrNone(lines)}\n</${tag}>`;
  }

  function buildStyleRequirementsBlock() {
    const citationStyle = value('citationStyle');
    const finalCitationStyle = citationStyle === 'Other' ? (value('otherCitationStyle') || 'Other / custom') : citationStyle;
    const styleConfig = getSelectedStyleConfig();
    const paperRules = getSelectedPaperTypeRules();
    const system = getStyleSystemValue();
    const disabledNotes = buildDisabledFieldNotes();
    const systemWarning = citationStyle === 'Chicago' && system === 'Not sure / follow instructor'
      ? '- Confirm whether Chicago Notes-Bibliography or Chicago Author-Date is required before final citation formatting.'
      : citationStyle === 'CSE' && system === 'Not sure / follow instructor'
        ? '- Confirm whether CSE Citation-Sequence, Citation-Name, or Name-Year is required before final citation formatting.'
        : '';

    return [
      fieldLine('Citation style', finalCitationStyle),
      system ? fieldLine(`${citationStyle} system`, system) : '',
      fieldLine('Final source-section label', sourcePageLabel()),
      paperRules ? fieldLine('Paper-type-specific interpretation', paperRules.formatNote) : 'Paper-type-specific interpretation: Select a paper type for paper-specific format rules.',
      disabledNotes.length ? 'Disabled fields and why:\n' + listOrNone(disabledNotes) : 'Disabled fields and why:\n- None for the selected combination.',
      fieldLine('Page setup rules', value('pageSetup') || styleConfig?.defaultPageSetup),
      fieldLine('Title page rule', paperRules?.titlePage?.helper),
      fieldLine('Abstract rule', paperRules?.abstract?.helper),
      fieldLine('Final source section rule', paperRules?.referencePage?.helper),
      styleConfig ? 'In-text citation rules:\n' + listOrNone([styleConfig.inTextCitationType, ...styleConfig.citationMarkerRules]) : '',
      styleConfig ? 'Reference-list rules:\n' + listOrNone(styleConfig.referenceListRules) : '',
      styleConfig ? 'Locator/page-number rules:\n' + listOrNone(styleConfig.locatorRules) : '',
      styleConfig ? 'Quote rules:\n' + listOrNone(styleConfig.quoteRules) : '',
      styleConfig ? 'Style-specific source-integrity rules:\n' + listOrNone(styleConfig.sourceIntegrityRules) : '',
      systemWarning,
      buildStyleSpecificTag(citationStyle || 'Other', system),
      'Assignment/rubric/instructor rules override default style assumptions.'
    ].filter(Boolean).join('\n');
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
    applyFormatRules();

    const finalCitationStyle = citationStyle === 'Other' ? (otherCitationStyle || 'Other / custom') : citationStyle;
    const styleRequirementsBlock = buildStyleRequirementsBlock();
    const finalSourcePageLabel = sourcePageLabel();

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
${styleRequirementsBlock}
${fieldLine('Required sections', value('requiredSections'))}
${yesNo(value('titlePage') === 'yes')} Include title page if required by the selected style or assignment.
${yesNo(value('abstract') === 'yes')} Include abstract if required by the assignment or citation style.
${yesNo(value('referencePage') === 'yes')} Include ${finalSourcePageLabel} as appropriate.
</citation_and_format_requirements>

${buildSourceIntegrityBlock()}

<source_rules>
${listOrNone(sourceRules)}

IMPORTANT SOURCE DOCUMENTATION NOTE:
Before writing the paper, check whether I have provided enough source documentation. Source documentation may include PDFs, article links, DOI, author names, publication dates, page numbers, textbook excerpts, screenshots, or pasted source text.

If source documentation is missing or incomplete, do not invent citations, quotes, authors, article titles, DOI numbers, page numbers, or reference entries. For every source, check for author, title, date, publication/container, DOI/URL, page range, and any source-specific details required by the selected style. Ask me for missing source documentation before creating final citations.

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
    if (!citationStyle) problems.push('Select a citation style, such as APA, MLA, Chicago, AMA, IEEE, ASA, Vancouver / ICMJE, or CSE.');
    if (citationStyle === 'Other' && !value('otherCitationStyle')) problems.push('Type the custom citation style.');
    if (citationStyle === 'Chicago' && getStyleSystemValue() === 'Not sure / follow instructor') problems.push('Confirm whether Chicago Notes-Bibliography or Chicago Author-Date is required before final citation formatting.');
    if (citationStyle === 'CSE' && getStyleSystemValue() === 'Not sure / follow instructor') problems.push('Confirm whether CSE Citation-Sequence, Citation-Name, or Name-Year is required before final citation formatting.');
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

    if (value('citationStyle') === 'Other' && !value('otherCitationStyle')) {
      missingBox.classList.remove('hidden', 'good');
      missingBox.innerHTML = '<strong>Custom citation style needed:</strong> Type the instructor-specific citation style before copying the prompt.';
      $('otherCitationStyle')?.focus();
      return;
    }

    buildPrompt();
    const systemWarning = value('citationStyle') === 'Chicago' && getStyleSystemValue() === 'Not sure / follow instructor'
      ? ' Confirm whether Chicago Notes-Bibliography or Chicago Author-Date is required before final citation formatting.'
      : value('citationStyle') === 'CSE' && getStyleSystemValue() === 'Not sure / follow instructor'
        ? ' Confirm whether CSE Citation-Sequence, Citation-Name, or Name-Year is required before final citation formatting.'
        : '';
    try {
      await navigator.clipboard.writeText(output.value);
      missingBox.classList.remove('hidden');
      missingBox.classList.add('good');
      missingBox.innerHTML = '<strong>Copied.</strong> Paste this into ChatGPT, Claude, Gemini, or another AI tool.' + systemWarning;
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
    applyFormatRules();
    buildPrompt();
  }

  let previousPaperType = paperTypeValue();

  form.addEventListener('input', event => {
    if (event.target?.id === 'pageSetup') {
      event.target.dataset.autofilled = 'false';
    }
    applyFormatRules();
    buildPrompt();
    saveDraft();
  });

  form.addEventListener('change', event => {
    if (['titlePage', 'abstract', 'referencePage'].includes(event.target?.id)) {
      event.target.dataset.formatAutofilled = 'false';
      event.target.dataset.formatWasLocked = 'false';
    }

    if (event.target?.id === 'paperType') {
      const nextPaperType = paperTypeValue();
      updatePaperSpecificFields(Boolean((previousPaperType || nextPaperType) && previousPaperType !== nextPaperType));
      previousPaperType = nextPaperType;
    } else {
      updatePaperSpecificFields(false);
    }

    applyFormatRules();
    buildPrompt();
    saveDraft();
  });

  $('copyPromptBtn')?.addEventListener('click', copyPrompt);
  $('downloadPromptBtn')?.addEventListener('click', downloadPrompt);
  $('checkMissingBtn')?.addEventListener('click', checkMissingInfo);
  $('resetPromptBtn')?.addEventListener('click', resetForm);
  $('addSourcePairBtn')?.addEventListener('click', () => {
    addSourcePair({});
    applyFormatRules();
    buildPrompt();
    saveDraft();
  });

  loadDraft();
  updatePaperSpecificFields(false);
  applyFormatRules();
  previousPaperType = paperTypeValue();
  buildPrompt();
})();
