import { CubeState, getLayerCubies, moveToAngle, randomScramble } from "../js/cube.js";
import { solveFromHistory } from "../js/solver.js";

const STICKER_KEYS = ["px", "nx", "py", "ny", "pz", "nz"];
const STICKER_VECTORS = {
  px: [1, 0, 0],
  nx: [-1, 0, 0],
  py: [0, 1, 0],
  ny: [0, -1, 0],
  pz: [0, 0, 1],
  nz: [0, 0, -1],
};
const VECTOR_STICKERS = Object.fromEntries(
  Object.entries(STICKER_VECTORS).map(([key, vec]) => [vec.join(","), key]),
);

function faceIndex(face, row, col) {
  return { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }[face] + row * 3 + col;
}

function idToFaceletIndex(x, y, z, key) {
  if (key === "py") return faceIndex("U", z + 1, x + 1);
  if (key === "ny") return faceIndex("D", z + 1, x + 1);
  if (key === "pz") return faceIndex("F", y + 1, x + 1);
  if (key === "nz") return faceIndex("B", y + 1, x + 1);
  if (key === "px") return faceIndex("R", y + 1, z + 1);
  if (key === "nx") return faceIndex("L", y + 1, z + 1);
  return 0;
}

function rotateVector([x, y, z], axis, angle) {
  const sin = Math.round(Math.sin(angle));
  const cos = Math.round(Math.cos(angle));

  if (axis === "x") return [x, cos * y - sin * z, sin * y + cos * z];
  if (axis === "y") return [cos * x + sin * z, y, -sin * x + cos * z];
  return [cos * x - sin * y, sin * x + cos * y, z];
}

function expectedFaceletsAfterMove(move) {
  const face = move[0];
  const turns = move.endsWith("2") ? 2 : move.endsWith("'") ? 3 : 1;
  const { axis, angle } = moveToAngle(face, turns);
  const out = Array.from({ length: 54 }, (_, i) => i);

  for (const cubie of getLayerCubies(face)) {
    const { x, y, z } = cubie;
    const [nx, ny, nz] = rotateVector([x, y, z], axis, angle);

    for (const key of STICKER_KEYS) {
      const isVisible =
        (key === "px" && x === 1) ||
        (key === "nx" && x === -1) ||
        (key === "py" && y === 1) ||
        (key === "ny" && y === -1) ||
        (key === "pz" && z === 1) ||
        (key === "nz" && z === -1);
      if (!isVisible) continue;

      const nextKey = VECTOR_STICKERS[
        rotateVector(STICKER_VECTORS[key], axis, angle).join(",")
      ];
      out[idToFaceletIndex(nx, ny, nz, nextKey)] = idToFaceletIndex(x, y, z, key);
    }
  }

  return out;
}
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


test("move tables match animated cubie rotations", () => {
  for (const face of ["U", "D", "L", "R", "F", "B"]) {
    for (const suffix of ["", "'", "2"]) {
      const move = `${face}${suffix}`;
      const c = new CubeState();
      c.facelets = Array.from({ length: 54 }, (_, i) => i);
      c.applyMove(move, false);
      const expected = expectedFaceletsAfterMove(move);
      for (let i = 0; i < expected.length; i++) {
        if (c.facelets[i] !== expected[i]) {
          throw new Error(`${move} facelet ${i}: expected ${expected[i]}, got ${c.facelets[i]}`);
        }
      }
    }
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
