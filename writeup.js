// Shared behavior for project write-up pages: header boot, outline, status bar, keys, theme.
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = s => s[Math.floor(Math.random() * s.length)];
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const GLYPHS = '░▒▓/\\<>+=*#%&@$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Resolves text left-to-right out of random glyphs (same effect as the homepage).
  function decode(el, text, ms) {
    return new Promise(resolve => {
      const t0 = performance.now();
      (function tick() {
        const p = Math.min(1, (performance.now() - t0) / ms);
        const done = p * text.length;
        let out = '';
        for (let i = 0; i < text.length; i++) out += text[i] === ' ' || i < done ? text[i] : rand(GLYPHS);
        el.textContent = out;
        if (p < 1) setTimeout(tick, 40); else { el.textContent = text; resolve(); }
      })();
    });
  }

  /* ---------- HEADER: type the command, then the title resolves ---------- */
  const cmd = document.querySelector('.wu-head .cmd');
  const titleText = document.getElementById('wu-title-text');
  const titleCursor = document.getElementById('wu-cursor');
  const headOut = document.querySelector('.wu-head');

  async function boot() {
    const text = cmd.textContent;
    cmd.textContent = '';
    const typing = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'caret solid';
    caret.innerHTML = '&nbsp;';
    cmd.append(typing, caret);
    await sleep(200);
    for (const ch of text) {
      typing.textContent += ch;
      await sleep(30 + Math.random() * 45);
    }
    await sleep(150);
    caret.remove();
    headOut.classList.add('ran');
    await decode(titleText, titleText.textContent, 700);
    await sleep(200);
    titleCursor.classList.add('gone');
  }
  if (reduceMotion) { titleCursor.classList.add('gone'); headOut.classList.add('ran'); }
  else boot();

  /* ---------- FIGURES get an image-viewer title bar ---------- */
  document.querySelectorAll('.shot:not(.video)').forEach((fig, i) => {
    const img = fig.querySelector('img');
    const bar = document.createElement('div');
    bar.className = 'shot-bar';
    bar.innerHTML = `<span>fig ${String(i + 1).padStart(2, '0')}</span><span>${esc(slug(img.alt || 'image'))}.png</span>`;
    fig.prepend(bar);
  });

  /* ---------- OUTLINE ---------- */
  const heads = [...document.querySelectorAll('.prose h2')];
  const outline = document.getElementById('outline');
  heads.forEach(h => {
    h.dataset.title = h.textContent;
    h.id = h.id || slug(h.textContent);
    const li = document.createElement('li');
    li.innerHTML = `<a href="#${h.id}">${esc(h.textContent)}</a>`;
    outline.appendChild(li);
  });
  const outlineLinks = [...outline.querySelectorAll('a')];

  // headings resolve out of noise the first time they scroll into view
  if (!reduceMotion) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        decode(e.target, e.target.dataset.title, 450);
      });
    }, { threshold: 1 });
    heads.forEach(h => io.observe(h));
  }

  /* ---------- STATUS BAR ---------- */
  const bar = document.getElementById('bar');
  const barMode = document.getElementById('bar-mode');
  const barMain = document.getElementById('bar-main');
  const barPath = document.getElementById('bar-path');
  const barPct = document.getElementById('bar-pct');
  const file = barPath.textContent;

  function currentHead() {
    let cur = -1;
    heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) cur = i; });
    return cur;
  }
  function onScroll() {
    const cur = currentHead();
    outlineLinks.forEach((a, i) => a.classList.toggle('active', i === cur));
    barPath.textContent = cur >= 0 ? `${file} › ${heads[cur].dataset.title || heads[cur].textContent}` : file;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.round(window.scrollY / max * 100) : 0;
    barPct.textContent = pct <= 0 ? 'Top' : pct >= 100 ? 'Bot' : pct + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- THEME ---------- */
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    return next;
  }
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);

  /* ---------- KEYS: j/k between sections, g/G, :commands ---------- */
  const back = () => { location.href = 'index.html#projects'; };
  function stepHead(dir) {
    const cur = currentHead();
    const next = Math.max(-1, Math.min(heads.length - 1, cur + dir));
    if (next < 0) window.scrollTo({ top: 0 });
    else heads[next].scrollIntoView();
  }
  function flash(text) {
    barMain.innerHTML = `<span class="msg">${esc(text)}</span>`;
    clearTimeout(flash.t);
    flash.t = setTimeout(restoreBar, 2200);
  }
  function restoreBar() {
    barMain.innerHTML = '';
    barMain.appendChild(barPath);
    bar.classList.remove('cmd-mode');
    barMode.textContent = 'NORMAL';
  }
  const COMMANDS = {
    q: back, back: back, wq: back, 'q!': back,
    theme: () => flash(`theme → ${toggleTheme()}`),
    top: () => window.scrollTo({ top: 0 }),
    help: () => flash('try: q (back to projects) theme top'),
  };
  function openCommand() {
    bar.classList.add('cmd-mode');
    barMode.textContent = 'COMMAND';
    barMain.innerHTML = ':<input id="cmd" autocomplete="off" spellcheck="false" aria-label="Command">';
    const input = document.getElementById('cmd');
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') restoreBar();
      if (e.key === 'Enter') {
        const name = input.value.trim().toLowerCase();
        restoreBar();
        if (!name) return;
        (COMMANDS[name] || (() => flash(`E492: Not an editor command: ${name}`)))();
      }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => setTimeout(() => { if (bar.classList.contains('cmd-mode')) restoreBar(); }, 100));
  }
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const key = e.code === 'Semicolon' && e.shiftKey ? ':' : e.key;
    switch (key) {
      case 'j': stepHead(1); break;
      case 'k': stepHead(-1); break;
      case 'g': window.scrollTo({ top: 0 }); break;
      case 'G': window.scrollTo({ top: document.documentElement.scrollHeight }); break;
      case ':': e.preventDefault(); openCommand(); break;
    }
  });
})();
