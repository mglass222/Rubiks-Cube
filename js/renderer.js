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
    while (this.cubeGroup.children.length) {
      this.cubeGroup.remove(this.cubeGroup.children[0]);
    }
    this.meshes = [];

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
    this._coreMesh = new THREE.Mesh(
      new THREE.BoxGeometry(coreSize, coreSize, coreSize),
      blackMat,
    );
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

          for (const a of affected) {
            const mesh = a.mesh;
            pivot.remove(mesh);
            this.cubeGroup.add(mesh);

            const [nx, ny, nz] = rotateCoords(a.x, a.y, a.z, face, turns);
            const nxi = nx + 1;
            const nyi = ny + 1;
            const nzi = nz + 1;

            if (this.meshes[a.xi][a.yi][a.zi] === mesh) {
              this.meshes[a.xi][a.yi][a.zi] = null;
            }
            this.meshes[nxi][nyi][nzi] = mesh;
            mesh.userData = { xi: nxi, yi: nyi, zi: nzi, x: nx, y: ny, z: nz };
            mesh.position.set(
              nx * GRID_PITCH,
              ny * GRID_PITCH,
              nz * GRID_PITCH,
            );
            mesh.rotation.set(0, 0, 0);
            mesh.updateMatrix();
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
    const hit = this._pick(e);
    if (!hit) {
      this.drag = { type: "orbit" };
      return;
    }
    this.controls.enabled = false;
    this.drag = {
      type: "face",
      startX: e.clientX,
      startY: e.clientY,
      hit,
    };
  }

  _onPointerMove(e) {
    if (!this.drag || this.drag.type !== "face") return;
  }

  _onPointerUp(e) {
    if (!this.drag) return;
    if (this.drag.type === "face") {
      const dx = e.clientX - this.drag.startX;
      const dy = e.clientY - this.drag.startY;
      const dist = Math.hypot(dx, dy);
      if (dist > 12) {
        const move = this._dragToMove(this.drag.hit, dx, dy);
        if (move && this.onFaceDrag) {
          this.onFaceDrag(move);
        }
      }
    }
    this._cancelDrag();
  }

  _cancelDrag() {
    this.drag = null;
    this.controls.enabled = true;
  }

  _pick(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const objects = [];
    this.cubeGroup.traverse((o) => {
      if (o.isMesh) objects.push(o);
    });
    const hits = this.raycaster.intersectObjects(objects, false);
    if (!hits.length) return null;

    const mesh = hits[0].object;
    const group = mesh.parent;
    const normal = hits[0].face.normal.clone();
    mesh.localToWorld(normal);
    group.worldToLocal(normal);
    normal.round();

    let faceKey = null;
    if (normal.x > 0.5) faceKey = "px";
    else if (normal.x < -0.5) faceKey = "nx";
    else if (normal.y > 0.5) faceKey = "py";
    else if (normal.y < -0.5) faceKey = "ny";
    else if (normal.z > 0.5) faceKey = "pz";
    else if (normal.z < -0.5) faceKey = "nz";

    return { group, faceKey, ...group.userData };
  }

  _dragToMove(hit, dx, dy) {
    const { faceKey, x, y, z } = hit;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const horiz = ax > ay;

    const map = {
      py: horiz ? (dx > 0 ? "U" : "U'") : (dy < 0 ? "U" : "U'"),
      ny: horiz ? (dx > 0 ? "D'" : "D") : (dy > 0 ? "D'" : "D"),
      px: horiz ? (dx > 0 ? "R'" : "R") : (dy < 0 ? "R'" : "R"),
      nx: horiz ? (dx > 0 ? "L" : "L'") : (dy > 0 ? "L" : "L'"),
      pz: horiz ? (dx > 0 ? "F" : "F'") : (dy < 0 ? "F" : "F'"),
      nz: horiz ? (dx > 0 ? "B'" : "B") : (dy > 0 ? "B'" : "B"),
    };

    let move = map[faceKey];
    if (!move) return null;

    // Pick layer move based on cubie position
    if (faceKey === "py" || faceKey === "ny") {
      // U/D already correct
    } else if (faceKey === "px" || faceKey === "nx") {
      if (y === 1) move = move.replace(/[RL]/, faceKey === "px" ? "U" : "U'");
      else if (y === -1) move = move.replace(/[RL]/, faceKey === "px" ? "D'" : "D");
      else if (z === 1) move = faceKey === "px" ? (horiz ? (dx > 0 ? "F'" : "F") : "F") : (horiz ? (dx > 0 ? "F'" : "F") : "F");
      else if (z === -1) move = faceKey === "px" ? "B" : "B'";
      else move = faceKey === "px" ? "R" : "L";
      if (y === 1) move = horiz ? (dx > 0 ? "U" : "U'") : (dy < 0 ? "U" : "U'");
      if (y === -1) move = horiz ? (dx > 0 ? "D'" : "D") : (dy > 0 ? "D'" : "D");
      if (z === 1 && y === 0) move = horiz ? (dx > 0 ? "F'" : "F") : (dy < 0 ? "F" : "F'");
      if (z === -1 && y === 0) move = horiz ? (dx > 0 ? "B" : "B'") : (dy > 0 ? "B'" : "B");
      if (x === 1) move = horiz ? (dx > 0 ? "R'" : "R") : (dy < 0 ? "R'" : "R");
      if (x === -1) move = horiz ? (dx > 0 ? "L" : "L'") : (dy > 0 ? "L" : "L'");
    }

    return this._resolveLayerMove(hit, dx, dy, horiz);
  }

  _resolveLayerMove(hit, dx, dy, horiz) {
    const { faceKey, x, y, z } = hit;

    if (faceKey === "py") return horiz ? (dx > 0 ? "U" : "U'") : (dy < 0 ? "U" : "U'");
    if (faceKey === "ny") return horiz ? (dx > 0 ? "D'" : "D") : (dy > 0 ? "D'" : "D");
    if (faceKey === "pz") return horiz ? (dx > 0 ? "F" : "F'") : (dy < 0 ? "F" : "F'");
    if (faceKey === "nz") return horiz ? (dx > 0 ? "B'" : "B") : (dy > 0 ? "B'" : "B");
    if (faceKey === "px") return horiz ? (dx > 0 ? "R'" : "R") : (dy < 0 ? "R'" : "R");
    if (faceKey === "nx") return horiz ? (dx > 0 ? "L" : "L'") : (dy > 0 ? "L" : "L'");

    return null;
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
