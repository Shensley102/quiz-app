# api/index.py

import os
import json
import re
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
from pathlib import Path
from urllib.parse import unquote
from collections import OrderedDict

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# Get the base directory
BASE_DIR = Path(__file__).parent.parent
MODULES_DIR = BASE_DIR / 'modules'

# Category metadata
CATEGORY_METADATA = {
    'Adult_Health': {
        'display_name': 'Adult Health',
        'icon': '🏥',
        'image': '/images/Adult_Health.png',
        'description': 'Adult health nursing concepts and clinical care'
    },
    'NCLEX': {
        'display_name': 'NCLEX',
        'icon': '📋',
        'image': '/images/Nursing_Nclex_Exam_Prep_Image.png',
        'description': 'The Comprehensive Quiz 1, 2, and 3 are questions gathered from NCLEX Exit Exam and NCLEX Comprehensive study guides'
    },
    'Lab_Values': {
        'display_name': 'Laboratory Values',
        'icon': '🧪',
        'image': '/images/Nursing_Lab_Values.png',
        'description': 'Master critical laboratory values for NCLEX exams'
    },
    'Patient_Care_Management': {
        'display_name': 'Patient Care Management',
        'icon': '👥',
        'image': '/images/Nursing_Leadership_Image.png',
        'description': 'Patient care management and nursing leadership'
    },
    'Pharmacology': {
        'display_name': 'Pharmacology',
        'icon': '💊',
        'image': '/images/Nursing_Pharmacology_Image.png',
        'description': 'Comprehensive pharmacology study materials'
    },
    'Nursing_Certifications': {
        'display_name': 'Nursing Certifications',
        'icon': '🏆',
        'image': '/images/Nursing_Advanced_Certifications.png',
        'description': 'CCRN, CFRN, TCEN, and other certification prep'
    }
}

# NCLEX-RN Test Plan Categories with weights
NCLEX_CATEGORIES = {
    'Management of Care': 0.18,
    'Safety and Infection Control': 0.13,
    'Health Promotion and Maintenance': 0.09,
    'Psychosocial Integrity': 0.09,
    'Basic Care and Comfort': 0.09,
    'Pharmacological and Parenteral Therapies': 0.16,
    'Reduction of Risk Potential': 0.12,
    'Physiological Adaptation': 0.14
}

# CFRN Exam Content Categories — ordered by BCEN Examination Content Outline
# Format: "Domain; Subcategory" matching the "category" field in CFRN_Question_Bank.json
CFRN_CATEGORIES = [
    # Domain 1: General Principles of Flight Transport Nursing Practice (28 items)
    'General Principles; Transport Physiology',
    'General Principles; Scene Operations Management',
    'General Principles; Communications',
    'General Principles; Safety and Survival',
    'General Principles; Disaster Management',
    'General Principles; Professional Issues',
    'General Principles; Systems Management',
    # Domain 2: Resuscitation Principles (38 items)
    'Resuscitation Principles; Principles of Assessment and Patient Preparation',
    'Resuscitation Principles; Airway',
    'Resuscitation Principles; Mechanical Ventilation',
    'Resuscitation Principles; Perfusion',
    # Domain 3: Trauma (29 items)
    'Trauma; Principles of Management',
    'Trauma; Neurologic',
    'Trauma; Thoracic',
    'Trauma; Abdominal',
    'Trauma; Musculoskeletal',
    'Trauma; Burn',
    'Trauma; Maxillofacial and Neck',
    # Domain 4: Medical Emergencies (40 items)
    'Medical Emergencies; Neurologic',
    'Medical Emergencies; Cardiovascular',
    'Medical Emergencies; Pulmonary',
    'Medical Emergencies; Abdominal',
    'Medical Emergencies; Electrolyte Disturbances',
    'Medical Emergencies; Metabolic and Endocrine',
    'Medical Emergencies; Hematology',
    'Medical Emergencies; Renal',
    'Medical Emergencies; Infectious and Communicable Diseases',
    'Medical Emergencies; Environmental and Toxicological Emergencies',
    # Domain 5: Special Populations (15 items)
    'Special Populations; Obstetrical Patients',
    'Special Populations; Neonatal / Pediatric',
    'Special Populations; Geriatric',
    'Special Populations; Bariatric',
]

