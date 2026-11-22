import { LF_TITEL, LERNFELDER, TYP_LABEL, ZEITRICHTWERTE, ladeFragen } from "./daten.js";
import * as sp from "./speicher.js";
import * as k from "./karten.js";

const { esc } = k;
const PRUEF_MINUTEN = 120;
const PRUEF_MAX = 40;

const app = document.getElementById("app");
const nav = document.getElementById("nav");

let FR = [];             // alle anzeigbaren Fragen
let NACH_ID = new Map();
let geladen = false;
let sitzung = null;      // laufende Übung oder Wiederholung (nur im Speicher)
let uhr = null;          // Takt der Prüfungsuhr
let installEreignis = null;
let aktionen = {};       // Klick-Aktionen des aktuellen Bildschirms
let eingabe = null;      // Texteingabe des aktuellen Bildschirms

// ---------- Hilfen ----------

const proLf = (n) => FR.filter((q) => q.lernfeld === n);
const geprueft = () => FR.filter((q) => q.status === "geprueft");
const mehrzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

function themenVon(liste) {
  return [...new Set(liste.map((q) => q.thema))];
}

function stand(liste) {
  let sicher = 0, gesehen = 0;
  for (const q of liste) {
    const e = sp.eintrag(q.id);
    if (e) { gesehen++; if (e.last) sicher++; }
  }
  const ges = liste.length;
  return { ges, sicher, gesehen, pct: ges ? Math.round((sicher / ges) * 100) : 0 };
}

const meter = (pct, label = "") =>
  `<span class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"${label ? ` aria-label="${esc(label)}"` : ""}><span style="width:${pct}%"></span></span>`;

const datum = (t) => new Date(t).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" });

