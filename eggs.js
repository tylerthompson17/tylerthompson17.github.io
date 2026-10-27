/* Easter eggs: hidden :commands (and one key sequence). The ◆ counter in the status bar and :secrets list clues.
   Loaded after the main script, so it extends COMMANDS and reuses flash, restoreBar, goTo, esc and reduceMotion. */
(() => {
const EGGS = ['rm', 'sprint', 'crt', 'konami', 'hire', 'detect', 'blackjack', 'train', 'snake', 'idle', 'shake', 'day', 'kick', 'late',
  'subst', 'dd', 'vsplit', 'blame', 'nu', 'syntax', 'colo', 'earlier', 'shell', 'vimhelp'];
const PR_400M = 49.42; // 400m PR in seconds; :sprint finishes exactly on it

// only the eggs in the list count; ambient ones (4942, visual mode, tab title, ...) just happen
const stored = () => { try { return JSON.parse(localStorage.getItem('eggs') || '[]').filter(k => EGGS.includes(k)); } catch (e) { return []; } };
const found = new Set(stored());
function discover(id) {
  if (!EGGS.includes(id) || found.has(id)) return;
  found.add(id);
  // merge first: a :vsplit window shares this storage and may have found some too
  stored().forEach(k => found.add(k));
  try { localStorage.setItem('eggs', JSON.stringify([...found])); } catch (e) {}
  updateCount(true);
}
addEventListener('storage', e => {
  if (e.key !== 'eggs') return;
  const before = found.size;
  stored().forEach(k => found.add(k));
  if (found.size !== before) updateCount(true);
});
// the tail :help appends
window.eggHint = () => `  ·  :secrets ${found.size}/${EGGS.length}`;

/* ---------- shared helpers ---------- */
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const MONO = getComputedStyle(document.body).fontFamily;

let busy = false, abort = false;
function run(id, fn) {
  return () => {
    if (busy) return flash('E21: busy. esc to stop the current one');
    busy = true; abort = false; discover(id);
    Promise.resolve(fn()).catch(e => console.error(e)).finally(() => { busy = false; });
  };
}
// a status-bar message that stays until replaced (flash clears itself)
function say(text) {
  clearTimeout(flash.t);
  barMain.innerHTML = `<span class="msg">${esc(text)}</span>`;
}
// rAF loop; fn(now, dt) returns false to stop
const frames = fn => new Promise(done => {
  let last = performance.now();
  const step = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (fn(now, dt) === false) done(); else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});

// while an egg owns the screen: no scrolling, and only Escape gets through
const SCROLL_KEYS = /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| |j|k|g|G|:)$/;
function lockScroll(keysToo = true) {
  const stopWheel = e => e.preventDefault();
  const stopKey = e => {
    if (e.key === 'Escape') { abort = true; return; }
    if (!keysToo && !SCROLL_KEYS.test(e.key)) return;
    e.preventDefault(); e.stopPropagation();
  };
  addEventListener('wheel', stopWheel, { passive: false });
  addEventListener('touchmove', stopWheel, { passive: false });
  addEventListener('keydown', stopKey, true);
  return () => {
    removeEventListener('wheel', stopWheel);
    removeEventListener('touchmove', stopWheel);
    removeEventListener('keydown', stopKey, true);
  };
}

function overlayCanvas(cls) {
  const cv = document.createElement('canvas');
  cv.className = 'egg ' + cls;
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  return { cv, ctx, w: innerWidth, h: innerHeight };
}

// every visible character on screen, with where it sits and how it is drawn
function visibleGlyphs(limit = 6000) {
  const out = [], vh = innerHeight, vw = innerWidth;
  const range = document.createRange();
  const opacity = new Map();
  const alphaOf = el => {
    if (!el || el === document.body) return 1;
    if (opacity.has(el)) return opacity.get(el);
    const a = parseFloat(getComputedStyle(el).opacity) * alphaOf(el.parentElement);
    opacity.set(el, a);
    return a;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.data.trim() && !n.parentElement.closest('.bar, .egg, script, style, noscript')
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  for (let n; (n = walker.nextNode()) && out.length < limit;) {
    range.selectNodeContents(n);
    const box = range.getBoundingClientRect();
    if (!box.width || box.bottom < 0 || box.top > vh || box.right < 0 || box.left > vw) continue;
    const el = n.parentElement, cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    const alpha = alphaOf(el);
    if (alpha < 0.05) continue;
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    for (let i = 0; i < n.data.length && out.length < limit; i++) {
      const ch = n.data[i];
      if (/\s/.test(ch)) continue;
      range.setStart(n, i); range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > vh) continue;
      out.push({ ch, x: r.left, y: r.top, w: r.width, h: r.height, font, color: cs.color, alpha });
    }
  }
  return out;
}

/* ---------- 1. :!rm -rf /  the page deletes itself, then puts itself back ---------- */
async function rmrf() {
  if (reduceMotion) return flash("rm: it is dangerous to operate recursively on '/'. nice try.");
  const glyphs = visibleGlyphs();
  const unlock = lockScroll();
  const { cv, ctx, w, h } = overlayCanvas('egg-full');
  document.body.classList.add('egg-gone');

  const barH = document.getElementById('bar').offsetHeight;
  const floor = h - barH, COL = 5;
  const pile = new Float32Array(Math.ceil(w / COL) + 1);
  // the bottom of the screen gives way first, so higher lines fall onto what's already down
  glyphs.forEach(g => {
    g.ox = g.x; g.oy = g.y;
    g.delay = (1 - g.y / h) * 1.5 + Math.random() * 0.2;
    g.vx = (Math.random() - 0.5) * 30; g.vy = -Math.random() * 60;
    g.rot = 0; g.vr = (Math.random() - 0.5) * 3; g.state = 'wait';
  });
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const g of glyphs) {
      ctx.save();
      ctx.globalAlpha = g.alpha; ctx.font = g.font; ctx.fillStyle = g.color;
      ctx.translate(g.x + g.w / 2, g.y + g.h / 2); ctx.rotate(g.rot);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
    }
  };

  const paths = ['~/about/whoami', '~/projects/hmma-direct', '~/projects/blackjack-vision', '~/projects/ascii-cam',
    '~/experience.log', '~/contact', '/usr/bin/vim', '/etc/hosts', '/bin/sh'];
  // where a glyph comes to rest: roll downhill like sand until the slope is gentle, then sit on the
  // highest column under its full width so nothing overlaps
  const settle = g => {
    const span = Math.max(1, Math.round(g.w / COL));
    let c = clamp(Math.round(g.x / COL), 0, pile.length - span);
    const height = c => { let m = 0; for (let j = c; j < c + span; j++) m = Math.max(m, pile[j]); return m; };
    for (let k = 0; k < 400; k++) {
      const here = height(c), l = c > 0 ? height(c - 1) : Infinity, r = c + span < pile.length ? height(c + 1) : Infinity;
      if (l + 2 < here && l <= r) c--; else if (r + 2 < here) c++; else break;
    }
    const lvl = height(c);
    for (let j = c; j < c + span; j++) pile[j] = lvl + g.h * 0.8;
    g.tx = c * COL; g.ty = floor - lvl - g.h; g.trot = (Math.random() - 0.5) * 0.35;
    g.fx = g.x; g.fy = g.y; g.frot = g.rot; g.st = 0; g.state = 'slide';
  };

  let t0 = null, gone = 0;
  await frames((now, dt) => {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    let moving = 0;
    for (const g of glyphs) {
      if (g.state === 'rest') continue;
      moving++;
      if (g.state === 'wait') { if (t >= g.delay) g.state = 'fall'; else continue; }
      if (g.state === 'fall') {
        g.vy += 2400 * dt; g.x = clamp(g.x + g.vx * dt, 0, w - g.w); g.y += g.vy * dt; g.rot += g.vr * dt;
        const c0 = Math.floor(g.x / COL), c1 = Math.min(pile.length - 1, Math.floor((g.x + g.w) / COL));
        let top = 0;
        for (let c = c0; c <= c1; c++) top = Math.max(top, pile[c]);
        if (g.y + g.h >= floor - top) settle(g);
      } else {
        g.st = Math.min(1, g.st + dt / 0.18);
        const k = 1 - Math.pow(1 - g.st, 3);
        g.x = g.fx + (g.tx - g.fx) * k; g.y = Math.min(g.fy + (g.ty - g.fy) * k, g.ty); g.rot = g.frot + (g.trot - g.frot) * k;
        if (g.st === 1) { g.state = 'rest'; gone++; }
      }
    }
    say(`rm: removing '${paths[Math.min(paths.length - 1, Math.floor(gone / glyphs.length * paths.length))]}'  ${gone}/${glyphs.length}`);
    draw();
    return moving > 0 && t < 8;
  });

  say(`rm: removed ${glyphs.length.toLocaleString()} files. ~ is empty.`);
  await wait(1300);
  say("jk. you can't rm -rf me.");
  await wait(500);

  glyphs.forEach(g => { g.sx = g.x; g.sy = g.y; g.sr = g.rot; g.d = Math.random() * 0.6; });
  t0 = null;
  await frames(now => {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    for (const g of glyphs) {
      const k = ease(clamp((t - g.d) / 0.9, 0, 1));
      g.x = g.sx + (g.ox - g.sx) * k; g.y = g.sy + (g.oy - g.sy) * k; g.rot = g.sr * (1 - k);
    }
    draw();
    return t < 1.6;
  });

  document.body.classList.remove('egg-gone');
  cv.remove(); unlock();
  flash('restored from backup. (there was no backup.)');
}

/* ---------- 2. :sprint  a 400m from the stagger, at PR pace ---------- */
function makeGrid(cols, rows, aspect) {
  const ch = new Array(cols * rows), tone = new Uint8Array(cols * rows);
  return {
    cols, rows,
    clear() { ch.fill(' '); tone.fill(0); },
    put(x, y, c, t = 1) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      ch[y * cols + x] = c; tone[y * cols + x] = t;
    },
    text(x, y, s, t = 1) { [...s].forEach((c, i) => this.put(x + i, y, c, t)); },
    line(x0, y0, x1, y1, t = 1) {
      const dx = x1 - x0, dy = y1 - y0;
      let a = Math.atan2(dy * aspect, dx) * 180 / Math.PI;
      a = (a + 180) % 180;
      const c = a < 22.5 || a >= 157.5 ? '-' : a < 67.5 ? '\\' : a < 112.5 ? '|' : '/';
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
      for (let i = 0; i <= n; i++) this.put(x0 + dx * i / n, y0 + dy * i / n, c, t);
    },
    html() {
      let s = '', cur = -1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x, t = ch[i] === ' ' ? cur : tone[i];
          if (t !== cur) { if (cur > 0) s += '</span>'; if (t > 0) s += `<span class="t${t}">`; cur = t; }
          s += ch[i] === '<' ? '&lt;' : ch[i] === '&' ? '&amp;' : ch[i];
        }
        if (cur > 0) s += '</span>'; cur = -1;
        s += '\n';
      }
      return s;
    },
  };
}

async function sprint() {
  const SPEED = 6; // the race replays at 6x so it lasts ~8s instead of 49
  const T = PR_400M, label = 'T. THOMPSON · DAVIDSON · PR';
  if (reduceMotion) return flash(`400m · ${T.toFixed(2)}s · ${label}`);
  // race-time → metres, through splits that add up to the PR (scaled for the other lanes' times)
  const KNOTS = [[0, 0], [0.15, 0], [2.2, 10], [6.5, 50], [11.55, 100], [23.2, 200], [35.5, 300], [49.42, 400]];
  const distAt = (t, total) => {
    const k = total / KNOTS[KNOTS.length - 1][0];
    if (t >= total) return 400 + Math.min(12, (t - total) * 4);
    for (let i = 1; i < KNOTS.length; i++) {
      const [t0, d0] = KNOTS[i - 1], [t1, d1] = KNOTS[i];
      if (t <= t1 * k) return d0 + (d1 - d0) * clamp((t - t0 * k) / ((t1 - t0) * k), 0, 1);
    }
    return 400;
  };
  const splits = KNOTS.slice(4, 7).map(([t, d]) => [d, t * T / 49.42]);

  // real track: 84.39m straights, lane 1 measured at 36.8m radius, 1.22m lanes; the line is at the end of the home straight
  const STRAIGHT = 84.39, radius = lane => 36.8 + 1.22 * (lane - 1);
  const lapLen = lane => 2 * STRAIGHT + 2 * Math.PI * radius(lane);
  // metres past the finish line (running anticlockwise) → which piece of track and how far along it
  const where = (lane, s) => {
    const r = radius(lane), bend = Math.PI * r;
    s = ((s % lapLen(lane)) + lapLen(lane)) % lapLen(lane);
    for (const [seg, len] of [[0, bend], [1, STRAIGHT], [2, bend], [3, STRAIGHT]]) {
      if (s <= len) return [seg, s / len];
      s -= len;
    }
    return [3, 1];
  };
  const field = [1, 2, 3, 5, 6, 7, 8].map(lane => ({ lane, time: T + 0.3 + Math.random() * 2.9 }));
  field.push({ lane: 4, time: T, me: true });
  field.forEach(f => { f.stagger = lapLen(f.lane) - 400; });

  goTo('top');
  const unlock = lockScroll();
  const box = document.createElement('div');
  box.className = 'egg egg-sprint';
  box.innerHTML = `<pre></pre><div class="egg-head">MEN’S 400m · FINAL · LANE 4 · REPLAY ×${SPEED}</div>
    <div class="egg-infield"><div class="egg-call"></div><div class="egg-sub"></div><div class="egg-splits"></div></div>`;
  document.body.appendChild(box);
  const pre = box.querySelector('pre'), infield = box.querySelector('.egg-infield');
  const call = box.querySelector('.egg-call'), sub = box.querySelector('.egg-sub'), splitsEl = box.querySelector('.egg-splits');
  requestAnimationFrame(() => box.classList.add('on'));

  const probe = document.createElement('span');
  probe.textContent = 'M'.repeat(10); pre.appendChild(probe);
  const colW = probe.getBoundingClientRect().width / 10, rowH = parseFloat(getComputedStyle(pre).lineHeight);
  probe.remove();
  const cols = Math.floor(innerWidth / colW), rows = Math.floor((innerHeight - 40) / rowH);
  const grid = makeGrid(cols, rows, rowH / colW);

  // drawn oval: lanes two rows apart so lane lines and runners never share a row; the bends and
  // straights keep the real track's proportions, sized to fit the screen
  // on a portrait screen the oval stands upright, home straight up the right-hand side
  const availW = innerWidth - 32, availH = (innerHeight - 40) * 0.86, portrait = availH > availW;
  const long = portrait ? availH : availW, short = portrait ? availW : availH;
  const fit = W => Math.min((long - 16 * W) / (2 + 2 * STRAIGHT / 36.8), short / 2 - 8 * W);
  let W = 2 * rowH, R1 = fit(W);
  if (R1 < 60) { W = rowH; R1 = fit(W); }
  const SP = R1 * STRAIGHT / 36.8;
  const cx = innerWidth / 2, cy = 40 + (innerHeight - 40) / 2;
  const toCell = (x, y) => portrait ? [(cx + y) / colW, (cy - x) / rowH] : [(cx + x) / colW, (cy + y) / rowH];
  const point = (seg, f, R) => {
    const p = f * Math.PI;
    if (seg === 0) return toCell(SP / 2 + R * Math.sin(p), R * Math.cos(p));
    if (seg === 1) return toCell(SP / 2 - f * SP, -R);
    if (seg === 2) return toCell(-SP / 2 - R * Math.sin(p), -R * Math.cos(p));
    return toCell(-SP / 2 + f * SP, R);
  };
  const laneR = lane => R1 + (lane - 0.5) * W;
  infield.style.left = cx + 'px'; infield.style.top = cy + 'px';
  infield.style.width = (portrait ? 2 * R1 - 16 : SP + 2 * R1 - 24) + 'px';

  const track = reveal => {
    // kerbs as solid lines, the lane lines between them dotted
    for (let k = 0; k <= 8; k++) {
      const R = R1 + k * W, edge = k === 0 || k === 8;
      let prev = null;
      for (let seg = 0; seg < 4; seg++) {
        const n = Math.ceil((seg % 2 ? SP : Math.PI * R) / colW / (edge ? 1 : 2.5));
        for (let i = 0; i <= n; i++) {
          if ((seg + i / n) / 4 > reveal) return;
          const pt = point(seg, i / n, R);
          if (!edge) grid.put(pt[0], pt[1], '·', 0);
          else if (prev) grid.line(prev[0], prev[1], pt[0], pt[1], 1);
          prev = pt;
        }
      }
    }
    // finish line across all lanes, lane numbers just behind it
    const [ax, ay] = point(3, 1, R1), [bx, by] = point(3, 1, R1 + 8 * W);
    const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
    for (let i = 0; i <= n; i++) grid.put(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, portrait ? '=' : '┃', 3);
    if (portrait) grid.text(ax - 8, ay, 'FINISH', 3); else grid.text(bx - 2, by + 1.5, 'FINISH', 3);
    for (let lane = 1; lane <= 8; lane++) {
      const [x, y] = point(3, 1, laneR(lane));
      if (portrait) grid.put(x, y + 1.5, String(lane), lane === 4 ? 3 : 0);
      else grid.put(x - 3, y, String(lane), lane === 4 ? 3 : 0);
    }
  };
  const trail = [];
  const runners = t => {
    for (const f of field) {
      const [seg, fr] = where(f.lane, f.stagger + distAt(t, f.time));
      const [x, y] = point(seg, fr, laneR(f.lane));
      if (f.me) {
        trail.push([x, y]); if (trail.length > 18) trail.shift();
        trail.forEach(([tx, ty], i) => grid.put(tx, ty, i > 12 ? '•' : '·', 4));
        grid.put(x, y, '@', 3);
      } else grid.put(x, y, 'o', 2);
    }
  };
  const paint = () => { pre.innerHTML = grid.html(); };
  const show = (text, cls = '') => {
    call.textContent = text; call.className = 'egg-call ' + cls;
    call.classList.remove('pop'); void call.offsetWidth; call.classList.add('pop');
  };

  let t0 = null;
  await frames(now => {
    if (t0 === null) t0 = now;
    const k = Math.min(1, (now - t0) / 900);
    grid.clear(); track(ease(k)); paint();
    return k < 1 && !abort;
  });
  const hold = async (text, ms) => {
    if (abort) return;
    show(text);
    grid.clear(); track(1); runners(0); paint();
    const end = performance.now() + ms;
    while (!abort && performance.now() < end) await wait(30);
  };
  await hold('ON YOUR MARKS', 1500);
  await hold('SET', 1000 + Math.random() * 800);

  if (!abort) {
    box.classList.add('bang');
    setTimeout(() => box.classList.remove('bang'), 200);
    show('0.00', 'clock');
    const last = Math.max(...field.map(f => f.time));
    let gun = null, done = false, shown = 0;
    await frames(now => {
      if (gun === null) gun = now;
      const t = (now - gun) / 1000 * SPEED;
      call.textContent = Math.min(t, T).toFixed(2);
      while (shown < splits.length && t >= splits[shown][1]) {
        splitsEl.innerHTML += `<span>${splits[shown][0]}m <b>${splits[shown][1].toFixed(2)}</b></span>`;
        shown++;
      }
      if (!done && t >= T) {
        done = true;
        show(T.toFixed(2), 'clock done');
        sub.textContent = label + ' · 1st';
      }
      grid.clear(); track(1); runners(t); paint();
      return !abort && t < last + 2;
    });
    const end = performance.now() + 3000;
    while (!abort && performance.now() < end) await wait(30);
  }
  box.classList.remove('on');
  await wait(300);
  box.remove(); unlock();
  flash(`400m · ${T.toFixed(2)}s · PR`);
}

