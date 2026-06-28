# ACT Protocol search index

How to rebuild the ACT Protocol search index:

1. Place ACT PDFs under `static/protocols/act/` using the exact paths listed in `static/data/act-protocols.json`.
2. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Run:
   ```bash
   python scripts/build-act-search-index.py
   ```
4. Confirm generated files:
   * `static/data/act-protocol-search.json`
   * `static/data/act-medication-aliases.json`
   * `static/data/act-protocol-search-report.json`
5. Review the report for missing PDFs, scanned pages, OCR warnings, and medication matches.
6. Commit the generated JSON files so the Vercel-hosted PWA can use them offline.

External drug lookups, if added later, must run only at build time. The live PWA should use committed local JSON and must not call medication APIs on mobile devices.