function uhrzeit(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function geh(pfad, ersetzen = false) {
  const h = "#/" + pfad;
  if (location.hash === h) return route();
  if (ersetzen) { history.replaceState(null, "", h); route(); }
  else location.hash = h;
}

function zeige(html, navAktiv = null) {
  app.innerHTML = html;
  if (navAktiv === null) {
    nav.hidden = true;
    document.body.classList.remove("mit-nav");
    return;
  }
  const f = sp.faellige(FR).length;
  const pz = sp.zustand().pruefung;
  const punkt = pz && !pz.abgegeben ? `<span class="punkt" aria-label="läuft"></span>` : "";
  const tab = (pfad, text, icon, extra = "") =>
    `<a href="#/${pfad}" class="tab" ${navAktiv === pfad ? 'aria-current="page"' : ""}>${icon}<span>${text}</span>${extra}</a>`;
  nav.innerHTML = `<div class="nav-innen">
    ${tab("", "Lernen", ICON.buch)}
    ${tab("wiederholen", "Wiederholen", ICON.kasten, f ? `<span class="zahl" aria-label="${f} fällig">${f}</span>` : "")}
    ${tab("pruefung", "Prüfung", ICON.uhr, punkt)}
    ${tab("fortschritt", "Fortschritt", ICON.balken)}</div>`;
  nav.hidden = false;
  document.body.classList.add("mit-nav");
}

const ICON = {
  buch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"/></svg>`,
  kasten: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM6 4h12l2 5H4zM9 13h6"/></svg>`,
  uhr: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>`,
  balken: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6M3 20h18"/></svg>`,
};

function fokussiere(selektor) {
  if (!selektor) return;
  const el = app.querySelector(selektor);
  if (el) el.focus({ preventScroll: true });
}

function zurRueckmeldung() {
  const fb = app.querySelector(".fb");
  if (fb) fb.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

// ---------- Routen ----------

function route() {
  if (!geladen) return;
  stoppeUhr();
  aktionen = {};
  eingabe = null;
  const [a, b] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  window.scrollTo(0, 0);
  switch (a) {
    case "lf": return zeigeLernfeld(+b);
    case "uebung": return sitzung ? zeigeFrage() : geh("", true);
    case "ergebnis": return sitzung ? zeigeErgebnis() : geh("", true);
    case "wiederholen": return zeigeWiederholen();
    case "pruefung": return zeigePruefungStart();
    case "pruefung-lauf": return zeigePruefFrage();
    case "pruefung-ergebnis": return zeigePruefErgebnis();
    case "fortschritt": return zeigeFortschritt();
    default: return zeigeStart();
  }
}

// ---------- Start ----------

function zeigeStart() {
  const f = sp.faellige(FR).length;
  const pz = sp.zustand().pruefung;
  const karten = LERNFELDER.map((n) => {
    const l = proLf(n), s = stand(l);
    return `<a class="card" href="#/lf/${n}">
      <span class="lfno">Lernfeld ${n}</span>
      <span class="lftitle">${esc(LF_TITEL[n])}</span>
      ${meter(s.pct, `Lernfeld ${n}: ${s.pct} Prozent sicher`)}
      <span class="meta">${l.length ? `${s.sicher} von ${s.ges} sicher` : "Noch keine Fragen"}</span></a>`;
  }).join("");
  const entwuerfe = FR.filter((q) => q.status !== "geprueft").length;

  aktionen = {
    mischen: () => starteUebung("Alle Lernfelder", FR, "uebung", ""),
    installieren: async () => {
      if (!installEreignis) return;
      installEreignis.prompt();
      await installEreignis.userChoice.catch(() => null);
      installEreignis = null;
      route();
    },
  };
  zeige(`
    <header class="kopf">
      <h1>Zahntechnik Lernhelfer</h1>
      <p class="sub">Theorie für Teil 1 der Gesellenprüfung, Prüfungsbereich „Zahntechnische Werkstücke“.</p>
    </header>
    ${pz && !pz.abgegeben ? `<a class="banner" href="#/pruefung">Prüfungssimulation läuft · fortsetzen</a>` : ""}
    ${f ? `<a class="banner gut" href="#/wiederholen">${mehrzahl(f, "Frage", "Fragen")} zum Wiederholen fällig</a>` : ""}
    <h2 class="abschnitt">Üben nach Lernfeld</h2>
    <div class="grid">${karten}</div>
    <div class="stapel">
      <button class="btn breit ghost" data-act="mischen" ${FR.length ? "" : "disabled"}>Alle Lernfelder gemischt üben</button>
      ${installEreignis ? `<button class="btn breit ghost" data-act="installieren">App auf dem Handy installieren</button>` : ""}
    </div>
    <p class="note">${mehrzahl(FR.length, "Frage", "Fragen")}${entwuerfe ? `, davon ${entwuerfe} als Entwurf markiert (noch nicht von der Lehrkraft geprüft)` : ""}.
      Dein Fortschritt wird nur auf diesem Gerät gespeichert.</p>`, "");
}

// ---------- Lernfeld ----------

function zeigeLernfeld(n) {
  if (!LF_TITEL[n]) return geh("", true);
  const l = proLf(n), s = stand(l), th = themenVon(l);
  aktionen = {
    alle: () => starteUebung(`Lernfeld ${n}`, l, "uebung", `lf/${n}`),
    thema: (el) => {
      const t = th[+el.dataset.t];
      starteUebung(t, l.filter((q) => q.thema === t), "uebung", `lf/${n}`);
    },
  };
  const zeilen = th.map((t, i) => {
    const st = stand(l.filter((q) => q.thema === t));
    return `<button class="zeile" data-act="thema" data-t="${i}">
      <span class="zeile-kopf"><span class="zt">${esc(t)}</span><span class="meta">${st.sicher}/${st.ges}</span></span>
      ${meter(st.pct, `${t}: ${st.pct} Prozent sicher`)}</button>`;
  }).join("");
  zeige(`
    <a class="zurueck" href="#/">‹ Übersicht</a>
    <p class="lfno">Lernfeld ${n}</p>
    <h1>${esc(LF_TITEL[n])}</h1>
    ${l.length ? `
      <div class="panel">${meter(s.pct, `${s.pct} Prozent sicher`)}<p class="meta">${s.sicher} von ${s.ges} sicher · ${s.gesehen} bearbeitet</p></div>
      <h2 class="abschnitt">Nach Thema üben</h2>
      <div class="liste">${zeilen}</div>
      <div class="aktionsleiste"><button class="btn breit" data-act="alle">Alle ${l.length} Fragen üben</button></div>`
      : `<p class="note">Für dieses Lernfeld gibt es noch keine Fragen.</p>`}`, "");
}

// ---------- Übung und Wiederholung ----------

function starteUebung(titel, pool, art, zurueck) {
  if (!pool.length) return;
  const queue = k.mischen(pool);
  if (art === "uebung") {
    // Neue und zuletzt falsche Fragen zuerst
    const rang = (q) => { const e = sp.eintrag(q.id); return !e || e.last === false ? 0 : 1; };
    queue.sort((a, b) => rang(a) - rang(b));
  }
  sitzung = { titel, art, zurueck, queue, i: 0, erg: {} };
  neueFrage();
  geh("uebung");
}

function starteWiederholung() {
  const f = sp.faellige(FR);
  if (!f.length) return geh("wiederholen", true);
  starteUebung("Wiederholen", f, "wiederholung", "wiederholen");
}

function neueFrage() {
  const q = sitzung.queue[sitzung.i];
  Object.assign(sitzung, { q, a: k.neueAntwort(q), fertig: false, gezeigt: false });
}

const entwurfHinweis = (q) => q.status !== "geprueft"
  ? `<p class="hinweis" role="note"><strong>Entwurf:</strong> Diese Frage ist noch nicht von der Lehrkraft geprüft.</p>` : "";

const typHinweis = (q, pruefung = false) =>
  q.typ === "multiple" ? `<p class="typ-hinweis">Mehrere Antworten können richtig sein.</p>`
  : q.typ === "reihenfolge" ? `<p class="typ-hinweis">Mit den Pfeilen in die richtige Reihenfolge bringen.</p>`
  : q.typ === "kurz" ? `<p class="typ-hinweis">${pruefung
    ? "Schreibe deine Antwort. Am Ende vergleichst du sie mit der Musterantwort."
    : "Antworte in Gedanken oder schriftlich, dann vergleiche mit der Musterantwort."}</p>` : "";

const fragenKopf = (q) => `
  <div class="tags"><span class="badge lf">LF ${q.lernfeld}</span><span class="badge">${esc(q.thema)}</span><span class="badge">${TYP_LABEL[q.typ]}</span></div>
  ${entwurfHinweis(q)}
  <h2 class="question" id="frage">${esc(q.frage)}</h2>
  ${typHinweis(q)}`;

function zeigeFrage(fokus) {
  const s = sitzung, q = s.q, a = s.a;
  const letzte = s.i === s.queue.length - 1;
  let rueck = "", knoepfe = "";

  if (q.typ === "kurz") {
    if (s.gezeigt) {
      rueck = `<div class="fb info" role="status"><strong>Musterantwort</strong><p>${esc(q.musterantwort)}</p>${q.erklaerung ? `<p>${esc(q.erklaerung)}</p>` : ""}
        ${s.fertig ? `<p class="small">${s.erg[q.id] ? "Gespeichert: gewusst." : "Gespeichert: kommt in den Karteikasten."}</p>` : ""}</div>`;
    }
    if (!s.gezeigt) knoepfe = `<button class="btn breit" data-act="zeigen">Musterantwort zeigen</button>`;
    else if (!s.fertig) knoepfe = `<p class="frage-selbst">Wie lief es?</p><div class="zwei">
      <button class="btn warn" data-act="bewerten" data-ok="0">Noch nicht</button>
      <button class="btn good" data-act="bewerten" data-ok="1">Wusste ich</button></div>`;
  } else if (s.fertig) {
    const ok = s.erg[q.id];
    rueck = `<div class="fb ${ok ? "good" : "bad"}" role="status"><strong>${ok ? "Richtig." : "Nicht ganz."}</strong>
      ${ok ? "" : `<p><span class="small">Richtig ist:</span> ${esc(k.loesungText(q))}</p>`}
      ${q.erklaerung ? `<p>${esc(q.erklaerung)}</p>` : ""}</div>`;
  } else {
    const bereit = q.typ === "reihenfolge" || k.istBeantwortet(q, a);
    knoepfe = `<button class="btn breit" data-act="pruefen" ${bereit ? "" : "disabled"}>Prüfen</button>`;
  }
  if (s.fertig) knoepfe = `<button class="btn breit" data-act="weiter">${letzte ? "Zum Ergebnis" : "Weiter"}</button>`;

  const erfassen = (ok) => { s.erg[q.id] = ok; s.fertig = true; sp.erfasse(q.id, ok); };
  aktionen = {
    beenden: () => (Object.keys(s.erg).length ? geh("ergebnis", true) : geh(s.zurueck, true)),
    opt: (el) => zeigeFrage(k.bearbeite(q, a, "opt", el)),
    hoch: (el) => zeigeFrage(k.bearbeite(q, a, "hoch", el)),
    runter: (el) => zeigeFrage(k.bearbeite(q, a, "runter", el)),
    pruefen: () => { erfassen(k.istRichtig(q, a.sel)); zeigeFrage('[data-act="weiter"]'); zurRueckmeldung(); },
    zeigen: () => { s.gezeigt = true; zeigeFrage('[data-act="bewerten"]'); zurRueckmeldung(); },
    bewerten: (el) => { erfassen(el.dataset.ok === "1"); zeigeFrage('[data-act="weiter"]'); },
    weiter: () => {
      if (letzte) return geh("ergebnis", true);
      s.i++;
      neueFrage();
      zeigeFrage();
      window.scrollTo(0, 0);
      fokussiere("#frage");
    },
  };
  eingabe = (wert) => { a.sel = wert; };

  const pct = Math.round((s.i / s.queue.length) * 100);
  zeige(`
    <div class="qkopf">
      <button class="icon-btn" data-act="beenden" aria-label="Übung beenden">✕</button>
      <span class="qtitel">${esc(s.titel)}</span>
      <span class="qzahl">${s.i + 1} / ${s.queue.length}</span>
    </div>
    <div class="bar">${meter(pct, `Frage ${s.i + 1} von ${s.queue.length}`)}</div>
    ${fragenKopf(q)}
    ${k.antwortHtml(q, a, { aufloesen: s.fertig && q.typ !== "kurz", gesperrt: s.gezeigt })}
    ${rueck}
    <div class="aktionsleiste">${knoepfe}</div>`);
  fokussiere(fokus);
}

function lfZeilen(fragen, wertung) {
  return LERNFELDER.map((n) => {
    const l = fragen.filter((q) => q.lernfeld === n);
    if (!l.length) return "";
    const ok = l.filter((q) => wertung(q) === true).length;
    const p = Math.round((ok / l.length) * 100);
    return `<div class="lfrow"><span>LF ${n}</span>${meter(p, `Lernfeld ${n}: ${p} Prozent`)}<span>${ok}/${l.length}</span></div>`;
  }).join("");
}

function zeigeErgebnis() {
  const s = sitzung;
  const qs = s.queue.filter((q) => q.id in s.erg);
  const ok = qs.filter((q) => s.erg[q.id]).length;
  const pct = qs.length ? Math.round((ok / qs.length) * 100) : 0;
  const falsch = qs.filter((q) => !s.erg[q.id]);
  const f = sp.faellige(FR).length;
  aktionen = {
    uebersicht: () => { sitzung = null; geh(s.zurueck === "wiederholen" ? "wiederholen" : "", true); },
    wiederholen: () => starteWiederholung(),
  };
  const liste = falsch.map((q) => `<div class="panel">
      <p class="q">${esc(q.frage)}</p>
      <p><span class="small">Richtig:</span> ${esc(k.loesungText(q))}</p>
      ${q.erklaerung ? `<p class="small">${esc(q.erklaerung)}</p>` : ""}</div>`).join("");
  zeige(`
    <div class="top"><h1>Ergebnis</h1><span class="badge">${s.art === "wiederholung" ? "Wiederholung" : "Übung"}</span></div>
    <p class="sub">${esc(s.titel)}</p>
    <div class="panel ergebnis">
      <div class="score">${pct}%</div>
      <p>${ok} von ${mehrzahl(qs.length, "bearbeiteten Frage", "bearbeiteten Fragen")} richtig${s.queue.length > qs.length ? ` (${s.queue.length - qs.length} übersprungen)` : ""}</p>
      <div class="lfs">${lfZeilen(qs, (q) => s.erg[q.id])}</div>
    </div>
    ${falsch.length ? `<h2 class="abschnitt">Zum Nacharbeiten</h2><p class="small">Diese Fragen liegen jetzt in Box 1 des Karteikastens.</p><div class="rev">${liste}</div>` : `<p class="note">Alles richtig.</p>`}
    <div class="aktionsleiste">
      ${f ? `<button class="btn breit" data-act="wiederholen">${mehrzahl(f, "fällige Frage", "fällige Fragen")} wiederholen</button>` : ""}
      <button class="btn breit ${f ? "ghost" : ""}" data-act="uebersicht">Fertig</button>
    </div>`);
}

// ---------- Karteikasten ----------

function zeigeWiederholen() {
  const f = sp.faellige(FR).length;
  const boxen = sp.boxZaehlung(FR);
  const imKasten = boxen.reduce((x, y) => x + y, 0);
  const naechst = sp.naechsterTermin(FR);
  const warten = ["sofort", "nach 1 Tag", "nach 2 Tagen", "nach 4 Tagen", "nach 8, dann alle 16 Tage"];
  const max = Math.max(1, ...boxen);
  const zeilen = [1, 2, 3, 4, 5].map((b) => `<div class="boxrow">
      <span class="boxname">Box ${b}<span class="meta">${warten[b - 1]}</span></span>
      ${meter(Math.round((boxen[b] / max) * 100), `Box ${b}: ${boxen[b]} Fragen`)}<span>${boxen[b]}</span></div>`).join("");
  aktionen = { start: () => starteWiederholung() };
  zeige(`
    <h1>Fehler wiederholen</h1>
    <p class="sub">Falsch beantwortete Fragen kommen in Box 1. Jede richtige Antwort schiebt eine fällige Frage eine Box weiter, der Abstand bis zur nächsten Wiederholung wächst. Eine falsche Antwort schickt sie zurück in Box 1.</p>
    <div class="panel">${zeilen}</div>
    ${f ? `<div class="aktionsleiste"><button class="btn breit" data-act="start">${mehrzahl(f, "fällige Frage", "fällige Fragen")} wiederholen</button></div>`
      : `<p class="note">${imKasten ? `Gerade ist nichts fällig.${naechst ? ` Nächste Wiederholung: ${datum(naechst)}.` : ""}` : "Der Karteikasten ist leer. Falsch beantwortete Fragen landen automatisch hier."}</p>`}`, "wiederholen");
}

// ---------- Prüfungssimulation ----------

const pruefFragen = (pz) => pz.ids.map((id) => NACH_ID.get(id)).filter(Boolean);

function zeigePruefungStart() {
  const pz = sp.zustand().pruefung;
  if (pz && pz.abgegeben) return geh("pruefung-ergebnis", true);
  if (pz && Date.now() >= pz.ende) { abgeben(); return geh("pruefung-ergebnis", true); }

  const pool = geprueft();
  const n = Math.min(pool.length, PRUEF_MAX);
  const verlauf = sp.zustand().verlauf.slice(-5).reverse();
  aktionen = {
    start: () => {
      const qs = k.ziehePruefung(pool, PRUEF_MAX, ZEITRICHTWERTE);
      const antw = {};
      qs.forEach((q) => { antw[q.id] = k.neueAntwort(q); });
      const jetzt = Date.now();
      sp.setzePruefung({ ids: qs.map((q) => q.id), i: 0, start: jetzt, ende: jetzt + PRUEF_MINUTEN * 60000, antw, abgegeben: false });
      geh("pruefung-lauf");
    },
    fortsetzen: () => geh("pruefung-lauf"),
    abbrechen: () => {
      if (!confirm("Prüfungssimulation abbrechen? Deine Antworten werden nicht gewertet.")) return;
      sp.setzePruefung(null);
      route();
    },
  };

  let inhalt;
  if (pz) {
    const qs = pruefFragen(pz);
    const beantwortet = qs.filter((q) => k.istBeantwortet(q, pz.antw[q.id])).length;
    inhalt = `<div class="panel">
        <p><strong>Die Simulation läuft.</strong> Die Zeit läuft auch weiter, wenn die App geschlossen ist.</p>
        <p class="meta">Restzeit ${uhrzeit(pz.ende - Date.now())} · ${beantwortet} von ${qs.length} beantwortet</p></div>
      <div class="aktionsleiste"><button class="btn breit" data-act="fortsetzen">Fortsetzen</button>
        <button class="btn breit ghost" data-act="abbrechen">Abbrechen ohne Wertung</button></div>`;
  } else if (!pool.length) {
    inhalt = `<div class="panel"><p><strong>Noch keine freigegebenen Fragen.</strong></p>
      <p class="small">In der Prüfungssimulation erscheinen nur Fragen, die die Lehrkraft geprüft hat. Bis dahin kannst du alle Fragen im Übungsmodus lernen.</p></div>`;
  } else {
    const anteile = k.pruefungsAnteile(pool, PRUEF_MAX, ZEITRICHTWERTE);
    const verteilung = [...anteile].filter(([, a]) => a > 0).map(([lf, a]) => `LF ${lf}: ${a}`).join(" · ");
    inhalt = `<ul class="plain fakten">
        <li>${mehrzahl(n, "Frage", "Fragen")}, nur von der Lehrkraft geprüfte${pool.length > n ? `, zufällig aus ${pool.length}` : ""}</li>
        <li>Verteilung nach den Zeitrichtwerten des Rahmenlehrplans: ${verteilung}</li>
        <li>${PRUEF_MINUTEN} Minuten Zeit, die Uhr läuft auch bei geschlossener App weiter</li>
        <li>Rückmeldung erst am Ende, Kurzantworten bewertest du dann selbst</li>
        <li>Vor- und Zurückblättern ist erlaubt</li></ul>
      <div class="aktionsleiste"><button class="btn breit" data-act="start">Simulation starten</button></div>`;
  }
  const verlaufHtml = verlauf.length ? `<h2 class="abschnitt">Letzte Simulationen</h2><div class="panel">${verlauf.map((v) =>
    `<div class="verlauf"><span>${datum(v.id)}</span><span>${v.ok} von ${v.n} richtig</span><strong>${v.n ? Math.round((v.ok / v.n) * 100) : 0}%</strong></div>`).join("")}</div>` : "";
  zeige(`<h1>Prüfungssimulation</h1>
    <p class="sub">Wie im schriftlichen Teil „Zahntechnische Werkstücke“: ${PRUEF_MINUTEN} Minuten, Auswertung am Schluss.</p>
    ${inhalt}${verlaufHtml}`, "pruefung");
}

function zeigePruefFrage(fokus, uebersicht = false) {
  const pz = sp.zustand().pruefung;
  if (!pz) return geh("pruefung", true);
  if (pz.abgegeben) return geh("pruefung-ergebnis", true);
  if (Date.now() >= pz.ende) { abgeben(); return geh("pruefung-ergebnis", true); }
  const qs = pruefFragen(pz);
  if (!qs.length) { sp.setzePruefung(null); return geh("pruefung", true); }
  pz.i = Math.min(Math.max(0, pz.i), qs.length - 1);
  const q = qs[pz.i], a = pz.antw[q.id];
  if (q.typ === "reihenfolge" && !a.besucht) { a.besucht = true; sp.speichern(); }
  const letzte = pz.i === qs.length - 1;
  const offen = qs.filter((x) => !k.istBeantwortet(x, pz.antw[x.id])).length;

  const springe = (i) => { pz.i = i; sp.speichern(); zeigePruefFrage(); window.scrollTo(0, 0); fokussiere("#frage"); };
  aktionen = {
    pause: () => geh("pruefung"),
    opt: (el) => { const f = k.bearbeite(q, a, "opt", el); sp.speichern(); zeigePruefFrage(f); },
    hoch: (el) => { const f = k.bearbeite(q, a, "hoch", el); sp.speichern(); zeigePruefFrage(f); },
    runter: (el) => { const f = k.bearbeite(q, a, "runter", el); sp.speichern(); zeigePruefFrage(f); },
    zurueck: () => springe(pz.i - 1),
    weiter: () => springe(pz.i + 1),
    uebersicht: () => { zeigePruefFrage(null, !uebersicht); },
    sprung: (el) => springe(+el.dataset.i),
    abgeben: () => {
      const text = offen
        ? `Noch ${mehrzahl(offen, "Frage", "Fragen")} unbeantwortet. Trotzdem abgeben?`
        : "Prüfung jetzt abgeben?";
      if (!confirm(text)) return;
      abgeben();
      geh("pruefung-ergebnis", true);
    },
  };
  eingabe = (wert) => { a.sel = wert; sp.speichern(); };

  const raster = uebersicht ? `<div class="raster" role="group" aria-label="Fragenübersicht">${qs.map((x, i) =>
    `<button class="${k.istBeantwortet(x, pz.antw[x.id]) ? "fertig" : ""} ${i === pz.i ? "jetzt" : ""}" data-act="sprung" data-i="${i}" aria-label="Frage ${i + 1}${k.istBeantwortet(x, pz.antw[x.id]) ? ", beantwortet" : ""}">${i + 1}</button>`).join("")}</div>
    <p class="small">${qs.length - offen} von ${qs.length} beantwortet</p>` : "";

  zeige(`
    <div class="qkopf">
      <button class="icon-btn" data-act="pause" aria-label="Prüfung pausieren">‹</button>
      <span class="qtitel">Restzeit <strong id="timer" class="timer">${uhrzeit(pz.ende - Date.now())}</strong></span>
      <button class="qzahl knopf" data-act="uebersicht" aria-expanded="${uebersicht}">${pz.i + 1} / ${qs.length} ▾</button>
    </div>
    ${raster}
    <div class="bar">${meter(Math.round(((qs.length - offen) / qs.length) * 100), "beantwortet")}</div>
    <div class="tags"><span class="badge lf">LF ${q.lernfeld}</span><span class="badge">${TYP_LABEL[q.typ]}</span></div>
    <h2 class="question" id="frage" tabindex="-1">${esc(q.frage)}</h2>
    ${typHinweis(q, true)}
    ${k.antwortHtml(q, a)}
    <div class="aktionsleiste">
      <div class="zwei">
        <button class="btn ghost" data-act="zurueck" ${pz.i === 0 ? "disabled" : ""}>Zurück</button>
        ${letzte ? `<button class="btn" data-act="abgeben">Abgeben</button>` : `<button class="btn" data-act="weiter">Weiter</button>`}
      </div>
      ${letzte ? "" : `<button class="btn ghost klein" data-act="abgeben">Vorzeitig abgeben</button>`}
    </div>`);
  fokussiere(fokus);
  starteUhr();
}

function abgeben() {
  const pz = sp.zustand().pruefung;
  if (!pz || pz.abgegeben) return;
  stoppeUhr();
  const jetzt = Date.now();
  pz.erg = {};
  for (const q of pruefFragen(pz)) {
    const a = pz.antw[q.id];
    if (!k.istBeantwortet(q, a)) {
      pz.erg[q.id] = false;
    } else if (q.typ === "kurz") {
      pz.erg[q.id] = null; // Selbstbewertung am Ende
      continue;
    } else {
      pz.erg[q.id] = k.istRichtig(q, a.sel);
    }
    sp.erfasse(q.id, pz.erg[q.id], jetzt);
  }
  pz.abgegeben = true;
  pz.abgabe = Math.min(jetzt, pz.ende);
  sp.setzePruefung(pz);
  verlaufAktualisieren(pz);
}

function verlaufAktualisieren(pz) {
  const werte = Object.values(pz.erg);
  sp.verlaufEintragen({ id: pz.start, n: werte.length, ok: werte.filter((v) => v === true).length });
}

function zeigePruefErgebnis() {
  const pz = sp.zustand().pruefung;
  if (!pz || !pz.abgegeben) return geh("pruefung", true);
  const qs = pruefFragen(pz);
  const ok = qs.filter((q) => pz.erg[q.id] === true).length;
  const offen = qs.filter((q) => pz.erg[q.id] === null).length;
  const unbeantwortet = qs.filter((q) => !k.istBeantwortet(q, pz.antw[q.id])).length;
  const pct = qs.length ? Math.round((ok / qs.length) * 100) : 0;
  const minuten = Math.round((pz.abgabe - pz.start) / 60000);
  const f = sp.faellige(FR).length;

  aktionen = {
    bewerten: (el) => {
      const id = el.dataset.id, richtig = el.dataset.ok === "1";
      pz.erg[id] = richtig;
      sp.erfasse(id, richtig);
      sp.setzePruefung(pz);
      verlaufAktualisieren(pz);
      const y = window.scrollY;
      zeigePruefErgebnis();
      window.scrollTo(0, y);
    },
    fertig: () => {
      if (offen && !confirm(`${mehrzahl(offen, "Kurzantwort ist", "Kurzantworten sind")} noch nicht bewertet und zählen dann nicht. Trotzdem schließen?`)) return;
      sp.setzePruefung(null);
      geh("pruefung", true);
    },
    wiederholen: () => {
      if (offen && !confirm(`${mehrzahl(offen, "Kurzantwort ist", "Kurzantworten sind")} noch nicht bewertet. Trotzdem weiter?`)) return;
      sp.setzePruefung(null);
      starteWiederholung();
    },
  };

  const liste = qs.filter((q) => pz.erg[q.id] !== true).map((q) => {
    const a = pz.antw[q.id];
    const bewerten = pz.erg[q.id] === null ? `<div class="zwei bewerten">
        <button class="btn warn" data-act="bewerten" data-id="${esc(q.id)}" data-ok="0">Noch nicht</button>
        <button class="btn good" data-act="bewerten" data-id="${esc(q.id)}" data-ok="1">Wusste ich</button></div>` : "";
    return `<div class="panel ${pz.erg[q.id] === null ? "offen" : ""}">
      <p class="q"><span class="badge lf">LF ${q.lernfeld}</span> ${esc(q.frage)}</p>
      <p><span class="small">Deine Antwort:</span> ${esc(k.eigeneAntwortText(q, a))}</p>
      <p><span class="small">${q.typ === "kurz" ? "Musterantwort" : "Richtig"}:</span> ${esc(k.loesungText(q))}</p>
      ${q.erklaerung ? `<p class="small">${esc(q.erklaerung)}</p>` : ""}${bewerten}</div>`;
  }).join("");

  zeige(`
    <div class="top"><h1>Auswertung</h1><span class="badge">Prüfungssimulation</span></div>
    <div class="panel ergebnis">
      <div class="score">${pct}%</div>
      <p>${ok} von ${mehrzahl(qs.length, "Frage", "Fragen")} richtig · ${minuten} von ${PRUEF_MINUTEN} Minuten</p>
      <p class="small">${unbeantwortet ? `${unbeantwortet} unbeantwortet. ` : ""}${offen ? `${mehrzahl(offen, "Kurzantwort wartet", "Kurzantworten warten")} unten auf deine Selbstbewertung.` : ""}</p>
      <div class="lfs">${lfZeilen(qs, (q) => pz.erg[q.id])}</div>
    </div>
    ${liste ? `<h2 class="abschnitt">Zum Nacharbeiten</h2><div class="rev">${liste}</div>` : `<p class="note">Alles richtig.</p>`}
    <div class="aktionsleiste">
      ${f ? `<button class="btn breit" data-act="wiederholen">${mehrzahl(f, "fällige Frage", "fällige Fragen")} wiederholen</button>` : ""}
      <button class="btn breit ${f ? "ghost" : ""}" data-act="fertig">Schließen</button>
    </div>`);
}

function starteUhr() {
  stoppeUhr();
  uhr = setInterval(tick, 1000);
}
function stoppeUhr() {
  if (uhr) { clearInterval(uhr); uhr = null; }
}
function tick() {
  const pz = sp.zustand().pruefung;
  if (!pz || pz.abgegeben) return stoppeUhr();
  const rest = pz.ende - Date.now();
  const el = document.getElementById("timer");
  if (el) {
    el.textContent = uhrzeit(rest);
    el.classList.toggle("knapp", rest < 10 * 60000);
  }
  if (rest <= 0) {
    abgeben();
    geh("pruefung-ergebnis", true);
  }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && uhr) tick(); });

