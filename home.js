// rkj dev home: the moving parts. The page reads the same without this file; it only adds motion and small conveniences.
(() => {
  window.__rkj = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const hasIO = "IntersectionObserver" in window;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  // ---- Reveals: each block fades up once, the first time it comes into view.
  const reveals = $$("[data-reveal]");
  if (hasIO && !reduce) {
    const io = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (!item.isIntersecting) return;
        item.target.classList.add("in");
        io.unobserve(item.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  // ---- Numbers count up to the figure already written in the page.
  if (hasIO && !reduce) {
    const io = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (!item.isIntersecting) return;
        io.unobserve(item.target);
        const el = item.target, end = Number(el.dataset.count), t0 = performance.now(), dur = 1500;
        const tick = (t) => {
          const p = clamp((t - t0) / dur, 0, 1);
          el.textContent = Math.round(end * (1 - Math.pow(1 - p, 4)));
          if (p < 1) requestAnimationFrame(tick);
        };
        el.textContent = "0";
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    $$("[data-count]").forEach((el) => io.observe(el));
  }

  // ---- The wall: double each column so it can loop, drift it, and lean it toward the pointer.
  const hero = document.querySelector(".hero");
  const wall = hero && hero.querySelector(".wall");
  const plane = wall && wall.querySelector(".plane");
  if (wall && plane && !reduce) {
    $$(".track", wall).forEach((track) => [...track.children].forEach((tile) => track.appendChild(tile.cloneNode(true))));
    wall.classList.add("rolling");
    if (hasIO) new IntersectionObserver(([e]) => wall.classList.toggle("paused", !e.isIntersecting)).observe(wall);
    if (finePointer) {
      let tx = 0, ty = 0, gx = 0, gy = 0, raf = 0;
      const lean = () => {
        tx += (gx - tx) * 0.06; ty += (gy - ty) * 0.06;
        plane.style.setProperty("--tx", tx.toFixed(3) + "deg");
        plane.style.setProperty("--ty", ty.toFixed(3) + "deg");
        raf = Math.abs(gx - tx) + Math.abs(gy - ty) > 0.01 ? requestAnimationFrame(lean) : 0;
      };
      const aim = (x, y) => { gx = x; gy = y; if (!raf) raf = requestAnimationFrame(lean); };
      hero.addEventListener("pointermove", (e) => {
        const r = hero.getBoundingClientRect();
        aim(((e.clientY - r.top) / r.height - 0.5) * -7, ((e.clientX - r.left) / r.width - 0.5) * 9);
      });
      hero.addEventListener("pointerleave", () => aim(0, 0));
    }
  }

  // ---- The deck: when every card fits the window, cards stick and the ones underneath settle back as the next arrives.
  const stack = document.querySelector(".stack");
  if (stack) {
    const cards = $$(".case", stack).map((el) => ({ el, inner: el.firstElementChild, top: 0, h: 0 }));
    const wide = matchMedia("(min-width: 960px)");
    const GAP = 24;
    let stacked = false, queued = false;
    const settle = () => {
      if (!stacked) return;
      // How far each card has travelled onto the pile, 0 to 1.
      const arrived = cards.map((c, i) => {
        if (i === 0) return 1;
        const prev = cards[i - 1], start = prev.top + prev.h + GAP;
        return clamp((start - c.el.getBoundingClientRect().top) / (start - c.top), 0, 1);
      });
      cards.forEach((c, i) => {
        let depth = 0;
        for (let j = i + 1; j < cards.length; j++) depth += arrived[j];
        c.inner.style.transform = depth ? `scale(${(1 - depth * 0.035).toFixed(4)})` : "";
        c.inner.style.setProperty("--dim", Math.min(0.62, depth * 0.24).toFixed(3));
      });
    };
    const measure = () => {
      stack.classList.remove("is-stacked");
      cards.forEach((c) => { c.inner.style.transform = ""; c.inner.style.setProperty("--dim", 0); });
      const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 68;
      cards.forEach((c, i) => { c.h = c.el.offsetHeight; c.top = head + 18 + i * 16; });
      stacked = !reduce && wide.matches && cards.every((c) => c.top + c.h + 20 <= innerHeight);
      stack.classList.toggle("is-stacked", stacked);
      settle();
    };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; settle(); }); } }, { passive: true });
    addEventListener("resize", measure);
    addEventListener("load", measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();
  }

  // ---- Website screenshots scroll through the whole page: on hover with a mouse, once in view on touch.
  $$(".browser").forEach((fig) => {
    const view = fig.querySelector(".viewport");
    const im = view && view.querySelector("img");
    if (!im || reduce) return;
    const pan = (down) => {
      const distance = Math.max(0, im.offsetHeight - view.offsetHeight);
      fig.style.setProperty("--pan-time", down ? Math.max(3, distance / 240) + "s" : "1.4s");
      fig.style.setProperty("--pan", down ? -distance + "px" : "0px");
    };
    if (finePointer) {
      fig.addEventListener("pointerenter", () => pan(true));
      fig.addEventListener("pointerleave", () => pan(false));
    } else if (hasIO) {
      new IntersectionObserver(([e]) => pan(e.isIntersecting), { threshold: 0.8 }).observe(fig);
    }
  });

  // ---- Mark the nav link for the section on screen.
  const links = $$('.site-head nav a[href^="/#"]:not(.cta)');
  if (hasIO) {
    const io = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (!item.isIntersecting) return;
        links.forEach((a) => (a.getAttribute("href") === "/#" + item.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main > section").forEach((s) => io.observe(s));
  }

  // ---- The time where I am.
  const clock = document.querySelector("[data-clock]");
  if (clock) {
    try {
      const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
      const tick = () => { clock.textContent = fmt.format(new Date()) + " IST"; };
      tick();
      setInterval(tick, 20000);
    } catch {}
  }

  // ---- Copy the address.
  $$("[data-copy]").forEach((btn) => {
    if (!navigator.clipboard) return;
    btn.hidden = false;
    const label = btn.textContent;
    let timer;
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = "Copied";
        clearTimeout(timer);
        timer = setTimeout(() => { btn.textContent = label; }, 1800);
      }).catch(() => {});
    });
  });
})();
