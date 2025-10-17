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

  let chosenCount = 10;         // user pick (10/25/50/100/ALL)
  let currentQ = null;          // { qid, is_multi, options... }
  let lettersToInputs = {};     // map letter -> input element
  let firstTryScore = { correct: 0, total: 0 };
  let answered = false;         // did we submit this card

  // --- helpers --------------------------------------------------------
  function api(path, opts = {}) {
    return fetch(path, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, opts));
  }
  function setHidden(el, yes) { if (yes) el.classList.add("hidden"); else el.classList.remove("hidden"); }
  function updateScoreLine() {
    scoreLine.textContent = `First-Try Correct: ${firstTryScore.correct} / ${firstTryScore.total}`;
  }
  function clearOptions() {
    qOptions.innerHTML = "";
    lettersToInputs = {};
  }
  function renderOptions(options, is_multi) {
    clearOptions();
    options.forEach((opt, idx) => {
      const id = `opt_${idx}`;
      const wrapper = document.createElement("label");
      wrapper.className = "option";

      const input = document.createElement("input");
      input.type = is_multi ? "checkbox" : "radio";
      input.name = "qopts";
      input.value = opt.letter;
      input.id = id;

      const dot = document.createElement("span");
      dot.className = "dot";

      const text = document.createElement("span");
      text.className = "txt";
      text.textContent = `${opt.letter}. ${opt.text}`;

      wrapper.appendChild(input);
      wrapper.appendChild(dot);
      wrapper.appendChild(text);
      qOptions.appendChild(wrapper);

      lettersToInputs[opt.letter.toUpperCase()] = input;
    });
  }
  function getSelectedLetters() {
    return Array.from(qOptions.querySelectorAll("input"))
      .filter(i => i.checked)
      .map(i => i.value.toUpperCase());
  }

  // --- Load modules into dropdown ------------------------------------
  function loadModules() {
    api("/api/modules").then(r => r.json()).then(items => {
      moduleSelect.innerHTML = "";
      items.forEach(it => {
        const o = document.createElement("option");
        o.value = it.id;
        o.textContent = it.id;
        moduleSelect.appendChild(o);
      });
      // If any module exists, select first
      if (items.length) moduleSelect.value = items[0].id;
    }).catch(() => {
      alert("Could not load modules");
    });
  }

  // --- Start quiz -----------------------------------------------------
  countBtns.forEach(b => {
    b.addEventListener("click", () => {
      countBtns.forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      chosenCount = b.dataset.count === "ALL" ? 999999 : parseInt(b.dataset.count, 10);
    });
  });
  // default pick 10
  countBtns[0].classList.add("active");

  startBtn.addEventListener("click", () => {
    const mod = moduleSelect.value;
    api("/api/start", {
      method: "POST",
      body: JSON.stringify({ module: mod, count: chosenCount })
    }).then(r => r.json()).then(data => {
      if (!data.ok) { alert(data.error || "Could not start quiz"); return; }
      // switch to quiz page
      firstTryScore = { correct: 0, total: data.count || 0 };
      updateScoreLine();
      setHidden(landing, true);
      setHidden(quiz, false);
      loadNext();
    }).catch(() => alert("Could not start quiz"));
  });

  newQuizBtn.addEventListener("click", () => {
    // soft reset and go back to landing
    api("/api/reset", { method: "POST" }).finally(() => {
      setHidden(quiz, true);
      setHidden(landing, false);
      resultDiv.innerHTML = "";
      qStem.textContent = "Question…";
      clearOptions();
    });
  });

  // --- Next & Submit --------------------------------------------------
  function loadNext() {
    resultDiv.innerHTML = "";
    nextBtn.disabled = true;
    submitBtn.disabled = false;
    answered = false;

    api("/api/next").then(r => r.json()).then(data => {
      if (data.done) {
        // Finished (all mastered). Show summary + New Quiz
        qStem.textContent = "All questions mastered!";
        clearOptions();
        resultDiv.innerHTML = `
          <div class="summary">
            <div>First-Try Score: <b>${data.first_try_correct} / ${data.first_try_total}</b></div>
            <div>Total cards served (with repeats): ${data.served}</div>
          </div>
        `;
        submitBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }
      currentQ = data;
      qStem.textContent = data.stem || "Question";
      renderOptions(data.options || [], !!data.is_multi);
    }).catch(() => alert("Could not load next question"));
  }

  submitBtn.addEventListener("click", () => {
    if (!currentQ) return;
    const selected = getSelectedLetters();
    if (!selected.length) { alert("Choose at least one answer."); return; }

    submitBtn.disabled = true;

    api("/api/answer", {
      method: "POST",
      body: JSON.stringify({ qid: currentQ.qid, selected })
    }).then(r => r.json()).then(data => {
      answered = true;
      // Update first-try score if backend says it changed (we re-pull on /next)
      // Instead, we ask for a fresh /next and the server keeps the score internally.
      // Show result with rationale:
      const tag = data.ok ? `<span class="ok">Correct!</span>` :
        `<span class="bad">Incorrect.</span> <span class="muted">Correct: ${data.correct.join(", ")}</span>`;
      const rationale = (data.rationale && data.rationale.trim().length)
        ? `<div class="rationale"><b>Rationale:</b> ${escapeHTML(data.rationale)}</div>`
        : "";
      resultDiv.innerHTML = `${tag}${rationale}`;
      // Enable Next
      nextBtn.disabled = false;
      // Also refresh header score by asking server for a dummy next peek if it was first try correct.
      // Simpler: call /api/next only when Next is pressed; header will update then.
    }).catch(() => {
      submitBtn.disabled = false;
      alert("There was an error submitting your answer. Please try again.");
    });
  });

  nextBtn.addEventListener("click", () => {
    // Ask server for next; server already tracks first-try stats
    // To refresh header, we need the latest score. Quick trick:
    // Call /api/next, then ask /api/next again if we just peeked? Instead,
    // update on each load by requesting /api/next and let server include
    // first-try stats with the done payload only; so we’ll also poll a light endpoint,
    // or we can recompute by asking /api/start return count and just leave numerator
    // for done. Simpler UX: leave the header numerator frozen; it only updates at finish.
    loadNext();
    // Header denominator stays fixed; numerator updates only at finish (clean & simple).
  });

  // --- Reset with confirm --------------------------------------------
  resetBtn.addEventListener("click", () => dlg.showModal());
  yesReset.addEventListener("click", () => {
    api("/api/reset", { method: "POST" }).finally(() => {
      dlg.close();
      setHidden(quiz, true);
      setHidden(landing, false);
      resultDiv.innerHTML = "";
      qStem.textContent = "Question…";
      clearOptions();
    });
  });
  noReset.addEventListener("click", () => dlg.close());

  // --- Keyboard controls ----------------------------------------------
  document.addEventListener("keydown", (ev) => {
    if (setForLanding()) return; // don't handle letters on landing

    const key = ev.key.toUpperCase();
    if (key >= "A" && key <= "H") {
      const input = lettersToInputs[key];
      if (input) {
        ev.preventDefault();
        // Toggle behavior for radio & checkbox
        if (input.type === "radio") {
          // Radio can be un-checked by pressing the same letter again
          if (input.checked) {
            input.checked = false;
          } else {
            // clear others then check
            qOptions.querySelectorAll("input[type=radio]").forEach(r => r.checked = false);
            input.checked = true;
          }
        } else {
          input.checked = !input.checked; // checkbox toggle
        }
      }
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (!answered) {
        submitBtn.click();
      } else {
        nextBtn.click();
      }
    }
  });

  function setForLanding() {
    return !quiz || quiz.classList.contains("hidden");
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  // boot
  loadModules();
})();