// ---------- Fortschritt ----------

function zeigeFortschritt() {
  const s = stand(FR);
  const boxen = sp.boxZaehlung(FR);
  const imKasten = boxen.reduce((x, y) => x + y, 0);
  const lfs = LERNFELDER.map((n) => {
    const l = proLf(n), st = stand(l);
    const th = themenVon(l).map((t) => {
      const x = stand(l.filter((q) => q.thema === t));
      return `<div class="lfrow thema"><span>${esc(t)}</span>${meter(x.pct, `${t}: ${x.pct} Prozent`)}<span>${x.sicher}/${x.ges}</span></div>`;
    }).join("");
    return `<details class="panel lf-detail">
      <summary><span class="zeile-kopf"><span><span class="lfno">LF ${n}</span> ${esc(LF_TITEL[n])}</span><span class="meta">${st.sicher}/${st.ges}</span></span>${meter(st.pct, `Lernfeld ${n}: ${st.pct} Prozent`)}</summary>
      ${l.length ? `<p class="meta">${st.gesehen} von ${st.ges} bearbeitet</p>${th}` : `<p class="meta">Noch keine Fragen.</p>`}</details>`;
  }).join("");
  aktionen = {
    reset: () => {
      if (!confirm("Den gesamten Fortschritt auf diesem Gerät löschen (Antworten, Karteikasten, Prüfungen)? Das lässt sich nicht rückgängig machen.")) return;
      sp.zuruecksetzen();
      sitzung = null;
      route();
    },
  };
  zeige(`
    <h1>Fortschritt</h1>
    <div class="panel ergebnis">
      <div class="score">${s.pct}%</div>
      <p>${s.sicher} von ${mehrzahl(s.ges, "Frage", "Fragen")} sicher · ${s.gesehen} bearbeitet</p>
      <p class="small">„Sicher“ heißt: zuletzt richtig beantwortet. Im Karteikasten: ${imKasten}.</p>
    </div>
    <h2 class="abschnitt">Nach Lernfeld und Thema</h2>
    ${lfs}
    <h2 class="abschnitt">Daten</h2>
    <p class="small">Alles wird nur auf diesem Gerät gespeichert. Beim Löschen der Browserdaten geht der Fortschritt verloren.</p>
    <button class="btn breit danger" data-act="reset">Fortschritt zurücksetzen</button>`, "fortschritt");
}

// ---------- Ereignisse und Start ----------

app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = aktionen[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});
app.addEventListener("input", (e) => {
  if (e.target.id === "ka" && eingabe) eingabe(e.target.value);
});
window.addEventListener("hashchange", route);
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEreignis = e;
  if (geladen && location.hash.replace(/^#\/?/, "") === "") route();
});

async function start() {
  app.innerHTML = `<p class="laden">Fragen werden geladen …</p>`;
  try {
    FR = await ladeFragen();
  } catch (err) {
    app.innerHTML = `<div class="panel"><h2>Fragen konnten nicht geladen werden</h2>
      <p>Bitte die App einmal mit Internetverbindung öffnen.</p><p class="small">${esc(err.message)}</p>
      <button class="btn" onclick="location.reload()">Erneut versuchen</button></div>`;
    return;
  }
  NACH_ID = new Map(FR.map((q) => [q.id, q]));
  geladen = true;
  route();
  sp.dauerhaftAnfragen();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service Worker:", err));
  });
}

start();
