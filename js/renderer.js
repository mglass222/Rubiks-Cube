import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  COLOR_HEX,
  COLORS,
  CubeState,
  faceAxis,
  getLayerCubies,
  moveToAngle,
  rotateCoords,
} from "./cube.js";

const GAP = 0.058;
const CUBIE_SIZE = 0.942;
const GRID_PITCH = CUBIE_SIZE + GAP;
const STICKER_INSET = 0.062;
const STICKER_SIZE = CUBIE_SIZE - STICKER_INSET * 2;
const STICKER_DEPTH = 0.028;
const BODY_RADIUS = 0.052;
const STICKER_RADIUS = 0.085;
const ROUND_SEGMENTS = 6;
const ANIM_MS = 160;
const BLACK = 0x080808;

/** Outward unit normal per clickable sticker face key. */
const FACE_NORMALS = {
  px: new THREE.Vector3(1, 0, 0),
  nx: new THREE.Vector3(-1, 0, 0),
  py: new THREE.Vector3(0, 1, 0),
  ny: new THREE.Vector3(0, -1, 0),
  pz: new THREE.Vector3(0, 0, 1),
  nz: new THREE.Vector3(0, 0, -1),
};

/**
 * For each face, the two world axes that lie in the face plane (perpendicular
 * to the face normal). A drag projected onto one of these picks the rotation
 * axis via normal x dragAxis.
 */
const IN_FACE_AXES = {
  px: [
    { vec: new THREE.Vector3(0, 1, 0), axis: "y" },
    { vec: new THREE.Vector3(0, 0, 1), axis: "z" },
  ],
  nx: [
    { vec: new THREE.Vector3(0, 1, 0), axis: "y" },
    { vec: new THREE.Vector3(0, 0, 1), axis: "z" },
  ],
  py: [
    { vec: new THREE.Vector3(1, 0, 0), axis: "x" },
    { vec: new THREE.Vector3(0, 0, 1), axis: "z" },
  ],
  ny: [
    { vec: new THREE.Vector3(1, 0, 0), axis: "x" },
    { vec: new THREE.Vector3(0, 0, 1), axis: "z" },
  ],
  pz: [
    { vec: new THREE.Vector3(1, 0, 0), axis: "x" },
    { vec: new THREE.Vector3(0, 1, 0), axis: "y" },
  ],
  nz: [
    { vec: new THREE.Vector3(1, 0, 0), axis: "x" },
    { vec: new THREE.Vector3(0, 1, 0), axis: "y" },
  ],
};

/**
 * Map a rotation axis + cubie coordinate to the face letter of that layer.
 * Coordinate 0 is a middle slice (M/E/S) → null (unsupported, drag does nothing).
 */
const AXIS_LAYER_FACE = {
  x: { [-1]: "L", 0: null, 1: "R" },
  y: { [-1]: "D", 0: null, 1: "U" },
  z: { [-1]: "B", 0: null, 1: "F" },
};


