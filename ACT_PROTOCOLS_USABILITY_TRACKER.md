# ACT Protocols Usability & Safety Tracker

This tracker records scoped fixes from the ACT Protocols usability review. It intentionally avoids changing clinical protocol content or dose formulas unless a UI state was stale or invalid.

## Completed

### ACT-001 — Preserve manually edited calculator weights
- **Status:** Completed
- **Acceptance criteria:** Manual values in `singleWeight`, `infWeight`, and `revWeight` are not overwritten by global lb/kg conversion after user edit; blank or auto-managed dependent fields may still sync.
- **Test cases:** Enter global weight, manually override each dependent weight, then change global weight; overridden fields remain unchanged while blank/auto-managed fields update.

### ACT-002 — Clear stale calculator formulas on invalid input
- **Status:** Completed
- **Acceptance criteria:** Valid-to-invalid edits (zero concentration, missing required values, unit mismatch, negative values) replace prior formulas with an invalid-state message instead of leaving stale calculations visible.
- **Test cases:** Produce a valid fixed-dose, infusion, reverse-infusion, drip-rate, and single-dose result; then invalidate each input and confirm stale formula text is cleared/marked invalid.

### ACT-003 — Prioritize selected PDF opening over background caching
- **Status:** Completed
- **Acceptance criteria:** Online PDF opening navigates promptly and selected protocol cache work continues in the background; offline uncached selection shows a clear card error state instead of silently opening a blank/failed viewer.
- **Test cases:** Open a protocol during background cache activity; confirm navigation starts without waiting for all PDFs. Go offline with an uncached protocol and confirm an error status is shown.

### ACT-004 — Live search results
- **Status:** Completed
- **Acceptance criteria:** Search results update as the user types and no longer retain stale previous-query results while suggestions reflect the new query.
- **Test cases:** Type aliases such as `Keppra` and `Versed`; results and suggestions update together.

### ACT-005 — De-duplicate search event bindings
- **Status:** Completed
- **Acceptance criteria:** Keydown, suggestion mousedown/click, and document click handlers are each registered once; keyboard suggestion navigation still works.
- **Test cases:** Use ArrowDown/ArrowUp/Enter/Escape in the search suggestions list.

### ACT-006 — Resolve cache status messaging cleanly
- **Status:** Completed
- **Acceptance criteria:** Cache footer text changes from refresh-in-progress to a completed or current state after service-worker cache messages; offline summary does not display a saved state while protocol cards are still actively downloading.
- **Test cases:** Trigger cache refresh and confirm the footer resolves to `Cache updated` or `Cache is up to date`; during protocol downloads, confirm offline summary reflects active downloading/preparation.

### ACT-007 — Accessibility labels and heading hierarchy
- **Status:** Completed
- **Acceptance criteria:** Category filter buttons expose `aria-pressed`; Open PDF buttons include protocol ID/title in their accessible names; protocol card titles use a heading level below category group headings.
- **Test cases:** Inspect with accessibility tooling or DOM assertions and verify category filter state updates after clicks.

### ACT-008 — Protocol revision/source metadata groundwork
- **Status:** Completed
- **Acceptance criteria:** Cards render revision/effective/source metadata only when provided by the manifest; no placeholders or invented dates appear when metadata is unavailable.
- **Test cases:** Add a test manifest entry with `revisionDate`, `effectiveDate`, or `source` and verify it appears; verify current cards remain clean without metadata.

### ACT-009 — Usability implementation tracker
- **Status:** Completed
- **Acceptance criteria:** Repository includes a markdown tracker with completed work, pending items, acceptance criteria, and test cases using stable IDs.
- **Test cases:** Review this document during future ACT Protocols work.

## Pending / Follow-up

### ACT-010 — Browser-based end-to-end smoke tests
- **Status:** Pending
- **Acceptance criteria:** Add Playwright or equivalent tests for ACT Protocols search, keyboard suggestions, category filters, PDF open/return, and dose calculator valid-to-invalid transitions.
- **Suggested test cases:** Alias searches (`Keppra`, `Versed`), narrow viewport layout, offline uncached protocol behavior, fixed-dose invalid transition, max-dose cap warning.

### ACT-011 — Manifest metadata population
- **Status:** Pending
- **Acceptance criteria:** If authoritative protocol revision/effective/source metadata becomes available, populate manifest fields from that source without inventing dates.
- **Suggested test cases:** Verify card metadata matches source documents exactly and absent data remains hidden.
