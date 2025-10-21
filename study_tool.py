import os, json, random, re
from flask import Flask, jsonify, request, render_template, session, send_from_directory

app = Flask(__name__, static_url_path="/static", static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# ---------------------- Module loading / normalization ----------------------

def _discover_module_files():
    files = []
    for fn in os.listdir("."):
        low = fn.lower()
        if low.endswith(".json") and low.startswith(("module", "mod", "bank")):
            files.append(fn)
    files.sort()
    return files

def _load_raw_module(module_id: str):
    """Accept 'Module_1' or 'Module_1.json' and return loaded JSON."""
    for fn in _discover_module_files():
        base = os.path.splitext(fn)[0]
        if base == module_id or fn == module_id:
            with open(fn, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError(f"{module_id}.json not found")

def _normalize_questions(raw):
    """Return list of normalized questions with stable string ids."""
    if isinstance(raw, dict) and "questions" in raw:
        qlist = raw["questions"]
    elif isinstance(raw, list):
        qlist = raw
    else:
        qlist = [raw]

    out = []
    for idx, q in enumerate(qlist):
        stem = q.get("stem") or q.get("question") or q.get("prompt") or ""
        # options can be list or dict
        options = q.get("options") or q.get("choices") or q.get("answers") or []
        if isinstance(options, dict):
            # convert {"A":"...","B":"..."} to list ordered by key
            options = [options[k] for k in sorted(options.keys())]

        norm_opts = []
        for i, opt in enumerate(options):
            if i >= len(LETTERS): break
            text = str(opt) if isinstance(opt, str) else str(opt.get("text") or opt.get("answer") or "")
            norm_opts.append({"letter": LETTERS[i], "text": text})

        # derive correct letters
        correct_letters = set()
        raw_ans = (
            q.get("correct_answers") or  # preferred key
            q.get("correct") or
            q.get("answer") or
            q.get("key") or
            q.get("answers_key")
        )
        if isinstance(raw_ans, list):
            for v in raw_ans:
                if isinstance(v, (int, float)) and 0 <= int(v) < len(norm_opts):
                    correct_letters.add(norm_opts[int(v)]["letter"])
                else:
                    correct_letters.update([x.upper() for x in re.findall(r"[A-H]", str(v), re.I)])
        elif isinstance(raw_ans, (int, float)) and 0 <= int(raw_ans) < len(norm_opts):
            correct_letters.add(norm_opts[int(raw_ans)]["letter"])
        elif isinstance(raw_ans, str):
            m = re.findall(r"[A-H]", raw_ans, re.I)
            if m: correct_letters.update([x.upper() for x in m])

        if not correct_letters and norm_opts:
            # fallback so bad rows don't crash the flow
            correct_letters.add("A")

        rationale = q.get("rationale") or q.get("explanation") or ""

        out.append({
            "id": str(q.get("id") or f"q{idx+1}"),
            "stem": str(stem),
            "options": norm_opts,
            "correct": sorted(list(correct_letters)),
            "is_multi": len(correct_letters) > 1 or "select all that apply" in stem.lower(),
            "rationale": str(rationale),
        })
    # keep only valid items
    out = [q for q in out if len(q["options"]) >= 2 and len(q["correct"]) >= 1]
    return out

def _load_norm_module(module_id: str):
    raw = _load_raw_module(module_id)
    return _normalize_questions(raw)

def _by_id(questions):
    return {q["id"]: q for q in questions}

# ------------------------------- Session utils ------------------------------

def _reset_state():
    session.pop("quiz", None)

def _get_state():
    return session.get("quiz")

def _ensure_state():
    st = _get_state()
    if not st:
        return None
    return st

# ---------------------------------- Routes ----------------------------------

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/api/modules")
def api_modules():
    items = []
    for fn in _discover_module_files():
        mod_id = os.path.splitext(fn)[0]
        try:
            count = len(_load_norm_module(mod_id))
        except Exception:
            count = None
        items.append({"id": mod_id, "file": fn, "count": count})
    return jsonify(items)

@app.post("/api/start")
def api_start():
    data = request.get_json(force=True) or {}
    module_id = (data.get("module") or "").strip()
    count = int(data.get("count") or 10)
    if not module_id:
        return jsonify({"ok": False, "error": "No module"}), 400

    try:
        questions = _load_norm_module(module_id)
    except Exception as e:
        return jsonify({"ok": False, "error": f"Failed to load module: {e}"}), 400

    if not questions:
        return jsonify({"ok": False, "error": "No questions in module"}), 400

    random.shuffle(questions)
    chosen = questions[:count] if count > 0 else questions

    # Store only tiny state in cookie (avoid 4KB limit).
    state = {
        "module_id": module_id,
        "queue": [q["id"] for q in chosen],
        "first_try_total": len(chosen),
        "first_try_correct": 0,
        "served": 0,
        "current": None,
        "attempted": [],  # list of qids attempted at least once
    }
    session["quiz"] = state
    session.modified = True

    return jsonify({"ok": True, "count": state["first_try_total"]})

@app.get("/api/next")
def api_next():
    st = _ensure_state()
    if not st:
        return jsonify({"done": True, "error": "No active quiz"})

    if st["queue"]:
        qid = st["queue"].pop(0)
    else:
        # done
        return jsonify({
            "done": True,
            "first_try_correct": st.get("first_try_correct", 0),
            "first_try_total": st.get("first_try_total", 0),
            "served": st.get("served", 0),
        })

    # reload module and map by id (keeps cookie tiny)
    qs = _load_norm_module(st["module_id"])
    table = _by_id(qs)
    q = table.get(qid)
    if not q:
        # skip invalid id
        return jsonify({"done": True, "error": "Question missing"})

    st["current"] = qid
    st["served"] = st.get("served", 0) + 1
    session["quiz"] = st
    session.modified = True

    return jsonify({
        "done": False,
        "qid": qid,
        "stem": q["stem"],
        "options": [{"letter": o["letter"], "text": o["text"]} for o in q["options"]],
        "is_multi": q.get("is_multi", False),
    })

@app.post("/api/answer")
def api_answer():
    st = _ensure_state()
    if not st or not st.get("current"):
        return jsonify({"ok": False, "error": "No active question"}), 400

    payload = request.get_json(force=True) or {}
    qid = str(payload.get("qid") or st["current"])
    selected = [str(x).upper() for x in (payload.get("selected") or [])]

    qs = _load_norm_module(st["module_id"])
    table = _by_id(qs)
    q = table.get(qid)
    if not q:
        return jsonify({"ok": False, "error": "Question missing"}), 400

    correct_set = set(q["correct"])
    selected_set = set(selected)
    ok = (selected_set == correct_set)

    attempted = set(st.get("attempted", []))
    if qid not in attempted:
        attempted.add(qid)
        if ok:
            st["first_try_correct"] = st.get("first_try_correct", 0) + 1
    st["attempted"] = list(attempted)

    # put back in queue if wrong
    if not ok:
        st["queue"].append(qid)

    # clear current
    st["current"] = None
    session["quiz"] = st
    session.modified = True

    return jsonify({
        "ok": ok,
        "correct": sorted(list(correct_set)),
        "rationale": q.get("rationale", ""),
        # send current first-try stats so UI updates immediately
        "first_try_correct": st.get("first_try_correct", 0),
        "first_try_total": st.get("first_try_total", 0),
    })

# Safer reset (optional hardening)
@app.post("/api/reset_session")
def api_reset_session():
    data = request.get_json(silent=True) or {}
    if not data.get("confirm"):
        return jsonify({"ok": False, "error": "Confirmation required"}), 400
    _reset_state()
    return jsonify({"ok": True})

# convenient: download module files
@app.get("/modules/<path:filename>")
def get_module_file(filename):
    return send_from_directory(".", filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
