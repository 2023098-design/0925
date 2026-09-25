// 공부각 × TouchDesigner — 카메라 필터 (웹의 지도 디자인 필터와 같은 7가지)
// uFilter 현재 필터 · uPrev 이전 필터 · uMix 0→1 전환 · uTime 초
uniform float uFilter;
uniform float uPrev;
uniform float uMix;
uniform float uTime;

out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float edge(vec2 uv) {
  vec2 t = uTD2DInfos[0].res.xy * 1.5;
  float tl = luma(texture(sTD2DInputs[0], uv + vec2(-t.x,  t.y)).rgb);
  float tc = luma(texture(sTD2DInputs[0], uv + vec2( 0.0,  t.y)).rgb);
  float tr = luma(texture(sTD2DInputs[0], uv + vec2( t.x,  t.y)).rgb);
  float ml = luma(texture(sTD2DInputs[0], uv + vec2(-t.x,  0.0)).rgb);
  float mr = luma(texture(sTD2DInputs[0], uv + vec2( t.x,  0.0)).rgb);
  float bl = luma(texture(sTD2DInputs[0], uv + vec2(-t.x, -t.y)).rgb);
  float bc = luma(texture(sTD2DInputs[0], uv + vec2( 0.0, -t.y)).rgb);
  float br = luma(texture(sTD2DInputs[0], uv + vec2( t.x, -t.y)).rgb);
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return clamp(length(vec2(gx, gy)) * 1.6, 0.0, 1.0);
}

vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(.06,.03,.25), b = vec3(.45,.05,.62), c = vec3(.95,.2,.3), d = vec3(1.,.62,.08), e = vec3(1.,.97,.75);
  if (t < .25) return mix(a, b, t / .25);
  if (t < .5) return mix(b, c, (t - .25) / .25);
  if (t < .75) return mix(c, d, (t - .5) / .25);
  return mix(d, e, (t - .75) / .25);
}

vec3 look(int f, vec2 uv) {
  vec3 c = texture(sTD2DInputs[0], uv).rgb;
  float l = luma(c);
  float e = edge(uv);
  float vig = 1.0 - smoothstep(0.35, 0.95, distance(uv, vec2(0.5)));
  if (f == 0) {            // 파스텔 데이
    vec3 p = mix(c, vec3(l), 0.35);
    p = p * 0.8 + 0.22;
    p *= vec3(1.04, 0.96, 1.06);
    return mix(p, vec3(1.0, 0.86, 0.92), 0.12) * mix(0.9, 1.0, vig);
  }
  if (f == 1) {            // 미드나잇 네온
    vec3 neon = mix(vec3(0.13, 0.9, 1.0), vec3(1.0, 0.24, 0.67), uv.x);
    return vec3(0.03, 0.02, 0.09) + neon * pow(e, 0.7) * 1.4 + c * 0.08;
  }
  if (f == 2) {            // 블루프린트
    vec2 g = abs(fract(uv * vec2(32.0, 18.0)) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y) - 0.47);
    return mix(vec3(0.06, 0.23, 0.4), vec3(0.93, 0.97, 1.0), e) + grid * 0.06;
  }
  if (f == 3) {            // 페이퍼 스케치
    float ink = 1.0 - smoothstep(0.08, 0.5, e);
    float paper = 0.94 + 0.06 * rand(floor(uv * 400.0));
    float shade = mix(0.82, 1.0, smoothstep(0.2, 0.7, l));
    return vec3(0.97, 0.94, 0.88) * paper * ink * shade;
  }
  if (f == 4) {            // 골든아워
    vec3 w = c * vec3(1.18, 0.98, 0.78) + vec3(0.06, 0.02, -0.02);
    w = mix(w, vec3(1.0, 0.55, 0.45), 0.12 * (1.0 - uv.y));
    return w * mix(0.7, 1.05, vig);
  }
  if (f == 5) {            // 공부 히트맵 (서멀)
    return heat(l * 0.9 + e * 0.35);
  }
  // 6 클레이 토이 — 포스터라이즈 + 외곽선
  vec3 q = floor(c * 4.0 + 0.5) / 4.0;
  q = mix(vec3(luma(q)), q, 1.5);
  return q * (1.0 - smoothstep(0.25, 0.6, e) * 0.85);
}

void main() {
  vec2 uv = vUV.st;
  vec3 a = look(int(uPrev + 0.5), uv);
  vec3 b = look(int(uFilter + 0.5), uv);
  // 전환: 오른쪽에서 왼쪽으로 쓸어 넘기는 와이프
  float p = uMix * 1.2;
  float k = uMix >= 1.0 ? 1.0 : smoothstep(1.0 - p, 1.0 - p + 0.12, uv.x);
  vec3 col = mix(a, b, k);
  col += (rand(uv * 900.0 + fract(uTime)) - 0.5) * 0.03;
  fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
