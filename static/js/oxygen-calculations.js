const OxygenCalculations = (() => {
  const ok = (data, warnings = []) => ({ ok: true, errors: [], warnings, ...data });
  const fail = (errors, data = {}) => ({ ok: false, errors: Array.isArray(errors) ? errors : [errors], warnings: [], ...data });
  const finite = (v) => Number.isFinite(v);
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return finite(n) ? n : null;
  };
  const positive = (v) => finite(v) && v > 0;

  function validateConfig(config) {
    const errors = [];
    if (!config || typeof config !== 'object') errors.push('Configuration is missing.');
    if (!config?.schemaVersion) errors.push('Configuration schema version is missing.');
    if (!config?.calculatorVersion) errors.push('Calculator version is missing.');
    if (!config?.reviewedDate) errors.push('Configuration review date is missing.');
    ['ambientOxygenFraction', 'sourceOxygenFraction', 'reservePsi', 'loxFactor'].forEach((key) => {
      if (!finite(config?.[key])) errors.push(`${key} is invalid.`);
    });
    if (finite(config?.ambientOxygenFraction) && finite(config?.sourceOxygenFraction) && config.sourceOxygenFraction <= config.ambientOxygenFraction) errors.push('Source oxygen fraction must exceed ambient oxygen fraction.');
    Object.entries(config?.cylinders || {}).forEach(([key, c]) => {
      if (!c.label || !c.type) errors.push(`Cylinder ${key} is incomplete.`);
      if (!c.requiresUserFactor && c.type === 'compressed' && !positive(c.factor)) errors.push(`Cylinder ${key} factor is invalid.`);
      if (c.isLiquidOxygen && !positive(c.factor)) errors.push(`LOX factor is invalid.`);
    });
    Object.entries(config?.deliveryModes || {}).forEach(([key, mode]) => {
      if (!mode.label) errors.push(`Delivery mode ${key} missing label.`);
      if (key.match(/HAMILTON|REVEL|LTV/) && !positive(mode.biasFlowLpm)) errors.push(`${key} missing bias flow.`);
    });
    if (!positive(config?.riskThresholds?.medium) || !positive(config?.riskThresholds?.high) || config.riskThresholds.medium >= config.riskThresholds.high) errors.push('Risk thresholds are invalid.');
    return errors.length ? fail(errors) : ok({ config });
  }

  function normalizeFio2(input) {
    const originalInput = input == null ? '' : String(input).trim();
    if (!originalInput) return fail('FiO₂ is incomplete.', { incomplete: true, originalInput });
    const hasPercent = originalInput.endsWith('%');
    const raw = num(hasPercent ? originalInput.slice(0, -1) : originalInput);
    if (raw === null) return fail('Invalid FiO₂ syntax.', { originalInput });
    let normalizedFio2, interpretedAs;
    if (hasPercent || raw > 1) { normalizedFio2 = raw / 100; interpretedAs = 'percentage'; }
    else { normalizedFio2 = raw; interpretedAs = 'fraction'; }
    if (normalizedFio2 < 0.21) return fail('FiO₂ below 0.21 is invalid.', { originalInput, normalizedFio2, interpretedAs });
    if (normalizedFio2 > 1) return fail('FiO₂ above 1.0 is invalid.', { originalInput, normalizedFio2, interpretedAs });
    return ok({ originalInput, normalizedFio2, fio2: normalizedFio2, interpretedAs });
  }

  function normalizeMinuteVentilation(input, unit) {
    const value = num(input);
    if (value === null) return fail('Minute ventilation is missing.', { incomplete: true });
    if (value <= 0) return fail('Minute ventilation must be positive.');
    if (!['L/min', 'mL/min'].includes(unit)) return fail('Minute ventilation unit is invalid.');
    const minuteVentilationMlPerMin = unit === 'L/min' ? value * 1000 : value;
    const warnings = unit === 'mL/min' && value > 0 && value < 100 ? ['This value is unusually low for mL/min. Did you mean L/min or thousands of mL/min?'] : [];
    return ok({ originalValue: value, originalUnit: unit, minuteVentilationMlPerMin }, warnings);
  }

  function calculateCompressedCylinder({ currentPressurePsi, reservePsi, cylinderFactor }) {
    const pressure = num(currentPressurePsi), reserve = num(reservePsi), factor = num(cylinderFactor);
    if (pressure === null) return fail('Missing pressure.');
    if (pressure < 0) return fail('Pressure cannot be negative.');
    if (!positive(reserve)) return fail('Reserve pressure is invalid.');
    if (!positive(factor)) return fail('Cylinder factor is required and must be positive.');
    const usablePressurePsi = Math.max(pressure - reserve, 0);
    const usableLiters = usablePressurePsi * factor;
    const warnings = pressure <= reserve ? ['Pressure is at or below reserve; usable oxygen is zero.'] : [];
    return ok({ sourceType: 'compressed', currentPressurePsi: pressure, reservePsi: reserve, usablePressurePsi, cylinderFactor: factor, usableLiters }, warnings);
  }

  function calculateLox({ loxReading, loxFactor }) {
    const reading = num(loxReading), factor = num(loxFactor);
    if (reading === null) return fail('Missing LOX quantity reading.');
    if (reading < 0) return fail('LOX quantity cannot be negative.');
    if (!positive(factor)) return fail('LOX factor is invalid.');
    return ok({ sourceType: 'liquid', loxReading: reading, loxFactor: factor, usableLiters: reading * factor });
  }

  function calculateDuration({ availableLiters, consumptionLpm }) {
    const available = num(availableLiters), consumption = num(consumptionLpm);
    if (available === null || available < 0) return fail('Available oxygen volume is invalid.');
    if (consumption === null || consumption <= 0) return fail('Oxygen consumption must be positive.');
    const rawDurationMinutes = available / consumption;
    if (!finite(rawDurationMinutes)) return fail('Duration calculation produced a non-finite value.');
    const displayedDurationMinutes = Math.max(Math.floor(rawDurationMinutes), 0);
    return ok({ availableLiters: available, consumptionLpm: consumption, rawDurationMinutes, displayedDurationMinutes, hours: Math.floor(displayedDurationMinutes / 60), remainingMinutes: displayedDurationMinutes % 60 });
  }

  const consumption = (name, value) => { const v = num(value); return v === null ? fail(`Missing ${name}.`) : v <= 0 ? fail(`${name} must be positive.`) : ok({ oxygenConsumptionLpm: v }); };
  const calculateConventionalConsumption = ({ enteredFlowLpm }) => consumption('conventional oxygen flow', enteredFlowLpm);
  const calculateBipapLowPressureConsumption = ({ oxygenBleedInFlowLpm }) => consumption('BiPAP bleed-in flow', oxygenBleedInFlowLpm);
  const calculateKnownOxygenDrawConsumption = ({ knownOxygenDrawLpm }) => consumption('known oxygen draw', knownOxygenDrawLpm);

  function calculateBlendedOxygenConsumption({ fio2, totalBlendedFlowLpm, ambientOxygenFraction, sourceOxygenFraction }) {
    const flow = num(totalBlendedFlowLpm), amb = num(ambientOxygenFraction), src = num(sourceOxygenFraction);
    const f = typeof fio2 === 'string' ? normalizeFio2(fio2) : ok({ fio2: num(fio2), normalizedFio2: num(fio2), originalInput: String(fio2), interpretedAs: num(fio2) > 1 ? 'percentage' : 'fraction' });
    if (!f.ok) return f;
    if (flow === null) return fail('Missing total blended device flow.');
    if (flow <= 0) return fail('Total blended device flow must be positive.');
    if (!finite(amb) || !finite(src) || src <= amb) return fail('Invalid oxygen fraction configuration.');
    const oxygenSourceFlowLpm = flow * ((f.normalizedFio2 - amb) / (src - amb));
    const ambientAirFlowLpm = flow - oxygenSourceFlowLpm;
    if (oxygenSourceFlowLpm < 0 || !finite(oxygenSourceFlowLpm)) return fail('Oxygen-source flow calculation is invalid.');
    return ok({ method: 'blended-flow-estimate', fio2: f.normalizedFio2, fio2Input: f, totalBlendedFlowLpm: flow, ambientOxygenFraction: amb, sourceOxygenFraction: src, oxygenSourceFlowLpm, oxygenConsumptionLpm: oxygenSourceFlowLpm, ambientAirFlowLpm, durationNotApplicable: oxygenSourceFlowLpm === 0 });
  }
  const calculateHfncConsumption = ({ fio2, totalFlowLpm, ambientOxygenFraction, sourceOxygenFraction }) => calculateBlendedOxygenConsumption({ fio2, totalBlendedFlowLpm: totalFlowLpm, ambientOxygenFraction, sourceOxygenFraction });

  function calculateVentilatorConsumption({ minuteVentilation, minuteVentilationUnit, fio2, biasFlowLpm }) {
    const mv = normalizeMinuteVentilation(minuteVentilation, minuteVentilationUnit);
    const f = normalizeFio2(fio2);
    const bias = num(biasFlowLpm);
    const errors = [...(mv.errors || []), ...(f.errors || [])];
    if (!positive(bias)) errors.push('Bias flow is invalid.');
    if (errors.length) return fail(errors);
    const patientOxygenConsumptionLpm = (mv.minuteVentilationMlPerMin * f.normalizedFio2) / 1000;
    const totalOxygenConsumptionLpm = patientOxygenConsumptionLpm + bias;
    return ok({ minuteVentilation: mv, fio2Input: f, fio2: f.normalizedFio2, biasFlowLpm: bias, patientOxygenConsumptionLpm, totalOxygenConsumptionLpm, oxygenConsumptionLpm: totalOxygenConsumptionLpm }, mv.warnings);
  }

  function calculateRisk({ plannedMinutes, displayedAvailableMinutes, usedLiters, startingLiters, remainingLiters, thresholds, insufficient = false, limitingSourceId = null, limitingPhaseId = null }) {
    let ratio = null;
    if (finite(num(usedLiters)) && positive(num(startingLiters))) ratio = num(usedLiters) / num(startingLiters);
    else if (finite(num(plannedMinutes)) && positive(num(displayedAvailableMinutes))) ratio = num(plannedMinutes) / num(displayedAvailableMinutes);
    else return fail('Risk inputs are incomplete.');
    const medium = thresholds?.medium ?? 0.8, high = thresholds?.high ?? 0.9;
    const level = insufficient || ratio >= high ? 'high' : ratio >= medium ? 'medium' : 'low';
    return ok({ level, ratio, percentUsed: ratio * 100, remainingLiters: Math.max(num(remainingLiters) || 0, 0), limitingSourceId, limitingPhaseId, insufficient: !!insufficient });
  }

  function validateSourceContext(sourceContext, phaseContext) {
    if (!sourceContext || !phaseContext || sourceContext === 'continuous' || sourceContext === 'custom') return [];
    if (sourceContext === 'aircraft' && !['air', 'loading', 'unloading'].includes(phaseContext)) return ['Aircraft-only source assigned outside an aircraft/loading phase.'];
    if (sourceContext === 'ground' && phaseContext === 'air') return ['Ground-vehicle source assigned to air transport.'];
    if (sourceContext === 'destination' && phaseContext !== 'destination') return ['Destination-only source assigned before destination arrival.'];
    return [];
  }

  function calculateSequentialPlan({ sources, phases, thresholds }) {
    if (!Array.isArray(sources) || !sources.length) return fail('Empty source list.');
    if (!Array.isArray(phases) || !phases.length) return fail('Empty phase list.');
    const remaining = {}; const used = {}; const sourceMap = {};
    sources.forEach((s) => { remaining[s.id] = Math.max(num(s.usableLiters) || 0, 0); used[s.id] = 0; sourceMap[s.id] = s; });
    const phaseResults = []; let firstInsufficient = null; const warnings = [];
    for (const phase of phases) {
      const duration = num(phase.durationMinutes), rate = num(phase.consumptionLpm);
      if (!phase.sourceId) return fail('No oxygen source assigned.');
      if (!positive(duration)) return fail('Phase without duration or zero-duration phase.');
      if (!positive(rate)) return fail('Phase consumption is invalid.');
      const src = sourceMap[phase.sourceId]; if (!src) return fail('Assigned oxygen source does not exist.');
      warnings.push(...validateSourceContext(src.context, phase.context));
      if (remaining[src.id] <= 0) warnings.push('Phase uses a source already depleted in an earlier phase.');
      const startingLiters = remaining[src.id];
      const phaseOxygenNeededLiters = duration * rate;
      const sufficient = startingLiters >= phaseOxygenNeededLiters;
      const shortageLiters = sufficient ? 0 : phaseOxygenNeededLiters - startingLiters;
      const shortageMinutes = sufficient ? 0 : shortageLiters / rate;
      const endingLiters = Math.max(startingLiters - phaseOxygenNeededLiters, 0);
      used[src.id] += Math.min(phaseOxygenNeededLiters, startingLiters);
      remaining[src.id] = endingLiters;
      const result = { ...phase, startingLiters, phaseOxygenNeededLiters, sufficient, shortageLiters, shortageMinutes, endingLiters };
      if (!sufficient && !firstInsufficient) firstInsufficient = result;
      phaseResults.push(result);
    }
    let limitingSourceId = null, maxRatio = -1;
    sources.forEach((s) => { const ratio = positive(s.usableLiters) ? used[s.id] / s.usableLiters : 1; if (ratio > maxRatio) { maxRatio = ratio; limitingSourceId = s.id; } });
    const risk = calculateRisk({ usedLiters: used[limitingSourceId], startingLiters: sourceMap[limitingSourceId]?.usableLiters, remainingLiters: remaining[limitingSourceId], thresholds, insufficient: !!firstInsufficient, limitingSourceId, limitingPhaseId: firstInsufficient?.id || null });
    return ok({ phaseResults, sourceEndingLiters: remaining, sourceUsedLiters: used, totalPlannedMinutes: phases.reduce((a, p) => a + (num(p.durationMinutes) || 0), 0), totalOxygenRequiredLiters: phases.reduce((a, p) => a + ((num(p.durationMinutes) || 0) * (num(p.consumptionLpm) || 0)), 0), risk: risk.ok ? risk : null, firstInsufficient }, warnings);
  }

  return { normalizeFio2, normalizeMinuteVentilation, calculateCompressedCylinder, calculateLox, calculateConventionalConsumption, calculateBipapLowPressureConsumption, calculateKnownOxygenDrawConsumption, calculateBlendedOxygenConsumption, calculateHfncConsumption, calculateVentilatorConsumption, calculateDuration, calculateRisk, calculateSequentialPlan, validateSourceContext, validateConfig };
})();
if (typeof window !== 'undefined') window.OxygenCalculations = OxygenCalculations;
if (typeof module !== 'undefined' && module.exports) module.exports = OxygenCalculations;
