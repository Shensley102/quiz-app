(() => {
  const header = document.querySelector(".app-header");
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

  const remainingCounter = document.getElementById("remainingCounter");
  const remainingNum = document.getElementById("remainingNum");

  const review = document.getElementById("review");

  const routes = {
    modules: ["/api/modules", "/modules"],
    start: ["/api/start", "/start"],
    next: ["/api/next", "/next"],
    answer: ["/api/answer", "/answer"],
    reset: ["/api/reset_session", "/reset"],
  };

  // helpers
  function setHidden(el, yes) { el.classList.toggle("hidden", !!yes); }
  function clearOptions() { qOptions.innerHTML = ""; }
  function escapeHTML(s="") {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }
  function headerHeight() { return header ? header.offsetHeight : 0; }
  function scrollToQuestion() {
    const y = qStem.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }
  function setRemaining(n) { remainingNum.textContent = String(Math.max(0, Number(n || 0))); }

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
  }

  function renderReview(items = []) {
    if (!Array.isArray(items) || !items.length) {
      review.innerHTML = `<div class="summary">No review content.</div>`;
      return;
    }

    const parts = [];
    for (const item of items) {
      const correctSet = new Set((item.correct || []).map(x => String(x).toUpperCase()));
      const opts = (item.options || []).map(o => {
        const isCorrect = correctSet.has(String(o.letter).toUpperCase());
        return `
          <div class="rev-opt ${isCorrect ? "correct" : ""}">
            <span class="letter">${escapeHTML(o.letter)}.</span>
            <span class="text">${escapeHTML(o.text || "")}</span>
          </div>
        `;
      }).join("");

      parts.push(`
        <article class="rev-item">
          <div class="rev-title">Question ${item.index}</div>
          <div class="rev-stem">${escapeHTML(item.stem || "")}</div>
          <div class="rev-options">${opts}</div>
          ${item.rationale
            ? `<div class="rev-rat"><b>Rationale:</b> ${escapeHTML(item.rationale)}</div>`
            : ``}
        </article>
      `);
    }

    review.innerHTML = parts.join("");
  }

  function updateScoreLine() { scoreLine.classList.add("hidden"); }

  function returnToLanding() {
    setHidden(quiz, true);
    setHidden(landing, false);
    setHidden(runCounter, true);
    setHidden(remainingCounter, true);
    resultDiv.innerHTML = "";
    qStem.textContent = "Question…";
    clearOptions();
    review.innerHTML = "";
    setHidden(review, true);
    updateScoreLine();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function fetchJsonFirst(paths, opts = {}) {
    let lastError = null;
    for (const p of paths) {
      try {
        const r = await fetch(p, Object.assign(
          { headers: { "Content-Type": "application/json" }, credentials: "same-origin" },
          opts
        ));
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

  // local state
  let chosenCount = "10"; // "10","25","50","100","full"
  let currentQ = null;
  let lettersToInputs = {};
  let answered = false;
  let quizDone = false;
  let firstTryScore = { correct: 0, total: 0 };
  let runCount = 0;

  // load modules
  (async function loadModules() {
    try {
      const items = await fetchJsonFirst(routes.modules);
      moduleSelect.innerHTML =
        `<option value="">Choose a module…</option>` +
        items.map(i => `<option value="${i.id}">${i.id}</option>`).join("");
    } catch {
      moduleSelect.innerHTML = `<option value="">(Could not load modules)</option>`;
    }
  })();

  // start quiz
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

      setHidden(landing, true);
      setHidden(scoreLine, true);
      setHidden(quiz, false);
      setHidden(runCounter, false);
      setHidden(remainingCounter, false);
      setHidden(review, true);
      review.innerHTML = "";

      runCounterNum.textContent = "1";
      setRemaining(data.remaining != null ? data.remaining : firstTryScore.total);

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

  // next question
  async function loadNext() {
    resultDiv.innerHTML = "";
    submitBtn.disabled = false;
    nextBtn.disabled = true;
    answered = false;

    fetchJsonFirst(routes.next)
      .then(data => {
        if (data.done) {
          quizDone = true;

          // Final stats
          const pct = (data.first_try_total
            ? Math.round((100 * (data.first_try_correct || 0)) / data.first_try_total)
            : 0);
          resultDiv.innerHTML = `
            <div class="summary">
              <div>First-Try Accuracy: <b>${pct}%</b> (${data.first_try_correct || 0} / ${data.first_try_total || 0})</div>
              <div>Total answers submitted: ${data.submissions || 0}</div>
            </div>`;

          setHidden(runCounter, true);
          setHidden(remainingCounter, true);

          renderReview(data.review || []);
          setHidden(review, false);

          submitBtn.textContent = "Start New Quiz";
          submitBtn.disabled = false;
          nextBtn.disabled = true;
          currentQ = null;

          review.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        currentQ = data;
        qStem.textContent = data.stem || "Question";
        renderOptions(data);

        runCount = Number.isFinite(data.served) ? data.served : (runCount + 1);
        runCounterNum.textContent = String(runCount);

        if (typeof data.remaining === "number") setRemaining(data.remaining);

        submitBtn.textContent = "Submit";
        const y = qStem.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      })
      .catch(e => {
        alert("Could not load next question");
        console.error(e);
      });
  }

  // submit
  submitBtn.addEventListener("click", async () => {
    if (quizDone) { returnToLanding(); return; }
    if (answered) return;

    const selected = Array.from(qOptions.querySelectorAll("input:checked")).map(i => i.value.toUpperCase());
    if (!selected.length) { alert("Choose an answer first."); return; }

    try {
      const data = await fetchJsonFirst(routes.answer, {
        method: "POST",
        body: JSON.stringify({ qid: currentQ.qid || currentQ.qID || currentQ.id, selected })
      });

      if (typeof data.first_try_correct === "number") {
        firstTryScore.correct = data.first_try_correct;
        if (typeof data.first_try_total === "number") firstTryScore.total = data.first_try_total;
        updateScoreLine();
      }

      if (typeof data.remaining === "number") setRemaining(data.remaining);

      const correctText = (data.correct || []).join(", ");
      const tag = data.ok
        ? `<span class="ok">Correct!</span> <span class="muted">Correct: ${correctText}</span>`
        : `<span class="bad">Incorrect.</span> <span class="muted">Correct: ${correctText}</span>`;
      const rationale = data.rationale
        ? `<div class="rationale"><b>Rationale:</b> ${escapeHTML(data.rationale)}</div>`
        : "";
      resultDiv.innerHTML = `<div>${tag}</div>${rationale}`;

      answered = true;
      submitBtn.disabled = true;
      nextBtn.disabled = false;
      nextBtn.focus({ preventScroll: true });
    } catch (e) {
      alert("Could not submit answer");
      console.error(e);
    }
  });

  // next btn
  nextBtn.addEventListener("click", () => {
    if (quizDone) return;
    loadNext();
  });

  // keyboard shortcuts
  document.addEventListener("keydown", (ev) => {
    const key = ev.key;
    if (key === "Enter") {
      if (!landing.classList.contains("hidden")) {
        ev.preventDefault(); startBtn.click(); return;
      }
      if (!quiz.classList.contains("hidden")) {
        ev.preventDefault();
        if (!answered && !submitBtn.disabled) submitBtn.click();
        else if (!nextBtn.disabled) nextBtn.click();
      }
    }

    if (/^[a-h]$/i.test(key) && !quiz.classList.contains("hidden")) {
      const letter = key.toUpperCase();
      const input = (lettersToInputs && lettersToInputs[letter]) || null;
      if (input) { ev.preventDefault(); input.checked = !input.checked; }
    }
  });

  // length selectors
  countBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      countBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const val = (btn.dataset.count || "10").toLowerCase();
      btn.setAttribute("aria-pressed", "true");
      countBtns.filter(b => b !== btn).forEach(b => b.removeAttribute("aria-pressed"));
      chosenCount = (val === "full") ? "full" : String(Number(val) || 10);
    });
  });

  window.addEventListener("orientationchange", () => {
    setTimeout(() => {
      if (!quiz.classList.contains("hidden")) {
        const y = qStem.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
      }
    }, 350);
  });
})();
