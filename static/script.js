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

  const runCounter = document.getElementById("runCounter");
  const runCounterNum = document.getElementById("runCounterNum");

  // Backend routes (with non-/api fallback)
  const routes = {
    modules: ["/api/modules", "/modules"],
    start: ["/api/start", "/start"],
    next: ["/api/next", "/next"],
    answer: ["/api/answer", "/answer"],
    reset: ["/api/reset_session", "/reset"],
  };

  // ---- helpers ----
  function setHidden(el, yes) { el.classList.toggle("hidden", !!yes); }
  function clearOptions() { qOptions.innerHTML = ""; }
  function escapeHTML(s="") {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  }

  function renderOptions({ options = [], is_multi = false }) {
    clearOptions();
    const type = is_multi ? "checkbox" : "radio";
    lettersToInputs = {};
    options.forEach(({ letter, text }) => {
      const id = `opt_${letter}`;
      const label = document.createElement("label");
      label.className = "option";
      label.setAttribute("for", id);
      label.innerHTML = `
        <input type="${type}" id="${id}" name="choice" value="${letter}">
        <span class="letter">${letter}.</span>
        <span class="text">${escapeHTML(text || "")}</span>
      `;
      const input = label.querySelector("input");
      qOptions.appendChild(label);
      lettersToInputs[letter.toUpperCase()] = input;
    });
    // focus first option for quick keyboard workflow
    const first = qOptions.querySelector("input");
    if (first) first.focus();
  }

  function getSelectedLetters() {
    return Array.from(qOptions.querySelectorAll("input:checked")).map(i => i.value.toUpperCase());
  }

  // Hide live score during quiz; metrics display only at the end
  function updateScoreLine() { scoreLine.classList.add("hidden"); }

  function returnToLanding() {
    setHidden(quiz, true);
    setHidden(landing, false);
    setHidden(runCounter, true);
    resultDiv.innerHTML = "";
    qStem.textContent = "Question…";
    clearOptions();
    updateScoreLine();
  }

  // ---- API helpers ----
  function apiFetch(url, opts = {}) {
    return fetch(url, Object.assign({ headers: { "Content-Type": "application/json" }, credentials: "same-origin" }, opts));
  }
  async function fetchJsonFirst(paths, opts = {}) {
    let lastError = null;
    for (const p of paths) {
      try {
        const r = await apiFetch(p, opts);
        if (r.status === 404) continue;
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`${r.status} ${r.statusText} ${txt}`.trim());
        }
        return await r.json();
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error("No endpoint responded");
  }

  // ---- local state ----
  let chosenCount = 10;
  let currentQ = null;
  let lettersToInputs = {};
  let answered = false;
  let quizDone = false;
  let firstTryScore = { correct: 0, total: 0 };
  let runCount = 0; // running number independent of graded stats

  // ---- load modules ----
  async function loadModules() {
    try {
      const items = await fetchJsonFirst(routes.modules);
      moduleSelect.innerHTML = `<option value="">Choose a module…</option>` + items.map(i => `<option value="${i.id}">${i.id}</option>`).join("");
    } catch {
      moduleSelect.innerHTML = `<option value="">(Could not load modules)</option>`;
    }
  }

  // ---- start quiz ----
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
      quizDone = false;
      answered = false;
      runCount = 0;

      // show quiz UI
      setHidden(landing, true);
      setHidden(scoreLine, true);
      setHidden(quiz, false);
      setHidden(runCounter, false);
      runCounterNum.textContent = "1";

      // button states: Submit enabled, Next disabled
      submitBtn.disabled = false;
      nextBtn.disabled = true;

      loadNext();
    })
    .catch(() => alert("Could not start quiz."));
  });

  // header buttons
  newQuizBtn.addEventListener("click", () => returnToLanding());
  resetBtn.addEventListener("click", async () => {
    try { await fetchJsonFirst(routes.reset, { method: "POST" }); } catch {}
    returnToLanding();
  });

  // ---- load next ----
  async function loadNext() {
    resultDiv.innerHTML = "";
    submitBtn.disabled = false;       // Submit is active when awaiting an answer
    nextBtn.disabled = true;          // Next is disabled until feedback shown
    answered = false;

    fetchJsonFirst(routes.next)
      .then(data => {
        if (data.done) {
          quizDone = true;
          qStem.textContent = "All questions mastered!";
          clearOptions();
          setHidden(runCounter, true);

          const pct = (data.first_try_total ? Math.round((100 * (data.first_try_correct || 0)) / data.first_try_total) : 0);
          resultDiv.innerHTML = `
            <div class="summary">
              <div>First-Try Accuracy: <b>${pct}%</b> (${data.first_try_correct || 0} / ${data.first_try_total || 0})</div>
              <div>Total answers submitted: ${data.submissions || 0}</div>
            </div>`;

          // end state: let left button restart; keep right disabled
          submitBtn.textContent = "Start New Quiz";
          submitBtn.disabled = false;
          nextBtn.disabled = true;
          currentQ = null;

          // Enter will call submit (which returns to landing)
          return;
        }

        // normal question
        currentQ = data;
        qStem.textContent = data.stem || "Question";
        renderOptions(data);

        // update running counter (prefer server 'served' if provided)
        runCount = Number.isFinite(data.served) ? data.served : (runCount + 1);
        runCounterNum.textContent = String(runCount);

        // ensure left says "Submit" during an active quiz
        submitBtn.textContent = "Submit";
      })
      .catch(e => {
        alert("Could not load next question");
        console.error(e);
      });
  }

  // ---- submit ----
  submitBtn.addEventListener("click", async () => {
    if (quizDone) { // on final screen, left button restarts
      returnToLanding();
      return;
    }
    if (answered) { // safety: if already answered, ignore submit (Next handles advance)
      return;
    }

    const selected = getSelectedLetters();
    if (!selected.length) {
      alert("Choose an answer first.");
      return;
    }

    try {
      const data = await fetchJsonFirst(routes.answer, {
        method: "POST",
        body: JSON.stringify({ qid: currentQ.qid || currentQ.qID || currentQ.id, selected })
      });

      if (typeof data.first_try_correct === "number") {
        firstTryScore.correct = data.first_try_correct;
        if (typeof data.first_try_total === "number") firstTryScore.total = data.first_try_total;
        updateScoreLine(); // still hidden until the end
      }

      const tag = data.ok
        ? `<span class="ok">Correct!</span>`
        : `<span class="bad">Incorrect.</span> <span class="muted">Correct: ${data.correct.join(", ")}</span>`;

      const rationale = data.rationale ? `<div class="rationale"><b>Rationale:</b> ${escapeHTML(data.rationale)}</div>` : "";
      resultDiv.innerHTML = `<div>${tag}</div>${rationale}`;

      answered = true;

      // after feedback: disable Submit, enable Next
      submitBtn.disabled = true;
      nextBtn.disabled = false;
      nextBtn.focus();
    } catch (e) {
      alert("Could not submit answer");
      console.error(e);
    }
  });

  // ---- next ----
  nextBtn.addEventListener("click", () => {
    if (quizDone) return;
    loadNext();
  });

  // ---- keyboard: Enter submits; after feedback, Enter = Next ----
  document.addEventListener("keydown", (ev) => {
    const key = ev.key;
    if (key === "Enter") {
      if (!landing.classList.contains("hidden")) {
        ev.preventDefault();
        startBtn.click();
        return;
      }
      if (!quiz.classList.contains("hidden")) {
        ev.preventDefault();
        if (!answered && !submitBtn.disabled) submitBtn.click();
        else if (!nextBtn.disabled) nextBtn.click();
      }
    }

    // Quick toggle A–H
    if (/^[a-h]$/i.test(key) && !quiz.classList.contains("hidden")) {
      const letter = key.toUpperCase();
      const input = (lettersToInputs && lettersToInputs[letter]) || null;
      if (input) {
        ev.preventDefault();
        input.checked = !input.checked;
      }
    }
  });

  // ---- count buttons ----
  countBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      countBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const n = Number(btn.dataset.count || "10");
      chosenCount = isNaN(n) ? 10 : n;
    });
  });

  // init
  loadModules();
})();
