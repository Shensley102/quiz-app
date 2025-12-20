"""
Vercel Serverless Function - Nurse Success Study Hub
Flask WSGI Application for Vercel Python runtime
Deploy to: /api/index.py
"""

import json
import os
from flask import Flask, render_template, jsonify, request, send_from_directory

# Initialize Flask app
app = Flask(__name__, 
    template_folder=os.path.join(os.path.dirname(__file__), '../templates'),
    static_folder=os.path.join(os.path.dirname(__file__), '../static'),
    static_url_path='/static'
)

# Category configuration
CATEGORIES = {
    'HESI': {
        'folder': 'HESI',
        'display_name': 'HESI Exam Prep',
        'description': 'HESI A2 and RN exam preparation',
        'quizzes': [
            {'id': 'HESI_Adult_Health', 'name': 'Adult Health', 'file': 'HESI_Adult_Health.json'},
            {'id': 'HESI_Clinical_Judgment', 'name': 'Clinical Judgment', 'file': 'HESI_Clinical_Judgment.json'},
            {'id': 'HESI_Delegating', 'name': 'Delegating & Management', 'file': 'HESI_Delegating.json'},
            {'id': 'HESI_Leadership', 'name': 'Leadership', 'file': 'HESI_Leadership.json'},
            {'id': 'HESI_Management', 'name': 'Management', 'file': 'HESI_Management.json'},
            {'id': 'HESI_Maternity', 'name': 'Maternity', 'file': 'HESI_Maternity.json'},
            {'id': 'HESI_Comp_Quiz_1', 'name': 'Comprehensive Quiz 1', 'file': 'HESI_Comp_Quiz_1.json'},
            {'id': 'HESI_Comp_Quiz_2', 'name': 'Comprehensive Quiz 2', 'file': 'HESI_Comp_Quiz_2.json'},
            {'id': 'HESI_Comp_Quiz_3', 'name': 'Comprehensive Quiz 3', 'file': 'HESI_Comp_Quiz_3.json'},
        ]
    },
    'Pharmacology': {
        'folder': 'Pharmacology',
        'display_name': 'Pharmacology',
        'description': 'Comprehensive pharmacology exam prep',
        'quizzes': [
            {'id': 'Comprehensive_Pharmacology', 'name': 'All Pharmacology (829 Questions)', 'file': 'Comprehensive_Pharmacology.json'},
            {'id': 'Anti_Infectives_Pharm', 'name': 'Anti-Infectives', 'file': 'Anti_Infectives_Pharm.json'},
            {'id': 'CNS_Psychiatric_Pharm', 'name': 'CNS & Psychiatric', 'file': 'CNS_Psychiatric_Pharm.json'},
            {'id': 'Cardiovascular_Pharm', 'name': 'Cardiovascular', 'file': 'Cardiovascular_Pharm.json'},
            {'id': 'Endocrine_Metabolic_Pharm', 'name': 'Endocrine & Metabolic', 'file': 'Endocrine_Metabolic_Pharm.json'},
            {'id': 'Gastrointestinal_Pharm', 'name': 'Gastrointestinal', 'file': 'Gastrointestinal_Pharm.json'},
            {'id': 'Hematologic_Oncology_Pharm', 'name': 'Hematologic & Oncology', 'file': 'Hematologic_Oncology_Pharm.json'},
            {'id': 'High_Alert_Medications_Pharm', 'name': 'High Alert Medications', 'file': 'High_Alert_Medications_Pharm.json'},
            {'id': 'Immunologic_Biologics_Pharm', 'name': 'Immunologic & Biologics', 'file': 'Immunologic_Biologics_Pharm.json'},
            {'id': 'Musculoskeletal_Pharm', 'name': 'Musculoskeletal', 'file': 'Musculoskeletal_Pharm.json'},
            {'id': 'Pain_Management_Pharm', 'name': 'Pain Management', 'file': 'Pain_Management_Pharm.json'},
            {'id': 'Renal_Electrolytes_Pharm', 'name': 'Renal & Electrolytes', 'file': 'Renal_Electrolytes_Pharm.json'},
            {'id': 'Respiratory_Pharm', 'name': 'Respiratory', 'file': 'Respiratory_Pharm.json'},
        ]
    },
    'Lab_Values': {
        'folder': 'Lab_Values',
        'display_name': 'Lab Values',
        'description': 'NCLEX-style lab value interpretation',
        'quizzes': [
            {'id': 'NCLEX_Lab_Values', 'name': 'Lab Values (Multiple Choice)', 'file': 'NCLEX_Lab_Values.json'},
            {'id': 'NCLEX_Lab_Values_Fill_In_The_Blank', 'name': 'Lab Values (Fill-in-the-Blank)', 'file': 'NCLEX_Lab_Values_Fill_In_The_Blank.json'},
        ]
    },
    'Nursing_Certifications': {
        'folder': 'Nursing_Certifications',
        'display_name': 'Nursing Certifications',
        'description': 'CCRN and specialty nursing exams',
        'quizzes': [
            {'id': 'CCRN_Test_1', 'name': 'CCRN Practice Test 1', 'file': 'CCRN_Test_1_Combined_QA.json'},
            {'id': 'CCRN_Test_2', 'name': 'CCRN Practice Test 2', 'file': 'CCRN_Test_2_Combined_QA.json'},
            {'id': 'CCRN_Test_3', 'name': 'CCRN Practice Test 3', 'file': 'CCRN_Test_3_Combined_QA.json'},
        ]
    },
    'Patient_Care_Management': {
        'folder': 'Patient_Care_Management',
        'display_name': 'Patient Care Management',
        'description': 'Patient care and nursing management',
        'quizzes': [
            {'id': 'Module_1', 'name': 'Module 1', 'file': 'Module_1.json'},
            {'id': 'Module_2', 'name': 'Module 2', 'file': 'Module_2.json'},
            {'id': 'Module_3', 'name': 'Module 3', 'file': 'Module_3.json'},
            {'id': 'Module_4', 'name': 'Module 4', 'file': 'Module_4.json'},
            {'id': 'Learning_Module_1_2', 'name': 'Learning Questions (Module 1-2)', 'file': 'Learning_Questions_Module_1_2.json'},
            {'id': 'Learning_Module_3_4', 'name': 'Learning Questions (Module 3-4)', 'file': 'Learning_Questions_Module_3_4_.json'},
        ]
    }
}

