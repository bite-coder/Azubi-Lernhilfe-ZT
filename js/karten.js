// Darstellung und Auswertung der Fragetypen: single, multiple, kurz, reihenfolge

const BUCHSTABEN = "ABCDEFGHIJ";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mischen(liste) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const indizes = (n) => [...Array(n).keys()];

/**
 * Anzahl Prüfungsfragen je Lernfeld: höchstens max, im Verhältnis der Gewichte (Verfahren größter Rest).
 * Hat ein Lernfeld zu wenige Fragen, geht der Rest anteilig an die anderen.
 * Ohne Gewicht zählt die Zahl der vorhandenen Fragen. Ergebnis: Map lernfeld -> anzahl.
 */
export function pruefungsAnteile(pool, max, gewichte = {}) {
  const lfs = [...new Set(pool.map((q) => q.lernfeld))].sort((a, b) => a - b);
  const vorhanden = new Map(lfs.map((n) => [n, pool.filter((q) => q.lernfeld === n).length]));
  const anz = new Map(lfs.map((n) => [n, 0]));
  if (pool.length <= max) return vorhanden;
  const gewicht = (n) => gewichte[n] ?? vorhanden.get(n);
  let rest = max;
  let offen = lfs.filter((n) => gewicht(n) > 0);
  while (rest > 0 && offen.length) {
    const summe = offen.reduce((s, n) => s + gewicht(n), 0);
    const roh = offen.map((n) => [n, (rest * gewicht(n)) / summe]);
    let vergeben = 0;
    for (const [n, r] of roh) {
      const k = Math.min(Math.floor(r), vorhanden.get(n) - anz.get(n));
      anz.set(n, anz.get(n) + k);
      vergeben += k;
    }
    let uebrig = rest - vergeben;
    roh.sort((x, y) => (y[1] - Math.floor(y[1])) - (x[1] - Math.floor(x[1])));
    for (const [n] of roh) {
      if (uebrig <= 0) break;
      if (anz.get(n) < vorhanden.get(n)) { anz.set(n, anz.get(n) + 1); uebrig--; }
    }
    rest = uebrig;
    offen = offen.filter((n) => anz.get(n) < vorhanden.get(n));
  }
  return anz;
}

/** Prüfungsfragen ziehen: Anzahl je Lernfeld nach pruefungsAnteile, innerhalb des Lernfelds zufällig. */
export function ziehePruefung(pool, max, gewichte = {}) {
  const anteile = pruefungsAnteile(pool, max, gewichte);
  return mischen([...anteile].flatMap(([n, k]) => mischen(pool.filter((q) => q.lernfeld === n)).slice(0, k)));
}

function mischenUngeordnet(n) {
  if (n < 2) return indizes(n);
  let a;
  do { a = mischen(indizes(n)); } while (a.every((v, i) => v === i));
  return a;
}

/**
 * Neuer Antwortzustand. sel verwendet immer die Original-Indizes aus questions.json,
 * ordnung ist nur die angezeigte Reihenfolge der Optionen.
 */
export function neueAntwort(q) {
  switch (q.typ) {
    case "single": return { ordnung: mischen(indizes(q.optionen.length)), sel: null };
    case "multiple": return { ordnung: mischen(indizes(q.optionen.length)), sel: [] };
    case "reihenfolge": return { sel: mischenUngeordnet(q.reihenfolge_korrekt.length), besucht: false };
    default: return { sel: "" };
  }
}

export function istBeantwortet(q, a) {
  switch (q.typ) {
    case "single": return a.sel !== null;
    case "multiple": return a.sel.length > 0;
    case "reihenfolge": return !!a.besucht;
    default: return a.sel.trim() !== "";
  }
}

/** true/false, bei Kurzantworten null (Selbstbewertung). */
export function istRichtig(q, sel) {
  const sortiert = (x) => [...x].sort((m, n) => m - n).join(",");
  switch (q.typ) {
    case "single": return sel === q.loesung;
    case "multiple": return sortiert(sel) === sortiert(q.loesung);
    case "reihenfolge": return sel.every((v, i) => v === i);
    default: return null;
  }
}

export function loesungText(q) {
  switch (q.typ) {
    case "single": return q.optionen[q.loesung];
    case "multiple": return q.loesung.map((i) => q.optionen[i]).join(" · ");
    case "reihenfolge": return q.reihenfolge_korrekt.map((t, i) => `${i + 1}. ${t}`).join("  ");
    default: return q.musterantwort;
  }
}

