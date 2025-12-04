# api/index.py

import os
import json
from flask import Flask, render_template, request, jsonify, redirect, url_for
from pathlib import Path

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# Get the base directory
BASE_DIR = Path(__file__).parent.parent
MODULES_DIR = BASE_DIR / 'modules'

def get_categories():
    """Get all module categories (folder names)"""
    if not MODULES_DIR.exists():
        return []
    return sorted([d.name for d in MODULES_DIR.iterdir() if d.is_dir() and not d.name.startswith('.')])

def get_modules_in_category(category):
    """Get all modules (JSON files) in a specific category"""
    category_path = MODULES_DIR / category
    if not category_path.exists():
        return []
    
    modules = []
    for file in sorted(category_path.glob('*.json')):
        modules.append(file.stem)
    
    return modules

def get_quiz_info(category, module):
    """Get quiz information including type (standard or fill-in-the-blank)"""
    module_path = MODULES_DIR / category / f'{module}.json'
    
    if not module_path.exists():
        return None
    
    try:
        with open(module_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Determine quiz type based on filename
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

# ==================== Routes ====================

@app.route('/')
def home():
    """Home page with all categories"""
    categories = get_categories()
    return render_template('home.html', categories=categories)

@app.route('/category/<category>')
def category(category):
    """Category landing page - shows available quizzes"""
    categories = get_categories()
    
    if category not in categories:
        return redirect(url_for('home'))
    
    quizzes = get_category_quizzes(category)
    
    # Check if this is a multi-quiz category (like Lab Values)
    has_multiple_types = len([q for q in quizzes['multiple-choice']]) > 0 and len([q for q in quizzes['fill-in-the-blank']]) > 0
    
    # For Lab_Values specifically, render the special landing page
    if category == 'Lab_Values' and has_multiple_types:
        return render_template('lab-values.html', 
                             quizzes=quizzes,
                             category_name='Laboratory Values')
    
    # For other categories, render generic category page
    return render_template('category.html',
                         category=category,
                         quizzes=quizzes)

@app.route('/quiz/<category>/<module>')
def quiz(category, module):
    """Quiz page for multiple choice"""
    categories = get_categories()
    
    if category not in categories:
        return redirect(url_for('home'))
    
    module_path = MODULES_DIR / category / f'{module}.json'
    
    if not module_path.exists():
        return redirect(url_for('category', category=category))
    
    # Don't serve fill-in-the-blank through this route
    if 'Fill_In_The_Blank' in module:
        return redirect(url_for('quiz_fill_blank', category=category, module=module))
    
    try:
        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        
        return render_template('quiz.html',
                             quiz_data=quiz_data,
                             module_name=module,
                             category=category)
    except Exception as e:
        print(f"Error loading quiz: {e}")
        return redirect(url_for('category', category=category))

@app.route('/quiz-fill-blank/<category>/<module>')
def quiz_fill_blank(category, module):
    """Quiz page for fill-in-the-blank"""
    categories = get_categories()
    
    if category not in categories:
        return redirect(url_for('home'))
    
    # Add Fill_In_The_Blank if not already in name
    if 'Fill_In_The_Blank' not in module:
        module = f'{module}_Fill_In_The_Blank'
    
    module_path = MODULES_DIR / category / f'{module}.json'
    
    if not module_path.exists():
        return redirect(url_for('category', category=category))
    
    try:
        with open(module_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        
        return render_template('quiz-fill-blank.html',
                             quiz_data=quiz_data,
                             module_name=module,
                             category=category)
    except Exception as e:
        print(f"Error loading fill-blank quiz: {e}")
        return redirect(url_for('category', category=category))

@app.route('/api/categories')
def api_categories():
    """API endpoint to get all categories"""
    categories = get_categories()
    return jsonify({'categories': categories})

@app.route('/api/category/<category>/quizzes')
def api_category_quizzes(category):
    """API endpoint to get quizzes for a category"""
    categories = get_categories()
    
    if category not in categories:
        return jsonify({'error': 'Category not found'}), 404
    
    quizzes = get_category_quizzes(category)
    return jsonify(quizzes)

@app.route('/modules')
def modules():
    """Get all available modules (for backward compatibility)"""
    all_modules = []
    for category in get_categories():
        modules_list = get_modules_in_category(category)
        # Filter out Fill_In_The_Blank from regular quiz selector
        regular_modules = [m for m in modules_list if 'Fill_In_The_Blank' not in m]
        all_modules.extend(regular_modules)
    
    return jsonify({'modules': sorted(all_modules)})

def handler(request):
    """Vercel serverless handler"""
    return app(request)

if __name__ == '__main__':
    app.run(debug=True)
