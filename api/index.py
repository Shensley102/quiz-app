# api/index.py
import json
import os
import random
from collections import defaultdict
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, url_for

app = Flask(
    __name__,
    static_folder="../static",
    template_folder="../templates",
)

ROOT_DIR = Path(__file__).resolve().parent.parent
MODULES_DIR = ROOT_DIR / "modules"

# --- NCLEX category weightings (used by the comprehensive quiz page) ---
# These are practice-weight defaults to approximate the NCLEX Client Needs framework.
NCLEX_CATEGORY_WEIGHTS = {
    "Management of Care": 18,
    "Safety and Infection Control": 13,
    "Health Promotion and Maintenance": 9,
    "Psychosocial Integrity": 9,
    "Basic Care and Comfort": 9,
    "Pharmacological and Parenteral Therapies": 16,
    "Reduction of Risk Potential": 12,
    "Physiological Adaptation": 14,
}

# --- Category metadata used for cards + headers ---
CATEGORY_METADATA = {
    "NCLEX": {
        "display_name": "NCLEX Comprehensive System",
        "subtitle": "NCLEX-weighted practice with performance tracking across all 8 test plan categories",
        "description": (
            "Take a comprehensive quiz with questions distributed according to NCLEX-RN client needs categories. "
            "Track performance across categories to identify areas needing more practice."
        ),
        "hero_image": "/images/Nursing_Nclex_Exam_Prep_Image.png",
        "icon": "🎯",
    },
    "Lab_Values": {
        "display_name": "Lab Values",
        "subtitle": "Practice common lab values and interpretation",
        "description": "Study and quiz yourself on key nursing lab values.",
        "hero_image": "/images/Nursing_Lab_Values.png",
        "icon": "🧪",
    },
    "Pharmacology": {
        "display_name": "Pharmacology",
        "subtitle": "Medication classes and nursing considerations",
        "description": "Practice pharmacology by category or comprehensive sets.",
        "hero_image": "/images/Nursing_Pharmacology_Image.png",
        "icon": "💊",
    },
    "Patient_Care_Management": {
        "display_name": "Patient Care Management",
        "subtitle": "Core nursing management modules",
        "description": "Practice patient care management concepts.",
        "hero_image": "/images/Nursing_Leadership_Image.png",
        "icon": "🩺",
    },
    "Nursing_Certifications": {
        "display_name": "Nursing Certifications",
        "subtitle": "Practice certification-style exams",
        "description": "Practice questions for advanced nursing certifications.",
        "hero_image": "/images/Nursing_Advanced_Certifications.png",
        "icon": "🏅",
    },
}

# Master module name/path for the NCLEX comprehensive pool
NCLEX_MASTER_MODULE_NAME = "NCLEX_Comprehensive_Master_Categorized"
NCLEX_MASTER_MODULE_PATH = MODULES_DIR / "NCLEX" / f"{NCLEX_MASTER_MODULE_NAME}.json"


def list_categories():
    """List top-level category folders in /modules."""
    if not MODULES_DIR.exists():
        return []
    categories = []
    for item in MODULES_DIR.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            categories.append(item.name)
    categories.sort()
    return categories


def list_modules_for_category(category_name):
    """List JSON module files for a given category folder."""
    category_dir = MODULES_DIR / category_name
    if not category_dir.exists() or not category_dir.is_dir():
        return []
    modules = []
    for f in category_dir.glob("*.json"):
        modules.append(f.stem)
    modules.sort()
    return modules


def load_module_json(category, module_name):
    """Load a module JSON file from /modules/<category>/<module_name>.json."""
    module_path = MODULES_DIR / category / f"{module_name}.json"
    if not module_path.exists():
        raise FileNotFoundError(f"Module not found: {module_path}")
    with module_path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def is_fill_in_blank_module(module_json):
    """Determine if module is fill-in-the-blank."""
    # Supports both:
    #   {"questions":[{"question":"...", "answer":"..."}]}
    # or lists directly
    questions = module_json.get("questions") if isinstance(module_json, dict) else module_json
    if not questions:
        return False
    first = questions[0]
    return isinstance(first, dict) and ("answer" in first) and ("question" in first)


