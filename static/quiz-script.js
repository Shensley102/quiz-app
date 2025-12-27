/* eslint-disable no-console */

/**
 * quiz-script.js
 * Main browser-side quiz engine:
 * - loads module JSON by name/path registry (or uses window.preloadedQuizData)
 * - renders MCQ quizzes
 * - saves/resumes progress
 * - tracks NCLEX performance stats for weighted comprehensive runs
 */

/* ----------------------------
 * Constants / LocalStorage Keys
 * ---------------------------- */

const STORAGE_KEYS = {
  quizState: "quizState",
  // New key for NCLEX tracking:
  nclexStats: "nclexPerformanceStats",
  // Backward-compat migration key:
  legacyHesiStats: "hesiPerformanceStats",
};

/* ----------------------------
 * Module Registry
 * ---------------------------- */

const moduleRegistry = {
  // NCLEX Comprehensive Master
  NCLEX_Comprehensive_Master_Categorized: "/modules/NCLEX/NCLEX_Comprehensive_Master_Categorized.json",

  // (Other module names can be registered here if you want quiz.html to support dropdown selection)
  // Example:
  // "NCLEX_Lab_Values": "/modules/Lab_Values/NCLEX_Lab_Values.json",
};

/* ----------------------------
 * Helpers
 * ---------------------------- */

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Unable to save to localStorage:", e);
  }
}

function loadFromStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function migrateLegacyStatsIfNeeded() {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.nclexStats);
    if (existing) return;
    const legacy = localStorage.getItem(STORAGE_KEYS.legacyHesiStats);
    if (!legacy) return;
    localStorage.setItem(STORAGE_KEYS.nclexStats, legacy);
  } catch (e) {
    // ignore
  }
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeQuestion(q) {
  // Accept question formats:
  // { stem, options, correct, type } OR { question, options, correct } etc.
  const stem = q.stem ?? q.question ?? q.prompt ?? "";
  const options = q.options ?? q.choices ?? [];
  const correct = q.correct ?? q.answer ?? q.correctAnswer ?? null;
  const type = q.type ?? (Array.isArray(correct) ? "multi" : "single");

  // Keep NCLEX category tag if present (for stats)
  const nclexCategory = q.nclex_category ?? q.nclexCategory ?? q.category ?? null;

  return {
    ...q,
    stem,
    options,
    correct,
    type,
    nclex_category: nclexCategory,
  };
}

function isMultiSelect(question) {
  return question.type === "multi" || Array.isArray(question.correct);
}

function normalizeQuestions(questions) {
  return (questions || []).map(normalizeQuestion);
}

/* ----------------------------
 * Stats Tracking (NCLEX)
 * ---------------------------- */

function loadNclexStats() {
  migrateLegacyStatsIfNeeded();
  const stats = loadFromStorage(STORAGE_KEYS.nclexStats, {});
  return stats && typeof stats === "object" ? stats : {};
}

function saveNclexStats(stats) {
  saveToStorage(STORAGE_KEYS.nclexStats, stats);
}

function ensureStatsShape(stats, categories) {
  const s = { ...(stats || {}) };
  categories.forEach((c) => {
    if (!s[c]) s[c] = { correct: 0, total: 0 };
    if (typeof s[c].correct !== "number") s[c].correct = 0;
    if (typeof s[c].total !== "number") s[c].total = 0;
  });
  return s;
}

function updateNclexStatsFromResult(questions, userAnswers) {
  // Only update if questions have a nclex_category field
  const categories = Array.from(
    new Set(
      questions
        .map((q) => q.nclex_category)
        .filter((x) => typeof x === "string" && x.length)
    )
  );

  if (!categories.length) return;

  let stats = ensureStatsShape(loadNclexStats(), categories);

  questions.forEach((q, idx) => {
    const cat = q.nclex_category;
    if (!cat) return;

    const ua = userAnswers[idx];
    const isCorrect = checkCorrect(q, ua);

    stats[cat].total += 1;
    if (isCorrect) stats[cat].correct += 1;
  });

  saveNclexStats(stats);
}

/* ----------------------------
 * Correctness Checking
 * ---------------------------- */

function normalizeAnswer(val) {
  if (val == null) return null;
  if (Array.isArray(val)) return val.slice().sort().join("|");
  return String(val);
}

function checkCorrect(question, userAnswer) {
  const correct = question.correct;

  if (Array.isArray(correct)) {
    // multi-select
    const ua = Array.isArray(userAnswer) ? userAnswer : [];
    return normalizeAnswer(ua) === normalizeAnswer(correct);
  }

  return normalizeAnswer(userAnswer) === normalizeAnswer(correct);
}

