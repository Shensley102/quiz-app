# study_tool.py
import os, json, random, re
from flask import Flask, jsonify, request, render_template, session, send_from_directory

# ---- Flask ------------------------------------------------------------
app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# ---- Helpers ----------------------------------------------------------
LETTERs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

def _discover_module_files():
    """Return list of json file names that look like modules."""
    files = []
    for fn in os.listdir("."):
        if fn.lower().endswith(".json") and fn.lower().startswith(("module", "mod", "bank")):
            files.append(fn)
    return sorted(files)

def _load_module(mod_name):
    """Load module JSON by base name or file name."""
    # Accept "Module_1" or "Module_1.json"
    candidates = []
    for fn in _discover_module_files():
        base = os.path.splitext(fn)[0]
        if base == mod_name or fn == mod_name or base.lower() == mod_name.lower():
            candidates.append(fn)
    if not candidates:
        raise FileNotFoundError("Module JSON not found")
    path = candidates[0]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

def _coerce_questions(raw):
    """
    Coerce a variety of JSON shapes into a normalized list:
    {
      id: str,
      stem: str,
      options: [{"letter":"A","text":"..."}, ...],
      correct: ["A","C"],
      rationale: "..."
    }
    """
    if isinstance(raw, dict) and "questions" in raw:
        qlist = raw["questions"]
    elif isinstance(raw, list):
        qlist = raw
    else:
        # Single question?
        qlist = [raw]

    norm = []
    for idx, q in enumerate(qlist):
        # Extract stem
        stem = q.get("stem") or q.get("question") or q.get("prompt") or q.get("text") or ""

        # Extract options (strings or dict)
        options = q.get("options") or q.get("answers") or q.get("choices") or []
        if isinstance(options, dict):  # sometimes keys are "A","B",...
            opts = []
            for i, k in enumerate(sorted(options.keys())):
                opts.append({"letter": LETTERs[i], "text": str(options[k]), "is_correct": False})
            options = opts

        norm_opts = []
        correct_letters = set()

        if isinstance(options, list) and options:
            for i, opt in enumerate(options):
                # option can be string or dict
                if isinstance(opt, str):
                    text = opt
                    is_correct = False
                else:
                    text = str(opt.get("text") or opt.get("answer") or opt.get("label") or "")
                    is_correct = bool(opt.get("correct") or opt.get("is_correct") or opt.get("right"))
                letter = LETTERs[i]
                norm_opts.append({"letter": letter, "text": text})
                if is_correct:
                    correct_letters.add(letter)

        # Accept multiple common keys for the answer letters
        raw_ans = (
            q.get("correct_answers") or     # <-- add this (list of letters)
            q.get("correct") or
            q.get("answer") or
            q.get("key") or
            q.get("answers_key")
        )

        if not correct_letters and raw_ans is not None:
            if isinstance(raw_ans, list):
                for i, v in enumerate(raw_ans):
                    if isinstance(v, (int, float)) and 0 <= int(v) < len(norm_opts):
                        correct_letters.add(norm_opts[int(v)]["letter"])
                    else:
                        # Assume letter or text match
                        m = re.findall(r"[A-H]", str(v), re.I)
                        correct_letters.update([x.upper() for x in m])
            elif isinstance(raw_ans, (int, float)) and 0 <= int(raw_ans) < len(norm_opts):
                correct_letters.add(norm_opts[int(raw_ans)]["letter"])
            elif isinstance(raw_ans, str):
                m = re.findall(r"[A-H]", raw_ans, re.I)
                if m:
                    correct_letters.update([x.upper() for x in m])

        # If still empty, best effort: mark first as correct (avoids crashes on malformed rows)
        if not correct_letters and norm_opts:
            correct_letters.add("A")

        rationales = q.get("rationale") or q.get("explanation") or q.get("why") or ""

        norm.append({
            "id": q.get("id") or f"q{idx}",
            "stem": stem,
            "options": norm_opts,
            "correct": sorted(list(correct_letters)),
            "rationale": rationales,
            "is_multi": len(correct_letters) > 1 or "(select all that apply" in stem.lower()
        })
    return norm

def _get_state(create=False):
    s = session.get("quiz_state")
    if s is None and create:
        s = {}
        session["quiz_state"] = s
    return s

def _reset_state():
    session.pop("quiz_state", None)

# ---- Routes -----------------------------------------------------------

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/modules")
def api_modules():
    files = _discover_module_files()
    items = [{"id": os.path.splitext(fn)[0], "file": fn} for fn in files]
    return jsonify(items)

@app.post("/api/start")
def api_start():
    data = request.get_json(force=True)
    module_id = (data or {}).get("module")
    count = int((data or {}).get("count", 10))
    if not module_id:
        return jsonify({"ok": False, "error": "No module"}), 400

    try:
        mod_raw = _load_module(module_id)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not load module: {e}"}), 400

    questions = _coerce_questions(mod_raw)
    if not questions:
        return jsonify({"ok": False, "error": "No questions in module"}), 400

    random.seed()
    sample = random.sample(questions, k=min(count, len(questions)))

    by_id = {q["id"]: q for q in questions}

    _reset_state()
    st = {
        "module": module_id,
        "by_id": by_id,
        "initial_qids": [q["id"] for q in sample],
        "queue": [q["id"] for q in sample],
        "incorrect_queue": [],
        "first_try_total": len(sample),
        "first_try_correct": 0,
        "first_try_attempted": {},
        "served": 0,
        "current": None
    }
    session["quiz_state"] = st
    session.modified = True
    return jsonify({"ok": True, "count": st["first_try_total"]})

@app.get("/api/next")
def api_next():
    st = _get_state()
    if not st:
        return jsonify({"done": True, "error": "No active quiz"}), 200

    qid = None
    if st["queue"]:
        qid = st["queue"].pop(0)
    elif st["incorrect_queue"]:
        qid = st["incorrect_queue"].pop(0)

    if qid is None:
        return jsonify({
            "done": True,
            "first_try_correct": st["first_try_correct"],
            "first_try_total": st["first_try_total"],
            "served": st["served"]
        })

    q = st["by_id"][qid]
    st["served"] += 1
    st["current"] = qid
    session.modified = True

    return jsonify({
        "done": False,
        "qid": qid,
        "stem": q["stem"],
        "options": q["options"],
        "is_multi": q.get("is_multi", False)
    })

@app.post("/api/answer")
def api_answer():
    st = _get_state()
    if not st or not st.get("current"):
        return jsonify({"ok": False, "error": "No question in flight"}), 400

    payload = request.get_json(force=True) or {}
    qid = payload.get("qid") or st["current"]
    selected = payload.get("selected") or []
    selected = [str(x).upper() for x in selected]

    q = st["by_id"][qid]
    correct_set = set(q["correct"])
    selected_set = set(selected)
    ok = selected_set == correct_set

    if (qid in st["initial_qids"]) and (qid not in st["first_try_attempted"]):
        st["first_try_attempted"][qid] = True
        if ok:
            st["first_try_correct"] += 1

    if not ok:
        st["incorrect_queue"].append(qid)

    session.modified = True
    return jsonify({
        "ok": ok,
        "correct": sorted(list(correct_set)),
        "rationale": q.get("rationale", "")
    })

@app.post("/api/reset")
def api_reset():
    _reset_state()
    return jsonify({"ok": True})

@app.get("/modules/<path:filename>")
def get_module_file(filename):
    return send_from_directory(".", filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
