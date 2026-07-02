/** Face colors — Western Rubik's scheme */
export const COLORS = {
  W: 0, // Up    — white
  Y: 1, // Down  — yellow
  R: 2, // Front — red
  O: 3, // Back  — orange
  G: 4, // Right — green
  B: 5, // Left  — blue
};

export const COLOR_HEX = {
  [COLORS.W]: 0xf5f5f0,
  [COLORS.Y]: 0xffd500,
  [COLORS.R]: 0xc41e3a,
  [COLORS.O]: 0xff6b00,
  [COLORS.G]: 0x009b48,
  [COLORS.B]: 0x0051ba,
};

const FACE_CHARS = ["U", "R", "F", "D", "L", "B"];
const FACE_COLOR = [COLORS.W, COLORS.G, COLORS.R, COLORS.Y, COLORS.B, COLORS.O];

const MOVE_PERM = buildMoveTablesFrom3D();

function buildMoveTablesFrom3D() {
  const moves = {};
  for (const face of ["U", "D", "R", "L", "F", "B"]) {
    const perm = simulateMove(face, 1);
    moves[face] = perm;
    moves[`${face}'`] = simulateMove(face, 3);
    moves[`${face}2`] = simulateMove(face, 2);
  }
  return moves;
}

function simulateMove(face, turns) {
  const grid = createStickerGrid();
  for (let t = 0; t < (turns === 2 ? 2 : 1); t++) {
    rotateLayer(grid, face, turns === 3 ? 3 : 1);
  }
  const perm = new Array(54);
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        const cubie = grid[xi][yi][zi];
        if (!cubie) continue;
        for (const key of ["px", "nx", "py", "ny", "pz", "nz"]) {
          const id = cubie[key];
          if (id == null) continue;
          const pos = idToFaceletIndex(xi - 1, yi - 1, zi - 1, key);
          perm[pos] = id;
        }
      }
    }
  }
  return perm;
}

function createStickerGrid() {
  const grid = [];
  for (let xi = 0; xi < 3; xi++) {
    grid[xi] = [];
    for (let yi = 0; yi < 3; yi++) {
      grid[xi][yi] = [];
      for (let zi = 0; zi < 3; zi++) {
        if (xi === 1 && yi === 1 && zi === 1) {
          grid[xi][yi][zi] = null;
          continue;
        }
        const x = xi - 1;
        const y = yi - 1;
        const z = zi - 1;
        grid[xi][yi][zi] = {
          px: x === 1 ? idToFaceletIndex(x, y, z, "px") : null,
          nx: x === -1 ? idToFaceletIndex(x, y, z, "nx") : null,
          py: y === 1 ? idToFaceletIndex(x, y, z, "py") : null,
          ny: y === -1 ? idToFaceletIndex(x, y, z, "ny") : null,
          pz: z === 1 ? idToFaceletIndex(x, y, z, "pz") : null,
          nz: z === -1 ? idToFaceletIndex(x, y, z, "nz") : null,
        };
      }
    }
  }
  return grid;
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

function faceIndex(face, row, col) {
  const start = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 }[face];
  return start + row * 3 + col;
}

function rotateLayer(grid, face, turns) {
  const layer = [];
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        const x = xi - 1;
        const y = yi - 1;
        const z = zi - 1;
        if (x === 0 && y === 0 && z === 0) continue;
        const on =
          (face === "U" && y === 1) ||
          (face === "D" && y === -1) ||
          (face === "R" && x === 1) ||
          (face === "L" && x === -1) ||
          (face === "F" && z === 1) ||
          (face === "B" && z === -1);
        if (on) layer.push({ xi, yi, zi, x, y, z, cubie: { ...grid[xi][yi][zi] } });
      }
    }
  }

  for (const p of layer) {
    const [nx, ny, nz] = rotateCoords(p.x, p.y, p.z, face, turns);
    const nxi = nx + 1;
    const nyi = ny + 1;
    const nzi = nz + 1;
    grid[nxi][nyi][nzi] = rotateStickers(p.cubie, face, turns);
  }
}

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

function rotateStickers(st, face, turns) {
  const c = { ...st };
  const rotY = (d) => {
    const { px, nx, py, ny, pz, nz } = c;
    if (d === 1) c.px = pz, c.pz = nx, c.nx = nz, c.nz = px, c.py = py, c.ny = ny;
    else c.px = nz, c.pz = px, c.nx = pz, c.nz = nx, c.py = py, c.ny = ny;
  };
  const rotX = (d) => {
    const { px, nx, py, ny, pz, nz } = c;
    if (d === 1) {
      c.py = pz; c.pz = ny; c.ny = nz; c.nz = py; c.px = px; c.nx = nx;
    } else {
      c.py = nz; c.pz = py; c.ny = pz; c.nz = ny; c.px = px; c.nx = nx;
    }
  };
  const rotZ = (d) => {
    const { px, nx, py, ny, pz, nz } = c;
    if (d === 1) {
      c.py = px; c.px = ny; c.ny = nx; c.nx = py; c.pz = pz; c.nz = nz;
    } else {
      c.py = nx; c.px = py; c.ny = px; c.nx = ny; c.pz = pz; c.nz = nz;
    }
  };
  const s = turns === 3 ? -1 : 1;
  if (face === "U") rotY(s);
  else if (face === "D") rotY(-s);
  else if (face === "R") rotX(s);
  else if (face === "L") rotX(-s);
  else if (face === "F") rotZ(s);
  else if (face === "B") rotZ(-s);
  return c;
}