/* ----------------------------
 * Quiz State
 * ---------------------------- */

function createInitialState(quizData, quizLength = null) {
  const allQuestions = normalizeQuestions(quizData.questions || []);
  const moduleName = quizData.moduleName || "Quiz";

  let questions = allQuestions;
  if (quizLength && quizLength > 0 && quizLength < allQuestions.length) {
    questions = shuffleArray(allQuestions).slice(0, quizLength);
  }

  // Shuffle options for each question
  questions = questions.map((q) => {
    if (!Array.isArray(q.options)) return q;
    const shuffledOptions = shuffleArray(q.options);
    // If correct is index-based this would break, but your content uses literal value matching.
    return { ...q, options: shuffledOptions };
  });

  return {
    moduleName,
    questions,
    currentIndex: 0,
    userAnswers: {},
    startedAt: Date.now(),
    completed: false,
    // special flags for NCLEX weighted runs
    isWeightedComprehensive: !!quizData.isWeightedComprehensive,
  };
}

function saveQuizState(state) {
  saveToStorage(STORAGE_KEYS.quizState, state);
}

function loadQuizState() {
  return loadFromStorage(STORAGE_KEYS.quizState, null);
}

function clearQuizState() {
  try {
    localStorage.removeItem(STORAGE_KEYS.quizState);
  } catch (e) {}
}

/* ----------------------------
 * DOM / Rendering
 * ---------------------------- */

function $(sel) {
  return document.querySelector(sel);
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function renderQuestion(state) {
  const q = state.questions[state.currentIndex];
  if (!q) return;

  setText($("#moduleName"), state.moduleName);
  setText($("#progressText"), `Question ${state.currentIndex + 1} of ${state.questions.length}`);

  const stemEl = $("#questionStem");
  stemEl.innerHTML = "";
  stemEl.appendChild(document.createTextNode(q.stem));

  const optionsEl = $("#options");
  optionsEl.innerHTML = "";

  const multi = isMultiSelect(q);
  const currentAnswer = state.userAnswers[state.currentIndex];

  q.options.forEach((opt) => {
    const label = document.createElement("label");
    label.className = "option";

    const input = document.createElement("input");
    input.type = multi ? "checkbox" : "radio";
    input.name = "option";
    input.value = opt;

    if (multi) {
      const arr = Array.isArray(currentAnswer) ? currentAnswer : [];
      input.checked = arr.includes(opt);
    } else {
      input.checked = currentAnswer === opt;
    }

    input.addEventListener("change", () => {
      handleOptionChange(state, q, opt, multi);
    });

    const span = document.createElement("span");
    span.textContent = opt;

    label.appendChild(input);
    label.appendChild(span);
    optionsEl.appendChild(label);
  });

  // update buttons
  $("#prevBtn").disabled = state.currentIndex === 0;
  $("#nextBtn").textContent = state.currentIndex === state.questions.length - 1 ? "Finish" : "Next";
}

function handleOptionChange(state, question, opt, multi) {
  const idx = state.currentIndex;

  if (multi) {
    const cur = Array.isArray(state.userAnswers[idx]) ? state.userAnswers[idx].slice() : [];
    const exists = cur.includes(opt);
    const next = exists ? cur.filter((x) => x !== opt) : [...cur, opt];
    state.userAnswers[idx] = next;
  } else {
    state.userAnswers[idx] = opt;
  }

  saveQuizState(state);
}

function renderResults(state) {
  const resultsEl = $("#results");
  resultsEl.innerHTML = "";

  let correctCount = 0;

  state.questions.forEach((q, idx) => {
    const userAnswer = state.userAnswers[idx];
    const ok = checkCorrect(q, userAnswer);
    if (ok) correctCount += 1;

    const item = document.createElement("div");
    item.className = "result-item";

    const title = document.createElement("div");
    title.className = "result-stem";
    title.textContent = `${idx + 1}. ${q.stem}`;

    const ua = document.createElement("div");
    ua.className = "result-user";
    ua.textContent = `Your answer: ${Array.isArray(userAnswer) ? userAnswer.join(", ") : (userAnswer ?? "—")}`;

    const ca = document.createElement("div");
    ca.className = "result-correct";
    ca.textContent = `Correct: ${Array.isArray(q.correct) ? q.correct.join(", ") : q.correct}`;

    const badge = document.createElement("div");
    badge.className = `result-badge ${ok ? "ok" : "bad"}`;
    badge.textContent = ok ? "Correct" : "Incorrect";

    item.appendChild(title);
    item.appendChild(ua);
    item.appendChild(ca);
    item.appendChild(badge);

    resultsEl.appendChild(item);
  });

  setText($("#scoreText"), `Score: ${correctCount} / ${state.questions.length}`);

  // Update NCLEX stats if this is a weighted comprehensive run (or if questions have categories)
  updateNclexStatsFromResult(state.questions, state.userAnswers);

  $("#quizArea").style.display = "none";
  $("#resultsArea").style.display = "block";
}

function showQuizArea() {
  $("#quizArea").style.display = "block";
  $("#resultsArea").style.display = "none";
}

/* ----------------------------
 * Flow Controls
 * ---------------------------- */

function goPrev(state) {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    saveQuizState(state);
    renderQuestion(state);
  }
}

