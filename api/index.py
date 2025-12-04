from flask import Flask, render_template, jsonify, request
import os
import json
from urllib.parse import unquote
from pathlib import Path

app = Flask(__name__, 
            static_folder='../static',
            static_url_path='/static',
            template_folder='../templates')

# Add CORS headers to all responses
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Category metadata (display info only - modules are discovered from files)
CATEGORY_METADATA = {
    'Patient Care Management': {
        'display_name': 'Patient Care Management',
        'icon': '👥',
        'description': 'Enhance your patient care and clinical management skills',
        'image': '/images/Nursing_Leadership_Image.png'
    },
    'HESI': {
        'display_name': 'HESI',
        'icon': '📋',
        'description': 'The Comprehensive Quiz 1, 2, and 3 are questions gathered from HESI Exit Exam and HESI Comprehensive study guides',
        'image': '/images/Nursing_Hesi_Exam_Prep_Image.png'
    },
    'Nursing Certifications': {
        'display_name': 'Nursing Certifications',
        'icon': '🏆',
        'description': 'Master content for nursing certification exams',
        'image': '/images/Nursing_Advanced_Certifications.png'
    },
    'Pharmacology': {
        'display_name': 'Pharmacology',
        'icon': '💊',
        'description': 'Strengthen your pharmacology knowledge and drug understanding',
        'image': '/images/Nursing_Pharmacology_Image.png'
    },
    'Lab Values': {
        'display_name': 'Lab Values',
        'icon': '🧪',
        'description': 'Master critical laboratory values for NCLEX and HESI exams',
        'image': '/images/Nursing_Lab_Values.png'
    }
}

def get_base_dir():
    """Get the base directory of the project"""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def discover_modules():
    """
    Scan the modules directory structure and discover all modules.
    Expected structure:
    /modules/
      /Patient_Care_Management/
        Module_1.json
        Module_2.json
      /HESI/
        HESI_Delegating.json
      /Lab_Values/
        NCLEX_Lab_Values.json
        NCLEX_Lab_Values_Fill_In_The_Blank.json
      etc.
    
    Returns a dict: {category_name: [module_names]}
    """
    modules_by_category = {}
    base_dir = get_base_dir()
    modules_dir = os.path.join(base_dir, 'modules')
    
    # Return empty dict if modules directory doesn't exist
    if not os.path.exists(modules_dir):
        return modules_by_category
    
    # Scan each category subdirectory
    for category_folder in os.listdir(modules_dir):
        category_path = os.path.join(modules_dir, category_folder)
        
        # Skip if not a directory
        if not os.path.isdir(category_path):
            continue
        
        # Convert folder name to category name (replace underscores with spaces)
        category_name = category_folder.replace('_', ' ')
        
        # Scan for JSON files in this category
        json_files = []
        for filename in os.listdir(category_path):
            if filename.endswith('.json'):
                # Remove .json extension to get module name
                module_name = filename[:-5]
                json_files.append(module_name)
        
        # Only add category if it has modules
        if json_files:
            modules_by_category[category_name] = sorted(json_files)
    
    return modules_by_category

def get_study_categories():
    """
    Get study categories with metadata and discovered modules.
    Combines CATEGORY_METADATA with discovered modules.
    """
    discovered = discover_modules()
    categories = {}
    
    for category_name, metadata in CATEGORY_METADATA.items():
        categories[category_name] = {
            'display_name': metadata['display_name'],
            'icon': metadata['icon'],
            'description': metadata.get('description', ''),
            'image': metadata.get('image'),
            'modules': discovered.get(category_name, [])
        }
    
    return categories

def get_available_modules():
    """Return all modules from all categories"""
    discovered = discover_modules()
    all_modules = []
    for modules in discovered.values():
        all_modules.extend(modules)
    return sorted(list(set(all_modules)))

def find_category(category_name):
    """Find category by exact match (case-insensitive)"""
    categories = get_study_categories()
    
    if category_name in categories:
        return category_name
    
    for key in categories.keys():
        if key.lower() == category_name.lower():
            return key
    
    return None

# Routes
@app.route('/')
def home():
    """HOME PAGE"""
    return render_template('home.html')

@app.route('/category/<path:category>')
def category_page(category):
    """CATEGORY PAGE"""
    decoded_category = unquote(category)
    actual_category = find_category(decoded_category)
    
    if not actual_category:
        return jsonify({'error': 'Category not found'}), 404
    
    categories = get_study_categories()
    category_data = categories[actual_category]
    
    # Use special template for Lab Values category
    if actual_category == 'Lab Values':
        return render_template('lab-values.html', category=actual_category, category_data=category_data)
    
    return render_template('category.html', category=actual_category, category_data=category_data)

@app.route('/quiz')
def quiz_page_no_module():
    """QUIZ PAGE - no specific module"""
    return render_template('quiz.html')

@app.route('/quiz/<module_name>')
def quiz_page(module_name):
    """QUIZ PAGE - specific module"""
    # Check if this is a fill-in-the-blank quiz
    if 'Fill_In_The_Blank' in module_name:
        return render_template('quiz-fill-blank.html')
    return render_template('quiz.html')

@app.route('/api/categories')
def get_categories():
    """API endpoint returning all categories with metadata and discovered modules"""
    categories = get_study_categories()
    # Return only the data needed by frontend, excluding empty categories
    result = {}
    for name, data in categories.items():
        if data['modules']:  # Only include categories with modules
            result[name] = {
                'display_name': data['display_name'],
                'icon': data['icon'],
                'image': data['image'],
                'modules': data['modules']
            }
    return jsonify(result), 200

@app.route('/api/category/<path:category>/modules')
def get_category_modules(category):
    """Return modules for a specific category"""
    decoded_category = unquote(category)
    actual_category = find_category(decoded_category)
    
    if not actual_category:
        return jsonify({'error': 'Category not found'}), 404
    
    categories = get_study_categories()
    category_data = categories[actual_category]
    modules = category_data.get('modules', [])
    
    return jsonify({'modules': modules, 'category': actual_category}), 200

@app.route('/modules', methods=['GET'])
def modules_list():
    """Return list of available modules"""
    try:
        modules = get_available_modules()
        return jsonify({'modules': modules}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/<module_name>.json', methods=['GET'])
def get_module(module_name):
    """
    Serve a specific module JSON file.
    Searches for the module in all category subdirectories.
    """
    try:
        # Security check
        if not all(c.isalnum() or c in '_-' for c in module_name):
            return jsonify({'error': 'Invalid module name'}), 400
        
        base_dir = get_base_dir()
        modules_dir = os.path.join(base_dir, 'modules')
        
        # Search for the module file in all category subdirectories
        if os.path.exists(modules_dir):
            for category_folder in os.listdir(modules_dir):
                file_path = os.path.join(modules_dir, category_folder, f'{module_name}.json')
                
                if os.path.exists(file_path):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    return jsonify(data), 200
        
        # Also check if module exists in root directory (for backwards compatibility)
        root_file_path = os.path.join(base_dir, f'{module_name}.json')
        if os.path.exists(root_file_path):
            with open(root_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return jsonify(data), 200
        
        return jsonify({'error': f'Module "{module_name}" not found'}), 404
    
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Invalid JSON: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Vercel serverless function handler
app.debug = False
