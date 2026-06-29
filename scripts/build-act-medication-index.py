#!/usr/bin/env python3
"""Build ACT protocol medication search indexes from the checked-in PDFs.

Outputs:
- static/data/act-medication-protocol-map.json
- static/data/act-medication-aliases.json
- static/data/act-protocol-search.json
- static/data/act-protocol-search-report.json
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'static/data/act-protocols.json'
MAP_OUT = ROOT / 'static/data/act-medication-protocol-map.json'
ALIASES_OUT = ROOT / 'static/data/act-medication-aliases.json'
SEARCH_OUT = ROOT / 'static/data/act-protocol-search.json'
REPORT_OUT = ROOT / 'static/data/act-protocol-search-report.json'
LITTLE_TEXT_CHARS = 40

try:
    import fitz  # PyMuPDF
except Exception as exc:  # pragma: no cover - depends on local environment
    fitz = None
    FITZ_IMPORT_ERROR = exc
else:
    FITZ_IMPORT_ERROR = None

PUNCT_TRANSLATION = str.maketrans({
    '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2212': '-',
    '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u00a0': ' ',
})

SEED_MEDICATIONS = [
    ('Levetiracetam', ['Keppra']),
    ('Norepinephrine', ['Levophed', 'norepi', 'nor-epi']),
    ('Aspirin', ['ASA', 'acetylsalicylic acid']),
    ('Midazolam', ['Versed']),
    ('Naloxone', ['Narcan']),
    ('Ondansetron', ['Zofran']),
    ('Tranexamic Acid', ['TXA']),
    ('Nitroglycerin', ['Nitro', 'NTG']),
    ('Epinephrine', ['Epi', 'adrenaline', '1:1000', '1:1,000', '1:10000', '1:10,000']),
    ('Ipratropium', ['Atrovent']),
    ('Sodium Bicarbonate', ['Bicarb', 'sodium bicarb', 'NaHCO3']),
    ('Dextrose', ['D10', 'D-10', 'D 10', 'D25', 'D-25', 'D 25', 'D50', 'D-50', 'D 50', 'glucose']),
    ('Rocuronium', ['Roc', 'Zemuron']),
    ('Succinylcholine', ['Sux', 'suxamethonium', 'Anectine']),
    ('Methylprednisolone', ['Solu-Medrol', 'solumedrol']),
    ('Diphenhydramine', ['Benadryl']),
    ('Furosemide', ['Lasix']),
    ('Diltiazem', ['Cardizem']),
    ('Cefazolin', ['Ancef']),
    ('Pantoprazole', ['Protonix']),
    ('Acetylcysteine', ['NAC', 'N-acetylcysteine']),
    ('Hydroxocobalamin', ['Cyanokit']),
    ('Crotalidae Immune Fab', ['CroFab']),
    ('Rho(D) Immune Globulin', ['RhoGAM', 'RhoGAM Ultra-Filtered PLUS']),
    ('Albuterol', ['salbutamol', 'Proventil', 'Ventolin']),
    ('Lorazepam', ['Ativan']),
    ('Diazepam', ['Valium']),
    ('Amiodarone', ['Cordarone', 'Pacerone']),
    ('Adenosine', ['Adenocard']),
    ('Ketamine', ['Ketalar']),
    ('Fentanyl', ['Sublimaze']),
    ('Morphine', []),
    ('Hydromorphone', ['Dilaudid']),
    ('Calcium Chloride', ['CaCl', 'CaCl2', 'calcium']),
    ('Magnesium Sulfate', ['magnesium', 'mag sulfate', 'MgSO4']),
    ('Glucagon', []),
    ('Dopamine', ['Intropin']),
    ('Dobutamine', ['Dobutrex']),
    ('Phenylephrine', ['Neo', 'Neosynephrine', 'Neo-Synephrine']),
    ('Vasopressin', ['Pitressin']),
    ('Lidocaine', ['Xylocaine']),
    ('Atropine', []),
    ('Etomidate', ['Amidate']),
    ('Propofol', ['Diprivan']),
    ('Acetaminophen', ['Tylenol', 'paracetamol']),
    ('Ibuprofen', ['Motrin', 'Advil']),
    ('Dexamethasone', ['Decadron']),
    ('Famotidine', ['Pepcid']),
    ('Heparin', []),
    ('Insulin', ['regular insulin', 'Humulin R', 'Novolin R']),
    ('Metoprolol', ['Lopressor']),
    ('Verapamil', ['Calan', 'Isoptin']),
    ('Ceftriaxone', ['Rocephin']),
    ('Piperacillin Tazobactam', ['piperacillin-tazobactam', 'pip-tazo', 'Zosyn']),
]


def normalize_text(text: str) -> str:
    text = (text or '').translate(PUNCT_TRANSLATION).lower()
    text = re.sub(r'[^\S\n]+', ' ', text)
    text = re.sub(r'\s*\n\s*', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def normalize_id(protocol_id: str) -> str:
    return re.sub(r'^guid-', '', normalize_text(protocol_id))


def unique(values):
    seen = set()
    out = []
    for value in values:
        clean = str(value).strip()
        key = normalize_text(clean)
        if key and key not in seen:
            seen.add(key)
            out.append(clean)
    return out


def alias_regex(alias: str) -> re.Pattern:
    normalized = normalize_text(alias)
    if not normalized:
        return re.compile(r'a^')
    escaped = re.escape(normalized).replace(r'\ ', r'\s+')
    return re.compile(rf'(?<![a-z0-9]){escaped}(?![a-z0-9])')


def web_to_local(web_path: str) -> Path:
    return ROOT / web_path.lstrip('/')


def build_seed_records():
    records = []
    for canonical, aliases in SEED_MEDICATIONS:
        all_aliases = unique([canonical, *aliases])
        normalized_aliases = unique([normalize_text(a) for a in all_aliases])
        records.append({
            'canonical': canonical,
            'canonicalKey': normalize_text(canonical),
            'aliases': all_aliases,
            'normalizedAliases': normalized_aliases,
            'genericNames': [canonical],
            'brandNames': [a for a in all_aliases if a != canonical][:8],
            'tradeNames': [a for a in all_aliases if a != canonical][:8],
            'activeIngredientNames': [canonical],
            'substanceNames': [canonical],
            'shorthand': [a for a in all_aliases if len(normalize_text(a).replace('-', '').replace(' ', '')) <= 5 and normalize_text(a) != normalize_text(canonical)],
            'sources': ['local-seed'],
            'foundInProtocols': [],
            'foundPagesByProtocol': {},
            'matchedAliases': [],
        })
    return records


def extract_pages(path: Path, report: dict) -> list[dict]:
    pages = []
    if fitz is None:
        report['warnings'].append(f'PyMuPDF unavailable; could not extract text from {path}: {FITZ_IMPORT_ERROR}')
        return pages
    with fitz.open(path) as doc:
        for page_number, page in enumerate(doc, start=1):
            raw = page.get_text('text') or ''
            text = normalize_text(raw)
            possible_scanned = len(text) < LITTLE_TEXT_CHARS
            if possible_scanned:
                report['pagesWithLittleOrNoText'].append({'file': '/' + str(path.relative_to(ROOT)), 'page': page_number})
            pages.append({'page': page_number, 'text': text, 'possibleScannedPage': possible_scanned})
    return pages


def find_medications(text: str, medications: list[dict]) -> list[tuple[dict, list[str]]]:
    found = []
    for medication in medications:
        matched = []
        for alias in medication['normalizedAliases']:
            if alias_regex(alias).search(text):
                matched.append(alias)
        if matched:
            found.append((medication, sorted(set(matched))))
    return found


def page_ranges(pages: list[int]) -> str:
    if not pages:
        return ''
    pages = sorted(set(pages))
    ranges = []
    start = prev = pages[0]
    for page in pages[1:]:
        if page == prev + 1:
            prev = page
            continue
        ranges.append(f'{start}' if start == prev else f'{start}-{prev}')
        start = prev = page
    ranges.append(f'{start}' if start == prev else f'{start}-{prev}')
    return ', '.join(ranges)


def build():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    medications = build_seed_records()
    by_key = {m['canonicalKey']: m for m in medications}
    found_by_med = {m['canonicalKey']: {'protocols': {}, 'matchedAliases': set()} for m in medications}
    manifest_by_normalized_id = {normalize_id(p['id']): p['id'] for p in manifest}
    search_records = []
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'totalProtocolsInManifest': len(manifest),
        'totalPdfsFound': 0,
        'totalPdfsMissing': 0,
        'missingPdfs': [],
        'totalPagesScanned': 0,
        'pagesWithLittleOrNoText': [],
        'possibleScannedPdfs': [],
        'totalMedicationAliasesLoaded': sum(len(m['normalizedAliases']) for m in medications),
        'totalMedicationsDetected': 0,
        'medicationsDetected': [],
        'protocolsWithMedicationMatches': [],
        'warnings': [],
    }
    if fitz is None:
        report['warnings'].append(f'PyMuPDF import failed: {FITZ_IMPORT_ERROR}. JSON outputs will contain seed aliases but no PDF matches.')

    for protocol in manifest:
        local_path = web_to_local(protocol['file'])
        missing = not local_path.exists()
        pages = []
        if missing:
            report['totalPdfsMissing'] += 1
            report['missingPdfs'].append({'id': protocol['id'], 'title': protocol['title'], 'file': protocol['file']})
        else:
            report['totalPdfsFound'] += 1
            try:
                pages = extract_pages(local_path, report)
            except Exception as exc:
                report['warnings'].append(f'Failed extracting {protocol["file"]}: {exc}')
        report['totalPagesScanned'] += len(pages)
        normalized_text = normalize_text(' '.join(page['text'] for page in pages))
        detected = []
        for medication, aliases in find_medications(normalized_text, medications):
            page_nums = []
            for page in pages:
                if any(alias_regex(alias).search(page['text']) for alias in aliases):
                    page_nums.append(page['page'])
            pages_sorted = sorted(set(page_nums))
            detected.append({
                'canonical': medication['canonical'],
                'canonicalKey': medication['canonicalKey'],
                'matchedAliases': aliases,
                'pages': pages_sorted,
                'pageRanges': page_ranges(pages_sorted),
            })
            entry = found_by_med[medication['canonicalKey']]['protocols'].setdefault(protocol['id'], {
                'id': protocol['id'],
                'normalizedId': normalize_id(protocol['id']),
                'title': protocol['title'],
                'category': protocol['category'],
                'file': protocol['file'],
                'pages': set(),
                'matchedAliases': set(),
            })
            entry['pages'].update(pages_sorted)
            entry['matchedAliases'].update(aliases)
            found_by_med[medication['canonicalKey']]['matchedAliases'].update(aliases)
        possible_scanned = bool(pages) and all(page.get('possibleScannedPage') for page in pages)
        if possible_scanned:
            report['possibleScannedPdfs'].append({'id': protocol['id'], 'file': protocol['file']})
        if detected:
            report['protocolsWithMedicationMatches'].append(protocol['id'])
        search_records.append({
            'id': protocol['id'],
            'normalizedId': normalize_id(protocol['id']),
            'title': protocol['title'],
            'category': protocol['category'],
            'folder': protocol['folder'],
            'file': protocol['file'],
            'tags': protocol.get('tags', []),
            'missingPdf': missing,
            'possibleScannedPdf': possible_scanned,
            'normalizedText': normalized_text,
            'pages': pages,
            'detectedMedications': detected,
        })

    medication_map = {}
    alias_records = []
    for medication in medications:
        found = found_by_med[medication['canonicalKey']]
        protocol_entries = []
        pages_by_protocol = {}
        for protocol_id, entry in sorted(found['protocols'].items(), key=lambda item: normalize_id(item[0])):
            pages = sorted(entry['pages'])
            aliases = sorted(entry['matchedAliases'])
            protocol_entries.append({
                **{k: v for k, v in entry.items() if k not in {'pages', 'matchedAliases'}},
                'manifestId': manifest_by_normalized_id.get(entry['normalizedId'], protocol_id),
                'pages': pages,
                'pageRanges': page_ranges(pages),
                'matchedAliases': aliases,
            })
            pages_by_protocol[protocol_id] = pages
        medication_map[medication['canonical']] = {
            'canonical': medication['canonical'],
            'canonicalKey': medication['canonicalKey'],
            'aliases': medication['aliases'],
            'normalizedAliases': medication['normalizedAliases'],
            'protocols': protocol_entries,
        }
        alias_records.append({
            **medication,
            'foundInProtocols': [p['id'] for p in protocol_entries],
            'foundPagesByProtocol': pages_by_protocol,
            'matchedAliases': sorted(found['matchedAliases']),
        })

    detected_names = [name for name, data in medication_map.items() if data['protocols']]
    report['totalMedicationsDetected'] = len(detected_names)
    report['medicationsDetected'] = detected_names
    report['protocolsWithMedicationMatches'] = sorted(set(report['protocolsWithMedicationMatches']), key=normalize_id)
    MAP_OUT.write_text(json.dumps(medication_map, indent=2) + '\n', encoding='utf-8')
    ALIASES_OUT.write_text(json.dumps(alias_records, indent=2) + '\n', encoding='utf-8')
    SEARCH_OUT.write_text(json.dumps(search_records, indent=2) + '\n', encoding='utf-8')
    REPORT_OUT.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {MAP_OUT.relative_to(ROOT)}')
    print(f'Wrote {ALIASES_OUT.relative_to(ROOT)}')
    print(f'Wrote {SEARCH_OUT.relative_to(ROOT)}')
    print(f'Wrote {REPORT_OUT.relative_to(ROOT)}')
    if report['warnings']:
        print('Warnings:')
        for warning in report['warnings'][:10]:
            print(f'- {warning}')


if __name__ == '__main__':
    build()
