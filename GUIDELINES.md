# Nurse Success Study Hub — Project Guidelines

> Reference document for AI agents and contributors working on this repository.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Important Commands](#important-commands)
5. [Workflow](#workflow)
6. [Question Data & JSON Schemas](#question-data--json-schemas)
7. [Routing Reference](#routing-reference)
8. [Category & Module System](#category--module-system)
9. [Frontend Architecture](#frontend-architecture)
10. [Deployment](#deployment)
11. [Git & Branching](#git--branching)
12. [Project-Specific Notes](#project-specific-notes)

---

## Project Overview

**Name:** Nurse Success Study Hub
**Short Name:** Nurse Study
**Purpose:** A Progressive Web App (PWA) for nursing students preparing for exams (NCLEX, CCRN, CFRN, HESI, Lab Values, Pharmacology, Adult Health).

**What it does:**
- Serves multiple-choice (single-select and multi-select) and fill-in-the-blank quiz questions
- Tracks per-question progress in the browser via `localStorage`
- Prioritizes least-answered and missed questions using a mastery-based requeue system
- Supports offline use via a service worker
- Hosts specialized certification prep systems for NCLEX, CCRN, CFRN, and Adult Health

**No traditional database** — all question data is stored as JSON files in the `modules/` directory.

**No authentication system** — this is a fully public, client-side study tool.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend language | Python 3.x |
| Web framework | Flask 3.0.0 |
| Templating | Jinja2 3.1.4 |
| Deployment platform | Vercel (serverless Python) |
| Frontend | Vanilla HTML, CSS, JavaScript (no frameworks) |
| PWA | Service Worker + Web App Manifest |
| Progress storage | `localStorage` (browser-side only) |
| Data format | JSON files |

**Python dependencies** (`requirements.txt`):
```
Flask==3.0.0
werkzeug==3.0.1
jinja2==3.1.4
itsdangerous==2.2.0
click==8.1.7
```

---

## Project Structure

```
quiz-app/
├── api/
│   └── index.py              # Main Flask app — all routes and business logic (Vercel entry point)
├── modules/                  # Question bank JSON files, organized by category
│   ├── Adult_Health/
│   │   ├── Adult_Health.json                 # Master question bank (~2.4 MB)
│   │   ├── Adult_Health_Pharm.json
│   │   ├── Giddens_Concepts.json
│   │   └── Ignatavicus_Med_Surge.json
│   ├── NCLEX/
│   │   └── NCLEX_Comprehensive_Master_Categorized.json  (~1.3 MB)
│   ├── Lab_Values/
│   │   ├── NCLEX_Lab_Values.json
│   │   └── NCLEX_Lab_Values_Fill_In_The_Blank.json
│   ├── Nursing_Certifications/
│   │   ├── CCRN_Comprehensive.json
│   │   ├── CFRN_Question_Bank.json
│   │   └── EKG_Question_Bank.json
│   ├── Patient_Care_Management/
│   │   ├── Module_1.json  through  Module_4.json
│   │   ├── Learning_Questions_Module_1_2.json
│   │   └── Learning_Questions_Module_3_4.json
│   └── Pharmacology/
│       ├── Pharm_Quiz_1.json  through  Pharm_Quiz_4.json
│       ├── Comprehensive_Pharmacology.json
│       ├── Anti_Infectives_Pharm.json
│       ├── Cardiovascular_Pharm.json
│       ├── CNS_Psychiatric_Pharm.json
│       ├── Endocrine_Metabolic_Pharm.json
│       ├── Gastrointestinal_Pharm.json
│       ├── Hematologic_Oncology_Pharm.json
│       ├── High_Alert_Medications_Pharm.json
│       ├── Immunologic_Biologics_Pharm.json
│       ├── Musculoskeletal_Pharm.json
│       ├── Pain_Management_Pharm.json
│       ├── Renal_Electrolytes_Pharm.json
│       └── Respiratory_Pharm.json
├── templates/                # Jinja2 HTML templates
│   ├── home.html             # Landing page
│   ├── quiz.html             # Main MCQ quiz interface
│   ├── quiz-fill-blank.html  # Fill-in-the-blank quiz
│   ├── quiz-fishbone-mcq.html
│   ├── quiz-fishbone-fill.html
│   ├── NCLEX-Landing.html    # NCLEX category system
│   ├── ccrn.html             # CCRN practice system
│   ├── cfrn.html             # CFRN practice system
│   ├── adult-health.html     # Adult Health module system
│   ├── lab-values.html
│   ├── pharmacology.html
│   ├── pharmacology-comprehensive.html
│   ├── pharmacology-categories.html
│   ├── nursing-certifications.html
│   ├── category.html         # Generic category template
│   └── pwa-head-snippet.html # Shared PWA <head> tags
├── static/                   # All static frontend assets
│   ├── quiz-script.js        # Core quiz engine (~1750 lines)
│   ├── quiz-fill-blank.js
│   ├── quiz-fishbone-mcq.js
│   ├── quiz-fishbone-fill.js
│   ├── fishbone-utils.js
│   ├── service-worker.js     # PWA offline support (cache version: v2.3.0)
│   ├── manifest.json         # PWA manifest
│   ├── quiz-content.schema.json   # JSON schema for validating question files
│   ├── quiz-content.fixtures.json # Example/test data
│   ├── style.css
│   ├── quiz-style.css
│   ├── category-style.css
│   ├── home-style.css
│   ├── icons/                # PWA app icons (12 sizes, 72px–512px)
│   ├── images/               # Static category illustration images
│   └── js/
│       ├── progress-store.js # localStorage progress tracking utility
│       └── pwa-utils.js      # PWA install/notification helpers
├── images/                   # Category header images
│   ├── Adult_Health.png
│   ├── CCRN_Header.png
│   ├── CFRN_Header.png
│   ├── Nursing_Advanced_Certifications.png
│   ├── Nursing_Lab_Values.png
│   ├── Nursing_Leadership_Image.png
│   ├── Nursing_Nclex_Exam_Prep_Image.png
│   └── Nursing_Pharmacology_Image.png
├── study_tool.py             # Legacy Flask dev server (superseded by api/index.py)
├── requirements.txt          # Python dependencies
├── vercel.json               # Vercel deployment configuration
├── .gitattributes
└── .github/
    └── dependabot.yml        # Automated dependency updates
```

---

## Important Commands

### Run locally (development)

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the Flask development server (port 5000)
python study_tool.py
# OR use the full-featured production entry point:
python -m flask --app api/index.py run --debug
```

> **Note:** `study_tool.py` is the legacy dev server. `api/index.py` is the production entry point used by Vercel and contains all routing and business logic. Prefer using `api/index.py` when testing full functionality.

### Validate question JSON
Use the JSON schema at `static/quiz-content.schema.json` to validate any quiz data file:
```bash
# Example using a JSON schema validator (ajv, jsonschema, etc.)
jsonschema -i modules/Lab_Values/NCLEX_Lab_Values.json static/quiz-content.schema.json
```

### Deploy to Vercel
```bash
vercel deploy         # preview deployment
vercel deploy --prod  # production deployment
```

---

## Workflow

### Adding or editing quiz questions

1. Locate the relevant JSON file under `modules/<Category>/`.
2. Follow the schema defined in `static/quiz-content.schema.json` (see [Question Data & JSON Schemas](#question-data--json-schemas) below).
3. Ensure JSON is valid (no trailing commas, no missing commas, file ends with a newline).
4. For CFRN questions, the `"category"` field must exactly match one of the strings in `CFRN_CATEGORIES` in `api/index.py`.
5. For CCRN questions, the `"category"` field must match one of `CCRN_CATEGORIES` in `api/index.py`.
6. For NCLEX questions, the `"category"` field must match one of the 8 official NCLEX-RN test plan categories listed in `NCLEX_CATEGORIES`.
7. Commit and push.

### Adding a new category

1. Create a new folder under `modules/` (e.g., `modules/New_Category/`).
2. Add the corresponding metadata entry to `CATEGORY_METADATA` in `api/index.py`.
3. If the category needs a custom landing page, create a new template in `templates/` and add a route in `api/index.py`.
4. Update `service-worker.js` if new HTML pages should be precached.

### Adding a new quiz module

1. Create a JSON file in the appropriate `modules/<Category>/` subfolder.
2. The filename (without `.json`) becomes the module name used in URLs.
3. The app auto-discovers JSON files in the `modules/` directory — no registration needed for standard categories.
4. Fill-in-the-blank modules must include `Fill_In_The_Blank` in the filename to be routed correctly.

### Updating the service worker cache

When new static assets or HTML pages are added, update the cache lists in `static/service-worker.js`:
- `STATIC_ASSETS` — CSS, JS, icons, images
- `HTML_PAGES` — HTML pages to precache
- Bump `CACHE_VERSION` (e.g., `v2.3.0` → `v2.4.0`) to force clients to refresh

---

## Question Data & JSON Schemas

All quiz data lives in `modules/`. There are two JSON formats.

### Format 1: Multiple-Choice (MCQ)

```json
{
  "module": "Module_Name",
  "questions": [
    {
      "id": "Module_Name_Q1",
      "stem": "Question text here?",
      "options": [
        "Option A text",
        "Option B text",
        "Option C text",
        "Option D text"
      ],
      "correct": ["C"],
      "rationale": "Explanation of the correct answer.",
      "type": "single_select"
    },
    {
      "id": "Module_Name_Q2",
      "stem": "Select all that apply...",
      "options": ["A", "B", "C", "D", "E"],
      "correct": ["A", "B", "D"],
      "rationale": "Explanation...",
      "type": "multi_select"
    }
  ]
}
```

**Rules:**
- `type` must be `"single_select"` or `"multi_select"`
- `correct` is an array of uppercase letter strings (`"A"`, `"B"`, ...) matching option indices
- `single_select` must have exactly 1 correct answer
- `multi_select` must have 2 or more correct answers
- `id` must be unique within a file

### Format 2: Fill-in-the-Blank

```json
{
  "title": "Lab Values Fill-in-the-Blank",
  "instructions": "Fill in the blank with the correct value.",
  "questions": [
    {
      "id": 1,
      "question": "Normal serum sodium is ___ to ___ mEq/L.",
      "answer": ["135", "145"],
      "display_answer": "135-145 mEq/L",
      "rationale": "Explanation..."
    }
  ]
}
```

**Rules:**
- `id` is an integer
- `answer` is an array of acceptable string values (used for fuzzy matching)
- `display_answer` is the human-readable formatted answer shown after submission
- Fill-in-the-blank filenames must contain `Fill_In_The_Blank`

### Special JSON fields for specialized categories

**NCLEX questions** (in `NCLEX_Comprehensive_Master_Categorized.json`) include:
```json
{ "category": "Management of Care", ... }
```

**CCRN questions** (in `CCRN_Comprehensive.json`) include:
```json
{ "category": "Cardiovascular", ... }
```

**CFRN questions** (in `CFRN_Question_Bank.json`) use domain/subcategory format:
```json
{ "category": "General Principles; Transport Physiology", ... }
```

**Adult Health questions** (in `Adult_Health.json`) include book and category for chapter filtering:
```json
{ "book": "Ignatavicus Medical-Surgical Nursing", "category": "Chapter 27: ...", ... }
```

---

## Routing Reference

All routes are defined in `api/index.py`.

### Page Routes

| URL | Handler | Description |
|---|---|---|
| `/` | `home()` | Landing page |
| `/category/<category>` | `category()` | Category hub (routes to specialized templates) |
| `/quiz/<category>/<module>` | `quiz()` | Standard MCQ quiz |
| `/quiz-fill-blank/<category>/<module>` | `quiz_fill_blank()` | Fill-in-the-blank quiz |
| `/quiz-fishbone-mcq` | `quiz_fishbone_mcq()` | Fishbone MCQ diagram quiz |
| `/quiz-fishbone-fill` | `quiz_fishbone_fill()` | Fishbone fill-blank quiz |
| `/category/NCLEX/category/<category_name>` | `nclex_category_quiz()` | NCLEX category-filtered quiz |
| `/category/Nursing_Certifications/CCRN` | `ccrn_page()` | CCRN practice system landing |
| `/category/Nursing_Certifications/CCRN/category/<category_name>` | `ccrn_category_quiz()` | CCRN filtered quiz |
| `/category/Nursing_Certifications/CFRN` | `cfrn_page()` | CFRN practice system landing |
| `/category/Nursing_Certifications/CFRN/category/<category_name>` | `cfrn_category_quiz()` | CFRN filtered quiz |
| `/category/Adult_Health/module/<int:module_num>` | `adult_health_module_quiz()` | Adult Health module quiz (1–5) |
| `/category/Adult_Health/module/comprehensive` | `adult_health_comprehensive_quiz()` | All Adult Health questions combined |
| `/category/Pharmacology/Comprehensive` | `pharmacology_comprehensive()` | Pharm comprehensive quizzes |
| `/category/Pharmacology/Categories` | `pharmacology_categories()` | Pharm by drug category |

### API Routes

| URL | Returns | Description |
|---|---|---|
| `/api/categories` | JSON | All categories with metadata and module lists |
| `/api/category/<category>/quizzes` | JSON | MCQ and fill-blank quiz lists for a category |
| `/api/nclex/category-stats` | JSON | NCLEX question counts and weights per category |
| `/modules` | JSON | Flat list of all modules (legacy compatibility) |
| `/images/<filename>` | File | Serve images from the `images/` directory |

### URL Query Parameters (quiz pages)

| Parameter | Values | Description |
|---|---|---|
| `quiz_length` | `10`, `25`, `50`, `100`, `full` | Number of questions to serve |
| `autostart` | `true`, `false` | Skip the start screen and begin quiz immediately |
| `is_comprehensive` | `true`, `false` | Flag for comprehensive quiz mode |

---

## Category & Module System

### Categories (folder names in `modules/`)

| Folder Name | Display Name | Notes |
|---|---|---|
| `Adult_Health` | Adult Health | 5-module system filtered by book and chapter |
| `NCLEX` | NCLEX | Weighted by official NCLEX-RN Test Plan |
| `Lab_Values` | Laboratory Values | Includes fill-in-the-blank variant |
| `Patient_Care_Management` | Patient Care Management | Module 1–4 + learning questions |
| `Pharmacology` | Pharmacology | 17 category files + 4 comprehensive quizzes |
| `Nursing_Certifications` | Nursing Certifications | CCRN, CFRN, EKG |

### NCLEX Category Weights (official NCLEX-RN Test Plan)

| Category | Weight |
|---|---|
| Management of Care | 18% |
| Safety and Infection Control | 13% |
| Pharmacological and Parenteral Therapies | 16% |
| Physiological Adaptation | 14% |
| Reduction of Risk Potential | 12% |
| Health Promotion and Maintenance | 9% |
| Psychosocial Integrity | 9% |
| Basic Care and Comfort | 9% |

### CCRN Categories (12 total)

Cardiovascular, Endocrine, Gastrointestinal/Hepatic, Hematologic/Immunologic, Infection/Sepsis, Neurological, Obstetric/Women's Health, Professional Practice/Nursing, Pulmonary/Respiratory, Renal/Urinary, Trauma/Shock, Vascular

### CFRN Domains (5 domains per BCEN Examination Content Outline)

1. General Principles of Flight Transport Nursing Practice
2. Resuscitation Principles
3. Trauma
4. Medical Emergencies
5. Special Populations

Each domain has multiple subcategories. The `"category"` field in JSON uses the format `"Domain; Subcategory"` (e.g., `"Trauma; Neurologic"`).

### Adult Health Modules

| Module | Name | Books/Chapters |
|---|---|---|
| 1 | Tissue Integrity & Safety | Ignatavicus Ch.01,04,10,20,21 / Giddens Ch.26,45 / McCuistion Ch.09,14 |
| 2 | Perfusion | Ignatavicus Ch.27,28,29,31 / Giddens Ch.18 / McCuistion Ch.40,41,43,44,58 |
| 3 | Immunity & Infection | Ignatavicus Ch.03,16,17,19 / Giddens Ch.22,24 / McCuistion Ch.26,30,32,34 |
| 4 | Intracranial Regulation & Palliative Care | Ignatavicus Ch.08,38 / Giddens Ch.13,51 / McCuistion Ch.28,38 |
| 5 | Elimination | Ignatavicus Ch.57,59,60 / Giddens Ch.17 / McCuistion Ch.12 |

---

## Frontend Architecture

- **No JavaScript framework** — all vanilla JS
- **No build step** — files are served as-is; no webpack, Vite, etc.
- **Server-side rendering** — Flask passes `quiz_data` as a Jinja2 template variable; JavaScript reads `window.preloadedQuizData`
- **Progress tracking** — `static/js/progress-store.js` reads/writes `localStorage`
- **PWA** — `static/service-worker.js` handles offline caching; cache version is `v2.3.0`

### Key JavaScript files

| File | Purpose |
|---|---|
| `static/quiz-script.js` | Core quiz engine: question queue, requeue logic, scoring, NCLEX weighting, progress integration |
| `static/quiz-fill-blank.js` | Fill-in-the-blank answer matching and UI |
| `static/quiz-fishbone-mcq.js` | Fishbone diagram MCQ renderer |
| `static/quiz-fishbone-fill.js` | Fishbone diagram fill-blank renderer |
| `static/fishbone-utils.js` | Shared fishbone diagram drawing utilities |
| `static/service-worker.js` | PWA offline support, cache-first for assets, network-first for API |
| `static/js/progress-store.js` | localStorage progress store (per-question mastery tracking) |
| `static/js/pwa-utils.js` | PWA install prompt, motivational quotes, notification helpers |

### Quiz Requeue System (in `quiz-script.js`)

Missed questions are reinjected into the queue based on thresholds:
- 10 questions: fallback to end-of-queue only
- 25 questions: 20% missed (5 questions) → front-of-queue injection
- 50 questions: 16% missed (8 questions) → front-of-queue injection
- 100 questions: 10% missed (10 questions) → front-of-queue injection

Requeued questions are shuffled, and answer positions are re-randomized on each render.

---

## Deployment

The app is deployed on **Vercel** using the configuration in `vercel.json`:

- **Python API:** `api/index.py` is the serverless function entry point
- **Static assets:** `static/`, `modules/`, and `images/` are served as static files
- **All other routes:** Fall through to `api/index.py` for server-side rendering

### vercel.json summary

```json
{
  "builds": [
    { "src": "api/index.py", "use": "@vercel/python" },
    { "src": "static/**", "use": "@vercel/static" },
    { "src": "modules/**", "use": "@vercel/static" },
    { "src": "images/**", "use": "@vercel/static" }
  ]
}
```

> The `modules/` directory is accessible as static files on Vercel — do not store any sensitive data there.

### Service worker cache version

When deploying with changes to static assets, bump `CACHE_VERSION` in `static/service-worker.js` to force browser cache refresh.

---

## Git & Branching

- **Main branch:** `main` (production)
- **Development branches:** prefix with `claude/` for agent-created branches
- **Remote:** `origin` (GitHub — `Shensley102/quiz-app`)

### Branch naming for AI agents

Agent branches follow the pattern: `claude/<description>-<session-id>`
Example: `claude/create-guidelines-file-LztHh`

### Commit conventions

Write clear, descriptive commit messages that explain what changed and why. Common prefixes used in this repo:
- `Add` — new file or feature
- `Update` — modification to existing content
- `Fix` — bug fix or JSON formatting correction

---

## Project-Specific Notes

### JSON formatting is critical

Many past commits have been solely to fix JSON formatting (`Fix JSON formatting in CFRN Question Bank`, etc.). When editing JSON files:
- No trailing commas after the last item in arrays or objects
- Every file must end with exactly one newline character
- Use a JSON linter or the `json.tool` module before committing: `python -m json.tool < file.json`

### `study_tool.py` vs `api/index.py`

`study_tool.py` is a legacy file with a simplified version of the app. **All active development should go into `api/index.py`.** The two files are not kept in sync.

### Category folder names use underscores

URL-facing category names use underscores (e.g., `Adult_Health`, `Nursing_Certifications`). The app uses `urllib.parse.unquote` to handle URL-encoded values and `replace('_', ' ')` for display. When adding a new category:
- Folder name: `My_New_Category` (underscores)
- Display name: defined in `CATEGORY_METADATA` in `api/index.py`

### Fill-in-the-blank answer matching

The fill-in-the-blank system compares normalized input (trimmed, lowercased, stripped of extra spaces) against the `answer` array. Each element in `answer` is a separate acceptable value. For numeric ranges, list each boundary separately: `["135", "145"]`.

### CFRN cache-control header

The CFRN landing page (`/category/Nursing_Certifications/CFRN`) explicitly sets `no-cache, no-store, must-revalidate` headers to ensure question counts always reflect the current JSON file, not a CDN-cached version. This is intentional — do not remove.

### No environment variables required

The application has no environment variables or `.env` files. All configuration is hardcoded in `api/index.py`. Flask debug mode is only enabled in `study_tool.py`; `api/index.py` relies on Vercel's environment.

### PWA app name

The PWA manifest (`static/manifest.json`) registers the app as:
- **Full name:** `Nurse Success Study Hub`
- **Short name:** `Nurse Study`
- **Theme color:** `#2f61f3`
- **Categories:** `education`, `medical`

Maintain consistency with these names when updating templates or marketing copy.

### No test suite

There is no automated test framework in this project. Quality assurance for quiz content relies on JSON schema validation (`static/quiz-content.schema.json`) and manual review. When adding test infrastructure, pytest is the recommended choice for the Flask backend.
