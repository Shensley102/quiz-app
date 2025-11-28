from flask import Flask, render_template, jsonify, request, send_from_directory
import json
import os
import random

app = Flask(__name__, template_folder='template', static_folder='static')

# Define categories with their modules
CATEGORIES = {
    'Patient Care Management': {
        'modules': [
            'Module_1',
            'Module_2',
            'Module_3',
            'Module_4',
            'Learning_Questions_Module_1_2',
            'Learning_Questions_Module_3_4'
        ]
    },
    'HESI': {
        'modules': [
            'HESI_Delegating',
            'HESI_Leadership',
            'Hesi_Management',
            'HESI_Comprehensive'
        ]
    },
    'Nursing Certifications': {
        'modules': [
            'CCRN_Test_1_Combined_QA',
            'CCRN_Test_2_Combined_QA',
            'CCRN_Test_3_Combined_QA'
        ]
    },
    'Pharmacology': {
        'modules': [
            'Pharm_Quiz_1',
            'Pharm_Quiz_2',
            'Pharm_Quiz_3',
            'Pharm_Quiz_4'
        ]
    }
}

@app.route('/')
def home():
    """Render the home page"""
    return render_template('home.html')

@app.route('/category/<category_name>')
def category(category_name):
    """Render category page"""
    return render_template('category.html')

@app.route('/quiz')
@app.route('/quiz/<module_name>')
def quiz(module_name=None):
    """Render quiz page"""
    return render_template('quiz.html')

@app.route('/api/categories')
def get_categories():
    """Return all categories and their modules"""
    return jsonify(CATEGORIES)

@app.route('/api/quiz/<module_name>')
def get_quiz(module_name):
    """Load and return quiz data for a specific module"""
    try:
        # Try to load the JSON file
        json_path = f'{module_name}.json'
        
        if not os.path.exists(json_path):
            return jsonify({'error': f'Quiz file not found: {module_name}'}), 404
        
        with open(json_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        
        # Handle both list and dict formats
        if isinstance(quiz_data, list):
            questions = quiz_data
        elif isinstance(quiz_data, dict) and 'questions' in quiz_data:
            questions = quiz_data['questions']
        else:
            return jsonify({'error': 'Invalid quiz format'}), 400
        
        # Get count parameter (optional)
        count = request.args.get('count', 'all')
        
        if count != 'all':
            try:
                count = int(count)
                if count < len(questions):
                    questions = random.sample(questions, count)
            except (ValueError, TypeError):
                pass
        
        return jsonify({
            'module': module_name,
            'questions': questions,
            'total': len(questions)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/quiz-by-category')
def get_quiz_by_category():
    """Load questions from all modules in a category"""
    try:
        category = request.args.get('category')
        subcategory = request.args.get('subcategory')
        count = request.args.get('count', 'all')
        
        if not category:
            return jsonify({'error': 'Category parameter required'}), 400
        
        if category not in CATEGORIES:
            return jsonify({'error': f'Category not found: {category}'}), 404
        
        # Determine which modules to load
        modules_to_load = []
        
        if subcategory:
            # Load modules from specific subcategory
            if subcategory == 'CCRN':
                modules_to_load = ['CCRN_Test_1_Combined_QA', 'CCRN_Test_2_Combined_QA', 'CCRN_Test_3_Combined_QA']
            elif subcategory == 'Pharm Quizzes':
                modules_to_load = ['Pharm_Quiz_1', 'Pharm_Quiz_2', 'Pharm_Quiz_3', 'Pharm_Quiz_4']
            else:
                return jsonify({'error': f'Subcategory not found: {subcategory}'}), 404
        else:
            # Load all modules from category
            modules_to_load = CATEGORIES[category]['modules']
        
        # Collect all questions from modules
        all_questions = []
        for module_name in modules_to_load:
            json_path = f'{module_name}.json'
            if os.path.exists(json_path):
                with open(json_path, 'r', encoding='utf-8') as f:
                    quiz_data = json.load(f)
                    
                    if isinstance(quiz_data, list):
                        questions = quiz_data
                    elif isinstance(quiz_data, dict) and 'questions' in quiz_data:
                        questions = quiz_data['questions']
                    else:
                        continue
                    
                    all_questions.extend(questions)
        
        if not all_questions:
            return jsonify({'error': 'No questions found'}), 404
        
        # Apply count filter
        if count != 'all':
            try:
                count = int(count)
                if count < len(all_questions):
                    all_questions = random.sample(all_questions, count)
            except (ValueError, TypeError):
                pass
        
        return jsonify({
            'category': category,
            'subcategory': subcategory,
            'questions': all_questions,
            'total': len(all_questions)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
