#!/usr/bin/env python3
"""Synchronize ACT protocol PDF update dates with their Git history."""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'static/data/act-protocols.json'


def git_output(*args: str) -> str:
    result = subprocess.run(
        ['git', *args], cwd=ROOT, check=True, capture_output=True, text=True
    )
    return result.stdout.strip()


def updated_date(pdf_path: Path) -> str:
    relative_path = pdf_path.relative_to(ROOT).as_posix()
    if git_output('status', '--porcelain', '--', relative_path):
        return date.today().isoformat()

    committed_date = git_output('log', '-1', '--format=%cs', '--', relative_path)
    if not committed_date:
        raise ValueError(f'No Git history found for {relative_path}')
    return committed_date


def synchronized_manifest() -> list[dict]:
    protocols = json.loads(MANIFEST.read_text(encoding='utf-8'))
    for protocol in protocols:
        pdf_path = ROOT / protocol['file'].lstrip('/')
        if not pdf_path.is_file():
            raise FileNotFoundError(f'Missing protocol PDF: {protocol["file"]}')
        protocol['updatedDate'] = updated_date(pdf_path)
    return protocols


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--check', action='store_true', help='fail instead of writing when dates are stale'
    )
    args = parser.parse_args()
    expected = json.dumps(synchronized_manifest(), indent=2) + '\n'
    current = MANIFEST.read_text(encoding='utf-8')

    if args.check:
        if current != expected:
            print('ACT protocol update dates are stale. Run scripts/sync-act-protocol-dates.py.')
            return 1
        print('ACT protocol update dates are current.')
        return 0

    MANIFEST.write_text(expected, encoding='utf-8')
    print(f'Updated {MANIFEST.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
