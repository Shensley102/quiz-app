// static/script.js
(() => {
  const landing = document.getElementById("landing");
  const quiz = document.getElementById("quiz");

  const moduleSelect = document.getElementById("moduleSelect");
  const countBtns = Array.from(document.querySelectorAll(".count"));

  const startBtn = document.getElementById("startBtn");
  const newQuizBtn = document.getElementById("newQuizBtn");
  const resetBtn = document.getElementById("resetBtn");

  const qStem = document.getElementById("qStem");
  const qOptions = document.getElementById("qOptions");
  const submitBtn = document.getElementById("submitBtn");
  const nextBtn = document.getElementById("nextBtn");
  const resultDiv = document.getElementById("result");
  const scoreLine = document.getElementById("scoreLine");

  const dlg = document.getElementById("confirmReset");
  const yesReset = document.getElementById("confirmResetYes");
  const noReset = document.getElementById("confirmResetNo");

  let chosenCount = 10;
  let currentQ = null;
  let lettersToInputs = {};
  let answered = false;
  let quizDone = false;
  let firstTryScore = { correct: 0, total: 0 };

  // ---------------- API helpers (with automatic route fallback) ----------------
  function apiFetch(url, opts = {}) {
    return fetch(url, Object.assign({
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin" // keep Flask/Vercel session cookie
    }, opts));
  }

  async function fetchJsonFirst(paths, opts) {
    // Try each path until one returns a non-404 response
    let lastError;
    for (const p of paths) {
      try {
        const r = await apiFetch(p, opts);
        if (r.status === 404) continue;
        if (!r.ok) {
          // Non-404 error: surface immediately
          const txt = await r.text().catch(() => "");
          throw new Error(`${r.status} ${r.statusText} ${txt}`.trim());
        }
        return await r.json();
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("No endpoint responded");
  }

  const routes = {
    modules: ["/api/modules", "/modules"],
    start: ["/api/start", "/start"],
    next: ["/api/next", "/next"],
    answer: ["/api/answer", "/answer"],
    reset: ["/api/reset_session", "/reset"]
  };

  // ---------------- UI helpers ----------------
  function setHidden(el, yes) {
    if (yes) el.classList.add("hidden"); else el.classList.remove("hidden");
  }

  function clearOptions() {
    qOptions.innerHTML = "";
    lettersToInputs = {};
  }

  function renderOptions(options, is_multi) {
    clearOptions();
    const type = is_multi ? "checkbox" : "radio";
    options.forEach((opt, idx) => {
      const label = document.createElement("label");
      label.className = "option";

      const input = document.createElement("input");
      input.type = type;
      input.name = "qopts";
      input.value = opt.letter;
      input.id = `opt_${idx}`;

      const span = document.createElement("span");
      span.className = "txt";
      span.textContent = `${opt.letter}. ${opt.text}`;

      label.appendChild(input);
      label.appendChild(span);
      qOptions.appendChild(label);

      lettersToInputs[opt.letter.toUpperCase()] = input;
    });
  }

  function getSelectedLetters() {
    return Array.from(qOptions.querySelectorAll("input:checked"))
      .map(i => i.value.toUpperCase());
  }

  function updateScoreLine() {
    scoreLine.textContent = `First-Try Correct: ${firstTryScore.correct} / ${firstTryScore.total}`;
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
  }

  function returnToLanding() {
    setHidden(quiz, true);
    setHidden(landing, false);
    resultDiv.innerHTML = "";
    qStem.textContent = "Question…";
    clearOptions();
    quizDone = false;
    submitBtn.textContent = "Submit";
  }

  // ---------------- Load modules (works with /modules or /api/modules) ----------------
  function loadModules() {
    fetchJsonFirst(routes.modules)
      .then(items => {
        moduleSelect.innerHTML = "";
        if (!Array.isArray(items) || !items.length) {
          moduleSelect.innerHTML = `<option value="">No modules found</option>`;
          return;
        }
        items.forEach(it => {
          const o = document.createElement("option");
          o.value = it.id || it.file || it; // tolerate different shapes
          o.textContent = it.id || it.file || it;
          moduleSelect.appendChild(o);
        });
        moduleSelect.value = (items[0].id || items[0].file || items[0]);
      })
      .catch(() => alert("Could not load modules"));
  }

  // ---------------- Count selector ----------------
  countBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      countBtns.forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      chosenCount = btn.dataset.count === "ALL" ? 999999 : parseInt(btn.dataset.count, 10);
    });
  });
  if (countBtns[0]) countBtns[0].classList.add("active");

  // ---------------- Start quiz ----------------
  startBtn.addEventListener("click", () => {
    const mod = moduleSelect.value;
    if (!mod) return alert("Select a module first.");

    fetchJsonFirst(routes.start, {
      method: "POST",
      body: JSON.stringify({ module: mod, count: chosenCount })
    })
      .then(data => {
        if (!data || data.ok === false) {
          alert((data && data.error) || "Could not start quiz");
          return;
        }
        firstTryScore = { correct: 0, total: data.count || 0 };
        updateScoreLine();
        quizDone = false;
        submitBtn.textContent = "Submit";
        setHidden(landing, true);
        setHidden(quiz, false);
        loadNext();
      })
      .catch(() => alert("Could not start quiz"));
  });

  // ---------------- Next question ----------------
  function loadNext() {
    resultDiv.innerHTML = "";
    submitBtn.disabled = false;
    nextBtn.disabled = true;
    answered = false;

    fetchJsonFirst(routes.next)
      .then(data => {
        if (data.done) {
          quizDone = true;
          qStem.textContent = "All questions mastered!";
          clearOptions();
          resultDiv.innerHTML = `
            <div class="summary">
              <div>First-Try Score: <b>${data.first_try_correct || 0} / ${data.first_try_total || 0}</b></div>
              <div>Total cards served (with repeats): ${data.served || 0}</div>
            </div>`;
          submitBtn.disabled = false;
          submitBtn.textContent = "Start New Quiz";
          nextBtn.disabled = true;
          currentQ = null;
          return;
        }

        currentQ = data;
        qStem.textContent = data.stem || "Question";
        // The server sets is_multi to true only when the stem contains "select all that apply"
        renderOptions(data.options || [], !!data.is_multi);
      })
      .catch(() => alert("Could not load next question"));
  }

  // ---------------- Submit answer ----------------
  submitBtn.addEventListener("click", () => {
    // If quiz is done, treat as "Start New Quiz"
    if (quizDone) {
      fetchJsonFirst(routes.reset, {
        method: "POST",
        body: JSON.stringify({ confirm: true })
      }).finally(returnToLanding);
      return;
    }

    if (!currentQ) return;
    const selected = getSelectedLetters();
    if (!selected.length) return alert("Select at least one answer.");

    submitBtn.disabled = true;

    fetchJsonFirst(routes.answer, {
      method: "POST",
      body: JSON.stringify({ qid: currentQ.qid, selected })
    })
      .then(data => {
        answered = true;

        if (typeof data.first_try_correct === "number") {
          firstTryScore.correct = data.first_try_correct;
          if (typeof data.first_try_total === "number") {
            firstTryScore.total = data.first_try_total;
          }
          updateScoreLine();
        }

        const tag = data.ok
          ? `<span class="ok">Correct!</span>`
          : `<span class="bad">Incorrect.</span> <span class="muted">Correct: ${data.correct.join(", ")}</span>`;

        const rationale = data.rationale
          ? `<div class="rationale"><b>Rationale:</b> ${escapeHTML(data.rationale)}</div>`
          : "";

        resultDiv.innerHTML = `${tag}${rationale}`;
        nextBtn.disabled = false;
      })
      .catch(() => {
        submitBtn.disabled = false;
        alert("Error submitting answer");
      });
  });

  nextBtn.addEventListener("click", () => {
    if (!answered) return alert("Submit your answer first.");
    loadNext();
  });

  // ---------------- New Quiz / Reset ----------------
  newQuizBtn.addEventListener("click", () => {
    fetchJsonFirst(routes.reset, {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    }).finally(returnToLanding);
  });

  resetBtn.addEventListener("click", () => dlg.showModal());
  yesReset.addEventListener("click", () => {
    dlg.close();
    fetchJsonFirst(routes.reset, {
      method: "POST",
      body: JSON.stringify({ confirm: true })
    }).then(returnToLanding);
  });
  noReset.addEventListener("click", () => dlg.close());

  // ---------------- Keyboard shortcuts ----------------
  document.addEventListener("keydown", ev => {
    if (quiz.classList.contains("hidden")) return;

    const key = ev.key.toUpperCase();
    if (key >= "A" && key <= "H" && lettersToInputs[key]) {
      ev.preventDefault();
      const input = lettersToInputs[key];
      if (input.type === "radio") {
        if (input.checked) {
          input.checked = false;
        } else {
          qOptions.querySelectorAll("input[type=radio]").forEach(r => (r.checked = false));
          input.checked = true;
        }
      } else {
        input.checked = !input.checked;
      }
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (quizDone) {
        submitBtn.click(); // start new quiz
      } else if (!answered) {
        submitBtn.click();
      } else {
        nextBtn.click();
      }
    }
  });

  // ---------------- Init ----------------
  loadModules();
})();
