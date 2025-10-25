import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# -----------------------------------------------------------------------------
# Flask app
# -----------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
)

# Keep the secret key, but don't crash if env is absent.
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# Only allow serving JSON files that look like your banks
ALLOWED_JSON = re.compile(r"^Module_[A-Za-z0-9_-]+\.json$")

# -----------------------------------------------------------------------------
# Lightweight routes
# -----------------------------------------------------------------------------

@app.get("/healthz")
def healthz():
    return jsonify(ok=True)

@app.get("/favicon.ico")
def favicon():
    # Let your static favicon be used if you add one later;
    # returning 204 avoids noisy 500s during boot.
    return ("", 204)

@app.get("/")
def home():
    # Render your SPA shell; the JS fetches the JSON directly
    return render_template("index.html")

@app.get("/<path:filename>")
def serve_json(filename: str):
    """
    Serve module banks from repo root (e.g., /Module_1.json).
    We only allow known-safe filenames to avoid directory traversal.
    Everything else falls back to Flask's 404.
    """
    # Only raw JSON banks from root are allowed through this path.
    name = os.path.basename(filename)
    if ALLOWED_JSON.fullmatch(name):
        file_path = BASE_DIR / name
        if file_path.exists():
            return send_from_directory(BASE_DIR, name, mimetype="application/json")
        abort(404)

    # Not a JSON bank → let Flask handle (likely 404 unless a route exists)
    abort(404)

# -----------------------------------------------------------------------------
# Local dev entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    # For local testing: `python study_tool.py`
    # Visit http://127.0.0.1:5000/
    app.run(host="0.0.0.0", port=5000, debug=True)
