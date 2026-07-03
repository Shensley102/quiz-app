#!/usr/bin/env python3
"""Focused ACT Protocols data/route smoke checks."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.index import app  # noqa: E402

protocols = json.loads((ROOT / 'static/data/act-protocols.json').read_text())
search = json.loads((ROOT / 'static/data/act-protocol-search.json').read_text())
protocol_by_id = {record['id']: record for record in protocols}
search_by_id = {record['id']: record for record in search}

def assert_true(value, message):
    if not value:
        raise AssertionError(message)

def has_exact_tag(protocol_id, tag):
    protocol = protocol_by_id[protocol_id]
    return any(t.lower() == tag.lower() for t in protocol.get('tags', []))

assert_true(protocol_by_id['3203-C001']['title'] == 'Acute Coronary Syndrome', 'ACS protocol title fixture changed')
assert_true(has_exact_tag('3203-C001', 'ACS'), 'ACS exact tag missing')
assert_true(has_exact_tag('3203-C010', 'STEMI'), 'STEMI exact tag missing')
assert_true(has_exact_tag('3203-G008', 'RSI'), 'RSI exact tag missing')
assert_true('aspirin' in search_by_id['3203-C001']['normalizedText'], 'Aspirin text missing from ACS index')
assert_true('levetiracetam' in search_by_id['3203-M015']['normalizedText'], 'Keppra/levetiracetam text missing from seizure index')

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

print('ACT protocol smoke checks passed')
