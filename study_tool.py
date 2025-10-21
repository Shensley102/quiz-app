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
        # Extract options from a variety of keys
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

        # Some banks include correct letters on the question object. Check
        # multiple possible keys in order of preference.  We handle
        # `correct_answers` (common in this project) as well as
        # `correct`, `answer`, `key`, and `answers_key`.
        if not correct_letters:
            raw_ans = (
                q.get("correct_answers") or
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
                        # Accept letters within the string (e.g., "A,B,D")
                        m = re.findall(r"[A-H]", str(v), re.I)
                        correct_letters.update([x.upper() for x in m])
            elif isinstance(raw_ans, (int, float)) and 0 <= int(raw_ans) < len(norm_opts):
                correct_letters.add(norm_opts[int(raw_ans)]["letter"])
            elif isinstance(raw_ans, str):
                # Accept comma-separated letters or numbers
                parts = re.split(r"[\\s,;]+", raw_ans.strip())
                for part in parts:
                    if not part:
                        continue
                    if part.isdigit():
                        idx2 = int(part)
                        if 0 <= idx2 < len(norm_opts):
                            correct_letters.add(norm_opts[idx2]["letter"])
                    else:
                        m = re.findall(r"[A-H]", part, re.I)
                        if m:
                            correct_letters.update([x.upper() for x in m])

        # If still empty, best effort: mark first as correct (avoids crashes on malformed rows)
        if not correct_letters and norm_opts:
            correct_letters.add("A")

        rationales = q.get("rationale") or q.get("explanation") or q.get("why") or ""

        # Determine whether this question should be treated as multi-select.
        # Only treat as multi-select if the stem explicitly contains the phrase
        # "select all that apply" (case-insensitive).  Some source banks list
        # multiple correct answers even for single-select items, so we cannot
        # rely solely on the number of correct letters.
        is_multi = "select all that apply" in stem.lower()

        # Build the list of correct options.  For multi-select questions, keep
        # all identified correct letters.  For single-select questions, pick
        # only the first letter (alphabetically) from the computed set.  This
        # prevents incorrectly marking multiple answers as correct when the
        # underlying JSON includes an erroneous list of answers.
        sorted_letters = sorted(list(correct_letters))
        if is_multi:
            correct_list = sorted_letters
        else:
            correct_list = sorted_letters[:1]

        norm.append({
            "id": q.get("id") or f"q{idx}",
            "stem": stem,
            "options": norm_opts,
            "correct": correct_list,
            "rationale": rationales,
            # convenience flag used by the client to choose checkbox vs radio
            "is_multi": is_multi
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
    # Return base names without ".json"
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

    # sample 'count' unique questions for the initial round
    random.seed()
    sample = random.sample(questions, k=min(count, len(questions)))

    # Normalize as lookup by id
    by_id = {q["id"]: q for q in questions}

    # Build session state
    _reset_state()
    st = {
        "module": module_id,
        "by_id": by_id,                 # full bank (for re-queue)
        "initial_qids": [q["id"] for q in sample],
        "queue": [q["id"] for q in sample],     # main queue (initial)
        "incorrect_queue": [],          # questions to revisit
        "first_try_total": len(sample), # frozen denominator
        "first_try_correct": 0,
        "first_try_attempted": {},      # qid -> True (attempted once)
        "served": 0,                    # total times a card was served
        "current": None                 # qid currently displayed
    }
    session["quiz_state"] = st
    session.modified = True
    return jsonify({"ok": True, "count": st["first_try_total"]})

# ... existing /api/next, /api/answer, etc. remain unchanged ...
