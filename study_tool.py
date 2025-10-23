import os
import json
import random
import re
import secrets
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
    """Return JSON files that look like question banks."""
    files = []
    for fn in os.listdir("."):
        if fn.lower().endswith(".json") and fn.lower().startswith(("module", "mod", "bank")):
            files.append(fn)
    return sorted(files)


def _load_module(mod_name: str) -> Any:
    """
    Load a module by base name or filename.
    Accepts 'Module_1' or 'Module_1.json'.
    """
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
    """
    Multi-select is TRUE only if the stem contains the EXACT substring:
    '(Select all that apply.)' (case-sensitive, punctuation-sensitive).
    """
    return bool(stem and SELECT_ALL_LITERAL in stem)


def _normalize_options(options: Any) -> List[Dict[str, str]]:
    """
    Normalize options to a list of {'letter': 'A', 'text': '...'}.
    Accepts:
      - list[str]
      - list[dict] with various keys
      - dict like {'A': '...', 'B': '...'}
    """
    norm: List[Dict[str, str]] = []
    if isinstance(options, dict):
        items = sorted(options.items(), key=lambda kv: str(kv[0]))
        for i, (_k, v) in enumerate(items):
            letter = LETTERs[i]
            norm.append({"letter": letter, "text": str(v)})
        return norm

    if not isinstance(options, list):
        options = [options] if options else []

    for i, opt in enumerate(options):
        letter = LETTERs[i]
        if isinstance(opt, str):
            norm.append({"letter": letter, "text": opt})
        elif isinstance(opt, dict):
            text = str(
                opt.get("text")
                or opt.get("answer")
                or opt.get("label")
                or opt.get("value")
                or ""
            )
            norm.append({"letter": letter, "text": text})
        else:
            norm.append({"letter": letter, "text": str(opt)})
    return norm


def _extract_correct_letters(q: Dict[str, Any], options: List[Dict[str, str]]) -> List[str]:
    """
    Pull the correct answers in LETTER form from a variety of shapes.
    Supports:
      - per-option flags like {'text': '...', 'correct': true}
      - fields like 'correct', 'answer', 'key', 'answers_key', 'correct_answers'
        that may be a string ('B' or 'B,D' or '1,3'), a number (index), or a list.
    """
    correct = set()

    # From option objects if correctness flags exist
    raw_opts = q.get("options") or q.get("answers") or q.get("choices")
    if isinstance(raw_opts, list):
        for i, opt in enumerate(raw_opts):
            if isinstance(opt, dict) and any(k in opt for k in ("correct", "is_correct", "right")):
                is_ok = bool(opt.get("correct") or opt.get("is_correct") or opt.get("right"))
                if is_ok and 0 <= i < len(options):
                    correct.add(options[i]["letter"])

    # Fallback to question-level keys
    if not correct:
        raw_ans = (
            q.get("correct_answers")
            or q.get("correct")
            or q.get("answer")
            or q.get("key")
            or q.get("answers_key")
        )

        def add_letter_from_index(idx: int):
            if 0 <= idx < len(options):
                correct.add(options[idx]["letter"])

        if isinstance(raw_ans, list):
            for v in raw_ans:
                if isinstance(v, (int, float)):
                    add_letter_from_index(int(v))
                else:
                    for m in re.findall(r"[A-H]", str(v)):
                        correct.add(m)
        elif isinstance(raw_ans, (int, float)):
            add_letter_from_index(int(raw_ans))
        elif isinstance(raw_ans, str):
            parts = re.split(r"[\s,;]+", raw_ans.strip())
            for part in parts:
                if not part:
                    continue
                if part.isdigit():
                    add_letter_from_index(int(part))
                else:
                    for m in re.findall(r"[A-H]", part):
                        correct.add(m)

    # As a last resort, assume A (prevents crashes on malformed rows)
    if not correct and options:
        correct.add("A")

    return sorted(correct)


def _coerce_questions(raw: Any) -> List[Dict[str, Any]]:
    """
    Normalize the bank to:
      {
        id: str,
        stem: str,
        options: [{letter, text}],
        correct: ["B"] or ["A","D"],
        rationale: str,
        is_multi: bool   # ONLY True if stem has exact '(Select all that apply.)'
      }
    """
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

        # STRICT multi-select rule
        is_multi = _is_select_all(stem)

        # If the stem is NOT a select-all, but multiple answers are listed,
        # force SINGLE-SELECT by keeping just the first letter alphabetically.
        if not is_multi and len(correct_letters) > 1:
            correct_letters = [sorted(correct_letters)[0]]

        norm.append(
            {
                "id": q.get("id")