/* ---------- 3. :q! / :wq  old TV switching off, then back on ---------- */
async function crt(final) {
  if (reduceMotion) return flash(final);
  const unlock = lockScroll();
  const root = document.documentElement, body = document.body;
  say('closing session…');
  await wait(450);
  // squash each top-level block around the screen's centre (not body itself, which would
  // become the containing block for the fixed status bar and overlays)
  const screen = [...body.children].filter(el => !el.matches('script, .bar, .egg'));
  // clipped to the viewport first, so only the picture on screen squashes, not the page below the fold
  screen.forEach(el => {
    const r = el.getBoundingClientRect();
    el.style.transformOrigin = `50% ${innerHeight / 2 - r.top}px`;
    el.style.clipPath = `inset(${Math.max(0, -r.top)}px 0 ${Math.max(0, r.bottom - innerHeight)}px 0)`;
  });
  root.classList.add('egg-crt');

  const fx = document.createElement('div');
  fx.className = 'egg egg-tv';
  fx.innerHTML = '<div class="egg-line"></div><pre class="egg-msg"></pre>';
  body.appendChild(fx);
  const line = fx.firstChild, msg = fx.lastChild;
  const play = (el, kf, ms, easing = 'ease-in') => el.animate(kf, { duration: ms, easing, fill: 'forwards' }).finished;
  const playAll = (kf, ms, easing) => Promise.all(screen.map(el => play(el, kf, ms, easing)));

  // off: squash to a bright line, the line to a dot, the dot fades
  play(line, [{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)' }], 260, 'cubic-bezier(.8,0,1,1)');
  await playAll([{ transform: 'none', filter: 'brightness(1)' }, { transform: 'scale(1.03, 0.004)', filter: 'brightness(4)' }], 260, 'cubic-bezier(.7,0,.9,.4)');
  root.classList.add('egg-dark');
  await play(line, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(0.004)' }], 200);
  await play(line, [{ opacity: 1, transform: 'scaleX(0.004)' }, { opacity: 0, transform: 'scaleX(0.002)' }], 500, 'ease-out');
  await wait(500);

  const text = 'there is no escape from vim.';
  for (let i = 1; i <= text.length; i++) { msg.textContent = text.slice(0, i) + '█'; await wait(45); }
  await wait(1100);
  msg.textContent = '';

  // on: dot, line, then the picture springs back open
  await play(line, [{ opacity: 0, transform: 'scaleX(0.002)' }, { opacity: 1, transform: 'scaleX(1)' }], 180, 'ease-out');
  root.classList.remove('egg-dark');
  play(line, [{ opacity: 1 }, { opacity: 0 }], 200);
  await playAll([
    { transform: 'scale(1, 0.004)', filter: 'brightness(4)' },
    { transform: 'scale(1, 1.03)', filter: 'brightness(1.4)', offset: 0.7 },
    { transform: 'none', filter: 'brightness(1)' },
  ], 380, 'ease-out');

  screen.forEach(el => { el.getAnimations().forEach(a => a.cancel()); el.style.transformOrigin = el.style.clipPath = ''; });
  root.classList.remove('egg-crt');
  fx.remove(); unlock();
  flash(final);
}

/* ---------- 4. konami code  the whole page, as ASCII ---------- */
const RAMP = (window.AsciiCam && AsciiCam.RAMPS.classic) || ' .,-~:;=!*#$@';
const parseRGB = s => (s.match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function asciiMode() {
  const { cv, ctx, w, h } = overlayCanvas('egg-full egg-ascii');
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const FONT = `10px ${MONO}`;
  ctx.font = FONT;
  const cw = ctx.measureText('M').width, chH = 12;
  const cols = Math.ceil(w / cw), rows = Math.ceil(h / chH);
  const cells = new Array(cols * rows).fill(null);

  // painted boxes: anything with a background or border that stands out from the page
  const bodyBg = getComputedStyle(document.body).backgroundColor, bg = parseRGB(bodyBg);
  const fgL = luma(parseRGB(getComputedStyle(document.body).color)), bgL = luma(bg);
  const boxes = [];
  document.body.querySelectorAll('*').forEach(el => {
    if (el.closest('.bar, .egg, script, style')) return;
    const cs = getComputedStyle(el), b = { el, sides: [] };
    const fill = parseRGB(cs.backgroundColor);
    if (fill[3] !== 0 && Math.abs(luma(fill) - bgL) > 6) b.fill = cs.backgroundColor;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const bw = parseFloat(cs[`border${side}Width`]);
      if (bw > 0 && cs[`border${side}Style`] !== 'none' && parseRGB(cs[`border${side}Color`])[3] !== 0) b.sides.push([side, bw, cs[`border${side}Color`]]);
    }
    if (b.fill || b.sides.length) boxes.push(b);
  });

  const sample = () => {
    octx.fillStyle = bodyBg; octx.fillRect(0, 0, w, h);
    for (const b of boxes) {
      const r = b.el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > h || getComputedStyle(b.el).visibility === 'hidden') continue;
      if (b.fill) { octx.fillStyle = b.fill; octx.fillRect(r.left, r.top, r.width, r.height); }
      for (const [side, bw, color] of b.sides) {
        octx.fillStyle = color;
        const lw = Math.max(bw, 1.5);
        if (side === 'Top') octx.fillRect(r.left, r.top, r.width, lw);
        if (side === 'Bottom') octx.fillRect(r.left, r.bottom - lw, r.width, lw);
        if (side === 'Left') octx.fillRect(r.left, r.top, lw, r.height);
        if (side === 'Right') octx.fillRect(r.right - lw, r.top, lw, r.height);
      }
    }
    octx.textBaseline = 'middle';
    for (const g of visibleGlyphs(9000)) {
      octx.globalAlpha = g.alpha; octx.font = g.font; octx.fillStyle = g.color;
      octx.fillText(g.ch, g.x, g.y + g.h / 2);
    }
    octx.globalAlpha = 1;

    const px = octx.getImageData(0, 0, w, h).data, span = Math.abs(fgL - bgL) || 1;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const x0 = Math.floor(cx * cw), x1 = Math.min(w, Math.floor((cx + 1) * cw)), y0 = cy * chH, y1 = Math.min(h, y0 + chH);
        let r = 0, g = 0, bl = 0, n = 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; bl += px[i + 2]; n++;
        }
        if (!n) { cells[cy * cols + cx] = null; continue; }
        r /= n; g /= n; bl /= n;
        const c = Math.abs(luma([r, g, bl]) - bgL) / span;
        if (c < 0.03) { cells[cy * cols + cx] = null; continue; }
        const k = Math.max(c, 0.3); // undo the averaging so thin text keeps its colour
        const col = [r, g, bl].map((v, j) => Math.round(clamp(bg[j] + (v - bg[j]) / k, 0, 255)));
        cells[cy * cols + cx] = [RAMP[Math.round(clamp(Math.pow(c * 1.6, 0.8), 0, 1) * (RAMP.length - 1))], `rgb(${col})`];
      }
    }
  };

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  const draw = reveal => {
    ctx.clearRect(0, 0, w, h);
    const edge = Math.floor(rows * reveal);
    ctx.fillStyle = bodyBg; ctx.fillRect(0, 0, w, Math.min(h, edge * chH));
    ctx.font = FONT; ctx.textBaseline = 'top';
    for (let cy = 0; cy < Math.min(rows, edge + 1); cy++) {
      const front = cy === edge;
      if (front) { ctx.fillStyle = bodyBg; ctx.fillRect(0, cy * chH, w, chH); }
      for (let cx = 0; cx < cols; cx++) {
        const cell = cells[cy * cols + cx];
        if (front) { ctx.fillStyle = accent; ctx.fillText(RAMP[1 + (Math.random() * (RAMP.length - 1) | 0)], cx * cw, cy * chH); continue; }
        if (!cell) continue;
        ctx.fillStyle = cell[1]; ctx.fillText(cell[0], cx * cw, cy * chH);
      }
    }
  };

  const stopKeys = e => { if (e.key === 'Escape') abort = true; };
  addEventListener('keydown', stopKeys, true);
  let dirty = true;
  const onScroll = () => { dirty = true; };
  addEventListener('scroll', onScroll, { passive: true });

  say('-- ASCII --   esc to leave');
  barMode.textContent = 'ASCII';
  const SWEEP = reduceMotion ? 1 : 700;
  let t0 = null, last = 0, leaving = null;
  await frames(now => {
    if (t0 === null) t0 = now;
    if (abort && leaving === null) leaving = now;
    if (dirty || now - last > 120) { sample(); last = now; dirty = false; }
    const reveal = leaving !== null ? 1 - Math.min(1, (now - leaving) / (SWEEP * 0.6)) : Math.min(1, (now - t0) / SWEEP);
    draw(reveal);
    return !(leaving !== null && reveal <= 0);
  });

  removeEventListener('keydown', stopKeys, true);
  removeEventListener('scroll', onScroll);
  cv.remove();
  restoreBar();
}

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let kpos = 0;
const startAscii = run('konami', asciiMode);
document.addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  kpos = key === KONAMI[kpos] ? kpos + 1 : key === KONAMI[0] ? 1 : 0;
  if (kpos === KONAMI.length) { kpos = 0; startAscii(); }
});

/* ---------- 5. :sudo hire tyler  an incident report that is secretly a résumé ---------- */
async function hire() {
  const unlock = lockScroll(false);
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const mail = 'tythompson@davidson.edu';
  const lines = [
    ['', ''],
    ['m', 'visitor is not in the sudoers file.  This incident will be reported.'],
    ['', ''],
    ['h', `──── INCIDENT REPORT #${String(Math.floor(Math.random() * 9000) + 1000)} ────`],
    ['k', `filed     ${stamp}`],
    ['k', 'reporter  /usr/bin/sudo'],
    ['k', 'subject   visitor tried to hire tyler without a password'],
    ['k', 'severity  ████████░░ promising'],
    ['', ''],
    ['h', '── attached: tyler.thompson ──'],
    ['k', 'school    Davidson College · CS & Mathematics · class of ’28'],
    ['k', 'gpa       3.83'],
    ['k', 'focus     machine learning, computer vision, building products'],
    ['k', 'shipped   HMMA Direct: RAG assistant in production for NAAMM'],
    ['k', '          Blackjack card detection: OpenCV pipeline'],
    ['k', '          B2B Shopify storefront: American Industrial Solutions'],
    ['k', 'also      Division I sprinter'],
    ['', ''],
    ['h', '── resolution ──'],
    ['k', 'sudo will not help here. asking nicely will:'],
    ['a', `  → ${mail}`],
  ];

  const box = document.createElement('div');
  box.className = 'egg egg-hire';
  box.innerHTML = `<div class="egg-win" role="dialog" aria-label="sudo hire tyler">
    <div class="egg-title"><span>sudo — tyler@davidson</span><button type="button" aria-label="Close">esc ✕</button></div>
    <pre class="egg-out"></pre></div>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('on'));
  const out = box.querySelector('.egg-out');
  let closed = false;
  const close = () => { closed = true; };
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('.egg-title button')) close(); });

  const add = (cls, html) => {
    const row = document.createElement('div');
    if (cls) row.className = cls;
    row.innerHTML = html;
    out.appendChild(row);
    return row;
  };
  const fast = reduceMotion;
  const prompt = add('', '<span class="d">[sudo]</span> password for visitor: ');
  for (let i = 0; i < 8 && !fast && !abort && !closed; i++) { await wait(90 + Math.random() * 90); prompt.innerHTML += '*'; }
  if (fast) prompt.innerHTML += '********';
  else if (!abort && !closed) await wait(500);
  for (const [cls, text] of lines) {
    if (abort || closed) break;
    const html = cls === 'a' ? `  → <a href="mailto:${mail}">${mail}</a>` : esc(text);
    add(cls, html || '&nbsp;');
    if (!fast) await wait(cls === 'h' ? 260 : 70);
  }
  add('dim', '&nbsp;');
  add('dim', 'esc to close · e to email');

  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'e') { location.href = `mailto:${mail}`; close(); }
  };
  addEventListener('keydown', onKey);
  while (!abort && !closed) await wait(50);
  removeEventListener('keydown', onKey);
  box.classList.remove('on');
  await wait(250);
  box.remove(); unlock();
}

/* ---------- 6. :detect  object detection boxes on the live page ---------- */
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const alphaOf = el => {
  let a = 1;
  for (; el && el !== document.body; el = el.parentElement) a *= parseFloat(getComputedStyle(el).opacity);
  return a;
};

async function detect() {
  const { cv, ctx, w, h } = overlayCanvas('egg-full');
  const DETECT = [
    ['.about-text b', el => /sprinter/i.test(el.textContent) && ['sprinter', 1]],
    ['.hero h1', () => ['human_name', 0.99]],
    ['.brand', () => ['logo', 0.97]],
    ['.nav-links a', () => ['nav_link']],
    ['.btn', () => ['button']],
    ['.scene pre', () => ['ascii_art']],
    ['.editor', () => ['code_editor']],
    ['.hero-comment, .hero-sub', () => ['text']],
    ['.prompt', () => ['terminal']],
    ['.card', () => ['project']],
    ['.readout', () => ['stats_table']],
    ['.about-text p', () => ['paragraph']],
    ['.log li', () => ['job']],
    ['.contact-lead', () => ['call_to_action']],
    ['.contact-table a', () => ['link']],
    ['footer .wrap', () => ['footer']],
  ];
  const palette = ['--accent', '--kw', '--str', '--fg'].map(cssVar);
  const colorOf = label => palette[[...label].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
  const bg = cssVar('--bg');
  const objs = new Map();
  const t0 = performance.now(), SCAN = 900, barH = document.getElementById('bar').offsetHeight;

  const scan = now => {
    const seen = new Set();
    for (const [sel, name] of DETECT) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.size >= 40) break;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.bottom < 0 || r.top > h - barH || alphaOf(el) < 0.3) continue;
        const hit = name(el);
        if (!hit) continue;
        seen.add(el);
        if (!objs.has(el)) {
          // boxes appear as the scanner line passes them, then as they scroll into view
          const born = Math.max(now, t0 + clamp(r.top / h, 0, 1) * SCAN);
          objs.set(el, { label: hit[0], conf: hit[1] ?? 0.82 + Math.random() * 0.16, color: colorOf(hit[0]), born, seed: Math.random() * 99 });
        }
      }
    }
    for (const [el, o] of objs) if (!seen.has(el) && !o.dead) o.dead = now;
  };

  const stopKeys = e => { if (e.key === 'Escape') abort = true; };
  addEventListener('keydown', stopKeys, true);
  barMode.textContent = 'DETECT';
  let lastScan = 0, lastHud = 0, fps = 30, leaving = null;
  await frames((now, dt) => {
    if (abort && leaving === null) leaving = now;
    if (now - lastScan > 300) { scan(now); lastScan = now; }
    fps += ((1 / Math.max(dt, 0.001)) - fps) * 0.05;
    const fade = leaving === null ? 1 : 1 - (now - leaving) / 250;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, fade);

    const sy = (now - t0) / SCAN * h;
    if (sy < h) {
      ctx.fillStyle = palette[0];
      ctx.fillRect(0, sy, w, 1.5);
      const grd = ctx.createLinearGradient(0, sy - 40, 0, sy);
      grd.addColorStop(0, 'transparent'); grd.addColorStop(1, palette[0] + '33');
      ctx.fillStyle = grd; ctx.fillRect(0, sy - 40, w, 40);
    }

    ctx.font = `11px ${MONO}`; ctx.textBaseline = 'middle';
    let live = 0;
    for (const [el, o] of objs) {
      if (now < o.born) continue;
      const k = o.dead ? 1 - (now - o.dead) / 200 : ease(Math.min(1, (now - o.born) / 220));
      if (o.dead && k <= 0) { objs.delete(el); continue; }
      live++;
      const r = el.getBoundingClientRect(), pad = 4;
      const jx = Math.sin(now / 110 + o.seed) * 0.8, jy = Math.cos(now / 130 + o.seed) * 0.8;
      const cxm = r.left + r.width / 2, cym = r.top + r.height / 2;
      const bw = (r.width + pad * 2) * (0.6 + 0.4 * k), bh = (r.height + pad * 2) * (0.6 + 0.4 * k);
      const x = cxm - bw / 2 + jx, y = cym - bh / 2 + jy;
      ctx.globalAlpha = Math.max(0, fade) * Math.min(1, k * 1.2);
      ctx.strokeStyle = o.color; ctx.lineWidth = 1.25;
      ctx.strokeRect(x, y, bw, bh);
      ctx.lineWidth = 3;
      const c = Math.min(10, bw / 3, bh / 3);
      ctx.beginPath();
      ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
      ctx.moveTo(x + bw - c, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + c);
      ctx.moveTo(x + bw, y + bh - c); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + bw - c, y + bh);
      ctx.moveTo(x + c, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, y + bh - c);
      ctx.stroke();
      const conf = o.conf >= 1 ? 1 : clamp(o.conf + Math.sin(now / 400 + o.seed) * 0.008, 0, 0.999);
      const text = `${o.label} ${conf.toFixed(2)}`, tw = ctx.measureText(text).width + 10;
      const ly = y > 18 ? y - 16 : y;
      ctx.fillStyle = o.color; ctx.fillRect(x, ly, tw, 16);
      ctx.fillStyle = bg; ctx.fillText(text, x + 5, ly + 8.5);
    }
    if (now - lastHud > 400) { say(`yolo-tt · ${fps.toFixed(1)} fps · ${live} objects · esc to leave`); lastHud = now; }
    return !(leaving !== null && fade <= 0);
  });
  removeEventListener('keydown', stopKeys, true);
  cv.remove();
  restoreBar();
}

/* ---------- 7. :blackjack  a hand from a six-deck shoe, counted hi-lo ---------- */
function modal(title, cls) {
  const box = document.createElement('div');
  box.className = 'egg egg-hire ' + cls;
  box.innerHTML = `<div class="egg-win" role="dialog" aria-label="${esc(title)}">
    <div class="egg-title"><span>${esc(title)}</span><button type="button" aria-label="Close">esc ✕</button></div>
    <pre class="egg-out"></pre></div>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('on'));
  const m = { box, out: box.querySelector('.egg-out'), closed: false };
  box.addEventListener('click', e => { if (e.target === box || e.target.closest('.egg-title button')) m.closed = true; });
  m.remove = async () => { box.classList.remove('on'); await wait(250); box.remove(); };
  return m;
}

async function blackjack() {
  const unlock = lockScroll(false);
  const m = modal('blackjack — 6 decks · hi-lo', 'egg-bj');
  const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let shoe = [], running = 0;
  const shuffle = () => {
    shoe = [];
    for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
    for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
    running = 0;
  };
  const hilo = c => '23456'.includes(c.r) ? 1 : ['10', 'J', 'Q', 'K', 'A'].includes(c.r) ? -1 : 0;
  const score = cards => {
    let t = 0, aces = 0;
    for (const c of cards) { t += c.r === 'A' ? 11 : 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r; if (c.r === 'A') aces++; }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { t, soft: aces > 0 };
  };
  const draw = () => { const c = shoe.pop(); running += hilo(c); return c; };
  const up = c => c.r === 'A' ? 11 : 'JQK'.includes(c.r) || c.r === '10' ? 10 : +c.r;
  // basic strategy, hit/stand only
  const advice = (p, u) => {
    const { t, soft } = score(p);
    if (soft) return t >= 19 || (t === 18 && u <= 8) ? 'stand' : 'hit';
    if (t >= 17) return 'stand';
    if (t >= 13) return u <= 6 ? 'stand' : 'hit';
    if (t === 12) return u >= 4 && u <= 6 ? 'stand' : 'hit';
    return 'hit';
  };
  const cardArt = (c, hidden) => {
    if (hidden) return ['┌─────┐', '│░░░░░│', '│░░░░░│', '│░░░░░│', '└─────┘'];
    const red = c.s === '♥' || c.s === '♦', suit = `<span class="suit${red ? ' red' : ''}">${c.s}</span>`;
    const rk = s => red ? `<span class="red">${s}</span>` : s;
    return ['┌─────┐', `│${rk(c.r.padEnd(5))}│`, `│  ${suit}  │`, `│${rk(c.r.padStart(5))}│`, '└─────┘'];
  };
  const row = (cards, hideSecond) => {
    const arts = cards.map((c, i) => cardArt(c, hideSecond && i === 1));
    return [0, 1, 2, 3, 4].map(l => arts.map(a => a[l]).join(' ')).join('\n');
  };

  shuffle();
  let player, dealer, hidden, phase, result;
  const render = () => {
    const decks = shoe.length / 52, tc = running / Math.max(decks, 0.5);
    const ps = score(player), ds = !dealer.length ? '' : hidden ? up(dealer[0]) : score(dealer).t;
    const tip = phase === 'play' ? ` · strategy says: <b>${advice(player, up(dealer[0]))}</b>` : '';
    const sign = n => (n > 0 ? '+' : '') + n;
    m.out.innerHTML =
      `<span class="h">dealer</span>  ${dealer.length ? (hidden ? 'shows ' : '') + ds : ''}\n${row(dealer, hidden)}\n\n` +
      `<span class="h">you</span>     ${player.length ? (ps.soft && ps.t < 21 ? 'soft ' : '') + ps.t : ''}${tip}\n${row(player)}\n\n` +
      `<span class="dim">running count</span> ${sign(running)}  <span class="dim">true count</span> ${sign(+tc.toFixed(1))}  <span class="dim">decks left</span> ${decks.toFixed(1)}\n` +
      (result ? `\n<span class="m">${esc(result)}</span>\n` : '\n\n') +
      `\n<span class="egg-acts">${phase === 'play' ? '<button data-act="h">[h] hit</button> <button data-act="s">[s] stand</button> ' : ''}` +
      `${phase === 'done' ? '<button data-act="n">[n] new hand</button> ' : ''}<button data-act="q">[esc] leave</button></span>`;
  };
  const verdict = () => {
    const tc = running / Math.max(shoe.length / 52, 0.5);
    return tc >= 2 ? `true count ${tc.toFixed(1)}: the shoe is rich in tens. bet bigger.`
      : tc <= -2 ? `true count ${tc.toFixed(1)}: lots of small cards left. bet small.`
      : 'count is near zero: no edge either way.';
  };
  const finish = text => { phase = 'done'; hidden = false; result = `${text}\n${verdict()}`; render(); };

  const deal = async () => {
    if (shoe.length < 78) { shuffle(); result = 'shuffling a fresh shoe…'; }
    else result = '';
    player = []; dealer = []; hidden = true; phase = 'deal'; render();
    for (const hand of [player, dealer, player, dealer]) { await wait(reduceMotion ? 0 : 260); hand.push(hand === dealer && dealer.length === 1 ? shoe.pop() : draw()); render(); }
    result = '';
    const p = score(player).t, d = score(dealer).t;
    if (p === 21 || d === 21) {
      running += hilo(dealer[1]);
      return finish(p === 21 && d === 21 ? 'both blackjack. push.' : p === 21 ? 'blackjack. pays 3 to 2.' : 'dealer blackjack.');
    }
    phase = 'play'; render();
  };
  const act = async a => {
    if (a === 'q') { m.closed = true; return; }
    if (a === 'n' && phase === 'done') return deal();
    if (phase !== 'play') return;
    if (a === 'h') {
      player.push(draw()); render();
      if (score(player).t > 21) { running += hilo(dealer[1]); finish(`bust with ${score(player).t}.`); }
      else if (score(player).t === 21) act('s');
    }
    if (a === 's') {
      phase = 'dealer'; hidden = false; running += hilo(dealer[1]); render();
      while (score(dealer).t < 17) { await wait(reduceMotion ? 0 : 450); dealer.push(draw()); render(); }
      const p = score(player).t, d = score(dealer).t;
      finish(d > 21 ? `dealer busts with ${d}. you win.` : p > d ? `${p} beats ${d}. you win.` : p < d ? `${d} beats ${p}. dealer wins.` : `push at ${p}.`);
    }
  };
  m.box.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
  const onKey = e => { if ('hsn'.includes(e.key) && e.key.length === 1) act(e.key); };
  addEventListener('keydown', onKey);
  await deal();
  while (!abort && !m.closed) await wait(50);
  removeEventListener('keydown', onKey);
  await m.remove(); unlock();
}