def normalize_questions(module_json):
    """Return questions list regardless of whether module JSON is dict or list."""
    if isinstance(module_json, dict):
        return module_json.get("questions", [])
    if isinstance(module_json, list):
        return module_json
    return []


def get_category_meta(category):
    """Return metadata dict for a category."""
    meta = CATEGORY_METADATA.get(category)
    if meta:
        return meta
    # Fallback metadata if not specified
    return {
        "display_name": category.replace("_", " "),
        "subtitle": "",
        "description": "",
        "hero_image": "",
        "icon": "📚",
    }


@app.route("/")
def home():
    categories = list_categories()
    cards = []
    for cat in categories:
        cards.append({"category": cat, **get_category_meta(cat)})
    # Prefer a home template if present; otherwise redirect to NCLEX category
    try:
        return render_template("home.html", categories=cards)
    except Exception:
        return redirect(url_for("category_page", category="NCLEX"))


@app.route("/api/categories")
def api_categories():
    categories = list_categories()
    payload = []
    for cat in categories:
        meta = get_category_meta(cat)
        payload.append(
            {
                "category": cat,
                "display_name": meta.get("display_name", cat),
                "subtitle": meta.get("subtitle", ""),
                "description": meta.get("description", ""),
                "hero_image": meta.get("hero_image", ""),
                "icon": meta.get("icon", "📚"),
                "modules": list_modules_for_category(cat),
            }
        )
    return jsonify(payload)


@app.route("/category/<category>")
def category_page(category):
    # Special landing for NCLEX
    if category == "NCLEX":
        meta = get_category_meta("NCLEX")
        # Render dedicated landing template
        return render_template(
            "NCLEX-Landing.html",
            category="NCLEX",
            meta=meta,
            weights=NCLEX_CATEGORY_WEIGHTS,
        )

    meta = get_category_meta(category)
    modules = list_modules_for_category(category)
    module_cards = [{"name": m, "url": url_for("quiz_page", category=category, module_name=m)} for m in modules]
    return render_template(
        "category.html",
        category=category,
        meta=meta,
        modules=module_cards,
    )


@app.route("/category/NCLEX/NCLEX_Comprehensive")
def nclex_comprehensive():
    # A dedicated page for selecting weighted quiz length
    meta = get_category_meta("NCLEX")
    return render_template(
        "nclex-comprehensive.html",
        category="NCLEX",
        meta=meta,
        weights=NCLEX_CATEGORY_WEIGHTS,
    )


@app.route("/category/NCLEX/category/<category_name>")
def nclex_practice_by_category(category_name):
    """
    Start a quiz filtered by a single NCLEX category (Client Needs category).
    Pulls from the master pool file and filters by `nclex_category` field.
    """
    if not NCLEX_MASTER_MODULE_PATH.exists():
        return "NCLEX master module not found.", 404

    with NCLEX_MASTER_MODULE_PATH.open("r", encoding="utf-8") as fp:
        master = json.load(fp)

    questions = normalize_questions(master)
    filtered = [q for q in questions if q.get("nclex_category") == category_name]

    if not filtered:
        return f"No questions found for category: {category_name}", 404

    # Preload quiz data for quiz.html
    preloaded = {
        "moduleName": f"{category_name} Practice",
        "questions": filtered,
    }
    return render_template(
        "quiz.html",
        category="NCLEX",
        module_name=f"{NCLEX_MASTER_MODULE_NAME}__filtered__{category_name}",
        module_display_name=f"{category_name} Practice",
        preloaded_quiz_data=json.dumps(preloaded),
        back_url=url_for("category_page", category="NCLEX"),
    )


@app.route("/quiz/<category>/<module_name>")
def quiz_page(category, module_name):
    """Render quiz page for a module."""
    try:
        module_json = load_module_json(category, module_name)
    except FileNotFoundError:
        return "Module not found.", 404

    if is_fill_in_blank_module(module_json):
        return redirect(url_for("quiz_fill_blank_page", category=category, module_name=module_name))

    questions = normalize_questions(module_json)
    module_display_name = module_json.get("title", module_name.replace("_", " ")) if isinstance(module_json, dict) else module_name.replace("_", " ")

    # Determine back link
    back_url = url_for("category_page", category=category)

    preloaded = {
        "moduleName": module_display_name,
        "questions": questions,
    }

    return render_template(
        "quiz.html",
        category=category,
        module_name=module_name,
        module_display_name=module_display_name,
        preloaded_quiz_data=json.dumps(preloaded),
        back_url=back_url,
    )


