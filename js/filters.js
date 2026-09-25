// 지도 디자인 필터 — 손바닥 스와이프(카메라) · F 키 · 터치디자이너 신호로 순환합니다.
// web: 일반 웹 화면의 CSS 변수 / scene: 3D 지도의 재질·조명·후처리 값
export const FILTERS = [
  {
    key: 'pastel', name: '파스텔 데이', emoji: '🌸',
    web: { bg: '#fbf7fb', bg2: '#f1ecff', surface: '#ffffff', ink: '#1f1b2e', muted: '#6f6a80', line: '#ece6f2', accent: '#7b61ff', accent2: '#ff6f91', glow: 'rgba(123,97,255,.18)' },
    scene: {
      sky: ['#fde8ef', '#e6e1ff'], fog: '#f3e9f6', fogNear: 900, fogFar: 3200,
      hemi: ['#ffffff', '#e8def0', 1.7], sun: ['#fff6ee', 2.4, [0.5, 0.62, 0.6]], exposure: 1.0,
      ground: '#ece4dc', base: '#3b3552', rim: '#f6b9c9', campus: '#e7ddf3', green: '#cfe6c4', bank: '#bfe0b3',
      water: '#8fc9e8', roadMajor: '#ffffff', roadMinor: '#fbf7f2', path: '#f4d6de',
      bld: '#fbfaf8', bldWarm: '#f7e8df', bldFill: '#f2eff7', bldTall: '#dcd6ee', bldCampus: '#cbb8e8',
      tree: '#8cc48a', trunk: '#a47e62', station: '#4aa3ff',
      edges: 0, edgeColor: '#9b8fb8', bloom: 0, grain: 0.035, vignette: 0.22, tint: [1, 1, 1], mode: 0, emissive: 0,
    },
  },
  {
    key: 'neon', name: '미드나잇 네온', emoji: '🌃',
    web: { bg: '#0c0b1d', bg2: '#16133a', surface: '#15132c', ink: '#f3f0ff', muted: '#a49fc4', line: '#2a2650', accent: '#22e6ff', accent2: '#ff3cac', glow: 'rgba(34,230,255,.25)' },
    scene: {
      sky: ['#0b0820', '#1b0f3a'], fog: '#0d0a24', fogNear: 700, fogFar: 2600,
      hemi: ['#5a4bff', '#0a0716', 0.55], sun: ['#8fa0ff', 0.7, [0.3, 0.9, 0.2]], exposure: 1.1,
      ground: '#0f0d24', base: '#07061a', rim: '#ff3cac', campus: '#1a1540', green: '#0f2a2a', bank: '#0f2a2a',
      water: '#1a6dff', roadMajor: '#ff3cac', roadMinor: '#3a2f7a', path: '#22e6ff',
      bld: '#161433', bldWarm: '#1a1638', bldFill: '#14122c', bldTall: '#1e1a44', bldCampus: '#2b1f5c',
      tree: '#1ec9a0', trunk: '#20304a', station: '#22e6ff',
      edges: 0.9, edgeColor: '#22e6ff', bloom: 1.05, grain: 0.05, vignette: 0.45, tint: [1, 1, 1.05], mode: 0, emissive: 1,
    },
  },
  {
    key: 'blueprint', name: '블루프린트', emoji: '📐',
    web: { bg: '#0f3a66', bg2: '#123f70', surface: '#12467a', ink: '#eef6ff', muted: '#a9c6e6', line: '#2c6aa6', accent: '#ffffff', accent2: '#ffd166', glow: 'rgba(255,255,255,.2)' },
    scene: {
      sky: ['#0f3a66', '#0b2f55'], fog: '#0f3a66', fogNear: 1000, fogFar: 3400,
      hemi: ['#cfe6ff', '#0b2f55', 1.2], sun: ['#ffffff', 0.9, [0.3, 1, 0.1]], exposure: 1.0,
      ground: '#10426f', base: '#0a2a4a', rim: '#ffffff', campus: '#13507f', green: '#155a7a', bank: '#155a7a',
      water: '#1d6aa8', roadMajor: '#2b78b8', roadMinor: '#1c5d93', path: '#1a578a',
      bld: '#1a5a92', bldWarm: '#1a5a92', bldFill: '#17518a', bldTall: '#1f64a0', bldCampus: '#2470ad',
      tree: '#2a86b8', trunk: '#1a5a92', station: '#ffd166',
      edges: 1, edgeColor: '#e8f4ff', bloom: 0.15, grain: 0.05, vignette: 0.3, tint: [1, 1, 1], mode: 0, emissive: 0, grid: 1,
    },
  },
  {
    key: 'paper', name: '페이퍼 스케치', emoji: '✏️',
    web: { bg: '#f5f0e6', bg2: '#efe7d7', surface: '#fffdf8', ink: '#2b2a28', muted: '#7a746a', line: '#e3d9c6', accent: '#2b2a28', accent2: '#e2583e', glow: 'rgba(43,42,40,.12)' },
    scene: {
      sky: ['#f7f2e8', '#efe6d4'], fog: '#f3ecdf', fogNear: 1000, fogFar: 3400,
      hemi: ['#fffaf0', '#d9ccb4', 1.5], sun: ['#fffaf0', 1.6, [0.4, 0.85, 0.5]], exposure: 1.0,
      ground: '#f4ede0', base: '#3a352e', rim: '#e2583e', campus: '#ebe1cf', green: '#dfe3c6', bank: '#dfe3c6',
      water: '#c9dbe0', roadMajor: '#fffdf8', roadMinor: '#faf6ee', path: '#f1e3d4',
      bld: '#fffdf8', bldWarm: '#fbf6ec', bldFill: '#faf5ea', bldTall: '#f4efe4', bldCampus: '#efe4d6',
      tree: '#b9c79a', trunk: '#9b8a70', station: '#e2583e',
      edges: 1, edgeColor: '#2b2a28', bloom: 0, grain: 0.09, vignette: 0.28, tint: [1.02, 1, 0.96], mode: 0, emissive: 0, paper: 1,
    },
  },
  {
    key: 'golden', name: '골든아워', emoji: '🌇',
    web: { bg: '#fff5ec', bg2: '#ffe3d1', surface: '#ffffff', ink: '#3a1f1a', muted: '#8a655a', line: '#f6dccb', accent: '#ff7a45', accent2: '#c2417a', glow: 'rgba(255,122,69,.2)' },
    scene: {
      sky: ['#ffb07a', '#ff8fa3'], fog: '#ffc3a0', fogNear: 700, fogFar: 2800,
      hemi: ['#ffd9b8', '#6a3b5a', 0.9], sun: ['#ffb36b', 3.4, [0.85, 0.32, 0.25]], exposure: 1.05,
      ground: '#f6dcc6', base: '#4a2a3a', rim: '#ff7a45', campus: '#f2d0c8', green: '#d6d59a', bank: '#cfd08e',
      water: '#7fb0d6', roadMajor: '#fff0e2', roadMinor: '#fbe6d4', path: '#f7c9b8',
      bld: '#fff0e0', bldWarm: '#ffe2cc', bldFill: '#ffe9d8', bldTall: '#f6d2c4', bldCampus: '#f0bfc4',
      tree: '#a7b85a', trunk: '#8a5a3a', station: '#ff7a45',
      edges: 0, edgeColor: '#8a5a3a', bloom: 0.35, grain: 0.04, vignette: 0.35, tint: [1.04, 0.98, 0.94], mode: 0, emissive: 0,
    },
  },
  {
    key: 'thermal', name: '공부 히트맵', emoji: '🔥',
    web: { bg: '#0b0a18', bg2: '#1a0f24', surface: '#161226', ink: '#fff3ec', muted: '#b9a7b3', line: '#2d2238', accent: '#ffb000', accent2: '#ff3d5a', glow: 'rgba(255,176,0,.22)' },
    scene: {
      sky: ['#0a0816', '#1a0b20'], fog: '#0c0918', fogNear: 800, fogFar: 2800,
      hemi: ['#ffffff', '#1a1020', 1.0], sun: ['#ffffff', 0.8, [0.4, 0.9, 0.3]], exposure: 1.0,
      ground: '#120d24', base: '#07060f', rim: '#ffb000', campus: '#120d24', green: '#120d24', bank: '#120d24',
      water: '#101a3a', roadMajor: '#2a1d3f', roadMinor: '#21183a', path: '#21183a',
      bld: '#241a44', bldWarm: '#241a44', bldFill: '#241a44', bldTall: '#241a44', bldCampus: '#241a44',
      tree: '#1c3a4a', trunk: '#1c2030', station: '#ffffff',
      edges: 0.25, edgeColor: '#ff9a3d', bloom: 0.8, grain: 0.05, vignette: 0.4, tint: [1, 1, 1], mode: 1, emissive: 0,
    },
  },
  {
    key: 'clay', name: '클레이 토이', emoji: '🧸',
    web: { bg: '#f3f6ff', bg2: '#e6f7ef', surface: '#ffffff', ink: '#1d2340', muted: '#636b8c', line: '#e1e6f5', accent: '#3d7bff', accent2: '#ff9f1c', glow: 'rgba(61,123,255,.18)' },
    scene: {
      sky: ['#cfe8ff', '#e9fff4'], fog: '#e2f1ff', fogNear: 900, fogFar: 3200,
      hemi: ['#ffffff', '#c9d3ec', 1.7], sun: ['#ffffff', 2.3, [0.45, 0.65, 0.6]], exposure: 1.0,
      ground: '#e9f0e0', base: '#5b6aa8', rim: '#ff9f1c', campus: '#dfe3ff', green: '#a8e0a0', bank: '#9fd69a',
      water: '#6cc6ff', roadMajor: '#ffffff', roadMinor: '#f7f7f2', path: '#ffe1b3',
      bld: '#ffffff', bldWarm: '#ffffff', bldFill: '#ffffff', bldTall: '#ffffff', bldCampus: '#c9b8ff',
      tree: '#5cc26a', trunk: '#b07a52', station: '#3d7bff',
      edges: 0, edgeColor: '#1d2340', bloom: 0, grain: 0.02, vignette: 0.18, tint: [1, 1, 1], mode: 2, emissive: 0,
    },
  },
];

// 일반 웹 화면에 필터 색을 입힙니다
export function applyWebFilter(index) {
  const f = FILTERS[index];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(f.web)) root.style.setProperty(`--${k}`, v);
  root.dataset.filter = f.key;
  const dark = ['neon', 'blueprint', 'thermal'].includes(f.key);
  root.dataset.tone = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', f.web.bg);
}