/* ---------- 8. idle for a minute  a bouncing-logo screensaver ---------- */
async function screensaver() {
  if (reduceMotion) return flash('zzz');
  const { cv, ctx, w, h } = overlayCanvas('egg-full egg-saver');
  const palette = ['--accent', '--kw', '--str', '--fg'].map(cssVar), bg = cssVar('--bg');
  const BW = 132, BH = 78;
  let x = Math.random() * (w - BW), y = Math.random() * (h - BH), vx = 150, vy = 115, ci = 0, corners = 0, cornerAt = -1e9;
  const started = performance.now();
  const wake = () => { if (performance.now() - started > 600) abort = true; };
  const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
  evs.forEach(ev => addEventListener(ev, wake, true));
  let out = null;
  await frames((now, dt) => {
    if (abort && out === null) out = now;
    let hx = false, hy = false;
    x += vx * dt; y += vy * dt;
    if (x <= 0 || x >= w - BW) { vx = -vx; x = clamp(x, 0, w - BW); hx = true; }
    if (y <= 0 || y >= h - BH) { vy = -vy; y = clamp(y, 0, h - BH); hy = true; }
    if (hx || hy) ci = (ci + 1) % palette.length;
    if (hx && hy) { corners++; cornerAt = now; }
    const fade = out === null ? Math.min(1, (now - started) / 600) : 1 - (now - out) / 250;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = bg; ctx.globalAlpha = Math.max(0, fade) * 0.94; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.strokeStyle = ctx.fillStyle = palette[ci]; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 52, 52);
    ctx.font = `700 24px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TT', x + 27, y + 28);
    ctx.font = `500 12px ${MONO}`; ctx.textAlign = 'left';
    ctx.fillText('tyler', x + 62, y + 18); ctx.fillText('.thompson', x + 62, y + 36);
    ctx.font = `10px ${MONO}`; ctx.fillStyle = palette[3]; ctx.globalAlpha = Math.max(0, fade) * 0.4;
    ctx.fillText('move anything to wake', x, y + 70);
    if (now - cornerAt < 1800) {
      ctx.globalAlpha = Math.max(0, fade) * (1 - (now - cornerAt) / 1800);
      ctx.fillStyle = palette[0]; ctx.font = `500 ${Math.min(64, w / 10)}px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(`CORNER${corners > 1 ? ' ×' + corners : ''}.`, w / 2, h / 2);
    }
    const d = new Date(), clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    ctx.globalAlpha = Math.max(0, fade) * 0.35; ctx.fillStyle = palette[3]; ctx.font = `12px ${MONO}`; ctx.textAlign = 'right';
    ctx.fillText(clock, w - 16, h - 46);
    ctx.textAlign = 'left';
    return !(out !== null && fade <= 0);
  });
  evs.forEach(ev => removeEventListener(ev, wake, true));
  cv.remove();
}

/* ---------- 9. :train  gradient descent, stuck once, then momentum gets out ---------- */
async function train() {
  // one deep basin on the right, a shallow trap on the left; tuned so plain descent from the
  // start settles in the trap and momentum 0.95 rolls through it to the global minimum
  const f = (x, y) => 1.2 - 1.1 * Math.exp(-((x - 1.4) ** 2 + (y + 0.2) ** 2)) - 0.3 * Math.exp(-((x + 1.0) ** 2 + (y - 0.3) ** 2) / 0.3) + 0.03 * (x * x + 2 * y * y);
  const grad = (x, y, e = 1e-4) => [(f(x + e, y) - f(x - e, y)) / (2 * e), (f(x, y + e) - f(x, y - e)) / (2 * e)];
  const START = [-2.6, 1.2], LR = 0.1, FMIN = f(1.36, -0.19);
  if (reduceMotion) return flash(`train · sgd: local min, loss ${(f(-0.96, 0.28) - FMIN).toFixed(3)} · momentum: global min, loss 0.000`);

  goTo('top');
  const unlock = lockScroll();
  const box = document.createElement('div');
  box.className = 'egg egg-sprint';
  box.innerHTML = '<pre></pre><div class="egg-head"></div><div class="egg-note"></div>';
  document.body.appendChild(box);
  const pre = box.querySelector('pre'), head = box.querySelector('.egg-head'), note = box.querySelector('.egg-note');
  requestAnimationFrame(() => box.classList.add('on'));
  const probe = document.createElement('span');
  probe.textContent = 'M'.repeat(10); pre.appendChild(probe);
  const colW = probe.getBoundingClientRect().width / 10, rowH = parseFloat(getComputedStyle(pre).lineHeight);
  probe.remove();
  const cols = Math.floor(innerWidth / colW), rows = Math.floor((innerHeight - 30) / rowH);
  const grid = makeGrid(cols, rows, rowH / colW);
  const XH = 3.2, YH = XH * (rows * rowH) / (cols * colW);
  const toCell = (x, y) => [(x + XH) / (2 * XH) * cols, (y + YH) / (2 * YH) * rows];

  // the landscape as contour lines only, denser glyphs nearer the bottom
  const field = [];
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = f(-XH + (c + 0.5) / cols * 2 * XH, -YH + (r + 0.5) / rows * 2 * YH);
    field.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const LEVELS = 14, level = v => Math.floor((v - lo) / (hi - lo) * LEVELS);
  const landscape = reveal => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r / rows > reveal) continue;
      const i = r * cols + c, lv = level(field[i]);
      const edge = (c + 1 < cols && level(field[i + 1]) !== lv) || (r + 1 < rows && level(field[i + cols]) !== lv);
      if (edge) grid.put(c, r, lv < 2 ? '~' : lv < 5 ? ':' : '.', lv < 5 ? 1 : 0);
    }
  };
  const paint = () => { pre.innerHTML = grid.html(); };
  const trails = [];
  const run1 = { x: START[0], y: START[1], vx: 0, vy: 0, path: [], tone: 2 };

  let t0 = null;
  await frames(now => {
    if (t0 === null) t0 = now;
    const k = Math.min(1, (now - t0) / 800);
    grid.clear(); landscape(ease(k)); paint();
    return k < 1 && !abort;
  });

  const descend = async (p, beta, label) => {
    let epoch = 0, still = 0;
    trails.push(p);
    await frames(() => {
      for (let s = 0; s < 2; s++) {
        const [gx, gy] = grad(p.x, p.y);
        p.vx = beta * p.vx - LR * gx; p.vy = beta * p.vy - LR * gy;
        p.x += p.vx; p.y += p.vy; epoch++;
        p.path.push(toCell(p.x, p.y));
        still = Math.hypot(gx, gy) < 2e-3 && Math.hypot(p.vx, p.vy) < 1e-3 ? still + 1 : 0;
      }
      head.textContent = `train.py · ${label} · lr=${LR} · epoch ${epoch} · loss ${Math.max(0, f(p.x, p.y) - FMIN).toFixed(4)}`;
      grid.clear(); landscape(1);
      for (const t of trails) {
        // join the steps so momentum's long strides still read as one path
        t.path.forEach(([x, y], i) => {
          const [px, py] = t.path[i - 1] || [x, y], n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py)));
          for (let j = 1; j <= n; j++) grid.put(px + (x - px) * j / n, py + (y - py) * j / n, '·', t.tone);
        });
        const [x, y] = toCell(t.x, t.y);
        grid.put(x, y, '@', t === p ? 3 : 2);
      }
      paint();
      return !abort && still < 4 && epoch < 600;
    });
    return Math.max(0, f(p.x, p.y) - FMIN);
  };

  const say2 = text => { note.textContent = text; note.classList.remove('pop'); void note.offsetWidth; note.classList.add('pop'); };
  const pause = async ms => { const end = performance.now() + ms; while (!abort && performance.now() < end) await wait(30); };
  say2('attempt 1: plain gradient descent');
  await pause(900);
  if (!abort) {
    const loss1 = await descend(run1, 0, 'sgd');
    say2(`stuck in a local minimum · loss ${loss1.toFixed(3)}`);
    const [lx, ly] = toCell(run1.x, run1.y); grid.text(lx + 2, ly, 'local min', 1); paint();
    await pause(1800);
  }
  if (!abort) {
    say2('attempt 2: same start, momentum 0.95');
    await pause(900);
    const run2 = { x: START[0], y: START[1], vx: 0, vy: 0, path: [], tone: 3 };
    const loss2 = await descend(run2, 0.95, 'sgd+momentum');
    say2(`converged · global minimum · loss ${loss2.toFixed(4)}`);
    const [gx, gy] = toCell(run2.x, run2.y); grid.text(gx + 2, gy, 'global min', 3); paint();
    await pause(2600);
  }
  box.classList.remove('on');
  await wait(300);
  box.remove(); unlock();
  flash('model saved to /dev/null');
}

/* ---------- 10. :snake  eat the letters on the page ---------- */
async function snake() {
  if (reduceMotion) return flash('snake needs motion. it is waiting for you elsewhere.');
  const glyphs = visibleGlyphs();
  const { cv, ctx, w, h } = overlayCanvas('egg-full');
  document.body.classList.add('egg-gone');
  const unlock = lockScroll();
  const barH = document.getElementById('bar').offsetHeight;
  const C = innerWidth < 600 ? 18 : 16, cols = Math.floor(w / C), rows = Math.floor((h - barH) / C);
  const cells = new Map(), key = (x, y) => y * cols + x;
  glyphs.forEach(g => {
    const k = key(Math.floor((g.x + g.w / 2) / C), Math.floor((g.y + g.h / 2) / C));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(g);
  });
  const accent = cssVar('--accent'), fg = cssVar('--fg');
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const KEYS = { ArrowUp: 'up', w: 'up', k: 'up', ArrowDown: 'down', s: 'down', j: 'down', ArrowLeft: 'left', a: 'left', h: 'left', ArrowRight: 'right', d: 'right', l: 'right' };
  const midY = Math.floor(rows / 2);
  let body = [0, 1, 2, 3, 4].map(i => [4 - i + 2, midY]), dir = null, queue = [], grow = 0, eaten = 0, dead = false;
  let best = 0;
  try { best = +localStorage.getItem('snake-best') || 0; } catch (e) {}

  const turn = d => {
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (!last || DIRS[d][0] !== -DIRS[last][0] || DIRS[d][1] !== -DIRS[last][1]) queue.push(d);
  };
  const onKey = e => { const d = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (d) turn(d); };
  let touch = null;
  const onStart = e => { touch = [e.touches[0].clientX, e.touches[0].clientY]; };
  const onEnd = e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch[0], dy = e.changedTouches[0].clientY - touch[1];
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    touch = null;
  };
  addEventListener('keydown', onKey, true);
  addEventListener('touchstart', onStart, { passive: true });
  addEventListener('touchend', onEnd);

  const draw = (now, flashHead) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const g of glyphs) {
      if (g.eaten) continue;
      ctx.globalAlpha = g.alpha; ctx.font = g.font; ctx.fillStyle = g.color;
      ctx.fillText(g.ch, g.x, g.y + g.h / 2);
    }
    ctx.globalAlpha = 1;
    body.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? (flashHead ? accent : fg) : accent;
      ctx.globalAlpha = i === 0 ? 1 : 0.55 + 0.45 * (1 - i / body.length);
      ctx.fillRect(x * C + 1, y * C + 1, C - 2, C - 2);
    });
    ctx.globalAlpha = 1;
  };

  say(`snake · hjkl, arrows or swipe to start · esc quits${best ? ` · best ${best}` : ''}`);
  let acc = 0;
  await frames((now, dt) => {
    if (abort) return false;
    if (!dir && queue.length) dir = queue.shift();
    if (dir) {
      acc += dt * 1000;
      const interval = Math.max(55, 95 - eaten * 0.08);
      while (acc >= interval && !dead) {
        acc -= interval;
        if (queue.length) dir = queue.shift();
        const [hx, hy] = body[0], nx = hx + DIRS[dir][0], ny = hy + DIRS[dir][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || body.some(([x, y], i) => i < body.length - 1 && x === nx && y === ny)) { dead = true; break; }
        body.unshift([nx, ny]);
        const food = (cells.get(key(nx, ny)) || []).filter(g => !g.eaten);
        food.forEach(g => { g.eaten = true; });
        eaten += food.length; grow += food.length / 3;
        if (grow >= 1) grow -= 1; else body.pop();
      }
      if (!dead) say(`snake · ${eaten} letters eaten · esc quits${best ? ` · best ${best}` : ''}`);
    }
    draw(now, false);
    return !dead;
  });

  if (dead) {
    if (eaten > best) { best = eaten; try { localStorage.setItem('snake-best', String(eaten)); } catch (e) {} }
    for (let i = 0; i < 6; i++) { draw(0, i % 2 === 0); await wait(120); }
    say(`game over · ${eaten} letters eaten${eaten >= best && eaten ? ' · new best' : ` · best ${best}`}`);
    await wait(1400);
  }
  removeEventListener('keydown', onKey, true);
  removeEventListener('touchstart', onStart);
  removeEventListener('touchend', onEnd);
  // eaten letters fade back in
  const t0 = performance.now(), back = glyphs.filter(g => g.eaten);
  await frames(now => {
    const k = Math.min(1, (now - t0) / 500);
    back.forEach(g => { g.eaten = false; g.alpha = (g.alpha0 ??= g.alpha) * k; });
    body = body.slice(0, Math.ceil(body.length * (1 - k)));
    draw(now, false);
    return k < 1;
  });
  document.body.classList.remove('egg-gone');
  cv.remove(); unlock();
  restoreBar();
}

/* ---------- 12–14. first person: a few hand-drawn lines, and blinking ---------- */
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

