import { CubeState, getLayerCubies, moveToAngle, randomScramble, rotateCoords } from "../js/cube.js";
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

const ALL_FACES = ["U", "D", "L", "R", "F", "B"];
const COORD_RANGE = [-1, 0, 1];

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
test("rotateCoords (now exported for renderer use) matches the moveToAngle rotation for every turn", () => {
  // rotateCoords is now derived from moveToAngle so that the logical facelet
  // permutation (built in cube.js) and the animated pivot rotation (in
  // renderer.js) always agree, including for turns=2 which renderer.js passes
  // directly (unlike the internal move-table builder, which only ever uses 1/3).
  for (const face of ALL_FACES) {
    for (const turns of [1, 2, 3]) {
      const { axis, angle } = moveToAngle(face, turns);
      for (const x of COORD_RANGE) {
        for (const y of COORD_RANGE) {
          for (const z of COORD_RANGE) {
            const expected = rotateVector([x, y, z], axis, angle);
            const actual = rotateCoords(x, y, z, face, turns);
            if (actual.join(",") !== expected.join(",")) {
              throw new Error(
                `${face} turns=${turns} at (${x},${y},${z}): expected [${expected}], got [${actual}]`,
              );
            }
          }
        }
      }
    }
  }
});

test("rotateCoords: four quarter turns return every coordinate to its start", () => {
  for (const face of ALL_FACES) {
    for (const x of COORD_RANGE) {
      for (const y of COORD_RANGE) {
        for (const z of COORD_RANGE) {
          let [cx, cy, cz] = [x, y, z];
          for (let i = 0; i < 4; i++) [cx, cy, cz] = rotateCoords(cx, cy, cz, face, 1);
          if (cx !== x || cy !== y || cz !== z) {
            throw new Error(
              `${face}: four quarter turns not identity at (${x},${y},${z}) -> (${cx},${cy},${cz})`,
            );
          }
        }
      }
    }
  }
});

test("rotateCoords: a double turn equals two quarter turns", () => {
  for (const face of ALL_FACES) {
    for (const x of COORD_RANGE) {
      for (const y of COORD_RANGE) {
        for (const z of COORD_RANGE) {
          const double = rotateCoords(x, y, z, face, 2);
          const [ix, iy, iz] = rotateCoords(x, y, z, face, 1);
          const twice = rotateCoords(ix, iy, iz, face, 1);
          if (double.join(",") !== twice.join(",")) {
            throw new Error(
              `${face} at (${x},${y},${z}): double=[${double}] != twoQuarters=[${twice}]`,
            );
          }
        }
      }
    }
  }
});

test("rotateCoords: prime turn inverts a quarter turn", () => {
  for (const face of ALL_FACES) {
    for (const x of COORD_RANGE) {
      for (const y of COORD_RANGE) {
        for (const z of COORD_RANGE) {
          const [ix, iy, iz] = rotateCoords(x, y, z, face, 1);
          const [bx, by, bz] = rotateCoords(ix, iy, iz, face, 3);
          if (bx !== x || by !== y || bz !== z) {
            throw new Error(
              `${face}: prime did not invert quarter turn at (${x},${y},${z}) -> (${bx},${by},${bz})`,
            );
          }
        }
      }
    }
  }
});

test("rotateCoords: the rotation axis coordinate is invariant", () => {
  const axisIndex = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
  for (const face of ALL_FACES) {
    const idx = axisIndex[face];
    for (const turns of [1, 2, 3]) {
      for (const x of COORD_RANGE) {
        for (const y of COORD_RANGE) {
          for (const z of COORD_RANGE) {
            const result = rotateCoords(x, y, z, face, turns);
            const original = [x, y, z];
            if (result[idx] !== original[idx]) {
              throw new Error(
                `${face} turns=${turns} at (${x},${y},${z}): axis coordinate changed to ${result[idx]}`,
              );
            }
          }
        }
      }
    }
  }
});

test("rotateCoords: unmoved center (0,0,0) is a fixed point for every face/turn", () => {
  for (const face of ALL_FACES) {
    for (const turns of [1, 2, 3]) {
      const [x, y, z] = rotateCoords(0, 0, 0, face, turns);
      if (x !== 0 || y !== 0 || z !== 0) {
        throw new Error(`${face} turns=${turns}: origin moved to (${x},${y},${z})`);
      }
    }
  }
});

test("sexy move (R U R' U') repeated six times returns to solved", () => {
  const c = new CubeState();
  for (let i = 0; i < 6; i++) {
    for (const m of ["R", "U", "R'", "U'"]) c.applyMove(m);
  }
  if (!c.isSolved()) throw new Error("R U R' U' x6 should return the cube to solved");
});

test("facelet string has 54 chars", () => {
  const c = new CubeState();
  const moves = randomScramble(40);
  for (const m of moves) c.applyMove(m);
  const s = c.toFaceString();
  if (s.length !== 54) throw new Error(`expected 54 chars, got ${s.length}`);
});

console.log("done");
