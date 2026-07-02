import { CubeState, parseMove, randomScramble, inverseMove } from "./cube.js";
import { CubeRenderer } from "./renderer.js";
import { CubeAudio } from "./audio.js";
import { solveFromHistory } from "./solver.js";

const state = new CubeState();
const audio = new CubeAudio();

const canvas = document.getElementById("cube-canvas");
const loading = document.getElementById("loading");
const moveCountEl = document.getElementById("move-count");
const timerEl = document.getElementById("timer");

const btnScramble = document.getElementById("btn-scramble");
const btnSolve = document.getElementById("btn-solve");
const btnReset = document.getElementById("btn-reset");
const btnUndo = document.getElementById("btn-undo");
const btnMute = document.getElementById("btn-mute");

let sessionMoves = 0;
let timerStart = null;
let timerInterval = null;
let busy = false;

const renderer = new CubeRenderer(canvas, state);

loading.classList.add("hidden");

function setBusy(on) {
  busy = on;
  btnScramble.disabled = on;
  btnSolve.disabled = on;
  btnReset.disabled = on;
  btnUndo.disabled = on;
}

function startTimer() {
  if (timerStart) return;
  timerStart = Date.now();
  timerInterval = setInterval(updateTimer, 200);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  stopTimer();
  timerStart = null;
  timerEl.textContent = "0:00";
}

function updateTimer() {
  if (!timerStart) return;
  const sec = Math.floor((Date.now() - timerStart) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

function updateMoveCount() {
  moveCountEl.textContent = String(sessionMoves);
}

async function performMove(move, { record = true, skipSession = false } = {}) {
  if (busy) return;
  const parsed = parseMove(move);
  if (!parsed) return;

  setBusy(true);
  if (!skipSession && record && state.moveHistory.length === 0 && !state.isSolved()) {
    startTimer();
  }

  await renderer.animateMove(move, { sound: audio });

  if (record) {
    state.moveHistory.push(move);
    if (!skipSession) {
      sessionMoves++;
      updateMoveCount();
      startTimer();
    }
  }

  if (state.isSolved()) {
    stopTimer();
    audio.playSolved();
  }

  setBusy(false);
}

async function runAlgorithm(moves, { record = true, scramble = false } = {}) {
  if (busy) return;
  setBusy(true);
  if (scramble) audio.playShuffle();

  for (const move of moves) {
    await renderer.animateMove(move, { sound: audio });
    if (record) state.moveHistory.push(move);
    if (record && !scramble) {
      sessionMoves++;
      updateMoveCount();
      startTimer();
    }
  }

  if (state.isSolved()) {
    stopTimer();
    audio.playSolved();
  }

  setBusy(false);
}

async function scramble() {
  if (busy) return;
  const moves = randomScramble(25);
  sessionMoves = 0;
  updateMoveCount();
  resetTimer();
  state.moveHistory = [];
  await runAlgorithm(moves, { record: true, scramble: true });
  startTimer();
}

async function solve() {
  if (busy || state.isSolved()) return;
  const solution = solveFromHistory(state.moveHistory);
  state.moveHistory = [];
  await runAlgorithm(solution, { record: false });
}

async function reset() {
  if (busy) return;
  setBusy(true);
  state.reset();
  renderer.rebuild();
  sessionMoves = 0;
  updateMoveCount();
  resetTimer();
  setBusy(false);
}

async function undo() {
  if (busy || !state.moveHistory.length) return;
  const inv = inverseMove(state.moveHistory.pop());
  sessionMoves = Math.max(0, sessionMoves - 1);
  updateMoveCount();
  await performMove(inv, { record: false });
}

renderer.onFaceDrag = (move) => {
  performMove(move);
};

btnScramble.addEventListener("click", scramble);
btnSolve.addEventListener("click", solve);
btnReset.addEventListener("click", reset);
btnUndo.addEventListener("click", undo);

btnMute.addEventListener("click", () => {
  const next = !audio.enabled;
  audio.setEnabled(next);
  btnMute.textContent = next ? "Sound on" : "Sound off";
  btnMute.setAttribute("aria-pressed", String(!next));
});

const keyMap = {
  u: "U", d: "D", l: "L", r: "R", f: "F", b: "B",
};

let pendingFace = null;
let pendingTimer = null;

// A bare face key is held briefly so a following "2" can combine into a double
// turn (e.g. R then 2 -> R2). If nothing follows, the plain face turn fires.
function flushPendingFace() {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  if (pendingFace) {
    const face = pendingFace;
    pendingFace = null;
    performMove(face);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.code === "Space") {
    e.preventDefault();
    flushPendingFace();
    scramble();
    return;
  }

  const key = e.key.toLowerCase();

  if (key === "2" && pendingFace) {
    e.preventDefault();
    const face = pendingFace;
    pendingFace = null;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    performMove(`${face}2`);
    return;
  }

  if (!(key in keyMap)) {
    flushPendingFace();
    return;
  }
  e.preventDefault();

  // A new face key supersedes any pending one.
  flushPendingFace();

  if (e.shiftKey) {
    performMove(`${keyMap[key]}'`);
  } else {
    pendingFace = keyMap[key];
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const face = pendingFace;
      pendingFace = null;
      if (face) performMove(face);
    }, 250);
  }
});

// Quick self-test in console
if (typeof window !== "undefined") {
  window.__cubeTest = () => {
    const test = new CubeState();
    const moves = randomScramble(30);
    for (const m of moves) test.applyMove(m);
    const solved = solveFromHistory(test.moveHistory);
    for (const m of solved) test.applyMove(m);
    return test.isSolved();
  };
}
