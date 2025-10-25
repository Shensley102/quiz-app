import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

# ------------------------------------------------------------
# Flask app (no heavy work at import-time)
# ------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
)

app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# Only allow module bank files from the repo root like "Module_1.json"
ALLOWED_JSON = re.compile(r"^Module_[A-Za-z0-9_-]+\.json$")

# ------------------------------------------------------------
# Routes
# ------------------------------------------------------------
@app.get("/healthz")
def healthz():
    return jsonify(ok=True)

@app.get("/favicon.ico")
def favicon():
    # Avoid noisy errors if no favicon is present.
    return ("", 204)

@app.get("/")
def home():
    return render_template("index.html")

@app.get("/<path:filename>")
def serve_json(filename: str):
    """
    Serve module JSON banks (e.g., /Module_1.json) from repo root.
    Reject everything else here so we don't expose the filesystem.
    """
    name = os.path.basename(filename)
    if ALLOWED_JSON.fullmatch(name):
        file_path = BASE_DIR / name
        if file_path.exists():
            return send_from_directory(BASE_DIR, name, mimetype="application/json")
        abort(404)

    abort(404)

# ------------------------------------------------------------
# Local dev entrypoint
# ------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