// a full-screen canvas with a pencil whose lines "boil" (re-jitter ~9 times a second, like hand animation)
function fpStage() {
  const { cv, ctx, w, h } = overlayCanvas('egg-full egg-fp');
  const col = {};
  ['bg', 'fg', 'muted', 'faint', 'accent', 'kw', 'str', 'panel'].forEach(k => { col[k] = cssVar('--' + k); });
  const s = Math.max(0.62, Math.min(w, h * 1.4) / 900); // drawing scale, with a floor so phones stay legible
  let seed = 0;
  const pen = {
    boil(t) { seed = Math.floor(t * 9); },
    get seed() { return seed; },
    path(pts, o = {}) {
      const { color = col.fg, width = 1.3, jit = 1.4, passes = 2, alpha = 1, close = false } = o;
      const id = o.id ?? (Math.round(pts[0][0]) * 7 + Math.round(pts[0][1]) * 13);
      ctx.lineCap = ctx.lineJoin = 'round';
      if (o.fill) {
        ctx.globalAlpha = o.fillAlpha ?? 1; ctx.fillStyle = o.fill;
        ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = color; ctx.lineWidth = width * Math.max(0.7, s); ctx.globalAlpha = alpha;
      for (let p = 0; p < passes; p++) {
        ctx.beginPath();
        pts.forEach(([x, y], i) => {
          const k = seed * 131 + p * 997 + i * 17 + id * 0.0137;
          const nx = x + hash(k) * jit * s, ny = y + hash(k + 3.3) * jit * s;
          i ? ctx.lineTo(nx, ny) : ctx.moveTo(nx, ny);
        });
        if (close) ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    // densified so long strokes wobble along their length, not just at the ends
    line(pts, o) {
      // points behind the camera come in as null: draw each visible run on its own
      if (pts.some(p => !p)) {
        let run = [];
        for (const p of [...pts, null]) { if (p) run.push(p); else { if (run.length > 1) pen.line(run, o); run = []; } }
        return;
      }
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 26));
        for (let j = 1; j <= n; j++) out.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n]);
      }
      pen.path(out, o);
    },
    // pencil shading between two edges
    hatch(a0, a1, b0, b1, n, o = {}) {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, u = Math.min(1, t + 0.15);
        pen.path([[a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t], [b0[0] + (b1[0] - b0[0]) * u, b0[1] + (b1[1] - b0[1]) * u]],
          { width: 0.8, jit: 1.2, passes: 1, alpha: 0.55, color: col.muted, ...o, id: (o.id || 0) + i * 31 });
      }
    },
    // solid shape in the page colour, so a hand or arm hides whatever is behind it
    cover(pts) {
      ctx.globalAlpha = 1; ctx.fillStyle = col.bg;
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
    },
    blob(cx, cy, rx, ry, o) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      if (o && o.solid) pen.cover(pts);
      pen.path(pts, o);
    },
    text(str, x, y, size, o = {}) {
      ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 400} ${size * s}px ${o.font || MONO}`;
      ctx.fillStyle = o.color || col.fg; ctx.globalAlpha = o.alpha ?? 1;
      ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(str, x, y);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    },
  };
  return { cv, ctx, w, h, col, pen, s };
}

// eyelids: b = 0 open … 1 shut. The edge is drawn as a pencil line too
// eyelids from the inside: the open eye is an almond that narrows to a slit and shuts. Lids are too close
// to focus on, so the rim is soft: it's stroked several times, wide and faint, inside the opening (cheap,
// unlike a blur filter, which matters because a tired runner's lids are half-down every frame). b = 0 open … 1 shut
function lids(st, b) {
  if (b <= 0.01) return;
  const { ctx, w, h } = st;
  if (b >= 0.985) { ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, w, h); return; }
  const cy = h * (0.5 + 0.07 * b);                   // the upper lid travels further than the lower one
  const top = cy - h * 0.74 * (1 - b), bot = cy + h * 0.62 * Math.pow(1 - b, 1.2);
  const x0 = w / 2 - w * 0.95, x1 = w / 2 + w * 0.95, ct = 2 * top - cy, cb = 2 * bot - cy;
  const almond = () => { ctx.moveTo(x0, cy); ctx.quadraticCurveTo(w / 2, ct, x1, cy); ctx.quadraticCurveTo(w / 2, cb, x0, cy); };
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = '#030303';
  ctx.beginPath(); ctx.rect(-100, -100, w + 200, h + 200); almond(); ctx.fill('evenodd');
  ctx.beginPath(); almond(); ctx.clip();
  const soft = h * (0.05 + 0.08 * b);
  for (const [k, a] of [[2, 0.12], [1.3, 0.16], [0.75, 0.22], [0.35, 0.35]]) {
    ctx.globalAlpha = a; ctx.lineWidth = soft * k;
    ctx.beginPath(); almond(); ctx.stroke();
  }
  // lashes: thin dark strands hanging off the upper lid once it's on its way down
  if (b > 0.15) {
    ctx.lineCap = 'round';
    for (let i = 1; i < 30; i++) {
      const u = i / 30, x = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * (w / 2) + u * u * x1, y = (1 - u) ** 2 * cy + 2 * (1 - u) * u * ct + u * u * cy;
      if (y < -20 || y > h) continue;
      const len = h * (0.02 + 0.025 * (hash(i * 3.7) + 1)) * b, lean = (u - 0.5) * 0.9 + hash(i) * 0.2;
      ctx.globalAlpha = 0.35 + 0.35 * b; ctx.lineWidth = 2 + 2 * b;
      ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + lean * len * 0.3, y + len * 0.6, x + lean * len, y + len); ctx.stroke();
    }
  }
  ctx.restore();
}
const blinkAt = (t, at, hold = 0.06, close = 0.08, open = 0.17) => {
  const u = t - at;
  if (u < 0 || u > close + hold + open) return 0;
  return u < close ? u / close : u < close + hold ? 1 : 1 - (u - close - hold) / open;
};
function vignette(st, k) {
  const { ctx, w, h } = st;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (0.32 - k * 0.18), w / 2, h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function caption(st, text, t) {
  const n = Math.floor(clamp(t * 28, 0, text.length));
  st.pen.text(text.slice(0, n) + (n < text.length || Math.floor(t * 2) % 2 ? '█' : ''), 24, st.h - 58, 13, { color: st.col.muted });
}
// pinhole camera over the track: x across (m), y up (m), z ahead (m); yaw > 0 turns the head left.
// Points behind the camera come back null
const camera = (st, eye, horizon, roll = 0, yaw = 0) => {
  const F = st.h * 0.85, cr = Math.cos(roll), sr = Math.sin(roll), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return (x, y, z) => {
    const xr = x * cy + z * sy, zr = z * cy - x * sy;
    if (zr < 0.3) return null;
    const px = st.w / 2 + xr * F / zr, py = horizon + (eye - y) * F / zr;
    return roll ? [st.w / 2 + (px - st.w / 2) * cr - (py - st.h / 2) * sr, st.h / 2 + (px - st.w / 2) * sr + (py - st.h / 2) * cr] : [px, py];
  };
};
const LANE_X = [-4.27, -3.05, -1.83, -0.61, 0.61, 1.83, 3.05, 4.27, 5.49];

// lanes run straight until `bend` metres ahead, then curve left round the bend the way a real track does
// (lane 4's centre is 41.07m from the bend's centre; lane 1's line is at 36.8m)
function drawTrack(st, P, d = 0, bend = 150, near = 0.45) {
  const { pen, col } = st, CX = -41.07;
  LANE_X.forEach((x, i) => {
    const mine = Math.abs(x) < 1, R = x - CX, pts = [];
    if (bend > near) for (const z of [near, 1, 2, 4, 8, 15, 25, 40, 60, 90, 130]) { if (z < bend) pts.push(P(x, 0, z)); }
    for (let a = 0; a <= 1.25; a += 0.05) pts.push(P(CX + R * Math.cos(a), 0, bend + R * Math.sin(a)));
    pen.line(pts, { color: mine ? col.fg : col.muted, width: mine ? 1.6 : 1.1, alpha: mine ? 1 : 0.8, id: 40 + i });
    // the little painted marks every 10m along each lane line
    for (let m = Math.ceil(d / 10) * 10; m < d + 70; m += 10) {
      const z = m - d;
      if (z < near + 0.3 || z > bend) continue;
      pen.line([P(x - 0.12, 0, z), P(x + 0.12, 0, z)], { color: col.faint, width: 1, passes: 1, id: 600 + i * 13 + m });
    }
  });
}

/* hands: real outlines, drawn with a fast, chaotic pencil */
// one hand from above, fingers up (-y), fingertips near y = 0 and the wrist at y = 1, thumb on the +x side.
// fingers: how far each finger reaches, pinky → index (1 = straight out); thumb: [length, angle out from straight up]
function handShape(fingers = [1, 1, 1, 1], thumb = [1, 0.95]) {
  const base = [[-0.25, 0.44], [-0.1, 0.39], [0.05, 0.38], [0.19, 0.41]];
  const width = [0.05, 0.06, 0.063, 0.06], reach = [0.27, 0.36, 0.4, 0.36];
  const outline = [[-0.25, 1.0], [-0.31, 0.78], [-0.32, 0.56]], details = [], tips = [];
  base.forEach(([bx, by], i) => {
    const L = reach[i] * fingers[i], wd = width[i], lean = (i - 1.6) * 0.07;
    const tx = bx + lean * L, ty = by - L;
    outline.push(i === 0 ? [-0.305, by + 0.03] : [bx - wd, by + 0.03],
      [tx - wd * 0.98, ty + wd * 1.1], [tx - wd * 0.7, ty + wd * 0.25], [tx, ty - wd * 0.1], [tx + wd * 0.7, ty + wd * 0.25], [tx + wd * 0.98, ty + wd * 1.1],
      [bx + wd, by + 0.035]);
    tips.push([tx, ty]);
    details.push([[bx - wd * 0.8, by + 0.005], [bx - wd * 0.2, by - 0.03], [bx + wd * 0.6, by - 0.02]]);       // knuckle
    const jx = bx + lean * L * 0.5, jy = by - L * 0.52;
    details.push([[jx - wd * 0.55, jy + 0.01], [jx, jy - 0.004], [jx + wd * 0.5, jy + 0.012]]);                  // joint crease
    if (fingers[i] > 0.55) details.push([[tx - wd * 0.42, ty + wd * 0.35], [tx - wd * 0.45, ty + wd * 1.25], [tx, ty + wd * 1.5], [tx + wd * 0.45, ty + wd * 1.25], [tx + wd * 0.42, ty + wd * 0.35]]); // nail
    details.push([[bx + 0.005, by + 0.06], [bx * 0.55, 0.84]]);                                                   // tendon
  });
  const [tl, ta] = thumb, tb = [0.27, 0.62], u = [Math.sin(ta), -Math.cos(ta)], n = [Math.cos(ta), Math.sin(ta)];
  const along = (k, off) => [tb[0] + u[0] * 0.38 * tl * k + n[0] * off, tb[1] + u[1] * 0.38 * tl * k + n[1] * off];
  outline.push([0.245, 0.47], along(0.45, -0.055), along(0.85, -0.05), along(1.0, -0.02), along(1.03, 0.015), along(0.92, 0.06), along(0.5, 0.075), [0.315, 0.74], [0.25, 1.0]);
  details.push([along(0.86, -0.03), along(0.8, 0.0), along(0.86, 0.035)]);  // thumbnail
  details.push([along(0.55, -0.045), along(0.5, 0.055)]);                  // thumb joint
  details.push([[0.0, 0.62], [0.08, 0.66], [0.17, 0.64]]);                 // the back of the hand's crease
  return { outline, details, tips };
}

// a closed fist from behind and above as it swings up: knuckles on top, thumb wrapped over the front
function fistShape() {
  const outline = [[-0.3, 0.6], [-0.37, 0.25], [-0.36, -0.1], [-0.28, -0.3], [-0.14, -0.38], [0.03, -0.4], [0.2, -0.36], [0.33, -0.24], [0.38, -0.02], [0.36, 0.24], [0.28, 0.48], [0.22, 0.6]];
  const details = [];
  [-0.21, -0.06, 0.09, 0.23].forEach((x, i) => {
    details.push([[x - 0.06, -0.31 + i * 0.01], [x, -0.37 + Math.abs(i - 1.5) * 0.015], [x + 0.06, -0.31 + i * 0.01]]);   // knuckle bumps
    details.push([[x - 0.02, -0.28], [x - 0.04, -0.12]]);                                                                   // curled finger edge
  });
  details.push([[-0.34, -0.08], [-0.1, -0.1], [0.12, -0.06], [0.3, -0.12]]);   // second row of joints
  details.push([[-0.36, 0.14], [-0.15, 0.06], [0.06, 0.04], [0.16, -0.02], [0.12, 0.1], [-0.12, 0.2], [-0.33, 0.3]]); // thumb across
  details.push([[0.08, 0.0], [0.12, 0.04]]);                                   // thumbnail
  return { outline, details, tips: [[0.03, -0.4]] };
}

// local shape coords → screen: the local point `anchor` lands on `at`, the shape's "up" points along `dir`,
// k is pixels per unit, and `mirror` flips it into a left hand
const placer = (anchor, at, dir, k, mirror) => ([x, y]) => {
  const lx = (mirror ? -x : x) - (mirror ? -anchor[0] : anchor[0]), ly = y - anchor[1];
  const phi = dir + Math.PI / 2, c = Math.cos(phi), sn = Math.sin(phi);
  return [at[0] + (lx * c - ly * sn) * k, at[1] + (lx * sn + ly * c) * k];
};

// a shape in fast pencil: filled to hide what's behind it, cross-hatched on the side away from the light
// (clipped to the shape), then outlined in several loose passes that start in different places, wander
// off each other and overshoot their ends
function sketch(st, pts, details = [], o = {}) {
  const { ctx, pen, col, s } = st, id = o.id || 0, n = pts.length, seed = pen.seed;
  pen.cover(pts);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
  const lx = Math.cos(o.light ?? -2.3), ly = Math.sin(o.light ?? -2.3);
  ctx.save();
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
  if (o.shade !== false) [[0.75, 4.5, 0.55, -0.15], [-0.55, 6.5, 0.4, 0.3]].forEach(([ang, gap, alpha, from], layer) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let off = -R, j = 0; off < R; off += gap * Math.max(s, 0.7), j++) {
      const px = cx - dy * off, py = cy + dx * off;
      const side = -((px - cx) * lx + (py - cy) * ly) / R; // -1 toward the light … 1 away from it
      if (side < from) continue;
      const len = R * (0.5 + 0.5 * Math.abs(hash(id * 3 + j * 7.1 + layer)));
      const mid = (hash(id + j * 5.3 + layer * 9) * 0.5) * len;
      pen.path([[px - dx * (len - mid), py - dy * (len - mid)], [px + dx * (len + mid), py + dy * (len + mid)]],
        { color: col.muted, width: 0.75, jit: 1.4, passes: 1, alpha: alpha * clamp((side - from) * 1.6, 0, 1), id: id * 31 + layer * 977 + j });
    }
  });
  ctx.restore();
  [[1.8, 1, 0], [1.15, 0.8, 1], [0.75, 0.6, 2]].forEach(([wd, alpha, p]) => {
    const r = Math.floor((hash(seed * 1.3 + id + p * 17) + 1) / 2 * n);
    const sx = hash(seed + id * 3 + p * 5) * 1.8 * s, sy = hash(seed + id * 5 + p * 11) * 1.8 * s;
    const seq = [];
    for (let i = 0; i <= n + 1; i++) { const [x, y] = pts[(r + i) % n]; seq.push([x + sx, y + sy]); }
    // overshoot: carry the stroke a little past where it started
    const [ax, ay] = seq[seq.length - 2], [bx, by] = seq[seq.length - 1];
    seq.push([bx + (bx - ax) * 0.5, by + (by - ay) * 0.5]);
    pen.path(seq, { color: o.color || col.fg, width: wd, alpha, jit: 1.2, passes: 1, id: id * 13 + p });
  });
  details.forEach((d, i) => pen.path(d, { color: o.color || col.fg, width: 1, alpha: 0.85, jit: 0.9, passes: 2, id: id * 7 + 300 + i }));
  // a couple of stray marks just off the edge, the way a quick sketch has them
  for (let i = 0; i < 3; i++) {
    const k = Math.floor((hash(seed * 0.7 + id + i * 19) + 1) / 2 * n), [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % n];
    const nx = (ay - by), ny = (bx - ax), nl = Math.hypot(nx, ny) || 1, o2 = 3 * s;
    pen.path([[ax + nx / nl * o2, ay + ny / nl * o2], [ax + (bx - ax) * 0.7 + nx / nl * o2, ay + (by - ay) * 0.7 + ny / nl * o2]], { color: col.muted, width: 0.8, alpha: 0.6, passes: 1, id: id * 17 + i });
  }
}

// a forearm or upper arm: tapered, with a slight bulge
function limb(st, a, b, wa, wb, id, light) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], wm = (wa + wb) / 2 * 1.08;
  sketch(st, [[a[0] + nx * wa, a[1] + ny * wa], [m[0] + nx * wm, m[1] + ny * wm], [b[0] + nx * wb, b[1] + ny * wb],
    [b[0] - nx * wb, b[1] - ny * wb], [m[0] - nx * wm, m[1] - ny * wm], [a[0] - nx * wa, a[1] - ny * wa]], [], { id, light });
}

// draw a hand (and its forearm, from the wrist off toward `elbow`)
function drawHand(st, shape, at, anchor, dir, k, mirror, elbow, id) {
  const T = placer(anchor, at, dir, k, mirror);
  const wrist = T([0, 1.0]);
  if (elbow) limb(st, elbow, wrist, k * 0.42, k * 0.29, id + 50, mirror ? -0.8 : -2.3);
  sketch(st, shape.outline.map(T), shape.details.map(d => d.map(T)), { id, light: mirror ? -0.8 : -2.3 });
}
const centroid = pts => pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]);

function sceneBlocks(st, t, set = 0, bend = 150) {
  const { pen, col, w, h, s } = st;
  const breath = Math.sin(t * 1.7) * 3 * s;
  const P = camera(st, 0.62 + set * 0.25, h * (0.3 + set * 0.05) + breath);
  pen.line([[0, P(0, 0, 400)[1]], [w, P(0, 0, 400)[1]]], { color: col.faint, id: 1 });
  // a few far-off things: two light towers and the stand's roofline
  for (const x of [-26, 30]) {
    const a = P(x, 0, 90), b = P(x, 22, 90);
    pen.line([a, b], { color: col.faint, id: 2 + x });
    pen.line([[b[0] - 10 * s, b[1]], [b[0] + 10 * s, b[1]]], { color: col.faint, width: 2, id: 3 + x });
  }
  pen.line([P(-60, 5, 120), P(-14, 5, 120)], { color: col.faint, alpha: 0.7, id: 5 });
  drawTrack(st, P, 0, bend);
  pen.line([P(-4.4, 0, 1.0), P(5.6, 0, 1.0)], { width: 2.4, passes: 3, id: 7 });
  // the lane number painted on the track
  pen.line([P(0.16, 0, 3.4), P(-0.24, 0, 2.55), P(0.26, 0, 2.55)], { color: col.muted, width: 3.5, passes: 2, alpha: 0.6, id: 6 });
  pen.line([P(0.12, 0, 3.45), P(0.12, 0, 2.15)], { color: col.muted, width: 3.5, passes: 2, alpha: 0.6, id: 61 });
  // hands bridged just behind the line, fingers on the tips; a little smaller once the hips come up
  const shape = handShape([0.82, 0.88, 0.9, 0.86], [0.95, 1.3]), anchor = centroid(shape.tips);
  const k = h * 0.2 * (1 - set * 0.18);
  [-1, 1].forEach(side => {
    const at = P(side * 0.3, 0, 1.02);
    drawHand(st, shape, at, anchor, -Math.PI / 2 - side * 0.05, k, side > 0, [at[0] + side * w * 0.07, h + k * 0.9], 100 + side * 10);
  });
}

// another runner, from behind, in their lane: x across, z ahead (m). Built like the hands: tapered limbs,
// a shaped torso, shorts, shoes and a head, each a filled pencil shape whose size follows the perspective.
// They grow as you reel them in and slide out past the edge of the view as you go by
function drawRunner(st, P, x, z, phase, lane, id) {
  const { pen, col, h, s } = st;
  if (z < 0.7) return;
  const F = h * 0.85, W = m => m * F / z;
  const at = ([dx, y, dz]) => P(x + dx, y, z + dz);
  const bob = 0.04 * Math.abs(Math.cos(phase));
  // a limb segment as a tapered shape between two joints
  const seg = (a, b, wa, wb, sid, shade = false) => {
    const A = at(a), B = at(b);
    if (!A || !B) return;
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const ra = W(wa), rb = W(wb);
    sketch(st, [[A[0] + nx * ra, A[1] + ny * ra], [B[0] + nx * rb, B[1] + ny * rb], [B[0] - nx * rb, B[1] - ny * rb], [A[0] - nx * ra, A[1] - ny * ra]], [], { id: id + sid, shade });
  };
  const shape = (pts3, sid, shade = true) => {
    const pts = pts3.map(at);
    if (pts.every(Boolean)) sketch(st, pts, [], { id: id + sid, shade });
  };
  const parts = [];
  [-1, 1].forEach(side => {
    const ph = phase + (side > 0 ? 0 : Math.PI);
    const a = 0.65 * Math.sin(ph), bend = 0.25 + 1.5 * Math.max(0, -Math.sin(ph + 0.7));
    const hip = [side * 0.1, 0.94 + bob, 0], knee = [side * 0.11, hip[1] - 0.45 * Math.cos(a), 0.45 * Math.sin(a)];
    const foot = [side * 0.1, Math.max(0.05, knee[1] - 0.45 * Math.cos(a - bend)), knee[2] + 0.45 * Math.sin(a - bend)];
    parts.push({ z: knee[2], draw: () => {
      seg(hip, knee, 0.085, 0.055, 10 + side, true);
      seg(knee, foot, 0.055, 0.035, 20 + side);
      const sh = at([foot[0], foot[1] - 0.02, foot[2] - 0.04]);
      if (sh) pen.blob(sh[0], sh[1], W(0.06), W(0.04), { width: 1.4, passes: 2, solid: true, id: id + 30 + side });
    } });
    const c = -0.85 * Math.sin(ph);
    const shoulder = [side * 0.2, 1.42 + bob, 0.04], el = [side * 0.25, shoulder[1] - 0.27 * Math.cos(c), shoulder[2] + 0.27 * Math.sin(c)];
    const hand = [side * 0.19, el[1] - 0.24 * Math.cos(c + 1.3), el[2] + 0.24 * Math.sin(c + 1.3)];
    parts.push({ z: el[2], draw: () => {
      seg(shoulder, el, 0.05, 0.04, 40 + side, true);
      seg(el, hand, 0.04, 0.03, 50 + side);
      const hd = at(hand);
      if (hd) pen.blob(hd[0], hd[1], W(0.045), W(0.045), { width: 1.3, passes: 2, solid: true, id: id + 60 + side });
    } });
  });
  // limbs further forward are further from us, so they go down first; the body covers them
  parts.sort((p, q) => q.z - p.z);
  parts.filter(p => p.z > 0.02).forEach(p => p.draw());
  const y = v => v + bob;
  shape([[-0.22, y(1.43), 0.04], [-0.07, y(1.5), 0.04], [-0.05, y(1.56), 0.04], [0.05, y(1.56), 0.04], [0.07, y(1.5), 0.04], [0.22, y(1.43), 0.04],
    [0.19, y(1.29), 0.03], [0.14, y(1.1), 0.02], [0.16, y(0.97), 0], [-0.16, y(0.97), 0], [-0.14, y(1.1), 0.02], [-0.19, y(1.29), 0.03]], 70);
  shape([[-0.165, y(1.0), 0], [0.165, y(1.0), 0], [0.18, y(0.84), 0], [0.02, y(0.8), 0], [-0.02, y(0.8), 0], [-0.18, y(0.84), 0]], 80);
  // race bib with the lane number
  const bib = [[-0.09, y(1.32), 0.035], [0.09, y(1.32), 0.035], [0.09, y(1.17), 0.03], [-0.09, y(1.17), 0.03]].map(at);
  if (bib.every(Boolean)) {
    pen.line([...bib, bib[0]], { color: col.fg, width: 1.1, passes: 1, id: id + 90 });
    const mid = at([0, y(1.245), 0.032]);
    pen.text(String(lane), mid[0], mid[1], Math.min(46, W(0.1) / Math.max(0.7, s)), { color: col.accent, align: 'center', weight: 700 });
  }
  const head = at([0, y(1.68), 0.04]);
  if (head) {
    const r = W(0.1), pts = Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return [head[0] + Math.cos(a) * r, head[1] + Math.sin(a) * r * 1.15]; });
    sketch(st, pts, [[[head[0] - r * 0.8, head[1] - r * 0.2], [head[0], head[1] - r * 0.5], [head[0] + r * 0.8, head[1] - r * 0.2]]], { id: id + 95 }); // hairline
  }
  parts.filter(p => p.z <= 0.02).forEach(p => p.draw());
}

// mid-race, upright: arms pumping at the edges of the view
// bendAhead: for the start of a 400, which is already on the bend (no finish line in sight then)
function sceneRun(st, t, d, phase, tired = 0, dip = 0, yaw = 0, bendAhead = null, others = []) {
  const { pen, col, w, h, s } = st;
  const bob = Math.abs(Math.sin(phase)) * 7 * s, roll = Math.sin(phase) * 0.012 * (1 + tired);
  const P = camera(st, 1.62 - dip * 0.35, h * (0.42 + dip * 0.12) - bob, roll, yaw);
  const hz = P(0, 0, 900) || [0, h * 0.42];
  pen.line([[-20, hz[1]], [w + 20, hz[1]]], { color: col.faint, id: 1 });
  // stands on the left, posts going past on the right
  pen.line([P(-12, 0, 160), P(-12, 9, 160), P(-60, 16, 160)], { color: col.faint, id: 2 });
  pen.line([P(-12, 4.5, 160), P(-60, 9, 160)], { color: col.faint, alpha: 0.6, id: 3 });
  for (let i = 0; i < 26; i++) {
    const u = i / 26, p = P(-13 - u * 46, 5 + u * 4.2 + (hash(i) + 1) * 0.6, 160);
    if (p) pen.path([[p[0] - 1.5, p[1]], [p[0] + 1.5, p[1] - 1]], { color: col.faint, width: 1.6, passes: 1, id: 900 + i });
  }
  for (let m = Math.ceil(d / 15) * 15; m < d + 120; m += 15) {
    const z = m - d + 2;
    if (z < 1.2) continue;
    pen.line([P(8.5, 0, z), P(8.5, 3, z)], { color: col.faint, id: 700 + m });
  }
  const fz = 100 - d;
  drawTrack(st, P, d, bendAhead ?? fz); // on the home straight the bend starts right at the finish line
  if (fz > 0.5 && bendAhead === null) {
    pen.line([P(-4.3, 0, fz), P(5.5, 0, fz)], { color: col.accent, width: 2.2, passes: 3, id: 8 });
    const a = P(6.4, 0, fz), b = P(6.4, 4.2, fz), c = P(-5.2, 4.2, fz), e = P(-5.2, 0, fz);
    pen.line([a, b, c, e], { color: col.muted, alpha: 0.8, id: 9 });
  }
  // the rest of the field, furthest first
  [...others].sort((a, b) => b.d - a.d).forEach(o => drawRunner(st, P, o.x, o.d - d, o.phase, o.lane, 800 + o.lane * 60));
  // fists: one swings up into view while the other drops out of it
  const fist = fistShape();
  [-1, 1].forEach(side => {
    const lift = Math.max(0, Math.sin(phase + (side > 0 ? 0 : Math.PI)));
    if (lift < 0.05) return;
    const k = h * (0.17 + lift * 0.05);
    const at = [w / 2 + side * w * (0.27 - lift * 0.08), h * (1.12 - lift * 0.45) + bob * 0.5];
    drawHand(st, { outline: fist.outline, details: fist.details }, at, [0, 0], -Math.PI / 2 - side * (0.45 - lift * 0.15), k, side < 0,
      [w / 2 + side * w * 0.45, h + k * 1.2], 200 + side * 10);
  });
  vignette(st, 0.15 + tired * 0.65);
}

const CODE = [
  [['k', 'async function'], ['f', ' sprint() {']], [['c', '  // 400m at PR pace']], [['k', '  const'], ['f', ' T = PR_400M;']],
  [['k', '  for'], ['f', ' (const lane of field)']], [['f', '    lane.stagger = lap(lane) - 400;']], [['k', '  await'], ['f', ' gun();']], [['f', '}']],
  [['f', '']], [['k', 'function'], ['f', ' blink(t) {']], [['k', '  return'], ['f', ' lids.close(t);']], [['f', '}']], [['f', '']],
  [['c', '// TODO: sleep']], [['f', 'COMMANDS.sleep = undefined;']],
];

// late at night at the desk: monitor, keyboard, hands, a window, a lamp, a clock
function sceneDesk(st, t, o) {
  const { pen, col, w, h, s, ctx } = st;
  const breath = Math.sin(t * 1.3) * 2 * s;
  ctx.save(); ctx.translate(0, breath);
  const deskY = h * 0.64;
  pen.line([[-10, deskY], [w + 10, deskY]], { color: col.muted, id: 1 });
  // window with a moon and a few stars
  const wx0 = w * 0.04, wx1 = w * 0.2, wy0 = h * 0.1, wy1 = h * 0.46;
  pen.line([[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1], [wx0, wy0]], { color: col.muted, id: 2 });
  pen.line([[(wx0 + wx1) / 2, wy0], [(wx0 + wx1) / 2, wy1]], { color: col.faint, id: 3 });
  pen.line([[wx0, (wy0 + wy1) / 2], [wx1, (wy0 + wy1) / 2]], { color: col.faint, id: 4 });
  pen.path(Array.from({ length: 9 }, (_, i) => { const a = -1.2 + i * 0.3; return [wx0 + (wx1 - wx0) * 0.3 + Math.cos(a) * 14 * s, wy0 + (wy1 - wy0) * 0.22 + Math.sin(a) * 14 * s]; }), { color: col.kw, id: 5 });
  [[0.7, 0.15], [0.55, 0.38], [0.85, 0.3], [0.2, 0.7], [0.75, 0.8]].forEach(([u, v], i) => {
    const x = wx0 + (wx1 - wx0) * u, y = wy0 + (wy1 - wy0) * v;
    if ((Math.floor(t * 3) + i) % 7) pen.line([[x - 2 * s, y], [x + 2 * s, y]], { color: col.fg, passes: 1, id: 6 + i });
  });
  // lamp and its cone
  const lb = [w * 0.86, deskY], le = [w * 0.83, h * 0.22], lh = [w * 0.76, h * 0.27];
  pen.line([[lb[0] - 24 * s, lb[1]], [lb[0] + 24 * s, lb[1]]], { color: col.muted, width: 2, id: 12 });
  pen.line([lb, le, lh], { color: col.muted, id: 13 });
  pen.line([[lh[0] - 22 * s, lh[1] - 6 * s], [lh[0] + 14 * s, lh[1] + 14 * s]], { color: col.muted, width: 2, id: 14 });
  ctx.globalAlpha = 0.05; ctx.fillStyle = col.kw;
  ctx.beginPath(); ctx.moveTo(lh[0] - 18 * s, lh[1]); ctx.lineTo(w * 0.62, deskY); ctx.lineTo(w * 0.94, deskY); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // coffee, with steam
  const mx = w * 0.17, my = deskY + h * 0.06;
  pen.line([[mx - 18 * s, my - 34 * s], [mx - 16 * s, my], [mx + 16 * s, my], [mx + 18 * s, my - 34 * s]], { color: col.muted, id: 15 });
  pen.blob(mx, my - 34 * s, 18 * s, 5 * s, { color: col.muted, id: 16 });
  pen.blob(mx + 24 * s, my - 18 * s, 7 * s, 9 * s, { color: col.muted, id: 17 });
  if (o.steam) for (let i = 0; i < 2; i++) pen.path(Array.from({ length: 6 }, (_, j) => [mx - 6 * s + i * 12 * s + Math.sin(t * 3 + j + i) * 4 * s, my - 44 * s - j * 9 * s]), { color: col.faint, width: 1, id: 18 + i });
  // clock
  if (o.clock) {
    const cx = w * 0.66, cy = deskY - 22 * s;
    pen.line([[cx - 34 * s, cy - 16 * s], [cx + 34 * s, cy - 16 * s], [cx + 34 * s, cy + 16 * s], [cx - 34 * s, cy + 16 * s], [cx - 34 * s, cy - 16 * s]], { color: col.muted, id: 20 });
    pen.text(o.clock, cx, cy, 15, { color: col.accent, align: 'center', weight: 500 });
  }
  // monitor: the one crisp thing in the room
  const x0 = w * 0.3, x1 = w * 0.7, y0 = h * 0.08, y1 = h * 0.54;
  const glow = ctx.createRadialGradient(w / 2, (y0 + y1) / 2, 10, w / 2, (y0 + y1) / 2, w * 0.45);
  glow.addColorStop(0, 'rgba(200,190,170,0.07)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = col.panel; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  pen.line([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], { width: 1.8, passes: 3, id: 21 });
  pen.line([[w / 2 - 10 * s, y1], [w / 2 - 14 * s, deskY], [w / 2 + 14 * s, deskY], [w / 2 + 10 * s, y1]], { color: col.muted, id: 22 });
  ctx.save(); ctx.beginPath(); ctx.rect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8); ctx.clip();
  o.screen(x0 + 16 * s, y0 + 20 * s, x1 - x0 - 32 * s, y1 - y0 - 40 * s);
  ctx.restore();
  // keyboard and hands
  const ky = h * 0.74;
  const kb = [[w * 0.33, h * 0.94], [w * 0.36, ky], [w * 0.64, ky], [w * 0.67, h * 0.94]];
  pen.line([...kb, kb[0]], { color: col.muted, id: 23 });
  for (let r = 1; r < 4; r++) { const v = r / 4; pen.line([[kb[0][0] + (kb[1][0] - kb[0][0]) * v, kb[0][1] + (kb[1][1] - kb[0][1]) * v], [kb[3][0] + (kb[2][0] - kb[3][0]) * v, kb[3][1] + (kb[2][1] - kb[3][1]) * v]], { color: col.faint, passes: 1, id: 24 + r }); }
  ctx.restore();
  // typing: fingers curled over the keys, each one dipping as it presses
  [-1, 1].forEach(side => {
    const press = i => o.typing ? Math.pow(Math.max(0, Math.sin(t * 13 + i * 1.9 + side * 2.3)), 8) : 0;
    const shape = handShape([0, 1, 2, 3].map(i => 0.5 + press(i) * 0.14), [0.72, 0.3]);
    const k = h * 0.17;
    const at = [w / 2 + side * w * 0.1, h * 0.8 + breath];
    drawHand(st, shape, at, [0.0, 0.25], -Math.PI / 2 - side * 0.22, k, side > 0, [w / 2 + side * w * 0.3, h + k * 0.8], 300 + side * 10);
  });
}

// grading: a sheet of homework from above, a red pen working down it
const WORK = [
  ['r² + 4 = 0  →  r = ±2i', 'y = c₁ cos 2x + c₂ sin 2x'],
  ['dy / y(1 − y) = dx', 'y = 1 / (1 + Ce⁻ˣ)'],
  ['r(r − 1) − 2 = 0  →  r = 2, 1', 'y = c₁x² + c₂x'],
  ['μ = e²ˣ  →  (e²ˣy)′ = e³ˣ', 'y = ⅓eˣ + Ce⁻²ˣ'],
];

function sceneGrading(st, t, progress) {
  const { pen, col, w, h, s, ctx } = st;
  pen.line([[w * 0.05, h * 0.02], [w * 0.05, h * 0.98]], { color: col.faint, alpha: 0.5, id: 1 });
  // the textbook's corner, top right
  pen.line([[w * 0.8, -10], [w * 0.78, h * 0.3], [w + 10, h * 0.33]], { color: col.faint, id: 2 });
  pen.text('DIFF EQ', w * 0.86, h * 0.14, 14, { color: col.faint, weight: 700, alpha: 0.6 });
  ctx.save();
  ctx.translate(w * 0.48, h * 0.52); ctx.rotate(-0.05);
  const pw = Math.min(w * 0.5, h * 0.75), ph = h * 0.92, X = -pw / 2, Y = -ph / 2;
  ctx.fillStyle = col.panel; ctx.globalAlpha = 0.6; ctx.fillRect(X, Y, pw, ph); ctx.globalAlpha = 1;
  pen.line([[X, Y], [X + pw, Y], [X + pw, Y + ph], [X, Y + ph], [X, Y]], { width: 1.5, id: 3 });
  pen.text('MAT 235 · HW 7', X + 24 * s, Y + 30 * s, 13, { color: col.muted });
  pen.text('name: ________', X + pw - 150 * s, Y + 30 * s, 12, { color: col.faint });
  const problems = ["y'' + 4y = 0", "y' = y(1 - y)", "x² y'' - 2y = 0", "y' + 2y = eˣ"];
  const marks = [];
  problems.forEach((p, i) => {
    const py = Y + ph * (0.16 + i * 0.2);
    pen.text(`${i + 1}.`, X + 24 * s, py, 14, { color: col.fg });
    pen.text(p, X + 52 * s, py, 15, { color: col.fg, italic: true, font: 'Georgia, serif' });
    // the student's working, in their handwriting (problem 3 has the mistake that costs the point)
    WORK[i].forEach((line, r) => {
      ctx.save(); ctx.translate(X + (60 + r * 6) * s, py + (34 + r * 30) * s); ctx.rotate(-0.012 + r * 0.008);
      pen.text(line, 0, 0, 23, { color: col.fg, alpha: 0.78, font: 'Caveat, "Bradley Hand", cursive', weight: 500 });
      ctx.restore();
    });
    marks.push([X + pw - 70 * s, py + 22 * s]);
  });
  // red pen marks, drawn stroke by stroke as the pen reaches them
  let tip = marks[0];
  marks.forEach(([mx, my], i) => {
    const k = clamp(progress * marks.length - i, 0, 1);
    if (k <= 0) return;
    if (i === 2) {
      const pts = Array.from({ length: Math.ceil(17 * k) }, (_, j) => { const a = j / 16 * Math.PI * 2; return [mx + Math.cos(a) * 22 * s, my + Math.sin(a) * 15 * s]; });
      if (pts.length > 1) pen.path(pts, { color: col.accent, width: 1.8, id: 500 + i });
      if (k > 0.6) pen.text('-1', mx, my, 15, { color: col.accent, align: 'center', weight: 700 });
      tip = pts[pts.length - 1] || [mx, my];
    } else {
      const a = [mx - 14 * s, my], b = [mx - 4 * s, my + 12 * s], c = [mx + 20 * s, my - 18 * s];
      const pts = k < 0.35 ? [a, [a[0] + (b[0] - a[0]) * k / 0.35, a[1] + (b[1] - a[1]) * k / 0.35]] : [a, b, [b[0] + (c[0] - b[0]) * (k - 0.35) / 0.65, b[1] + (c[1] - b[1]) * (k - 0.35) / 0.65]];
      pen.path(pts, { color: col.accent, width: 2.2, passes: 2, id: 500 + i });
      tip = pts[pts.length - 1];
    }
  });
  if (progress >= 1) {
    pen.blob(X + pw - 70 * s, Y + 34 * s, 40 * s, 22 * s, { color: col.accent, width: 1.8, id: 520 });
    pen.text('19/20', X + pw - 70 * s, Y + 34 * s, 16, { color: col.accent, align: 'center', weight: 700 });
    tip = [X + pw - 40 * s, Y + 50 * s];
  }
  // the hand and pen, in page space so they follow the tip
  writingHand(st, tip, 0.95, h * 0.3, 530);
  ctx.restore();
}

// a right hand holding a pen, from above. Local units: pen tip at the origin, the pen running along +x
// back toward the wrist; the index finger rests on top of the pen, the thumb pinches from below, and
// the other three fingers curl under the palm
function writingHand(st, tip, angle, k, id) {
  const { pen, col } = st;
  const c = Math.cos(angle), sn = Math.sin(angle);
  const T = ([x, y]) => [tip[0] + (x * c - y * sn) * k, tip[1] + (x * sn + y * c) * k];
  // the pen first, so the fingers sit over it
  const body = [[0.1, -0.035], [1.95, -0.05], [1.95, 0.05], [0.1, 0.035]].map(T);
  pen.cover(body);
  pen.line([body[0], body[1]], { color: col.muted, width: 1.4, passes: 2, id: id + 1 });
  pen.line([body[3], body[2]], { color: col.muted, width: 1.4, passes: 2, id: id + 2 });
  pen.line([body[1], body[2]], { color: col.muted, width: 1.2, id: id + 3 });
  pen.line([T([0, 0]), T([0.1, -0.035])], { color: col.accent, width: 1.6, id: id + 4 });
  pen.line([T([0, 0]), T([0.1, 0.035])], { color: col.accent, width: 1.6, id: id + 5 });
  pen.line([T([1.62, -0.05]), T([1.62, -0.11]), T([1.25, -0.1])], { color: col.muted, width: 1.1, id: id + 6 }); // clip
  // forearm out past the wrist
  limb(st, T([3.6, 0.45]), T([1.25, 0.02]), k * 0.36, k * 0.27, id + 50, angle - 2.4);
  const outline = [
    [0.3, -0.075], [0.36, -0.11], [0.52, -0.14], [0.7, -0.19],                    // index, resting on the pen
    [0.86, -0.29], [1.04, -0.34], [1.22, -0.3], [1.36, -0.22],                    // back of the hand
    [1.4, 0.0], [1.34, 0.24],                                                     // wrist
    [1.18, 0.34], [1.06, 0.38], [0.96, 0.36], [0.88, 0.38], [0.79, 0.33],        // curled fingers underneath
    [0.68, 0.27], [0.5, 0.19], [0.38, 0.12], [0.33, 0.075], [0.37, 0.05],        // thumb, pinching
    [0.52, 0.055], [0.62, 0.035], [0.55, -0.045], [0.4, -0.05], [0.31, -0.045],  // the gap the pen shows through
  ];
  const details = [
    [[0.33, -0.065], [0.36, -0.09], [0.42, -0.1]],                                // index nail
    [[0.5, -0.085], [0.53, -0.135]],                                              // index joint
    [[0.68, -0.13], [0.72, -0.2]],                                                // index knuckle
    [[0.36, 0.09], [0.4, 0.11], [0.45, 0.1]],                                     // thumbnail
    [[0.58, 0.13], [0.62, 0.21]],                                                 // thumb joint
    [[0.86, 0.3], [0.9, 0.24], [0.98, 0.3]], [[0.98, 0.31], [1.03, 0.25], [1.1, 0.31]], // curled knuckles
    [[0.9, -0.2], [1.05, -0.22], [1.2, -0.18]],                                   // back-of-hand crease
    [[0.92, -0.12], [1.3, -0.08]], [[0.95, 0.0], [1.3, 0.02]],                    // tendons
  ];
  sketch(st, outline.map(T), details.map(d => d.map(T)), { id, light: angle - 2.2 });
  // the pen's tip end, over the paper and out from under the fingers
  pen.line([T([0.0, 0.0]), T([0.3, 0.0])], { color: col.muted, width: 0.8, passes: 1, id: id + 7 });
}

// a small copy of this site, for the monitor
function miniSite(st, x, y, w, h) {
  const { ctx, col, s, pen } = st;
  ctx.fillStyle = col.bg; ctx.fillRect(x - 10 * s, y - 14 * s, w + 20 * s, h + 30 * s);
  pen.text('tyler.thompson', x, y, 9, { color: col.fg });
  pen.text('// davidson college · cs & math', x, y + h * 0.18, 8, { color: col.muted });
  pen.text('Tyler Thompson', x, y + h * 0.32, 24, { color: col.fg, weight: 500 });
  for (let i = 0; i < 3; i++) { ctx.fillStyle = col.faint; ctx.fillRect(x, y + h * (0.46 + i * 0.07), w * (0.55 - i * 0.1), 3 * s); }
  ctx.fillStyle = col.fg; ctx.fillRect(x, y + h * 0.72, 70 * s, 18 * s);
  ctx.strokeStyle = col.faint; ctx.strokeRect(x + 80 * s, y + h * 0.72, 60 * s, 18 * s);
  ctx.fillStyle = col.accent; ctx.font = `${7 * s}px ${MONO}`;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 14; c++) {
    const dx = (c - 6.5) / 6.5, dy = (r - 3.5) / 3.5, rr = Math.hypot(dx, dy);
    if (rr < 1 && rr > 0.4) ctx.fillText('$#*!=:.'[(r + c + Math.floor(Date.now() / 200)) % 7], x + w * 0.68 + c * 6 * s, y + h * 0.15 + r * 9 * s);
  }
}

function codeScreen(st, x, y, w, h, lines, typed, commit) {
  const { pen, col } = st;
  const lh = 15 * st.s;
  st.ctx.font = `${10 * st.s}px ${MONO}`;
  lines.forEach((tokens, i) => {
    let cx = x;
    for (const [k, text] of tokens) {
      pen.text(text, cx, y + i * lh, 10, { color: k === 'k' ? col.kw : k === 'c' ? col.faint : col.fg });
      cx += st.ctx.measureText(text).width;
    }
  });
  const ty = y + lines.length * lh;
  pen.text(typed + (Math.floor(performance.now() / 500) % 2 ? '█' : ''), x, ty, 10, { color: col.fg });
  if (commit) {
    st.ctx.fillStyle = col.bg; st.ctx.fillRect(x - 16 * st.s, y + h - 16 * st.s, w + 32 * st.s, 40 * st.s);
    pen.text(`$ git commit -m "${commit}"`, x, y + h + 2 * st.s, 10, { color: col.str });
  }
}

// a handwriting face for the homework, fetched the first time a scene needs it (falls back to cursive)
let handFontReady = null;
function handFont() {
  if (!handFontReady) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap';
    document.head.appendChild(link);
    handFontReady = Promise.race([new Promise(r => { link.onload = r; link.onerror = r; }).then(() => document.fonts.load('500 20px Caveat')).catch(() => {}), wait(1500)]);
  }
  return handFontReady;
}

/* the eggs themselves */
async function fpRun(build) {
  if (reduceMotion) return false;
  const unlock = lockScroll();
  const st = fpStage();
  const stopKeys = e => { if (e.key === 'Escape') abort = true; };
  addEventListener('keydown', stopKeys, true);
  let t0 = null, fadeOut = null, done = false;
  const scene = build(st);
  await frames(now => {
    if (t0 === null) t0 = now;
    const t = (now - t0) / 1000;
    if ((abort || done) && fadeOut === null) fadeOut = t;
    st.pen.boil(t);
    st.ctx.globalAlpha = 1; st.ctx.fillStyle = st.col.bg; st.ctx.fillRect(0, 0, st.w, st.h);
    if (scene(t) === false) done = true;
    const k = fadeOut === null ? Math.min(1, t / 0.5) : 1 - (t - fadeOut) / 0.5;
    st.cv.style.opacity = Math.max(0, k);
    return !(fadeOut !== null && k <= 0);
  });
  removeEventListener('keydown', stopKeys, true);
  st.cv.remove(); unlock();
  return true;
}

// a day, cut together with blinks
async function dayInTheLife() {
  await handFont();
  if (!(await fpRun(st => {
    const SCENES = [
      { len: 4.2, cap: '6:40 am · practice', draw: t => sceneBlocks(st, t) },
      { len: 4.6, cap: '11:15 am · grading MAT 235', draw: t => sceneGrading(st, t, clamp((t - 0.6) / 3.4, 0, 1)) },
      { len: 4.4, cap: '1:12 am · building this', draw: t => sceneDesk(st, t, { typing: true, steam: true, screen: (x, y, w, h) => miniSite(st, x, y, w, h) }) },
      { len: 3.0, cap: 'saturday · 400m final', draw: t => sceneBlocks(st, t, clamp((t - 1.2) / 0.5, 0, 1), 4) },
      { len: 2.4, cap: '', draw: t => sceneRun(st, t, 1.2 * t * t, t * 22, 0, 0, 0.12 * t, 4 - 1.2 * t * t) },
    ];
    const starts = []; let acc = 0;
    SCENES.forEach(sc => { starts.push(acc); acc += sc.len; });
    return t => {
      let i = starts.findIndex((s0, j) => t < s0 + SCENES[j].len);
      if (i < 0) return false;
      const lt = t - starts[i];
      SCENES[i].draw(lt);
      if (i === 4 && lt < 0.12) { st.ctx.fillStyle = st.col.fg; st.ctx.globalAlpha = 1 - lt / 0.12; st.ctx.fillRect(0, 0, st.w, st.h); st.ctx.globalAlpha = 1; }
      if (SCENES[i].cap) caption(st, SCENES[i].cap, lt - 0.3);
      // each cut happens behind a blink; one ordinary blink inside the longer scenes
      const b = Math.max(i < 3 ? blinkAt(t, starts[i + 1] - 0.08, 0.16) : 0, blinkAt(lt, -0.08, 0.16), i < 3 ? blinkAt(lt, SCENES[i].len * 0.55) : 0);
      lids(st, i === 4 ? Math.max(b, clamp((lt - 1.6) / 0.6, 0, 1)) : b);
    };
  }))) return flash('6:40 practice · 11:15 grading · 1:12 am building · saturday: 400m.');
  flash('that’s a day.');
}

// the home straight of a 400, first person; it gets harder to keep your eyes open
async function lastHundred() {
  const SPEED = 1.25, T0 = 35.5, T = PR_400M, DUR = T - T0;
  const dist = rt => Math.min(100, 7.45 * rt - (7.45 * DUR - 100) / (DUR * DUR) * rt * rt);
  if (!(await fpRun(st => {
    let phase = 0, last = 0;
    const blinks = [[2.2, 0.04], [5.0, 0.07], [7.6, 0.12], [9.6, 0.18], [11.4, 0.26], [12.9, 0.3]];
    // three people still ahead at 300m: [lane, metres ahead, where you pass them]. Each runs a steady pace
    // chosen so you draw level exactly there
    const A = 7.45, C = (A * DUR - 100) / (DUR * DUR), timeAt = m => (A - Math.sqrt(A * A - 4 * C * m)) / (2 * C);
    const field = [[5, 4.5, 34], [3, 7, 62], [6, 9.5, 88]].map(([lane, ahead, pass]) => ({
      lane, x: (lane - 4) * 1.22, ahead, v: (pass - ahead) / timeAt(pass), phase: lane * 1.7,
    }));
    return t => {
      const rt = Math.min(t * SPEED, DUR + 3), d = rt < DUR ? dist(rt) : 100 + Math.min(6, (rt - DUR) * 2.2);
      const v = rt < DUR ? 7.45 - 2 * (7.45 * DUR - 100) / (DUR * DUR) * rt : Math.max(0, 6.9 - (rt - DUR) * 2.5);
      phase += (t - last) * SPEED * v * 1.5; last = t;
      const tired = clamp(d / 100, 0, 1), dip = rt > DUR - 0.25 && rt < DUR + 1 ? Math.sin(clamp((rt - DUR + 0.25) / 1.25, 0, 1) * Math.PI) : 0;
      const dt = t - (field.t ?? t); field.t = t;
      const others = field.map(f => {
        f.phase += dt * SPEED * f.v * 1.5;
        return { lane: f.lane, x: f.x, d: f.ahead + f.v * Math.min(rt, DUR + 0.5), phase: f.phase };
      });
      sceneRun(st, t, d, phase, tired, dip, Math.max(0, d - 100) / 41.07, null, others); // past the line, the head turns into the bend
      st.pen.text((T0 + Math.min(rt, DUR)).toFixed(2), st.w - 24, 40, 30, { color: rt >= DUR ? st.col.accent : st.col.fg, align: 'right', weight: 500 });
      if (rt < 2.2) caption(st, '300m · 35.50 · three still ahead of you', rt);
      if (rt >= DUR) {
        st.pen.text(T.toFixed(2), st.w / 2, st.h * 0.3, 72, { color: st.col.accent, align: 'center', weight: 500, alpha: clamp((rt - DUR) / 0.4, 0, 1) });
        st.pen.text('PR', st.w / 2, st.h * 0.3 + 60 * st.s, 16, { color: st.col.fg, align: 'center', alpha: clamp((rt - DUR - 0.4) / 0.4, 0, 1) });
      }
      let b = Math.max(...blinks.map(([at, hold]) => blinkAt(rt, at, hold, 0.09, 0.22)));
      b = Math.max(b, tired * 0.12 + Math.sin(t * 2.3) * 0.02 * tired);
      if (rt > DUR + 1.6) b = Math.max(b, clamp((rt - DUR - 1.6) / 1.2, 0, 1));
      lids(st, b);
      return rt < DUR + 3;
    };
  }))) return flash(`the last 100 · ${(PR_400M - 35.5).toFixed(2)}s · ${PR_400M.toFixed(2)} PR`);
  flash(`${PR_400M.toFixed(2)}. that one hurt.`);
}

// 3am: each blink is longer, the eyelids get heavier, and the commit messages get worse
async function lateNight() {
  const TIMES = ['3:07', '3:26', '3:58', '4:21', '4:52'], COMMITS = ['add easter eggs', 'fix', 'fix again', 'actually fix', 'pls'];
  const HOLDS = [0.12, 0.35, 0.7, 1.2], LEN = 2.9;
  if (!(await fpRun(st => {
    const starts = [0]; HOLDS.forEach((hd, i) => starts.push(starts[i] + LEN + hd + 0.25));
    const end = starts[4] + LEN;
    const typedLine = 'deploy(site, { sleep: false });';
    return t => {
      let i = 0; while (i < 4 && t >= starts[i + 1] - 0.1) i++;
      const lt = t - starts[i];
      const lines = CODE.slice(0, 6 + i * 2);
      sceneDesk(st, t, {
        clock: TIMES[i], typing: lt > 0.4 && lt < LEN - 0.4, steam: i < 2,
        screen: (x, y, w, h) => codeScreen(st, x, y, w, h, lines, typedLine.slice(0, Math.floor(clamp(lt - 0.4, 0, 3) * 12)), COMMITS[i]),
      });
      const droop = [0, 0.1, 0.2, 0.3, 0.38][i] + Math.sin(t * 1.1) * 0.03 * i;
      let b = droop;
      if (i < 4) b = Math.max(b, blinkAt(t, starts[i] + LEN, HOLDS[i], 0.14 + i * 0.05, 0.25));
      if (t > end) b = Math.max(b, clamp((t - end) / 1.6, 0, 1));
      lids(st, b);
      if (t > end + 1.6) st.pen.text('z z z', st.w / 2, st.h / 2, 18, { color: st.col.faint, align: 'center', alpha: clamp((t - end - 1.6) / 0.5, 0, 1) });
      return t < end + 3.4;
    };
  }))) return flash('3:07 → 4:52 am. commits: add easter eggs, fix, fix again, actually fix, pls');
  flash('pushed to main at 4:52 am. (it worked.)');
}

/* ---------- wire them into :commands ---------- */
const rm = run('rm', rmrf);
['!rm -rf /', 'rm -rf /', '!rm -rf ~', 'rm -rf ~', '!rm -rf *', 'rm -rf *', 'sudo rm -rf /', '!sudo rm -rf /']
  .forEach(k => { COMMANDS[k] = rm; });
COMMANDS.sprint = COMMANDS['400m'] = COMMANDS['400'] = COMMANDS.race = run('sprint', sprint);
COMMANDS['q!'] = COMMANDS['qa!'] = run('crt', () => crt('nice try. you live here now.'));
COMMANDS.wq = COMMANDS['wq!'] = COMMANDS.x = run('crt', () => crt('written. still here though.'));
COMMANDS['sudo hire tyler'] = COMMANDS['hire tyler'] = COMMANDS['sudo hire'] = run('hire', hire);
COMMANDS.detect = COMMANDS.yolo = run('detect', detect);
COMMANDS.blackjack = COMMANDS.bj = COMMANDS['21'] = run('blackjack', blackjack);
COMMANDS.train = COMMANDS.fit = run('train', train);
COMMANDS.snake = run('snake', snake);
COMMANDS.screensaver = COMMANDS.idle = run('idle', screensaver);
COMMANDS.day = COMMANDS['dayinthelife'] = COMMANDS['day in the life'] = run('day', dayInTheLife);
COMMANDS.last100 = COMMANDS.kick = COMMANDS['last 100'] = COMMANDS.homestretch = run('kick', lastHundred);
COMMANDS['3am'] = COMMANDS.latenight = COMMANDS.allnighter = run('late', lateNight);

// a minute with no input starts the screensaver
let idleTimer;
const poke = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!busy && !document.hidden && !reduceMotion && !inPane) COMMANDS.idle(); }, 60000);
};
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, poke, { passive: true }));
poke();

// shaking a phone brings the page down. iOS only reports motion after a tap grants it, so there
// the secrets list asks; elsewhere it listens straight away
const shakeRm = run('shake', rmrf);
let shakes = [], shakeOn = false;
function armShake() {
  if (shakeOn) return;
  shakeOn = true;
  addEventListener('devicemotion', e => {
    const a = e.acceleration;
    if (!a || a.x == null || Math.hypot(a.x, a.y, a.z) < 18) return;
    const now = Date.now();
    shakes = shakes.filter(t => now - t < 800).concat(now);
    if (shakes.length >= 3 && !busy) { shakes = []; shakeRm(); }
  });
}
const needsAsk = window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function';
if (window.DeviceMotionEvent && !needsAsk) armShake();
async function shakeFromList() {
  if (!matchMedia('(pointer: coarse)').matches) return shakeRm(); // no phone to shake: just do it
  try { if (needsAsk && await DeviceMotionEvent.requestPermission() === 'granted') armShake(); } catch (e) {}
  if (shakeOn) flash('ok. now shake your phone.'); else shakeRm();
}

/* ======================================================================
   vim commands (:%s, :vsplit, :git blame, :set nu, :syntax, :colo, :earlier, :!, dd/p/u)
   and things that happen on their own (tab title, devtools, 4942, visual mode, offline, ...)
   ====================================================================== */

// text these may touch: the page itself, never the bar, other eggs or the live widgets up top
const SKIP = '.bar, .egg, .egg-panel, script, style, noscript, #scene, #editor-body, #ed-status, #ed-cmd, #ed-tabs, #cap-read';
function pageText(root) {
  const out = [];
  if (!root) return out;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.data.trim() && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  for (let n; (n = w.nextNode());) out.push(n);
  return out;
}
const typing = () => bar.classList.contains('cmd-mode');
// a message nobody typed a command for: never over the command line, and it stays a little longer
function notify(text, ms = 4000) {
  if (typing()) return;
  flash(text);
  clearTimeout(flash.t);
  flash.t = setTimeout(restoreBar, ms);
}
const hex7 = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7);
};

/* ---------- u  one undo list for :%s, dd and p ---------- */
const undos = [];
let changeNo = 0;
function change(fn) { undos.push({ fn, at: Date.now() }); changeNo++; }
function undo() {
  const u = undos.pop();
  if (!u) return flash('Already at oldest change');
  flash(`${u.fn()}; before #${changeNo--}  ${ago(u.at)}`);
}
const ago = at => {
  const s = Math.round((Date.now() - at) / 1000);
  return s < 60 ? `${s} second${s === 1 ? '' : 's'} ago` : `${Math.round(s / 60)} minutes ago`;
};