@app.route('/')
@app.route('/index.html')
def home():
    return render_template('home.html', categories=CATEGORIES)

@app.route('/category/<category_name>')
def category(category_name):
    if category_name not in CATEGORIES:
        return jsonify({'error': 'Category not found'}), 404
    
    category_data = CATEGORIES[category_name]
    return render_template('category.html', 
        category_name=category_name,
        category_data=category_data,
        quizzes=category_data['quizzes']
    )

@app.route('/quiz/<category_name>/<quiz_id>')
def quiz(category_name, quiz_id):
    if category_name not in CATEGORIES:
        return jsonify({'error': 'Category not found'}), 404
    
    category_data = CATEGORIES[category_name]
    quiz_info = None
    for q in category_data['quizzes']:
        if q['id'] == quiz_id:
            quiz_info = q
            break
    
    if not quiz_info:
        return jsonify({'error': 'Quiz not found'}), 404
    
    return render_template('quiz.html',
        category_name=category_name,
        quiz_id=quiz_id,
        quiz_name=quiz_info['name'],
        quiz_file=quiz_info['file']
    )

@app.route('/api/quiz/<category_name>/<quiz_filename>')
def load_quiz(category_name, quiz_filename):
    if category_name not in CATEGORIES:
        return jsonify({'error': 'Category not found'}), 404
    
    category_data = CATEGORIES[category_name]
    folder = category_data['folder']
    
    quiz_path = os.path.join(
        os.path.dirname(__file__),
        '../modules',
        folder,
        quiz_filename
    )
    
    quiz_path = os.path.abspath(quiz_path)
    base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../modules'))
    
    if not quiz_path.startswith(base_path):
        return jsonify({'error': 'Invalid quiz path'}), 400
    
    if not os.path.exists(quiz_path):
        return jsonify({'error': f'Quiz file not found: {quiz_filename}'}), 404
    
    try:
        with open(quiz_path, 'r', encoding='utf-8') as f:
            quiz_data = json.load(f)
        return jsonify(quiz_data)
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON in quiz file'}), 500
    except Exception as e:
        return jsonify({'error': f'Error loading quiz: {str(e)}'}), 500

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/images/<filename>')
def serve_images(filename):
    images_path = os.path.join(os.path.dirname(__file__), '../images')
    return send_from_directory(images_path, filename)

@app.route('/modules/<path:filename>')
def serve_modules(filename):
    modules_path = os.path.join(os.path.dirname(__file__), '../modules')
    return send_from_directory(modules_path, filename)

@app.errorhandler(404)
def page_not_found(error):
    if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
        return jsonify({'error': 'Not found'}), 404
    try:
        return render_template('404.html'), 404
    except:
        return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
        return jsonify({'error': 'Internal server error'}), 500
    try:
        return render_template('500.html'), 500
    except:
        return jsonify({'error': 'Internal server error'}), 500

# For local development only
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=3000)
