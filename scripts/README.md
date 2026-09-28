# ACT Protocol search data

`build-act-medication-index.py` is the all-in-one builder for the ACT Protocol search and medication data.

To rebuild the generated data:

1. Place ACT PDFs under `static/protocols/act/` using the exact paths listed in `static/data/act-protocols.json`.
2. Synchronize each PDF's displayed update date from its Git change date:
   ```bash
   python scripts/sync-act-protocol-dates.py
   ```
   The script uses today's date for a new or locally modified PDF and the most recent Git commit date for an unchanged PDF. Commit the refreshed manifest with every PDF update. CI or local checks can use `python scripts/sync-act-protocol-dates.py --check` to detect stale dates.
3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
4. Run:
   ```bash
   python scripts/build-act-medication-index.py
   ```
5. Confirm all four generated files:
   * `static/data/act-medication-protocol-map.json`
   * `static/data/act-medication-aliases.json`
   * `static/data/act-protocol-search.json`
   * `static/data/act-protocol-search-report.json`
6. Review the report for missing PDFs, extraction warnings, scanned or unreadable pages, duplicate protocol IDs or file paths, and medication matches.
7. Commit the generated JSON files so the Vercel-hosted PWA can use them offline.

External drug lookups, if added later, must run only at build time. The live PWA should use committed local JSON and must not call medication APIs on mobile devices.
