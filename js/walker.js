/* ────────────────────────────────────────────────────────────
   걷기 모드 — Blender 캐릭터(assets/map/character.glb)로 3D 지도의 거리를 걸어 다닙니다.
   · 3인칭 / 1인칭 시점 (V)
   · 건물 · 하천 충돌 (지붕 삼각형으로 만든 1m 격자, 다리는 통과)
   · 나침반 · 미니맵 · 가장 가까운 공간 · 도착 알림
   · 길 안내 (격자 A* → 발자국 점) + 자동 걷기 (N)
   입력은 키보드 · 마우스 · 브라우저 손 제스처 · TouchDesigner 가 같은 setInput/look 을 씁니다.
   ──────────────────────────────────────────────────────────── */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const CHAR_URL = './assets/map/character.glb';
const MINIMAP_URL = './images/minimap.webp';
const R = 560;
const CELL = 1;
const N = Math.ceil((R * 2) / CELL);
const WALK = 4.2;
const RUN = 11;
const AUTO = 8;
const BODY_R = 0.42;
const ARRIVE = 22;
const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BLOCK_ROLES = new Set(['bld', 'bldWarm', 'bldFill', 'bldTall', 'bldCampus', 'spot']);

export class Walker {
  constructor(map, cb = {}) {
    this.map = map;
    this.cb = cb;
    this.active = false;
    this.view = 'third';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = Math.PI;         // 캐릭터가 바라보는 방향 (0 = +Z, π = 북쪽)
    this.camYaw = Math.PI;
    this.camPitch = 0.28;
    this.input = { x: 0, z: 0, run: false };
    this.joy = { x: 0, y: 0, t: 0 };
    this.look = { dx: 0, dy: 0 };
    this.phase = 0;
    this.speed = 0;
    this.target = null;         // 목적지 place id
    this.path = [];
    this.auto = false;
    this.blend = 0;             // 진입 전환
    this.arrived = null;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(CHAR_URL);
    this.model = gltf.scene;
    this.parts = {};
    this.model.traverse((o) => {
      this.parts[o.name] = o;
      if (o.isMesh) {
        o.castShadow = o.name !== 'FootShadow';
        o.receiveShadow = false;
        if (o.name === 'FootShadow') { o.material.transparent = true; o.material.opacity = 0.28; o.material.depthWrite = false; o.renderOrder = 4; }
      }
    });
    this.model.visible = false;
    this.hipsY = this.parts.Hips ? this.parts.Hips.position.y : 0.72;
    this.map.scene.add(this.model);
    this.buildGrid();
    this.buildBeams();
    this.buildTrail();
    this.minimap = new Image();
    this.minimap.src = MINIMAP_URL;
    this.spawn();
  }