/* ---------- :%s/old/new/g  find and replace, on the page itself ---------- */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// with smartcase on, "tyler" also matches "Tyler"; the replacement then copies the match's capitals
const keepCase = (from, to) =>
  from.length > 1 && from === from.toUpperCase() && from !== from.toLowerCase() ? to.toUpperCase()
  : from[0] !== from[0].toLowerCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to;
function substitute(pat, rep, flags) {
  if (!pat) return flash('E35: No previous regular expression');
  const ic = flags.includes('i') || (!flags.includes('I') && pat === pat.toLowerCase());
  const re = new RegExp(reEsc(pat), 'g' + (ic ? 'i' : ''));
  const all = flags.includes('g');
  const marks = [], lines = new Set();
  for (const n of pageText(document.body)) {
    re.lastIndex = 0;
    if (!re.test(n.data)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = re.exec(n.data))) {
      frag.append(n.data.slice(last, m.index));
      const mk = document.createElement('mark');
      mk.className = 'egg-sub';
      mk.textContent = m[0];
      mk.dataset.from = m[0];
      mk.dataset.to = ic ? keepCase(m[0], rep) : rep;
      frag.append(mk); marks.push(mk);
      last = m.index + m[0].length;
      if (!all) break;
    }
    frag.append(n.data.slice(last));
    lines.add(n.parentElement.closest('p, li, h1, h3, h4, dt, dd, a, span, div') || n.parentElement);
    n.replaceWith(frag);
  }
  if (!marks.length) return flash(`E486: Pattern not found: ${pat}`);
  discover('subst');
  // every match lights up, then they flip one after another down the page
  const t0 = reduceMotion ? 0 : 420;
  marks.forEach((mk, i) => setTimeout(() => {
    mk.textContent = mk.dataset.to;
    mk.classList.add('flip');
  }, t0 + (reduceMotion ? 0 : Math.min(i * 22, 700))));
  setTimeout(() => marks.forEach(mk => mk.classList.add('done')), reduceMotion ? 0 : 3600);
  change(() => {
    const parents = new Set();
    marks.forEach(mk => { if (mk.isConnected) { parents.add(mk.parentNode); mk.replaceWith(mk.dataset.from); } });
    parents.forEach(p => p.normalize());
    return `${marks.length} change${marks.length === 1 ? '' : 's'}`;
  });
  const L = lines.size;
  flash(`${marks.length} substitution${marks.length === 1 ? '' : 's'} on ${L} line${L === 1 ? '' : 's'}`);
}
// :noh  vim's "stop highlighting my last search"
function noh() { document.querySelectorAll('mark.egg-sub').forEach(mk => mk.classList.add('done')); }

