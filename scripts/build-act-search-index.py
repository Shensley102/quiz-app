#!/usr/bin/env python3
"""Build offline ACT protocol PDF text and medication search indexes."""
from __future__ import annotations

import json, re, sys, subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'static/data/act-protocols.json'
SEED = ROOT / 'static/data/act-medication-alias-seed.json'
SEARCH_OUT = ROOT / 'static/data/act-protocol-search.json'
ALIAS_OUT = ROOT / 'static/data/act-medication-aliases.json'
REPORT_OUT = ROOT / 'static/data/act-protocol-search-report.json'
LITTLE_TEXT_CHARS = 40

try:
    import fitz  # PyMuPDF
except Exception as exc:  # pragma: no cover - environment dependent
    fitz = None
    FITZ_IMPORT_ERROR = exc
else:
    FITZ_IMPORT_ERROR = None

PUNCT_TRANSLATION = str.maketrans({
    '\u2010':'-', '\u2011':'-', '\u2012':'-', '\u2013':'-', '\u2014':'-', '\u2212':'-',
    '\u2018':"'", '\u2019':"'", '\u201c':'"', '\u201d':'"', '\u00a0':' ',
})

SHORT_ALIASES = {'epi','neo','roc','sux','asa','ntg','txa','d10','d25','d50'}

