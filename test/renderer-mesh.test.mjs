/**
 * Simulates mesh grid updates from renderer._animateSingleTurn to catch swap bugs.
 */
import { CubeState, getLayerCubies, randomScramble } from "../js/cube.js";

function rotateCoords(x, y, z, face, turns) {
  if (turns === 2) {
    switch (face) {
      case "U":
      case "D":
        return [-x, y, -z];
      case "R":
      case "L":
        return [x, -y, -z];
      case "F":
      case "B":
        return [-x, -y, z];
      default:
        return [x, y, z];
    }
  }
  const s = turns === 3 ? -1 : 1;
  switch (face) {
    case "U": return [s * z, y, -s * x];
    case "D": return [-s * z, y, s * x];
    case "R": return [x, -s * z, s * y];
    case "L": return [x, s * z, -s * y];
    case "F": return [s * y, -s * x, z];
    case "B": return [-s * y, s * x, z];
    default: return [x, y, z];
  }
}

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