export class CubeRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CubeState} state
   */
  constructor(canvas, state) {
    this.canvas = canvas;
    this.state = state;
    this.animating = false;
    this.queue = [];
    this.onMoveComplete = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(5, 4.5, 6);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 14;
    this.controls.enablePan = false;

    this._setupLights();
    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);
    this._coreMesh = null;
    this._blackMat = null;

    /** @type {THREE.Mesh[][][]} */
    this.meshes = [];
    /** @type {THREE.Mesh[]} colored sticker meshes for raycasting */
    this._pickables = [];
    this._buildCubies();
    this._resize();
    window.addEventListener("resize", () => this._resize());

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.drag = null;

    canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
    canvas.addEventListener("pointercancel", () => this._cancelDrag());

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 10, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa8c4ff, 0.35);
    fill.position.set(-6, 2, -4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffe0c0, 0.25);
    rim.position.set(0, -4, 6);
    this.scene.add(rim);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _buildCubies() {
    // Dispose the per-sticker materials from the previous build before dropping
    // the cubie tree. Shared geometries (_bodyGeo/_stickerGeo/_coreGeo) and the
    // shared _blackMat are reused across rebuilds, so leave those intact.
    while (this.cubeGroup.children.length) {
      const child = this.cubeGroup.children[0];
      child.traverse((obj) => {
        if (obj.material && obj.material !== this._blackMat) {
          obj.material.dispose();
        }
      });
      this.cubeGroup.remove(child);
    }
    this.meshes = [];
    this._pickables = [];

    const blackMat = this._blackMat ?? new THREE.MeshStandardMaterial({
      color: BLACK,
      roughness: 0.78,
      metalness: 0.01,
    });
    this._blackMat = blackMat;

    if (!this._bodyGeo) {
      this._bodyGeo = new RoundedBoxGeometry(
        CUBIE_SIZE,
        CUBIE_SIZE,
        CUBIE_SIZE,
        ROUND_SEGMENTS,
        BODY_RADIUS,
      );
      this._stickerGeo = new RoundedBoxGeometry(
        STICKER_SIZE,
        STICKER_SIZE,
        STICKER_DEPTH,
        ROUND_SEGMENTS,
        STICKER_RADIUS,
      );
    }

    const half = CUBIE_SIZE / 2;
    const stickerOffset = half + STICKER_DEPTH / 2 + 0.001;
    const faceDefs = [
      { key: "px", pos: [stickerOffset, 0, 0], rot: [0, Math.PI / 2, 0] },
      { key: "nx", pos: [-stickerOffset, 0, 0], rot: [0, -Math.PI / 2, 0] },
      { key: "py", pos: [0, stickerOffset, 0], rot: [-Math.PI / 2, 0, 0] },
      { key: "ny", pos: [0, -stickerOffset, 0], rot: [Math.PI / 2, 0, 0] },
      { key: "pz", pos: [0, 0, stickerOffset], rot: [0, 0, 0] },
      { key: "nz", pos: [0, 0, -stickerOffset], rot: [0, Math.PI, 0] },
    ];

    const coreSize = GRID_PITCH * 3 - GAP * 0.15;
    this._coreGeo ??= new THREE.BoxGeometry(coreSize, coreSize, coreSize);
    this._coreMesh = new THREE.Mesh(this._coreGeo, blackMat);
    this.cubeGroup.add(this._coreMesh);

    for (let xi = 0; xi < 3; xi++) {
      this.meshes[xi] = [];
      for (let yi = 0; yi < 3; yi++) {
        this.meshes[xi][yi] = [];
        for (let zi = 0; zi < 3; zi++) {
          if (xi === 1 && yi === 1 && zi === 1) {
            this.meshes[xi][yi][zi] = null;
            continue;
          }

          const x = xi - 1;
          const y = yi - 1;
          const z = zi - 1;
          const cubieData = this.state.cubies[xi][yi][zi];
          const group = new THREE.Group();
          group.position.set(
            x * GRID_PITCH,
            y * GRID_PITCH,
            z * GRID_PITCH,
          );
          group.userData = { xi, yi, zi, x, y, z };

          const body = new THREE.Mesh(this._bodyGeo, blackMat);
          body.castShadow = true;
          body.receiveShadow = true;
          group.add(body);

          for (const f of faceDefs) {
            const colorId = cubieData.stickers[f.key];
            const hex = colorId === null ? BLACK : COLOR_HEX[colorId];
            const sticker = new THREE.Mesh(
              this._stickerGeo,
              new THREE.MeshStandardMaterial({
                color: hex,
                roughness: colorId === null ? 0.78 : 0.3,
                metalness: colorId === null ? 0.01 : 0.04,
              }),
            );
            sticker.position.set(...f.pos);
            sticker.rotation.set(...f.rot);
            sticker.castShadow = true;
            sticker.receiveShadow = true;
            sticker.userData.stickerFace = f.key;
            group.add(sticker);
            if (colorId !== null) {
              this._pickables.push(sticker);
            }
          }

          this.cubeGroup.add(group);
          this.meshes[xi][yi][zi] = group;
        }
      }
    }
  }

  syncFromState() {
    for (let xi = 0; xi < 3; xi++) {
      for (let yi = 0; yi < 3; yi++) {
        for (let zi = 0; zi < 3; zi++) {
          const mesh = this.meshes[xi][yi][zi];
          const data = this.state.cubies[xi][yi][zi];
          if (!mesh || !data) continue;
          this._updateCubieStickers(mesh, data.stickers);
        }
      }
    }
    this._refreshPickables();
  }

  _refreshPickables() {
    this._pickables = [];
    for (let xi = 0; xi < 3; xi++) {
      for (let yi = 0; yi < 3; yi++) {
        for (let zi = 0; zi < 3; zi++) {
          const group = this.meshes[xi][yi][zi];
          const data = this.state.cubies[xi][yi][zi];
          if (!group || !data) continue;
          for (const child of group.children) {
            const faceKey = child.userData.stickerFace;
            if (!faceKey) continue;
            if (data.stickers[faceKey] !== null) {
              this._pickables.push(child);
            }
          }
        }
      }
    }
  }

  rebuild() {
    this._buildCubies();
  }

  _updateCubieStickers(group, stickers) {
    group.children.forEach((child) => {
      const key = child.userData.stickerFace;
      if (!key) return;
      const colorId = stickers[key];
      const hex = colorId === null ? BLACK : COLOR_HEX[colorId];
      child.material.color.setHex(hex);
      child.material.roughness = colorId === null ? 0.78 : 0.3;
      child.material.metalness = colorId === null ? 0.01 : 0.04;
    });
  }

  /**
   * @param {string} move
   * @param {{ sound?: import('./audio.js').CubeAudio }} opts
   */
  async animateMove(move, opts = {}) {
    return new Promise((resolve) => {
      this.queue.push({ move, opts, resolve });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.animating || !this.queue.length) return;
    this.animating = true;
    const { move, opts, resolve } = this.queue.shift();

    const parsed = move.match(/^([URFDLB])(['2]?|2)$/i);
    if (!parsed) {
      this.animating = false;
      resolve();
      this._processQueue();
      return;
    }

    const face = parsed[1].toUpperCase();
    let turns = 1;
    if (parsed[2] === "2") turns = 2;
    else if (parsed[2] === "'") turns = 3;

    opts.sound?.playWhoosh?.();
    await this._animateFaceTurn(face, turns);
    opts.sound?.playSnap?.();
    this.state.applyMove(move, false);
    this.syncFromState();
    this.onMoveComplete?.(move);
    resolve();
    this.animating = false;
    this._processQueue();
  }

  _animateFaceTurn(face, turns) {
    return this._animateSingleTurn(face, turns);
  }

  _animateSingleTurn(face, turns) {
    return new Promise((resolve) => {
      const { axis, angle } = moveToAngle(face, turns);
      const layer = getLayerCubies(face);
      const pivot = new THREE.Group();
      this.cubeGroup.add(pivot);

      const affected = [];
      for (const p of layer) {
        const mesh = this.meshes[p.xi][p.yi][p.zi];
        if (!mesh) continue;
        this.cubeGroup.remove(mesh);
        pivot.add(mesh);
        affected.push({ mesh, ...p });
      }

      const start = performance.now();
      const duration = turns === 2 ? ANIM_MS * 1.4 : ANIM_MS;

      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        pivot.rotation[axis] = angle * eased;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          pivot.rotation[axis] = angle;
          pivot.updateMatrixWorld(true);

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
            if (this.meshes[xi][yi][zi] === p.mesh) {
              this.meshes[xi][yi][zi] = null;
            }
            pivot.remove(p.mesh);
            this.cubeGroup.add(p.mesh);
          }

          for (const p of placements) {
            const { xi, yi, zi, x, y, z } = p.to;
            this.meshes[xi][yi][zi] = p.mesh;
            p.mesh.userData = { xi, yi, zi, x, y, z };
            p.mesh.position.set(
              x * GRID_PITCH,
              y * GRID_PITCH,
              z * GRID_PITCH,
            );
            p.mesh.rotation.set(0, 0, 0);
            p.mesh.updateMatrix();
          }

          this.cubeGroup.remove(pivot);
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onPointerDown(e) {
    if (this.animating) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const hit = this._pick(e);
    if (!hit) {
      this.drag = { type: "orbit", pointerId: e.pointerId };
      return;
    }
    e.preventDefault();
    this.controls.enabled = false;
    this.drag = {
      type: "face",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      hit,
    };
  }

  _onPointerMove(e) {
    if (!this.drag || this.drag.type !== "face") return;
    e.preventDefault();
  }

  _onPointerUp(e) {
    if (!this.drag) return;
    if (this.drag.type === "face") {
      const dx = e.clientX - this.drag.startX;
      const dy = e.clientY - this.drag.startY;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) {
        const move = this._dragToMove(this.drag.hit, dx, dy);
        if (move && this.onFaceDrag) {
          this.onFaceDrag(move);
        }
      }
    }
    this._cancelDrag();
  }

  _cancelDrag() {
    if (this.drag && this.canvas.hasPointerCapture?.(this.drag.pointerId)) {
      this.canvas.releasePointerCapture(this.drag.pointerId);
    }
    this.drag = null;
    this.controls.enabled = true;
  }

  _pick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this._pickables, false);
    if (!hits.length) return null;

    const mesh = hits[0].object;
    const group = mesh.parent;
    if (!group?.userData || group.userData.xi === undefined) return null;

    const faceKey = mesh.userData.stickerFace;
    if (!faceKey) return null;

    return { group, faceKey, ...group.userData };
  }

  /**
   * Resolve a drag on a sticker into a cube move.
   *
   * A drag turns the layer that is perpendicular to the drag direction (not the
   * face the sticker sits on): the drag direction, projected onto the clicked
   * face, picks a rotation axis; the clicked cubie's coordinate along that axis
   * selects which layer (U/D, L/R, or F/B). Middle-slice drags resolve to no
   * move. The turn sign is derived from the same convention as moveToAngle in
   * cube.js, so the dragged layer and the animated layer always agree.
   */
  _dragToMove(hit, dx, dy) {
    const normal = FACE_NORMALS[hit.faceKey];
    if (!normal) return null;

    // World-space drag vector: +dx toward camera right, +dy (screen down) toward
    // camera down, i.e. camera up * -dy.
    const right = new THREE.Vector3();
    const camUp = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(right, camUp, new THREE.Vector3());
    const drag = right.multiplyScalar(dx).add(camUp.multiplyScalar(-dy));

    // Pick the in-face axis the drag is most aligned with.
    let bestAxis = null;
    let bestMag = 0;
    let bestSign = 1;
    for (const ax of IN_FACE_AXES[hit.faceKey]) {
      const mag = drag.dot(ax.vec);
      if (Math.abs(mag) > bestMag) {
        bestMag = Math.abs(mag);
        bestAxis = ax;
        bestSign = Math.sign(mag) || 1;
      }
    }
    if (!bestAxis || bestMag < 1e-4) return null;

    // The rotation axis is normal × dragAxis, scaled by the drag sense so its
    // sign carries the physical turn direction about that axis.
    const rotAxis = new THREE.Vector3()
      .crossVectors(normal, bestAxis.vec)
      .multiplyScalar(bestSign);

    // Select the layer from the clicked cubie's coordinate along rotAxis.
    let coord;
    let axisName;
    if (Math.abs(rotAxis.x) > 0.5) {
      axisName = "x";
      coord = hit.x;
    } else if (Math.abs(rotAxis.y) > 0.5) {
      axisName = "y";
      coord = hit.y;
    } else {
      axisName = "z";
      coord = hit.z;
    }

    const face = AXIS_LAYER_FACE[axisName][coord];
    if (!face) return null; // middle slice (M/E/S) — unsupported, do nothing

    // Compare the drag's physical turn direction about the layer axis against the
    // engine's positive-turn direction (moveToAngle: angle = -pi/2 * dir).
    const dragDir = Math.sign(rotAxis[axisName]) || 1;
    const engineDir = -faceAxis(face).dir;
    const prime = dragDir !== engineDir;
    return prime ? `${face}'` : face;
  }
}
