// static/script.js
(() => {
  const landing = document.getElementById("landing");
  const quiz = document.getElementById("quiz");
  const moduleSelect = document.getElementById("moduleSelect");
  const startBtn = document.getElementById("startBtn");
  const newQuizBtn = document.getElementById("newQuizBtn");
  const countBtns = Array.from(document.querySelectorAll(".count"));
  const qStem = document.getElementById("qStem");
  const qOptions = document.getElementById("qOptions");
  const submitBtn = document.getElementById("submitBtn");
  const nextBtn = document.getElementById("nextBtn");
  const resultDiv = document.getElementById("result");
  const scoreLine = document.getElementById("scoreLine");
  const resetBtn = document.getElementById("resetBtn");
  const dlg = document.getElementById("confirmReset");
  const yesReset = document.getElementById("confirmResetYes");
  const noReset = document.getElementById("confirmResetNo");

  let chosenCount = 10; // question count
  let currentQ = null;
  let lettersToInputs = {};
  let answered = false;
  let quizDone = false;           // ⟵ NEW: track end-of-quiz state
  let firstTryScore = { correct: 0, total: 0 };

  // -------------------- API helper --------------------
  function api(path, opts = {}) {
    return fetch(path, Object.assign({
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin", // critical for Flask session
    }, opts));
  }

  // -------------------- UI helpers --------------------
  function setHidden(el, yes) {
    if (yes) el.classList.add("hidden");
    else el.classList.remove("hidden");
  }

  function clearOptions() {
    qOptions.innerHTML = "";
    lettersToInputs = {};
  }

  function renderOptions(options, is_multi) {
    clearOptions();
    options.forEach((opt, idx) => {
      const label = document.createElement("label");
      label.className = "option";

      const input = document.createElement("input");
      input.type = is_multi ? "checkbox" : "radio";
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
    return Array.from(qOptions.querySelectorAll("input:checked")).map(i => i.value.toUpperCase());
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
    submitBtn.textContent = "Submit"; // restore default label
  }

  // -------------------- Load module list (now shows counts) --------------------
  function loadModules() {
    api("/api/modules")
      .then(r => r.json())
      .then(items => {
        moduleSelect.innerHTML = "";
        if (!Array.isArray(items) || !items.length) {
          moduleSelect.innerHTML = `<option value="">No modules found</option>`;
          return;
        }
        items.forEach(it => {
          const o = document.createElement("option");
          o.value = it.id;
          // show count if provided by API
          o.textContent = it.count != null ? `${it.id} (${it.count})` : it.id;
          moduleSelect.appendChild(o);
        });
        moduleSelect.value = items[0].id;
      })
      .catch(() => alert("Could not load modules"));
  }

  // -------------------- Setup count buttons --------------------
  countBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      countBtns.forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      chosenCount = btn.dataset.count === "ALL" ? 999999 : parseInt(btn.dataset.count, 10);
    });
  });
  countBtns[0].classList.add("active");

  // -------------------- Start Quiz --------------------
  startBtn.addEventListener("click", () => {
    const mod = moduleSelect.value;
    if (!mod) return alert("Select a module first");

    api("/api/start", {
      method: "POST",
      body: JSON.stringify({ module: mod, count: chosenCount }),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          alert(data.error || "Could not start quiz");
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

  // -------------------- Load Next Question --------------------
  function loadNext() {
    resultDiv.innerHTML = "";
    submitBtn.disabled = false;
    nextBtn.disabled = true;
    answered = false;

    api("/api/next")
      .then(r => r.json())
      .then(data => {
        if (data.done) {
          // Show summary and turn Submit into "Start New Quiz"
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
        renderOptions(data.options || [], !!data.is_multi);
      })
      .catch(() => alert("Could not load next question"));
  }

  // -------------------- Submit Answer (updates score + supports end) --------------------
  submitBtn.addEventListener("click", () => {
    // If quiz is done, treat Submit as "Start New Quiz"
    if (quizDone) {
      api("/api/reset_session", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      }).finally(returnToLanding);
      return;
    }

    if (!currentQ) return;
    const selected = getSelectedLetters();
    if (!selected.length) return alert("Select at least one answer.");

    submitBtn.disabled = true;

    api("/api/answer", {
      method: "POST",
      body: JSON.stringify({ qid: currentQ.qid, selected }),
    })
      .then(r => r.json())
      .then(data => {
        answered = true;

        // update first-try score from server if provided
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

  // -------------------- New Quiz & Reset --------------------
  newQuizBtn.addEventListener("click", () => {
    api("/api/reset_session", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }).finally(returnToLanding);
  });

  resetBtn.addEventListener("click", () => dlg.showModal());

  yesReset.addEventListener("click", () => {
    dlg.close();
    api("/api/reset_session", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }).then(returnToLanding);
  });

  noReset.addEventListener("click", () => dlg.close());

  // -------------------- Keyboard Shortcuts --------------------
  document.addEventListener("keydown", ev => {
    if (quiz.classList.contains("hidden")) return;

    const key = ev.key.toUpperCase();
    if (key >= "A" && key <= "H" && lettersToInputs[key]) {
      ev.preventDefault();
      const input = lettersToInputs[key];
      if (input.type === "radio") {
        if (input.checked) input.checked = false;
        else {
          qOptions.querySelectorAll("input[type=radio]").forEach(r => (r.checked = false));
          input.checked = true;
        }
      } else input.checked = !input.checked;
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (quizDone) {
        submitBtn.click(); // Start New Quiz
      } else if (!answered) {
        submitBtn.click();
      } else {
        nextBtn.click();
      }
    }
  });

  // -------------------- Initialize --------------------
  loadModules();
})();
