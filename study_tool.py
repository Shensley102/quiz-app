import os
import json
import random
import re
from typing import Dict, List, Any, Optional

from flask import Flask, jsonify, request, render_template, session

# ---------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------
app = Flask(
    __name__,
    static_url_path="/static",
    static_folder="static",
    template_folder="templates",
)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# ---------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------
LETTERs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
SELECT_ALL_LITERAL = "(Select all that apply.)"  # strict literal requirement


def _discover_module_files() -> List[str]:
    files = []
    for fn in os.listdir("."):
        if fn.lower().endswith(".json") and fn.lower().startswith(("module", "mod", "bank")):
            files.append(fn)
    return sorted(files)


def _load_module(mod_name: str) -> Any:
    candidates = []
    for fn in _discover_module_files():
        base = os.path.splitext(fn)[0]
        if base == mod_name or fn == mod_name or base.lower() == mod_name.lower():
            candidates.append(fn)
    if not candidates:
        raise FileNotFoundError(f"Module JSON not found for: {mod_name}")
    path = candidates[0]
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _is_select_all(stem: str) -> bool:
    return bool(stem and SELECT_ALL_LITERAL in stem)


def _normalize_options(options: Any) -> List[Dict[str, str]]:
    norm: List[Dict[str, str]] = []
    if isinstance(options, dict):
        items = sorted(options.items(), key=lambda kv: str(kv[0]))
        for i, (_k, v) in enumerate(items):
            norm.append({"letter": LETTERs[i], "text": str(v)})
        return norm

    if not isinstance(options, list):
        options = [options] if options else []

    for i, opt in enumerate(options):
        letter = LETTERs[i]
        if isinstance(opt, str):
            norm.append({"letter": letter, "text": opt})
        elif isinstance(opt, dict):
            text = str(opt.get("text") or opt.get("answer") or opt.get("label") or opt.get("value") or "")
            norm.append({"letter": letter, "text": text})
        else:
            norm.append({"letter": letter, "text": str(opt)})
    return norm


def _extract_correct_letters(q: Dict[str, Any], options: List[Dict[str, str]]) -> List[str]:
    correct = set()
    raw_opts = q.get("options") or q.get("answers") or q.get("choices")
    if isinstance(raw_opts, list):
        for i, opt in enumerate(raw_opts):
            if isinstance(opt, dict) and any(k in opt for k in ("correct", "is_correct", "right")):
                if bool(opt.get("correct") or opt.get("is_correct") or opt.get("right")) and 0 <= i < len(options):
                    correct.add(options[i]["letter"])

    if not correct:
        raw_ans = q.get("correct_answers") or q.get("correct") or q.get("answer") or q.get("key") or q.get("answers_key")

        def add_idx(idx: int):
            if 0 <= idx < len(options):
                correct.add(options[idx]["letter"])

        if isinstance(raw_ans, list):
            for v in raw_ans:
                if isinstance(v, (int, float)):
                    add_idx(int(v))
                else:
                    for m in re.findall(r"[A-H]", str(v)):
                        correct.add(m)
        elif isinstance(raw_ans, (int, float)):
            add_idx(int(raw_ans))
        elif isinstance(raw_ans, str):
            for part in re.split(r"[\s,;]+", raw_ans.strip()):
                if not part:
                    continue
                if part.isdigit():
                    add_idx(int(part))
                else:
                    for m in re.findall(r"[A-H]", part):
                        correct.add(m)

    if not correct and options:
        correct.add("A")
    return sorted(correct)


def _coerce_questions(raw: Any) -> List[Dict[str, Any]]:
    if isinstance(raw, dict) and "questions" in raw:
        qlist = raw["questions"]
    elif isinstance(raw, list):
        qlist = raw
    else:
        qlist = [raw]

    norm: List[Dict[str, Any]] = []
    for idx, q in enumerate(qlist):
        stem = q.get("stem") or q.get("question") or q.get("prompt") or q.get("text") or ""
        options = _normalize_options(q.get("options") or q.get("answers") or q.get("choices") or [])
        correct_letters = _extract_correct_letters(q, options)
        rationale = q.get("rationale") or q.get("explanation") or q.get("why") or ""
        is_multi = _is_select_all(stem)

        if not is_multi and len(correct_letters) > 1:
            correct_letters = [sorted(correct_letters)[0]]

        norm.append(
            {
                "id": q.get("id") or q.get("question_id") or f"q{idx}",
                "stem": stem,
                "options": options,
                "correct": correct_letters,
                "rationale": rationale,
                "is_multi": is_multi,
            }
        )
    return norm


def _get_state(create: bool = False) -> Optional[Dict[str, Any]]:
    s = session.get("quiz_state")
    if s is None and create:
        s = {}
        session["quiz_state"] = s
    return s


def _reset_state() -> None:
    session.pop("quiz_state", None)


def _by_id_for(module_id: str) -> Dict[str, Dict[str, Any]]:
    questions = _coerce_questions(_load_module(module_id))
    return {q["id"]: q for q in questions}


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/modules")
@app.get("/modules")
def api_modules():
    files = _discover_module_files()
    items = [{"id": os.path.splitext(fn)[0], "file": fn} for fn in files]
    return jsonify(items)


@app.post("/api/start")
@app.post("/start")
def api_start():
    data = request.get_json(force=True) or {}
    module_id = data.get("module")
    if not module_id:
        return jsonify({"ok": False, "error": "No module"}), 400

    try:
        questions = _coerce_questions(_load_module(module_id))
    except Exception as e:
        return jsonify({"ok": False, "error": f"Could not load module: {e}"}), 400
    if not questions:
        return jsonify({"ok": False, "error": "No questions in module"}), 400

    # NEW: handle "full" / "all" or numeric counts (10/25/50/100)
    raw_count = data.get("count", 10)
    if isinstance(raw_count, str) and raw_count.lower() in {"full", "all", "max"}:
        count = len(questions)
    else:
        try:
            count = int(raw_count)
        except Exception:
            count = 10
        if count <= 0 or count > len(questions):
            count = len(questions)

    random.seed()
    sample = random.sample(questions, k=min(count, len(questions)))

    _reset_state()
    st = {
        "module": module_id,
        "initial_qids": [q["id"] for q in sample],
        "queue": [q["id"] for q in sample],
        "incorrect_queue": [],
        "first_try_total": len(sample),
        "first_try_correct": 0,
        "first_try_attempted": {},
        "served": 0,
        "submissions": 0,
        "current": None,
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

    if not st["queue"]:
        if st["incorrect_queue"]:
            st["queue"] = st["incorrect_queue"]
            st["incorrect_queue"] = []
        else:
            first = int(st.get("first_try_correct", 0))
            total = int(st.get("first_try_total", 0))
            pct = int(round((100 * first / total), 0)) if total else 0
            return jsonify(
                {
                    "done": True,
                    "first_try_correct": first,
                    "first_try_total": total,
                    "first_try_pct": pct,
                    "submissions": int(st.get("submissions", 0)),
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
            "served": st["served"],  # for the running counter
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

    st["submissions"] = int(st.get("submissions", 0)) + 1

    correct = set(q["correct"])
    ok = selected == correct

    first_try_attempted = st.setdefault("first_try_attempted", {})
    if qid not in first_try_attempted:
        first_try_attempted[qid] = True
        if ok:
            st["first_try_correct"] = int(st.get("first_try_correct", 0)) + 1

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


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True})
