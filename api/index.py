/* Home Page Styling - Fixed to display category images completely */

:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --accent-color: #2e7d32;
    --light-bg: #f5f5f5;
    --border-radius: 16px;
    --shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    --shadow-hover: 0 12px 48px rgba(0, 0, 0, 0.15);
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(180deg, #f8f9ff 0%, #f0f4ff 100%);
    min-height: 100vh;
    color: #333;
}

.container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}

/* ==================== HEADER ==================== */

.header {
    text-align: center;
    margin-bottom: 50px;
    padding: 40px 20px;
}

.header h1 {
    font-size: 2.5rem;
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 15px;
    font-weight: 700;
}

.header p {
    font-size: 1.1rem;
    color: #666;
    font-weight: 500;
}

/* ==================== OFFLINE INDICATOR ==================== */

.offline-indicator {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #ff9800, #f57c00);
    color: white;
    padding: 12px 20px;
    text-align: center;
    font-weight: 600;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.offline-indicator.hidden {
    display: none;
}

/* ==================== CATEGORIES GRID ==================== */

.categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 30px;
    margin-bottom: 40px;
}

/* ==================== CATEGORY CARD ==================== */

.category-card {
    background: white;
    border-radius: var(--border-radius);
    overflow: hidden;
    box-shadow: var(--shadow);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.category-card:hover {
    transform: translateY(-8px);
    box-shadow: var(--shadow-hover);
}

.category-card:active {
    transform: translateY(-4px);
}

/* ==================== CATEGORY IMAGE ==================== */

.category-image-container {
    width: 100%;
    height: 220px;
    background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.category-image-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
}

/* Fallback styling for missing images */
.category-image-container.no-image {
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    color: white;
    font-size: 3rem;
}
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

from flask import Flask, abort, jsonify, render_template, request

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
MODULES_DIR = BASE_DIR / "modules"

app = Flask(
    __name__,
    template_folder=str(TEMPLATES_DIR),
    static_folder=str(STATIC_DIR),
    static_url_path="/static",
)

# Category metadata used for template selection and display copy
CATEGORY_META: Dict[str, Dict[str, str]] = {
    "HESI": {
        "display_name": "HESI Exam Prep",
        "description": "Practice questions for HESI specialty exams including Adult Health, Maternity, and Leadership.",
        "icon": "📋",
        "template": "category.html",
    },
    "Lab_Values": {
        "display_name": "Lab Values",
        "description": "Master essential laboratory values and their clinical significance.",
        "icon": "🧪",
        "template": "lab-values.html",
    },
    "Patient_Care_Management": {
        "display_name": "Patient Care Management",
        "description": "Prioritization, delegation, and clinical decision-making scenarios.",
        "icon": "👥",
        "template": "category.html",
    },
    "Pharmacology": {
        "display_name": "Pharmacology",
        "description": "Drug classifications, mechanisms, and nursing implications.",
        "icon": "💊",
        "template": "pharmacology.html",
    },
    "Nursing_Certifications": {
        "display_name": "Nursing Certifications",
        "description": "Prepare for CCRN and other specialty nursing certification exams.",
        "icon": "🏆",
        "template": "nursing-certifications.html",
    },
}

# Optional descriptions shown on category grid cards
MODULE_DESCRIPTIONS: Dict[str, str] = {
    "CCRN_Test_1_Combined_QA": "Practice exam covering core critical care concepts.",
    "CCRN_Test_2_Combined_QA": "Critical care scenarios focusing on multisystem organ failure.",
    "CCRN_Test_3_Combined_QA": "Advanced topics including pharmacology and professional practice.",
    "NCLEX_Lab_Values": "NCLEX-style multiple choice questions with rationales.",
    "HESI_Comp_Quiz_1": "Comprehensive HESI practice questions from Exit Exam and study guides.",
    "HESI_Comp_Quiz_2": "Comprehensive HESI practice questions from Exit Exam and study guides.",
    "HESI_Comp_Quiz_3": "Comprehensive HESI practice questions from Exit Exam and study guides.",
}


def _read_questions(module_path: Path) -> List[dict]:
    """Return the list of questions from a module JSON file."""
    try:
        with module_path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except FileNotFoundError:
        return []
    except Exception as exc:  # pragma: no cover - defensive logging path
        app.logger.warning("Unable to read %s: %s", module_path, exc)
        return []

    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("questions"), list):
        return payload["questions"]
    return []


