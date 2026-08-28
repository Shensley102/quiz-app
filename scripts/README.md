# ACT Protocol search data

`build-act-medication-index.py` is the all-in-one builder for the ACT Protocol search and medication data.

To rebuild the generated data:

1. Place ACT PDFs under `static/protocols/act/` using the exact paths listed in `static/data/act-protocols.json`.
2. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Run:
   ```bash
   python scripts/build-act-medication-index.py
   ```
4. Confirm all four generated files:
   * `static/data/act-medication-protocol-map.json`
   * `static/data/act-medication-aliases.json`
   * `static/data/act-protocol-search.json`
   * `static/data/act-protocol-search-report.json`
5. Review the report for missing PDFs, extraction warnings, scanned or unreadable pages, duplicate protocol IDs or file paths, and medication matches.
6. Commit the generated JSON files so the Vercel-hosted PWA can use them offline.

External drug lookups, if added later, must run only at build time. The live PWA should use committed local JSON and must not call medication APIs on mobile devices.
