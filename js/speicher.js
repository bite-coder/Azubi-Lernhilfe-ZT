// Lokaler Fortschritt (localStorage) und Karteikasten

const SCHLUESSEL = "zt-lernhelfer-v2";
const TAG = 24 * 60 * 60 * 1000;

// Karteikasten: 5 Boxen. Falsch -> Box 1, sofort fällig.
// Richtig aus Box b -> Box b+1 (höchstens 5), fällig nach ABSTAENDE[b-1] Tagen.
export const ABSTAENDE = [1, 2, 4, 8, 16];
export const BOXEN = 5;

const leer = () => ({ v: 1, fragen: {}, pruefung: null, verlauf: [] });

function laden() {
  try {
    const s = JSON.parse(localStorage.getItem(SCHLUESSEL));
    if (s && s.v === 1 && s.fragen) return { ...leer(), ...s };
  } catch (e) { /* kaputter oder fehlender Speicher: neu anfangen */ }
  return leer();
}

let st = laden();

export function speichern() {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(st));
  } catch (e) {
    console.warn("Fortschritt konnte nicht gespeichert werden", e);
  }
}

export const zustand = () => st;
export const eintrag = (id) => st.fragen[id];

/** Antwort festhalten und Karteikasten fortschreiben. */
export function erfasse(id, richtig, jetzt = Date.now()) {
  const e = st.fragen[id] || (st.fragen[id] = { n: 0, r: 0 });
  e.n += 1;
  if (richtig) e.r += 1;
  e.last = richtig;
  e.t = jetzt;
  if (!richtig) {
    e.box = 1;
    e.due = jetzt;
  } else if (e.box && e.due <= jetzt) {
    // Nur fällige Karten rücken vor. Wer eine Karte vorzeitig richtig hat, ändert nichts.
    e.due = jetzt + ABSTAENDE[e.box - 1] * TAG;
    e.box = Math.min(e.box + 1, BOXEN);
  }
  speichern();
}

export function istFaellig(id, jetzt = Date.now()) {
  const e = st.fragen[id];
  return !!(e && e.box && e.due <= jetzt);
}

export const faellige = (fragen, jetzt = Date.now()) => fragen.filter((q) => istFaellig(q.id, jetzt));

export function naechsterTermin(fragen, jetzt = Date.now()) {
  let min = Infinity;
  for (const q of fragen) {
    const e = st.fragen[q.id];
    if (e && e.box && e.due > jetzt && e.due < min) min = e.due;
  }
  return min === Infinity ? null : min;
}

export function boxZaehlung(fragen) {
  const z = Array(BOXEN + 1).fill(0);
  for (const q of fragen) {
    const e = st.fragen[q.id];
    if (e && e.box) z[e.box] += 1;
  }
  return z; // z[1] .. z[5]
}

export function setzePruefung(p) {
  st.pruefung = p;
  speichern();
}

export function verlaufEintragen(eintragNeu) {
  st.verlauf = [...st.verlauf.filter((v) => v.id !== eintragNeu.id), eintragNeu].slice(-20);
  speichern();
}

export function zuruecksetzen() {
  st = leer();
  speichern();
}

/** Browser bitten, die Daten nicht automatisch zu löschen. */
export async function dauerhaftAnfragen() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch (e) { /* nicht unterstützt */ }
}
