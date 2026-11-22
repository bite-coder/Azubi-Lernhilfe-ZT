// Laden der Fragen aus data/questions.json (Kopie von questions.json, erzeugt von werkzeuge/fragen.py)

export const LF_TITEL = {
  1: "Arbeitsunterlagen erstellen",
  2: "Kieferbewegungen mittelwertig simulieren",
  3: "Adjustierte Schienen herstellen",
  4: "Temporäre partielle Prothesen herstellen",
  5: "Anatomische Einzelkronen gestalten",
};
export const LERNFELDER = [1, 2, 3, 4, 5];

// Zeitrichtwerte in Stunden laut KMK-Rahmenlehrplan Zahntechniker/-in (Lernfelder 1 bis 5, S. 10 bis 14).
// Die Prüfungssimulation verteilt ihre Fragen in diesem Verhältnis auf die Lernfelder.
export const ZEITRICHTWERTE = { 1: 100, 2: 80, 3: 100, 4: 60, 5: 80 };

export const TYP_LABEL = {
  single: "Einfachauswahl",
  multiple: "Mehrfachauswahl",
  kurz: "Kurzantwort",
  reihenfolge: "Reihenfolge",
};

const istText = (v) => typeof v === "string" && v.trim() !== "";
const istIndex = (v, n) => Number.isInteger(v) && v >= 0 && v < n;

// Grobe Sicherheitsprüfung. Die gründliche Prüfung macht das Skript.
function anzeigbar(q) {
  if (!q || !istText(q.id) || !istText(q.frage) || !istText(q.thema)) return false;
  if (![1, 2, 3, 4, 5].includes(q.lernfeld)) return false;
  switch (q.typ) {
    case "single":
      return Array.isArray(q.optionen) && istIndex(q.loesung, q.optionen.length);
    case "multiple":
      return Array.isArray(q.optionen) && Array.isArray(q.loesung) && q.loesung.length > 0 &&
        q.loesung.every((i) => istIndex(i, q.optionen.length));
    case "kurz":
      return istText(q.musterantwort);
    case "reihenfolge":
      return Array.isArray(q.reihenfolge_korrekt) && q.reihenfolge_korrekt.length >= 2;
    default:
      return false;
  }
}

export async function ladeFragen() {
  const antwort = await fetch("data/questions.json");
  if (!antwort.ok) throw new Error("Server antwortet mit " + antwort.status);
  const roh = await antwort.json();
  if (!Array.isArray(roh)) throw new Error("questions.json ist keine Liste");
  return roh.filter((q) => {
    const ok = anzeigbar(q);
    if (!ok) console.warn("Frage übersprungen (nicht anzeigbar):", q && q.id);
    return ok;
  });
}