function goNext(state) {
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex += 1;
    saveQuizState(state);
    renderQuestion(state);
    return;
  }

  // finish
  state.completed = true;
  saveQuizState(state);
  renderResults(state);
}

function restartQuiz() {
  clearQuizState();
  window.location.reload();
}

/* ----------------------------
 * Bootstrapping
 * ---------------------------- */

async function fetchModuleJsonByName(moduleName) {
  const path = moduleRegistry[moduleName];
  if (!path) throw new Error(`Module not registered: ${moduleName}`);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch module: ${res.status}`);
  return await res.json();
}

function getSelectedQuizLength() {
  const lenButtons = document.querySelectorAll("[data-quiz-length]");
  let selected = null;
  lenButtons.forEach((b) => {
    if (b.classList.contains("selected")) {
      selected = parseInt(b.getAttribute("data-quiz-length"), 10);
    }
  });
  return selected;
}

function attachLengthButtonHandlers() {
  const lenButtons = document.querySelectorAll("[data-quiz-length]");
  lenButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      lenButtons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

function attachMainHandlers(state) {
  $("#prevBtn")?.addEventListener("click", () => goPrev(state));
  $("#nextBtn")?.addEventListener("click", () => goNext(state));
  $("#restartBtn")?.addEventListener("click", restartQuiz);
}

function maybeShowResumeButton() {
  const existing = loadQuizState();
  const resumeBtn = $("#resumeBtn");
  if (!resumeBtn) return;

  if (existing && !existing.completed) {
    resumeBtn.style.display = "inline-flex";
  } else {
    resumeBtn.style.display = "none";
  }
}

async function startNewQuizFromModule(moduleName) {
  const moduleJson = await fetchModuleJsonByName(moduleName);
  const questions = moduleJson.questions || moduleJson;
  const quizData = {
    moduleName: moduleJson.title || moduleName,
    questions,
  };
  const quizLength = getSelectedQuizLength();
  const state = createInitialState(quizData, quizLength);
  saveQuizState(state);
  return state;
}

function startNewQuizFromPreloaded(preloaded) {
  const quizLength = getSelectedQuizLength();
  const state = createInitialState(preloaded, quizLength);
  // Keep special flags
  if (preloaded.isWeightedComprehensive) state.isWeightedComprehensive = true;
  saveQuizState(state);
  return state;
}

function resumeQuiz() {
  const existing = loadQuizState();
  if (!existing) return null;
  return existing;
}

async function init() {
  attachLengthButtonHandlers();
  maybeShowResumeButton();

  const startBtn = $("#startBtn");
  const resumeBtn = $("#resumeBtn");

  let state = null;

  async function startHandler() {
    const moduleSelect = $("#moduleSelect");
    const moduleName = moduleSelect ? moduleSelect.value : null;

    // Prefer preloaded if present (server-rendered)
    if (window.preloadedQuizData) {
      state = startNewQuizFromPreloaded(window.preloadedQuizData);
    } else if (moduleName) {
      state = await startNewQuizFromModule(moduleName);
    } else {
      alert("No module selected.");
      return;
    }

    showQuizArea();
    attachMainHandlers(state);
    renderQuestion(state);
  }

  function resumeHandler() {
    const existing = resumeQuiz();
    if (!existing) return;

    state = existing;
    showQuizArea();
    attachMainHandlers(state);

    if (state.completed) {
      renderResults(state);
    } else {
      renderQuestion(state);
    }
  }

  startBtn?.addEventListener("click", () => startHandler());
  resumeBtn?.addEventListener("click", () => resumeHandler());

  // Auto-start if configured
  const autoStart = document.body.getAttribute("data-auto-start");
  if (autoStart === "true") {
    await startHandler();
  }
}

document.addEventListener("DOMContentLoaded", init);