function solvedFacelets() {
  const f = new Array(54);
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 9; i++) f[face * 9 + i] = FACE_COLOR[face];
  }
  return f;
}

function faceletsToCubies(facelets) {
  const grid = [];
  for (let xi = 0; xi < 3; xi++) {
    grid[xi] = [];
    for (let yi = 0; yi < 3; yi++) {
      grid[xi][yi] = [];
      for (let zi = 0; zi < 3; zi++) {
        if (xi === 1 && yi === 1 && zi === 1) {
          grid[xi][yi][zi] = null;
          continue;
        }
        const x = xi - 1;
        const y = yi - 1;
        const z = zi - 1;
        grid[xi][yi][zi] = {
          stickers: {
            px: x === 1 ? facelets[faceIndex("R", y + 1, z + 1)] : null,
            nx: x === -1 ? facelets[faceIndex("L", y + 1, z + 1)] : null,
            py: y === 1 ? facelets[faceIndex("U", z + 1, x + 1)] : null,
            ny: y === -1 ? facelets[faceIndex("D", z + 1, x + 1)] : null,
            pz: z === 1 ? facelets[faceIndex("F", y + 1, x + 1)] : null,
            nz: z === -1 ? facelets[faceIndex("B", y + 1, x + 1)] : null,
          },
        };
      }
    }
  }
  return grid;
}

export class CubeState {
  constructor() {
    this.facelets = solvedFacelets();
    this.cubies = faceletsToCubies(this.facelets);
    this.moveHistory = [];
  }

  reset() {
    this.facelets = solvedFacelets();
    this.cubies = faceletsToCubies(this.facelets);
    this.moveHistory = [];
  }

  isSolved() {
    return this.facelets.every((c, i) => c === FACE_COLOR[Math.floor(i / 9)]);
  }

  toFaceString() {
    return this.facelets.map((c) => FACE_CHARS[c]).join("");
  }

  applyMove(move, record = true) {
    const perm = MOVE_PERM[move];
    if (!perm) return false;
    this.facelets = perm.map((i) => this.facelets[i]);
    this.cubies = faceletsToCubies(this.facelets);
    if (record) this.moveHistory.push(move);
    return true;
  }

  applyAlgorithm(alg) {
    for (const m of tokenizeAlgorithm(alg)) this.applyMove(m);
  }

  undo() {
    if (!this.moveHistory.length) return null;
    const last = this.moveHistory.pop();
    const inv = inverseMove(last);
    this.applyMove(inv, false);
    return inv;
  }
}

export function parseMove(move) {
  const m = move.trim().match(/^([URFDLB])(['2]?|2)$/i);
  if (!m) return null;
  const face = m[1].toUpperCase();
  let turns = 1;
  if (m[2] === "2") turns = 2;
  else if (m[2] === "'") turns = 3;
  return { face, turns };
}

export function inverseMove(move) {
  const p = parseMove(move);
  if (!p) return move;
  if (p.turns === 1) return `${p.face}'`;
  if (p.turns === 2) return `${p.face}2`;
  return p.face;
}

export function tokenizeAlgorithm(alg) {
  return alg
    .replace(/([URFDLB])(['2]?|2)/gi, " $1$2 ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const p = parseMove(t);
      if (!p) return t;
      if (p.turns === 2) return `${p.face}2`;
      if (p.turns === 3) return `${p.face}'`;
      return p.face;
    });
}

export function randomScramble(length = 25) {
  const faces = ["U", "D", "L", "R", "F", "B"];
  const opposites = { U: "D", D: "U", L: "R", R: "L", F: "B", B: "F" };
  const moves = [];
  let last = "";
  let last2 = "";

  for (let i = 0; i < length; i++) {
    let pool = faces.filter((f) => f !== last && f !== opposites[last2]);
    if (!pool.length) pool = faces.filter((f) => f !== last);
    const face = pool[Math.floor(Math.random() * pool.length)];
    const variant = ["", "'", "2"][Math.floor(Math.random() * 3)];
    moves.push(face + variant);
    last2 = last;
    last = face;
  }
  return moves;
}

export function getLayerCubies(face) {
  const out = [];
  for (let xi = 0; xi < 3; xi++) {
    for (let yi = 0; yi < 3; yi++) {
      for (let zi = 0; zi < 3; zi++) {
        const x = xi - 1;
        const y = yi - 1;
        const z = zi - 1;
        if (x === 0 && y === 0 && z === 0) continue;
        const onLayer =
          (face === "U" && y === 1) ||
          (face === "D" && y === -1) ||
          (face === "R" && x === 1) ||
          (face === "L" && x === -1) ||
          (face === "F" && z === 1) ||
          (face === "B" && z === -1);
        if (onLayer) out.push({ xi, yi, zi, x, y, z });
      }
    }
  }
  return out;
}

export function faceAxis(face) {
  return {
    U: { axis: "y", dir: 1, layer: 1 },
    D: { axis: "y", dir: -1, layer: -1 },
    R: { axis: "x", dir: 1, layer: 1 },
    L: { axis: "x", dir: -1, layer: -1 },
    F: { axis: "z", dir: 1, layer: 1 },
    B: { axis: "z", dir: -1, layer: -1 },
  }[face];
}

export function moveToAngle(face, turns) {
  const { dir } = faceAxis(face);
  const cw = turns === 1 ? -Math.PI / 2 : turns === 3 ? Math.PI / 2 : Math.PI;
  const angle = cw * dir;
  return { axis: faceAxis(face).axis, angle };
}