def normalize_text(text: str) -> str:
    text = (text or '').translate(PUNCT_TRANSLATION).lower()
    text = re.sub(r'[^\S\n]+', ' ', text)
    text = re.sub(r'\s*\n\s*', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def web_to_local(web_path: str) -> Path:
    return ROOT / web_path.lstrip('/')

def unique(values):
    seen, out = set(), []
    for value in values:
        clean = normalize_text(str(value))
        if clean and clean not in seen:
            seen.add(clean); out.append(clean)
    return out

def alias_regex(alias: str) -> re.Pattern:
    a = normalize_text(alias)
    if not a:
        return re.compile(r'a^')
    escaped = re.escape(a).replace('\\ ', r'\s+')
    if re.fullmatch(r'[a-z0-9]+', a):
        return re.compile(rf'(?<![a-z0-9]){escaped}(?![a-z0-9])')
    return re.compile(rf'(?<![a-z0-9]){escaped}(?![a-z0-9])')

def load_seed():
    seed = json.loads(SEED.read_text(encoding='utf-8'))
    meds = {}
    for item in seed:
        canonical = normalize_text(item['canonical'])
        aliases = unique([canonical, *item.get('aliases', [])])
        meds[canonical] = {
            'canonical': canonical,
            'aliases': aliases,
            'genericNames': [canonical],
            'brandNames': [a for a in aliases if a != canonical and ' ' not in a and '-' not in a][:4],
            'tradeNames': [a for a in aliases if a != canonical and ' ' not in a and '-' not in a][:4],
            'activeIngredientNames': [canonical],
            'substanceNames': [canonical],
            'shorthand': [a for a in aliases if len(a.replace('-', '').replace(' ', '')) <= 5 and a != canonical],
            'sources': ['local-seed'],
        }
    return meds

def extract_with_fitz(path: Path, report: dict):
    pages = []
    if fitz is None:
        report['warnings'].append(f'PyMuPDF unavailable; could not extract text from {path}: {FITZ_IMPORT_ERROR}')
        return pages
    doc = fitz.open(path)
    for idx, page in enumerate(doc, start=1):
        raw = page.get_text('text') or ''
        possible = len(normalize_text(raw)) < LITTLE_TEXT_CHARS
        ocr_attempted = ocr_succeeded = ocr_failed = False
        if possible and hasattr(page, 'get_textpage_ocr'):
            ocr_attempted = True; report['ocrAttemptedCount'] += 1
            try:
                textpage = page.get_textpage_ocr()
                ocr_text = page.get_text('text', textpage=textpage) or ''
                if len(normalize_text(ocr_text)) > len(normalize_text(raw)):
                    raw = ocr_text; possible = len(normalize_text(raw)) < LITTLE_TEXT_CHARS
                ocr_succeeded = True; report['ocrSucceededCount'] += 1
            except Exception as exc:
                ocr_failed = True; report['ocrFailedCount'] += 1
                report['warnings'].append(f'OCR unavailable/failed for {path} page {idx}: {exc}')
        text = normalize_text(raw)
        if possible:
            report['pagesWithLittleOrNoText'].append({'file': '/' + str(path.relative_to(ROOT)), 'page': idx})
        pages.append({'page': idx, 'text': text, 'possibleScannedPage': possible, 'ocrAttempted': ocr_attempted, 'ocrSucceeded': ocr_succeeded, 'ocrFailed': ocr_failed})
    return pages

def find_matches(text: str, meds: dict):
    found = []
    for canonical, med in meds.items():
        aliases = []
        for alias in med['aliases']:
            if alias_regex(alias).search(text):
                aliases.append(alias)
        if aliases:
            found.append((canonical, sorted(set(aliases))))
    return found

def build():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    meds = load_seed()
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'totalProtocolsInManifest': len(manifest), 'totalPdfsFound': 0, 'totalPdfsMissing': 0,
        'missingPdfs': [], 'totalPagesScanned': 0, 'pagesWithLittleOrNoText': [], 'possibleScannedPdfs': [],
        'ocrAttemptedCount': 0, 'ocrSucceededCount': 0, 'ocrFailedCount': 0,
        'totalMedicationAliasesLoaded': sum(len(m['aliases']) for m in meds.values()),
        'totalMedicationsDetected': 0, 'medicationsDetected': [], 'protocolsWithMedicationMatches': [],
        'possibleMedicationCandidatesNotMatched': [], 'warnings': []
    }
    if fitz is None:
        report['warnings'].append(f'PyMuPDF import failed: {FITZ_IMPORT_ERROR}. Install requirements and rebuild for PDF text extraction.')
    search_records = []
    found_by_med = {c: {'foundInProtocols': set(), 'foundPagesByProtocol': defaultdict(set), 'matchedAliases': set()} for c in meds}
    for proto in manifest:
        local = web_to_local(proto['file'])
        missing = not local.exists()
        pages = []
        if missing:
            report['totalPdfsMissing'] += 1
            report['missingPdfs'].append({'id': proto['id'], 'title': proto['title'], 'file': proto['file']})
        else:
            report['totalPdfsFound'] += 1
            try:
                pages = extract_with_fitz(local, report)
            except Exception as exc:
                report['warnings'].append(f'Failed extracting {proto["file"]}: {exc}')
        report['totalPagesScanned'] += len(pages)
        normalized = normalize_text(' '.join(p['text'] for p in pages))
        detected = []
        for canonical, aliases in find_matches(normalized, meds):
            page_nums = []
            for page in pages:
                if any(alias_regex(alias).search(page['text']) for alias in aliases):
                    page_nums.append(page['page'])
            detected.append({'canonical': canonical, 'matchedAliases': aliases, 'pages': page_nums})
            found_by_med[canonical]['foundInProtocols'].add(proto['id'])
            found_by_med[canonical]['matchedAliases'].update(aliases)
            for page in page_nums:
                found_by_med[canonical]['foundPagesByProtocol'][proto['id']].add(page)
        possible_scanned = bool(pages) and all(p.get('possibleScannedPage') for p in pages)
        if possible_scanned:
            report['possibleScannedPdfs'].append({'id': proto['id'], 'file': proto['file']})
        if detected:
            report['protocolsWithMedicationMatches'].append(proto['id'])
        search_records.append({
            'id': proto['id'], 'title': proto['title'], 'category': proto['category'], 'folder': proto['folder'],
            'file': proto['file'], 'tags': proto.get('tags', []), 'missingPdf': missing, 'possibleScannedPdf': possible_scanned,
            'normalizedText': normalized, 'pages': pages, 'detectedMedications': detected
        })
    alias_records = []
    for canonical, med in meds.items():
        found = found_by_med[canonical]
        if not found['foundInProtocols'] and report['totalPdfsFound'] and fitz is not None:
            continue
        alias_records.append({
            **med,
            'foundInProtocols': sorted(found['foundInProtocols']),
            'foundPagesByProtocol': {k: sorted(v) for k, v in sorted(found['foundPagesByProtocol'].items())},
            'matchedAliases': sorted(found['matchedAliases']),
        })
    report['totalMedicationsDetected'] = len([r for r in alias_records if r['foundInProtocols']])
    report['medicationsDetected'] = sorted([r['canonical'] for r in alias_records if r['foundInProtocols']])
    SEARCH_OUT.write_text(json.dumps(search_records, indent=2) + '\n', encoding='utf-8')
    ALIAS_OUT.write_text(json.dumps(alias_records, indent=2) + '\n', encoding='utf-8')
    REPORT_OUT.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {SEARCH_OUT.relative_to(ROOT)}, {ALIAS_OUT.relative_to(ROOT)}, {REPORT_OUT.relative_to(ROOT)}')
    if report['warnings']:
        print('Warnings:', *report['warnings'][:5], sep='\n- ')

if __name__ == '__main__':
    build()
