from flask import Flask, render_template, jsonify, request
import json
import os
from pathlib import Path

app = Flask(__name__, static_folder='../static', template_folder='../templates')

# ============================================================
# Utility Functions
# ============================================================

def load_json_file(filename):
    """Load and parse JSON module files"""
    try:
        json_path = Path(__file__).parent.parent / 'modules' / f'{filename}.json'
        if not json_path.exists():
            return None
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None
    except Exception as e:
        print(f"Error loading {filename}: {str(e)}")
        return None

def get_all_modules():
    """Get list of all available modules"""
    modules_dir = Path(__file__).parent.parent / 'modules'
    if not modules_dir.exists():
        return []
    
    modules = []
    try:
        for file in modules_dir.glob('*.json'):
            if file.name != 'config.json':
                module_name = file.stem
                modules.append({
                    'id': module_name,
                    'filename': file.name
                })
    except Exception as e:
        print(f"Error getting modules: {str(e)}")
        return []
    
    return sorted(modules, key=lambda x: x['id'])

# ============================================================
# PWA Routes - Manifest now served as static file
# ============================================================

# Note: /static/manifest.json is now served as a static file by Flask
# This allows proper caching and service worker compatibility

# ============================================================
# Main Routes
# ============================================================

@app.route('/')
def home():
    """Home page with module discovery"""
    modules = get_all_modules()
    return render_template('home.html', modules=modules)

@app.route('/category/<category>')
def category(category):
    """Category landing page"""
    data = load_json_file(category)
    if data is None:
        modules = get_all_modules()
        return render_template('home.html', modules=modules, error=f"Category '{category}' not found"), 404
    
    return render_template('category.html', category=category, data=data)

@app.route('/quiz/<quiz_name>')
def quiz(quiz_name):
    """Standard multiple choice quiz"""
    data = load_json_file(quiz_name)
    if data is None:
        modules = get_all_modules()
        return render_template('home.html', modules=modules, error=f"Quiz '{quiz_name}' not found"), 404
    
    questions = data.get('questions', []) if isinstance(data, dict) else data
    return render_template('quiz.html', quiz_name=quiz_name, questions=questions)

@app.route('/quiz-fill-blank/<quiz_name>')
def quiz_fill_blank(quiz_name):
    """Fill-in-the-blank quiz"""
    data = load_json_file(quiz_name)
    if data is None:
        modules = get_all_modules()
        return render_template('home.html', modules=modules, error=f"Quiz '{quiz_name}' not found"), 404
    
    questions = data.get('questions', []) if isinstance(data, dict) else data
    return render_template('quiz-fill-blank.html', quiz_name=quiz_name, questions=questions)

@app.route('/quiz-fishbone-mcq/<quiz_name>')
def quiz_fishbone_mcq(quiz_name):
    """Fishbone diagram MCQ quiz"""
    data = load_json_file(quiz_name)
    if data is None:
        modules = get_all_modules()
        return render_template('home.html', modules=modules, error=f"Quiz '{quiz_name}' not found"), 404
    
    return render_template('quiz-fishbone-mcq.html', quiz_name=quiz_name, data=data)

@app.route('/quiz-fishbone-fill/<quiz_name>')
def quiz_fishbone_fill(quiz_name):
    """Fishbone diagram fill-in quiz"""
    data = load_json_file(quiz_name)
    if data is None:
        modules = get_all_modules()
        return render_template('home.html', modules=modules, error=f"Quiz '{quiz_name}' not found"), 404
    
    return render_template('quiz-fishbone-fill.html', quiz_name=quiz_name, data=data)

@app.route('/lab-values')
def lab_values():
    """Lab values quiz module"""
    data = load_json_file('lab-values')
    if data is None:
        data = {}
    
    return render_template('lab-values.html', data=data)

@app.route('/nursing-certifications')
def nursing_certifications():
    """Nursing certifications landing page"""
    data = load_json_file('nursing-certifications')
    if data is None:
        data = {}
    
    return render_template('nursing-certifications.html', data=data)

@app.route('/ccrn')
def ccrn():
    """CCRN exam module"""
    data = load_json_file('ccrn')
    if data is None:
        data = {}
    
    return render_template('ccrn.html', data=data)

# ============================================================
# API Routes for AJAX Calls
# ============================================================

@app.route('/api/modules')
def api_modules():
    """Get all available modules"""
    modules = get_all_modules()
    return jsonify({'modules': modules})

@app.route('/api/quiz/<quiz_name>')
def api_quiz(quiz_name):
    """Get quiz data as JSON"""
    data = load_json_file(quiz_name)
    if data is None:
        return jsonify({'error': f'Quiz "{quiz_name}" not found'}), 404
    
    return jsonify(data)

@app.route('/api/category/<category>/modules')
def api_category_modules(category):
    """Get modules for a specific category"""
    modules = get_all_modules()
    category_modules = [m['id'] for m in modules if m['id'].startswith(category)]
    return jsonify({'category': category, 'modules': category_modules})

# ============================================================
# Error Handlers
# ============================================================

@app.errorhandler(404)
def not_found(e):
    """404 handler - return home"""
    modules = get_all_modules()
    return render_template('home.html', modules=modules, error="Page not found"), 404

@app.errorhandler(500)
def server_error(e):
    """500 handler"""
    return jsonify({'error': 'Internal server error: ' + str(e)}), 500

# ============================================================
# Start Application
# ============================================================

if __name__ == '__main__':
    app.run(debug=False)
