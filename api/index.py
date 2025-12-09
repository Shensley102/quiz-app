from flask import Flask, render_template, jsonify
from pathlib import Path
import json

app = Flask(__name__, static_folder='../static', template_folder='../templates')


def load_json_file(filename):
    """Load JSON from nested module directories"""
    try:
        # Try nested structure: modules/CATEGORY/FILENAME.json
        parts = filename.split('/')
        json_path = Path(__file__).parent.parent / 'modules'
        
        for part in parts:
            json_path = json_path / part
        
        json_path = json_path.with_suffix('.json')
        
        if json_path.exists():
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return None
    except Exception as e:
        print(f"Error loading {filename}: {e}")
        return None


def get_all_modules():
    """Get all available modules from nested directories"""
    modules = []
    modules_dir = Path(__file__).parent.parent / 'modules'
    
    if not modules_dir.exists():
        return modules
    
    try:
        for json_file in modules_dir.rglob('*.json'):
            if json_file.name != 'config.json':
                relative_path = json_file.relative_to(modules_dir)
                module_name = str(relative_path.with_suffix('')).replace('\\', '/')
                modules.append({'id': module_name, 'filename': json_file.name})
    except Exception as e:
        print(f"Error getting modules: {e}")
    
    return sorted(modules, key=lambda x: x['id'])


@app.route('/')
def home():
    modules = get_all_modules()
    return render_template('home.html', modules=modules)


@app.route('/category/<category>')
def category(category):
    data = load_json_file(category)
    if data is None:
        return render_template('home.html', modules=get_all_modules(), error=f"Category '{category}' not found"), 404
    return render_template('category.html', category=category, data=data)


@app.route('/quiz/<quiz_name>')
def quiz(quiz_name):
    data = load_json_file(quiz_name)
    if data is None:
        return render_template('home.html', modules=get_all_modules(), error=f"Quiz '{quiz_name}' not found"), 404
    questions = data.get('questions', []) if isinstance(data, dict) else data
    return render_template('quiz.html', quiz_name=quiz_name, questions=questions)


@app.route('/quiz-fill-blank/<quiz_name>')
def quiz_fill_blank(quiz_name):
    data = load_json_file(quiz_name)
    if data is None:
        return render_template('home.html', modules=get_all_modules(), error=f"Quiz '{quiz_name}' not found"), 404
    questions = data.get('questions', []) if isinstance(data, dict) else data
    return render_template('quiz-fill-blank.html', quiz_name=quiz_name, questions=questions)


@app.route('/quiz-fishbone-mcq/<quiz_name>')
def quiz_fishbone_mcq(quiz_name):
    data = load_json_file(quiz_name)
    if data is None:
        return render_template('home.html', modules=get_all_modules(), error=f"Quiz '{quiz_name}' not found"), 404
    return render_template('quiz-fishbone-mcq.html', quiz_name=quiz_name, data=data)


@app.route('/quiz-fishbone-fill/<quiz_name>')
def quiz_fishbone_fill(quiz_name):
    data = load_json_file(quiz_name)
    if data is None:
        return render_template('home.html', modules=get_all_modules(), error=f"Quiz '{quiz_name}' not found"), 404
    return render_template('quiz-fishbone-fill.html', quiz_name=quiz_name, data=data)


@app.route('/lab-values')
def lab_values():
    data = load_json_file('Lab_Values/NCLEX_Lab_Values')
    return render_template('lab-values.html', data=data or {})


@app.route('/nursing-certifications')
def nursing_certifications():
    data = load_json_file('Nursing_Certifications/CCRN_Test_1_Combined_QA')
    return render_template('nursing-certifications.html', data=data or {})


@app.route('/ccrn')
def ccrn():
    data = load_json_file('Nursing_Certifications/CCRN_Test_1_Combined_QA')
    return render_template('ccrn.html', data=data or {})


@app.route('/api/modules')
def api_modules():
    return jsonify({'modules': get_all_modules()})


@app.route('/api/quiz/<quiz_name>')
def api_quiz(quiz_name):
    data = load_json_file(quiz_name)
    if data is None:
        return jsonify({'error': f'Quiz "{quiz_name}" not found'}), 404
    return jsonify(data)


@app.errorhandler(404)
def not_found(e):
    modules = get_all_modules()
    return render_template('home.html', modules=modules, error="Page not found"), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error: ' + str(e)}), 500
