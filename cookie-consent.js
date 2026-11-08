/* Consenso cookie — Centro Medico Preite
   - nessuno strumento non necessario viene attivato prima del consenso
   - la scelta è salvata nel browser (archiviazione locale) e vale 6 mesi
   - il banner torna visibile alla scadenza o se cambia VERSION
   - per attivare uno script solo dopo il consenso a una categoria:
       <script type="text/plain" data-consent="statistiche" src="..."></script>
   - da altri script: window.cookieConsent.get() / .open(), evento "cookieconsent" su document */
(() => {
  const KEY = "cmp-consenso-cookie";
  const VERSION = 1; // aumentare quando cambiano categorie o strumenti: il consenso viene richiesto di nuovo
  const MAX_AGE = 1000 * 60 * 60 * 24 * 182; // 6 mesi

  const CATEGORIES = [
    {
      id: "statistiche",
      title: "Statistiche",
      text: "Ci aiuterebbero a capire, in forma aggregata, come viene usato il sito. Al momento non ne usiamo.",
    },
    {
      id: "marketing",
      title: "Marketing",
      text: "Servirebbero a mostrarti contenuti e annunci in linea con i tuoi interessi. Al momento non ne usiamo.",
    },
  ];

  /* ---------- lettura / scrittura della scelta ---------- */
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (!saved || saved.v !== VERSION || Date.now() - saved.date > MAX_AGE) return null;
      return saved;
    } catch (e) {
      return null;
    }
  }

  function write(choices) {
    const saved = { v: VERSION, date: Date.now(), choices };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* navigazione privata: vale per questa pagina */ }
    return saved;
  }

  const allSetTo = (value) => Object.fromEntries(CATEGORIES.map((c) => [c.id, value]));
  let current = read();

  /* ---------- attivazione degli strumenti consentiti ---------- */
  function apply(choices) {
    document.querySelectorAll('script[type="text/plain"][data-consent]').forEach((blocked) => {
      if (!choices[blocked.dataset.consent]) return;
      const s = document.createElement("script");
      [...blocked.attributes].forEach((a) => a.name !== "type" && s.setAttribute(a.name, a.value));
      s.text = blocked.text;
      blocked.replaceWith(s);
    });
    document.dispatchEvent(new CustomEvent("cookieconsent", { detail: { ...choices } }));
    showState();
  }

  // testo con la scelta attuale (usato nella cookie policy)
  function showState() {
    const label = !current
      ? "non hai ancora scelto: sono attivi solo gli strumenti necessari."
      : CATEGORIES.map((c) => `${c.title}: ${current.choices[c.id] ? "accettati" : "rifiutati"}`).join(" · ") +
        ` (scelta del ${new Date(current.date).toLocaleDateString("it-IT")}).`;
    document.querySelectorAll("[data-cookie-state]").forEach((el) => { el.textContent = label; });
  }

  function save(choices) {
    // se viene tolto un consenso già dato, la pagina va ricaricata per fermare gli strumenti attivi
    const revoked = current && CATEGORIES.some((c) => current.choices[c.id] && !choices[c.id]);
    current = write(choices);
    hideBanner();
    if (prefs.open) prefs.close();
    if (revoked) { location.reload(); return; }
    apply(choices);
  }

  /* ---------- banner ---------- */
  const banner = document.createElement("section");
  banner.className = "cookie";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-labelledby", "cookieTitle");
  banner.setAttribute("aria-describedby", "cookieText");
  banner.hidden = true;
  banner.innerHTML = `
    <button type="button" class="cookie__close" data-cookie="reject" aria-label="Chiudi senza accettare i cookie facoltativi">&times;</button>
    <h2 class="cookie__title" id="cookieTitle">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-5-5z"/><path d="M9 10h.01M8 15h.01M13 14h.01M15.5 17h.01"/></svg>
      Rispettiamo la tua privacy
    </h2>
    <p class="cookie__text" id="cookieText">
      Usiamo solo strumenti tecnici necessari al funzionamento del sito. Cookie statistici e di
      marketing si attivano soltanto se acconsenti, e puoi cambiare idea quando vuoi.
      <a href="cookie.html">Cookie policy</a>
    </p>
    <div class="cookie__actions">
      <button type="button" class="btn btn--primary" data-cookie="reject">Rifiuta</button>
      <button type="button" class="btn btn--primary" data-cookie="accept">Accetta tutti</button>
      <button type="button" class="cookie__more" data-cookie-prefs>Personalizza</button>
    </div>`;

  function showBanner() {
    banner.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add("is-visible")));
  }
  function hideBanner() {
    banner.classList.remove("is-visible");
    banner.hidden = true;
  }

  /* ---------- finestra delle preferenze ---------- */
  const prefs = document.createElement("dialog");
  prefs.className = "modal modal--wide cookie-prefs";
  prefs.setAttribute("aria-labelledby", "cookiePrefsTitle");
  prefs.innerHTML = `
    <button type="button" class="modal__close" data-cookie-close aria-label="Chiudi">&times;</button>
    <div class="modal__body">
      <p class="modal__eyebrow">Cookie e strumenti simili</p>
      <h2 id="cookiePrefsTitle">Preferenze cookie</h2>
      <p class="cookie-prefs__intro">
        Scegli quali categorie attivare. Gli strumenti necessari non richiedono consenso; tutti gli
        altri restano spenti finché non li accetti.
      </p>
      <ul class="cookie-prefs__list">
        <li>
          <div>
            <h3>Necessari</h3>
            <p>Indispensabili per il funzionamento del sito e per ricordare la tua scelta sui cookie.</p>
          </div>
          <span class="cookie-prefs__always">Sempre attivi</span>
        </li>
        ${CATEGORIES.map((c) => `
        <li>
          <div>
            <h3 id="cookieCat-${c.id}">${c.title}</h3>
            <p>${c.text}</p>
          </div>
          <label class="switch">
            <input type="checkbox" data-cat="${c.id}" aria-labelledby="cookieCat-${c.id}" />
            <span aria-hidden="true"></span>
          </label>
        </li>`).join("")}
      </ul>
      <div class="cookie-prefs__actions">
        <button type="button" class="btn btn--light" data-cookie="reject">Rifiuta tutti</button>
        <button type="button" class="btn btn--light" data-cookie="accept">Accetta tutti</button>
        <button type="button" class="btn btn--primary" data-cookie="save">Salva preferenze</button>
      </div>
      <p class="cookie-prefs__links"><a href="cookie.html">Cookie policy</a> · <a href="privacy.html">Privacy policy</a></p>
    </div>`;

  function openPrefs() {
    // nessuna casella preselezionata: si parte dalla scelta salvata, altrimenti tutto spento
    prefs.querySelectorAll("[data-cat]").forEach((input) => {
      input.checked = Boolean(current && current.choices[input.dataset.cat]);
    });
    if (!prefs.open) prefs.showModal();
  }

  // chiusura cliccando sullo sfondo
  prefs.addEventListener("click", (e) => {
    if (e.target !== prefs) return;
    const r = prefs.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) prefs.close();
  });

  /* ---------- comandi ---------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-cookie-prefs]")) {
      e.preventDefault();
      openPrefs();
      return;
    }
    if (e.target.closest("[data-cookie-reset]")) {
      // cancella la scelta salvata nel browser: il banner ricompare
      try { localStorage.removeItem(KEY); } catch (err) { /* niente da cancellare */ }
      location.reload();
      return;
    }
    if (e.target.closest("[data-cookie-close]")) {
      prefs.close();
      return;
    }
    const action = e.target.closest("[data-cookie]");
    if (!action) return;
    if (action.dataset.cookie === "accept") save(allSetTo(true));
    else if (action.dataset.cookie === "reject") save(allSetTo(false));
    else {
      const choices = {};
      prefs.querySelectorAll("[data-cat]").forEach((input) => { choices[input.dataset.cat] = input.checked; });
      save(choices);
    }
  });

  window.cookieConsent = {
    get: () => (current ? { ...current.choices } : null),
    open: openPrefs,
  };

  function init() {
    document.body.append(banner, prefs);
    if (current) apply(current.choices);
    else {
      showState();
      showBanner();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