export function eigeneAntwortText(q, a) {
  if (!a) return "(nicht beantwortet)";
  switch (q.typ) {
    case "single": return a.sel === null ? "(nicht beantwortet)" : q.optionen[a.sel];
    case "multiple": return a.sel.length ? a.sel.map((i) => q.optionen[i]).join(" · ") : "(nicht beantwortet)";
    case "reihenfolge": return a.sel.map((i, p) => `${p + 1}. ${q.reihenfolge_korrekt[i]}`).join("  ");
    default: return a.sel.trim() || "(leer)";
  }
}

/** HTML für den Antwortbereich. aufloesen: richtig/falsch markieren. gesperrt: keine Eingabe. */
export function antwortHtml(q, a, { aufloesen = false, gesperrt = false } = {}) {
  const zu = aufloesen || gesperrt;
  if (q.typ === "single" || q.typ === "multiple") {
    const multi = q.typ === "multiple";
    const knoepfe = a.ordnung.map((oi, pos) => {
      const gewaehlt = multi ? a.sel.includes(oi) : a.sel === oi;
      const richtig = multi ? q.loesung.includes(oi) : q.loesung === oi;
      let cls = gewaehlt ? "sel" : "";
      let mk = BUCHSTABEN[pos];
      let zusatz = "";
      if (aufloesen) {
        cls = richtig ? "right" : gewaehlt ? "wrong" : "";
        if (richtig && !gewaehlt && multi) { cls += " miss"; zusatz = `<span class="sr"> (richtig, nicht gewählt)</span>`; }
        mk = richtig ? "✓" : gewaehlt ? "✕" : mk;
      }
      return `<button type="button" class="opt ${cls}" data-act="opt" data-i="${oi}" role="${multi ? "checkbox" : "radio"}" aria-checked="${gewaehlt}" ${zu ? "disabled" : ""}>` +
        `<span class="mk${multi ? " eckig" : ""}" aria-hidden="true">${mk}</span><span>${esc(q.optionen[oi])}${zusatz}</span></button>`;
    }).join("");
    return `<div class="opts" role="${multi ? "group" : "radiogroup"}" aria-label="Antworten">${knoepfe}</div>`;
  }
  if (q.typ === "reihenfolge") {
    const n = a.sel.length;
    const zeilen = a.sel.map((idx, pos) => {
      const cls = aufloesen ? (idx === pos ? "right" : "wrong") : "";
      return `<li class="ord ${cls}"><span class="mk" aria-hidden="true">${pos + 1}</span><span class="txt">${esc(q.reihenfolge_korrekt[idx])}</span>` +
        `<span class="mv"><button type="button" data-act="hoch" data-pos="${pos}" aria-label="Schritt ${pos + 1} nach oben" ${pos === 0 || zu ? "disabled" : ""}>↑</button>` +
        `<button type="button" data-act="runter" data-pos="${pos}" aria-label="Schritt ${pos + 1} nach unten" ${pos === n - 1 || zu ? "disabled" : ""}>↓</button></span></li>`;
    }).join("");
    return `<ol class="opts ord-liste">${zeilen}</ol>`;
  }
  return `<label class="sr" for="ka">Deine Antwort</label>` +
    `<textarea id="ka" placeholder="Deine Antwort in eigenen Worten" ${zu ? "disabled" : ""}>${esc(a.sel)}</textarea>`;
}

/** Eingabe verarbeiten. Gibt den Selektor des Elements zurück, das danach den Fokus bekommen soll. */
export function bearbeite(q, a, act, el) {
  if (act === "opt") {
    const i = +el.dataset.i;
    if (q.typ === "single") a.sel = i;
    else a.sel = a.sel.includes(i) ? a.sel.filter((x) => x !== i) : [...a.sel, i];
    return `[data-act="opt"][data-i="${i}"]`;
  }
  if (act === "hoch" || act === "runter") {
    const p = +el.dataset.pos;
    const z = act === "hoch" ? p - 1 : p + 1;
    if (z < 0 || z >= a.sel.length) return null;
    [a.sel[p], a.sel[z]] = [a.sel[z], a.sel[p]];
    a.besucht = true;
    return `[data-act="${act}"][data-pos="${z}"]:not([disabled]), [data-pos="${z}"]:not([disabled])`;
  }
  return null;
}
