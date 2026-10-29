/**
 * ASCII Koi Pond Simulation
 * Extracted and adapted for DeepSeek Harness Left Hero Panel.
 * Responsive, zero-HUD, serene water ripples with interactive pointer events.
 */

function initPond(canvasId, containerId) {
  const cv = document.getElementById(canvasId);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const container = document.getElementById(containerId) || cv.parentElement;

  const BG = '#fcfcfd';
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'; /* taste-skill-ignore */
  const wc = document.createElement('canvas');
  const wx = wc.getContext('2d');
  const fc = document.createElement('canvas');
  const fx = fc.getContext('2d', { willReadFrequently: true });
  const sc = document.createElement('canvas');
  const sx = sc.getContext('2d', { willReadFrequently: true });
  const RAMP = ' .:-=+*#%@';
  const COLORS = [
    [236, 108, 38],
    [34, 40, 52],
    [214, 62, 52],
    [226, 164, 34],
    [64, 98, 150],
    [240, 128, 88],
    [40, 40, 44]
  ];
  const GL = ['.', ':', '~', '\u2248'];
  const ST = [
    'rgba(120,150,185,.30)',
    'rgba(105,140,180,.38)',
    'rgba(90,130,175,.48)',
    'rgba(70,115,170,.58)'
  ];
  const N = 14;
  const SHX = 11;
  const SHY = 16;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let cw = 7;
  let ch = 12;
  let cols = 0;
  let rows = 0;
  let fs = 10;
  let base = 14;
  let fish = [];
  let ripples = [];
  let last = 0;
  let wLast = 0;

  function resize() {
    const rect = container.getBoundingClientRect();
    W = Math.max(260, Math.floor(rect.width));
    H = Math.max(300, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = W < 600 ? 6 : 7;
    ch = W < 600 ? 10 : 12;
    fs = ch * 0.9;
    cols = Math.ceil(W / cw);
    rows = Math.ceil(H / ch);

    for (const c of [cv, wc]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    }
    for (const c of [fc, sc]) {
      c.width = cols;
      c.height = rows;
    }

    base = Math.max(11, Math.min(20, W / 75));
    const want = Math.round(Math.max(4, Math.min(8, (W * H) / 120000)));
    while (fish.length < want) fish.push(mk(fish.length));
    fish.length = want;
    for (const f of fish) {
      f.size = base * f.k;
      f.L = f.size * 0.7;
      f.spd = 26 + f.size * 2.2;
    }
    wLast = 0;
  }

  function mk(i) {
    const k = 0.75 + Math.random() * 0.5;
    const s = base * k;
    const a = Math.random() * 6.283;
    const x = W * (0.15 + Math.random() * 0.7);
    const y = H * (0.15 + Math.random() * 0.7);
    const f = {
      k,
      size: s,
      L: s * 0.7,
      spd: 26 + s * 2.2,
      sp: 0,
      a,
      x,
      y,
      seed: Math.random() * 100,
      phase: Math.random() * 6,
      wk: Math.random(),
      col: COLORS[i % COLORS.length],
      tgt: null,
      seg: [],
      P: [],
      T: [],
      M: []
    };
    for (let j = 0; j < N; j++) {
      f.seg.push({ x: x - Math.cos(a) * f.L * j, y: y - Math.sin(a) * f.L * j });
    }
    return f;
  }

  const ang = (d) => Math.atan2(Math.sin(d), Math.cos(d));

  function update(f, dt, t) {
    const turn = (Math.sin(t * 0.5 + f.seed) + Math.sin(t * 0.83 + f.seed * 2.1) * 0.7) * 0.9;
    f.a += turn * dt;
    let tsp = f.spd * (0.75 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.4 + f.seed)));
    if (f.tgt) {
      if (t > f.tgt.until || Math.hypot(f.tgt.x - f.x, f.tgt.y - f.y) < f.size * 2) {
        f.tgt = null;
      } else {
        const d = ang(Math.atan2(f.tgt.y - f.y, f.tgt.x - f.x) - f.a);
        f.a += Math.max(-2.2 * dt, Math.min(2.2 * dt, d));
        tsp *= 1.5;
      }
    }
    const m = 90;
    const push = Math.max(0, m - f.x, f.x - (W - m), m - f.y, f.y - (H - m)) / m;
    if (push > 0) {
      const d = ang(Math.atan2(H / 2 - f.y, W / 2 - f.x) - f.a);
      f.a += d * Math.min(1, push * 1.5) * 3 * dt;
    }
    f.sp += (tsp - f.sp) * dt * 1.5;
    f.x += Math.cos(f.a) * f.sp * dt;
    f.y += Math.sin(f.a) * f.sp * dt;
    f.x = Math.max(-30, Math.min(W + 30, f.x));
    f.y = Math.max(-30, Math.min(H + 30, f.y));
    f.phase += dt * (3 + f.sp * 0.07);
    const sg = f.seg;
    sg[0].x = f.x;
    sg[0].y = f.y;
    for (let i = 1; i < N; i++) {
      const dx = sg[i - 1].x - sg[i].x;
      const dy = sg[i - 1].y - sg[i].y;
      const d = Math.hypot(dx, dy) || 1;
      sg[i].x = sg[i - 1].x - (dx / d) * f.L;
      sg[i].y = sg[i - 1].y - (dy / d) * f.L;
    }
    const amp = f.size * (0.28 + 0.22 * Math.min(1, f.sp / f.spd));
    for (let i = 0; i < N; i++) {
      const a = sg[Math.max(i - 1, 0)];
      const b = sg[Math.min(i + 1, N - 1)];
      let tx = a.x - b.x;
      let ty = a.y - b.y;
      const d = Math.hypot(tx, ty) || 1;
      tx /= d;
      ty /= d;
      const nx = -ty;
      const ny = tx;
      const w = Math.sin(f.phase - i * 0.55) * amp * (0.12 + 0.88 * (i / (N - 1)));
      f.P[i] = { x: sg[i].x + nx * w, y: sg[i].y + ny * w };
      f.T[i] = { x: tx, y: ty };
      f.M[i] = { x: nx, y: ny };
    }
    f.wk += dt;
    if (f.wk > 0.5) {
      f.wk = 0;
      ripples.push({ x: f.x, y: f.y, t, s: 48, a: 0.3 });
      if (ripples.length > 16) ripples.shift();
    }
  }

  const rad = (s, t) => s * Math.max(0.35, Math.sin(Math.PI * (0.1 + 0.78 * t)) * (1 - 0.5 * t * t));

  function drawFish(g, f, ox, oy, isShadow) {
    const P = f.P;
    const s = f.size;
    const [R, G, B] = f.col;
    const col = (a) => (isShadow ? `rgba(0,0,0,${a * 0.5})` : `rgba(${R},${G},${B},${a})`);

    g.beginPath();
    const e = P[N - 1];
    const d = { x: -f.T[N - 1].x, y: -f.T[N - 1].y };
    const n = f.M[N - 1];
    const sw = Math.sin(f.phase - N * 0.55) * s * 0.9;
    const len = s * 2.4;
    const ex = e.x + ox;
    const ey = e.y + oy;
    g.moveTo(ex, ey);
    g.lineTo(ex + d.x * len + n.x * (s + sw), ey + d.y * len + n.y * (s + sw));
    g.lineTo(ex + d.x * len * 0.7 + n.x * sw * 0.6, ey + d.y * len * 0.7 + n.y * sw * 0.6);
    g.lineTo(ex + d.x * len + n.x * (-s + sw), ey + d.y * len + n.y * (-s + sw));
    g.closePath();

    for (const [idx, sz] of [[3, 0.9], [8, 0.55]]) {
      const p = P[idx];
      const T = f.T[idx];
      const M = f.M[idx];
      const r = rad(s, idx / (N - 1));
      for (const sg of [-1, 1]) {
        const cx = p.x + ox + M.x * sg * (r + s * 0.4 * sz) - T.x * s * 0.2;
        const cy = p.y + oy + M.y * sg * (r + s * 0.4 * sz) - T.y * s * 0.2;
        const rot = Math.atan2(T.y, T.x) + sg * (0.7 + 0.25 * Math.sin(f.phase * 0.7 + sg));
        const rx = s * sz;
        const ry = s * 0.3 * sz;
        g.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx);
        g.ellipse(cx, cy, rx, ry, rot, 0, 6.2832);
      }
    }
    g.fillStyle = col(0.4);
    g.fill();

    g.beginPath();
    const pts = [];
    for (let i = 0; i < N - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const u = k / 3;
        const t = (i + u) / (N - 1);
        const x = P[i].x + (P[i + 1].x - P[i].x) * u + ox;
        const y = P[i].y + (P[i + 1].y - P[i].y) * u + oy;
        const r = rad(s, t);
        pts.push([x, y, r, t]);
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, 6.2832);
      }
    }
    g.fillStyle = col(0.62);
    g.fill();
    if (isShadow) return;

    g.beginPath();
    for (const [x, y, r, t] of pts) {
      if (t > 0.08 && t < 0.88) {
        g.moveTo(x + r * 0.45, y);
        g.arc(x, y, r * 0.45, 0, 6.2832);
      }
    }
    g.fillStyle = col(0.4);
    g.fill();

    g.beginPath();
    for (const i of [4, 9]) {
      const p = P[i];
      const r = rad(s, i / (N - 1)) * 0.75;
      g.moveTo(p.x + r, p.y);
      g.arc(p.x, p.y, r, 0, 6.2832);
    }
    g.fillStyle = col(0.25);
    g.fill();
  }

  function drawWater(t) {
    wx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wx.fillStyle = BG;
    wx.fillRect(0, 0, W, H);
    wx.font = fs + 'px ' + MONO;
    wx.textAlign = 'center';
    wx.textBaseline = 'middle';
    ripples = ripples.filter((r) => t - r.t < 3.2);
    const lv = [[], [], [], []];
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * ch;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cw;
        let v =
          (Math.sin(x * 0.021 + t * 0.55 + Math.sin(y * 0.017 + t * 0.3) * 2.2) +
            Math.sin(y * 0.026 - t * 0.42 + Math.sin(x * 0.012 - t * 0.2) * 1.8) +
            Math.sin((x + y) * 0.013 + t * 0.35)) /
          3;
        v = 0.5 + 0.5 * v;
        for (let i = 0; i < ripples.length; i++) {
          const q = ripples[i];
          const age = t - q.t;
          const k = (Math.hypot(x - q.x, y - q.y) - age * q.s) / 16;
          if (k > -3 && k < 3) v += q.a * Math.exp(-k * k) * (1 - age / 3.2) * 0.55;
        }
        const l = v > 0.9 ? 3 : v > 0.8 ? 2 : v > 0.7 ? 1 : v > 0.6 ? 0 : -1;
        if (l >= 0) lv[l].push(x, y + 1);
      }
    }
    for (let l = 0; l < 4; l++) {
      wx.fillStyle = ST[l];
      const a = lv[l];
      const g = GL[l];
      for (let i = 0; i < a.length; i += 2) wx.fillText(g, a[i], a[i + 1]);
    }
  }

  function blit(g, isShadow) {
    const d = g.getImageData(0, 0, cols, rows).data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 26) continue;
      const p = i >> 2;
      const c = p % cols;
      const r = (p / cols) | 0;
      ctx.fillStyle = BG;
      ctx.fillRect(c * cw, r * ch, cw, ch);
      ctx.fillStyle = isShadow ? 'rgb(165,174,190)' : 'rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')';
      ctx.fillText(RAMP[Math.min(9, ((a / 255) * 10) | 0)], (c + 0.5) * cw, (r + 0.5) * ch + 1);
    }
  }

  function frame(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.05, t - last || 0.016);
    last = t;
    for (const f of fish) update(f, dt, t);
    if (t - wLast > 0.032) {
      drawWater(t);
      wLast = t;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(wc, 0, 0, W, H);
    ctx.font = fs + 'px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const g of [fx, sx]) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cols, rows);
      g.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
    }
    for (const f of fish) {
      drawFish(sx, f, SHX, SHY, true);
    }
    for (const f of fish) {
      drawFish(fx, f, 0, 0, false);
    }
    blit(sx, true);
    blit(fx, false);
    requestAnimationFrame(frame);
  }

  function poke(e) {
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || x > W || y < 0 || y > H) return;
    const now = performance.now() / 1000;
    ripples.push({ x, y, t: now, s: 85, a: 1 });
    ripples.push({ x, y, t: now + 0.28, s: 70, a: 0.7 });
    if (ripples.length > 16) ripples.splice(0, ripples.length - 16);
    for (const f of fish) {
      if (Math.hypot(f.x - x, f.y - y) < 460) {
        f.tgt = { x, y, until: now + 5 };
      }
    }
  }

  container.addEventListener('pointerdown', poke);
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
  }

  resize();
  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined') {
  window.initPond = initPond;
}