/* ---------- dd / yy / p / P  cut, copy and paste whole sections ---------- */
let register = null;
const blocks = () => [...document.querySelectorAll('main > header, main > section')];
function sectionAtCursor() {
  const all = blocks();
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 8) return all[all.length - 1];
  const y = innerHeight * 0.3;
  return all.find(b => { const r = b.getBoundingClientRect(); return r.top <= y && r.bottom > y; }) || all[0];
}
const labelOf = el => el.dataset.label || el.id || 'hero';
function collapse(el) {
  if (reduceMotion) return Promise.resolve();
  el.style.height = el.offsetHeight + 'px';
  el.style.overflow = 'hidden';
  void el.offsetHeight;
  el.style.transition = 'height 0.4s cubic-bezier(.6,0,.3,1), padding 0.4s cubic-bezier(.6,0,.3,1), opacity 0.25s';
  Object.assign(el.style, { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0', borderTopWidth: '0px' });
  return wait(420).then(() => { el.removeAttribute('style'); });
}
function expand(el) {
  if (reduceMotion) return;
  const h = el.offsetHeight;
  Object.assign(el.style, { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0', overflow: 'hidden', borderTopWidth: '0px' });
  void el.offsetHeight;
  el.style.transition = 'height 0.4s cubic-bezier(.6,0,.3,1), padding 0.4s cubic-bezier(.6,0,.3,1), opacity 0.4s 0.1s';
  Object.assign(el.style, { height: h + 'px', paddingTop: '', paddingBottom: '', opacity: '1', borderTopWidth: '' });
  el.classList.add('egg-put');
  setTimeout(() => { el.removeAttribute('style'); el.classList.remove('egg-put'); }, 1300);
}
async function deleteSection() {
  const el = sectionAtCursor();
  if (!el || blocks().length < 2) return flash('E: that’s the last one. keep it.');
  discover('dd');
  const parent = el.parentNode, next = el.nextSibling, name = labelOf(el);
  register = el;
  flash(`"${name}" deleted  ·  p puts it back  ·  u undoes`);
  await collapse(el);
  el.remove();
  change(() => {
    parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    expand(el);
    return '1 more section';
  });
}
function yank() {
  register = sectionAtCursor();
  discover('dd');
  flash(`"${labelOf(register)}" yanked`);
}
function put(above) {
  if (!register) return flash('E353: Nothing in register "');
  discover('dd');
  const at = sectionAtCursor();
  let el = register;
  if (el.isConnected) {
    // a second copy: same content, no duplicate ids
    el = register.cloneNode(true);
    el.dataset.label = labelOf(register) + ' (copy)';
    el.removeAttribute('id');
    el.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  }
  if (above) at.before(el); else at.after(el);
  expand(el);
  flash(`put "${labelOf(el)}" ${above ? 'above' : 'below'} "${labelOf(at)}"`);
  change(() => { collapse(el).then(() => el.remove()); return '1 section less'; });
}

/* ---------- :vsplit / :split  two windows on the same page ---------- */
const inPane = new URLSearchParams(location.search).has('pane');
function split(dir) {
  if (inPane || innerWidth < 300) return flash('E36: Not enough room');
  const vertical = dir === 'v' && innerWidth >= 700;
  const unlock = lockScroll(false);
  const box = document.createElement('div');
  box.className = 'egg egg-split ' + (vertical ? 'v' : 'h');
  const src = location.pathname + '?pane=1';
  box.innerHTML = `<iframe src="${src}" title="Window 1"></iframe><i></i><iframe src="${src}#projects" title="Window 2"></iframe>` +
    `<button type="button" class="egg-split-x" aria-label="Close split">:q &#x2715;</button>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('on'));
  const frames2 = [...box.querySelectorAll('iframe')];
  frames2[0].addEventListener('load', () => { try { frames2[0].contentWindow.focus(); } catch (e) {} });
  return new Promise(done => {
    const close = () => {
      removeEventListener('message', onMsg);
      removeEventListener('keydown', onKey, true);
      box.classList.remove('on');
      setTimeout(() => box.remove(), 260);
      unlock();
      flash(vertical ? 'closed the vertical split' : 'closed the split');
      done();
    };
    const onMsg = e => { if (e.data === 'egg-split-close' && frames2.some(f => f.contentWindow === e.source)) close(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    addEventListener('message', onMsg);
    addEventListener('keydown', onKey, true);
    box.querySelector('.egg-split-x').addEventListener('click', close);
  });
}
if (inPane) {
  document.documentElement.classList.add('egg-pane');
  const closeMe = () => parent.postMessage('egg-split-close', '*');
  ['q', 'q!', 'qa', 'qa!', 'wq', 'wq!', 'x', 'close', 'clo', 'only', 'on', 'quit'].forEach(k => { COMMANDS[k] = closeMe; });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !busy && !panel) closeMe(); });
}

/* ---------- :git blame  who wrote each line, and why ---------- */
// [selector, messages for its matches in order (null: pick from the pool), only beside the page (too cramped inline)]
const BLAME = [
  ['.hero-comment', ['bump: sophomore → junior']],
  ['.hero h1', ['initial commit']],
  ['.hero-sub', ['add buzzwords. remove buzzwords. add 2 back']],
  ['.prompt', null, true],
  ['.about-text p', ['gpa 3.83 (checked twice)', 'pr: 49.42. working on it', 'summer recap, cut 400 words']],
  ['.readout .row', null, true],
  ['.card h3', ['ship it (signed the MSA first)', 'count cards (legally)', '7 models, 0 stock tips', 'find the dog', 'who reclines? everyone', 'convert self to ascii', 'the miracle, in pixels']],
  ['.log h4', ['-1, show your work', 'retrieve, augment, invoice', '14 skus, 0 typos']],
  ['.contact-lead', ['let’s talk (please)']],
  ['.contact-table dt', null, true],
  ['footer .wrap > span', ['last line, promise', 'wip']],
];
const POOL = ['fix typo', 'fix typo (for real)', 'wip', 'make it pop', 'revert “make it pop”', 'works. don’t touch', 'remove console.log', 'asdf', 'please work', 'it’s a feature', 'final_final_v2', 'nudge 1px left', 'mobile fix', 'rename things', 'small cleanup'];
const WHEN = ['2 days ago', '3 weeks ago', '5 hours ago', 'a month ago', 'yesterday', '4 min ago', 'at 3am', 'last week'];
let blameOn = null;
function blame() {
  discover('blame');
  if (blameOn) return closeBlame();
  const wide = innerWidth >= 1000;
  const html = document.documentElement;
  html.classList.add(wide ? 'egg-blame-wide' : 'egg-blame-narrow');
  const rows = [];
  BLAME.forEach(([sel, msgs, wideOnly]) => {
    if (wideOnly && !wide) return;
    document.querySelectorAll(sel).forEach((el, i) => {
      if (!el.offsetParent && el.tagName !== 'H1') return;
      const text = el.textContent.trim();
      const h = parseInt(hex7(text + i), 16);
      const msg = msgs ? msgs[i % msgs.length] : POOL[h % POOL.length];
      const who = /49\.42/.test(msg) ? 'coach' : 'tyler';
      rows.push({ el, line: `<b>${hex7(text)}</b> (${who} ${WHEN[(h >> 4) % WHEN.length]}) <q>${esc(msg)}</q>` });
    });
  });
  rows.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  if (wide) {
    const col = document.createElement('div');
    col.className = 'egg egg-blame-col';
    col.setAttribute('aria-hidden', 'true');
    col.innerHTML = rows.map(r => `<div class="egg-blame-ln">${r.line}</div>`).join('');
    document.body.appendChild(col);
    const lns = [...col.children];
    const place = () => {
      col.style.height = document.documentElement.scrollHeight + 'px';
      let floor = 0;
      rows.forEach((r, i) => {
        const top = Math.max(floor, r.el.getBoundingClientRect().top + scrollY);
        lns[i].style.top = top + 'px';
        floor = top + 18;
      });
    };
    // the page reflows narrower beside the column; follow it whenever it changes height
    const ro = new ResizeObserver(() => requestAnimationFrame(place));
    ro.observe(document.querySelector('main'));
    blameOn = () => { col.remove(); ro.disconnect(); };
  } else {
    const spans = rows.map(r => {
      const s = document.createElement('span');
      s.className = 'egg egg-blame-in';
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = r.line;
      r.el.prepend(s);
      return s;
    });
    blameOn = () => spans.forEach(s => s.remove());
  }
  flash(':Git blame  ·  run it again to close');
}
function closeBlame() {
  blameOn(); blameOn = null;
  document.documentElement.classList.remove('egg-blame-wide', 'egg-blame-narrow');
  flash('blame closed. nobody is to blame.');
}

/* ---------- :set nu / :set rnu  line numbers down the side of the page ---------- */
let nu = null;
function measureLines() {
  const r = document.createRange(), boxes = [];
  for (const n of pageText(document.querySelector('main')).concat(pageText(document.querySelector('footer')))) {
    r.selectNodeContents(n);
    for (const b of r.getClientRects()) if (b.width > 1 && b.height > 6) boxes.push({ y: b.top + scrollY, h: b.height });
  }
  boxes.sort((a, b) => a.y - b.y);
  const lines = [];
  for (const b of boxes) {
    const c = b.y + b.h / 2, last = lines[lines.length - 1];
    if (last && c - last.c < Math.max(14, Math.min(b.h, last.h) * 0.8)) continue;
    lines.push({ y: b.y, h: b.h, c });
  }
  return lines;
}
function layoutNumbers() {
  if (!nu) return;
  const html = document.documentElement;
  const wrap = document.querySelector('main .wrap');
  const contentLeft = () => wrap.getBoundingClientRect().left + parseFloat(getComputedStyle(wrap).paddingLeft);
  html.classList.remove('egg-nu-pad');
  if (contentLeft() < 46) html.classList.add('egg-nu-pad');
  const x = Math.max(2, contentLeft() - 44);
  nu.lines = measureLines();
  nu.layer.innerHTML = nu.lines.map((l, i) =>
    `<span style="top:${l.y.toFixed(1)}px;left:${x.toFixed(1)}px;height:${l.h.toFixed(1)}px;line-height:${l.h.toFixed(1)}px">${i + 1}</span>`).join('');
  nu.cur = -1;
  markCursor();
}
function markCursor() {
  if (!nu || !nu.lines.length) return;
  const y = scrollY + innerHeight * 0.35;
  let cur = 0;
  nu.lines.forEach((l, i) => { if (Math.abs(l.c - y) < Math.abs(nu.lines[cur].c - y)) cur = i; });
  if (cur === nu.cur && !nu.dirty) return;
  const spans = nu.layer.children;
  if (nu.cur >= 0 && spans[nu.cur]) spans[nu.cur].classList.remove('cur');
  spans[cur].classList.add('cur');
  if (nu.mode === 'rnu') for (let i = 0; i < spans.length; i++) spans[i].textContent = i === cur ? i + 1 : Math.abs(i - cur);
  else if (nu.dirty) for (let i = 0; i < spans.length; i++) spans[i].textContent = i + 1;
  nu.cur = cur; nu.dirty = false;
}
function setNumbers(mode) {
  if (!mode) {
    if (!nu) return flash('no line numbers to turn off');
    nu.layer.remove(); nu.ro.disconnect();
    removeEventListener('scroll', nu.onScroll);
    document.documentElement.classList.remove('egg-nu', 'egg-nu-pad');
    nu = null;
    return flash('line numbers off');
  }
  discover('nu');
  if (!nu) {
    const layer = document.createElement('div');
    layer.className = 'egg egg-nu-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    nu = { layer, lines: [], cur: -1 };
    document.documentElement.classList.add('egg-nu');
    let t;
    nu.ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(layoutNumbers, 150); });
    nu.ro.observe(document.querySelector('main'));
    nu.onScroll = () => { if (!nu.raf) nu.raf = requestAnimationFrame(() => { nu.raf = 0; markCursor(); }); };
    addEventListener('scroll', nu.onScroll, { passive: true });
  }
  nu.mode = mode; nu.dirty = true;
  layoutNumbers();
  flash(mode === 'rnu' ? 'relativenumber  ·  scroll and watch them count' : `${nu.lines.length} lines  ·  try :set rnu`);
}
function setOption(arg) {
  const opts = arg.split(' ');
  if (opts.some(o => /^(nu|number|nonu|nonumber|rnu|relativenumber|nornu|norelativenumber|invnu|nu!|number!|rnu!|invrnu)$/.test(o))) {
    if (opts.some(o => /^(rnu|relativenumber)$/.test(o))) return setNumbers('rnu');
    if (opts.some(o => /^(nu|number)$/.test(o))) return setNumbers('nu');
    if (opts.some(o => /^(invnu|nu!|number!)$/.test(o))) return setNumbers(nu ? null : 'nu');
    if (opts.some(o => /^(rnu!|invrnu)$/.test(o))) return setNumbers(nu && nu.mode === 'rnu' ? 'nu' : 'rnu');
    return setNumbers(nu && opts.some(o => /^(nornu|norelativenumber)$/.test(o)) ? 'nu' : null);
  }
  const bg = arg.match(/^(?:bg|background)=(light|dark)$/);
  if (bg) {
    if ((document.documentElement.dataset.theme || 'dark') !== bg[1]) toggleTheme();
    return flash(`background=${bg[1]}`);
  }
  if (/^(nocompatible|nocp)$/.test(arg)) return flash('already. this site has never been compatible.');
  flash(`E518: Unknown option: ${arg.split(' ')[0]}`);
}

/* ---------- :syntax off  all the colour, gone ---------- */
function syntax(on) {
  discover('syntax');
  document.documentElement.classList.toggle('egg-nosyn', !on);
  flash(on ? 'syntax on. welcome back, colour.' : 'syntax off  ·  :syntax on to bring it back');
}

/* ---------- :colo  vim's built-in colour schemes, loosely recreated ---------- */
//                 bg         panel      fg         muted      faint      accent     kw         str
const SCHEMES = {
  desert:    ['#333333', '#2a2a2a', '#ffffff', '#c2bfa5', '#7f8f8f', '#f0e68c', '#bdb76b', '#ffa0a0'],
  blue:      ['#000087', '#00005f', '#ffffff', '#d0d0d0', '#5f87d7', '#ffd700', '#87d7ff', '#ff87ff'],
  morning:   ['#e5e5e5', '#d7d7d7', '#000000', '#2020c0', '#8a8a8a', '#a52a2a', '#2e8b57', '#c000c0'],
  evening:   ['#333333', '#2a2a2a', '#ffffff', '#80a0ff', '#6a6a8a', '#ffff60', '#60ff60', '#ffa0a0'],
  murphy:    ['#000000', '#0c0c0c', '#87ff87', '#ffa500', '#3a6a3a', '#ffff00', '#87ffff', '#ffa0a0'],
  elflord:   ['#000000', '#0a0a14', '#00ffff', '#80a0ff', '#30507a', '#ff80ff', '#ffff60', '#ff6060'],
  peachpuff: ['#ffdab9', '#f5cba7', '#000000', '#406090', '#b08a70', '#c00058', '#a52a2a', '#c00058'],
};
const VARS = ['--bg', '--panel', '--fg', '--muted', '--faint', '--accent', '--kw', '--str'];
let scheme = 'default';
function colo(name) {
  if (!name) return flash(`${scheme}  ·  try: ${Object.keys(SCHEMES).join(' ')} default`);
  const root = document.documentElement.style;
  if (name === 'default') {
    VARS.concat('--rule', '--rule-strong', '--sel').forEach(v => root.removeProperty(v));
    root.removeProperty('color-scheme');
    scheme = 'default';
    return flash('colorscheme default');
  }
  const c = SCHEMES[name];
  if (!c) return flash(`E185: Cannot find color scheme '${name}'`);
  discover('colo');
  VARS.forEach((v, i) => root.setProperty(v, c[i]));
  root.setProperty('--rule', `color-mix(in srgb, ${c[2]} 14%, transparent)`);
  root.setProperty('--rule-strong', `color-mix(in srgb, ${c[2]} 34%, transparent)`);
  root.setProperty('--sel', `color-mix(in srgb, ${c[5]} 20%, transparent)`);
  root.setProperty('color-scheme', name === 'morning' || name === 'peachpuff' ? 'light' : 'dark');
  scheme = name;
  flash(`colorscheme ${name}  ·  :colo default to go back`);
}

/* ---------- :earlier 10y / :later  vim's undo history, used as a time machine ---------- */
let retro = null;
function earlier(n, unit) {
  n = n ? parseInt(n, 10) : 0;
  unit = (unit || '').replace(/s$/, '');
  if (!n) return undo();
  const secs = { s: 1, sec: 1, second: 1, m: 60, min: 60, minute: 60, h: 3600, hour: 3600, d: 86400, day: 86400, y: 31557600, year: 31557600 }[unit];
  if (secs === undefined) {
    if (unit === 'f') return flash('this site has never been saved. it lives in your browser.');
    return flash(`E475: Invalid argument: ${n}${unit}`);
  }
  if (secs * n < 86400 * 365) {
    // a few minutes back: undo whatever was changed in that window
    const since = Date.now() - secs * n * 1000;
    let k = 0;
    while (undos.length && undos[undos.length - 1].at >= since) { undos.pop().fn(); changeNo--; k++; }
    return flash(k ? `${k} change${k === 1 ? '' : 's'} undone` : 'Already at oldest change');
  }
  const years = Math.round(secs * n / 31557600);
  const year = new Date().getFullYear() - years;
  if (year < 1991) return flash(`E: there was no web in ${year}. the first website went up in 1991.`);
  run('earlier', () => timeTravel(year, years))();
}
function later() {
  if (retro) return retro();
  flash('Already at newest change');
}
async function warp(from, to) {
  if (reduceMotion) return;
  const w = document.createElement('div');
  w.className = 'egg egg-warp';
  w.innerHTML = '<b></b>';
  document.body.appendChild(w);
  const b = w.firstChild;
  let t = 0;
  await frames((now, dt) => {
    t += dt;
    const p = clamp(t / 1.1, 0, 1);
    b.textContent = Math.round(from + (to - from) * ease(p));
    w.style.opacity = p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
    return p < 1;
  });
  w.remove();
}
async function timeTravel(year, years) {
  const now = new Date().getFullYear();
  await warp(now, year);
  const el = document.createElement('div');
  el.className = 'egg egg-retro';
  el.innerHTML = retroPage(year, years);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  flash(`as of ${year}  ·  :later ${years}y (or esc) to come back`);
  await new Promise(done => {
    const back = async (then) => {
      retro = null;
      removeEventListener('keydown', onKey, true);
      el.classList.remove('on');
      await wait(200);
      el.remove();
      await warp(year, now);
      flash(`back to ${now}.`);
      done();
      if (then) then();
    };
    const onKey = e => { if (e.key === 'Escape') back(); };
    addEventListener('keydown', onKey, true);
    retro = () => back();
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-go]');
      if (!a) return;
      e.preventDefault();
      const go = a.dataset.go;
      if (go === 'guestbook') return flash('the guestbook has been full since 2009. try the \u25C6 instead.');
      back(() => goTo(go));
    });
  });
}
function retroPage(year, years) {
  const y2k = year < 2000 ? ' This site is Y2K compliant!' : '';
  return `
<div class="r-tm">&#x27F2; ${year} &middot; type <b>:later ${years}y</b> or press esc to come back</div>
<div class="r-page">
  <div class="r-marquee"><span>&#9733; Welcome to Tyler's Home Page!!! &#9733; Thanks for stopping by &#9733; Don't forget to sign my guestbook &#9733;</span></div>
  <table class="r-tbl" role="presentation"><tr>
    <td class="r-side">
      <p><b>~*~ Navigation ~*~</b></p>
      <p><a href="#" data-go="top">&#x1F3E0; Home</a><br><a href="#" data-go="about">About Me</a><br><a href="#" data-go="projects">My Projects</a><br><a href="#" data-go="experience">My Jobs</a><br><a href="#" data-go="guestbook">Guestbook</a><br><a href="mailto:tythompson@davidson.edu">Email me!</a></p>
      <div class="r-ring"><b>Sprinters Webring</b><br><a href="#" data-go="top">&laquo; prev</a> | <a href="#" data-go="top">random</a> | <a href="#" data-go="top">next &raquo;</a></div>
      <p class="r-small">Best viewed in Netscape Navigator at 800x600</p>
    </td>
    <td class="r-main">
      <h1 class="r-rainbow">Tyler Thompson</h1>
      <div class="r-uc"><span>&#x1F6A7;</span> UNDER CONSTRUCTION <span>&#x1F6A7;</span></div>
      <hr class="r-hr">
      <h2>About Me</h2>
      <p>Hi!!! My name is Tyler. I like computers, math, and running really fast. I go to Davidson College and I study Computer Science and Math.</p>
      <h2>My Projects <span class="r-new">NEW!</span></h2>
      <ul>
        <li>A program that counts cards at blackjack (don't tell the casino)</li>
        <li>A website that turns you into ASCII art</li>
        <li>A VR game where you find a lost alien dog in space</li>
        <li>Famous football plays, redrawn as pixel art</li>
      </ul>
      <h2>Fun Facts</h2>
      <ul><li>My 400m PR is <b>49.42</b> seconds!!</li><li>This page took me 3 weeks to make</li></ul>
      <hr class="r-hr">
      <p class="r-counter">You are visitor number <span>004942</span></p>
      <p class="r-small">&copy; ${year} Tyler Thompson. Last updated ${['January', 'March', 'June', 'August', 'October'][year % 5]} ${year}.${y2k}</p>
    </td>
  </tr></table>
</div>`;
}

/* ---------- :!  a shell, sort of ---------- */
let pagerEl = null, pagerOff = null;
function closePager() { if (pagerEl) { pagerEl.remove(); pagerEl = null; pagerOff(); } }
function pager(cmd, out, code = 0) {
  closePager();
  const el = document.createElement('div');
  el.className = 'egg egg-term';
  el.setAttribute('role', 'log');
  el.innerHTML = `<div class="egg-term-cmd">:!${esc(cmd)}</div>` + (out ? `<pre>${out}</pre>` : '') +
    (code ? `<div class="egg-term-dim">shell returned ${code}</div>` : '') +
    '<div class="egg-term-more">Press ENTER or type command to continue</div>';
  document.body.appendChild(el);
  pagerEl = el;
  const key = e => {
    if (e.key === ':') { e.preventDefault(); e.stopPropagation(); closePager(); openCommand(); }
    else if (/^(Enter|Escape| |q)$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); closePager(); }
  };
  const outside = e => { if (!el.contains(e.target)) closePager(); };
  setTimeout(() => { addEventListener('keydown', key, true); addEventListener('pointerdown', outside, true); });
  pagerOff = () => { removeEventListener('keydown', key, true); removeEventListener('pointerdown', outside, true); };
}
const dir = s => `<span class="d">${esc(s)}</span>`;
const pad = (s, n) => String(s).padEnd(n);
const FILES = {
  'about.txt': () => [...document.querySelectorAll('.about-text p')].map(p => p.textContent.trim()).join('\n\n'),
  'experience.log': () => [...document.querySelectorAll('.log li')].map(li =>
    `[${li.querySelector('.date').textContent.trim()}] ${li.querySelector('h4').textContent.trim()}\n    ${li.querySelector('.role').textContent.trim()}`).join('\n'),
  'contact.txt': () => [...document.querySelectorAll('.contact-table dt')].map(dt => `${pad(dt.textContent.trim(), 9)}${dt.nextElementSibling.textContent.trim()}`).join('\n'),
  'resume.pdf': null,
};
const projects = () => [...document.querySelectorAll('.card .dir')].map(d => d.textContent.trim());
function ls(args) {
  const all = args.some(a => /^-\w*a/.test(a)), long = args.some(a => /^-\w*l/.test(a));
  const target = args.find(a => !a.startsWith('-'));
  if (target && /^(\.\/)?projects\/?$/.test(target)) return projects().map(dir).join(long ? '\n' : '  ');
  if (target && target !== '.' && target !== '~') return null;
  const names = (all ? ['./', '../', '.secrets'] : []).concat(Object.keys(FILES), 'projects/');
  if (!long) return names.map(n => n.endsWith('/') ? dir(n) : esc(n)).join('  ');
  const size = n => n.endsWith('/') ? '4.0K' : n === '.secrets' ? ' 31B' : n === 'resume.pdf' ? ' 84K' : ((FILES[n] ? FILES[n]().length : 900) / 1024).toFixed(1) + 'K';
  return `total ${names.length * 8}\n` + names.map(n =>
    `${n.endsWith('/') ? 'drwxr-xr-x' : '-rw-r--r--'}  1 tyler  staff  ${size(n).padStart(4)}  Oct 27 03:07  ${n.endsWith('/') ? dir(n) : esc(n)}`).join('\n');
}
const RUNNER = `       O
     _/|\\__
       |
      / \\
    _/   \\_`;
function shell(line) {
  discover('shell');
  const args = line.split(/\s+/).filter(Boolean);
  const cmd = (args.shift() || '').toLowerCase(), rest = args.join(' ');
  const out = (s, code) => pager(line, s, code);
  switch (cmd) {
    case '': return flash('E471: Argument required');
    case 'ls': case 'll': case 'dir': {
      const r = ls(cmd === 'll' ? ['-l', ...args] : args);
      return r == null ? out(`ls: ${esc(args.find(a => !a.startsWith('-')))}: No such file or directory`, 1) : out(r);
    }
    case 'pwd': return out('/home/tyler');
    case 'whoami': return out('guest\n<span class="dim"># tyler is the other one</span>');
    case 'cd': {
      const t = (args[0] || '~').replace(/^\.\//, '').replace(/\/$/, '');
      const map = { '~': 'top', '': 'top', '..': 'top', '/': 'top', about: 'about', 'about.txt': 'about', projects: 'projects', experience: 'experience', 'experience.log': 'experience', contact: 'contact', 'contact.txt': 'contact' };
      if (!(t in map)) return out(`cd: no such file or directory: ${esc(t)}`, 1);
      goTo(map[t]);
      return flash(`~/${map[t] === 'top' ? '' : map[t]}`);
    }
    case 'cat': case 'less': case 'more': case 'head': case 'bat': {
      const f = (args[0] || '').replace(/^(\.\/|~\/)/, '');
      if (!f) return out('cat: reading from stdin...\n<span class="dim"># it’s a website. there is no stdin.</span>', 1);
      if (f === '.secrets') { closePager(); return openPanel(); }
      if (f === 'resume.pdf') return out('resume.pdf: binary file\n<span class="dim"># try :sudo hire tyler</span>', 1);
      if (/^projects\/?/.test(f)) return out(`cat: ${esc(f)}: Is a directory`, 1);
      if (!(f in FILES)) return out(`cat: ${esc(f)}: No such file or directory`, 1);
      return out(esc(FILES[f]()));
    }
    case 'echo': return out(esc(rest.replace(/\$USER\b/g, 'guest').replace(/\$HOME\b/g, '/home/tyler').replace(/\$PR\b/g, '49.42').replace(/\$SHELL\b/g, '/bin/vim').replace(/^["']|["']$/g, '')));
    case 'date': return out(esc(new Date().toString()));
    case 'uname': return out(args.includes('-a') ? 'TylerOS tyler.thompson 49.42.0 sprint-release x86_64' : 'TylerOS');
    case 'sudo': {
      if (/hire/.test(rest)) { closePager(); return COMMANDS['sudo hire tyler'](); }
      if (/^rm\b/.test(rest)) { closePager(); return COMMANDS['rm -rf /'](); }
      return out(`[sudo] password for guest: \nguest is not in the sudoers file. This incident will be reported.`, 1);
    }
    case 'rm': if (/-\w*r/.test(rest)) { closePager(); return COMMANDS['rm -rf /'](); }
      return out(`rm: ${esc(rest || 'missing operand')}: Permission denied`, 1);
    case 'exit': case 'logout': closePager(); return COMMANDS['q!']();
    case 'clear': case 'reset': return closePager();
    case 'git': {
      const sub = args[0];
      if (sub === 'blame') { closePager(); return blame(); }
      if (sub === 'log') return out(POOL.slice(0, 8).map((m, i) => `<span class="h">${hex7(m)}</span> ${esc(m)}`).join('\n') + `\n<span class="h">${hex7('init')}</span> initial commit`);
      if (sub === 'status') return out('On branch main\nYour branch is ahead of ‘origin/main’ by 49 commits.\n\nnothing to commit, working tree clean <span class="dim"># (it’s never clean)</span>');
      if (sub === 'push') return out('Everything up-to-date <span class="dim"># it’s 3am. go to bed.</span>');
      return out(`git: ‘${esc(sub || '')}’ is not a git command. See ‘git --help’.`, 1);
    }
    case 'vim': case 'vi': case 'nvim': return out('you’re already in it.');
    case 'emacs': case 'nano': case 'code': return out(`${esc(cmd)}: not in this house.`, 1);
    case 'python': case 'python3': return out('Python 3.12.4\n&gt;&gt;&gt; 49.42 / 4\n12.355\n&gt;&gt;&gt; <span class="dim"># average 100m split. the last one is not average.</span>\n&gt;&gt;&gt; exit()');
    case 'man': return out(`No manual entry for ${esc(rest || 'nothing')}\n<span class="dim"># try :help</span>`, 1);
    case 'top': case 'htop': return out(`  PID  COMMAND        %CPU\n    1  tyler          100.0\n   42  homework        63.2\n 4942  sprint          49.4\n  235  grading         28.0\n    7  sleep            0.3`);
    case 'ping': return out([0, 1, 2].map(i => `64 bytes from ${esc(rest || 'davidson.edu')}: icmp_seq=${i} ttl=64 time=${(49.42 + (i - 1) * 0.07).toFixed(2)} ms`).join('\n'));
    case 'cowsay': case 'say': {
      const t = rest || 'moo. hire tyler.';
      return out(esc(` ${'_'.repeat(t.length + 2)}\n< ${t} >\n ${'-'.repeat(t.length + 2)}\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||`));
    }
    case 'open': {
      const f = (args[0] || '').replace(/\/$/, '');
      if (projects().some(p => p.replace(/\/$/, '') === f)) {
        const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.dir').textContent.trim().replace(/\/$/, '') === f);
        closePager();
        return card.click();
      }
      return out(`The file ${esc(f)} does not exist.`, 1);
    }
    case 'help': return out('try: ls  cd  cat  pwd  whoami  git  top  ping  python  cowsay  sudo  exit');
    default: return out(`zsh: command not found: ${esc(cmd)}`, 127);
  }
}

/* ---------- :help!  :help 42  :smile  vim's own jokes, re-run ---------- */
function vimHelp(arg) {
  arg = (arg || '').trim();
  const joke = text => { discover('vimhelp'); notify(text, 5000); };
  if (arg === '!' ) return joke('E478: Don’t panic!');
  if (arg === '42') return joke('the answer to life, the universe and everything is 42. tyler’s is 49.42.');
  if (/^holy-?grail$/.test(arg)) return joke('You found it, Arthur!  (the rest are in :secrets)');
  if (arg === 'smile') return smile();
  flash(`E149: Sorry, no help for ${arg}`);
}
function smile() {
  discover('vimhelp');
  pager('smile', `<span class="h">${esc(RUNNER)}</span>\n\n  keep smiling. keep running.`);
  pagerEl.querySelector('.egg-term-cmd').textContent = ':smile';
}

/* ---------- 4942  a victory lap along the status bar ---------- */
async function victoryLap() {
  clearTimeout(flash.t);
  barMain.innerHTML = '<span class="egg-lap"><i></i><span class="egg-lap-man" aria-hidden="true">\u{1F3C3}</span></span><span class="egg-lap-clock">0.00</span>';
  const man = barMain.querySelector('.egg-lap-man'), clock = barMain.querySelector('.egg-lap-clock');
  const T = reduceMotion ? 0.05 : 2.8;
  let t = 0;
  await frames((now, dt) => {
    t += dt;
    const p = clamp(t / T, 0, 1);
    man.style.left = `calc(${(p * 100).toFixed(2)}% - ${p.toFixed(3)} * 1.2em)`;
    clock.textContent = (p * PR_400M).toFixed(2);
    return p < 1 && man.isConnected;
  });
  if (!man.isConnected) return;
  clock.classList.add('done');
  confetti();
  await wait(1100);
  if (clock.isConnected) flash('victory lap. 49.42, pr pace. ◆');
}
function confetti() {
  if (reduceMotion) return;
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('span');
    s.className = 'egg egg-confetti';
    s.textContent = '◆';
    s.style.left = (10 + Math.random() * 80) + 'vw';
    s.style.setProperty('--dx', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
    s.style.setProperty('--dy', (-120 - Math.random() * 260).toFixed(0) + 'px');
    s.style.setProperty('--r', ((Math.random() - 0.5) * 720).toFixed(0) + 'deg');
    s.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
    if (i % 3 === 0) s.style.color = 'var(--kw)';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1800);
  }
}

/* ---------- normal-mode keys: dd yy p P u, and 4942 typed anywhere ---------- */
let keys = '', keysT, digits = '', digitsT;
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || busy || panel || pagerEl) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
  if (e.key.length !== 1) { keys = ''; return; }
  if (/\d/.test(e.key)) {
    digits = (digits + e.key).slice(-4);
    clearTimeout(digitsT); digitsT = setTimeout(() => { digits = ''; }, 1500);
    if (digits === '4942') { digits = ''; run('lap', victoryLap)(); }
    return;
  }
  keys = (keys + e.key).slice(-2);
  clearTimeout(keysT); keysT = setTimeout(() => { keys = ''; }, 900);
  if (keys === 'dd') { keys = ''; deleteSection(); }
  else if (keys === 'yy') { keys = ''; yank(); }
  else if (e.key === 'p' || e.key === 'P') { keys = ''; put(e.key === 'P'); }
  else if (e.key === 'u') { keys = ''; undo(); }
});

