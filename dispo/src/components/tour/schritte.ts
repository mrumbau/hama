/**
 * Die Schritte der geführten Tour.
 *
 * Reihenfolge nach dem, was jemand am ersten Tag tut – nicht nach dem
 * Aufbau des Menüs. Jeder Schritt zeigt auf ein echtes Element der App und
 * erklärt es dort, wo es steht.
 *
 * Findet ein Schritt sein Element nicht – weil die Tafel leer ist oder eine
 * Gruppe zugeklappt –, wird er trotzdem gezeigt, nur in der Mitte statt am
 * Element. Ein Schritt, der stumm übersprungen wird, lässt den Betrachter
 * glauben, er habe etwas verpasst.
 */
export interface TourSchritt {
  /** Auf welcher Seite der Schritt spielt. */
  pfad: string;
  /** CSS-Auswahl des Elements, auf das gezeigt wird. Leer = Bildmitte. */
  ziel?: string;
  titel: string;
  text: string;
}

export const TOUR: TourSchritt[] = [
  {
    pfad: '/plantafel',
    titel: 'Die Plantafel',
    text: 'Hier steht, wer wann auf welcher Baustelle ist. Das ist der Kern – alles andere hängt daran. Ich gehe mit dir einmal durch.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="ansicht"]',
    titel: 'Zwei Blickrichtungen',
    text: '„Baustellen" zeigt eine Zeile je Baustelle – wer ist dort? „Ressourcen" zeigt eine Zeile je Person – wer ist noch frei? Dieselben Daten, andere Frage.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="zeitraum"]',
    titel: 'Zeitraum',
    text: 'Wochenweise blättern, mit „Heute" zurückspringen. Rechts daneben stellst du ein, wie viele Tage du siehst.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="filter"]',
    titel: 'Filter',
    text: 'Nach Bauleiter, Ampel, Mitarbeiter, Subunternehmer oder Ort einschränken. Die Zahl daneben sagt, wie viele Filter aktiv sind – damit du nicht rätselst, warum etwas fehlt.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="ablage"]',
    titel: 'Die Ablage – von hier ziehst du',
    text: 'Unten stehen Mitarbeiter, Bauleiter und Subunternehmer. Einen davon greifen und in eine Tageszelle ziehen – fertig ist der Einsatz.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Vier Gesten, mehr braucht es nicht',
    text: 'Aus der Ablage hineinziehen = einplanen. Karte anfassen = verschieben. Rechte Kante ziehen = über mehrere Tage aufziehen. Auf die Karte klicken = öffnen.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Die Ampel',
    text: 'Sie wird gerechnet, nicht eingetragen – aus Terminen, Material, Bestätigung und Konflikten. Fahr mit der Maus darauf, dann steht da, warum sie die Farbe hat.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Ganz unten: Lager, Urlaub, Krank',
    text: 'Keine Baustellen, aber die Leute sind dort belegt. Rot = krank, lila = Urlaub, blau = Lager. Person hineinziehen, Kante über die Tage aufziehen – fertig.',
  },
  {
    pfad: '/projekte',
    ziel: '[data-tour="projekt-finden"]',
    titel: 'Projekt finden',
    text: 'Sucht über alle Projekte aus „Das Programm" – auch über die, die gerade nicht auf der Tafel stehen. Erst wenn dort wirklich nichts ist, legst du eines von Hand an.',
  },
  {
    pfad: '/mitarbeiter',
    titel: 'Mitarbeiter und Bauleiter',
    text: 'Wer bei den Tätigkeiten „Bauleitung" trägt, steht in der Bauleiterliste und ist am Projekt auswählbar. „Büro" nimmt jemanden von der Plantafel.',
  },
  {
    pfad: '/subunternehmer',
    titel: 'Subunternehmer',
    text: 'Kommen aus „Das Programm". Gesperrte Betriebe erscheinen gar nicht erst. Welche auf der Plantafel stehen, entscheidest du dort unten über „Subunternehmer hinzufügen".',
  },
  {
    pfad: '/offene-punkte',
    titel: 'Offene Punkte',
    text: 'Was heute Aufmerksamkeit braucht, automatisch berechnet. Jeder sieht nur seine eigenen Baustellen – die, bei denen er als Bauleiter eingetragen ist.',
  },
  {
    pfad: '/auswertung',
    titel: 'Auswertung',
    text: 'Lagertage, Besorgungsfahrten, Krankheit und Urlaub – je Person und Monat, für jedes Jahr. Oben rechts als CSV für die Buchhaltung.',
  },
  {
    pfad: '/anleitung',
    titel: 'Das war die Runde',
    text: 'Alles zum Nachlesen steht hier auf dieser Seite. Die Tour kannst du jederzeit neu starten. Was nicht stimmt oder fehlt: bei Marlon melden.',
  },
];
