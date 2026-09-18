/**
 * Zwei Vorschläge für denselben Mann am selben Tag.
 *
 * Das ist kein Fehler – es ist der Normalfall bei begrenzten Leuten: Zwei
 * Bauleiter planen unabhängig voneinander drei Wochen voraus und wissen
 * nichts voneinander. Blockieren wäre falsch, denn welcher der beiden gilt,
 * entscheidet sich erst bei der Freigabe.
 *
 * Also eine Information, keine Sperre: wer wen vorgeschlagen hat, für welche
 * Baustelle – damit die beiden es womöglich schon untereinander klären,
 * bevor es überhaupt auf den Tisch kommt.
 */

export interface VorschlagZeile {
  id: string;
  /** Die Person. Leer, wenn es keine feste Person ist (Platzhalter, SUB). */
  employeeId: string | null;
  ressource: string;
  projectId: string;
  projektTitel: string;
  startDate: string;
  endDate: string;
  vorgeschlagenVon: string;
}

export interface Doppelvorschlag {
  ressource: string;
  /** Die Tage, an denen sich die Vorschläge überschneiden. */
  tage: string[];
  beteiligte: {
    id: string;
    projektTitel: string;
    vorgeschlagenVon: string;
    startDate: string;
    endDate: string;
  }[];
}

/**
 * Überschneiden sich zwei Zeiträume?
 *
 * Auf Tagesebene, ohne Uhrzeiten: Wer vormittags hier und nachmittags dort
 * gebraucht wird, weiß das selbst am besten. Ein Hinweis, der auch bei
 * sauber getrennten Uhrzeiten erscheint, wird nach der dritten Woche
 * weggeklickt, ohne gelesen zu werden.
 */
function ueberschneidung(a: VorschlagZeile, b: VorschlagZeile): string[] {
  const von = a.startDate > b.startDate ? a.startDate : b.startDate;
  const bis = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (von > bis) return [];

  const tage: string[] = [];
  const zeiger = new Date(`${von}T12:00:00`);
  const ende = new Date(`${bis}T12:00:00`);
  while (zeiger <= ende) {
    tage.push(zeiger.toISOString().slice(0, 10));
    zeiger.setDate(zeiger.getDate() + 1);
  }
  return tage;
}

/**
 * Welche offenen Vorschläge greifen nach derselben Person?
 *
 * Nur Mitarbeiter: Ein Bauleiter betreut naturgemäß mehrere Baustellen, und
 * ein Subunternehmer schickt mehrere Kolonnen. Beides ist Alltag und wäre
 * als Hinweis nur Lärm.
 */
export function findeDoppelvorschlaege(zeilen: VorschlagZeile[]): Doppelvorschlag[] {
  const jePerson = new Map<string, VorschlagZeile[]>();
  for (const z of zeilen) {
    if (!z.employeeId) continue;
    const liste = jePerson.get(z.employeeId);
    if (liste) liste.push(z);
    else jePerson.set(z.employeeId, [z]);
  }

  const treffer: Doppelvorschlag[] = [];

  for (const liste of jePerson.values()) {
    if (liste.length < 2) continue;

    const beteiligt = new Map<string, VorschlagZeile>();
    const tage = new Set<string>();

    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        // Zwei Einsätze auf derselben Baustelle sind kein Streit um die
        // Person - da steht sie ohnehin, wo sie stehen soll.
        if (liste[i].projectId === liste[j].projectId) continue;
        const gemeinsam = ueberschneidung(liste[i], liste[j]);
        if (!gemeinsam.length) continue;
        beteiligt.set(liste[i].id, liste[i]);
        beteiligt.set(liste[j].id, liste[j]);
        for (const t of gemeinsam) tage.add(t);
      }
    }

    if (!beteiligt.size) continue;

    treffer.push({
      ressource: liste[0].ressource,
      tage: [...tage].sort(),
      beteiligte: [...beteiligt.values()]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((z) => ({
          id: z.id,
          projektTitel: z.projektTitel,
          vorgeschlagenVon: z.vorgeschlagenVon,
          startDate: z.startDate,
          endDate: z.endDate,
        })),
    });
  }

  return treffer.sort((a, b) => a.ressource.localeCompare(b.ressource, 'de'));
}

/** Zu welchen Vorschlägen gibt es einen zweiten? Für die Markierung in der Liste. */
export function betroffeneIds(doppelt: Doppelvorschlag[]): Set<string> {
  return new Set(doppelt.flatMap((d) => d.beteiligte.map((b) => b.id)));
}