/* ---------- visual mode: selecting text, and yanking it ---------- */
let visual = false;
document.addEventListener('selectionchange', () => {
  if (typing()) return;
  const sel = getSelection();
  const txt = sel.isCollapsed ? '' : sel.toString();
  const inBar = sel.anchorNode && sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('.bar');
  if (txt.trim() && !inBar) {
    if (!visual) { visual = true; bar.classList.add('visual'); discover('visual'); }
    barMode.textContent = 'VISUAL';
    showcmd.textContent = String(txt.replace(/\s+/g, ' ').trim().length);
  } else if (visual) {
    visual = false;
    bar.classList.remove('visual');
    if (!typing()) barMode.textContent = 'NORMAL';
    showcmd.textContent = '';
  }
});
document.addEventListener('copy', () => {
  if (!visual) return;
  const n = getSelection().toString().replace(/\s+/g, ' ').trim().length;
  notify(`${n} char${n === 1 ? '' : 's'} yanked`, 2200);
});

/* ---------- leaving: the tab title misses you, and a welcome back after 5 minutes ---------- */
const TITLE = document.title;
const AWAY = ['\u{1F3C3} lap 2 isn’t over', '← you left mid-rep', ':q? really?', 'the bell rang. come back'];
let leftAt = 0;
const fmtGone = s => s < 3600 ? `${Math.round(s / 60)}m` : `${Math.floor(s / 3600)}h ${Math.round(s % 3600 / 60)}m`;
const welcomeBack = gone => `welcome back. you were gone ${fmtGone(gone)}, that’s ${(gone / PR_400M).toLocaleString(undefined, { maximumFractionDigits: 1 })} laps at 49.42 pace.`;
if (!inPane) document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    leftAt = Date.now();
    document.title = AWAY[Math.floor(Math.random() * AWAY.length)];
    return;
  }
  const gone = (Date.now() - leftAt) / 1000;
  if (document.title !== TITLE) {
    document.title = TITLE;
    if (gone > 1.5) discover('tab');
  }
  if (leftAt && gone > 300) { discover('away'); notify(welcomeBack(gone), 7000); }
});

