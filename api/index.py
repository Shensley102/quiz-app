# api/index.py

import os
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for
from pathlib import Path
from urllib.parse import unquote

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# Get the base directory
BASE_DIR = Path(__file__).parent.parent
MODULES_DIR = BASE_DIR / 'modules'

# Category metadata
CATEGORY_METADATA = {
    'NCLEX': {
        'display_name': 'NCLEX',
        'icon': '📋',
        'image': '/images/Nursing_Hesi_Exam_Prep_Image.png',
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
        # Decode URL-encoded category names (e.g., "Patient_Care_Management" or spaces)
        category = unquote(category)
        
        categories = get_categories()
        
        # Check if category exists in filesystem OR in metadata (for hardcoded categories)
        category_exists = category in categories or category in CATEGORY_METADATA
        
        if not category_exists:
            print(f"Category '{category}' not found. Available: {categories}")
            return redirect(url_for('home'))
        
        quizzes = get_category_quizzes(category)
        
        # Get category metadata
        metadata = CATEGORY_METADATA.get(category, {})
        category_data = {
            'display_name': metadata.get('display_name', category.replace('_', ' ')),
            'icon': metadata.get('icon', '📚'),
            'image': metadata.get('image', None),
            'description': metadata.get('description', ''),
            'modules': quizzes.get('multiple-choice', []) + quizzes.get('fill-in-the-blank', [])
        }
        
        print(f"Category: {category}, Modules: {len(category_data['modules'])}")
        
        # Check if this is Lab Values with multiple quiz types
        has_mc = len(quizzes.get('multiple-choice', [])) > 0
        has_fb = len(quizzes.get('fill-in-the-blank', [])) > 0
        
        # ========== Use special template for NCLEX - the new landing page ==========
        if category == 'NCLEX':
            # Load category stats for display
            category_stats = get_nclex_category_stats()
            total_questions = sum(s['count'] for s in category_stats.values())
            return render_template('NCLEX-Landing.html',
                                   category_stats=category_stats,
                                   nclex_categories=NCLEX_CATEGORIES,
                                   total_questions=total_questions,
                                   quizzes=quizzes)
        
        # Use special template for Lab Values
        if category == 'Lab_Values' and has_mc and has_fb:
            return render_template('lab-values.html', quizzes=quizzes)
        
        # Use special template for Nursing Certifications
        if category == 'Nursing_Certifications':
            return render_template('nursing-certifications.html', quizzes=quizzes)
        
        # Use special template for Pharmacology
        if category == 'Pharmacology':
            return render_template('pharmacology.html', quizzes=quizzes)
        
        # Use generic category template for others
        return render_template('category.html', category=category, category_data=category_data, quizzes=quizzes)
    except Exception as e:
        print(f"Error in category route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/NCLEX/NCLEX_Comprehensive')
def nclex_comprehensive():
    """NCLEX-weighted Comprehensive Quiz page"""
    try:
        category_stats = get_nclex_category_stats()
        total_questions = sum(s['count'] for s in category_stats.values())
        return render_template('nclex-comprehensive.html',
                               category_stats=category_stats,
                               nclex_categories=NCLEX_CATEGORIES,
                               total_questions=total_questions)
    except Exception as e:
        print(f"Error in nclex_comprehensive route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/category/NCLEX/category/<category_name>')
def nclex_category_quiz(category_name):
    """NCLEX category-specific quiz - filters questions by NCLEX category"""
    try:
        # Decode URL-encoded category name
        category_name = unquote(category_name)
        
        # Validate category name
        if category_name not in NCLEX_CATEGORIES:
            print(f"Invalid NCLEX category: {category_name}")
            return redirect(url_for('category', category='NCLEX'))
        
        # Load and filter questions
        questions = load_nclex_master_questions()
        filtered_questions = [q for q in questions if q.get('category') == category_name]
        
        if not filtered_questions:
            print(f"No questions found for category: {category_name}")
            return redirect(url_for('category', category='NCLEX'))
        
        # Create quiz data structure
        quiz_data = {
            'module': f'NCLEX_{category_name.replace(" ", "_")}',
            'questions': filtered_questions
        }
        
        return render_template('quiz.html',
                             quiz_data=quiz_data,
                             module_name=f'NCLEX - {category_name}',
                             category='NCLEX',
                             back_url='/category/NCLEX',
                             back_label='NCLEX Comprehensive System',
                             autostart=False,
                             is_category_quiz=True)
    except Exception as e:
        print(f"Error in nclex_category_quiz route: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/category/Nursing_Certifications/CCRN')
def ccrn_page():
    """CCRN certification tests sub-page"""
    try:
        return render_template('ccrn.html')
    except Exception as e:
        print(f"Error in ccrn_page route: {e}")
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
        # Decode URL-encoded names
        category = unquote(category)
        module = unquote(module)
        
        categories = get_categories()
        
        # Allow categories that exist in metadata even if directory doesn't exist yet
        category_exists = category in categories or category in CATEGORY_METADATA
        
        if not category_exists:
            return redirect(url_for('home'))
        
        # Don't serve fill-in-the-blank through this route
        if 'Fill_In_The_Blank' in module:
            return redirect(url_for('quiz_fill_blank', category=category, module=module))
        
        module_path = MODULES_DIR / category / f'{module}.json'
        
        if not module_path.exists():
            return redirect(url_for('category', category=category))
        
        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        
        # Check for autostart parameter (for Pharmacology categorical quizzes)
        autostart = request.args.get('autostart', 'false').lower() == 'true'
        
        # Check for is_comprehensive parameter (for NCLEX comprehensive quiz)
        is_comprehensive = request.args.get('is_comprehensive', 'false').lower() == 'true'
        
        # Check for quiz_length parameter (for comprehensive quiz length selection)
        quiz_length = request.args.get('quiz_length', 'full')
        
        # Determine back link based on category and module
        metadata = CATEGORY_METADATA.get(category, {})
        
        # Special handling for CCRN tests - go back to CCRN page
        if 'CCRN' in module and category == 'Nursing_Certifications':
            back_url = '/category/Nursing_Certifications/CCRN'
            back_label = 'CCRN Practice Tests'
        # Special handling for Pharm Quizzes - go back to Comprehensive page
        elif module.startswith('Pharm_Quiz_') and category == 'Pharmacology':
            back_url = '/category/Pharmacology/Comprehensive'
            back_label = 'Comprehensive Pharmacology Quizzes'
        # Special handling for categorical pharm quizzes - go back to Categories page
        elif category == 'Pharmacology' and module.endswith('_Pharm'):
            back_url = '/category/Pharmacology/Categories'
            back_label = 'Pharmacology by Category'
        # Special handling for NCLEX Comprehensive Master - go back to NCLEX Comprehensive page
        elif category == 'NCLEX' and module == 'NCLEX_Comprehensive_Master_Categorized':
            back_url = '/category/NCLEX/NCLEX_Comprehensive'
            back_label = 'NCLEX Comprehensive Quiz'
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
        # Decode URL-encoded names
        category = unquote(category)
        module = unquote(module)
        
        categories = get_categories()
        
        if category not in categories:
            return redirect(url_for('home'))
        
        # Add Fill_In_The_Blank suffix if not present
        if 'Fill_In_The_Blank' not in module:
            module = f'{module}_Fill_In_The_Blank'
        
        module_path = MODULES_DIR / category / f'{module}.json'
        
        if not module_path.exists():
            return redirect(url_for('category', category=category))
        
        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        
        # Determine back link based on category
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
        # Decode URL-encoded category
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
            # Filter out Fill_In_The_Blank from regular quiz selector
            regular_modules = [m for m in modules_list if 'Fill_In_The_Blank' not in m]
            all_modules.extend(regular_modules)
        
        return jsonify({'modules': sorted(all_modules)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
