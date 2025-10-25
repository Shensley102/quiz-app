import os
import re
from pathlib import Path
from flask import Flask, render_template, send_from_directory, abort, jsonify

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(
    __name__,
    static_url_path="/static",
    static_folder=str(STATIC_DIR),
    template_folder=str(TEMPLATES_DIR),
)

app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret")

# Only allow banks named like Module_1.json, Module_2.json, etc.
ALLOWED_JSON = re.compile(r"^Module_[A-Za-z0-9_-]+\.json$")

@app.get("/healthz")
def healthz():
    return jsonify(ok=True)

@app.get("/favicon.ico")
def favicon():
    # Quietly no-op if you don't have a favicon yet
    return ("", 204)

@app.get("/")
def home():
    return render_template("index.html")

@app.get("/<path:filename>")
def serve_banks(filename: str):
    """
    Serve only the module JSON banks from the repo root.
    Example: /Module_1.json, /Module_2.json
    """
    name = os.path.basename(filename)
    if ALLOWED_JSON.fullmatch(name):
        path = BASE_DIR / name
        if path.exists():
            return send_from_directory(BASE_DIR, name, mimetype="application/json")
        abort(404)
    abort(404)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