@app.route("/quiz-fill-blank/<category>/<module_name>")
def quiz_fill_blank_page(category, module_name):
    """Render fill-in-the-blank quiz page for a module."""
    try:
        module_json = load_module_json(category, module_name)
    except FileNotFoundError:
        return "Module not found.", 404

    questions = normalize_questions(module_json)
    module_display_name = module_json.get("title", module_name.replace("_", " ")) if isinstance(module_json, dict) else module_name.replace("_", " ")

    preloaded = {
        "moduleName": module_display_name,
        "questions": questions,
    }

    return render_template(
        "quiz-fill-blank.html",
        category=category,
        module_name=module_name,
        module_display_name=module_display_name,
        preloaded_quiz_data=json.dumps(preloaded),
        back_url=url_for("category_page", category=category),
    )


@app.route("/api/quiz/<category>/<module_name>")
def api_quiz(category, module_name):
    """Return module JSON as API."""
    try:
        module_json = load_module_json(category, module_name)
    except FileNotFoundError:
        return jsonify({"error": "Module not found"}), 404
    return jsonify(module_json)


def weighted_sample_counts(total_questions, weights_dict):
    """
    Return integer counts per category based on weights.
    Ensures sum == total_questions.
    """
    categories = list(weights_dict.keys())
    weights = [weights_dict[c] for c in categories]
    total_weight = sum(weights)
    raw = [(total_questions * w) / total_weight for w in weights]
    counts = [int(x) for x in raw]
    # distribute remainder
    remainder = total_questions - sum(counts)
    # assign remainder to largest fractional parts
    frac = [(raw[i] - counts[i], i) for i in range(len(raw))]
    frac.sort(reverse=True)
    for k in range(remainder):
        counts[frac[k][1]] += 1
    return dict(zip(categories, counts))


def build_weighted_quiz_from_master(total_questions):
    """Build a weighted quiz from the master NCLEX pool."""
    if not NCLEX_MASTER_MODULE_PATH.exists():
        raise FileNotFoundError("NCLEX master module not found.")

    with NCLEX_MASTER_MODULE_PATH.open("r", encoding="utf-8") as fp:
        master = json.load(fp)

    all_questions = normalize_questions(master)
    # bucket by category
    buckets = defaultdict(list)
    for q in all_questions:
        cat = q.get("nclex_category") or q.get("category") or "Uncategorized"
        buckets[cat].append(q)

    desired = weighted_sample_counts(total_questions, NCLEX_CATEGORY_WEIGHTS)

    selected = []
    for cat, count in desired.items():
        pool = buckets.get(cat, [])
        if not pool:
            continue
        if count >= len(pool):
            selected.extend(pool)
        else:
            selected.extend(random.sample(pool, count))

    random.shuffle(selected)
    return selected


@app.route("/quiz/NCLEX/<module_name>/weighted")
def nclex_weighted_quiz(module_name):
    """
    Start a weighted quiz run from the master pool.
    `module_name` is expected to be the master name, but we accept any.
    Query param: ?n=25 (default 25)
    """
    try:
        n = int(request.args.get("n", "25"))
    except ValueError:
        n = 25

    if n <= 0:
        n = 25

    questions = build_weighted_quiz_from_master(n)

    preloaded = {
        "moduleName": f"NCLEX Comprehensive ({n} Questions)",
        "questions": questions,
        "isWeightedComprehensive": True,
        "weights": NCLEX_CATEGORY_WEIGHTS,
    }

    return render_template(
        "quiz.html",
        category="NCLEX",
        module_name=f"{NCLEX_MASTER_MODULE_NAME}__weighted__{n}",
        module_display_name=f"NCLEX Comprehensive ({n} Questions)",
        preloaded_quiz_data=json.dumps(preloaded),
        back_url=url_for("nclex_comprehensive"),
    )


@app.errorhandler(404)
def not_found(e):
    try:
        return render_template("404.html"), 404
    except Exception:
        return "Not Found", 404


if __name__ == "__main__":
    app.run(debug=True)
