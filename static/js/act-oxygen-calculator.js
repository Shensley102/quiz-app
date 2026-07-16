(() => {
  const C = window.OxygenCalculations;
  const $ = (id) => document.getElementById(id);
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const storageKey = 'act-oxygen-equipment-preferences-v2';
  const presetKey = 'act-oxygen-equipment-presets-v2';
  const ON_BOARD_TYPES = ['KEVLAR', 'LOX', 'H'];
  const PORTABLE_TYPES = ['D', 'JUMBO_D', 'E'];
  const WALL_LOW_PSI_MODES = ['CONVENTIONAL'];
  const VENTILATOR_MODES = ['BIPAP_LOW_PRESSURE', 'BIPAP_HIGH_PRESSURE', 'HFNC', 'HAMILTON_T1_ADULT_PED', 'HAMILTON_T1_NEONATE', 'REVEL', 'LTV1200'];
  const phaseContexts = [['bedside','Bedside movement'],['ground','Ground transport'],['loading','Loading or transfer delay'],['air','Air transport'],['unloading','Unloading'],['destination','Destination arrival'],['buffer','Safety buffer']];
  const defaultPhases = ['Bedside to vehicle','Ground transport','Loading or transfer delay','Air transport','Unloading','Vehicle to destination','Safety buffer'];
  let config = null;
  let quick = null;
  let oxygenSources = [];
  let plannerPhases = [];

  const fmt = (v, d = 2) => Number.isFinite(v) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(Math.abs(v) < 1e-9 ? 0 : v) : '—';
  const f2 = (v) => Number.isFinite(v) ? (Math.abs(v) < 1e-9 ? 0 : v).toFixed(2) : '—';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const val = (id) => $(id)?.value || '';
  const checkedValue = (name) => q(`input[name="${name}"]:checked`)?.value || '';
  const isVentilatorMode = (mode) => VENTILATOR_MODES.includes(mode);

  function option(value, label) {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = label;
    return el;
  }
  function text(tag, content, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = content;
    return el;
  }
  function setHidden(id, hidden) { $(id)?.classList.toggle('hidden', hidden); }
  function setWarn(id, lines) {
    const el = $(id);
    if (!el) return;
    const list = [].concat(lines || []).filter(Boolean);
    el.textContent = list.join(' ');
    el.classList.toggle('hidden', !list.length);
  }
  function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
  function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

  function defaultSources() {
    return [
      { id: 'onboard1', group: 'onboard', type: 'H', pressure: '', lox: '', kevlar: '', context: 'continuous' },
      { id: 'portable1', group: 'portable', type: 'D', pressure: '', lox: '', kevlar: '', context: 'portable' }
    ];
  }
  function activeSources() { return oxygenSources; }
  function allowedTypesForSource(source) { return source.group === 'onboard' ? ON_BOARD_TYPES : PORTABLE_TYPES; }
  function labelForSource(source) {
    const groupSources = oxygenSources.filter((item) => item.group === source.group);
    const index = groupSources.findIndex((item) => item.id === source.id);
    const suffix = index > 0 ? ` #${index + 1}` : '';
    return `${source.group === 'onboard' ? 'On Board O₂' : 'Portable O₂'}${suffix}`;
  }
  function hasAtLeastOneValidSource() { return activeSources().some((source) => sourceCalc(source).ok); }
  function setProgressiveVisibility(hasValidSource, hasValidResult) {
    setHidden('deliveryDeviceSection', !hasValidSource);
    setHidden('deviceFlowSection', !hasValidSource);
    setHidden('plannerSection', !hasValidResult);
    setHidden('summarySection', !hasValidResult);
    setHidden('presetsSection', !hasValidResult);
  }

  function sourceCalc(source) {
    const cyl = config.cylinders[source.type];
    if (!cyl) return C.calculateCompressedCylinder({});
    if (cyl.isLiquidOxygen) return C.calculateLox({ loxReading: source.lox, loxFactor: config.loxFactor });
    const factor = cyl.requiresUserFactor ? source.kevlar : cyl.factor;
    return C.calculateCompressedCylinder({ currentPressurePsi: source.pressure, reservePsi: config.reservePsi, cylinderFactor: factor });
  }

  function savePrefs() {
    saveJson(storageKey, {
      deliveryDeviceCategory: checkedValue('deliveryDeviceCategory'),
      deliveryMode: val('deliveryMode'),
      bipapSupplyMethod: checkedValue('bipapSupplyMethod'),
      highPressureMethod: val('highPressureMethod'),
      activeSourceId: val('activeSourceId'),
      oxygenSources: oxygenSources.map(({ id, group, type, context, kevlar }) => ({ id, group, type, context, kevlar }))
    });
  }

  function renderSourceCard(source) {
    const allowed = allowedTypesForSource(source);
    const cyl = config.cylinders[source.type];
    const isLox = !!cyl?.isLiquidOxygen;
    const needsKevlar = !!cyl?.requiresUserFactor;
    const result = sourceCalc(source);
    const canRemove = oxygenSources.filter((item) => item.group === source.group).length > 1;
    const card = document.createElement('article');
    card.className = 'planner-card oxygen-inventory-card';
    card.innerHTML = `<div class="oxygen-source-card-header"><h4>${esc(labelForSource(source))}</h4>${canRemove ? `<button class="btn btn-outline danger" type="button" data-remove-source="${source.id}">Remove</button>` : ''}</div>
      <div class="oxygen-grid three-col">
        <label class="oxygen-field">Tank/source type<select data-source-field="type" data-source-id="${source.id}"></select></label>
        <label class="oxygen-field ${isLox ? 'hidden' : ''}">Current pressure (PSI)<input data-source-field="pressure" data-source-id="${source.id}" type="number" inputmode="decimal" min="0" step="any" value="${esc(source.pressure)}"></label>
        <label class="oxygen-field ${isLox ? '' : 'hidden'}">LOX quantity reading<input data-source-field="lox" data-source-id="${source.id}" type="number" inputmode="decimal" min="0" step="any" value="${esc(source.lox)}"></label>
        <label class="oxygen-field ${needsKevlar ? '' : 'hidden'}">Kevlar factor (L/PSI)<input data-source-field="kevlar" data-source-id="${source.id}" type="number" inputmode="decimal" min="0" step="any" value="${esc(source.kevlar)}"></label>
      </div>
      <p class="oxygen-help-block">${result.ok ? `Usable pressure: ${fmt(result.usablePressurePsi || 0, 0)} PSI • Usable oxygen: ${fmt(result.usableLiters)} L` : `Source validation: ${esc(result.errors.join(' '))}`}</p>
      <div class="oxygen-warning ${result.warnings?.length ? '' : 'hidden'}">${esc((result.warnings || []).join(' '))}</div>`;
    const select = q('[data-source-field="type"]', card);
    allowed.forEach((key) => select.append(option(key, config.cylinders[key].label === 'H' ? 'H-Tank' : config.cylinders[key].label)));
    select.value = source.type;
    return card;
  }

  function renderSources() {
    $('onBoardSources').innerHTML = '';
    $('portableSources').innerHTML = '';
    oxygenSources.filter((s) => s.group === 'onboard').forEach((s) => $('onBoardSources').append(renderSourceCard(s)));
    oxygenSources.filter((s) => s.group === 'portable').forEach((s) => $('portableSources').append(renderSourceCard(s)));
    qa('[data-source-field]').forEach((el) => el.addEventListener('input', updateSourceFromField));
    renderActiveSourceOptions();
  }

  function updateSourceCardStatus(card, source) {
    if (!card || !source) return;
    const result = sourceCalc(source);
    const help = q('.oxygen-help-block', card);
    const warning = q('.oxygen-warning', card);
    if (help) help.textContent = result.ok ? `Usable pressure: ${fmt(result.usablePressurePsi || 0, 0)} PSI • Usable oxygen: ${fmt(result.usableLiters)} L` : `Source validation: ${(result.errors || []).join(' ')}`;
    if (warning) {
      warning.textContent = (result.warnings || []).join(' ');
      warning.classList.toggle('hidden', !(result.warnings || []).length);
    }
  }

  function updateSourceFromField(event) {
    const id = event.target.dataset.sourceId;
    const field = event.target.dataset.sourceField;
    const source = oxygenSources.find((s) => s.id === id);
    if (!source) return;
    source[field] = event.target.value;
    if (field === 'type') {
      const allowed = allowedTypesForSource(source);
      if (!allowed.includes(source.type)) source.type = allowed[0];
      savePrefs();
      renderSources();
      recalc();
      return;
    }
    savePrefs();
    updateSourceCardStatus(event.target.closest('.oxygen-inventory-card'), source);
    recalc();
  }

  function renderActiveSourceOptions() {
    const select = $('activeSourceId');
    const previous = select.value;
    select.innerHTML = '';
    activeSources().forEach((source) => select.append(option(source.id, `${labelForSource(source)} — ${config.cylinders[source.type]?.label || source.type}`)));
    if (activeSources().some((s) => s.id === previous)) select.value = previous;
    if (!select.value && activeSources()[0]) select.value = activeSources()[0].id;
  }

  function deliveryModesForCategory(category) {
    return category === 'VENTILATOR' ? VENTILATOR_MODES : WALL_LOW_PSI_MODES;
  }
  function renderDeliveryModes() {
    const category = checkedValue('deliveryDeviceCategory') || 'WALL_LOW_PSI';
    const modes = deliveryModesForCategory(category);
    const previous = val('deliveryMode');
    const select = $('deliveryMode');
    select.innerHTML = '';
    modes.forEach((mode) => select.append(option(mode, config.deliveryModes[mode].label)));
    select.value = modes.includes(previous) ? previous : modes[0];
    setHidden('bipapSupplyWrap', !['BIPAP_LOW_PRESSURE', 'BIPAP_HIGH_PRESSURE'].includes(select.value));
    renderSettings();
  }

  function selectedMode() {
    const mode = val('deliveryMode');
    if (mode === 'BIPAP_LOW_PRESSURE' || mode === 'BIPAP_HIGH_PRESSURE') return checkedValue('bipapSupplyMethod') || mode;
    return mode;
  }

  function fieldHtml(mode) {
    if (mode === 'CONVENTIONAL') return '<label class="oxygen-field">Oxygen flow from source (L/min)<input id="oxygenFlowLpm" type="number" inputmode="decimal" min="0" step="any" placeholder="15"></label>';
    if (mode === 'BIPAP_LOW_PRESSURE') return '<label class="oxygen-field">BiPAP/NPPV oxygen bleed-in flow (L/min)<input id="oxygenBleedInFlowLpm" type="number" inputmode="decimal" min="0" step="any" placeholder="10"></label>';
    if (mode === 'BIPAP_HIGH_PRESSURE') return '<label class="oxygen-field">High-pressure calculation method<select id="highPressureMethod"><option value="blended">Calculate from total blended device flow and FiO₂</option><option value="direct">Enter known/validated oxygen draw directly</option></select></label><label class="oxygen-field hp-blended">Set FiO₂<input id="fio2" inputmode="decimal" placeholder="0.60, 60, or 60%"></label><label class="oxygen-field hp-blended">Total device/blended flow, including flow used to maintain pressure and compensate for circuit leak<input id="totalBlendedFlowLpm" type="number" inputmode="decimal" min="0" step="any" placeholder="60"></label><label class="oxygen-field hp-direct hidden">Known/validated oxygen draw (L/min)<input id="knownOxygenDrawLpm" type="number" inputmode="decimal" min="0" step="any" placeholder="31"></label><label class="oxygen-field hp-direct hidden">Source of value<select id="oxygenDrawSource"><option>Device display</option><option>Manufacturer reference</option><option>Organizational equipment profile</option><option>Locally measured or bench-tested value</option><option>Other validated source</option></select></label>';
    if (mode === 'HFNC') return '<label class="oxygen-field">Total HFNC flow (L/min)<input id="hfncTotalFlowLpm" type="number" inputmode="decimal" min="0" step="any" placeholder="15"></label><label class="oxygen-field">Set FiO₂<input id="fio2" inputmode="decimal" placeholder="0.60, 60, or 60%"></label>';
    return '<label class="oxygen-field">Minute ventilation<input id="minuteVentilation" type="number" inputmode="decimal" min="0" step="any" placeholder="8"></label><label class="oxygen-field">Minute-ventilation unit<select id="minuteVentilationUnit"><option>L/min</option><option>mL/min</option></select></label><label class="oxygen-field">Set FiO₂<input id="fio2" inputmode="decimal" placeholder="0.70, 70, or 70%"></label><label class="oxygen-field">Configured device bias flow<input readonly id="biasFlowDisplay" value="' + fmt(config.deliveryModes[mode]?.biasFlowLpm, 1) + ' L/min"></label>';
  }

  function renderSettings() {
    const mode = selectedMode();
    $('settingsFields').innerHTML = fieldHtml(mode);
    updateHighPressureFields();
    const help = {
      CONVENTIONAL: 'Wall / Portable Low PSI uses the entered flowmeter oxygen flow as source consumption.',
      BIPAP_LOW_PRESSURE: 'Ventilator device: BiPAP/NPPV. Oxygen supply method: low-pressure bleed-in. FiO₂, IPAP, and EPAP are not used to calculate tank duration in this pathway.',
      BIPAP_HIGH_PRESSURE: 'Ventilator device: BiPAP/NPPV. Use total device outlet flow or a manufacturer-validated / locally measured oxygen-draw value. Do not enter patient minute ventilation or derive flow from IPAP/EPAP alone.',
      HFNC: 'Ventilator/blended device pathway. HFNC oxygen-source flow is modeled from total flow and FiO₂ using ambient air 0.21 and source oxygen 1.00.',
      HAMILTON_T1_ADULT_PED: 'Ventilator pathway. Device-specific oxygen-use constants must be verified against exact model, software, circuit, manufacturer instructions, and local policy.',
      HAMILTON_T1_NEONATE: 'Ventilator pathway. Device-specific oxygen-use constants must be verified against exact model, software, circuit, manufacturer instructions, and local policy.',
      REVEL: 'Ventilator pathway. Device-specific oxygen-use constants must be verified against exact model, software, circuit, manufacturer instructions, and local policy.',
      LTV1200: 'Ventilator pathway. Device-specific oxygen-use constants must be verified against exact model, software, circuit, manufacturer instructions, and local policy.'
    };
    $('modeHelp').textContent = help[mode] || '';
    qa('input,select', $('settingsFields')).forEach((el) => el.addEventListener('input', recalc));
    recalc();
  }

  function updateHighPressureFields() {
    const method = val('highPressureMethod');
    qa('.hp-blended').forEach((el) => el.classList.toggle('hidden', method === 'direct'));
    qa('.hp-direct').forEach((el) => el.classList.toggle('hidden', method !== 'direct'));
  }

  function consumptionForSelectedMode() {
    const mode = selectedMode();
    if (mode === 'CONVENTIONAL') return C.calculateConventionalConsumption({ enteredFlowLpm: val('oxygenFlowLpm') });
    if (mode === 'BIPAP_LOW_PRESSURE') return C.calculateBipapLowPressureConsumption({ oxygenBleedInFlowLpm: val('oxygenBleedInFlowLpm') });
    if (mode === 'BIPAP_HIGH_PRESSURE') {
      return val('highPressureMethod') === 'direct'
        ? C.calculateKnownOxygenDrawConsumption({ knownOxygenDrawLpm: val('knownOxygenDrawLpm') })
        : C.calculateBlendedOxygenConsumption({ fio2: val('fio2'), totalBlendedFlowLpm: val('totalBlendedFlowLpm'), ambientOxygenFraction: config.ambientOxygenFraction, sourceOxygenFraction: config.sourceOxygenFraction });
    }
    if (mode === 'HFNC') return C.calculateHfncConsumption({ fio2: val('fio2'), totalFlowLpm: val('hfncTotalFlowLpm'), ambientOxygenFraction: config.ambientOxygenFraction, sourceOxygenFraction: config.sourceOxygenFraction });
    return C.calculateVentilatorConsumption({ minuteVentilation: val('minuteVentilation'), minuteVentilationUnit: val('minuteVentilationUnit') || 'L/min', fio2: val('fio2'), biasFlowLpm: config.deliveryModes[mode]?.biasFlowLpm });
  }

  function recalc() {
    if (!config) return;
    savePrefs();
    renderActiveSourceOptions();
    const source = oxygenSources.find((s) => s.id === val('activeSourceId')) || activeSources()[0];
    const hasValidSource = hasAtLeastOneValidSource();
    if (!hasValidSource) {
      setProgressiveVisibility(false, false);
      $('quickResult').textContent = 'Enter valid On Board O₂ or Portable O₂ information to continue.';
      $('formulaDetails').textContent = 'Calculation details appear after valid inputs are entered.';
      quick = null;
      updateSummary();
      return;
    }
    setProgressiveVisibility(true, false);
    const src = source ? sourceCalc(source) : { ok: false, errors: ['No active oxygen source is selected.'], warnings: [] };
    const cons = consumptionForSelectedMode();
    const errors = [...(src.errors || []), ...(cons.errors || [])];
    const highPressureWarning = selectedMode() === 'BIPAP_HIGH_PRESSURE' ? 'High-pressure NIV oxygen use can vary with device design, circuit type, intentional exhalation flow, mask leak, pressure settings, triggering, and leak compensation. IPAP and EPAP alone are not sufficient to calculate oxygen consumption.' : '';
    setWarn('modeWarning', [...(cons.warnings || []), highPressureWarning]);
    if (errors.length) {
      $('quickResult').textContent = errors.join(' ');
      $('formulaDetails').textContent = 'Calculation unavailable until valid inputs are entered.';
      quick = null;
      setProgressiveVisibility(true, false);
      updateSummary();
      renderPlanner();
      return;
    }
    const dur = cons.durationNotApplicable ? { ok: true, displayedDurationMinutes: null, rawDurationMinutes: null, hours: 0, remainingMinutes: 0 } : C.calculateDuration({ availableLiters: src.usableLiters, consumptionLpm: cons.oxygenConsumptionLpm });
    if (!dur.ok) { $('quickResult').textContent = dur.errors.join(' '); return; }
    quick = { source, sourceLabel: labelForSource(source), src, cons, dur, mode: selectedMode(), deliveryDeviceCategory: checkedValue('deliveryDeviceCategory') };
    setProgressiveVisibility(true, true);
    renderQuick();
    renderPlanner();
    updateSummary();
  }

  function renderQuick() {
    const root = $('quickResult');
    root.innerHTML = '';
    if (quick.cons.durationNotApplicable) root.append(text('div', 'No supplemental oxygen draw is calculated at the entered FiO₂/flow values.', 'oxygen-big-result'));
    else root.append(text('div', `Estimated oxygen available ${quick.dur.displayedDurationMinutes} minutes`, 'oxygen-big-result'));
    const grid = document.createElement('div');
    grid.className = 'oxygen-result-grid';
    [['Selected source', quick.sourceLabel], ['Usable oxygen', `${fmt(quick.src.usableLiters)} L`], ['Estimated oxygen consumption', `${fmt(quick.cons.oxygenConsumptionLpm, 3)} L/min`], ['Approximate duration', quick.cons.durationNotApplicable ? 'Not applicable' : `${quick.dur.hours} hr ${quick.dur.remainingMinutes} min`]].forEach(([label, value]) => {
      const cell = document.createElement('div');
      cell.append(text('strong', label));
      cell.append(text('p', value));
      grid.append(cell);
    });
    root.append(grid);
    if (quick.cons.oxygenSourceFlowLpm !== undefined) root.append(text('p', `Estimated oxygen-source flow: ${fmt(quick.cons.oxygenSourceFlowLpm, 3)} L/min • Estimated ambient-air contribution: ${fmt(quick.cons.ambientAirFlowLpm, 3)} L/min`));
    $('formulaDetails').textContent = formulaText();
  }

  function formulaText() {
    const lines = [];
    const cylinder = config.cylinders[quick.source.type];
    lines.push(`O₂ delivery device category: ${quick.deliveryDeviceCategory === 'VENTILATOR' ? 'Ventilator' : 'Wall / Portable Low PSI'}`);
    lines.push(`Device/delivery mode: ${config.deliveryModes[quick.mode].label}`);
    lines.push(`Oxygen source: ${quick.sourceLabel} (${cylinder.label === 'H' ? 'H-Tank' : cylinder.label})`);
    if (quick.src.sourceType === 'compressed') {
      lines.push(`Usable pressure\n${fmt(quick.src.currentPressurePsi, 0)} PSI − ${fmt(quick.src.reservePsi, 0)} PSI\n= ${fmt(quick.src.usablePressurePsi, 0)} PSI`);
      lines.push(`Usable oxygen\n${fmt(quick.src.usablePressurePsi, 0)} PSI × ${quick.src.cylinderFactor} L/PSI\n= ${fmt(quick.src.usableLiters)} L`);
    } else {
      lines.push(`Usable oxygen\n${quick.src.loxReading} × ${quick.src.loxFactor}\n= ${fmt(quick.src.usableLiters)} L`);
    }
    if (quick.cons.fio2Input) lines.push(`Entered FiO₂: ${quick.cons.fio2Input.originalInput}\nInterpreted as: ${quick.cons.fio2Input.interpretedAs}; FiO₂ ${f2(quick.cons.fio2)}`);
    if (quick.cons.method === 'blended-flow-estimate') lines.push(`Estimated oxygen-source flow\n${fmt(quick.cons.totalBlendedFlowLpm)} × ((${f2(quick.cons.fio2)} − ${f2(quick.cons.ambientOxygenFraction)}) ÷ (${f2(quick.cons.sourceOxygenFraction)} − ${f2(quick.cons.ambientOxygenFraction)}))\n= ${fmt(quick.cons.oxygenSourceFlowLpm, 3)} L/min\n\nEstimated ambient-air contribution\n${fmt(quick.cons.totalBlendedFlowLpm)} − ${fmt(quick.cons.oxygenSourceFlowLpm, 3)}\n= ${fmt(quick.cons.ambientAirFlowLpm, 3)} L/min`);
    else if (quick.cons.patientOxygenConsumptionLpm !== undefined) lines.push(`Patient oxygen consumption\n${fmt(quick.cons.minuteVentilation.minuteVentilationMlPerMin, 0)} mL/min × ${f2(quick.cons.fio2)} ÷ 1,000\n= ${fmt(quick.cons.patientOxygenConsumptionLpm, 2)} L/min\n\nConfigured bias flow\n${fmt(quick.cons.biasFlowLpm, 1)} L/min\n\nTotal oxygen consumption\n${fmt(quick.cons.patientOxygenConsumptionLpm, 2)} + ${fmt(quick.cons.biasFlowLpm, 1)}\n= ${fmt(quick.cons.totalOxygenConsumptionLpm, 2)} L/min`);
    else lines.push(`Oxygen consumption\n= ${fmt(quick.cons.oxygenConsumptionLpm, 3)} L/min`);
    if (!quick.cons.durationNotApplicable) lines.push(`Raw duration\n${fmt(quick.src.usableLiters)} ÷ ${fmt(quick.cons.oxygenConsumptionLpm, 3)}\n= ${fmt(quick.dur.rawDurationMinutes, 2)} minutes\n\nConservative displayed duration\n${quick.dur.displayedDurationMinutes} minutes`);
    lines.push(`Risk thresholds: medium ${config.riskThresholds.medium * 100}%, high ${config.riskThresholds.high * 100}%`);
    lines.push(`Calculator version ${config.calculatorVersion}; reviewed ${config.reviewedDate}`);
    return lines.join('\n\n');
  }

  function buildPhaseCard(phase, index) {
    const card = document.createElement('article');
    card.className = 'planner-card';
    card.innerHTML = `<h4>Phase ${index + 1}</h4><div class="oxygen-grid three-col"><label class="oxygen-field">Phase name<input data-phase-field="name" data-phase-id="${phase.id}" value="${esc(phase.name)}"></label><label class="oxygen-field">Duration (minutes)<input data-phase-field="duration" data-phase-id="${phase.id}" type="number" inputmode="decimal" value="${esc(phase.duration || '')}"></label><label class="oxygen-field">Phase context<select data-phase-field="context" data-phase-id="${phase.id}"></select></label><label class="oxygen-field">Primary oxygen source<select data-phase-field="sourceId" data-phase-id="${phase.id}"><option value="">No source assigned</option></select></label></div><div class="oxygen-actions"><button class="btn btn-outline" type="button" data-up-phase="${phase.id}">Move up</button><button class="btn btn-outline" type="button" data-down-phase="${phase.id}">Move down</button><button class="btn btn-outline danger" type="button" data-remove-phase="${phase.id}">Remove phase</button></div>`;
    const contextSelect = q('[data-phase-field="context"]', card);
    phaseContexts.forEach(([key, label]) => contextSelect.append(option(key, label)));
    contextSelect.value = phase.context;
    const sourceSelect = q('[data-phase-field="sourceId"]', card);
    activeSources().forEach((source) => sourceSelect.append(option(source.id, labelForSource(source))));
    sourceSelect.value = phase.sourceId || '';
    return card;
  }

  function renderPlanner() {
    if (!config) return;
    $('plannerPhases').innerHTML = '';
    plannerPhases.forEach((phase, index) => $('plannerPhases').append(buildPhaseCard(phase, index)));
    qa('[data-phase-field]').forEach((el) => el.addEventListener('input', updatePhaseFromField));
    syncPlanner(false);
  }

  function updatePhaseFromField(event) {
    const phase = plannerPhases.find((p) => p.id === event.target.dataset.phaseId);
    if (!phase) return;
    phase[event.target.dataset.phaseField] = event.target.value;
    syncPlanner(false);
  }

  function syncPlanner() {
    const summary = $('plannerSummary');
    if (!quick) { summary.textContent = 'Enter valid oxygen source and device settings before planning phases.'; return; }
    const sourceResults = activeSources().map((source) => ({ ...source, name: labelForSource(source), usableLiters: sourceCalc(source).usableLiters || 0 }));
    const phases = plannerPhases.map((phase) => ({ id: phase.id, name: phase.name, context: phase.context, sourceId: phase.sourceId, durationMinutes: phase.duration, consumptionLpm: quick.cons.oxygenConsumptionLpm || 0 }));
    const plan = C.calculateSequentialPlan({ sources: sourceResults, phases, thresholds: config.riskThresholds });
    if (!plan.ok) { summary.className = 'risk-card'; summary.textContent = plan.errors.join(' '); updateSummary(); return; }
    const risk = plan.risk;
    summary.className = `risk-card risk-${risk.level}${risk.insufficient ? ' risk-insufficient' : ''}`;
    summary.textContent = `${risk.insufficient ? '⛔ INSUFFICIENT OXYGEN' : risk.level === 'low' ? '🟢 LOW' : risk.level === 'medium' ? '🟡 MEDIUM' : '🔴 HIGH'} — ${fmt(risk.percentUsed, 1)}% of the limiting oxygen source is expected to be used. Total planned time: ${fmt(plan.totalPlannedMinutes, 0)} min. Total oxygen required: ${fmt(plan.totalOxygenRequiredLiters)} L. Limiting source: ${sourceResults.find((s) => s.id === risk.limitingSourceId)?.name || '—'}. Warnings: ${plan.warnings.join(' ') || 'None.'}`;
    setWarn('insufficientAlert', plan.firstInsufficient ? `The assigned source is estimated to be depleted during ${plan.firstInsufficient.name}. Estimated shortage: ${fmt(plan.firstInsufficient.shortageLiters)} L or approximately ${fmt(plan.firstInsufficient.shortageMinutes)} minutes at the configured rate.` : '');
    updateSummary(plan);
  }

  function updateSummary(plan) {
    const category = checkedValue('deliveryDeviceCategory') === 'VENTILATOR' ? 'Ventilator' : 'Wall / Portable Low PSI';
    $('copySummary').value = `ACT Oxygen Availability Estimate\n\nO₂ delivery device:\n${category}\n\nDevice / delivery mode:\n${quick ? config.deliveryModes[quick.mode].label : 'Incomplete'}\n\nOxygen source:\n${quick ? quick.sourceLabel : 'Incomplete'}\n\nReserve pressure:\n${config?.reservePsi || ''} PSI\n\nUsable oxygen:\n${quick ? fmt(quick.src.usableLiters) : 'Incomplete'} L\n\nEstimated oxygen consumption:\n${quick ? fmt(quick.cons.oxygenConsumptionLpm, 3) : 'Incomplete'} L/min\n\nEstimated oxygen duration:\n${quick?.dur?.displayedDurationMinutes ?? 'Not applicable'} minutes\n\nConfigured risk:\n${plan?.risk?.level || 'Not configured'}\n\nCalculator version:\n${config?.calculatorVersion || ''}\n\nConfiguration reviewed:\n${config?.reviewedDate || ''}\n\nCalculation aid only. Verify actual equipment performance, device configuration, backup oxygen, anticipated delays, and local policy.`;
  }

  function getPresets() { return loadJson(presetKey, []); }
  function setPresets(presets) { saveJson(presetKey, presets); renderPresets(); }
  function renderPresets() { const select = $('presetSelect'); select.innerHTML = ''; getPresets().forEach((preset, index) => select.append(option(String(index), preset.name))); }

  function initState() {
    const prefs = loadJson(storageKey, {});
    oxygenSources = Array.isArray(prefs.oxygenSources) && prefs.oxygenSources.length ? prefs.oxygenSources.map((source) => ({ pressure: '', lox: '', kevlar: '', context: source.group === 'onboard' ? 'continuous' : 'portable', ...source })) : defaultSources();
    plannerPhases = defaultPhases.map((name, index) => ({ id: `p${index + 1}`, name, context: phaseContexts[Math.min(index, phaseContexts.length - 1)][0], sourceId: 'portable1', duration: '' }));
    if (prefs.deliveryDeviceCategory) {
      const radio = q(`input[name="deliveryDeviceCategory"][value="${prefs.deliveryDeviceCategory}"]`);
      if (radio) radio.checked = true;
    }
  }

  async function init() {
    try {
      config = await fetch('/static/data/oxygen-calculator-config.json').then((response) => response.json());
      const valid = C.validateConfig(config);
      if (!valid.ok) throw new Error(valid.errors.join(' '));
    } catch (error) {
      console.error('Oxygen calculator configuration error');
      $('configError').textContent = 'Configuration error: calculations are disabled until the versioned configuration is available and valid.';
      $('configError').classList.remove('hidden');
      return;
    }
    initState();
    $('configInfo').textContent = `Calculator version ${config.calculatorVersion}. Configuration reviewed July 11, 2026.`;
    renderSources();
    renderDeliveryModes();
    renderPresets();
    renderPlanner();
  }

  document.addEventListener('input', (event) => {
    if (event.target.name === 'deliveryDeviceCategory') { renderDeliveryModes(); return; }
    if (event.target.id === 'deliveryMode') { setHidden('bipapSupplyWrap', !['BIPAP_LOW_PRESSURE', 'BIPAP_HIGH_PRESSURE'].includes(event.target.value)); renderSettings(); return; }
    if (event.target.name === 'bipapSupplyMethod') { $('deliveryMode').value = event.target.value; renderSettings(); return; }
    if (event.target.id === 'activeSourceId') { recalc(); return; }
    if (event.target.closest('#settingsFields')) return;
  });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'highPressureMethod') { updateHighPressureFields(); recalc(); }
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addOnBoardSourceBtn') { oxygenSources.push({ id: `onboard${Date.now()}`, group: 'onboard', type: 'H', pressure: '', lox: '', kevlar: '', context: 'continuous' }); renderSources(); recalc(); }
    if (button.id === 'addPortableSourceBtn') { oxygenSources.push({ id: `portable${Date.now()}`, group: 'portable', type: 'D', pressure: '', lox: '', kevlar: '', context: 'portable' }); renderSources(); recalc(); }
    if (button.dataset.removeSource) { oxygenSources = oxygenSources.filter((source) => source.id !== button.dataset.removeSource); renderSources(); recalc(); }
    if (button.dataset.addPhase !== undefined) { plannerPhases.push({ id: `p${Date.now()}`, name: `Phase ${plannerPhases.length + 1}`, context: 'custom', sourceId: activeSources()[0]?.id || '', duration: '' }); renderPlanner(); }
    if (button.dataset.removePhase) { plannerPhases = plannerPhases.filter((phase) => phase.id !== button.dataset.removePhase); renderPlanner(); }
    if (button.dataset.upPhase || button.dataset.downPhase) { const id = button.dataset.upPhase || button.dataset.downPhase; const i = plannerPhases.findIndex((phase) => phase.id === id); const j = button.dataset.upPhase ? i - 1 : i + 1; if (j >= 0 && j < plannerPhases.length) { [plannerPhases[i], plannerPhases[j]] = [plannerPhases[j], plannerPhases[i]]; renderPlanner(); } }
    if (button.id === 'copySummaryBtn') { await navigator.clipboard.writeText($('copySummary').value); $('copyStatus').textContent = 'Summary copied.'; }
    if (button.id === 'clearCalculatorBtn') { qa('input').forEach((input) => { if (!input.readOnly && input.type !== 'radio' && input.type !== 'checkbox') input.value = ''; }); oxygenSources = defaultSources(); renderSources(); recalc(); }
    if (button.id === 'eraseSavedBtn') { localStorage.removeItem(storageKey); localStorage.removeItem(presetKey); renderPresets(); $('copyStatus').textContent = 'Saved equipment settings erased.'; }
    if (button.id === 'copyToPlannerBtn') { renderPlanner(); $('copyStatus').textContent = 'Available oxygen sources copied to planner.'; }
    if (button.id === 'savePresetBtn') { const presets = getPresets(); presets.push({ name: val('presetName') || 'Anonymous equipment preset', deliveryDeviceCategory: checkedValue('deliveryDeviceCategory'), deliveryMode: val('deliveryMode'), sourceTypes: oxygenSources.map((source) => ({ id: source.id, group: source.group, type: source.type, kevlar: source.kevlar })) }); setPresets(presets); }
    if (button.id === 'loadPresetBtn') { const preset = getPresets()[Number(val('presetSelect'))]; if (preset) { const radio = q(`input[name="deliveryDeviceCategory"][value="${preset.deliveryDeviceCategory}"]`); if (radio) radio.checked = true; oxygenSources = oxygenSources.map((source) => ({ ...source, ...(preset.sourceTypes?.find((saved) => saved.id === source.id) || {}) })); renderSources(); renderDeliveryModes(); } }
    if (button.id === 'deletePresetBtn') { const presets = getPresets(); presets.splice(Number(val('presetSelect')), 1); setPresets(presets); }
    if (button.id === 'renamePresetBtn') { const presets = getPresets(); const preset = presets[Number(val('presetSelect'))]; if (preset) { preset.name = val('presetName') || preset.name; setPresets(presets); } }
    if (button.id === 'loadLastSetupBtn') { initState(); renderSources(); renderDeliveryModes(); renderPlanner(); }
  });

  init();
})();
