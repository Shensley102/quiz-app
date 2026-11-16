#!/usr/bin/env python3
"""Focused ACT Protocols data/route smoke checks."""
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote, urlencode

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.index import app  # noqa: E402

protocols = json.loads((ROOT / 'static/data/act-protocols.json').read_text())
search = json.loads((ROOT / 'static/data/act-protocol-search.json').read_text())
medication_map = json.loads((ROOT / 'static/data/act-medication-protocol-map.json').read_text())
protocol_by_id = {record['id']: record for record in protocols}
search_by_id = {record['id']: record for record in search}
expected_categories = ['General', 'Medical', 'Cardiac', 'Trauma', 'Pediatric', 'Procedures', 'Infusion Guidelines']
infusion_files = {
    'INFUSION-ADULT': ('ADULT DripChart-Titration Guidln 2025.pdf', 7),
    'INFUSION-PEDIATRIC': ('PEDIATRIC Continuous Infusion Chart 2025.pdf', 4),
}

def assert_true(value, message):
    if not value:
        raise AssertionError(message)

def has_exact_tag(protocol_id, tag):
    protocol = protocol_by_id[protocol_id]
    return any(t.lower() == tag.lower() for t in protocol.get('tags', []))

manifest_ids = [record['id'] for record in protocols]
duplicate_ids = sorted(protocol_id for protocol_id, count in Counter(manifest_ids).items() if count > 1)
assert_true(not duplicate_ids, f'Duplicate manifest IDs: {duplicate_ids}')
assert_true('GUID-3203-T017' in protocol_by_id, 'Trauma in Pregnancy (T017) is missing')
assert_true('GUID-3203-T018' in protocol_by_id, 'Trauma Alert Criteria (T018) is missing')
assert_true(
    len(search) == len(protocols) and set(search_by_id) == set(protocol_by_id),
    'Search-index IDs do not exactly match manifest IDs '
    f'(missing: {sorted(set(protocol_by_id) - set(search_by_id))}; '
    f'extra: {sorted(set(search_by_id) - set(protocol_by_id))})',
)
missing_pdf_paths = [
    record['file'] for record in protocols
    if not (ROOT / record['file'].lstrip('/')).is_file()
]
assert_true(not missing_pdf_paths, f'Manifest PDF paths do not exist: {missing_pdf_paths}')
invalid_updated_dates = [
    record['id'] for record in protocols
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', record.get('updatedDate', ''))
]
assert_true(not invalid_updated_dates, f'Missing or invalid protocol updatedDate values: {invalid_updated_dates}')

assert_true(protocol_by_id['3203-C001']['title'] == 'Acute Coronary Syndrome', 'ACS protocol title fixture changed')
assert_true(has_exact_tag('3203-C001', 'ACS'), 'ACS exact tag missing')
assert_true(has_exact_tag('3203-C010', 'STEMI'), 'STEMI exact tag missing')
assert_true(has_exact_tag('3203-G008', 'RSI'), 'RSI exact tag missing')
assert_true('aspirin' in search_by_id['3203-C001']['normalizedText'], 'Aspirin text missing from ACS index')
assert_true('levetiracetam' in search_by_id['3203-M015']['normalizedText'], 'Keppra/levetiracetam text missing from seizure index')
assert_true(all(category in {p['category'] for p in protocols} for category in expected_categories), 'Expected ACT category fixture missing')

infusion_protocols = [p for p in protocols if p['category'] == 'Infusion Guidelines']
assert_true(
    len(infusion_protocols) == 2 and {p['id'] for p in infusion_protocols} == set(infusion_files),
    'Infusion Guidelines must contain exactly the adult and pediatric charts',
)
epinephrine_map = next(record for record in medication_map.values() if record['canonicalKey'] == 'epinephrine')
for protocol in infusion_protocols:
    protocol_id = protocol['id']
    filename, page_count = infusion_files[protocol_id]
    assert_true(
        protocol['file'] == f'/static/protocols/act/Infusion Guidlines/{filename}',
        f'{protocol_id}: incorrect infusion PDF path',
    )
    indexed = search_by_id[protocol_id]
    assert_true(
        not indexed['missingPdf'] and len(indexed['pages']) == page_count
        and 'epinephrine' in indexed['normalizedText'],
        f'{protocol_id}: infusion PDF text or pages missing from search index',
    )
    assert_true(
        any(med['canonicalKey'] == 'epinephrine' and med['pages'] for med in indexed['detectedMedications']),
        f'{protocol_id}: epinephrine missing from indexed medication matches',
    )
    assert_true(
        any(entry['manifestId'] == protocol_id and entry['pages'] for entry in epinephrine_map['protocols']),
        f'{protocol_id}: epinephrine lookup does not include the infusion chart',
    )

valid_file = protocol_by_id['3203-C001']['file']
with app.test_client() as client:
    info = client.get('/act-protocols/pdf-info', query_string={'file': valid_file})
    assert_true(info.status_code == 200, f'valid pdf-info failed: {info.status_code}')
    info_json = info.get_json()
    assert_true(info_json['success'] is True and info_json['page_count'] >= 1, 'pdf-info JSON shape invalid')

    missing = client.get('/act-protocols/pdf-info')
    assert_true(missing.status_code == 400 and missing.get_json()['success'] is False, 'missing pdf-info file did not return JSON error')

    invalid = client.get('/act-protocols/pdf-info', query_string={'file': '/static/../api/index.py'})
    assert_true(invalid.status_code == 404 and invalid.get_json()['success'] is False, 'invalid path did not return JSON error')

    page = client.get('/act-protocols/pdf-page', query_string={'file': valid_file, 'page': 1, 'scale': 1})
    assert_true(page.status_code == 200 and page.mimetype == 'image/png', 'valid pdf-page did not return PNG')

    out_of_range = client.get('/act-protocols/pdf-page', query_string={'file': valid_file, 'page': 999, 'scale': 1})
    assert_true(out_of_range.status_code == 404 and out_of_range.get_json()['success'] is False, 'out-of-range page did not return JSON error')

    for protocol in infusion_protocols:
        protocol_id = protocol['id']
        file = protocol['file']
        pdf = client.get(quote(file, safe='/'))
        assert_true(
            pdf.status_code == 200 and pdf.mimetype == 'application/pdf' and pdf.data.startswith(b'%PDF-'),
            f'{protocol_id}: encoded PDF URL did not serve a PDF',
        )

        info_query = urlencode({'file': file}, quote_via=quote)
        info = client.get(f'/act-protocols/pdf-info?{info_query}')
        info_json = info.get_json()
        assert_true(
            info.status_code == 200 and info_json['success'] is True
            and info_json['page_count'] == infusion_files[protocol_id][1],
            f'{protocol_id}: encoded PDF metadata URL failed',
        )

        page_query = urlencode({'file': file, 'page': 1, 'scale': 1}, quote_via=quote)
        page = client.get(f'/act-protocols/pdf-page?{page_query}')
        assert_true(
            page.status_code == 200 and page.mimetype == 'image/png' and page.data.startswith(b'\x89PNG\r\n\x1a\n'),
            f'{protocol_id}: encoded PDF page URL did not render a PNG',
        )

print('ACT protocol smoke checks passed')