# CCRN Exam Content Categories (category names matching JSON "category" field)
CCRN_CATEGORIES = [
    'Cardiovascular',
    'Endocrine',
    'Gastrointestinal/Hepatic',
    'Hematologic/Immunologic',
    'Infection/Sepsis',
    'Neurological',
    'Obstetric/Women\'s Health',
    'Professional Practice/Nursing',
    'Pulmonary/Respiratory',
    'Renal/Urinary',
    'Trauma/Shock',
    'Vascular'
]

# Adult Health Module Definitions
ADULT_HEALTH_MODULES = {
    1: {
        'name': 'Tissue Integrity & Safety',
        'filters': [
            {'book': 'Ignatavicus Medical-Surgical Nursing', 'chapters': ['01', '04', '10', '20', '21']},
            {'book': 'Giddens Concepts for Nursing Practice', 'chapters': ['26', '45']},
            {'book': 'McCuistion Pharmacology', 'chapters': ['09', '14']}
        ]
    },
    2: {
        'name': 'Perfusion',
        'filters': [
            {'book': 'Ignatavicus Medical-Surgical Nursing', 'chapters': ['27', '28', '29', '31']},
            {'book': 'Giddens Concepts for Nursing Practice', 'chapters': ['18']},
            {'book': 'McCuistion Pharmacology', 'chapters': ['40', '41', '43', '44', '58']}
        ]
    },
    3: {
        'name': 'Immunity & Infection',
        'filters': [
            {'book': 'Ignatavicus Medical-Surgical Nursing', 'chapters': ['03', '16', '17', '19']},
            {'book': 'Giddens Concepts for Nursing Practice', 'chapters': ['22', '24']},
            {'book': 'McCuistion Pharmacology', 'chapters': ['26', '30', '32', '34']}
        ]
    },
    4: {
        'name': 'Intracranial Regulation & Palliative Care',
        'filters': [
            {'book': 'Ignatavicus Medical-Surgical Nursing', 'chapters': ['08', '38']},
            {'book': 'Giddens Concepts for Nursing Practice', 'chapters': ['13', '51']},
            {'book': 'McCuistion Pharmacology', 'chapters': ['28', '38']}
        ]
    },
    5: {
        'name': 'Elimination',
        'filters': [
            {'book': 'Ignatavicus Medical-Surgical Nursing', 'chapters': ['57', '59', '60']},
            {'book': 'Giddens Concepts for Nursing Practice', 'chapters': ['17']},
            {'book': 'McCuistion Pharmacology', 'chapters': ['12']}
        ]
    }
}


def get_categories():
    """Get all module categories (folder names)"""
    if not MODULES_DIR.exists():
        return []
    try:
        return sorted([d.name for d in MODULES_DIR.iterdir()
                      if d.is_dir() and not d.name.startswith('.')])
    except Exception as e:
        print(f"Error reading categories: {e}")
        return []


def get_modules_in_category(category):
    """Get all modules (JSON files) in a specific category"""
    category_path = MODULES_DIR / category
    if not category_path.exists():
        return []

    try:
        modules = []
        for file in sorted(category_path.glob('*.json')):
            modules.append(file.stem)
        return modules
    except Exception as e:
        print(f"Error reading modules: {e}")
        return []