/* ---------- devtools: a note in the console, and a tyler object to poke ---------- */
function greet() {
  console.log(`%c${RUNNER}\n%c\nlooking under the hood? you’re my kind of person.\n\n  tyler.hire()     the résumé, the fun way\n  tyler.secrets()  everything hidden on this page (${found.size}/${EGGS.length} found)\n  tyler.pr         → 49.42\n`,
    'font-family: monospace; color: #d4735f; font-weight: bold', 'font-family: monospace; color: inherit');
}
if (!inPane) {
  window.tyler = {
    get pr() { discover('devtools'); return PR_400M; },
    hire() { discover('devtools'); COMMANDS['sudo hire tyler'](); return '↑ look at the page'; },
    secrets() { discover('devtools'); openPanel(); return `${found.size}/${EGGS.length} found`; },
    toString() { return 'Tyler Thompson · cs & math · 49.42'; },
  };
  greet();
}

/* ---------- offline, and a window too narrow to be useful ---------- */
addEventListener('offline', () => { discover('offline'); notify('E211: network no longer available', 8000); });
addEventListener('online', () => notify('network’s back. carry on.', 2500));
let wasNarrow = innerWidth < 300;
addEventListener('resize', () => {
  const n = innerWidth < 300;
  if (n && !wasNarrow && !inPane) { discover('narrow'); notify('E36: Not enough room', 3000); }
  wasNarrow = n;
});

/* ---------- commands with arguments go through here (index.html asks before E492) ---------- */
const un = s => s.replace(/\\(.)/g, '$1');
const BARE_SHELL = /^(ls|ll|pwd|whoami|cd|cat|echo|date|uname|git|top|htop|ping|cowsay|python3?|man|exit|logout|clear|open)$/;
window.eggCommand = raw => {
  const s = raw.replace(/^:+/, '').trim(), low = s.toLowerCase().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(?:%|\.|\d+,\s*\$)?s\/((?:\\.|[^\\/])*)\/((?:\\.|[^\\/])*)(?:\/([gciI]*))?$/))) return () => substitute(un(m[1]), un(m[2]), m[3] || '');
  if (s.startsWith('!')) return () => shell(s.slice(1).trim());
  if ((m = low.match(/^(?:colo|colorscheme)(?: (\S+))?$/))) return () => colo(m[1]);
  if ((m = low.match(/^earlier(?: (\d+) ?([a-z]*))?$/))) return () => earlier(m[1], m[2]);
  if (/^later\b/.test(low)) return later;
  if ((m = low.match(/^(?:set|se) (.+)$/))) return () => setOption(m[1]);
  if ((m = low.match(/^(?:h|help) (\S+)$/))) return () => vimHelp(m[1]);
  if (BARE_SHELL.test(low.split(' ')[0])) return () => shell(s);
  return null;
};
COMMANDS.vsplit = COMMANDS.vs = COMMANDS.vsp = COMMANDS.vnew = run('vsplit', () => split('v'));
COMMANDS.split = COMMANDS.sp = COMMANDS.new = run('vsplit', () => split('h'));
COMMANDS['git blame'] = COMMANDS.blame = COMMANDS.gblame = COMMANDS['g blame'] = blame;
COMMANDS['syntax off'] = COMMANDS['syn off'] = () => syntax(false);
COMMANDS['syntax on'] = COMMANDS['syn on'] = COMMANDS['syntax enable'] = () => syntax(true);
COMMANDS.undo = COMMANDS.u = undo;
COMMANDS.noh = COMMANDS.nohlsearch = noh;
COMMANDS.smile = smile;
COMMANDS['help!'] = COMMANDS['h!'] = () => vimHelp('!');
COMMANDS.earlier = () => earlier();
COMMANDS.later = later;
COMMANDS['4942'] = COMMANDS['49.42'] = COMMANDS.lap = COMMANDS.victory = run('lap', victoryLap);

/* ---------- :secrets  a counter in the status bar and a list of clues ---------- */
const LIST = {
  rm:     { cmd: ':!rm -rf /',       what: 'delete the whole site',     clue: 'some commands are dangerous. run one anyway.', go: rm },
  sprint: { cmd: ':sprint',          what: 'one lap at PR pace',        clue: 'tyler runs one lap. ask for it by name.',      go: COMMANDS.sprint },
  crt:    { cmd: ':q!',              what: 'try to leave',              clue: 'how do you exit vim?',                         go: COMMANDS['q!'] },
  konami: { cmd: '↑↑↓↓←→←→ b a',     what: 'the whole page, in ASCII',  clue: 'a cheat code older than this website.',        go: startAscii },
  hire:   { cmd: ':sudo hire tyler', what: 'escalate privileges',       clue: 'sudo can do anything. almost.',                go: COMMANDS['sudo hire tyler'] },
  detect: { cmd: ':detect',          what: 'object detection, live',    clue: 'ask the page what it sees.',                   go: COMMANDS.detect },
  blackjack: { cmd: ':blackjack',    what: 'a hand, counted hi-lo',     clue: 'one of the projects counts cards. sit down.',  go: COMMANDS.blackjack },
  train:  { cmd: ':train',           what: 'gradient descent, twice',   clue: 'models don\u2019t learn on their own. tell one to.', go: COMMANDS.train },
  snake:  { cmd: ':snake',           what: 'eat the page',              clue: 'a very old game. here it eats letters.',       go: COMMANDS.snake },
  idle:   { cmd: 'do nothing for 1m', what: 'a screensaver',            clue: 'walk away for a minute.',                      go: COMMANDS.idle },
  shake:  { cmd: 'shake your phone', what: 'an earthquake',             clue: 'on a phone? shake it.',                        go: shakeFromList },
  day:    { cmd: ':day',             what: 'a day, cut together with blinks', clue: 'blink and you miss a whole day.',       go: COMMANDS.day },
  kick:   { cmd: ':last100',         what: 'the home straight, first person', clue: 'the last 100m of a 400 is the hard part. feel it.', go: COMMANDS.last100 },
  late:   { cmd: ':3am',             what: 'a late-night build',        clue: 'what time does this site get built?',          go: COMMANDS['3am'] },
  subst:  { cmd: ':%s/tyler/batman/g', what: 'find and replace the page', clue: 'vim can rewrite every line at once. rename someone.', go: () => substitute('tyler', 'batman', 'g') },
  dd:     { cmd: 'dd  p  u',         what: 'cut, paste, undo sections', clue: 'in vim you delete a line by pressing one key twice.', go: deleteSection },
  vsplit: { cmd: ':vsplit',          what: 'two of this page',          clue: 'one window isn\u2019t enough. split it.',     go: COMMANDS.vsplit },
  blame:  { cmd: ':git blame',       what: 'who wrote each line, and why', clue: 'someone wrote every line. find out who.',  go: blame },
  nu:     { cmd: ':set nu',          what: 'line numbers (and :set rnu)', clue: 'the first thing anyone turns on in vim.',     go: () => setNumbers('rnu') },
  syntax: { cmd: ':syntax off',      what: 'all the colour, gone',      clue: 'turn the highlighting off.',                   go: () => syntax(!document.documentElement.classList.contains('egg-nosyn')) },
  colo:   { cmd: ':colo desert',     what: 'vim\u2019s old colour schemes', clue: 'vim ships with colour schemes. desert is a classic.', go: () => colo(scheme === 'desert' ? 'default' : 'desert') },
  earlier: { cmd: ':earlier 10y',    what: 'this site, years ago',      clue: 'vim\u2019s undo can go back in time. way back.', go: () => earlier('10', 'y') },
  shell:  { cmd: ':!ls',             what: 'a shell, sort of',          clue: 'a bang runs shell commands. look around.',     go: () => shell('ls -la') },
  vimhelp: { cmd: ':help!  :smile',  what: 'vim\u2019s own jokes',      clue: 'vim has easter eggs too. ask for help, urgently.', go: () => vimHelp('!') },
};

const countBtn = document.createElement('button');
countBtn.type = 'button'; countBtn.id = 'egg-count';
countBtn.setAttribute('aria-label', 'Secrets found');
document.getElementById('theme-btn').before(countBtn);
function updateCount(pulse) {
  const all = found.size === EGGS.length;
  countBtn.textContent = `◆ ${found.size}/${EGGS.length}${all ? ' ✓' : ''}`;
  countBtn.classList.toggle('all', all);
  if (pulse) { countBtn.classList.remove('pulse'); void countBtn.offsetWidth; countBtn.classList.add('pulse'); }
  if (panel) renderPanel();
}

let panel = null;
function renderPanel() {
  panel.innerHTML = `<div class="egg-ph"><span>secrets <b>${found.size}/${EGGS.length}</b> found</span><button type="button" data-close aria-label="Close">esc ✕</button></div>` +
    EGGS.map(id => {
      const e = LIST[id], got = found.has(id);
      return `<button type="button" class="egg-row${got ? ' got' : ''}" data-egg="${id}">
        ${got ? `<span class="egg-cmd">◆ ${esc(e.cmd)}</span><span class="egg-what">${esc(e.what)}</span>`
              : `<span class="egg-what egg-clue">◇ ${esc(e.clue)}</span>`}
        <span class="egg-go">${got ? 'run ▸' : 'reveal'}</span></button>`;
    }).join('') +
    `<div class="egg-pf">${found.size === EGGS.length ? 'all found. more coming.' : 'hint: most of these are typed after <kbd>:</kbd>'}</div>`;
}
function closePanel() {
  if (!panel) return;
  panel.remove(); panel = null;
  removeEventListener('keydown', panelKey, true);
  removeEventListener('pointerdown', panelOutside, true);
}
const panelKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } };
const panelOutside = e => { if (!panel.contains(e.target) && e.target !== countBtn) closePanel(); };
function openPanel() {
  if (panel) return closePanel();
  panel = document.createElement('div');
  panel.className = 'egg-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Secrets');
  renderPanel();
  document.body.appendChild(panel);
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closePanel();
    const row = e.target.closest('[data-egg]');
    if (row) { closePanel(); LIST[row.dataset.egg].go(); }
  });
  addEventListener('keydown', panelKey, true);
  addEventListener('pointerdown', panelOutside, true);
}
countBtn.addEventListener('click', openPanel);
COMMANDS.secrets = COMMANDS.eggs = COMMANDS.secret = openPanel;
updateCount(false);
})();
