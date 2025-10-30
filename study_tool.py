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
#   - Learning_Questions_*.json   <-- newly added
ALLOWED_JSON = re.compile(
    r"^(?:Module_[\w-]+|Pharm_[\w-]+|Learning_Questions_[\w-]+)\.json$",
    re.IGNORECASE,
)


@app.get("/healthz")
def healthz():
    return "ok", 200


@app.get("/")
def index():
    # Expects templates/index.html (recommended).
    # If your index.html is in the repo root, either move it into templates/
    # or point template_folder above to BASE_DIR.
    return render_template("index.html")


@app.get("/modules")
def list_modules():
    """
    Returns a JSON array of available test banks (stem only, no .json),
    filtered by the ALLOWED_JSON whitelist.
    Example:
      ["Module_1", "Module_2", "Module_3", "Pharm_Quiz_HESI", "Learning_Questions_Module_1_2"]
    """
    banks = []
    for p in BASE_DIR.glob("*.json"):
        name = p.name
        if ALLOWED_JSON.fullmatch(name):
            banks.append(p.stem)
    banks.sort(key=str.lower)
    return jsonify(banks)


# Important: only match root-level JSON names of the form "<name>.json"
# This avoids shadowing /static/... because we do NOT accept slashes here.
@app.route("/<string:filename>.json", methods=["GET", "HEAD"])
def serve_bank(filename: str):
    """
    Serve whitelisted JSON banks from the repo root.

    Examples that will work:
      /Module_1.json
      /Module_2.json
      /Module_3.json
      /Pharm_Quiz_HESI.json
      /Learning_Questions_Module_1_2.json
    """
    # Build a safe basename and validate
    name = os.path.basename(f"{filename}.json")
    if ALLOWED_JSON.fullmatch(name):
        path = BASE_DIR / name
        if path.exists() and path.is_file():
            return send_from_directory(BASE_DIR, name, mimetype="application/json")
        abort(404)
    abort(404)


if __name__ == "__main__":
    # Local dev: python study_tool.py
    app.run(host="0.0.0.0", port=5000, debug=True)
