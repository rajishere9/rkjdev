// The candle. A small fire simulation drawn in pixels, the light it casts, and the burn-down as you read.
// Everything else on the page reads the same without this file.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wide = matchMedia("(min-width: 900px)");
  const candle = document.querySelector(".candle");
  const canvas = candle && candle.querySelector("canvas");
  const wax = candle && candle.querySelector(".wax");
  const glow = document.querySelector(".glow");
  const wrap = document.querySelector("main.wrap");
  const entries = [...document.querySelectorAll(".entry")];
  if (!canvas || !wax || !glow) return;

  // ---- The flame: heat rises from the wick, cools as it climbs, and wanders a little with the draught.
  const W = 24, H = 48, MAX = 36;
  const heat = new Uint8Array(W * H);
  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const octx = off.getContext("2d");
  const img = octx.createImageData(W, H);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // The palette follows a real flame: a dim orange root at the wick, a white-hot body above it, then yellow and ember toward the tip.
  const stops = [[0, [17, 11, 20, 0]], [3, [60, 18, 14, 255]], [9, [150, 62, 28, 255]], [15, [244, 184, 96, 255]], [21, [255, 243, 214, 255]], [27, [255, 232, 180, 255]], [32, [236, 150, 70, 255]], [36, [190, 92, 44, 255]]];
  const pal = [];
  for (let i = 0; i <= MAX; i++) {
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1][0] < i) k++;
    const [a, ca] = stops[k], [b, cb] = stops[k + 1], f = (i - a) / (b - a);
    pal.push(ca.map((v, j) => Math.round(v + (cb[j] - v) * f)));
  }
  const cx = W / 2;
  let wind = 0, windTarget = 0;
  const fuel = 1;
  function step() {
    if (Math.random() < 0.03) windTarget = (Math.random() - 0.5) * 1.1;
    wind += (windTarget - wind) * 0.05;
    const top = Math.round(MAX * fuel);
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - cx);
      heat[(H - 1) * W + x] = d < 3 ? top : d < 4.5 ? Math.max(0, top - 6) : 0;
    }
    // Heat rises one row a frame, mostly straight up, leaning with the draught, and cools faster the higher it gets.
    for (let y = 1; y < H; y++) {
      const climb = 1 - y / H;
      const cool = 0.2 + climb * 0.6;
      for (let x = 0; x < W; x++) {
        const h = heat[y * W + x];
        const r = Math.random();
        let dx = r < 0.13 ? -1 : r > 0.87 ? 1 : 0;
        if (Math.random() < Math.abs(wind) * 0.08) dx = Math.sign(wind);
        const nx = Math.min(W - 1, Math.max(0, x + dx));
        const edge = Math.abs(nx + 0.5 - cx) / (W / 2);
        const decay = (Math.random() < cool ? 1 : 0) + (climb > 0.65 ? 1 : 0) + (edge > 0.3 && Math.random() < 0.5 ? 1 : 0);
        heat[(y - 1) * W + nx] = Math.max(0, h - decay);
      }
    }
    // A little sideways blending each frame keeps the flame in one piece and narrows it toward the tip.
    for (let y = 0; y < H - 2; y++) {
      const o = y * W;
      let prev = heat[o];
      for (let x = 1; x < W - 1; x++) {
        const cur = heat[o + x];
        heat[o + x] = ((prev + cur * 10 + heat[o + x + 1] + 6) / 12) | 0;
        prev = cur;
      }
    }
  }
  function draw() {
    const d = img.data;
    for (let i = 0, n = W * H; i < n; i++) {
      const c = pal[heat[i]];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3];
    }
    octx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }
  // How bright the flame is right now, from the heat in its body.
  function brightness() {
    let s = 0, n = 0;
    for (let y = Math.round(H * 0.3); y < Math.round(H * 0.8); y++) for (let x = cx - 4; x < cx + 4; x++) { s += heat[y * W + x] > 12 ? 1 : 0; n++; }
    return s / n;
  }

  // ---- The light: a soft disc that sits on the flame and breathes with it.
  const root = document.documentElement;
  let flameX = 0, flameY = 0, size = 0, li = 0, varTick = 0;
  function resize() {
    size = Math.round(Math.max(innerWidth, innerHeight) * 1.5);
    glow.style.width = glow.style.height = size + "px";
    if (wide.matches && wrap) candle.style.left = wrap.getBoundingClientRect().left + "px";
    else candle.style.left = "";
    layout();
  }
  function place(b) {
    const target = 0.72 + b * 0.5;
    li += (target - li) * 0.06; // the light comes up over a second or two when the page opens
    glow.style.transform = `translate3d(${(flameX - size / 2).toFixed(1)}px, ${(flameY - size / 2).toFixed(1)}px, 0)`;
    glow.style.opacity = Math.min(1, li).toFixed(3);
    if (++varTick % 3 === 0) { // the CSS variables, at a gentler rate
      root.style.setProperty("--lx", flameX.toFixed(0) + "px");
      root.style.setProperty("--ly", flameY.toFixed(0) + "px");
      root.style.setProperty("--li", li.toFixed(2));
    }
  }

  // ---- The burn: on wide screens the wax shortens with the page, so the flame comes down as you read.
  const FLAME_H = 192, FLAME_W = 96;
  function layout() {
    if (wide.matches) {
      const doc = root.scrollHeight - innerHeight;
      const p = doc > 0 ? Math.min(1, Math.max(0, scrollY / doc)) : 0;
      const maxH = Math.max(140, innerHeight - 68 - FLAME_H - 44 - 24), minH = 44;
      const waxH = maxH + (minH - maxH) * p;
      wax.style.height = waxH.toFixed(1) + "px";
      flameY = innerHeight - 24 - waxH - FLAME_H * 0.56;
      flameX = candle.getBoundingClientRect().left + FLAME_W / 2;
    } else {
      wax.style.height = "";
      const r = canvas.getBoundingClientRect();
      flameX = r.left + r.width / 2;
      flameY = r.top + r.height * 0.56;
    }
    const reach = flameY + 48;
    entries.forEach((e, i) => e.classList.toggle("lit", i === 0 || e.getBoundingClientRect().top < reach));
  }
  let queued = false;
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; layout(); }); } }, { passive: true });
  addEventListener("resize", resize);
  wide.addEventListener("change", resize);

  // ---- The loop: about 24 frames a second. Browsers pause animation frames in hidden tabs; we also pause when the candle is off screen.
  let last = 0, running = false;
  function frame(t) {
    if (!running) return;
    if (t - last >= 40) {
      last = t;
      step();
      draw();
      place(brightness());
    }
    requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function stop() { running = false; }

  // The candle is already burning when the page opens; the first frame is a settled flame.
  for (let i = 0; i < 80; i++) step();
  draw();
  resize();
  if (reduce) {
    // One steady flame, no flicker. The wax still follows the page, because that answers the reader's scrolling.
    li = 1; place(brightness());
    addEventListener("scroll", () => place(brightness()), { passive: true });
  } else {
    place(brightness());
    if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(candle);
    else start();
  }

  // ---- The rest of the page
  // Mark the nav link for the section on screen.
  const links = [...document.querySelectorAll('.site-head nav a[href^="/#"]')];
  const sections = links.map((a) => document.getElementById(a.getAttribute("href").slice(2))).filter(Boolean);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (!item.isIntersecting) return;
        links.forEach((a) => a.getAttribute("href") === "/#" + item.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => io.observe(s));
  }

  // Website screenshots scroll through the whole page: on hover with a mouse, once in view on touch.
  const finePointer = matchMedia("(pointer: fine)").matches;
  document.querySelectorAll(".browser").forEach((fig) => {
    const view = fig.querySelector(".viewport");
    const im = view && view.querySelector("img");
    if (!im || reduce) return;
    const pan = (down) => {
      const distance = Math.max(0, im.offsetHeight - view.offsetHeight);
      fig.style.setProperty("--pan-time", down ? Math.max(3, distance / 240) + "s" : "1.4s");
      fig.style.setProperty("--pan", down ? -distance + "px" : "0px");
    };
    if (finePointer) {
      fig.addEventListener("pointermove", () => pan(true));
      fig.addEventListener("pointerleave", () => pan(false));
    } else if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => pan(e.isIntersecting), { threshold: 0.7 }).observe(fig);
    }
  });
})();