def _module_description(module_name: str, category: str) -> str:
    if module_name in MODULE_DESCRIPTIONS:
        return MODULE_DESCRIPTIONS[module_name]
    if category == "Nursing_Certifications":
        return "Certification exam practice questions with detailed rationales."
    if category == "HESI":
        return "HESI exam preparation questions with detailed rationales."
    if category == "Lab_Values":
        return "Lab values practice questions with detailed rationales."
    if category == "Pharmacology":
        return "Pharmacology practice questions covering drug classifications and nursing implications."
    return "Practice questions with detailed rationales to reinforce your understanding."


def _build_module_list(category: str) -> List[Dict[str, str]]:
    """Return module metadata for a category based on available JSON files."""
    category_dir = MODULES_DIR / category
    if not category_dir.exists():
        return []

    modules: List[Dict[str, str]] = []
    for module_path in sorted(category_dir.glob("*.json")):
        module_name = module_path.stem
        questions = _read_questions(module_path)
        modules.append(
            {
                "name": module_name,
                "count": len(questions),
                "description": _module_description(module_name, category),
            }
        )
    return modules


def _load_quiz(category: str, module_name: str) -> Optional[Dict[str, object]]:
    module_path = MODULES_DIR / category / f"{module_name}.json"
    if not module_path.exists():
        return None

    questions = _read_questions(module_path)
    return {"module": module_name, "questions": questions, "total": len(questions)}


@app.route("/")
def home() -> str:
    return render_template("home.html")


@app.route("/category/<category_name>")
def category_page(category_name: str) -> str:
    meta = CATEGORY_META.get(category_name)
    if not meta:
        abort(404)

    template_name = meta.get("template", "category.html")
    context: Dict[str, object] = {}

    if template_name == "category.html":
        modules = _build_module_list(category_name)
        context = {
            "category": category_name,
            "category_data": {
                "display_name": meta["display_name"],
                "description": meta["description"],
                "icon": meta["icon"],
                "modules": modules,
            },
        }

    return render_template(template_name, **context)


@app.route("/quiz")
@app.route("/quiz/<category>/<module_name>")
def quiz(category: Optional[str] = None, module_name: Optional[str] = None) -> str:
    quiz_data = None
    autostart = request.args.get("autostart") in {"1", "true", "True"}
    back_url = None
    back_label = None

    if category and module_name:
        quiz_data = _load_quiz(category, module_name)
        if not quiz_data:
            abort(404)
        back_url = f"/category/{category}"
        back_label = CATEGORY_META.get(category, {}).get("display_name", "Study Hub")

    return render_template(
        "quiz.html",
        quiz_data=quiz_data["questions"] if quiz_data else None,
        module_name=module_name,
        category=category,
        autostart=autostart,
        back_url=back_url,
        back_label=back_label,
    )


/* ==================== CATEGORY INFO ==================== */
@app.route("/quiz-fill-blank")
def quiz_fill_blank() -> str:
    return render_template("quiz-fill-blank.html")


@app.route("/quiz-fishbone-fill")
def quiz_fishbone_fill() -> str:
    return render_template("quiz-fishbone-fill.html")

.category-info {
    padding: 25px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.category-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
}
@app.route("/quiz-fishbone-mcq")
def quiz_fishbone_mcq() -> str:
    return render_template("quiz-fishbone-mcq.html")

.category-icon {
    font-size: 2rem;
    flex-shrink: 0;
}