def get_quiz_info(category, module):
    """Get quiz information including type (standard or fill-in-the-blank)"""
    module_path = MODULES_DIR / category / f'{module}.json'

    if not module_path.exists():
        return None

    try:
        with open(module_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        is_fill_blank = 'Fill_In_The_Blank' in module

        return {
            'name': module,
            'type': 'fill-in-the-blank' if is_fill_blank else 'multiple-choice',
            'count': len(data.get('questions', [])),
            'description': data.get('description', '')
        }
    except Exception as e:
        print(f"Error reading {module_path}: {e}")
        return None


def get_category_quizzes(category):
    """Get all quizzes for a category, grouped by type"""
    modules = get_modules_in_category(category)
    quizzes = {
        'multiple-choice': [],
        'fill-in-the-blank': []
    }

    for module in modules:
        info = get_quiz_info(category, module)
        if info:
            quizzes[info['type']].append(info)

    return quizzes


def load_nclex_master_questions():
    """Load the NCLEX Comprehensive Master Categorized questions"""
    master_path = MODULES_DIR / 'NCLEX' / 'NCLEX_Comprehensive_Master_Categorized.json'
    if not master_path.exists():
        return []

    try:
        with open(master_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('questions', [])
    except Exception as e:
        print(f"Error loading NCLEX master questions: {e}")
        return []


def get_nclex_category_stats():
    """Get statistics about questions per NCLEX category from master file"""
    questions = load_nclex_master_questions()
    stats = {}

    for cat in NCLEX_CATEGORIES.keys():
        count = sum(1 for q in questions if q.get('category') == cat)
        stats[cat] = {
            'count': count,
            'weight': NCLEX_CATEGORIES[cat],
            'weight_pct': int(NCLEX_CATEGORIES[cat] * 100)
        }

    return stats


def load_cfrn_questions():
    """Load the CFRN Question Bank questions"""
    cfrn_path = MODULES_DIR / 'Nursing_Certifications' / 'CFRN_Question_Bank.json'
    if not cfrn_path.exists():
        return []

    try:
        with open(cfrn_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('questions', [])
    except Exception as e:
        print(f"Error loading CFRN questions: {e}")
        return []


def get_cfrn_category_stats():
    """Get question counts per CFRN category, ordered by BCEN domain sequence."""
    questions = load_cfrn_questions()
    stats = OrderedDict()
    for cat in CFRN_CATEGORIES:
        count = sum(1 for q in questions if q.get('category') == cat)
        stats[cat] = count
    return stats


def get_cfrn_domain_totals():
    """
    Returns counts grouped by top-level BCEN domain, derived from the question bank.
    Domain name is everything before the first '; ' in the category string.
    Also returns the grand total.
    """
    questions = load_cfrn_questions()

    DOMAIN_ORDER = [
        'General Principles',
        'Resuscitation Principles',
        'Trauma',
        'Medical Emergencies',
        'Special Populations',
    ]

    counts = {}
    for q in questions:
        cat = q.get('category', '')
        domain = cat.split('; ')[0].strip() if '; ' in cat else cat.strip()
        if domain:
            counts[domain] = counts.get(domain, 0) + 1

    # Build ordered dict with all known domains (0 if none found)
    domain_totals = OrderedDict()
    for d in DOMAIN_ORDER:
        domain_totals[d] = counts.get(d, 0)

    # Catch any unexpected domains not in the canonical list
    for d, c in counts.items():
        if d not in domain_totals:
            domain_totals[d] = c

    grand_total = sum(domain_totals.values())
    return domain_totals, grand_total


def load_ccrn_comprehensive_questions():
    """Load the CCRN Comprehensive questions"""
    ccrn_path = MODULES_DIR / 'Nursing_Certifications' / 'CCRN_Comprehensive.json'
    if not ccrn_path.exists():
        return []

    try:
        with open(ccrn_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return data.get('questions', [])
    except Exception as e:
        print(f"Error loading CCRN Comprehensive questions: {e}")
        return []


def get_ccrn_category_stats():
    """Get statistics about questions per CCRN category"""
    questions = load_ccrn_comprehensive_questions()
    stats = {}

    for cat in CCRN_CATEGORIES:
        count = sum(1 for q in questions if q.get('category') == cat)
        stats[cat] = count

    return stats


def load_adult_health_questions():
    """Load the Adult Health master question bank"""
    adult_health_path = MODULES_DIR / 'Adult_Health' / 'Adult_Health.json'
    if not adult_health_path.exists():
        print(f"[Adult Health] File not found: {adult_health_path}")
        return []

    try:
        with open(adult_health_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('questions', [])
    except Exception as e:
        print(f"Error loading Adult Health questions: {e}")
        return []


def extract_chapter_number(category_str):
    """
    Extract chapter/concept number from category string.
    Examples:
      "Chapter 47: Concepts of Care..." -> "47"
      "Chapter 01: Introduction..." -> "01"
      "Concept 26: Tissue Integrity" -> "26"
    """
    if not category_str:
        return None

    match = re.match(r'^(?:Chapter|Concept)\s+(\d+)', category_str, re.IGNORECASE)
    if match:
        return match.group(1).zfill(2)
    return None


def filter_adult_health_questions(questions, module_num):
    """Filter questions for a specific Adult Health module based on book and chapter/concept."""
    if module_num not in ADULT_HEALTH_MODULES:
        return []

    module_def = ADULT_HEALTH_MODULES[module_num]
    filters = module_def['filters']

    filtered = []
    for q in questions:
        q_book = q.get('book', '')
        q_category = q.get('category', '')
        q_chapter = extract_chapter_number(q_category)

        for f in filters:
            if q_book == f['book']:
                for ch in f['chapters']:
                    if q_chapter == ch or q_chapter == ch.zfill(2) or q_chapter == ch.lstrip('0'):
                        filtered.append(q)
                        break
                else:
                    continue
                break

    return filtered


def get_adult_health_module_stats():
    """Get question counts for each Adult Health module"""
    questions = load_adult_health_questions()
    stats = {}

    for module_num, module_def in ADULT_HEALTH_MODULES.items():
        filtered = filter_adult_health_questions(questions, module_num)
        stats[module_num] = {
            'name': module_def['name'],
            'count': len(filtered)
        }

    return stats


# ==================== ROUTES ====================

@app.route('/')
def home():
    """Home page with all categories"""
    try:
        categories = get_categories()
        return render_template('home.html', categories=categories)
    except Exception as e:
        print(f"Error in home route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/category/<category>')
def category(category):
    """Category landing page - shows available quizzes"""
    try:
        category = unquote(category)
        categories = get_categories()
        category_exists = category in categories or category in CATEGORY_METADATA

        if not category_exists:
            print(f"Category '{category}' not found. Available: {categories}")
            return redirect(url_for('home'))

        quizzes = get_category_quizzes(category)
        metadata = CATEGORY_METADATA.get(category, {})
        category_data = {
            'display_name': metadata.get('display_name', category.replace('_', ' ')),
            'icon': metadata.get('icon', '📚'),
            'image': metadata.get('image', None),
            'description': metadata.get('description', ''),
            'modules': quizzes.get('multiple-choice', []) + quizzes.get('fill-in-the-blank', [])
        }

        print(f"Category: {category}, Modules: {len(category_data['modules'])}")

        has_mc = len(quizzes.get('multiple-choice', [])) > 0
        has_fb = len(quizzes.get('fill-in-the-blank', [])) > 0

        if category == 'Adult_Health':
            module_stats = get_adult_health_module_stats()
            total_count = sum(m['count'] for m in module_stats.values() if m)
            return render_template('adult-health.html', quizzes=quizzes, module_stats=module_stats, total_count=total_count)

        if category == 'NCLEX':
            category_stats = get_nclex_category_stats()
            total_questions = sum(s['count'] for s in category_stats.values())
            return render_template('NCLEX-Landing.html',
                                   category_stats=category_stats,
                                   nclex_categories=NCLEX_CATEGORIES,
                                   total_questions=total_questions,
                                   quizzes=quizzes)

        if category == 'Lab_Values' and has_mc and has_fb:
            return render_template('lab-values.html', quizzes=quizzes)

        if category == 'Nursing_Certifications':
            return render_template('nursing-certifications.html', quizzes=quizzes)

        if category == 'Pharmacology':
            return render_template('pharmacology.html', quizzes=quizzes)

        return render_template('category.html', category=category, category_data=category_data, quizzes=quizzes)
    except Exception as e:
        print(f"Error in category route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/NCLEX/category/<category_name>')
def nclex_category_quiz(category_name):
    """NCLEX category-specific quiz - filters questions by NCLEX category"""
    try:
        category_name = unquote(category_name)

        if category_name not in NCLEX_CATEGORIES:
            print(f"Invalid NCLEX category: {category_name}")
            return redirect(url_for('category', category='NCLEX'))

        questions = load_nclex_master_questions()
        filtered_questions = [q for q in questions if q.get('category') == category_name]

        if not filtered_questions:
            print(f"No questions found for category: {category_name}")
            return redirect(url_for('category', category='NCLEX'))

        quiz_data = {
            'module': f'NCLEX_{category_name.replace(" ", "_")}',
            'questions': filtered_questions
        }

        quiz_length = request.args.get('quiz_length', 'full')
        autostart = request.args.get('autostart', 'false').lower() == 'true'

        return render_template('quiz.html',
                               quiz_data=quiz_data,
                               module_name=f'NCLEX - {category_name}',
                               category='NCLEX',
                               back_url='/category/NCLEX',
                               back_label='NCLEX Learning Page',
                               autostart=autostart,
                               is_category_quiz=True,
                               quiz_length=quiz_length)
    except Exception as e:
        print(f"Error in nclex_category_quiz route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/Nursing_Certifications/CCRN')
def ccrn_page():
    """CCRN certification practice system page"""
    try:
        category_stats = get_ccrn_category_stats()
        total_questions = sum(category_stats.values())
        return render_template('ccrn.html',
                               category_stats=category_stats,
                               ccrn_categories=CCRN_CATEGORIES,
                               total_questions=total_questions)
    except Exception as e:
        print(f"Error in ccrn_page route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/category/Nursing_Certifications/CCRN/category/<category_name>')
def ccrn_category_quiz(category_name):
    """CCRN category-specific quiz - filters questions by CCRN category"""
    try:
        category_name = unquote(category_name)

        if category_name not in CCRN_CATEGORIES:
            print(f"Invalid CCRN category: {category_name}")
            return redirect(url_for('ccrn_page'))

        questions = load_ccrn_comprehensive_questions()
        filtered_questions = [q for q in questions if q.get('category') == category_name]

        if not filtered_questions:
            print(f"No questions found for CCRN category: {category_name}")
            return redirect(url_for('ccrn_page'))

        quiz_data = {
            'module': f'CCRN_{category_name.replace(" ", "_").replace("/", "_")}',
            'questions': filtered_questions
        }

        quiz_length = request.args.get('quiz_length', 'full')
        autostart = request.args.get('autostart', 'false').lower() == 'true'

        return render_template('quiz.html',
                               quiz_data=quiz_data,
                               module_name=f'CCRN - {category_name}',
                               category='Nursing_Certifications',
                               back_url='/category/Nursing_Certifications/CCRN',
                               back_label='CCRN Practice System',
                               autostart=autostart,
                               is_category_quiz=True,
                               quiz_length=quiz_length)
    except Exception as e:
        print(f"Error in ccrn_category_quiz route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/Nursing_Certifications/CFRN')
def cfrn_page():
    """CFRN certification practice system page"""
    try:
        category_stats = get_cfrn_category_stats()
        domain_totals, total_questions = get_cfrn_domain_totals()
        response = render_template('cfrn.html',
                               category_stats=category_stats,
                               cfrn_categories=CFRN_CATEGORIES,
                               total_questions=total_questions,
                               domain_totals=domain_totals)
        from flask import make_response
        resp = make_response(response)
        # Prevent edge/CDN caching so counts always reflect the current JSON
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp
    except Exception as e:
        print(f"Error in cfrn_page route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/category/Nursing_Certifications/CFRN/category/<category_name>')
def cfrn_category_quiz(category_name):
    """CFRN category-specific quiz - filters questions by CFRN category"""
    try:
        category_name = unquote(category_name)

        # Validate against real BCEN category strings
        if category_name not in CFRN_CATEGORIES:
            print(f"Invalid CFRN category: {category_name}")
            return redirect(url_for('cfrn_page'))

        questions = load_cfrn_questions()
        filtered_questions = [q for q in questions if q.get('category') == category_name]

        if not filtered_questions:
            print(f"No questions found for CFRN category: {category_name}")
            return redirect(url_for('cfrn_page'))

        quiz_data = {
            'module': f'CFRN_{category_name.replace(" ", "_").replace(";", "").replace("/", "_")}',
            'questions': filtered_questions
        }

        quiz_length = request.args.get('quiz_length', 'full')
        autostart = request.args.get('autostart', 'false').lower() == 'true'

        # Show only the subcategory part (after "; ") as the quiz title
        subcat = category_name.split('; ')[1] if '; ' in category_name else category_name

        return render_template('quiz.html',
                               quiz_data=quiz_data,
                               module_name=f'CFRN - {subcat}',
                               category='Nursing_Certifications',
                               back_url='/category/Nursing_Certifications/CFRN',
                               back_label='CFRN Practice System',
                               autostart=autostart,
                               is_category_quiz=True,
                               quiz_length=quiz_length)
    except Exception as e:
        print(f"Error in cfrn_category_quiz route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/Adult_Health/module/comprehensive')
def adult_health_comprehensive_quiz():
    """Adult Health comprehensive quiz - combines ALL questions from all 5 modules"""
    try:
        all_questions = load_adult_health_questions()

        combined_questions = []
        seen_ids = set()

        for module_num in ADULT_HEALTH_MODULES.keys():
            filtered = filter_adult_health_questions(all_questions, module_num)
            for q in filtered:
                q_id = q.get('id', q.get('stem', ''))
                if q_id not in seen_ids:
                    combined_questions.append(q)
                    seen_ids.add(q_id)

        if not combined_questions:
            print("No questions found for Adult Health Comprehensive")
            return redirect(url_for('category', category='Adult_Health'))

        quiz_data = {
            'module': 'Adult_Health_Comprehensive',
            'questions': combined_questions
        }

        quiz_length = request.args.get('quiz_length', '10')
        autostart = request.args.get('autostart', 'false').lower() == 'true'

        return render_template('quiz.html',
                               quiz_data=quiz_data,
                               module_name='Adult Health: All Modules Combined',
                               category='Adult_Health',
                               back_url='/category/Adult_Health',
                               back_label='Adult Health',
                               autostart=autostart,
                               is_category_quiz=True,
                               quiz_length=quiz_length)
    except Exception as e:
        print(f"Error in adult_health_comprehensive_quiz route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/Adult_Health/module/<int:module_num>')
def adult_health_module_quiz(module_num):
    """Adult Health module-specific quiz - filters questions by book and chapter/concept"""
    try:
        if module_num not in ADULT_HEALTH_MODULES:
            print(f"Invalid Adult Health module: {module_num}")
            return redirect(url_for('category', category='Adult_Health'))

        questions = load_adult_health_questions()
        filtered_questions = filter_adult_health_questions(questions, module_num)

        if not filtered_questions:
            print(f"No questions found for Adult Health module {module_num}")
            return redirect(url_for('category', category='Adult_Health'))

        module_def = ADULT_HEALTH_MODULES[module_num]

        quiz_data = {
            'module': f'Adult_Health_Module_{module_num}',
            'questions': filtered_questions
        }

        quiz_length = request.args.get('quiz_length', '10')
        autostart = request.args.get('autostart', 'false').lower() == 'true'

        return render_template('quiz.html',
                               quiz_data=quiz_data,
                               module_name=f'Module {module_num}: {module_def["name"]}',
                               category='Adult_Health',
                               back_url='/category/Adult_Health',
                               back_label='Adult Health',
                               autostart=autostart,
                               is_category_quiz=True,
                               quiz_length=quiz_length)
    except Exception as e:
        print(f"Error in adult_health_module_quiz route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/Pharmacology/Comprehensive')
def pharmacology_comprehensive():
    """Comprehensive Pharmacology Quizzes page"""
    try:
        return render_template('pharmacology-comprehensive.html')
    except Exception as e:
        print(f"Error in pharmacology_comprehensive route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/category/Pharmacology/Categories')
def pharmacology_categories():
    """Pharmacology by Category page"""
    try:
        return render_template('pharmacology-categories.html')
    except Exception as e:
        print(f"Error in pharmacology_categories route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/quiz/<category>/<module>')
def quiz(category, module):
    """Quiz page for multiple choice"""
    try:
        category = unquote(category)
        module = unquote(module)

        categories = get_categories()
        category_exists = category in categories or category in CATEGORY_METADATA

        if not category_exists:
            return redirect(url_for('home'))

        if 'Fill_In_The_Blank' in module:
            return redirect(url_for('quiz_fill_blank', category=category, module=module))

        module_path = MODULES_DIR / category / f'{module}.json'

        if not module_path.exists():
            return redirect(url_for('category', category=category))

        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)

        if isinstance(quiz_data, list):
            quiz_data = {'questions': quiz_data}

        autostart = request.args.get('autostart', 'false').lower() == 'true'
        is_comprehensive = request.args.get('is_comprehensive', 'false').lower() == 'true'
        quiz_length = request.args.get('quiz_length', 'full')

        metadata = CATEGORY_METADATA.get(category, {})

        if 'CCRN' in module and category == 'Nursing_Certifications':
            back_url = '/category/Nursing_Certifications/CCRN'
            back_label = 'CCRN Practice System'
        elif 'CFRN' in module and category == 'Nursing_Certifications':
            back_url = '/category/Nursing_Certifications/CFRN'
            back_label = 'CFRN Practice System'
        elif module.startswith('Pharm_Quiz_') and category == 'Pharmacology':
            back_url = '/category/Pharmacology/Comprehensive'
            back_label = 'Comprehensive Pharmacology Quizzes'
        elif category == 'Pharmacology' and module.endswith('_Pharm'):
            back_url = '/category/Pharmacology/Categories'
            back_label = 'Pharmacology by Category'
        elif category == 'NCLEX' and module == 'NCLEX_Comprehensive_Master_Categorized':
            back_url = '/category/NCLEX'
            back_label = 'NCLEX Learning Page'
        else:
            back_url = f'/category/{category}'
            back_label = metadata.get('display_name', category.replace('_', ' '))

        return render_template('quiz.html',
                               quiz_data=quiz_data,
                               module_name=module,
                               category=category,
                               back_url=back_url,
                               back_label=back_label,
                               autostart=autostart,
                               is_comprehensive=is_comprehensive,
                               quiz_length=quiz_length)
    except Exception as e:
        print(f"Error in quiz route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/quiz-fill-blank/<category>/<module>')
def quiz_fill_blank(category, module):
    """Quiz page for fill-in-the-blank"""
    try:
        category = unquote(category)
        module = unquote(module)

        categories = get_categories()

        if category not in categories:
            return redirect(url_for('home'))

        if 'Fill_In_The_Blank' not in module:
            module = f'{module}_Fill_In_The_Blank'

        module_path = MODULES_DIR / category / f'{module}.json'

        if not module_path.exists():
            return redirect(url_for('category', category=category))

        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)

        metadata = CATEGORY_METADATA.get(category, {})
        back_url = f'/category/{category}'
        back_label = metadata.get('display_name', category.replace('_', ' '))

        return render_template('quiz-fill-blank.html',
                               quiz_data=quiz_data,
                               module_name=module,
                               category=category,
                               back_url=back_url,
                               back_label=back_label)
    except Exception as e:
        print(f"Error in quiz_fill_blank route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/quiz-fishbone-mcq')
def quiz_fishbone_mcq():
    """Fishbone MCQ quiz page"""
    try:
        return render_template('quiz-fishbone-mcq.html')
    except Exception as e:
        print(f"Error in quiz_fishbone_mcq route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/quiz-fishbone-fill')
def quiz_fishbone_fill():
    """Fishbone fill-in-the-blank quiz page"""
    try:
        return render_template('quiz-fishbone-fill.html')
    except Exception as e:
        print(f"Error in quiz_fishbone_fill route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/categories')
def api_categories():
    """API endpoint to get all categories with metadata"""
    try:
        categories_list = get_categories()
        result = {}

        for category in categories_list:
            modules = get_modules_in_category(category)
            metadata = CATEGORY_METADATA.get(category, {})

            result[category] = {
                'display_name': metadata.get('display_name', category.replace('_', ' ')),
                'icon': metadata.get('icon', '📚'),
                'image': metadata.get('image', None),
                'description': metadata.get('description', ''),
                'modules': modules
            }

        return jsonify(result)
    except Exception as e:
        print(f"Error in api_categories: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/category/<category>/quizzes')
def api_category_quizzes(category):
    """API endpoint to get quizzes for a category"""
    try:
        category = unquote(category)
        categories = get_categories()

        if category not in categories:
            return jsonify({'error': 'Category not found'}), 404

        quizzes = get_category_quizzes(category)
        return jsonify(quizzes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/nclex/category-stats')
def api_nclex_category_stats():
    """API endpoint to get NCLEX category statistics"""
    try:
        stats = get_nclex_category_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/modules')
def modules():
    """Get all available modules (backward compatibility)"""
    try:
        all_modules = []
        for category in get_categories():
            modules_list = get_modules_in_category(category)
            regular_modules = [m for m in modules_list if 'Fill_In_The_Blank' not in m]
            all_modules.extend(regular_modules)

        return jsonify({'modules': sorted(all_modules)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/images/<path:filename>')
def serve_images(filename):
    images_dir = BASE_DIR / 'images'
    return send_from_directory(images_dir, filename)
