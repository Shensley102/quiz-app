import os, json, random, re
from flask import Flask, jsonify, request, render_template, session

# ---- Flask ------------------------------------------------------------
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder="static",
    template_folder="templates",
)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# ---- Helpers ----------------------------------------------------------
LETTERs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _discover_module_files():
    """Return list of JSON files that look like modules."""
    files = []
    for fn in os.listdir("."):
        if fn.lower().endswith(".json") and fn.lower().startswith(("module", "mod", "bank")):
            files.append(fn)
    return sorted(files)


def _load_module(mod_name: str):
    """Load module JSON by base name or file name (e.g., 'Module_1' or 'Module_1.json')."""
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
    Coerce a variety of JSON shapes into a normalized list of questions:

    {
      id: str,
      stem: str,
      options: [{"letter":"A","text":"..."}, ...],
      correct: ["A","C"],
      rationale: "....",
      is_multi: bool
    }
    """
    if isinstance(raw, dict) and "questions" in raw:
        qlist = raw["questions"]
    elif isinstance(raw, list):
        qlist = raw
    else:  # single question?
        qlist = [raw]

    norm = []
    for idx, q in enumerate(qlist):
        # Stem / prompt text
        stem = q.get("stem") or q.get("question") or q.get("prompt") or q.get("text") or ""

        # Options (accept many shapes)
        options = q.get("options") or q.get("answers") or q.get("choices") or []
        if isinstance(options, dict):  # sometimes keys are "A", "B", ...
            opts = []
            for i, k in enumerate(sorted(options.keys())):
                opts.append({"letter": LETTERs[i], "text": str(options[k]), "is_correct": False})
            options = opts

        norm_opts = []
        correct_letters = set()

        if isinstance(options, list) and options:
            for i, opt in enumerate(options):
                # option can be simple string or dict
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

        # Some banks include correct letters on the question object. Check several keys.
        if not correct_letters:
            raw_ans = (
                q.get("correct_answers")
                or q.get("correct")
                or q.get("answer")
                or q.get("key")
                or q.get("answers_key")
            )
            if isinstance(raw_ans, list):
                for v in raw_ans:
                    if isinstance(v, (int, float)) and 0 <= int(v) < len(norm_opts):
                        correct_letters.add(norm_opts[int(v)]["letter"])
                    else:
                        m = re.findall(r"[A-H]", str(v), re.I)  # accept "A,B,D" etc.
                        correct_letters.update([x.upper() for x in m])
            elif isinstance(raw_ans, (int, float)) and 0 <= int(raw_ans) < len(norm_opts):
                correct_letters.add(norm_opts[int(raw_ans)]["letter"])
            elif isinstance(raw_ans, str):
                parts = re.split(r"[\s,;]+", raw_ans.strip())
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

        # If still empty, mark first as correct (avoids crashes on malformed rows)
        if not correct_letters and norm_opts:
            correct_letters.add("A")

        rationale = q.get("rationale") or q.get("explanation") or q.get("why") or ""

        # Determine multi-select:
        # 1) explicit wording in the stem, OR
        # 2) a type field containing "multiple" or "multi"
        qtype = (q.get("type") or "").lower()
        is_multi = "select all that apply" in stem.lower() or "multi" in qtype or "multiple" in qtype

        # Build final record; for single-select, keep only the first correct letter
        sorted_letters = sorted(list(correct_letters))
        correct_list = sorted_letters if is_multi else sorted_letters[:1]

        norm.append(
            {
                "id": q.get("id") or q.get("question_id") or f"q{idx}",
                "stem": stem,
                "options": norm_opts,
                "correct": correct_list,
                "rationale": rationale,
                "is_multi": is_multi,  # client uses this to choose checkbox vs radio
            }
        )
    return norm


def _get_state(create=False):
    s = session.get("quiz_state")
    if s is None and create:
        s = {}
        session["quiz_state"] = s
    return s


def _reset_state():
    session.pop("quiz_state", None)


def _by_id_for(module_id: str):
    """Reload the module and build an id->question mapping on demand."""
    questions = _coerce_questions(_load_module(module_id))
    return {q["id"]: q for q in questions}


# ---- Routes -----------------------------------------------------------

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/modules")
@app.get("/modules")
def api_modules():
    files = _discover_module_files()
    # Return base names without ".json"
    items = [{"id": os.path.splitext(fn)[0], "file": fn} for fn in files]
    return jsonify(items)


@app.post("/api/start")
@app.post("/start")
def api_start():
    data = request.get_json(force=True) or {}
    module_id = data.get("module")
    count = int(data.get("count", 10))
    if not module_id:
        return jsonify({"ok": False, "error": "No module"}), 400

    try:
        questions = _coerce_questions(_load_module(module_id))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not load module: {e}"}), 400

    if not questions:
        return jsonify({"ok": False, "error": "No questions in module"}), 400

    # Sample unique questions for the first round
    random.seed()
    sample = random.sample(questions, k=min(count, len(questions)))

    # IMPORTANT: keep the session tiny (cookie-backed). Store only IDs + counters.
    _reset_state()
    st = {
        "module": module_id,
        "initial_qids": [q["id"] for q in sample],
        "queue": [q["id"] for q in sample],     # main queue (initial)
        "incorrect_queue": [],                  # questions to revisit
        "first_try_total": len(sample),         # denominator frozen for the run
        "first_try_correct": 0,
        "first_try_attempted": {},              # qid -> True (attempted once)
        "served": 0,                            # total cards served (with repeats)
        "current": None,                        # qid currently displayed
    }
    session["quiz_state"] = st
    session.modified = True
    return jsonify({"ok": True, "count": st["first_try_total"]})


@app.get("/api/next")
@app.get("/next")
def api_next():
    st = _get_state()
    if not st or not st.get("module"):
        return jsonify({"ok": False, "error": "No active quiz"}), 400

    # If the main queue is empty, recycle incorrects
    if not st["queue"]:
        if st["incorrect_queue"]:
            st["queue"] = st["incorrect_queue"]
            st["incorrect_queue"] = []
        else:
            # All done — send summary the client expects
            return jsonify(
                {
                    "done": True,
                    "first_try_correct": st.get("first_try_correct", 0),
                    "first_try_total": st.get("first_try_total", 0),
                    "served": st.get("served", 0),
                }
            )

    qid = st["queue"].pop(0)
    st["current"] = qid
    st["served"] = int(st.get("served", 0)) + 1
    session.modified = True

    by_id = _by_id_for(st["module"])
    q = by_id.get(qid)
    if not q:
        return jsonify({"ok": False, "error": "Question not found"}), 500

    return jsonify(
        {
            "qid": qid,
            "stem": q["stem"],
            "options": q["options"],
            "is_multi": bool(q.get("is_multi")),
        }
    )


@app.post("/api/answer")
@app.post("/answer")
def api_answer():
    st = _get_state()
    if not st or not st.get("module"):
        return jsonify({"ok": False, "error": "No active quiz"}), 400

    data = request.get_json(force=True) or {}
    qid = data.get("qid")
    selected = set((data.get("selected") or []))

    by_id = _by_id_for(st["module"])
    q = by_id.get(qid)
    if not q:
        return jsonify({"ok": False, "error": "Question not found"}), 400

    correct = set(q["correct"])
    ok = selected == correct

    # First-try bookkeeping
    first_try_attempted = st.setdefault("first_try_attempted", {})
    if qid not in first_try_attempted:
        first_try_attempted[qid] = True
        if ok:
            st["first_try_correct"] = int(st.get("first_try_correct", 0)) + 1

    # If incorrect, queue for another round
    if not ok:
        st["incorrect_queue"].append(qid)

    session.modified = True
    return jsonify(
        {
            "ok": ok,
            "correct": sorted(list(correct)),
            "rationale": q.get("rationale") or "",
            "first_try_correct": st.get("first_try_correct", 0),
            "first_try_total": st.get("first_try_total", 0),
        }
    )


@app.post("/api/reset_session")
@app.post("/reset")
def api_reset():
    _reset_state()
    return jsonify({"ok": True})


# Optional: simple health check for uptime monitors
@app.get("/healthz")
def healthz():
    return jsonify({"ok": True})
