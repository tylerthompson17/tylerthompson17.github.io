// ascii.js: turns any drawable frame (video, webcam, canvas, image) into a grid of glyphs + tones.
// Shared by ascii-cam.html and the homepage's ascii-cam scene. tones: 0 faint, 1 muted, 2 fg, 3 accent.
const AsciiCam = (() => {
  // dark -> bright
  const RAMPS = {
    classic: ' .,-~:;=!*#$@',
    blocks: ' ░▒▓█',
    binary: ' 01',
    dense: ` .'\`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`,
  };
  const TAG = ['', 'b', 'i', 'u'];

  // line glyph for an edge whose luminance gradient is (gx, gy) in cells; cells are `aspect` wide per 1 tall
  function edgeChar(gx, gy, aspect) {
    const a = ((Math.atan2(-gx / aspect, -gy) * 180 / Math.PI) % 180 + 180) % 180;
    return a < 22.5 || a >= 157.5 ? '-' : a < 67.5 ? '/' : a < 112.5 ? '|' : '\\';
  }

  function createSampler() {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const hist = new Uint32Array(64);
    let lum = new Float32Array(0), lo = 0, hi = 1, primed = false;

    return {
      // forget the auto-levels history (call when the source changes)
      reset() { primed = false; },
      /* src: anything drawImage accepts; sw/sh: its pixel size.
         Center-crops the source to the grid's physical shape, then fills out.ch / out.tone.
         o: { cellAspect, ramp, mode: 'luma'|'edges', contrast, invert, mirror, edge, levels } */
      sample(src, sw, sh, cols, rows, out, o = {}) {
        const aspect = o.cellAspect || 0.6;
        const ramp = o.ramp || RAMPS.classic;
        const n = cols * rows;
        if (cv.width !== cols || cv.height !== rows) { cv.width = cols; cv.height = rows; }
        if (lum.length !== n) lum = new Float32Array(n);

        const want = cols * aspect / rows;
        let cw = sw, ch = sh;
        if (sw / sh > want) cw = sh * want; else ch = sw / want;
        ctx.setTransform(o.mirror ? -1 : 1, 0, 0, 1, o.mirror ? cols : 0, 0);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, cols, rows);
        const px = ctx.getImageData(0, 0, cols, rows).data;

        hist.fill(0);
        for (let i = 0; i < n; i++) {
          const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
          lum[i] = l;
          hist[Math.min(63, l * 64 | 0)]++;
        }

        // auto-levels: stretch the 2nd..98th percentile to the full ramp, eased so webcams don't flicker
        if (o.levels === false) { lo = 0; hi = 1; }
        else {
          let acc = 0, pLo = -1, pHi = 1;
          for (let b = 0; b < 64; b++) {
            acc += hist[b];
            if (pLo < 0 && acc >= n * 0.02) pLo = b / 64;
            if (acc >= n * 0.98) { pHi = (b + 1) / 64; break; }
          }
          if (pHi - pLo < 0.15) { const m = (pHi + pLo) / 2; pLo = m - 0.075; pHi = m + 0.075; }
          const k = primed ? 0.12 : 1;
          primed = true;
          lo += (pLo - lo) * k; hi += (pHi - hi) * k;
        }
        const span = 1 / Math.max(0.05, hi - lo), con = o.contrast || 1;
        for (let i = 0; i < n; i++) {
          let v = ((lum[i] - lo) * span - 0.5) * con + 0.5;
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          lum[i] = o.invert ? 1 - v : v;
        }

        const last = ramp.length - 1;
        if (o.mode !== 'edges') {
          for (let i = 0; i < n; i++) {
            const v = lum[i];
            out.ch[i] = ramp[Math.round(v * last)];
            out.tone[i] = v >= 0.9 ? 3 : v >= 0.62 ? 2 : v >= 0.33 ? 1 : 0;
          }
          return;
        }

        // edges: Sobel on the levelled luminance; strong gradients become line glyphs, the rest a dim fill
        const th = o.edge || 0.3;
        for (let y = 0; y < rows; y++) {
          const yu = (y > 0 ? y - 1 : y) * cols, yc = y * cols, yd = (y < rows - 1 ? y + 1 : y) * cols;
          for (let x = 0; x < cols; x++) {
            const xl = x > 0 ? x - 1 : x, xr = x < cols - 1 ? x + 1 : x, i = x + yc;
            const gx = (lum[xr + yu] + 2 * lum[xr + yc] + lum[xr + yd]) - (lum[xl + yu] + 2 * lum[xl + yc] + lum[xl + yd]);
            const gy = (lum[xl + yd] + 2 * lum[x + yd] + lum[xr + yd]) - (lum[xl + yu] + 2 * lum[x + yu] + lum[xr + yu]);
            const m = Math.hypot(gx, gy) / 4;
            if (m > th) {
              out.ch[i] = edgeChar(gx, gy, aspect);
              out.tone[i] = m > th * 2.4 ? 3 : m > th * 1.5 ? 2 : 1;
            } else {
              out.ch[i] = ramp[Math.round(lum[i] * last * 0.35)];
              out.tone[i] = 0;
            }
          }
        }
      },
    };
  }

  // same markup as the homepage grid: tone runs wrapped in <b>/<i>/<u>
  function toHTML(out, cols, rows) {
    let h = '';
    for (let r = 0; r < rows; r++) {
      let cur = 0;
      for (let c = 0; c < cols; c++) {
        const o = c + cols * r, t = out.tone[o], ch = out.ch[o];
        if (t !== cur) {
          if (cur) h += `</${TAG[cur]}>`;
          if (t) h += `<${TAG[t]}>`;
          cur = t;
        }
        h += ch === '<' ? '&lt;' : ch === '&' ? '&amp;' : ch;
      }
      if (cur) h += `</${TAG[cur]}>`;
      h += '\n';
    }
    return h;
  }

  // draws the grid onto a canvas (for recording). colors: [bg, faint, muted, fg, accent]
  function paint(ctx, out, cols, rows, cell, colors) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.font = cell.font;
    ctx.textBaseline = 'middle';
    ctx.textRendering = 'optimizeSpeed';   // no ligatures, so '==' stays two cells
    for (let y = 0; y < rows; y++) {
      let x0 = 0;
      while (x0 < cols) {
        const t = out.tone[x0 + y * cols];
        let x1 = x0, s = '';
        while (x1 < cols && out.tone[x1 + y * cols] === t) s += out.ch[x1++ + y * cols];
        if (s.trim()) {
          ctx.fillStyle = colors[t + 1];
          ctx.fillText(s, x0 * cell.w, (y + 0.5) * cell.h);
        }
        x0 = x1;
      }
    }
  }

  return { RAMPS, createSampler, toHTML, paint };
})();
