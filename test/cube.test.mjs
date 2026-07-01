import { CubeState, randomScramble } from "../js/cube.js";
import { solveFromHistory } from "../js/solver.js";

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`, e);
    process.exitCode = 1;
  }
}

test("solved cube is solved", () => {
  const c = new CubeState();
  if (!c.isSolved()) throw new Error("not solved");
});

test("single moves invert", () => {
  const faces = ["U", "D", "L", "R", "F", "B"];
  for (const f of faces) {
    const c = new CubeState();
    c.applyMove(f);
    c.applyMove(`${f}'`);
    if (!c.isSolved()) throw new Error(`${f} not inverted`);
  }
});

test("double move is identity", () => {
  const faces = ["U", "D", "L", "R", "F", "B"];
  for (const f of faces) {
    const c = new CubeState();
    c.applyMove(`${f}2`);
    c.applyMove(`${f}2`);
    if (!c.isSolved()) throw new Error(`${f}2 not self-inverse`);
  }
});

test("random scramble is solvable via history", () => {
  for (let i = 0; i < 20; i++) {
    const c = new CubeState();
    const moves = randomScramble(25);
    for (const m of moves) c.applyMove(m);
    const solution = solveFromHistory(c.moveHistory);
    for (const m of solution) c.applyMove(m);
    if (!c.isSolved()) throw new Error(`scramble ${i} not solved`);
  }
});

test("facelet string has 54 chars", () => {
  const c = new CubeState();
  const moves = randomScramble(40);
  for (const m of moves) c.applyMove(m);
  const s = c.toFaceString();
  if (s.length !== 54) throw new Error(`expected 54 chars, got ${s.length}`);
});

console.log("done");
