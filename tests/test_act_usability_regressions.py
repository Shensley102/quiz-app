from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOSE = (ROOT / 'static/js/act-dose-calculator.js').read_text()
PROTOCOLS = (ROOT / 'static/js/act-protocols.js').read_text()
TEMPLATE = (ROOT / 'templates/act-protocols.html').read_text()


def test_manual_weight_fields_are_not_always_overwritten():
    assert "el.dataset.autoWeight === 'true' || el.value === '' || el.value === lastSyncedWeightValue" in DOSE
    assert "if (!isAutoManaged) return;" in DOSE
    assert "event.target.value !== lastSyncedWeightValue" in DOSE


def test_invalid_calculator_transitions_clear_stale_formulas():
    assert "function setInvalidFormula" in DOSE
    for formula_id in ['singleFormula', 'fixedFormula', 'infFormula', 'revFormula', 'dripFormula']:
        assert f"setInvalidFormula('{formula_id}')" in DOSE


def test_single_dose_max_is_weight_based_per_kg_cap():
    assert 'const maxTotal = positive(max) ? weight * max : null;' in DOSE
    assert 'max_dose = ${fmt(weight)} kg × ${fmt(max)} ${doseUnit} = ${fmt(maxTotal)} ${base}' in DOSE
    assert 'Calculated dose is greater than the entered max dose per kg.' in DOSE


def test_search_input_updates_rendered_results_live():
    assert "state.query = value;" in PROTOCOLS
    assert "render();" in PROTOCOLS


def test_search_event_handlers_are_not_duplicated():
    assert PROTOCOLS.count("els.search.addEventListener('keydown'") == 1
    assert PROTOCOLS.count("els.suggestions?.addEventListener('mousedown'") == 1
    assert PROTOCOLS.count("els.suggestions?.addEventListener('click'") == 1


def test_protocol_cards_have_accessible_open_buttons_and_filter_state():
    assert 'aria-label="Open PDF for ${escapeHtml(p.id)} ${escapeHtml(p.title)}"' in PROTOCOLS
    assert 'setAttribute(\'aria-pressed\', String(selected))' in PROTOCOLS
    assert 'aria-pressed="true"' in TEMPLATE
    assert 'aria-pressed="false"' in TEMPLATE


def test_protocol_opening_does_not_wait_for_full_background_cache_online():
    open_start = PROTOCOLS.index('function openProtocolViewer')
    handle_start = PROTOCOLS.index('async function handleOpen')
    cache_start = PROTOCOLS.index('async function cacheProtocols')
    handle_body = PROTOCOLS[handle_start:cache_start]
    assert handle_body.index('openProtocolViewer(protocol);') < handle_body.index('cachePdf(protocol)')
    assert '.finally(() => {' in handle_body