  /* ── 충돌 격자 ───────────────────────────────────── */
  buildGrid() {
    const g = new Uint8Array(N * N);         // 0 길 · 1 건물 · 2 물
    const road = new Uint8Array(N * N);
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
    const raster = (mesh, arr, val, needUp) => {
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.getAttribute('position');
      const idx = mesh.geometry.getIndex();
      const tri = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < tri; t++) {
        const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        v0.fromBufferAttribute(pos, a).applyMatrix4(mesh.matrixWorld);
        v1.fromBufferAttribute(pos, b).applyMatrix4(mesh.matrixWorld);
        v2.fromBufferAttribute(pos, c).applyMatrix4(mesh.matrixWorld);
        if (needUp) {
          nrm.crossVectors(e1.subVectors(v1, v0), e2.subVectors(v2, v0)).normalize();
          if (Math.abs(nrm.y) < 0.7) continue;
        }
        const x0 = Math.min(v0.x, v1.x, v2.x), x1 = Math.max(v0.x, v1.x, v2.x);
        const z0 = Math.min(v0.z, v1.z, v2.z), z1 = Math.max(v0.z, v1.z, v2.z);
        const i0 = Math.max(0, Math.floor((x0 + R) / CELL)), i1 = Math.min(N - 1, Math.floor((x1 + R) / CELL));
        const j0 = Math.max(0, Math.floor((z0 + R) / CELL)), j1 = Math.min(N - 1, Math.floor((z1 + R) / CELL));
        const d = (v1.z - v2.z) * (v0.x - v2.x) + (v2.x - v1.x) * (v0.z - v2.z) || 1e-9;
        for (let i = i0; i <= i1; i++) {
          const px = i * CELL - R + CELL / 2;
          for (let j = j0; j <= j1; j++) {
            const pz = j * CELL - R + CELL / 2;
            const w0 = ((v1.z - v2.z) * (px - v2.x) + (v2.x - v1.x) * (pz - v2.z)) / d;
            const w1 = ((v2.z - v0.z) * (px - v2.x) + (v0.x - v2.x) * (pz - v2.z)) / d;
            if (w0 >= -0.02 && w1 >= -0.02 && 1 - w0 - w1 >= -0.02) arr[j * N + i] = val;
          }
        }
      }
    };
    this.map.model.traverse((o) => {
      if (!o.isMesh) return;
      const role = o.userData.role;
      if (role === 'water') raster(o, g, 2, false);
      if (role === 'roadMajor' || role === 'roadMinor' || role === 'path') raster(o, road, 1, false);
    });
    for (let k = 0; k < g.length; k++) if (g[k] === 2 && road[k]) g[k] = 0;   // 다리
    this.map.model.traverse((o) => { if (o.isMesh && BLOCK_ROLES.has(o.userData.role)) raster(o, g, 1, true); });
    // 섬 바깥
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = i * CELL - R + 0.5, z = j * CELL - R + 0.5;
      if (x * x + z * z > (R - 6) * (R - 6)) g[j * N + i] = 1;
    }
    this.grid = g;
    this.road = road;
  }

  cellAt(x, z) {
    const i = Math.floor((x + R) / CELL), j = Math.floor((z + R) / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return 1;
    return this.grid[j * N + i];
  }
  blocked(x, z, r = BODY_R) {
    if (this.cellAt(x, z)) return true;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (this.cellAt(x + Math.cos(a) * r, z + Math.sin(a) * r)) return true;
    }
    return false;
  }
  freeNear(x, z, maxR = 60) {
    if (!this.blocked(x, z)) return new THREE.Vector3(x, 0, z);
    for (let r = 1; r < maxR; r += 1) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!this.blocked(px, pz) && this.road[Math.floor((pz + R) / CELL) * N + Math.floor((px + R) / CELL)]) return new THREE.Vector3(px, 0, pz);
      }
    }
    return new THREE.Vector3(x, 0, z);
  }

  spawn(at) {
    let p = at;
    if (!p) {
      const st = this.map.labelsAt?.station;
      p = new THREE.Vector3();
      if (st) st.getWorldPosition(p);
    }
    this.pos.copy(this.freeNear(p.x, p.z));
    this.vy = 0;
    // 가장 멀리 트인 방향(길 방향)을 바라보며 시작
    let best = this.yaw, bestD = -1;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      let d = 0;
      while (d < 120 && !this.cellAt(this.pos.x + Math.sin(a) * d, this.pos.z + Math.cos(a) * d)) d += 1;
      if (d > bestD) { bestD = d; best = a; }
    }
    this.yaw = this.camYaw = wrap(best);
  }

  /* ── 장소 빛기둥 · 길 안내 점 ───────────────────── */
  buildBeams() {
    this.beams = [];
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 160, 20, 1, true);
    geo.translate(0, 80, 0);
    for (const [id, p] of this.map.pins) {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uColor: { value: p.color.clone() }, uTime: { value: 0 }, uOn: { value: 0.6 } },
        vertexShader: 'varying float vY; void main(){ vY = position.y / 160.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uTime, uOn; varying float vY;
          void main(){ float a = (1.0 - vY) * (0.35 + 0.15 * sin(uTime * 3.0 - vY * 20.0)) * uOn; gl_FragColor = vec4(uColor * a, a); }`,
      });
      const beam = new THREE.Mesh(geo, m);
      beam.position.set(p.anchor.x, 0, p.anchor.z);
      beam.visible = false;
      beam.renderOrder = 5;
      this.map.scene.add(beam);
      this.beams.push({ id, beam });
    }
  }
  buildTrail() {
    const g = new THREE.CircleGeometry(0.55, 16);
    g.rotateX(-Math.PI / 2);
    this.trailMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
    this.trail = new THREE.InstancedMesh(g, this.trailMat, 900);
    this.trail.count = 0;
    this.trail.renderOrder = 6;
    this.trail.frustumCulled = false;
    this.map.scene.add(this.trail);
  }

  setTarget(id) {
    this.target = id;
    this.forceArrive = null;
    this.path = [];
    if (!id) { this.trail.count = 0; return; }
    const p = this.map.pins.get(id);
    if (!p) return;
    this.trailMat.color.copy(p.color).lerp(new THREE.Color('#ffffff'), 0.35);
    this.path = this.findPath(this.pos, this.freeNear(p.anchor.x, p.anchor.z, 80));
    this.drawTrail();
  }

  // 2m 격자 A* (8방향)
  findPath(a, b) {
    const S = 2;
    const M = Math.ceil((R * 2) / S);
    const free = (i, j) => {
      if (i < 0 || j < 0 || i >= M || j >= M) return false;
      const x = i * S - R + 1, z = j * S - R + 1;
      return !this.blocked(x, z, 0.9);
    };
    const toIJ = (p) => [clamp(Math.floor((p.x + R) / S), 0, M - 1), clamp(Math.floor((p.z + R) / S), 0, M - 1)];
    const [si, sj] = toIJ(a);
    const [ti, tj] = toIJ(b);
    const start = sj * M + si, goal = tj * M + ti;
    const gScore = new Float32Array(M * M).fill(Infinity);
    const came = new Int32Array(M * M).fill(-1);
    const closed = new Uint8Array(M * M);
    const heap = [];
    const push = (f, n) => { heap.push([f, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    gScore[start] = 0;
    push(h(si, sj), start);
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false, iter = 0;
    while (heap.length && iter++ < 400000) {
      const [, n] = pop();
      if (closed[n]) continue;
      if (n === goal) { found = true; break; }
      closed[n] = 1;
      const i = n % M, j = (n / M) | 0;
      for (const [di, dj, c] of D) {
        const ni = i + di, nj = j + dj;
        if (!free(ni, nj) || (di && dj && (!free(i + di, j) || !free(i, j + dj)))) continue;
        const k = nj * M + ni;
        // 도로 위를 더 좋아하게 (골목보다 길로 안내)
        const onRoad = this.road[Math.floor((nj * S - R + 1 + R) / CELL) * N + Math.floor((ni * S - R + 1 + R) / CELL)];
        const g = gScore[n] + c * (onRoad ? 1 : 1.6);
        if (g < gScore[k]) { gScore[k] = g; came[k] = n; push(g + h(ni, nj), k); }
      }
    }
    if (!found) return [];
    const pts = [];
    for (let n = goal; n !== -1; n = came[n]) pts.push(new THREE.Vector3((n % M) * S - R + 1, 0, ((n / M) | 0) * S - R + 1));
    pts.reverse();
    return pts;
  }
  drawTrail() {
    const m = new THREE.Matrix4();
    let c = 0;
    let acc = 0;
    for (let k = 1; k < this.path.length && c < 900; k++) {
      acc += this.path[k].distanceTo(this.path[k - 1]);
      if (acc >= 3) { acc = 0; m.makeTranslation(this.path[k].x, 0.45, this.path[k].z); this.trail.setMatrixAt(c++, m); }
    }
    this.trail.count = c;
    this.trail.instanceMatrix.needsUpdate = true;
  }

  /* ── 켜기 · 끄기 ─────────────────────────────────── */
  enter({ at, target } = {}) {
    if (at) this.spawn(at);
    this.active = true;
    this.blend = 0;
    this.model.visible = this.view === 'third';
    for (const b of this.beams) b.beam.visible = true;
    const map = this.map;
    map.controls.enabled = false;
    map.stopTour();
    map.tween = null;
    const sc = map.sun.shadow.camera;
    Object.assign(sc, { left: -110, right: 110, top: 110, bottom: -110 });
    sc.updateProjectionMatrix();
    for (const p of map.pins.values()) p.label.position.y = Math.max(10, p.anchor.y + 8);
    if (target) this.setTarget(target);
    this.fromPos = map.camera.position.clone();
    this.fromQuat = map.camera.quaternion.clone();
  }
  exit() {
    this.active = false;
    this.auto = false;
    this.model.visible = false;
    for (const b of this.beams) b.beam.visible = false;
    this.trail.count = 0;
    const map = this.map;
    map.controls.enabled = true;
    const sc = map.sun.shadow.camera;
    Object.assign(sc, { left: -640, right: 640, top: 640, bottom: -640 });
    sc.updateProjectionMatrix();
    map.sun.target.position.set(0, 0, 0);
    for (const p of map.pins.values()) { p.label.position.y = p.anchor.y + 24; p.el.classList.remove('far'); }
    if (map.fogBase) { map.scene.fog.near = map.fogBase.near; map.scene.fog.far = map.fogBase.far; }
    if (document.pointerLockElement) document.exitPointerLock();
    map.flyTo(this.pos, 260, 0.9);
  }
  setView(v) {
    this.view = v || (this.view === 'third' ? 'first' : 'third');
    this.model.visible = this.active && this.view === 'third';
    if (this.view === 'first') this.camYaw = this.yaw;
    return this.view;
  }

  /* ── 입력 ─────────────────────────────────────────── */
  setInput(x, z, run) { this.input.x = x; this.input.z = z; this.input.run = run; if (x || z) { this.auto = false; this.forceArrive = null; } }
  setJoy(x, y) { this.joy.x = x; this.joy.y = y; this.joy.t = performance.now(); if (x || y) this.auto = false; }
  turn(dYaw, dPitch = 0) {
    this.camYaw = wrap(this.camYaw + dYaw);
    this.camPitch = clamp(this.camPitch + dPitch, this.view === 'first' ? -1.1 : -0.15, this.view === 'first' ? 1.1 : 1.1);
  }
  jump() { if (this.pos.y <= 0.001) this.vy = 5.4; }
  toggleAuto() {
    if (!this.target) return false;
    this.auto = !this.auto;
    if (this.auto) this.setTarget(this.target);
    return this.auto;
  }

  /* ── 매 프레임 ───────────────────────────────────── */
  update(dt, time) {
    const map = this.map;
    // 입력 → 이동 방향
    const joyLive = performance.now() - this.joy.t < 400;
    let ix = this.input.x + (joyLive ? this.joy.x * 0.6 : 0);
    let iz = this.input.z + (joyLive ? this.joy.y : 0);
    if (joyLive && Math.abs(this.joy.x) > 0.3) this.turn(-this.joy.x * dt * 1.6);
    let spd = this.input.run ? RUN : WALK;
    let mx = 0, mz = 0;
    if (this.auto && this.path.length) {
      // 자동 걷기 — 가장 가까운 앞쪽 경로점을 따라감
      while (this.path.length > 1 && this.path[0].distanceTo(this.pos.clone().setY(0)) < 3) this.path.shift();
      const wp = this.path[Math.min(2, this.path.length - 1)];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5 && this.path.length <= 1) { this.auto = false; this.forceArrive = this.target; }
      else { mx = dx / d; mz = dz / d; spd = AUTO; this.camYaw = wrap(this.camYaw + wrap(Math.atan2(mx, mz) - this.camYaw) * Math.min(1, dt * 2.5)); }
    } else {
      const len = Math.hypot(ix, iz);
      if (len > 1) { ix /= len; iz /= len; }
      const s = Math.sin(this.camYaw), c = Math.cos(this.camYaw);
      mx = s * iz - c * ix;
      mz = c * iz + s * ix;
    }
    const want = Math.hypot(mx, mz) > 0.01 ? spd : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * 8);
    if (want > 0) {
      const face = Math.atan2(mx, mz);
      this.yaw = wrap(this.yaw + wrap(face - this.yaw) * Math.min(1, dt * 10));
      const k = Math.hypot(mx, mz) || 1;
      const dx = (mx / k) * this.speed * dt, dz = (mz / k) * this.speed * dt;
      if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
      if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    }
    if (this.view === 'first') this.yaw = this.camYaw;
    // 점프 · 중력
    this.vy -= 14 * dt;
    this.pos.y = Math.max(0, this.pos.y + this.vy * dt);
    if (this.pos.y === 0) this.vy = Math.max(0, this.vy);

    // 캐릭터 · 걷기 애니메이션
    const m = this.model;
    m.position.copy(this.pos);
    m.rotation.y = this.yaw;
    const moveK = clamp(this.speed / WALK, 0, 1.6);
    this.phase += dt * (2.2 + this.speed * 1.35);
    const sw = Math.sin(this.phase) * 0.75 * Math.min(1, moveK);
    const P = this.parts;
    if (P.HipL) P.HipL.rotation.x = sw;
    if (P.HipR) P.HipR.rotation.x = -sw;
    if (P.ShoulderL) P.ShoulderL.rotation.x = -sw * 0.8;
    if (P.ShoulderR) P.ShoulderR.rotation.x = sw * 0.8;
    if (P.Hips) {
      P.Hips.position.y = this.hipsY + Math.abs(Math.cos(this.phase)) * 0.05 * Math.min(1, moveK) + Math.sin(time * 2) * 0.006;
      P.Hips.rotation.y = Math.sin(this.phase) * 0.08 * Math.min(1, moveK);
      P.Hips.rotation.x = this.speed > WALK + 1 ? 0.12 : 0.03 * moveK;
    }
    if (P.HeadPivot) P.HeadPivot.rotation.y = clamp(wrap(this.camYaw - this.yaw), -0.6, 0.6) * 0.5;
    if (P.FootShadow) P.FootShadow.position.y = -this.pos.y + 0.02;

    // 카메라
    const cam = map.camera;
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 1.42, this.pos.z);
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    let camPos, lookAt;
    if (this.view === 'first') {
      camPos = head.clone().add(new THREE.Vector3(0, 0.1 + Math.abs(Math.cos(this.phase)) * 0.04 * Math.min(1, moveK), 0));
      lookAt = camPos.clone().add(new THREE.Vector3(dir.x, Math.sin(this.camPitch) * 1, dir.z));
    } else {
      let dist = 6.8;
      // 카메라가 건물 안에 들어가지 않게 당기기
      for (let d = 1; d <= dist; d += 0.5) {
        const x = head.x - dir.x * d, z = head.z - dir.z * d;
        if (this.cellAt(x, z) === 1) { dist = Math.max(1.4, d - 0.6); break; }
      }
      camPos = head.clone().sub(dir.clone().multiplyScalar(dist)).add(new THREE.Vector3(0, 0.4, 0));
      lookAt = head.clone().add(new THREE.Vector3(0, 0.1, 0));
    }
    const goalQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, lookAt, new THREE.Vector3(0, 1, 0)));
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 1.3);
      const k = 1 - Math.pow(1 - this.blend, 3);
      cam.position.lerpVectors(this.fromPos, camPos, k);
      cam.quaternion.slerpQuaternions(this.fromQuat, goalQ, k);
    } else {
      cam.position.lerp(camPos, this.view === 'first' ? 1 : Math.min(1, dt * 10));
      cam.quaternion.slerp(goalQ, this.view === 'first' ? 1 : Math.min(1, dt * 12));
    }
    map.controls.target.copy(this.pos);

    // 그림자 · 안개를 캐릭터 주변에 맞춤
    map.sun.target.position.copy(this.pos);
    map.sun.position.copy(this.pos).add(map.sunDir.clone().multiplyScalar(420));
    if (map.fogBase) { map.scene.fog.near = map.fogBase.near * 0.45; map.scene.fog.far = map.fogBase.far * 0.8; }

    for (const b of this.beams) {
      b.beam.material.uniforms.uTime.value = time;
      b.beam.material.uniforms.uOn.value = b.id === this.target ? 1.3 : (map.pinDim?.has(b.id) ? 0.12 : 0.55);
    }
    this.trailMat.opacity = 0.55 + Math.sin(time * 4) * 0.3;

    // 가장 가까운 공간 · 도착
    let near = null, nd = Infinity;
    for (const [id, p] of map.pins) {
      const d = Math.hypot(p.anchor.x - this.pos.x, p.anchor.z - this.pos.z);
      if (d < nd) { nd = d; near = id; }
      p.el.classList.toggle('far', d > 380);
    }
    this.nearest = { id: near, dist: nd };
    let arrived = nd < ARRIVE ? near : null;
    if (this.forceArrive) {
      const fp = map.pins.get(this.forceArrive);
      if (fp && Math.hypot(fp.anchor.x - this.pos.x, fp.anchor.z - this.pos.z) < 60) arrived = this.forceArrive; else this.forceArrive = null;
    }
    if (arrived !== this.arrived) { this.arrived = arrived; this.cb.onArrive?.(arrived); if (arrived === this.target && arrived) { this.auto = false; } }
    this.cb.onFrame?.(this);
  }

  bearingTo(id) {
    const p = this.map.pins.get(id);
    if (!p) return null;
    const dx = p.anchor.x - this.pos.x, dz = p.anchor.z - this.pos.z;
    return { rel: wrap(Math.atan2(dx, dz) - this.camYaw), dist: Math.hypot(dx, dz) };
  }

  // 미니맵 — 진행 방향이 위쪽
  drawMinimap(ctx, size) {
    const s = size / 2;
    const viewR = 170;
    const k = s / viewR;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(s, s, s - 2, 0, TAU); ctx.clip();
    ctx.fillStyle = 'rgba(20,16,40,.35)';
    ctx.fillRect(0, 0, size, size);
    ctx.translate(s, s);
    const th = -Math.PI / 2 - Math.atan2(Math.cos(this.camYaw), Math.sin(this.camYaw));
    ctx.rotate(th);
    if (this.minimap.complete && this.minimap.naturalWidth) {
      const img = this.minimap;
      const scale = (R * 2) / img.naturalWidth;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(img, (-R - this.pos.x) * k, (-R - this.pos.z) * k, img.naturalWidth * scale * k, img.naturalHeight * scale * k);
      ctx.globalAlpha = 1;
    }
    if (this.path.length) {
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
      ctx.beginPath();
      this.path.forEach((p, i) => { const x = (p.x - this.pos.x) * k, y = (p.z - this.pos.z) * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
    }
    for (const [id, p] of this.map.pins) {
      const x = (p.anchor.x - this.pos.x) * k, y = (p.anchor.z - this.pos.z) * k;
      const r = id === this.target ? 7 : 5;
      ctx.fillStyle = `#${p.color.getHexString()}`;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // 나 (가운데, 위쪽이 진행 방향)
    ctx.save();
    ctx.translate(s, s);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(20,16,40,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // 북쪽 표시
    const nx = s + Math.cos(th - Math.PI / 2) * (s - 12), ny = s + Math.sin(th - Math.PI / 2) * (s - 12);  // 북 = -Z
    ctx.fillStyle = '#ff6f91'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }
}
