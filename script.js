(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Video di sfondo ---------- */
  const hero = document.querySelector(".hero");
  const video = document.getElementById("heroVideo");
  const videoToggle = document.getElementById("videoToggle");

  let userPaused = false;

  function setVideoPaused(paused) {
    userPaused = paused;
    if (paused) video.pause();
    else video.play().catch(() => {});
    videoToggle.setAttribute("aria-pressed", String(paused));
    videoToggle.setAttribute("aria-label", paused ? "Riproduci il video" : "Metti in pausa il video");
  }

  videoToggle.addEventListener("click", () => setVideoPaused(!video.paused));
  // se il browser blocca l'autoplay, aggiorna lo stato del pulsante
  video.addEventListener("pause", () => videoToggle.setAttribute("aria-pressed", "true"));
  video.addEventListener("play", () => videoToggle.setAttribute("aria-pressed", "false"));

  // parallax leggero: il video segue il puntatore (solo mouse, niente su touch)
  if (!reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      // spostamento massimo ~2% del lato: resta dentro il margine dato da scale(1.06)
      video.style.setProperty("--px", `${(-nx * r.width * 0.04).toFixed(1)}px`);
      video.style.setProperty("--py", `${(-ny * r.height * 0.04).toFixed(1)}px`);
    });
    hero.addEventListener("pointerleave", () => {
      video.style.setProperty("--px", "0px");
      video.style.setProperty("--py", "0px");
    });
  }

  /* ---------- Fumo / nuvole che seguono il cursore ---------- */
  const smoke = document.getElementById("smoke");
  const sctx = smoke.getContext("2d");
  const puffs = [];
  const MAX_PUFFS = 140;
  let sw = 0, sh = 0, sdpr = 1, sizeScale = 1;
  let last = null;
  let running = false;
  let prevTime = 0;

  // texture "a sbuffo": tanti gradienti radiali sovrapposti per un bordo irregolare
  function makePuffSprite(size, shade = ["rgba(110, 134, 164, 0.22)", "rgba(110, 134, 164, 0.09)"],
                          body = ["rgba(252, 253, 255, 0.5)", "rgba(240, 245, 250, 0.2)"]) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    // pochi sbuffi grandi al centro + tanti piccoli ai bordi = contorno sfrangiato
    const blobs = Array.from({ length: 22 }, (_, k) => {
      const a = Math.random() * Math.PI * 2;
      const d = (k < 6 ? 0.1 : 0.2 + Math.random() * 0.12) * size * Math.random() + (k < 6 ? 0 : size * 0.06);
      return {
        x: size / 2 + Math.cos(a) * d,
        y: size / 2 + Math.sin(a) * d * 0.75,
        r: size * (k < 6 ? 0.16 + Math.random() * 0.12 : 0.07 + Math.random() * 0.1),
      };
    });
    const paint = (dy, inner, mid) => {
      for (const b of blobs) {
        const grad = g.createRadialGradient(b.x, b.y + dy, 0, b.x, b.y + dy, b.r);
        grad.addColorStop(0, inner);
        grad.addColorStop(0.55, mid);
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(b.x, b.y + dy, b.r, 0, Math.PI * 2);
        g.fill();
      }
    };
    // ombra grigio-azzurra sotto (dà volume e rende il fumo visibile anche sulle nuvole bianche)
    paint(size * 0.05, shade[0], shade[1]);
    // corpo bianco
    paint(0, body[0], body[1]);
    return c;
  }
  const sprites = Array.from({ length: 6 }, () => makePuffSprite(256));

  function resizeSmoke() {
    sdpr = Math.min(window.devicePixelRatio || 1, 1.5);
    sw = hero.clientWidth;
    sh = hero.clientHeight;
    smoke.width = Math.round(sw * sdpr);
    smoke.height = Math.round(sh * sdpr);
    sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
    sizeScale = Math.min(1.25, Math.max(0.6, Math.min(sw, sh) / 800));
  }

  function spawnPuff(x, y, vx, vy) {
    if (puffs.length >= MAX_PUFFS) puffs.shift();
    const r0 = (30 + Math.random() * 30) * sizeScale;
    puffs.push({
      x, y,
      vx: vx * 0.06 + (Math.random() - 0.5) * 0.25,
      vy: vy * 0.06 + (Math.random() - 0.5) * 0.25 - 0.08,
      r0,
      r1: r0 + (110 + Math.random() * 110) * sizeScale,
      life: 0,
      max: 1800 + Math.random() * 1400,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.0012,
      sprite: sprites[(Math.random() * sprites.length) | 0],
      peak: 0.7 + Math.random() * 0.3,
    });
    if (!running) {
      running = true;
      prevTime = performance.now();
      requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    const dt = Math.min(50, now - prevTime);
    prevTime = now;
    sctx.clearRect(0, 0, sw, sh);

    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) { puffs.splice(i, 1); continue; }

      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 - 0.002; // il fumo sale lentamente
      p.rot += p.vr * dt;

      const ease = 1 - Math.pow(1 - t, 3);
      const r = p.r0 + (p.r1 - p.r0) * ease;
      sctx.globalAlpha = Math.sin(Math.PI * t) * p.peak;
      sctx.save();
      sctx.translate(p.x, p.y);
      sctx.rotate(p.rot);
      sctx.drawImage(p.sprite, -r, -r, r * 2, r * 2);
      sctx.restore();
    }
    sctx.globalAlpha = 1;

    if (puffs.length) requestAnimationFrame(tick);
    else running = false; // nessun fumo: il loop si ferma
  }

  function trail(clientX, clientY) {
    const r = hero.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    if (!last) { last = { x, y }; spawnPuff(x, y, 0, 0); return; }
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.min(4, Math.floor(dist / 16));
    for (let s = 1; s <= steps; s++) {
      spawnPuff(last.x + (dx * s) / steps, last.y + (dy * s) / steps, dx, dy);
    }
    if (steps) last = { x, y };
  }

  hero.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") trail(e.clientX, e.clientY); });
  hero.addEventListener("pointerleave", () => { last = null; });
  // su touch uso touchmove: continua a funzionare anche se il browser gestisce il gesto
  hero.addEventListener("touchstart", (e) => { last = null; trail(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  hero.addEventListener("touchmove", (e) => trail(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  hero.addEventListener("touchend", () => { last = null; }, { passive: true });
  window.addEventListener("resize", resizeSmoke);
  resizeSmoke();

  /* ---------- Divisori: nuvole animate tra le sezioni ---------- */
  // sbuffi più pieni e bianchi di quelli del fumo, con ombra azzurra per dare volume
  const cloudSprites = Array.from({ length: 6 }, () => makePuffSprite(256,
    ["rgba(122, 146, 176, 0.16)", "rgba(122, 146, 176, 0.06)"],
    ["rgba(250, 252, 254, 0.98)", "rgba(244, 247, 250, 0.7)"]));
  const cPtr = { clientX: -9999, clientY: -9999 };
  // il divisore non riceve eventi (pointer-events: none): leggo il cursore dalla finestra
  window.addEventListener("pointermove", (e) => { cPtr.clientX = e.clientX; cPtr.clientY = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { cPtr.clientX = cPtr.clientY = -9999; });

  // "flip": la pagina chiara sta sopra e la sezione scura sotto (le nuvole pendono verso il basso)
  function cloudBand(wrap) {
    const canvas = wrap.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const flip = wrap.classList.contains("cloud-divider--flip");
    let cw = 0, ch = 0, puffs = [], on = false, prev = 0;

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cw = wrap.clientWidth;
      ch = wrap.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // tanti sbuffi sovrapposti lungo la linea di separazione, su due piani di profondità
      const n = Math.round(cw / 45) + 12;
      puffs = Array.from({ length: n }, (_, k) => {
        const front = k % 3 !== 0;
        const r = ch * (front ? 0.24 + Math.random() * 0.26 : 0.3 + Math.random() * 0.2);
        const y = ch * (front ? 0.48 + Math.random() * 0.12 : 0.38 + Math.random() * 0.1);
        return {
          // distribuiti in modo uniforme sulla larghezza, così la linea resta sempre coperta
          x: ((k + Math.random() * 0.8) / n) * (cw + r * 2) - r,
          y: flip ? ch - y : y,
          r,
          vx: (front ? 0.008 : 0.004) + Math.random() * 0.008, // deriva lenta verso destra
          ph: Math.random() * Math.PI * 2,
          sp: 0.00025 + Math.random() * 0.0003,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.00006,
          a: front ? 0.85 + Math.random() * 0.15 : 0.5 + Math.random() * 0.25,
          ox: 0, oy: 0,
          sprite: cloudSprites[(Math.random() * cloudSprites.length) | 0],
        };
      }).sort((p, q) => p.a - q.a); // quelli dietro disegnati per primi
    }

    function draw(now) {
      if (!on) return;
      requestAnimationFrame(draw);
      const dt = Math.min(50, now - (prev || now));
      prev = now;
      ctx.clearRect(0, 0, cw, ch);
      // base del banco di nuvole: copre il bordo tra le sezioni e sfuma nel colore della pagina chiara
      const base = flip
        ? ctx.createLinearGradient(0, ch * 0.7, 0, ch * 0.5)
        : ctx.createLinearGradient(0, ch * 0.3, 0, ch * 0.5);
      base.addColorStop(0, "rgba(243, 246, 249, 0)");
      base.addColorStop(1, "rgba(243, 246, 249, 1)");
      ctx.fillStyle = base;
      if (flip) ctx.fillRect(0, 0, cw, ch * 0.7);
      else ctx.fillRect(0, ch * 0.3, cw, ch * 0.7);
      const rect = wrap.getBoundingClientRect();
      const px = cPtr.clientX - rect.left, py = cPtr.clientY - rect.top;
      const R = Math.max(160, ch * 0.7);
      for (const p of puffs) {
        p.x += p.vx * dt;
        if (p.x - p.r > cw) p.x = -p.r; // rientra da sinistra
        p.rot += p.vr * dt;
        // al passaggio del cursore le nuvole si aprono dolcemente
        const bx = p.x, by = p.y + Math.sin(now * p.sp + p.ph) * ch * 0.035;
        const dx = bx - px, dy = by - py;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.max(0, 1 - d / R);
        const push = k * k * ch * 0.22;
        p.ox += ((dx / d) * push - p.ox) * 0.05;
        p.oy += ((dy / d) * push * 0.6 - p.oy) * 0.05;
        const r = p.r * (1 + Math.sin(now * p.sp * 1.3 + p.ph) * 0.05); // leggero "respiro"
        ctx.globalAlpha = p.a;
        ctx.save();
        ctx.translate(bx + p.ox, by + p.oy);
        ctx.rotate(p.rot);
        ctx.drawImage(p.sprite, -r, -r * 0.8, r * 2, r * 1.6);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // anima solo quando il divisore è visibile
    new IntersectionObserver(([entry]) => {
      const vis = entry.isIntersecting;
      if (vis && !on) { on = true; prev = 0; requestAnimationFrame(draw); }
      on = vis;
    }).observe(wrap);
    build();
    // l'altezza dipende solo dalla larghezza: niente ricostruzione quando su mobile cambia la barra del browser
    window.addEventListener("resize", () => { if (wrap.clientWidth !== cw) build(); });
  }
  document.querySelectorAll(".cloud-divider").forEach(cloudBand);

  /* ---------- Menu a tendina ---------- */
  const nav = document.querySelector(".nav");
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("menu");

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Chiudi menu" : "Apri menu");
  }
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
      toggle.focus();
    }
  });
  // chiude la tendina cliccando fuori o scegliendo una voce
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) setMenu(false);
  });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

  /* ---------- Barra fissa, "torna su", video solo quando visibile ---------- */
  const toTop = document.getElementById("toTop");

  new IntersectionObserver(([entry]) => {
    nav.classList.toggle("is-away", !entry.isIntersecting);
    // fuori dalla hero il video si ferma per risparmiare batteria, poi riparte (se l'utente non l'ha messo in pausa)
    if (!entry.isIntersecting) video.pause();
    else if (!userPaused) video.play().catch(() => {});
  }, { threshold: 0.05 }).observe(hero);

  /* ---------- Comparsa allo scroll e contatori ---------- */
  function animateCount(el) {
    const target = Number(el.dataset.count);
    if (reduceMotion) { el.textContent = target; return; }
    const start = performance.now();
    const dur = 1400;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // elemento osservato → elementi da far comparire
  const revealGroups = new Map();
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      revealObserver.unobserve(entry.target);
      const group = revealGroups.get(entry.target) || [];
      revealGroups.delete(entry.target);
      group.forEach(revealEl);
    });
  }, { threshold: 0.15 }); // senza margine: anche l'ultima riga del footer, a fondo pagina, compare

  function revealEl(el) {
    el.classList.add("is-in");
    el.querySelectorAll("[data-count]").forEach(animateCount);
    if (el.hasAttribute("data-reveal-media")) return; // le foto restano "aperte" (clip-path)
    // a comparsa finita restituisco all'elemento le sue transizioni (hover ecc.)
    const d = parseFloat(getComputedStyle(el).getPropertyValue("--d")) || 0;
    setTimeout(() => { el.removeAttribute("data-reveal"); el.classList.remove("is-in"); }, 1200 + d * 110);
  }

  function observeReveals(root = document) {
    root.querySelectorAll("[data-reveal], [data-reveal-media]").forEach((el) => {
      // un elemento del tutto mascherato (clip) risulta invisibile all'observer: osservo il contenitore
      const target = el.getAttribute("data-reveal") === "clip" ? el.parentElement : el;
      if (!revealGroups.has(target)) { revealGroups.set(target, []); revealObserver.observe(target); }
      revealGroups.get(target).push(el);
    });
  }

  /* ---------- Effetto ripple sui pulsanti ---------- */
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(span);
    span.addEventListener("animationend", () => span.remove());
  });

  /* ---------- Pulsanti della hero: riempimento dal cursore + effetto magnete ---------- */
  if (window.matchMedia("(pointer: fine)").matches) {
    document.querySelectorAll(".hero__actions .btn").forEach((b) => {
      const setOrigin = (e) => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--bx", `${e.clientX - r.left}px`);
        b.style.setProperty("--by", `${e.clientY - r.top}px`);
      };
      b.addEventListener("pointerenter", setOrigin);
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        b.style.setProperty("--mx", `${clamp(dx * 0.22, -8, 8).toFixed(1)}px`);
        b.style.setProperty("--my", `${clamp(dy * 0.35, -6, 6).toFixed(1)}px`);
      });
      b.addEventListener("pointerleave", (e) => {
        setOrigin(e); // il colore si ritira verso il punto di uscita
        b.style.setProperty("--mx", "0px");
        b.style.setProperty("--my", "0px");
      });
    });
  }

  /* ---------- Dati medici ---------- */
  // role: come appare nel sito · areas: aree usate per filtri e prenotazione
  const doctors = [
    { name: "Dott. Umberto Preite", role: "Medico estetico e Odontoiatra", areas: ["Medicina estetica", "Odontoiatria"] },
    { name: "Dott. Fabio Mancini", role: "Odontoiatra", areas: ["Odontoiatria"] },
    { name: "Dott.ssa Valentina Galati", role: "Odontoiatra", areas: ["Odontoiatria"] },
    { name: "Dott.ssa Alessia Columbaro", role: "Igienista dentale", areas: ["Igiene dentale"] },
  ];
  const specialities = [...new Set(doctors.flatMap((d) => d.areas))];
  const initials = (n) => n.replace(/^Dott\.(ssa)?\s+/, "").split(" ").map((p) => p[0]).join("");
  const ALL = "Tutti";

  /* ---------- Modali ---------- */
  const bookModal = document.getElementById("bookModal");
  const doctorModal = document.getElementById("doctorModal");
  const modals = { book: bookModal, doctor: doctorModal };

  function openModal(name) {
    setMenu(false);
    Object.values(modals).forEach((m) => m.open && m.close());
    if (name === "book") resetBooking();
    modals[name].showModal();
    if (name === "doctor") {
      renderDoctors();
      // su mobile evita di aprire la tastiera automaticamente
      if (window.matchMedia("(pointer: fine)").matches) searchInput.focus();
    }
  }

  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open]");
    if (opener) {
      e.preventDefault();
      openModal(opener.dataset.open);
      return;
    }
    if (e.target.closest("[data-close]")) e.target.closest("dialog").close();
  });

  // chiusura cliccando sullo sfondo
  Object.values(modals).forEach((m) =>
    m.addEventListener("click", (e) => {
      if (e.target !== m) return;
      const r = m.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) m.close();
    })
  );

  /* ---------- Prenotazione ---------- */
  const form = document.getElementById("bookingForm");
  const specialitySelect = document.getElementById("specialitySelect");
  const doctorSelect = document.getElementById("doctorSelect");
  const dateInput = document.getElementById("dateInput");
  const formError = document.getElementById("formError");
  const bookFormView = document.getElementById("bookForm");
  const bookSuccess = document.getElementById("bookSuccess");

  specialities.forEach((s) => specialitySelect.add(new Option(s, s)));

  function isoDate(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  dateInput.min = isoDate(new Date());
  // la domenica il centro è chiuso (il calendario del browser non permette di disattivare un giorno)
  const SUNDAY_MSG = "La domenica il centro è chiuso: scegli un altro giorno.";
  const isSunday = (iso) => new Date(`${iso}T12:00:00`).getDay() === 0;

  function fillDoctors(speciality, selected = "") {
    doctorSelect.length = 1;
    doctors
      .filter((d) => !speciality || d.areas.includes(speciality))
      .forEach((d) => doctorSelect.add(new Option(d.name, d.name, false, d.name === selected)));
  }

  specialitySelect.addEventListener("change", () => fillDoctors(specialitySelect.value));

  // trattamenti: letti dalle card della sezione Trattamenti
  const treatmentSelect = document.getElementById("treatmentSelect");
  const treatmentCards = [...document.querySelectorAll("#deckCards .tcard")];
  // divisi per gruppo, come nella sezione
  [["odontoiatria", "Odontoiatria"], ["estetica", "Medicina estetica"]].forEach(([group, label]) => {
    const og = document.createElement("optgroup");
    og.label = label;
    treatmentCards.filter((c) => c.dataset.group === group).forEach((c) => {
      const t = c.querySelector("h3").textContent;
      og.append(new Option(t, t));
    });
    treatmentSelect.append(og);
  });

  // preset: { speciality, name (medico), treatment }
  function resetBooking(preset = {}) {
    form.reset();
    dateInput.setCustomValidity("");
    form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    formError.textContent = "";
    bookFormView.hidden = false;
    bookSuccess.hidden = true;
    specialitySelect.value = preset.speciality || "";
    fillDoctors(preset.speciality || "", preset.name || "");
    treatmentSelect.value = preset.treatment || "";
    markFormStart(form);
  }

  function openBooking(preset) {
    setMenu(false);
    Object.values(modals).forEach((m) => m.open && m.close());
    resetBooking(preset);
    bookModal.showModal();
  }
  const openBookingWith = (d) => openBooking({ speciality: d.areas[0], name: d.name });

  /* ---------- Invio dei moduli: POST a invia.php (sul nostro hosting), che spedisce l'email
     a richieste@centromedicopreite.com. Nessun servizio esterno. ---------- */
  const CLINIC_EMAIL = "richieste@centromedicopreite.com";
  const PHONE_RE = /^\+?[\d\s./()-]{6,20}$/;
  const formOpenedAt = new WeakMap(); // tempo di compilazione: i bot inviano in un istante
  const markFormStart = (f) => formOpenedAt.set(f, Date.now());

  // validazione: almeno un recapito (email o telefono), poi i campi obbligatori e l'informativa
  function reportInvalid(formEl, errorEl) {
    const { email, phone } = formEl.elements;
    const noContact = !email.value.trim() && !phone.value.trim();
    const contactMsg = "Indica almeno un recapito: email o telefono.";
    email.setCustomValidity(noContact ? contactMsg : "");
    phone.setCustomValidity(
      noContact ? contactMsg : phone.value.trim() && !PHONE_RE.test(phone.value.trim()) ? "Numero non valido." : ""
    );
    const invalid = [...formEl.elements].filter((el) => el.willValidate && !el.checkValidity());
    invalid.forEach((el) => el.classList.add("invalid"));
    if (!invalid.length) { errorEl.textContent = ""; return false; }

    const msgs = [];
    if (invalid.some((el) => el.required && el.type !== "checkbox" && !el.validity.customError)) msgs.push("Compila i campi obbligatori.");
    if (noContact) msgs.push(contactMsg);
    else {
      if (invalid.includes(email)) msgs.push("Controlla l'indirizzo email.");
      if (invalid.includes(phone)) msgs.push("Controlla il numero di telefono.");
    }
    if (invalid.some((el) => el.validity.customError && el.type === "date")) msgs.push(SUNDAY_MSG);
    if (invalid.some((el) => el.type === "checkbox")) msgs.push("Conferma di aver preso visione dell'informativa privacy.");
    errorEl.textContent = msgs.join(" ");
    invalid[0].focus();
    return true;
  }

  // correggendo uno dei due recapiti, l'errore sparisce da entrambi
  function clearInvalid(e) {
    const f = e.currentTarget;
    const targets = ["email", "phone"].includes(e.target.name) ? [f.elements.email, f.elements.phone] : [e.target];
    targets.forEach((el) => el.classList.remove("invalid"));
  }

  // anteprima su Vercel: non esegue PHP, quindi il modulo non invia e lo dice chiaramente
  const IS_PREVIEW = location.hostname.endsWith(".vercel.app");

  async function sendForm(formEl, errorEl) {
    if (IS_PREVIEW) {
      errorEl.textContent = "Questa è un'anteprima del sito: il modulo sarà attivo sul sito definitivo. Per ora scrivici a ";
      const a = document.createElement("a");
      a.href = `mailto:${CLINIC_EMAIL}`;
      a.textContent = CLINIC_EMAIL;
      errorEl.append(a, ".");
      return false;
    }
    const btn = formEl.querySelector('[type="submit"]');
    const data = new FormData(formEl);
    data.append("ms", String(Date.now() - (formOpenedAt.get(formEl) || Date.now())));
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    errorEl.textContent = "";
    try {
      const res = await fetch(formEl.action, { method: "POST", body: data, headers: { Accept: "application/json" } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "");
      return true;
    } catch (err) {
      errorEl.textContent = `${err.message || "Invio non riuscito."} Riprova tra poco oppure scrivici a `;
      const a = document.createElement("a");
      a.href = `mailto:${CLINIC_EMAIL}`;
      a.textContent = CLINIC_EMAIL;
      errorEl.append(a, ".");
      return false;
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
    }
  }

  // "ti ricontatteremo all'indirizzo … / al numero …"
  const replyTo = (data) => (data.get("email").trim()
    ? `all'indirizzo ${data.get("email").trim()}`
    : `al numero ${data.get("phone").trim()}`);

  form.addEventListener("input", clearInvalid);
  form.addEventListener("input", (e) => {
    if (e.target !== dateInput) return;
    const sunday = dateInput.value && isSunday(dateInput.value);
    dateInput.setCustomValidity(sunday ? SUNDAY_MSG : "");
    dateInput.classList.toggle("invalid", Boolean(sunday));
    formError.textContent = sunday ? SUNDAY_MSG : "";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (reportInvalid(form, formError)) return;
    const data = new FormData(form);
    if (!(await sendForm(form, formError))) return;
    document.getElementById("successText").textContent =
      `Grazie, ${data.get("name").trim().split(" ")[0]}. Abbiamo ricevuto la tua richiesta di visita: ti ricontatteremo ${replyTo(data)} per confermare giorno e orario.`;
    bookFormView.hidden = true;
    bookSuccess.hidden = false;
  });

  /* ---------- Trova un medico ---------- */
  const searchInput = document.getElementById("doctorSearch");
  const chips = document.getElementById("chips");
  const list = document.getElementById("doctorList");
  const noResults = document.getElementById("noResults");
  let activeChip = ALL;

  [ALL, ...specialities].forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = s;
    b.setAttribute("aria-pressed", String(s === activeChip));
    b.addEventListener("click", () => {
      activeChip = s;
      chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      renderDoctors();
    });
    chips.appendChild(b);
  });

  function renderDoctors() {
    const q = searchInput.value.trim().toLowerCase();
    const results = doctors.filter(
      (d) =>
        (activeChip === ALL || d.areas.includes(activeChip)) &&
        [d.name, d.role, ...d.areas].some((t) => t.toLowerCase().includes(q))
    );
    list.innerHTML = "";
    results.forEach((d, i) => {
      const li = document.createElement("li");
      li.className = "doctor";
      li.style.animationDelay = `${i * 0.03}s`;
      li.innerHTML = `
        <div class="doctor__avatar" aria-hidden="true">${initials(d.name)}</div>
        <div class="doctor__info">
          <p class="doctor__name">${d.name}</p>
          <p class="doctor__meta">${d.role}</p>
        </div>
        <button type="button" class="btn btn--primary">Prenota</button>`;
      li.querySelector("button").addEventListener("click", () => openBookingWith(d));
      list.appendChild(li);
    });
    noResults.hidden = results.length > 0;
  }

  searchInput.addEventListener("input", renderDoctors);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, "0");

  /* ---------- 1. Zig-zag: team degli specialisti, parallax, video solo se visibili ---------- */
  const teamBox = document.getElementById("team");
  const teamRow = (html, label, d) => {
    const li = document.createElement("li");
    li.dataset.reveal = "";
    li.style.setProperty("--d", 3 + teamBox.children.length * 0.5);
    li.innerHTML = `<button type="button" class="team__item" aria-label="${label}">${html}</button>`;
    teamBox.appendChild(li);
    return li.firstElementChild;
  };
  doctors.forEach((d) => {
    const b = teamRow(
      `<span class="avatar" aria-hidden="true"><span>${initials(d.name)}</span><i></i></span>
       <span class="team__info"><strong>${d.name}</strong><small>${d.role}</small></span>
       <span class="team__cta" aria-hidden="true">Prenota
         <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`,
      `Prenota con ${d.name}, ${d.role}`
    );
    b.addEventListener("click", () => openBookingWith(d));
  });
  teamRow(
    `<span class="avatar avatar--more" aria-hidden="true"><span>+</span><i></i></span>
     <span class="team__info"><strong>e altri specialisti</strong><small>Scopri tutto il team</small></span>
     <span class="team__cta" aria-hidden="true">Vedi
       <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`,
    "Vedi tutti gli specialisti"
  ).dataset.open = "doctor";
  // icone delle sezioni 02 e 06: lunghezza normalizzata, così al passaggio si "ridisegnano"
  document.querySelectorAll(".zz__list svg > *, .contact__list svg > *").forEach((p) => p.setAttribute("pathLength", "1"));

  const zzMedia = [...document.querySelectorAll(".zz__media")];
  function updateParallax() {
    if (reduceMotion) return;
    const vh = window.innerHeight;
    zzMedia.forEach((m) => {
      const r = m.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      // -1 (sopra) … 1 (sotto): la foto scorre un po' più lenta della pagina
      const p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
      (m.querySelector(".zz__img") || m).style.setProperty("--par", `${(p * r.height * 0.06).toFixed(1)}px`);
    });
  }

  const videoObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()));
  });
  document.querySelectorAll("video.zz__img").forEach((v) => videoObserver.observe(v));

  /* ---------- 2. Trattamenti: mazzo di carte da sfogliare e girare ---------- */
  const deck = document.getElementById("deck");
  const deckIndexEl = document.getElementById("deckIndex");
  const deckTotalEl = document.getElementById("deckTotal");
  const deckBar = document.getElementById("deckBar");
  let visibleCards = treatmentCards.slice();
  let pos = 0; // posizione (anche frazionaria durante il trascinamento)
  let cardW = 300;

  const isLoop = () => visibleCards.length > 4;
  // distanza dalla carta attiva, "avvolta" per scorrere all'infinito
  function wrapOffset(o) {
    const n = visibleCards.length;
    if (!isLoop()) return o;
    return ((((o + n / 2) % n) + n) % n) - n / 2;
  }
  function activeIndex() {
    const n = visibleCards.length;
    const r = Math.round(pos);
    return isLoop() ? ((r % n) + n) % n : clamp(r, 0, n - 1);
  }

  function layoutDeck() {
    const n = visibleCards.length;
    const sp = cardW * 0.58;
    const act = activeIndex();
    visibleCards.forEach((c, i) => {
      const o = wrapOffset(i - pos);
      const a = Math.abs(o);
      const x = o * sp;
      const y = a * a * 6 + a * 14;
      const scale = 1 - Math.min(a, 3) * 0.07;
      c.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${(-a * 60).toFixed(1)}px) rotate(${(o * 6).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      c.style.opacity = a > 2.6 ? "0" : "1";
      c.style.pointerEvents = a > 2.6 ? "none" : "";
      c.style.zIndex = String(100 - Math.round(a * 10));
      const isAct = i === act;
      c.classList.toggle("is-active", isAct);
      c.setAttribute("aria-hidden", String(!isAct));
      c.querySelector(".tcard__book").tabIndex = isAct && c.classList.contains("is-flipped") ? 0 : -1;
    });
    deckIndexEl.textContent = pad2(act + 1);
    deckTotalEl.textContent = pad2(n);
    deckBar.style.setProperty("--p", `${((act + 1) / n) * 100}%`);
  }

  function unflipAll() { treatmentCards.forEach((c) => c.classList.remove("is-flipped")); }

  function goTo(target) {
    unflipAll();
    pos = isLoop() ? target : clamp(target, 0, visibleCards.length - 1);
    layoutDeck();
  }
  const nextCard = () => goTo(Math.round(pos) + 1);
  const prevCard = () => goTo(Math.round(pos) - 1);
  function flipActive() {
    const c = visibleCards[activeIndex()];
    c.classList.toggle("is-flipped");
    layoutDeck();
  }

  document.getElementById("deckNext").addEventListener("click", nextCard);
  document.getElementById("deckPrev").addEventListener("click", prevCard);

  // trascinamento con mouse e dito (lo scroll verticale della pagina resta libero)
  let drag = null;
  deck.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".tcard__book")) return;
    drag = { x: e.clientX, y: e.clientY, pos0: pos, moved: false };
  });
  deck.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      deck.setPointerCapture(e.pointerId);
      deck.classList.add("is-dragging");
      unflipAll();
    }
    let p = drag.pos0 - dx / (cardW * 0.58);
    if (!isLoop()) p = clamp(p, -0.35, visibleCards.length - 0.65); // effetto elastico ai bordi
    pos = p;
    layoutDeck();
  });
  function endDrag(e, cancelled) {
    if (!drag) return;
    if (drag.moved) {
      deck.classList.remove("is-dragging");
      const dx = e.clientX - drag.x;
      let target = Math.round(pos);
      // basta un piccolo swipe per passare alla carta successiva
      if (!cancelled && Math.abs(dx) > 30 && target === Math.round(drag.pos0)) target += dx < 0 ? 1 : -1;
      goTo(target);
    } else if (!cancelled) {
      const card = e.target.closest(".tcard");
      if (card) {
        const i = visibleCards.indexOf(card);
        if (i === activeIndex()) flipActive();
        else goTo(Math.round(pos) + wrapOffset(i - Math.round(pos)));
      }
    }
    drag = null;
  }
  deck.addEventListener("pointerup", (e) => endDrag(e, false));
  deck.addEventListener("pointercancel", (e) => endDrag(e, true));

  // trackpad: scorrimento orizzontale a due dita
  let wheelLock = 0;
  deck.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 25) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    wheelLock = now + 450;
    e.deltaX > 0 ? nextCard() : prevCard();
  }, { passive: false });

  deck.addEventListener("keydown", (e) => {
    if (e.target !== deck) return;
    if (e.key === "ArrowRight") { e.preventDefault(); nextCard(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prevCard(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flipActive(); }
  });

  treatmentCards.forEach((c) => {
    c.querySelector(".tcard__book").addEventListener("click", () =>
      openBooking({ speciality: c.dataset.speciality, treatment: c.querySelector("h3").textContent })
    );
  });

  // due gruppi di trattamenti, ognuno con i propri filtri
  const GROUPS = {
    odontoiatria: [["all", "Tutti"], ["prevenzione", "Prevenzione"], ["cure", "Cure"], ["estetica", "Estetica"],
      ["impianti", "Impianti"], ["ortodonzia", "Ortodonzia"]],
    estetica: [["all", "Tutti"], ["viso", "Viso"], ["pelle", "Pelle"], ["corpo", "Corpo"], ["benessere", "Benessere"]],
  };
  const groupsBox = document.querySelector(".groups");
  const groupButtons = [...groupsBox.querySelectorAll(".group")];
  const filtersBox = document.getElementById("filters");
  let activeGroup = "";

  // la "pillola" scura scivola sotto il gruppo attivo (ricalcolata anche al resize e al caricamento del font)
  function placeGroupPill() {
    const on = groupButtons.find((b) => b.dataset.group === activeGroup);
    if (!on) return;
    groupsBox.style.setProperty("--gx", `${on.offsetLeft}px`);
    groupsBox.style.setProperty("--gw", `${on.offsetWidth}px`);
  }
  window.addEventListener("resize", placeGroupPill);
  if (document.fonts) document.fonts.ready.then(placeGroupPill);

  function setGroup(group) {
    if (group === activeGroup) return;
    activeGroup = group;
    groupButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.group === group)));
    placeGroupPill();
    filtersBox.replaceChildren(...GROUPS[group].map(([key, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "filter";
      b.dataset.filter = key;
      b.textContent = label;
      return b;
    }));
  }

  let activeCat = ""; // ultimo filtro richiesto (anche mentre il cambio di mazzo è in corso)
  function applyFilter(cat, group = activeGroup) {
    setGroup(group);
    activeCat = cat;
    filtersBox.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === cat)));
    visibleCards = treatmentCards.filter((c) => c.dataset.group === activeGroup && (cat === "all" || c.dataset.category === cat));
    treatmentCards.forEach((c) => {
      const off = !visibleCards.includes(c);
      c.classList.toggle("is-off", off);
      if (off) { c.classList.remove("is-active"); c.setAttribute("aria-hidden", "true"); }
    });
    visibleCards.forEach((c, i) => { c.querySelector(".tcard__num").textContent = pad2(i + 1); });
    cardW = visibleCards[0].offsetWidth || cardW;
    fitCards();
    goTo(0);
  }

  // adatta i testi alla carta: titoli con parole lunghe e descrizioni lunghe non vengono mai tagliati
  function fitCards() {
    visibleCards.forEach((c) => {
      const front = c.querySelector(".tcard__front");
      const h3 = front.querySelector("h3");
      const hint = front.querySelector(".tcard__hint");
      h3.style.fontSize = "";
      let fs = parseFloat(getComputedStyle(h3).fontSize);
      const padB = parseFloat(getComputedStyle(front).paddingBottom);
      const frontOver = () => h3.scrollWidth > h3.clientWidth + 1 ||
        hint.offsetTop + hint.offsetHeight > front.clientHeight - padB + 1;
      while (frontOver() && fs > 14) { fs -= 1; h3.style.fontSize = `${fs}px`; }

      // retro: il contenuto è allineato in basso, se è troppo alto "esce" dal bordo superiore
      const back = c.querySelector(".tcard__back");
      const text = back.querySelector("p:not(.tcard__meta)");
      text.style.fontSize = "";
      let bs = parseFloat(getComputedStyle(text).fontSize);
      const padT = parseFloat(getComputedStyle(back).paddingTop);
      while (back.firstElementChild.offsetTop < padT - 1 && bs > 11) { bs -= 0.5; text.style.fontSize = `${bs}px`; }
    });
  }
  // cambio di mazzo: le carte vengono raccolte verso il lato da cui "si esce", poi il nuovo mazzo
  // arriva dal lato opposto e si apre a ventaglio dal centro (direzione = ordine di gruppi e filtri)
  let dealt = false;
  let swapTimers = [];
  const clearDeal = () => treatmentCards.forEach((c) => c.style.removeProperty("--deal"));
  function switchDeck(cat, group = activeGroup) {
    if (group === activeGroup && cat === activeCat) return;
    const fromCat = activeCat;
    activeCat = cat;
    if (!dealt) { applyFilter(cat, group); return; } // il mazzo non è ancora entrato: nessuna animazione
    const order = Object.keys(GROUPS);
    const dir = group !== activeGroup
      ? Math.sign(order.indexOf(group) - order.indexOf(activeGroup))
      : Math.sign(GROUPS[group].findIndex(([k]) => k === cat) - GROUPS[group].findIndex(([k]) => k === fromCat));
    swapTimers.forEach(clearTimeout);
    swapTimers = [];
    deck.classList.remove("is-stacked");
    deck.style.setProperty("--dir", dir);
    // raccolta: prima le carte esterne, per ultima quella in primo piano
    visibleCards.forEach((c, i) => c.style.setProperty("--deal", `${(2 - Math.min(Math.abs(wrapOffset(i - pos)), 2)) * 55}ms`));
    deck.classList.add("is-gathering");
    // i filtri del nuovo gruppo compaiono subito, le carte cambiano a raccolta finita
    setGroup(group);
    filtersBox.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === cat)));
    swapTimers.push(setTimeout(() => {
      deck.classList.add("no-anim", "is-stacked");
      deck.classList.remove("is-gathering");
      clearDeal();
      applyFilter(cat, group);
      void deck.offsetWidth; // le nuove carte partono davvero dalla posizione "raccolta"
      deck.classList.remove("no-anim");
      visibleCards.forEach((c, i) => c.style.setProperty("--deal", `${Math.abs(wrapOffset(i - pos)) * 75 + 40}ms`));
      deck.classList.remove("is-stacked");
      swapTimers.push(setTimeout(clearDeal, 1100));
    }, 480));
  }

  groupButtons.forEach((b) => b.addEventListener("click", () => switchDeck("all", b.dataset.group)));
  filtersBox.addEventListener("click", (e) => {
    const b = e.target.closest(".filter");
    if (b) switchDeck(b.dataset.filter);
  });
  // link esterni (footer): "gruppo" oppure "gruppo/filtro"
  document.querySelectorAll("[data-filter-link]").forEach((a) =>
    a.addEventListener("click", () => {
      const [group, cat = "all"] = a.dataset.filterLink.split("/");
      // dove i filtri sono nascosti (schermi piccoli) si apre il gruppo intero
      switchDeck(getComputedStyle(filtersBox).display === "none" ? "all" : cat, group);
    })
  );
  // se la finestra si restringe e i filtri spariscono, il mazzo torna al gruppo intero
  window.addEventListener("resize", () => {
    if (activeCat !== "all" && getComputedStyle(filtersBox).display === "none") applyFilter("all");
  });
  applyFilter("all", "odontoiatria");

  // entrata del mazzo: quando la sezione arriva, le carte si distribuiscono dal centro verso i lati
  new IntersectionObserver(([entry], obs) => {
    if (!entry.isIntersecting) return;
    obs.disconnect();
    dealt = true;
    visibleCards.forEach((c, i) => c.style.setProperty("--deal", `${Math.abs(wrapOffset(i - pos)) * 110 + 150}ms`));
    deck.classList.remove("is-stacked");
    setTimeout(clearDeal, 1400);
  }, { threshold: 0.35 }).observe(deck);

  /* ---------- 3. Il metodo: mappa che scorre in orizzontale ---------- */
  const method = document.getElementById("metodo");
  const mViewport = method.querySelector(".method__viewport");
  const mTrack = document.getElementById("methodTrack");
  const mCanvas = document.getElementById("mapCanvas");
  const mctx = mCanvas.getContext("2d");
  const mWalker = document.getElementById("mapWalker");
  // divisori di nuvole prima e dopo: la mappa resta ferma mentre le nuvole passano
  const mCloudBefore = method.previousElementSibling && method.previousElementSibling.classList.contains("cloud-divider") ? method.previousElementSibling : null;
  const mCloudAfter = method.nextElementSibling && method.nextElementSibling.classList.contains("cloud-divider") ? method.nextElementSibling : null;
  const mStops = [...document.querySelectorAll("#stops .stop")];
  const mStart = document.getElementById("mapStart");
  const mEnd = document.getElementById("mapEnd");
  const stageNow = document.getElementById("stageNow");
  document.getElementById("stageTotal").textContent = mStops.length;
  let map = null;

  function pointAtX(x) {
    // ricerca binaria sui campioni del percorso (la strada va sempre verso destra)
    const s = map.samples;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid].x < x) lo = mid + 1; else hi = mid;
    }
    return s[lo];
  }

  // rumore stabile per l'altezza delle barre (stesso disegno a ogni ricostruzione)
  const noise = (i, s) => { const h = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return h - Math.floor(h); };

  // ogni barra ha il suo gradiente (luminosa in cima, trasparente verso il pavimento)
  function makeBar(x, top, w, floorY, wide) {
    const g = mctx.createLinearGradient(0, top, 0, floorY);
    if (wide) {
      g.addColorStop(0, "rgba(92, 208, 255, 0.32)");
      g.addColorStop(1, "rgba(31, 111, 255, 0.02)");
    } else {
      g.addColorStop(0, "#c8f2ff");
      g.addColorStop(0.25, "rgba(92, 208, 255, 0.85)");
      g.addColorStop(1, "rgba(31, 111, 255, 0.05)");
    }
    return { x, w, h: floorY - top, fill: g };
  }

  function buildMap() {
    const vw = mViewport.clientWidth;
    const vh = mViewport.clientHeight;
    const mobile = vw < 700;
    const gap = mobile ? vw * 0.8 : Math.max(360, vw * 0.34);
    const startX = mobile ? vw * 0.5 : vw * 0.3;
    const n = mStops.length;
    const xs = mStops.map((_, i) => startX + i * gap);
    const xEnd = xs[n - 1] + gap * 0.75;
    const trackW = Math.round(xEnd + (mobile ? vw * 0.25 : vw * 0.3));

    // in basso la fila delle schede, sopra il "pavimento" luminoso e il grafico che sale
    const ch = Math.max(...mStops.map((s) => s.querySelector(".stop__card").offsetHeight));
    const cardTop = vh - ch - (mobile ? 16 : 26);
    const floorY = cardTop - (mobile ? 18 : 26);
    const yTop = mobile ? 34 : 44;
    const yBot = Math.max(yTop + 120, floorY - (mobile ? 40 : 56));
    const range = yBot - yTop;

    // tappe sempre più in alto, con piccole "ricadute" tra una e l'altra, come un grafico in crescita
    const ys = mStops.map((_, i) => yBot - (0.14 + 0.66 * (i / (n - 1))) * range);
    const pts = [[0, yBot], [startX * 0.42, yBot - range * 0.16], [startX * 0.72, yBot - range * 0.03]];
    mStops.forEach((s, i) => {
      s.style.setProperty("--x", `${xs[i]}px`);
      s.style.setProperty("--y", `${ys[i]}px`);
      s.style.setProperty("--drop", `${cardTop - ys[i]}px`);
      pts.push([xs[i], ys[i]]);
      if (i < n - 1) {
        // prima un piccolo picco, poi la ricaduta, poi la tappa successiva più in alto
        pts.push([xs[i] + gap * 0.3, ys[i] - range * 0.06]);
        pts.push([xs[i] + gap * 0.58, Math.min(yBot, Math.max(ys[i], ys[i + 1]) + range * (i % 2 ? 0.1 : 0.17))]);
      }
    });
    pts.push([xs[n - 1] + gap * 0.32, ys[n - 1] + range * 0.08]);
    pts.push([xEnd, yTop]);

    mTrack.style.setProperty("--track-w", `${trackW}px`);

    // canvas grande quanto lo schermo (non quanto tutta la mappa): si ridisegna solo la parte visibile
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    mCanvas.width = Math.round(vw * dpr);
    mCanvas.height = Math.round(vh * dpr);

    // campioni lungo la spezzata, per trovare velocemente il punto della linea a una certa x
    const samples = [];
    for (let k = 1; k < pts.length; k++) {
      const [x0, y0] = pts[k - 1];
      const [x1, y1] = pts[k];
      const seg = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(seg / 4));
      for (let s = k === 1 ? 0 : 1; s <= steps; s++) {
        const t = s / steps;
        samples.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, k });
      }
    }
    const route = new Path2D();
    pts.forEach(([x, y], k) => (k ? route.lineTo(x, y) : route.moveTo(x, y)));
    const floorGlow = mctx.createLinearGradient(0, floorY, 0, floorY + 110);
    floorGlow.addColorStop(0, "rgba(92, 208, 255, 0.16)");
    floorGlow.addColorStop(1, "rgba(92, 208, 255, 0)");
    const [px, py] = pts[pts.length - 2];

    map = {
      vw, vh, dpr, trackW, xs, xEnd, yTop, floorY, samples, pts, route, floorGlow,
      arrowAng: Math.atan2(yTop - py, xEnd - px),
      maxShift: Math.max(0, trackW - vw), bars: [], wide: [],
    };

    // barre: sottili e luminose sotto la linea, larghe e tenui dietro
    const step = mobile ? 13 : 17;
    for (let x = 20, i = 0; x < xEnd - 4; x += step, i++) {
      const ly = pointAtX(x).y;
      const top = ly + 14 + noise(i, 1) * (floorY - ly) * 0.5;
      if (top < floorY - 6) map.bars.push(makeBar(x, top, mobile ? 3.5 : 4.5, floorY, false));
    }
    const stepW = mobile ? 56 : 72;
    for (let x = 40, i = 0; x < xEnd - 10; x += stepW, i++) {
      const ly = pointAtX(x).y;
      const top = Math.max(yTop, ly - 18 + noise(i, 2) * 70);
      if (top < floorY - 6) map.wide.push(makeBar(x, top, mobile ? 24 : 32, floorY, true));
    }

    const sp = pointAtX(startX * 0.3);
    mStart.style.setProperty("--x", `${sp.x}px`);
    mStart.style.setProperty("--y", `${sp.y}px`);
    mEnd.style.setProperty("--x", `${xEnd}px`);
    mEnd.style.setProperty("--y", `${yTop}px`);

    // altezza della sezione = scroll per percorrere la mappa + il tempo in cui passano le nuvole
    map.padTop = mCloudBefore ? mCloudBefore.offsetHeight / 2 : 0;
    map.padBottom = mCloudAfter ? mCloudAfter.offsetHeight / 2 : 0;
    method.style.setProperty("--method-h", `${window.innerHeight + map.maxShift + map.padTop + map.padBottom}px`);
    // "Il nostro metodo" porta direttamente dove le nuvole si sono già aperte
    method.style.scrollMarginTop = `${-map.padTop}px`;
    mapCur = -1;
    mapDirty = true;
  }

  // disegno del grafico: solo ciò che è visibile, spostato di "shift"
  function drawChart(shift, headX) {
    const m = map, c = mctx;
    c.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    c.clearRect(0, 0, m.vw, m.vh);
    c.translate(-shift, 0);
    const x0 = shift - 40, x1 = shift + m.vw + 40;

    // barre: crescono dal pavimento quando la linea le raggiunge
    const bars = (list) => {
      for (const b of list) {
        if (b.x < x0 || b.x > x1) continue;
        const g0 = Math.min(1, Math.max(0, (headX - b.x) / 150));
        if (g0 <= 0) continue;
        const h = b.h * (1 - Math.pow(1 - g0, 3));
        c.fillStyle = b.fill;
        c.fillRect(b.x - b.w / 2, m.floorY - h, b.w, h);
      }
    };
    bars(m.wide);
    bars(m.bars);

    // pavimento luminoso
    c.fillStyle = m.floorGlow;
    c.fillRect(x0, m.floorY, x1 - x0, 110);
    c.strokeStyle = "rgba(127, 220, 255, 0.55)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x0, m.floorY);
    c.lineTo(x1, m.floorY);
    c.stroke();

    // strada ancora da fare: tratteggio tenue
    c.lineJoin = c.lineCap = "round";
    c.setLineDash([3, 9]);
    c.strokeStyle = "rgba(160, 220, 255, 0.3)";
    c.lineWidth = 2;
    c.stroke(m.route);
    c.setLineDash([]);

    // strada percorsa: alone largo + linea brillante fino alla punta
    const pt = pointAtX(headX);
    const done = new Path2D();
    done.moveTo(m.pts[0][0], m.pts[0][1]);
    for (let k = 1; k < pt.k; k++) done.lineTo(m.pts[k][0], m.pts[k][1]);
    done.lineTo(pt.x, pt.y);
    c.strokeStyle = "rgba(92, 208, 255, 0.22)";
    c.lineWidth = 12;
    c.stroke(done);
    c.strokeStyle = "#9be6ff";
    c.lineWidth = 3;
    c.stroke(done);

    // freccia sulla punta finale, orientata come l'ultimo tratto
    if (headX >= m.xEnd - 2) {
      c.save();
      c.translate(m.xEnd, m.yTop);
      c.rotate(m.arrowAng);
      c.fillStyle = "#c8f2ff";
      c.beginPath();
      c.moveTo(-14, -9);
      c.lineTo(4, 0);
      c.lineTo(-14, 9);
      c.closePath();
      c.fill();
      c.restore();
    }
    return pt;
  }

  // la mappa insegue lo scroll con un ritardo minimo: movimento morbido ma pronto
  let mapTarget = 0, mapCur = -1, mapRaf = 0, mapPrevT = 0, mapDirty = true, mapReached = -1;
  function updateMap() {
    if (!map) return;
    const top = method.getBoundingClientRect().top;
    mapTarget = map.maxShift > 0 ? clamp((-top - map.padTop) / map.maxShift, 0, 1) : 0;
    // lontano dalla sezione il valore resta fermo a 0 o 1: niente da ridisegnare
    if (mapTarget === mapCur && !mapDirty) return;
    if (!mapRaf) { mapPrevT = 0; mapRaf = requestAnimationFrame(renderMap); }
  }

  function renderMap(now) {
    const dt = mapPrevT ? Math.min(64, now - mapPrevT) : 16.7;
    mapPrevT = now;
    if (mapCur < 0) mapCur = mapTarget;
    else mapCur += (mapTarget - mapCur) * (1 - Math.pow(1 - 0.2, dt / 16.7));
    if (Math.abs(mapTarget - mapCur) * map.maxShift < 0.3) mapCur = mapTarget;
    mapDirty = false;
    const p = mapCur;

    const shift = p * map.maxShift;
    mTrack.style.transform = `translate3d(${(-shift).toFixed(2)}px, 0, 0)`;

    // la punta della linea avanza sullo schermo da sinistra verso destra
    const headX = Math.min(map.xEnd, shift + map.vw * (0.18 + 0.64 * p));
    const pt = drawChart(shift, headX);
    mWalker.style.transform = `translate3d(${(pt.x - shift).toFixed(2)}px, ${pt.y.toFixed(2)}px, 0)`;

    // tappe raggiunte: tocco il DOM solo quando il numero cambia
    let reached = 0;
    while (reached < map.xs.length && map.xs[reached] <= headX + 2) reached++;
    if (reached !== mapReached) {
      mapReached = reached;
      mStops.forEach((s, i) => s.classList.toggle("is-reached", i < reached));
      stageNow.textContent = Math.max(1, reached);
    }

    mapRaf = mapCur === mapTarget ? 0 : requestAnimationFrame(renderMap);
  }

  /* ---------- Sfondo a puntini che reagisce al cursore (sezioni chiare) ---------- */
  const dotsCanvas = document.getElementById("dotsBg");
  const dctx = dotsCanvas.getContext("2d");
  const dp = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
  let dw = 0, dh = 0, dgap = 46, lastSy = -1, touchTimer = 0;

  // numero pseudo-casuale stabile per ogni punto della griglia (niente da memorizzare)
  const hash = (i, j, s) => {
    const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };

  function resizeDots() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    dw = window.innerWidth;
    dh = window.innerHeight;
    dotsCanvas.width = Math.round(dw * dpr);
    dotsCanvas.height = Math.round(dh * dpr);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dgap = dw < 600 ? 36 : 46;
    lastSy = -1;
  }

  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    dp.tx = e.clientX;
    dp.ty = e.clientY;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { dp.tx = dp.ty = -9999; });
  const touchDots = (e) => {
    const t = e.touches[0];
    if (!t) return;
    clearTimeout(touchTimer);
    dp.tx = t.clientX;
    dp.ty = t.clientY;
  };
  window.addEventListener("touchstart", touchDots, { passive: true });
  window.addEventListener("touchmove", touchDots, { passive: true });
  window.addEventListener("touchend", () => {
    touchTimer = setTimeout(() => { dp.tx = dp.ty = -9999; }, 700);
  }, { passive: true });

  // la hero e il metodo (sfondi pieni) coprono tutto lo schermo: in quel caso non serve disegnare
  function dotsCovered() {
    const hr = hero.getBoundingClientRect();
    if (hr.bottom >= dh) return true;
    const mr = method.getBoundingClientRect();
    return mr.top <= 0 && mr.bottom >= dh;
  }

  function drawDots(t) {
    requestAnimationFrame(drawDots);
    const sy = window.scrollY;
    const far = dp.tx < -1000;
    // il punto di influenza segue il cursore con un leggero ritardo
    if (far) { dp.x = dp.tx; dp.y = dp.ty; }
    else if (dp.x < -1000) { dp.x = dp.tx; dp.y = dp.ty; }
    else { dp.x += (dp.tx - dp.x) * 0.12; dp.y += (dp.ty - dp.y) * 0.12; }

    dctx.clearRect(0, 0, dw, dh);
    if (dotsCovered()) return;

    const R = dw < 600 ? 140 : 210;
    // tutta la trama risale piano (come bolle); la griglia è infinita quindi non ci sono salti
    const rise = t * 0.012;
    const j0 = Math.floor((sy + rise) / dgap) - 1;
    const j1 = Math.ceil((sy + rise + dh) / dgap) + 1;
    const i1 = Math.ceil(dw / dgap) + 1;

    for (let j = j0; j <= j1; j++) {
      for (let i = -1; i <= i1; i++) {
        const h3 = hash(i, j, 3);
        if (h3 < 0.2) continue; // qualche buco: la trama non è una griglia perfetta
        const h1 = hash(i, j, 1);
        const h2 = hash(i, j, 2);
        const h4 = hash(i, j, 4);
        // ogni puntino fluttua per conto suo: ampiezza e velocità diverse, percorso a "otto"
        const amp = 8 + h4 * 10;
        const sp = 0.00035 + h3 * 0.0005;
        let x = i * dgap + (h1 - 0.5) * dgap * 0.8 + Math.sin(t * sp + h1 * 6.283) * amp;
        let y = j * dgap + (h2 - 0.5) * dgap * 0.8 - sy - rise + Math.sin(t * sp * 1.6 + h2 * 6.283) * amp * 0.7;

        const dx = x - dp.x;
        const dy = y - dp.y;
        const d = Math.hypot(dx, dy);
        const k = Math.max(0, 1 - d / R);
        const e = k * k * (3 - 2 * k); // 0 lontano → 1 sotto il cursore
        if (e > 0 && d > 0) { x += (dx / d) * e * 12; y += (dy / d) * e * 12; }

        // lontano: piccoli e blu intenso · vicino al cursore: più grandi e più chiari
        const r = (1.1 + h3 * 1.3) * (1 + e * 2.2);
        const cr = Math.round(11 + (150 - 11) * e);
        const cg = Math.round(90 + (172 - 90) * e);
        const cb = Math.round(150 + (196 - 150) * e);
        const a = (0.28 + h1 * 0.32) * (1 - e) + 0.85 * e;
        dctx.fillStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
        dctx.beginPath();
        dctx.arc(x, y, r, 0, Math.PI * 2);
        dctx.fill();
      }
    }
  }
  resizeDots();
  window.addEventListener("resize", resizeDots);
  requestAnimationFrame(drawDots);

  /* ---------- Passaggio fluido tra le sezioni (niente salto secco) ---------- */
  let glideRaf = 0;
  function stopGlide() { cancelAnimationFrame(glideRaf); glideRaf = 0; }
  function glideTo(target) {
    stopGlide();
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const from = window.scrollY;
    const to = Math.min(maxY, Math.max(0, target.getBoundingClientRect().top + from - margin));
    const dist = to - from;
    if (Math.abs(dist) < 2) return;
    // durata proporzionale alla distanza, entro limiti comodi
    const dur = Math.min(1800, Math.max(700, Math.abs(dist) * 0.45));
    const ease = (p) => 0.5 - Math.cos(Math.PI * p) / 2; // partenza e arrivo morbidi, velocità costante al centro
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / dur);
      window.scrollTo({ top: from + dist * ease(p), behavior: "instant" });
      glideRaf = p < 1 ? requestAnimationFrame(step) : 0;
    };
    glideRaf = requestAnimationFrame(step);
  }
  // se l'utente scorre da solo durante il passaggio, gli restituiamo il controllo
  ["wheel", "touchstart", "keydown"].forEach((ev) =>
    window.addEventListener(ev, () => { if (glideRaf) stopGlide(); }, { passive: true })
  );
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute("data-open") || a.classList.contains("skip")) return;
    const id = a.getAttribute("href").slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    glideTo(target);
  });

  /* ---------- Scroll e ridimensionamento ---------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      nav.classList.toggle("is-scrolled", window.scrollY > 30);
      toTop.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.9);
      updateParallax();
      updateMap();
    });
  }
  function onResize() {
    cardW = (visibleCards[0] && visibleCards[0].offsetWidth) || cardW;
    fitCards();
    layoutDeck();
    buildMap();
    onScroll();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("load", onResize);
  if (document.fonts) document.fonts.ready.then(onResize);
  onResize();

  /* ---------- Modulo contatti ---------- */
  const contactForm = document.getElementById("contactForm");
  const contactError = document.getElementById("contactError");
  const contactSuccess = document.getElementById("contactSuccess");

  markFormStart(contactForm);
  contactForm.addEventListener("input", clearInvalid);
  contactForm.addEventListener("change", clearInvalid);
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (reportInvalid(contactForm, contactError)) return;
    const data = new FormData(contactForm);
    if (!(await sendForm(contactForm, contactError))) return;
    document.getElementById("contactSuccessText").textContent =
      `Grazie, ${data.get("name").trim().split(" ")[0]}. Abbiamo ricevuto il tuo messaggio: ti ricontatteremo ${replyTo(data)} il prima possibile.`;
    contactForm.hidden = true;
    contactSuccess.hidden = false;
  });
  document.getElementById("contactReset").addEventListener("click", () => {
    contactForm.reset();
    markFormStart(contactForm);
    contactForm.hidden = false;
    contactSuccess.hidden = true;
  });

  /* ---------- Varie ---------- */
  document.getElementById("year").textContent = new Date().getFullYear();
  observeReveals();
})();
