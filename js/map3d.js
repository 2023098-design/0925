/* ────────────────────────────────────────────────────────────
   3D 지도 — Blender에서 만든 assets/map/sungshin_map.glb 를 three.js 로 띄웁니다.
   · 오브젝트 이름(Buildings, Road_Major, Pin_3, Anchor_3, Spot_3 …)으로 역할을 나눠
     지도 디자인 필터(js/filters.js)마다 재질 · 조명 · 후처리를 부드럽게 바꿉니다.
   · 키보드 / 마우스 / 손 제스처 / TouchDesigner 가 같은 카메라 함수를 씁니다.
   ──────────────────────────────────────────────────────────── */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FILTERS } from './filters.js';

const MAP_URL = './assets/map/sungshin_map.glb';
const RADIUS = 560;
const HOME = { target: new THREE.Vector3(-10, 0, 40), dist: 1320, phi: 0.9, theta: -0.3 };
const CAT_COLOR = { '스터디카페': '#7b61ff', '카페': '#ff6f91', '디저트카페': '#ffb347' };
const CAT_EMOJI = { '스터디카페': '📚', '카페': '☕', '디저트카페': '🍧' };

const ROLE_BY_NAME = [
  [/^Ground$/, 'ground'], [/^Base$/, 'base'], [/^Rim$/, 'rim'], [/^Campus$/, 'campus'], [/^Green$/, 'green'],
  [/^RiverBank$/, 'bank'], [/^Water$/, 'water'], [/^Road_Major$/, 'roadMajor'], [/^Road_Minor$/, 'roadMinor'],
  [/^Road_Path$/, 'path'], [/^Buildings_Warm$/, 'bldWarm'], [/^Buildings_Fill$/, 'bldFill'], [/^Buildings_Tall$/, 'bldTall'],
  [/^Buildings_Campus$/, 'bldCampus'], [/^Buildings$/, 'bld'], [/^Spot_\d+$/, 'spot'], [/^Trees$/, 'tree'], [/^Trunks$/, 'trunk'],
  [/^Pin_\d+$/, 'pin'], [/^Station_Entrances$/, 'station'],
];
const BUILDING_ROLES = new Set(['bld', 'bldWarm', 'bldFill', 'bldTall', 'bldCampus', 'spot']);
const RECEIVERS = new Set(['ground', 'campus', 'green', 'bank', 'water', 'roadMajor', 'roadMinor', 'path']);

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 필터 후처리 — 비네팅 · 필름 그레인 · 종이 질감 · 청사진 격자 · 색조
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.03 }, uVignette: { value: 0.2 }, uTint: { value: new THREE.Vector3(1, 1, 1) },
    uPaper: { value: 0 }, uGrid: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uPaper, uGrid; uniform vec2 uRes; uniform vec3 uTint;
    varying vec2 vUv;
    float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(rand(i),rand(i+vec2(1,0)),f.x), mix(rand(i+vec2(0,1)),rand(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 px = vUv * uRes;
      if (uPaper > 0.001) {
        float l = dot(c.rgb, vec3(.299,.587,.114));
        vec3 p = mix(c.rgb, vec3(l) * vec3(1.02, 1.0, .95), .45);
        float fib = noise(px / 2.5) * .6 + noise(px / 18.0) * .4;
        p *= 1.0 - .07 * fib;
        c.rgb = mix(c.rgb, p, uPaper);
      }
      if (uGrid > 0.001) {
        vec2 g = abs(fract(px / 48.0) - .5);
        float line = 1.0 - smoothstep(0.0, 0.012, min(g.x, g.y) - .488);
        vec2 g2 = abs(fract(px / 12.0) - .5);
        float fine = 1.0 - smoothstep(0.0, 0.04, min(g2.x, g2.y) - .46);
        c.rgb += uGrid * (line * .06 + fine * .018);
      }
      c.rgb *= uTint;
      float d = distance(vUv, vec2(.5));
      c.rgb *= 1.0 - uVignette * smoothstep(.25, .9, d);
      c.rgb += (rand(px + fract(uTime) * 91.7) - .5) * uGrain;
      gl_FragColor = c;
    }`,
};

export class Map3D {
  constructor(root, cb = {}) {
    this.root = root;
    this.cb = cb;
    this.active = false;
    this.selectedId = null;
    this.hoverId = null;
    this.filter = 0;
    this.pins = new Map();       // id → { mesh, label, anchor, ring, spot }
    this.mats = {};
    this.edges = [];
    this.tween = null;
    this.ftween = null;
    this.clock = new THREE.Clock();
    this.lastInput = performance.now();
    this.touring = false;
    this.uniforms = {
      uThermal: { value: 0 }, uClay: { value: 0 }, uTime: { value: 0 },
      uSpots: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 60)) },
    };
  }

  /* ── 준비 ─────────────────────────────────────────── */
  async init(places, geo, stats, filterIndex = 0) {
    this.places = places;
    this.geo = geo;
    this.stats = stats;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.root.prepend(r.domElement);
    r.domElement.setAttribute('aria-label', '성신여대 주변 3D 지도. 방향키로 이동, Tab 으로 공간 선택');
    r.domElement.tabIndex = 0;

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'labels';
    this.root.insertBefore(this.labelRenderer.domElement, this.root.querySelector('.map-ui'));

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(38, 1, 2, 9000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false, minDistance: 70, maxDistance: 2100,
      maxPolarAngle: 1.32, minPolarAngle: 0.12, zoomSpeed: 0.9, rotateSpeed: 0.55, panSpeed: 0.9,
    });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener('start', () => { this.tween = null; this.touched(); });
    this.setHome(true);

    // 하늘 · 안개 · 조명
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2; this.skyCanvas.height = 512;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = this.skyTex;
    scene.fog = new THREE.Fog('#ffffff', 900, 3200);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#cccccc', 1.2);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    Object.assign(sc, { left: -640, right: 640, top: 640, bottom: -640, near: 10, far: 2600 });
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    // 후처리
    const size = new THREE.Vector2();
    r.getSize(size);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    await this.loadModel();
    this.buildPins();
    this.buildDust();
    this.updateData(places, geo, stats);
    this.setFilter(filterIndex, false);
    this.bindPointer();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  loadModel() {
    const draco = new DRACOLoader();
    draco.setDecoderPath('./js/vendor/three/examples/jsm/libs/draco/gltf/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    return new Promise((resolve, reject) => {
      loader.load(MAP_URL, (gltf) => {
        this.cb.onProgress?.(0.92, '재질과 조명을 입히는 중…');
        this.model = gltf.scene;
        this.scene.add(gltf.scene);
        this.anchors = {};
        this.labelsAt = {};
        const pinMeshes = [];
        gltf.scene.traverse((o) => {
          if (o.name.startsWith('Anchor_')) this.anchors[+o.name.slice(7)] = o;
          if (o.name.startsWith('Label_')) this.labelsAt[o.name.slice(6)] = o;
          if (!o.isMesh) return;
          const role = ROLE_BY_NAME.find(([re]) => re.test(o.name))?.[1];
          if (!role) return;
          o.userData.role = role;
          if (role === 'pin') { pinMeshes.push(o); return; }
          o.material = this.materialFor(role, o);
          o.castShadow = BUILDING_ROLES.has(role) || role === 'tree' || role === 'trunk' || role === 'station';
          o.receiveShadow = RECEIVERS.has(role) || BUILDING_ROLES.has(role);
          if (BUILDING_ROLES.has(role)) {
            const eg = new THREE.EdgesGeometry(o.geometry, 28);
            const line = new THREE.LineSegments(eg, this.edgeMat || (this.edgeMat = new THREE.LineBasicMaterial({ color: '#000', transparent: true, opacity: 0, depthWrite: false })));
            line.visible = false;
            line.renderOrder = 2;
            o.add(line);
            this.edges.push(line);
          }
          if (role === 'spot') o.userData.pid = +o.name.slice(5);
        });
        this.pinMeshes = pinMeshes;
        resolve();
      }, (xhr) => {
        if (xhr.total) this.cb.onProgress?.(0.1 + 0.8 * (xhr.loaded / xhr.total), `지도 데이터 ${Math.round(xhr.loaded / 1024)}KB 받는 중…`);
      }, reject);
    });
  }

  materialFor(role, mesh) {
    // 원래 색상 속성(COLOR_0)은 블렌더에서 건물마다 넣은 무작위값 → 'bid' 로 옮겨 클레이 필터 색 고르기에 씁니다
    const col = mesh.geometry.getAttribute('color');
    if (col) { mesh.geometry.setAttribute('bid', col); mesh.geometry.deleteAttribute('color'); }
    if (this.mats[role] && role !== 'spot') return this.mats[role];
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: role === 'water' ? 0.18 : 0.86, metalness: role === 'water' ? 0.15 : 0 });
    if (role === 'water') { m.transparent = true; m.opacity = 0.92; }
    if (BUILDING_ROLES.has(role) || role === 'ground' || RECEIVERS.has(role)) this.patch(m, BUILDING_ROLES.has(role) ? 1 : 0);
    if (role === 'spot') { m.emissive = new THREE.Color('#ff6f91'); m.emissiveIntensity = 0.25; this.mats[`spot_${mesh.name}`] = m; return m; }
    this.mats[role] = m;
    return m;
  }

  // 공부 히트맵 · 클레이 필터 셰이더 주입
  patch(mat, isBld) {
    const U = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.uniforms.uIsBld = { value: isBld };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 bid;\nvarying vec3 vWPos;\nvarying float vBid;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBid = bid.r;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uThermal, uClay, uTime, uIsBld; uniform vec4 uSpots[12];
          varying vec3 vWPos; varying float vBid;
          vec3 heatRamp(float t){
            t = clamp(t, 0., 1.);
            vec3 a = vec3(.06,.03,.25), b = vec3(.45,.05,.62), c = vec3(.95,.2,.3), d = vec3(1.,.62,.08), e = vec3(1.,.97,.75);
            if (t < .25) return mix(a, b, t / .25);
            if (t < .5) return mix(b, c, (t - .25) / .25);
            if (t < .75) return mix(c, d, (t - .5) / .25);
            return mix(d, e, (t - .75) / .25);
          }
          vec3 clayPal(float h){
            h = fract(h * 7.31);
            if (h < .16) return vec3(1.,.55,.6);
            if (h < .32) return vec3(.55,.75,1.);
            if (h < .48) return vec3(1.,.82,.45);
            if (h < .64) return vec3(.6,.9,.7);
            if (h < .8) return vec3(.78,.66,1.);
            return vec3(1.,1.,.98);
          }`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( diffuse, opacity );
          float heat = 0.;
          for (int i = 0; i < 12; i++) { vec2 dd = vWPos.xz - uSpots[i].xy; heat += uSpots[i].z * exp(-dot(dd, dd) / (2. * uSpots[i].w * uSpots[i].w)); }
          heat = clamp(heat * (.85 + .15 * sin(uTime * 1.6 + vWPos.x * .01)), 0., 1.);
          vec3 thermalCol = heatRamp(heat * .92 + uIsBld * clamp(vWPos.y, 0., 60.) * .002);
          diffuseColor.rgb = mix(diffuseColor.rgb, thermalCol, uThermal);
          diffuseColor.rgb = mix(diffuseColor.rgb, clayPal(vBid + .13), uClay * uIsBld);`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += thermalCol * uThermal * (.28 + .5 * heat);');
    };
    mat.customProgramCacheKey = () => `gbk-${isBld}`;
  }

  /* ── 핀 · 라벨 · 링 ──────────────────────────────── */
  buildPins() {
    const ringGeo = new THREE.RingGeometry(9, 12, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (const p of this.places) {
      const anchor = this.anchors[p.id];
      if (!anchor) continue;
      const pos = new THREE.Vector3();
      anchor.getWorldPosition(pos);
      const mesh = this.pinMeshes.find((m) => m.name === `Pin_${p.id}`);
      const color = new THREE.Color(CAT_COLOR[p.category] || '#8888aa');
      if (mesh) {
        mesh.material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.1 });
        mesh.castShadow = true;
        mesh.userData.pid = p.id;
        mesh.userData.baseY = mesh.position.y;
        mesh.scale.setScalar(1.4);
      }
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(pos.x, 0.6, pos.z);
      ring.renderOrder = 3;
      this.scene.add(ring);

      const el = document.createElement('div');
      el.className = 'pin-label';
      el.style.setProperty('--c', CAT_COLOR[p.category] || '#8888aa');
      el.dataset.id = p.id;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onSelect?.(p.id); });
      el.addEventListener('pointerenter', () => this.setHover(p.id));
      el.addEventListener('pointerleave', () => this.setHover(null));
      const label = new CSS2DObject(el);
      label.position.set(pos.x, pos.y + 24, pos.z);
      this.scene.add(label);
      const spot = this.model.getObjectByName(`Spot_${p.id}`);
      if (spot) spot.material.emissive.copy(color);
      this.pins.set(p.id, { mesh, label, el, anchor: pos, ring, spot, color });
    }
    const LM = { station: '🚇 성신여대입구역', campus: '🎓 성신여대 수정캠퍼스', stream: '🌊 성북천' };
    for (const [k, o] of Object.entries(this.labelsAt)) {
      const el = document.createElement('div');
      el.className = 'lm-label';
      el.textContent = LM[k] || k;
      (this.lmEls || (this.lmEls = [])).push(el);
      const l = new CSS2DObject(el);
      const pos = new THREE.Vector3();
      o.getWorldPosition(pos);
      l.position.copy(pos).add(new THREE.Vector3(0, 8, 0));
      this.scene.add(l);
    }
  }

  buildDust() {
    const n = 700;
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * RADIUS;
      const t = Math.random() * Math.PI * 2;
      a[i * 3] = Math.cos(t) * r; a[i * 3 + 1] = Math.random() * 180; a[i * 3 + 2] = Math.sin(t) * r;
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.4, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
    this.scene.add(this.dust);
  }

  updateData(places, geo, stats) {
    this.places = places; this.geo = geo; this.stats = stats;
    if (!this.pins.size) return;
    let i = 0;
    for (const p of places) {
      const pin = this.pins.get(p.id);
      if (!pin) continue;
      const s = stats.get(p.id) || { avg: null, count: 0 };
      pin.el.innerHTML = `<i>${CAT_EMOJI[p.category] || '📍'}</i>${p.name.length > 12 ? `${p.name.slice(0, 12)}…` : p.name} <small>${s.avg === null ? '리뷰 없음' : `<b>★</b>${s.avg.toFixed(1)}`}</small>`;
      pin.el.title = p.name;
      if (i < 12) {
        const w = s.avg === null ? 0.18 : 0.15 + ((s.avg - 1) / 4) * 0.75;
        this.uniforms.uSpots.value[i].set(pin.anchor.x, pin.anchor.z, w, 55 + Math.min(s.count, 5) * 6);
      }
      i++;
    }
  }

  /* ── 필터 ─────────────────────────────────────────── */
  setFilter(index, animate = true) {
    this.filter = index;
    const f = FILTERS[index].scene;
    const from = this.snapshot();
    const to = this.targetOf(f);
    if (!animate) { this.applyMix(from, to, 1); return; }
    this.ftween = { from, to, t0: performance.now(), dur: 900 };
  }

  snapshot() {
    const s = { colors: {}, emis: {} };
    for (const [k, m] of Object.entries(this.mats)) { s.colors[k] = m.color.clone(); s.emis[k] = m.emissive.clone(); }
    s.sky0 = this.sky0?.clone() || new THREE.Color('#fff');
    s.sky1 = this.sky1?.clone() || new THREE.Color('#fff');
    s.fog = this.scene.fog.color.clone(); s.fogNear = this.scene.fog.near; s.fogFar = this.scene.fog.far;
    s.hemiSky = this.hemi.color.clone(); s.hemiGround = this.hemi.groundColor.clone(); s.hemiI = this.hemi.intensity;
    s.sunC = this.sun.color.clone(); s.sunI = this.sun.intensity; s.sunDir = this.sunDir?.clone() || new THREE.Vector3(0.5, 0.8, 0.3);
    s.edge = this.edgeMat ? this.edgeMat.opacity : 0; s.edgeC = this.edgeMat ? this.edgeMat.color.clone() : new THREE.Color();
    s.bloom = this.bloom.strength;
    s.grain = this.grade.uniforms.uGrain.value; s.vig = this.grade.uniforms.uVignette.value;
    s.tint = this.grade.uniforms.uTint.value.clone(); s.paper = this.grade.uniforms.uPaper.value; s.grid = this.grade.uniforms.uGrid.value;
    s.thermal = this.uniforms.uThermal.value; s.clay = this.uniforms.uClay.value;
    s.dust = this.dust ? this.dust.material.opacity : 0;
    s.exposure = this.renderer.toneMappingExposure;
    return s;
  }

  targetOf(f) {
    const C = (c) => new THREE.Color(c);
    const t = { colors: {}, emis: {} };
    const map = { ground: f.ground, base: f.base, rim: f.rim, campus: f.campus, green: f.green, bank: f.bank, water: f.water,
      roadMajor: f.roadMajor, roadMinor: f.roadMinor, path: f.path, bld: f.bld, bldWarm: f.bldWarm, bldFill: f.bldFill,
      bldTall: f.bldTall, bldCampus: f.bldCampus, tree: f.tree, trunk: f.trunk, station: f.station };
    for (const k of Object.keys(this.mats)) {
      if (k.startsWith('spot_')) {
        const id = +k.split('_').pop();
        const pin = this.pins.get(id);
        t.colors[k] = pin ? pin.color.clone().lerp(C(f.bld), f.emissive ? 0.55 : 0.12) : C('#ff6f91');
        t.emis[k] = pin ? pin.color.clone().multiplyScalar(f.emissive ? 0.9 : 0.25) : C('#000');
        continue;
      }
      t.colors[k] = C(map[k] || '#ffffff');
      const glow = f.emissive && ['roadMajor', 'path', 'water', 'rim', 'station', 'tree'].includes(k) ? 0.85 : (k === 'station' ? 0.4 : 0);
      t.emis[k] = C(map[k] || '#000').multiplyScalar(glow);
    }
    t.sky0 = C(f.sky[0]); t.sky1 = C(f.sky[1]);
    t.fog = C(f.fog); t.fogNear = f.fogNear; t.fogFar = f.fogFar;
    t.hemiSky = C(f.hemi[0]); t.hemiGround = C(f.hemi[1]); t.hemiI = f.hemi[2];
    t.sunC = C(f.sun[0]); t.sunI = f.sun[1]; t.sunDir = new THREE.Vector3(...f.sun[2]).normalize();
    t.edge = f.edges; t.edgeC = C(f.edgeColor);
    t.bloom = f.bloom; t.grain = f.grain; t.vig = f.vignette; t.tint = new THREE.Vector3(...f.tint);
    t.paper = f.paper || 0; t.grid = f.grid || 0;
    t.thermal = f.mode === 1 ? 1 : 0; t.clay = f.mode === 2 ? 1 : 0;
    t.dust = f.emissive || f.mode === 1 ? 0.8 : (f.key === 'golden' ? 0.35 : 0.0);
    t.exposure = f.exposure || 1;
    return t;
  }

  applyMix(a, b, k) {
    const L = (x, y) => x + (y - x) * k;
    for (const [key, m] of Object.entries(this.mats)) {
      if (b.colors[key]) m.color.copy(a.colors[key] || b.colors[key]).lerp(b.colors[key], k);
      if (b.emis[key]) m.emissive.copy(a.emis[key] || b.emis[key]).lerp(b.emis[key], k);
    }
    this.sky0 = a.sky0.clone().lerp(b.sky0, k);
    this.sky1 = a.sky1.clone().lerp(b.sky1, k);
    this.paintSky();
    this.scene.fog.color.copy(a.fog).lerp(b.fog, k);
    this.scene.fog.near = L(a.fogNear, b.fogNear);
    this.scene.fog.far = L(a.fogFar, b.fogFar);
    this.hemi.color.copy(a.hemiSky).lerp(b.hemiSky, k);
    this.hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, k);
    this.hemi.intensity = L(a.hemiI, b.hemiI);
    this.sun.color.copy(a.sunC).lerp(b.sunC, k);
    this.sun.intensity = L(a.sunI, b.sunI);
    this.sunDir = a.sunDir.clone().lerp(b.sunDir, k).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(1400);
    if (this.edgeMat) {
      this.edgeMat.opacity = L(a.edge, b.edge);
      this.edgeMat.color.copy(a.edgeC).lerp(b.edgeC, k);
      const vis = this.edgeMat.opacity > 0.01;
      for (const e of this.edges) e.visible = vis;
    }
    this.bloom.strength = L(a.bloom, b.bloom);
    this.bloom.enabled = this.bloom.strength > 0.01;
    const g = this.grade.uniforms;
    g.uGrain.value = L(a.grain, b.grain);
    g.uVignette.value = L(a.vig, b.vig);
    g.uTint.value.copy(a.tint).lerp(b.tint, k);
    g.uPaper.value = L(a.paper, b.paper);
    g.uGrid.value = L(a.grid, b.grid);
    this.uniforms.uThermal.value = L(a.thermal, b.thermal);
    this.uniforms.uClay.value = L(a.clay, b.clay);
    if (this.dust) this.dust.material.opacity = L(a.dust, b.dust);
    this.renderer.toneMappingExposure = L(a.exposure, b.exposure);
    for (const pin of this.pins.values()) {
      if (pin.mesh) pin.mesh.material.emissiveIntensity = 0.35 + (b.bloom || 0) * 0.6;
    }
  }

  paintSky() {
    const ctx = this.skyCanvas.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, `#${this.sky1.getHexString()}`);
    gr.addColorStop(1, `#${this.sky0.getHexString()}`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 2, 512);
    this.skyTex.needsUpdate = true;
  }

  /* ── 선택 · 호버 ─────────────────────────────────── */
  select(id, fly = true) {
    this.selectedId = id;
    for (const [pid, p] of this.pins) {
      p.el.classList.toggle('sel', pid === id);
      if (p.spot) p.spot.material.emissiveIntensity = pid === id ? 0.9 : 0.25;
    }
    const pin = this.pins.get(id);
    if (pin && fly) this.flyTo(pin.anchor, 300, 0.95);
  }
  clearSelection() {
    this.selectedId = null;
    for (const p of this.pins.values()) { p.el.classList.remove('sel'); if (p.spot) p.spot.material.emissiveIntensity = 0.25; }
  }
  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    for (const [pid, p] of this.pins) p.el.classList.toggle('hover', pid === id);
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
    this.cb.onHover?.(id);
  }
  setDim(ids) {
    const set = ids ? new Set(ids) : null;
    for (const [pid, p] of this.pins) {
      const dim = set && !set.has(pid);
      p.el.classList.toggle('dim', !!dim);
      if (p.mesh) p.mesh.visible = !dim;
      p.ring.visible = !dim;
    }
  }
  next(dir = 1) {
    const ids = [...this.pins.keys()].sort((a, b) => a - b);
    if (!ids.length) return null;
    const i = ids.indexOf(this.selectedId);
    const id = ids[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + ids.length) % ids.length];
    this.select(id, true);
    return id;
  }

  pick(x, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const rc = this.raycaster || (this.raycaster = new THREE.Raycaster());
    rc.setFromCamera(ndc, this.camera);
    const targets = [...this.pinMeshes, ...[...this.pins.values()].map((p) => p.spot).filter(Boolean)];
    const hit = rc.intersectObjects(targets, false)[0];
    return hit ? hit.object.userData.pid : null;
  }
  hoverAt(x, y) { this.setHover(this.pick(x, y)); }
  clickAt(x, y) {
    const id = this.pick(x, y);
    this.touched();
    if (id) this.cb.onSelect?.(id);
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; this.touched(); this.stopTour(); });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && !down) { if (!this.pmT) { this.pmT = true; requestAnimationFrame(() => { this.pmT = false; this.hoverAt(e.clientX, e.clientY); }); } }
    });
    el.addEventListener('pointerup', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) {
        const id = this.pick(e.clientX, e.clientY);
        this.cb.onSelect?.(id || null);
      }
      down = null;
    });
  }

  /* ── 카메라 조작 (키보드 · 제스처 · TD 공통) ───────── */
  touched() { this.lastInput = performance.now(); this.controls.autoRotate = false; }
  setHome(instant) {
    const off = new THREE.Vector3().setFromSphericalCoords(HOME.dist, HOME.phi, HOME.theta);
    if (instant) { this.controls.target.copy(HOME.target); this.camera.position.copy(HOME.target).add(off); this.controls.update(); return; }
    this.tween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: HOME.target.clone().add(off), t1: HOME.target.clone(), s: performance.now(), dur: 1400 };
  }
  reset() { this.touched(); this.setHome(false); }
  flyTo(pos, dist = 300, phi = 0.95) {
    const cur = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    const t1 = new THREE.Vector3(pos.x, Math.max(0, pos.y * 0.5), pos.z);
    const off = new THREE.Vector3().setFromSphericalCoords(dist, phi, cur.theta);
    this.tween = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: t1.clone().add(off), t1, s: performance.now(), dur: 1500 };
    this.touched();
  }
  orbit(dTheta, dPhi, zoom = 1) {
    this.tween = null;
    const t = this.controls.target;
    const off = this.camera.position.clone().sub(t);
    const s = new THREE.Spherical().setFromVector3(off);
    s.theta += dTheta;
    s.phi = clamp(s.phi + dPhi, this.controls.minPolarAngle, this.controls.maxPolarAngle);
    s.radius = clamp(s.radius * zoom, this.controls.minDistance, this.controls.maxDistance);
    off.setFromSpherical(s);
    this.camera.position.copy(t).add(off);
    this.touched();
  }
  pan(right, forward) {
    this.tween = null;
    const t = this.controls.target;
    const fwd = t.clone().sub(this.camera.position); fwd.y = 0; fwd.normalize();
    const rgt = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const move = rgt.multiplyScalar(right).add(fwd.multiplyScalar(forward));
    t.add(move); this.camera.position.add(move);
    const len = Math.hypot(t.x, t.z);
    if (len > RADIUS - 40) { const k = (RADIUS - 40) / len; const d = new THREE.Vector3(t.x * k - t.x, 0, t.z * k - t.z); t.add(d); this.camera.position.add(d); }
    this.touched();
  }
  dist() { return this.camera.position.distanceTo(this.controls.target); }
  keyMove(px, pz, rot, zoom, tilt) {
    const sp = this.dist() * 0.012;
    if (px || pz) this.pan(px * sp, -pz * sp);
    if (rot || zoom !== 1 || tilt) this.orbit(rot, tilt, zoom);
  }
  panScreen(dx, dy) { const d = this.dist() * 1.15; this.pan(-dx * d, dy * d); }
  rotateBy(dTheta, dPhi) { this.orbit(-dTheta, -dPhi * 0.8); }
  zoomBy(scale) { this.orbit(0, 0, scale); }

  toggleTour(onStop) {
    if (this.touring) { this.stopTour(); return false; }
    this.touring = true;
    this.tourCb = onStop;
    const step = () => {
      if (!this.touring) return;
      const id = this.next(1);
      this.tourCb?.(id);
      this.tourT = setTimeout(step, 6500);
    };
    step();
    return true;
  }
  stopTour() { this.touring = false; clearTimeout(this.tourT); }

  setActive(on) {
    this.active = on;
    if (on) { this.resize(); this.touched(); }
  }
  resize() {
    const w = this.root.clientWidth || innerWidth;
    const h = this.root.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.labelRenderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.grade.uniforms.uRes.value.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ── 매 프레임 ───────────────────────────────────── */
  frame() {
    if (!this.active) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.elapsedTime;
    const now = performance.now();
    if (this.ftween) {
      const k = clamp((now - this.ftween.t0) / this.ftween.dur, 0, 1);
      this.applyMix(this.ftween.from, this.ftween.to, ease(k));
      if (k >= 1) this.ftween = null;
    }
    if (this.tween) {
      const k = ease(clamp((now - this.tween.s) / this.tween.dur, 0, 1));
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, k);
      this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, k);
      if (k >= 1) this.tween = null;
    }
    // 오래 가만히 있으면 천천히 한 바퀴 (머물면서 구경하기)
    if (!this.tween && !this.touring && now - this.lastInput > 20000) { this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.35; }
    if (this.touring && !this.tween) { this.orbit(dt * 0.12, 0); this.lastInput = now - 1000; }
    this.controls.update();
    this.uniforms.uTime.value = time;
    this.grade.uniforms.uTime.value = time;
    for (const [pid, p] of this.pins) {
      if (p.mesh) {
        const sel = pid === this.selectedId || pid === this.hoverId;
        p.mesh.position.y = p.mesh.userData.baseY + Math.sin(time * 2 + pid) * 1.6 + (sel ? 4 : 0);
        p.mesh.rotation.y += dt * (sel ? 2.4 : 0.6);
        const sc = sel ? 2.1 : 1.4;
        p.mesh.scale.lerp(new THREE.Vector3(sc, sc, sc), 0.15);
      }
      const ph = (time * 0.6 + pid * 0.37) % 1;
      const rs = 1 + ph * (pid === this.selectedId ? 3.2 : 1.8);
      p.ring.scale.set(rs, 1, rs);
      p.ring.material.opacity = (1 - ph) * (pid === this.selectedId ? 0.8 : 0.45);
    }
    if (this.dust && this.dust.material.opacity > 0.01) {
      const a = this.dust.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (4 + (i % 7)); if (y > 200) y = 0; a.setY(i, y); }
      a.needsUpdate = true;
    }
    this.composer.render(dt);
    this.labelRenderer.render(this.scene, this.camera);
    if (now - (this.lastDeclutter || 0) > 120) { this.lastDeclutter = now; this.declutter(); }
  }

  // 라벨이 겹치면 우선순위(선택 > 호버 > 평점)가 낮은 쪽을 아이콘만 남깁니다
  declutter() {
    const items = [...this.pins.entries()].map(([id, p]) => {
      const s = this.stats?.get(id);
      const pri = (id === this.selectedId ? 100 : 0) + (id === this.hoverId ? 50 : 0) + (s?.avg ?? 0);
      return { id, p, pri };
    }).sort((a, b) => b.pri - a.pri);
    const placed = [];
    for (const it of items) {
      const el = it.p.el;
      el.classList.remove('mini');
      const r = el.getBoundingClientRect();
      const hit = placed.some((q) => r.left < q.right + 4 && r.right > q.left - 4 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
      if (hit) {
        el.classList.add('mini');
        const r2 = el.getBoundingClientRect();
        placed.push(r2);
      } else placed.push(r);
    }
    for (const el of this.lmEls || []) {
      const r = el.getBoundingClientRect();
      el.style.opacity = placed.some((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) ? '0' : '1';
    }
  }
}
