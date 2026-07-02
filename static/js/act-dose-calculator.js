(() => {
  const LB_PER_KG = 2.20462;
  const $ = (id) => document.getElementById(id);
  const fields = Array.from(document.querySelectorAll('input, select'));
  const DEPENDENT_WEIGHT_IDS = ['singleWeight', 'infWeight', 'revWeight'];
  let activeWeightField = null;
  let lastSyncedWeightValue = '';

  function n(id) {
    const value = Number.parseFloat($(id)?.value || '');
    return Number.isFinite(value) ? value : null;
  }
  function fmt(value, max = 3) {
    if (!Number.isFinite(value)) return '';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 }).format(Math.abs(value) < 1e-9 ? 0 : value);
  }
  function unitBase(unit) { return (unit || '').split('/')[0]; }
  function invalid(values) { return values.some((value) => value !== null && value < 0); }
  function showWarning(id, messages) {
    const el = $(id);
    if (!el) return;
    const list = messages.filter(Boolean);
    el.textContent = list.join(' ');
    el.classList.toggle('hidden', !list.length);
  }
  function setText(id, text) { const el = $(id); if (el) el.textContent = text; }
  function sameBase(doseUnit, concentrationUnit) { return unitBase(doseUnit) === unitBase(concentrationUnit); }
  function positive(value) { return value !== null && value > 0; }

  function weightKgFromConverter() {
    const kg = n('weightKg');
    const lb = n('weightLb');
    if (positive(kg)) return kg;
    if (positive(lb)) return lb / LB_PER_KG;
    return null;
  }
  function syncWeightDependents() {
    const kg = weightKgFromConverter();
    if (!kg) return;
    const syncedValue = fmt(kg, 1);
    DEPENDENT_WEIGHT_IDS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      const wasAutoSynced = el.dataset.autoWeight === 'true';
      const matchesPreviousAutoValue = Boolean(lastSyncedWeightValue) && el.value === lastSyncedWeightValue;
      if (!el.value || wasAutoSynced || matchesPreviousAutoValue) {
        el.value = syncedValue;
        el.dataset.autoWeight = 'true';
      }
    });
    lastSyncedWeightValue = syncedValue;
  }

  function calculateWeight() {
    const lbEl = $('weightLb');
    const kgEl = $('weightKg');
    const lb = n('weightLb');
    const kg = n('weightKg');
    if (lb === null && kg === null) { setText('weightResult', 'Enter lb or kg to convert both values.'); return; }
    if ((lb !== null && lb <= 0) || (kg !== null && kg <= 0)) { setText('weightResult', 'Enter positive weight values only.'); return; }

    if (activeWeightField === 'weightLb' && positive(lb)) {
      kgEl.value = fmt(lb / LB_PER_KG, 1);
    } else if (activeWeightField === 'weightKg' && positive(kg)) {
      lbEl.value = fmt(kg * LB_PER_KG, 1);
    } else if (positive(lb) && kg === null) {
      kgEl.value = fmt(lb / LB_PER_KG, 1);
    } else if (positive(kg) && lb === null) {
      lbEl.value = fmt(kg * LB_PER_KG, 1);
    }

    const finalKg = n('weightKg');
    const finalLb = n('weightLb');
    if (positive(finalKg) && positive(finalLb)) {
      setText('weightResult', `Weight in lb: ${fmt(finalLb, 1)} lb • Weight in kg: ${fmt(finalKg, 1)} kg`);
      syncWeightDependents();
    }
  }

  function calculateSingleDose() {
    const weight = n('singleWeight'), dose = n('singleDose'), max = n('singleMax'), conc = n('singleConc');
    const doseUnit = $('singleDoseUnit').value;
    const concUnit = $('singleConcUnit').value;
    const base = unitBase(doseUnit);
    if ([weight, dose, max, conc].every((value) => value === null)) {
      showWarning('singleWarning', []);
      setText('singleResult', 'Enter weight and dose to calculate.');
      setText('singleFormula', 'dose = weight_kg × dose_per_kg');
      return;
    }
    const warnings = [];
    if (invalid([weight, dose, max, conc])) warnings.push('Use positive values only.');
    if (!positive(weight)) warnings.push('Missing weight in kg.');
    if (!positive(dose)) warnings.push('Missing dose amount.');
    if (conc !== null && conc === 0) warnings.push('Concentration cannot be zero.');
    if (conc !== null && conc > 0 && !sameBase(doseUnit, concUnit)) warnings.push('Dose and concentration units must match.');
    if (warnings.length || !positive(weight) || !positive(dose)) {
      showWarning('singleWarning', warnings);
      setText('singleResult', 'Enter valid weight and dose to calculate.');
      setText('singleFormula', 'dose = weight_kg × dose_per_kg');
      return;
    }
    const calculated = weight * dose;
    const capped = positive(max) && calculated > max;
    if (capped) warnings.push('Calculated dose is greater than the entered max dose. Verify the max dose and use capped values only if confirmed by protocol/local direction.');
    const hasConcentration = positive(conc) && sameBase(doseUnit, concUnit);
    const calculatedVolume = hasConcentration ? calculated / conc : null;
    const cappedVolume = capped && hasConcentration ? max / conc : null;
    const parts = [`Calculated dose: ${fmt(calculated)} ${base}`];
    if (hasConcentration) parts.push(`Calculated volume: ${fmt(calculatedVolume)} mL`);
    if (capped) parts.push(`Capped dose: ${fmt(max)} ${base}`);
    if (capped && hasConcentration) parts.push(`Capped volume: ${fmt(cappedVolume)} mL`);
    showWarning('singleWarning', warnings);
    setText('singleResult', parts.join(' • '));
    const formulaLines = [`dose = ${fmt(weight)} kg × ${fmt(dose)} ${doseUnit} = ${fmt(calculated)} ${base}`];
    if (hasConcentration) formulaLines.push(`volume_mL = ${fmt(calculated)} ${base} ÷ ${fmt(conc)} ${concUnit} = ${fmt(calculatedVolume)} mL`);
    if (capped) formulaLines.push(`max dose entered = ${fmt(max)} ${base}`);
    if (capped && hasConcentration) formulaLines.push(`capped_volume_mL = ${fmt(max)} ${base} ÷ ${fmt(conc)} ${concUnit} = ${fmt(cappedVolume)} mL`);
    setText('singleFormula', formulaLines.join('\n'));
  }

  function calculateFixed() {
    const dose = n('fixedDose'), conc = n('fixedConc');
    const doseUnit = $('fixedDoseUnit').value, concUnit = $('fixedConcUnit').value;
    if ([dose, conc].every((value) => value === null)) {
      showWarning('fixedWarning', []);
      setText('fixedResult', 'Enter desired dose and concentration.');
      setText('fixedFormula', 'volume_mL = desired_dose ÷ concentration');
      return;
    }
    const warnings = [];
    if (invalid([dose, conc])) warnings.push('Use positive values only.');
    if (!positive(dose)) warnings.push('Missing desired dose.');
    if (!positive(conc)) warnings.push(conc === 0 ? 'Concentration cannot be zero.' : 'Missing concentration.');
    if (positive(dose) && positive(conc) && !sameBase(doseUnit, concUnit)) warnings.push('Dose and concentration units must match.');
    showWarning('fixedWarning', warnings);
    if (warnings.length) { setText('fixedResult', 'Enter matching dose and concentration units.'); return; }
    const volume = dose / conc;
    setText('fixedResult', `Volume to draw up: ${fmt(volume)} mL`);
    setText('fixedFormula', `volume_mL = ${fmt(dose)} ${doseUnit} ÷ ${fmt(conc)} ${concUnit} = ${fmt(volume)} mL`);
  }

  function calculateInfusion() {
    const weight = n('infWeight'), dose = n('infDose'), conc = n('infConc');
    const doseUnit = $('infDoseUnit').value, concUnit = $('infConcUnit').value;
    if ([weight, dose, conc].every((value) => value === null)) {
      showWarning('infWarning', []);
      setText('infResult', 'Enter infusion order and concentration.');
      setText('infFormula', 'mL/hr formula depends on selected dose unit');
      return;
    }
    const warnings = [];
    if (invalid([weight, dose, conc])) warnings.push('Use positive values only.');
    if ((doseUnit.includes('/kg/')) && !positive(weight)) warnings.push('Missing weight in kg for weight-based infusion.');
    if (!positive(dose)) warnings.push('Missing ordered infusion dose.');
    if (!positive(conc)) warnings.push(conc === 0 ? 'Concentration cannot be zero.' : 'Missing concentration.');
    const neededConc = doseUnit.startsWith('mcg') ? 'mcg/mL' : doseUnit.startsWith('mg') ? 'mg/mL' : 'units/mL';
    if (positive(conc) && concUnit !== neededConc) warnings.push(`Concentration unit should be ${neededConc} for ${doseUnit}.`);
    showWarning('infWarning', warnings);
    if (warnings.length) { setText('infResult', 'Enter valid infusion values with matching units.'); return; }
    let rate = 0, formula = '';
    if (doseUnit === 'mcg/kg/min') { rate = (dose * weight * 60) / conc; formula = `mL/hr = (${fmt(dose)} mcg/kg/min × ${fmt(weight)} kg × 60) ÷ ${fmt(conc)} mcg/mL = ${fmt(rate)} mL/hr`; }
    if (doseUnit === 'mg/kg/hr') { rate = (dose * weight) / conc; formula = `mL/hr = (${fmt(dose)} mg/kg/hr × ${fmt(weight)} kg) ÷ ${fmt(conc)} mg/mL = ${fmt(rate)} mL/hr`; }
    if (doseUnit === 'mcg/min') { rate = (dose * 60) / conc; formula = `mL/hr = (${fmt(dose)} mcg/min × 60) ÷ ${fmt(conc)} mcg/mL = ${fmt(rate)} mL/hr`; }
    if (doseUnit === 'mg/hr') { rate = dose / conc; formula = `mL/hr = ${fmt(dose)} mg/hr ÷ ${fmt(conc)} mg/mL = ${fmt(rate)} mL/hr`; }
    if (doseUnit === 'units/hr') { rate = dose / conc; formula = `mL/hr = ${fmt(dose)} units/hr ÷ ${fmt(conc)} units/mL = ${fmt(rate)} mL/hr`; }
    setText('infResult', `Pump rate: ${fmt(rate)} mL/hr`);
    setText('infFormula', formula);
  }

  function calculateReverse() {
    const weight = n('revWeight'), rate = n('revRate'), conc = n('revConc');
    const concUnit = $('revConcUnit').value, out = $('revOutputUnit').value;
    if ([weight, rate, conc].every((value) => value === null)) {
      showWarning('revWarning', []);
      setText('revResult', 'Enter pump rate and concentration to double-check delivered dose.');
      setText('revFormula', 'delivered dose formula depends on selected output unit');
      return;
    }
    const warnings = [];
    if (invalid([weight, rate, conc])) warnings.push('Use positive values only.');
    if ((out.includes('/kg/')) && !positive(weight)) warnings.push('Missing weight in kg for weight-based output.');
    if (!positive(rate)) warnings.push('Missing pump rate in mL/hr.');
    if (!positive(conc)) warnings.push(conc === 0 ? 'Concentration cannot be zero.' : 'Missing concentration.');
    const neededConc = out.startsWith('mcg') ? 'mcg/mL' : out.startsWith('mg') ? 'mg/mL' : 'units/mL';
    if (positive(conc) && concUnit !== neededConc) warnings.push(`Concentration unit should be ${neededConc} for ${out}.`);
    showWarning('revWarning', warnings);
    if (warnings.length) { setText('revResult', 'Enter valid pump and concentration values with matching units.'); return; }
    const amountPerHr = rate * conc;
    let delivered = 0, formula = '';
    if (out === 'mcg/kg/min') { delivered = amountPerHr / weight / 60; formula = `delivered = (${fmt(rate)} mL/hr × ${fmt(conc)} mcg/mL) ÷ ${fmt(weight)} kg ÷ 60 = ${fmt(delivered)} mcg/kg/min`; }
    if (out === 'mg/kg/hr') { delivered = amountPerHr / weight; formula = `delivered = (${fmt(rate)} mL/hr × ${fmt(conc)} mg/mL) ÷ ${fmt(weight)} kg = ${fmt(delivered)} mg/kg/hr`; }
    if (out === 'mcg/min') { delivered = amountPerHr / 60; formula = `delivered = (${fmt(rate)} mL/hr × ${fmt(conc)} mcg/mL) ÷ 60 = ${fmt(delivered)} mcg/min`; }
    if (out === 'mg/hr') { delivered = amountPerHr; formula = `delivered = ${fmt(rate)} mL/hr × ${fmt(conc)} mg/mL = ${fmt(delivered)} mg/hr`; }
    if (out === 'units/hr') { delivered = amountPerHr; formula = `delivered = ${fmt(rate)} mL/hr × ${fmt(conc)} units/mL = ${fmt(delivered)} units/hr`; }
    setText('revResult', `Delivered dose: ${fmt(delivered)} ${out}`);
    setText('revFormula', formula);
  }

  function calculateDrip() {
    const rate = n('dripRate'), factor = n('dropFactor');
    if (rate === null) {
      showWarning('dripWarning', []);
      setText('dripResult', 'Enter mL/hr and drop factor.');
      setText('dripFormula', 'gtt/min = (mL/hr × drop_factor) ÷ 60');
      return;
    }
    const warnings = [];
    if (invalid([rate])) warnings.push('Use positive values only.');
    if (!positive(rate)) warnings.push('Missing mL/hr.');
    showWarning('dripWarning', warnings);
    if (warnings.length) { setText('dripResult', 'Enter valid mL/hr.'); return; }
    const gtt = (rate * factor) / 60;
    setText('dripResult', `Drip rate: ${fmt(gtt)} gtt/min`);
    setText('dripFormula', `gtt/min = (${fmt(rate)} mL/hr × ${fmt(factor)} gtt/mL) ÷ 60 = ${fmt(gtt)} gtt/min`);
  }

  function calculateAll() { calculateWeight(); calculateSingleDose(); calculateFixed(); calculateInfusion(); calculateReverse(); calculateDrip(); }
  function clearGroup(group) {
    const groups = {
      weight: ['weightLb', 'weightKg'], single: ['singleWeight', 'singleDose', 'singleMax', 'singleConc'], fixed: ['fixedDose', 'fixedConc'], infusion: ['infWeight', 'infDose', 'infConc'], reverse: ['revWeight', 'revRate', 'revConc'], drip: ['dripRate']
    };
    (groups[group] || []).forEach((id) => { const el = $(id); if (el) { el.value = ''; delete el.dataset.autoWeight; } });
    calculateAll();
  }
  async function copyResult(id) {
    const text = $(id)?.textContent || '';
    try { await navigator.clipboard.writeText(text); } catch {}
  }
  function init() {
    fields.forEach((field) => field.addEventListener('input', (event) => {
      if (event.target.id === 'weightLb' || event.target.id === 'weightKg') {
        activeWeightField = event.target.id;
      } else if (DEPENDENT_WEIGHT_IDS.includes(event.target.id)) {
        if (event.target.value) delete event.target.dataset.autoWeight;
        else event.target.dataset.autoWeight = 'true';
      }
      calculateAll();
    }));
    document.addEventListener('click', (event) => {
      const clear = event.target.closest('[data-clear]');
      if (clear) clearGroup(clear.dataset.clear);
      const copy = event.target.closest('[data-copy]');
      if (copy) copyResult(copy.dataset.copy);
    });
    calculateAll();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
