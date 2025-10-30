import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# --- Paths ---
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# --- Flask app ---
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
)

# Allow:
#   - Module_*.json
#   - Pharm_*.json
#   - Learning_Questions_*.json
ALLOWED_JSON = re.compile(
    r"^(?:Module_[\w-]+|Pharm_[\w-]+|Learning_Questions_[\w-]+)\.json$",
    re.IGNORECASE,
)


@app.get("/healthz")
def healthz():
    return "ok", 200


@app.get("/")
def index():
    # Expects templates/index.html
    return render_template("index.html")


@app.get("/modules")
def list_modules():
    """
    Return the available banks as: { "modules": ["Module_1", ...] }
    The frontend reads data.modules
    """
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if ALLOWED_JSON.fullmatch(name):
            banks.append(p.stem)
    banks.sort(key=str.lower)
    return jsonify({"modules": banks})


#
