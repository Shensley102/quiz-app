# api/index.py

import os
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for
from pathlib import Path

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# Get the base directory
BASE_DIR = Path(__file__).parent.parent
MODULES_DIR = BASE_DIR / 'modules'

# Category metadata
CATEGORY_METADATA = {
    'HESI': {
        'display_name': 'HESI',
        'icon': '📋',
        'image': '/images/Nursing_Hesi_Exam_Prep_Image.png',
        'description': 'The Comprehensive Quiz 1, 2, and 3 are questions gathered from HESI Exit Exam and HESI Comprehensive study guides'
    },
    'Lab_Values': {
        'display_name': 'Laboratory Values',
        'icon': '🧪',
        'image': '/images/Nursing_Lab_Values.png',
        'description': 'Master critical laboratory values for NCLEX and HESI exams'
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
        categories = get_categories()
        
        if category not in categories:
            return redirect(url_for('home'))
        
        quizzes = get_category_quizzes(category)
        
        # Check if this is Lab Values with multiple quiz types
        has_mc = len(quizzes.get('multiple-choice', [])) > 0
        has_fb = len(quizzes.get('fill-in-the-blank', [])) > 0
        
        # Use special template for Lab Values
        if category == 'Lab_Values' and has_mc and has_fb:
            return render_template('lab-values.html', quizzes=quizzes)
        
        # Use generic category template for others
        return render_template('category.html', category=category, quizzes=quizzes)
    except Exception as e:
        print(f"Error in category route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/quiz/<category>/<module>')
def quiz(category, module):
    """Quiz page for multiple choice"""
    try:
        categories = get_categories()
        
        if category not in categories:
            return redirect(url_for('home'))
        
        # Don't serve fill-in-the-blank through this route
        if 'Fill_In_The_Blank' in module:
            return redirect(url_for('quiz_fill_blank', category=category, module=module))
        
        module_path = MODULES_DIR / category / f'{module}.json'
        
        if not module_path.exists():
            return redirect(url_for('category', category=category))
        
        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        
        return render_template('quiz.html',
                             quiz_data=quiz_data,
                             module_name=module,
                             category=category)
    except Exception as e:
        print(f"Error in quiz route: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/quiz-fill-blank/<category>/<module>')
def quiz_fill_blank(category, module):
    """Quiz page for fill-in-the-blank"""
    try:
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
        
        return render_template('quiz-fill-blank.html',
                             quiz_data=quiz_data,
                             module_name=module,
                             category=category)
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
        categories = get_categories()
        
        if category not in categories:
            return jsonify({'error': 'Category not found'}), 404
        
        quizzes = get_category_quizzes(category)
        return jsonify(quizzes)
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