.category-title {
    font-size: 1.3rem;
    font-weight: 700;
    color: #333;
    margin: 0;
}
@app.route("/pharmacology")
def pharmacology() -> str:
    return render_template("pharmacology.html")

.category-description {
    font-size: 0.95rem;
    color: #666;
    line-height: 1.6;
    margin-bottom: 18px;
    flex-grow: 1;
}

.category-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    transition: all 0.2s ease;
    width: fit-content;
}
@app.route("/pharmacology/comprehensive")
def pharmacology_comprehensive() -> str:
    return render_template("pharmacology-comprehensive-select.html")

.category-link:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.category-link:active {
    transform: translateX(2px);
}
@app.route("/pharmacology/categories")
def pharmacology_categories() -> str:
    return render_template("pharmacology-categories.html")

.category-link::after {
    content: '→';
    font-weight: bold;
}

/* ==================== RESPONSIVE DESIGN ==================== */
@app.route("/api/category/<category_name>/modules")
def api_category_modules(category_name: str):
    meta = CATEGORY_META.get(category_name)
    if not meta:
        abort(404)
    modules = [m["name"] for m in _build_module_list(category_name)]
    return jsonify({"category": category_name, "modules": modules})

@media (max-width: 1024px) {
    .categories-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 25px;
    }

    .header h1 {
        font-size: 2rem;
    }
@app.route("/modules")
def api_all_modules():
    module_names: List[str] = []
    for category in CATEGORY_META:
        module_names.extend([m["name"] for m in _build_module_list(category)])
    return jsonify({"modules": sorted(module_names)})

    .header p {
        font-size: 1rem;
    }
}

@media (max-width: 640px) {
    .container {
        padding: 15px;
    }

    .header {
        margin-bottom: 30px;
        padding: 30px 15px;
    }

    .header h1 {
        font-size: 1.6rem;
    }

    .header p {
        font-size: 0.95rem;
    }

    .categories-grid {
        grid-template-columns: 1fr;
        gap: 20px;
    }

    .category-image-container {
        height: 200px;
    }

    .category-info {
        padding: 20px;
    }

    .category-title {
        font-size: 1.2rem;
    }

    .category-description {
        font-size: 0.9rem;
        margin-bottom: 15px;
    }
}

/* ==================== ACCESSIBILITY ==================== */

@media (prefers-reduced-motion: reduce) {
    .category-card,
    .category-link {
        transition: none;
    }

    .category-card:hover {
        transform: none;
    }

    .category-link:hover {
        transform: none;
    }
}

/* ==================== HIGH CONTRAST MODE ==================== */
@app.route("/api/quiz/<category>/<module_name>")
def api_quiz(category: str, module_name: str):
    quiz_data = _load_quiz(category, module_name)
    if not quiz_data:
        abort(404)
    return jsonify(quiz_data)

@media (prefers-contrast: more) {
    .category-card {
        border: 2px solid #333;
    }

    .category-title {
        font-weight: 900;
    }

    .category-description {
        color: #333;
    }
}

/* ==================== DARK MODE SUPPORT ==================== */

@media (prefers-color-scheme: dark) {
    body {
        background: linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 100%);
        color: #e0e0e0;
    }

    .category-card {
        background: #2a2a2a;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .category-card:hover {
        box-shadow: 0 12px 48px rgba(102, 126, 234, 0.3);
    }

    .category-title {
        color: #e0e0e0;
    }

    .category-description {
        color: #b0b0b0;
    }

    .header h1 {
        -webkit-text-fill-color: white;
    }

    .header p {
        color: #a0a0a0;
    }
}

/* ==================== PRINT STYLES ==================== */

@media print {
    .offline-indicator,
    .category-link {
        display: none;
    }

    .category-card {
        page-break-inside: avoid;
        box-shadow: none;
        border: 1px solid #ddd;
    }

    body {
        background: white;
    }
}
# For local debugging only
if __name__ == "__main__":  # pragma: no cover
    app.run(debug=True, host="0.0.0.0", port=5000)
