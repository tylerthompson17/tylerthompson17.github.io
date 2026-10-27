// retro.js: links marked data-retro play a pixel-art drip-down transition before navigating.
// Paint drips over the page in the site accent, then a striped football field drips over that,
// and a CRT-style title card loads the play. data-retro-title / data-retro-sub set the card text.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 5x7 bitmap font, just the glyphs the title cards need
  const FONT = {
    A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
    C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
    E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
    I: '01110 00100 00100 00100 00100 00100 01110', K: '10001 10010 10100 11000 10100 10010 10001',
    L: '10000 10000 10000 10000 10000 10000 11111', M: '10001 11011 10101 10101 10001 10001 10001',
    N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
    P: '11110 10001 10001 11110 10000 10000 10000', R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
    W: '10001 10001 10001 10101 10101 10101 01010', Y: '10001 10001 01010 00100 00100 00100 00100',
    0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
    2: '01110 10001 00001 00010 00100 01000 11111', 7: '11111 00001 00010 00100 01000 01000 01000',
    8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
    '.': '00000 00000 00000 00000 00000 00000 00100', '>': '01000 01100 01110 01111 01110 01100 01000',
  };
  const textWidth = (s, k) => s.length * 6 * k - k;
  function drawText(ctx, s, x, y, k, color) {
    ctx.fillStyle = color;
    [...s.toUpperCase()].forEach((ch, i) => {
      const rows = (FONT[ch] || '').split(' ');
      rows.forEach((row, r) => {
        for (let c = 0; c < 5; c++) if (row[c] === '1') ctx.fillRect(x + (i * 6 + c) * k, y + r * k, k, k);
      });
    });
  }

  // a smooth random walk, so neighbouring columns drip at similar times and read as one sheet
  function walk(n, lo, hi) {
    const out = new Float32Array(n);
    let v = Math.random();
    for (let i = 0; i < n; i++) {
      v = clamp(v + (Math.random() - 0.5) * 0.35, 0, 1);
      out[i] = lo + (hi - lo) * v;
    }
    return out;
  }

  function play(href, title, sub) {
    const W = window.innerWidth, H = window.innerHeight;
    const P = clamp(Math.round(Math.min(W, H) / 110), 3, 9);                // 3 keeps the title card inside a phone screen
    const cols = Math.ceil(W / P), rows = Math.ceil(H / P);

    const overlay = document.createElement('div');
    overlay.className = 'retro-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const cv = document.createElement('canvas');
    cv.width = cols; cv.height = rows;
    overlay.appendChild(cv);
    document.body.appendChild(overlay);
    const ctx = cv.getContext('2d');

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4735f';
    const band = Math.max(3, Math.round(cols / 22));
    const yard = Math.max(6, Math.round(cols / 11));
    const fieldColor = c => {
      if (c < band || c >= cols - band) return '#5f7358';            // end zones
      if ((c - band) % yard === 0) return '#e9e6da';                  // yard lines
      return Math.floor(c / band) % 2 ? '#7f9577' : '#758b6d';        // mowing stripes
    };
    // each layer: when each column starts and how long it takes to reach the bottom
    const layers = [
      { start: walk(cols, 0, 0.18), dur: walk(cols, 0.38, 0.6), color: () => accent, lit: '#f0a493' },
      { start: walk(cols, 0.22, 0.42), dur: walk(cols, 0.42, 0.66), color: fieldColor, lit: '#a9bd9f' },
    ];
    // a few columns shed a droplet that falls ahead of the sheet
    const drops = layers.map(() => Array.from({ length: cols }, () => Math.random() < 0.22));

    const t0 = performance.now();
    let navigated = false;
    (function frame(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, cols, rows);
      layers.forEach((L, li) => {
        for (let c = 0; c < cols; c++) {
          const k = (t - L.start[c]) / L.dur[c];
          if (k <= 0) continue;
          const h = Math.min(rows + 2, Math.floor(Math.pow(k, 1.7) * (rows + 2)));
          ctx.fillStyle = L.color(c);
          ctx.fillRect(c, 0, 1, h);
          if (h < rows) {
            ctx.fillStyle = L.lit;                                      // wet highlight on the drip head
            ctx.fillRect(c, h - 1, 1, 1);
            if (drops[li][c]) {
              ctx.fillStyle = L.color(c);
              ctx.fillRect(c, h + 2 + Math.floor(k * 6), 1, 2);
            }
          }
        }
      });

      // title card: a CRT line opens into a box once the field has mostly landed
      const tc = t - 1.0;
      if (tc > 0) {
        const k = cols >= 190 ? 2 : 1;
        const tw = Math.max(textWidth(title, k), textWidth(sub, 1), 60);
        const bw = tw + 16, bh = 7 * k + 7 + 7 + 30;
        const bx = Math.round((cols - bw) / 2), by = Math.round((rows - bh) / 2);
        const open = clamp(tc / 0.16, 0, 1);
        const vh = Math.max(1, Math.round(bh * open));
        const vy = by + Math.round((bh - vh) / 2);
        ctx.fillStyle = 'rgba(20,22,26,0.45)';
        ctx.fillRect(bx + 2, vy + 2, bw, vh);                           // drop shadow
        ctx.fillStyle = '#14161a';
        ctx.fillRect(bx, vy, bw, vh);
        ctx.fillStyle = '#e9e6da';
        ctx.fillRect(bx, vy, bw, 1); ctx.fillRect(bx, vy + vh - 1, bw, 1);
        ctx.fillRect(bx, vy, 1, vh); ctx.fillRect(bx + bw - 1, vy, 1, vh);
        if (open === 1) {
          let y = by + 7;
          drawText(ctx, title, Math.round((cols - textWidth(title, k)) / 2), y, k, '#e9e6da');
          y += 7 * k + 6;
          drawText(ctx, sub, Math.round((cols - textWidth(sub, 1)) / 2), y, 1, '#a9bd9f');
          y += 7 + 6;
          const bar = bw - 16, fill = Math.floor(bar * clamp((tc - 0.16) / 0.55, 0, 1));
          ctx.fillStyle = '#3a4038';
          ctx.fillRect(bx + 8, y, bar, 3);
          ctx.fillStyle = accent;
          for (let x = 0; x < fill; x += 3) ctx.fillRect(bx + 8 + x, y, 2, 3); // chunky segments
          if (Math.floor(t * 4) % 2) drawText(ctx, '>', bx + 8, y + 6, 1, '#e9e6da');
        }
      }

      if (t > 1.85 && !navigated) { navigated = true; location.href = href; }
      if (!navigated || t < 4) requestAnimationFrame(frame);
    })(t0);
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-retro]');
    if (!a || reduceMotion || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (document.querySelector('.retro-overlay')) { e.preventDefault(); return; }
    e.preventDefault();
    const hint = document.createElement('link');
    hint.rel = 'prefetch'; hint.href = a.href;
    document.head.appendChild(hint);
    play(a.href, a.dataset.retroTitle || 'Retro Replay', a.dataset.retroSub || 'Loading play');
  });

  // coming back via the back button restores the page from cache with the overlay still up
  window.addEventListener('pageshow', e => {
    if (e.persisted) document.querySelectorAll('.retro-overlay').forEach(el => el.remove());
  });
})();
