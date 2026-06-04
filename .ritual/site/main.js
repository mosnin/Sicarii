/* ============================================================
   THE RITUAL — interactions (premium pass)
   Calm, intentional motion. Scroll-driven background. Working nav.
   Motion (motion.dev) for spring section-reveals + hover, loaded as
   framework-agnostic ESM (zero-build) with graceful fallback.
   ============================================================ */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RED = "#e10600", REDHOT = "#ff2436";
  const root = document.documentElement;

  /* ---- scroll state → drives parallax fade + background var --p ---- */
  let scrollY = 0, scrollVel = 0, lastY = 0, ticking = false;
  function onScroll() {
    scrollY = window.scrollY || root.scrollTop || 0;
    scrollVel = scrollVel * 0.8 + Math.min(Math.abs(scrollY - lastY), 50) * 0.2;
    lastY = scrollY;
    if (!ticking) { requestAnimationFrame(setP); ticking = true; }
  }
  function setP() {
    const max = root.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    root.style.setProperty("--p", p.toFixed(4));
    ticking = false;
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", setP, { passive: true });
  setP();

  const fit = (c) => {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return ctx;
  };

  /* ---- HERO: two slow, faint concentric rings (no twinkle/labels/spokes) ---- */
  const sig = document.getElementById("sigil");
  if (sig && !reduce) {
    let ctx = fit(sig);
    const rings = [
      { r: 0.50, n: 56, sp: 0.00055, g: "·" },
      { r: 0.39, n: 40, sp: -0.00095, g: "+" },
    ];
    let t = 0;
    (function draw() {
      const w = sig.clientWidth, h = sig.clientHeight, cx = w / 2;
      const cy = h / 2 - scrollY * 0.02;
      const R = Math.min(w, h) / 2;
      const fade = Math.max(0, 1 - scrollY / (h * 0.7));
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `${Math.max(8, R * 0.03)}px "JetBrains Mono", monospace`;
      rings.forEach((ring, ri) => {
        const rad = ring.r * R;
        ctx.fillStyle = RED;
        ctx.globalAlpha = (ri ? 0.12 : 0.17) * fade;
        for (let i = 0; i < ring.n; i++) {
          const a = (i / ring.n) * Math.PI * 2 + t * ring.sp;
          ctx.fillText(ring.g, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
        }
      });
      ctx.globalAlpha = 0.20 * fade; ctx.fillStyle = REDHOT;
      ctx.font = `${Math.max(16, R * 0.07)}px "JetBrains Mono", monospace`;
      ctx.fillText("✶", cx, cy);
      ctx.globalAlpha = 1; t += 1;
      requestAnimationFrame(draw);
    })();
    addEventListener("resize", () => { ctx = fit(sig); }, { passive: true });
  }

  /* ---- BACKGROUND: sparse, slow ember dust (atmosphere, not a swarm) ---- */
  const bg = document.getElementById("sigil-bg");
  if (bg && !reduce) {
    let ctx = fit(bg), W = bg.clientWidth, H = bg.clientHeight;
    const N = Math.min(26, Math.floor(W * H / 52000));
    const spawn = (init) => ({
      x: Math.random() * W, y: init ? Math.random() * H : H + 16,
      v: 0.08 + Math.random() * 0.22, s: 7 + Math.random() * 6,
      a: 0.04 + Math.random() * 0.13, drift: (Math.random() - 0.5) * 0.12,
      g: Math.random() < 0.85 ? "·" : "✶",
    });
    const em = Array.from({ length: N }, () => spawn(true));
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      const boost = 1 + scrollVel * 0.04;
      for (const p of em) {
        p.y -= p.v * boost; p.x += p.drift;
        if (p.y < -16) Object.assign(p, spawn(false));
        ctx.font = `${p.s}px "JetBrains Mono", monospace`;
        ctx.fillStyle = RED; ctx.globalAlpha = p.a;
        ctx.fillText(p.g, p.x, p.y);
      }
      ctx.globalAlpha = 1; scrollVel *= 0.92;
      requestAnimationFrame(tick);
    })();
    addEventListener("resize", () => { ctx = fit(bg); W = bg.clientWidth; H = bg.clientHeight; }, { passive: true });
  }

  /* ---- scroll-progress ASCII bar ---- */
  const sb = document.getElementById("scrollbar");
  if (sb) {
    const track = sb.querySelector(".track"), pct = sb.querySelector(".pct");
    let cells = 48;
    const size = () => { cells = Math.max(16, Math.min(64, Math.floor(innerWidth / 14))); };
    const upd = () => {
      const max = root.scrollHeight - innerHeight, p = max > 0 ? Math.min(1, scrollY / max) : 0;
      const f = Math.round(p * cells);
      track.textContent = "─".repeat(f) + " ".repeat(Math.max(0, cells - f));
      pct.textContent = Math.round(p * 100) + "%";
    };
    size(); upd();
    addEventListener("scroll", upd, { passive: true });
    addEventListener("resize", () => { size(); upd(); }, { passive: true });
  }

  /* ---- WORKING NAV: smooth scroll with sticky-nav offset ---- */
  function navOffset() {
    const nav = document.querySelector(".nav");
    return (nav ? nav.offsetHeight : 56) + 14;
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id.length < 2) return;
      const tgt = document.querySelector(id);
      if (!tgt) return;
      e.preventDefault();
      const y = tgt.getBoundingClientRect().top + window.scrollY - navOffset();
      window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
      history.replaceState(null, "", id);
    });
  });

  /* ---- copy-to-clipboard (hero one-paste import) ---- */
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sel = btn.getAttribute("data-copy");
      const el = sel && document.querySelector(sel);
      const text = (el ? el.textContent : "").trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const t = document.createElement("textarea");
        t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
        document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); } catch (e) {}
        t.remove();
      }
      const old = btn.textContent;
      btn.textContent = "copied ✓"; btn.classList.add("copied");
      setTimeout(() => { btn.textContent = old; btn.classList.remove("copied"); }, 1600);
    });
  });

  /* ---- BENCHMARK bars ---- */
  const DATA = {
    quality: [["Easy brief", 12, false], ["Hard / creative", 28, false], ["Hardest (systems)", 19, false]],
    dims: [["Decision-readiness", 37, false], ["Evidence honesty", 32, false],
           ["Completeness", 15, false], ["Originality", 10, false]],
  };
  const CELLS = 26, SCALE = 40;
  function buildBars(c) {
    DATA[c.dataset.bars].forEach(([label, val, isNull]) => {
      const row = document.createElement("div");
      row.className = "bar" + (isNull ? " null" : "");
      row.innerHTML = `<span class="label">${label}</span><span class="track"></span><span class="val">0%</span>`;
      c.appendChild(row); row._val = val;
    });
  }
  function animateBars(c) {
    if (c.dataset.run) return; c.dataset.run = "1";
    [...c.children].forEach((row, idx) => {
      const target = row._val, track = row.querySelector(".track"), valEl = row.querySelector(".val");
      const fill = Math.round((target / SCALE) * CELLS); let cur = 0;
      const step = () => {
        cur = Math.min(fill, cur + Math.max(1, Math.round(fill / 18)));
        const shown = Math.round((cur / CELLS) * SCALE);
        track.textContent = "█".repeat(cur) + "░".repeat(Math.max(0, CELLS - cur));
        valEl.textContent = target === 0 ? "  0%" : "+" + shown + "%";
        if (cur < fill) (reduce ? step() : requestAnimationFrame(step));
        else valEl.textContent = target === 0 ? "  0%" : "+" + target + "%";
      };
      if (reduce) step(); else setTimeout(step, idx * 120);
    });
  }
  document.querySelectorAll(".bars").forEach(buildBars);

  /* ---- METHODS grid ---- */
  const METHODS = [
    ["Vision", "Steve Jobs", "Should this exist? Is it insanely great?", "✶"],
    ["The Human", "Don Norman", "Is it humane — does it fit how people think?", "◇"],
    ["The Engineer", "Elon Musk", "Is it possible, and are we at the limit?", "▲"],
    ["The Producer", "Henry Ford", "Can we make it, the same way, at scale?", "▦"],
    ["The Banker", "patient capital", "Does it sustain itself and compound?", "§"],
  ];
  const mg = document.getElementById("methods-grid");
  if (mg) METHODS.forEach(([name, who, q, glyph]) => {
    const el = document.createElement("div");
    el.className = "method"; el.setAttribute("data-glyph", glyph);
    el.innerHTML = `<h3>${name}</h3><p class="who">${who}</p><p class="q">${q}</p>`;
    mg.appendChild(el);
  });

  const triggerBars = (el) => el.querySelectorAll(".bars").forEach(animateBars);
  const GRID_KIDS = ".method, .arc-card, .how-item, .bar";

  /* ---- MOTION (motion.dev) with graceful fallback ---- */
  (async () => {
    if (reduce) {
      document.querySelectorAll(".reveal").forEach((s) => { s.classList.add("in"); triggerBars(s); });
      return;
    }
    let M = null;
    try { M = await import("https://cdn.jsdelivr.net/npm/motion@11/+esm"); } catch (_) { M = null; }

    if (M && M.inView && M.animate) {
      document.body.classList.add("motion");
      const { inView, animate, stagger } = M;
      const spring = { type: "spring", stiffness: 80, damping: 20 };
      inView(".reveal", (info) => {
        const el = info && info.target ? info.target : info;
        el.classList.add("in");
        animate(el, { opacity: [0, 1], transform: ["translateY(22px)", "translateY(0px)"] },
          { duration: 0.9, ...spring });
        const kids = el.querySelectorAll(GRID_KIDS);
        if (kids.length) animate(kids, { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] },
          { delay: stagger(0.07), duration: 0.7, ...spring });
        triggerBars(el);
        return () => {};
      }, { amount: 0.2 });

      const hs = { type: "spring", stiffness: 300, damping: 24 };
      document.querySelectorAll(".arc-card, .method").forEach((c) => {
        c.addEventListener("pointerenter", () => animate(c, { transform: "translateY(-4px)" }, hs));
        c.addEventListener("pointerleave", () => animate(c, { transform: "translateY(0px)" }, hs));
      });
    } else {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); triggerBars(e.target); io.unobserve(e.target); } });
      }, { threshold: 0.2 });
      document.querySelectorAll(".reveal").forEach((s) => io.observe(s));
    }
  })();
})();
