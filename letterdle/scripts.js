// ── Letterdle ───────────────────────────────────────────
// Guess a single letter in 6 tries. The target letter is
// deterministic per calendar day (same for all players).

(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────
  const MAX_GUESSES = 6;
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  // ── Deterministic daily letter ─────────────────────────
  function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32-bit int
    }
    return Math.abs(hash);
  }

  const todayKey = getTodayDateString();
  const TARGET = ALPHABET[hashCode(todayKey) % 26];

  // ── State ──────────────────────────────────────────────
  const STORAGE_KEY = "letterdle-state";
  let guesses = [];     // array of letters guessed
  let currentInput = "";
  let gameOver = false;

  // ── DOM refs ───────────────────────────────────────────
  const boardEl = document.getElementById("board");
  const keyboardEl = document.getElementById("keyboard");
  const messageEl = document.getElementById("message");
  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");
  const shareBtn = document.getElementById("share-btn");

  // ── Build board (6 single-tile rows) ───────────────────
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < MAX_GUESSES; i++) {
      const tile = document.createElement("div");
      tile.classList.add("tile");
      tile.id = `tile-${i}`;
      boardEl.appendChild(tile);
    }
  }

  // ── Build on-screen keyboard ───────────────────────────
  const KB_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
  ];

  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    KB_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.classList.add("keyboard-row");
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.classList.add("key");
        btn.textContent = key;
        btn.dataset.key = key;
        if (key === "ENTER" || key === "⌫") btn.classList.add("wide");
        btn.addEventListener("click", () => handleKey(key));
        rowEl.appendChild(btn);
      });
      keyboardEl.appendChild(rowEl);
    });
  }

  // ── Evaluate guess ─────────────────────────────────────
  // Since we're guessing a single letter:
  //   correct  → exact match   (green)
  //   absent   → wrong letter  (gray)
  // "present" (yellow) isn't meaningful for a single-letter
  // game, but we keep the data-state vocabulary consistent.
  function evaluate(guess) {
    return guess === TARGET ? "correct" : "absent";
  }

  // ── Reveal a tile with flip animation ──────────────────
  function revealTile(index, letter, state, delay) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const tile = document.getElementById(`tile-${index}`);
        tile.classList.add("flip");
        // halfway through the flip, apply colour
        setTimeout(() => {
          tile.dataset.state = state;
          tile.textContent = letter;
        }, 250);
        setTimeout(resolve, 500);
      }, delay);
    });
  }

  // ── Update keyboard key colours ────────────────────────
  function updateKeyboard(letter, state) {
    const btn = keyboardEl.querySelector(`[data-key="${letter}"]`);
    if (!btn) return;
    const priority = { correct: 3, present: 2, absent: 1 };
    const current = btn.dataset.state;
    if (!current || priority[state] > (priority[current] || 0)) {
      btn.dataset.state = state;
    }
  }

  // ── Show a temporary toast message ─────────────────────
  let messageTimer;
  function showMessage(text, persist = false) {
    messageEl.textContent = text;
    messageEl.classList.add("show");
    clearTimeout(messageTimer);
    if (!persist) {
      messageTimer = setTimeout(() => messageEl.classList.remove("show"), 2000);
    }
  }

  // ── Show end-game modal ────────────────────────────────
  function showModal(won) {
    const attempts = guesses.length;
    modalTitle.textContent = won ? "🎉 You got it!" : "😔 Better luck tomorrow";
    modalBody.textContent = won
      ? `The letter was ${TARGET}.\nYou guessed it in ${attempts}/${MAX_GUESSES}.`
      : `The letter was ${TARGET}.`;
    shareBtn.classList.remove("hidden");
    modalOverlay.classList.remove("hidden");
  }

  modalClose.addEventListener("click", () =>
    modalOverlay.classList.add("hidden")
  );
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.add("hidden");
  });

  // ── Share results ──────────────────────────────────────
  shareBtn.addEventListener("click", () => {
    const won = guesses.includes(TARGET);
    const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const grid = guesses
      .map((g) => (g === TARGET ? "🟩" : "⬛"))
      .join("\n");
    const text = `Letterdle ${todayKey} ${score}\n\n${grid}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        showMessage("Copied to clipboard!");
      });
    }
  });

  // ── Submit guess ───────────────────────────────────────
  async function submitGuess() {
    if (gameOver || !currentInput) return;

    const guess = currentInput;
    const state = evaluate(guess);
    const row = guesses.length;

    guesses.push(guess);
    currentInput = "";

    await revealTile(row, guess, state, 0);
    updateKeyboard(guess, state);

    if (state === "correct") {
      gameOver = true;
      // winning bounce
      setTimeout(() => {
        document.getElementById(`tile-${row}`).classList.add("bounce");
      }, 100);
      showMessage("Magnificent!", true);
      setTimeout(() => showModal(true), 1200);
    } else if (guesses.length >= MAX_GUESSES) {
      gameOver = true;
      showMessage(`The letter was ${TARGET}`, true);
      setTimeout(() => showModal(false), 1200);
    }

    saveState();
  }

  // ── Handle key input ───────────────────────────────────
  function handleKey(key) {
    if (gameOver) return;

    if (key === "⌫" || key === "BACKSPACE") {
      if (currentInput) {
        const tile = document.getElementById(`tile-${guesses.length}`);
        tile.textContent = "";
        tile.removeAttribute("data-state");
        tile.dataset.state = "";
        delete tile.dataset.state;
        currentInput = "";
      }
      return;
    }

    if (key === "ENTER") {
      if (!currentInput) {
        showMessage("Type a letter first");
        return;
      }
      submitGuess();
      return;
    }

    // Only accept single A-Z
    const letter = key.toUpperCase();
    if (letter.length !== 1 || !ALPHABET.includes(letter)) return;
    if (currentInput) return; // only one letter per row

    currentInput = letter;
    const tile = document.getElementById(`tile-${guesses.length}`);
    tile.textContent = letter;
    tile.dataset.state = "tbd";
    tile.classList.add("pop");
    setTimeout(() => tile.classList.remove("pop"), 100);
  }

  // ── Physical keyboard support ──────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toUpperCase();
    if (key === "BACKSPACE" || key === "ENTER") {
      handleKey(key === "BACKSPACE" ? "⌫" : "ENTER");
    } else if (/^[A-Z]$/.test(key)) {
      handleKey(key);
    }
  });

  // ── Persistence (localStorage) ─────────────────────────
  function saveState() {
    const state = { day: todayKey, guesses, gameOver };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.day !== todayKey) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      // Replay saved guesses instantly (no animation)
      state.guesses.forEach((letter, i) => {
        const st = evaluate(letter);
        const tile = document.getElementById(`tile-${i}`);
        tile.textContent = letter;
        tile.dataset.state = st;
        updateKeyboard(letter, st);
      });
      guesses = state.guesses;
      gameOver = state.gameOver;

      if (gameOver) {
        const won = guesses.includes(TARGET);
        showMessage(
          won ? "Come back tomorrow!" : `The letter was ${TARGET}`,
          true
        );
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ── Init ───────────────────────────────────────────────
  buildBoard();
  buildKeyboard();
  loadState();
})();
