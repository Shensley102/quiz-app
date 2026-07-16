from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOSE = (ROOT / 'static/js/act-dose-calculator.js').read_text()
PROTOCOLS = (ROOT / 'static/js/act-protocols.js').read_text()
TEMPLATE = (ROOT / 'templates/act-protocols.html').read_text()
HOME_TEMPLATE = (ROOT / 'templates/home.html').read_text()
DOSE_TEMPLATE = (ROOT / 'templates/act-dose-calculator.html').read_text()
PWA_UTILS = (ROOT / 'static/js/pwa-utils.js').read_text()
SERVICE_WORKER = (ROOT / 'static/service-worker.js').read_text()


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


def test_concentration_builders_fill_existing_concentration_fields():
    for prefix in ['single', 'fixed', 'inf', 'rev']:
        assert f'id="{prefix}MedAmount"' in DOSE_TEMPLATE
        assert f'id="{prefix}FluidVolume"' in DOSE_TEMPLATE
        assert f'id="{prefix}ConcBuilderResult"' in DOSE_TEMPLATE
    assert 'const concentration = amount / volume;' in DOSE
    assert "concEl.dataset.autoConcentration = 'true';" in DOSE
    assert 'manual concentration preserved' in DOSE
    assert 'Total volume cannot be zero.' in DOSE


def test_concentration_builder_uses_medication_label_and_red_tint():
    assert 'Medication Concentration' in DOSE_TEMPLATE
    assert 'Build concentration' not in DOSE_TEMPLATE
    css = (ROOT / 'static/act-protocols.css').read_text()
    builder_block = css[css.index('.dose-concentration-builder'):css.index('.dose-builder-title')]
    assert 'rgba(220, 38, 38, 0.08)' in builder_block
    assert 'background: var(--act-surface);' not in builder_block


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


def test_clinical_calculators_are_linked_only_from_act_protocols():
    assert 'href="/act-protocols/dose-calculator"' in TEMPLATE
    assert 'href="/act-protocols/oxygen-calculator"' in TEMPLATE
    assert 'ACT clinical calculation tools' in TEMPLATE
    assert '/act-protocols/dose-calculator' not in HOME_TEMPLATE
    assert '/act-protocols/oxygen-calculator' not in HOME_TEMPLATE


def test_offline_download_counter_starts_at_zero_and_advances_per_completed_pdf():
    assert 'downloadTotal: 0, downloadCompleted: 0, downloadInProgress: false' in PROTOCOLS
    assert 'state.downloadTotal = protocols.length;' in PROTOCOLS
    assert 'state.downloadCompleted = 0;' in PROTOCOLS
    assert "`${state.downloadCompleted} out of ${state.downloadTotal}`" in PROTOCOLS
    cache_start = PROTOCOLS.index('async function cacheProtocols')
    complete_start = PROTOCOLS.index('await cachePdf(protocol);', cache_start)
    increment_start = PROTOCOLS.index('state.downloadCompleted += 1;', cache_start)
    assert complete_start < increment_start


def test_protocol_opening_does_not_wait_for_full_background_cache_online():
    open_start = PROTOCOLS.index('function openProtocolViewer')
    handle_start = PROTOCOLS.index('async function handleOpen')
    cache_start = PROTOCOLS.index('async function cacheProtocols')
    handle_body = PROTOCOLS[handle_start:cache_start]
    assert handle_body.index('openProtocolViewer(protocol);') < handle_body.index('cachePdf(protocol)')
    assert '.finally(() => {' in handle_body


def test_pwa_checks_the_deployment_version_and_refreshes_app_caches():
    assert "DEPLOYMENT_VERSION_ENDPOINT: '/api/pwa-version'" in PWA_UTILS
    assert 'checkForUpdates();' in PWA_UTILS
    assert 'checkDeploymentVersion();' in PWA_UTILS
    assert "type: 'CLEAR_APP_CACHES'" in PWA_UTILS
    assert "type: 'APP_CACHES_CLEARED'" in SERVICE_WORKER
    assert "name.startsWith('study-guru-') || name.startsWith('nurse-study-hub-')" in SERVICE_WORKER
