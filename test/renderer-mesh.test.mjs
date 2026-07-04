/**
 * Simulates mesh grid updates from renderer._animateSingleTurn to catch swap bugs.
 */
import { CubeState, getLayerCubies, randomScramble, rotateCoords } from "../js/cube.js";

function parseMove(move) {
  const m = move.trim().match(/^([URFDLB])(['2]?|2)$/i);
  if (!m) return null;
  const face = m[1].toUpperCase();
  let turns = 1;
  if (m[2] === "2") turns = 2;
  else if (m[2] === "'") turns = 3;
  return { face, turns };
}

function buildMeshGrid() {
  const meshes = [];
  let id = 0;
  for (let xi = 0; xi < 3; xi++) {
    meshes[xi] = [];
    for (let yi = 0; yi < 3; yi++) {
      meshes[xi][yi] = [];
      for (let zi = 0; zi < 3; zi++) {
        if (xi === 1 && yi === 1 && zi === 1) {
          meshes[xi][yi][zi] = null;
          continue;
        }
        meshes[xi][yi][zi] = { id: id++, xi, yi, zi, x: xi - 1, y: yi - 1, z: zi - 1 };
      }
    }
  }
  return meshes;
}

function simulateTurn(meshes, face, turns) {
  const layer = getLayerCubies(face);
  const affected = layer.map((p) => ({
    mesh: meshes[p.xi][p.yi][p.zi],
    ...p,
  }));

  const placements = affected.map((a) => {
    const [nx, ny, nz] = rotateCoords(a.x, a.y, a.z, face, turns);
    return {
      mesh: a.mesh,
      from: { xi: a.xi, yi: a.yi, zi: a.zi },
      to: { xi: nx + 1, yi: ny + 1, zi: nz + 1, x: nx, y: ny, z: nz },
    };
  });

  for (const p of placements) {
    const { xi, yi, zi } = p.from;
    if (meshes[xi][yi][zi] === p.mesh) meshes[xi][yi][zi] = null;
  }
  for (const p of placements) {
    const { xi, yi, zi, x, y, z } = p.to;
    meshes[xi][yi][zi] = p.mesh;
    p.mesh.xi = xi;
    p.mesh.yi = yi;
    p.mesh.zi = zi;
    p.mesh.x = x;
    p.mesh.y = y;
    p.mesh.z = z;
  }
}

function meshGridMatchesState(meshes, state) {
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        const mesh = meshes[xi][yi][zi];
        const cubie = state.cubies[xi][yi][zi];
        if (!mesh && !cubie) continue;
        if (!mesh || !cubie) return false;
        if (mesh.xi !== xi || mesh.yi !== yi || mesh.zi !== zi) return false;
      }
    }
  }
  return true;
}

const state = new CubeState();
const meshes = buildMeshGrid();
const moves = randomScramble(80);

for (const move of moves) {
  const parsed = parseMove(move);
  simulateTurn(meshes, parsed.face, parsed.turns);
  state.applyMove(move);
  if (!meshGridMatchesState(meshes, state)) {
    console.error("Mesh grid desync after", move);
    process.exit(1);
  }
}

// Every physical cubie should occupy exactly one slot
const seen = new Set();
for (let xi = 0; xi < 3; xi++) {
  for (let yi = 0; yi < 3; yi++) {
    for (let zi = 0; zi < 3; zi++) {
      const mesh = meshes[xi][yi][zi];
      if (!mesh) continue;
      if (seen.has(mesh.id)) {
        console.error("Duplicate mesh at", xi, yi, zi);
        process.exit(1);
      }
      seen.add(mesh.id);
    }
  }
}

console.log("✓ mesh grid stays consistent through", moves.length, "random moves");

// Single-move consistency: verify the mesh grid (using the shared rotateCoords
// from cube.js, mirroring _animateSingleTurn) matches CubeState for every
// individual face/turn combination, not just after a long scramble.
for (const face of ["U", "D", "L", "R", "F", "B"]) {
  for (const suffix of ["", "'", "2"]) {
    const move = `${face}${suffix}`;
    const parsed = parseMove(move);
    const meshes = buildMeshGrid();
    const before = [];
    for (let xi = 0; xi < 3; xi++) {
      for (let yi = 0; yi < 3; yi++) {
        for (let zi = 0; zi < 3; zi++) {
          const mesh = meshes[xi][yi][zi];
          if (mesh) before.push({ id: mesh.id, xi, yi, zi });
        }
      }
    }

    simulateTurn(meshes, parsed.face, parsed.turns);
    const state = new CubeState();
    state.applyMove(move);

    if (!meshGridMatchesState(meshes, state)) {
      console.error(`Mesh grid desync after single move ${move}`);
      process.exit(1);
    }

    // Cubies outside the turned layer must stay in their original slot.
    const layerSlots = new Set(
      getLayerCubies(face).map((p) => `${p.xi},${p.yi},${p.zi}`),
    );
    for (const b of before) {
      const key = `${b.xi},${b.yi},${b.zi}`;
      if (layerSlots.has(key)) continue;
      const current = meshes[b.xi][b.yi][b.zi];
      if (!current || current.id !== b.id) {
        console.error(`Cubie outside the ${face} layer moved unexpectedly for move ${move}`);
        process.exit(1);
      }
    }
  }
}
console.log("✓ single-move mesh grid updates stay consistent for every face and turn");

// Four quarter turns of any face must return every mesh to its original slot.
for (const face of ["U", "D", "L", "R", "F", "B"]) {
  const meshes = buildMeshGrid();
  const originalLayout = [];
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        originalLayout.push(meshes[xi][yi][zi]?.id ?? null);
      }
    }
  }

  for (let i = 0; i < 4; i++) simulateTurn(meshes, face, 1);

  const finalLayout = [];
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        finalLayout.push(meshes[xi][yi][zi]?.id ?? null);
      }
    }
  }

  if (originalLayout.join(",") !== finalLayout.join(",")) {
    console.error(`Four ${face} quarter turns did not return the mesh grid to its original layout`);
    process.exit(1);
  }
}
console.log("✓ four quarter turns return the mesh grid to its original layout for every face");

// A double turn (turns=2) must equal applying the same quarter turn twice.
for (const face of ["U", "D", "L", "R", "F", "B"]) {
  const meshesDouble = buildMeshGrid();
  simulateTurn(meshesDouble, face, 2);

  const meshesTwice = buildMeshGrid();
  simulateTurn(meshesTwice, face, 1);
  simulateTurn(meshesTwice, face, 1);

  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        const a = meshesDouble[xi][yi][zi];
        const b = meshesTwice[xi][yi][zi];
        if ((a?.id ?? null) !== (b?.id ?? null)) {
          console.error(`${face}2 does not equal two ${face} turns at slot (${xi},${yi},${zi})`);
          process.exit(1);
        }
      }
    }
  }
}
console.log("✓ double turns match two quarter turns for every face");
