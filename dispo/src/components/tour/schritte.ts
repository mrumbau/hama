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
    text: 'Hier steht, wer wann auf welcher Baustelle ist. Das ist der Kern – alles andere hängt daran. Ich gehe mit dir einmal durch, zwei Minuten.',
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
    titel: 'Reinziehen – und dann aufziehen',
    text: 'Luigi aus der Ablage in den Montag ziehen: Er steht am Montag. Dann die RECHTE KANTE seiner Karte packen und bis Freitag ziehen – schon steht er die ganze Woche. Du musst ihn nicht fünfmal einzeln hineinziehen.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Karte anfassen = verschieben',
    text: 'Fasst du die Karte in der Mitte an und ziehst sie weg, verschiebst du den Einsatz – auf einen anderen Tag oder eine andere Zeile. Der Mauszeiger sagt dir, was gerade passiert: Hand = verschieben, Doppelpfeil = aufziehen.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Auf die Karte klicken = öffnen',
    text: 'Ein Klick irgendwo auf die Karte öffnet den Einsatz. Dort stehen Uhrzeit, Tätigkeiten, Notiz – und der Knopf zum Bestätigen.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Erst Vorschlag, dann Termin',
    text: 'Alles, was jemand hineinzieht, ist zuerst ein VORSCHLAG – grau und gestrichelt, mit den Initialen dran („Vorschlag GP"). Das gilt für alle, auch für die Geschäftsführung: Unsere Leute sind knapp, und niemand soll still einen greifen.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Vom Vorschlag zum festen Termin',
    text: 'Marlon und Carsten nehmen Vorschläge an – dann wird richtige Planung daraus. Wer dann noch bestätigt, bekommt ein grünes T: fester Termin, mit dem Kunden abgestimmt. Solange kein T dasteht, ist nichts zugesagt.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Tätigkeiten, Notiz und Uhrzeit',
    text: 'Im geöffneten Einsatz trägst du ein, was zu tun ist, und was sonst wichtig ist – etwa welches Material mitkommt. Uhrzeiten nur, wenn sie zählen: Wer den ganzen Tag da ist, braucht keine.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Die Ampel – sie wird gerechnet',
    text: 'Rot heißt: eingreifen. Gelb: im Blick behalten. Grün: läuft. Grau: nichts zu tun. Niemand stellt sie ein – sie kommt aus Terminen, Material, Bestätigung und Konflikten. Fahr mit der Maus darauf, dann steht da, warum sie so ist. Eine rote Baustelle ist die einzige, die heute deine Zeit braucht.',
  },
  {
    pfad: '/plantafel',
    ziel: '[data-tour="tafel"]',
    titel: 'Ganz unten: Lager, Urlaub, Krank',
    text: 'Keine Baustellen, aber die Leute sind dort belegt. Rot = krank, lila = Urlaub, blau = Lager. Person hineinziehen, Kante über die Tage aufziehen – genau wie auf einer Baustelle.',
  },
  {
    pfad: '/projekte',
    ziel: '[data-tour="projekt-finden"]',
    titel: 'Projekt finden',
    text: 'Sucht über ALLE Projekte aus „Das Programm" – auch über die, die gerade nicht auf der Tafel stehen. Mit einem Klick holst du eines zurück.',
  },
  {
    pfad: '/projekte',
    ziel: '[data-tour="projekt-finden"]',
    titel: 'Nichts gefunden? Dann fehlt es in DAPO',
    text: 'Wenn die Suche leer bleibt, gibt es das Projekt in „Das Programm" noch nicht. Dann bitte ZUERST DORT anlegen – nicht hier. Zehn Minuten später ist es von selbst auf der Tafel. Nur so bleiben Auftragsnummer, Kunde und Rechnung an einer Stelle.',
  },
  {
    pfad: '/projekte',
    titel: 'Ein Projekt anklicken',
    text: 'Öffnet die Baustelle mit allem: Übersicht, Planung, Team, SUBs, Kommunikation, Änderungen, Notizen. Dort setzt du auch zwei Bauleiter – einen ersten und einen zweiten, falls sich jemand vertreten lässt.',
  },
  {
    pfad: '/projekte',
    titel: 'Materialstatus und Status',
    text: 'Der MATERIALSTATUS (offen, teilweise, vollständig) geht direkt in die Ampel – fehlt Material, wird die Baustelle gelb oder rot. Und: Eine Baustelle verschwindet erst von der Tafel, wenn ihr Status auf ERLEDIGT steht. Gelöscht ist sie nie; über „Projekt finden" ist sie wieder da.',
  },
  {
    pfad: '/mitarbeiter',
    titel: 'Mitarbeiter und Bauleiter',
    text: 'Wer bei den Tätigkeiten „Bauleitung" trägt, steht in der Bauleiterliste und ist am Projekt auswählbar. „Büro" nimmt jemanden von der Plantafel. Bei jedem lässt sich eine Notiz hinterlegen – Führerschein, Sprache, was für uns wichtig ist.',
  },
  {
    pfad: '/subunternehmer',
    titel: 'Subunternehmer anklicken',
    text: 'GEWERKE sagen, was der Betrieb kann – danach suchst du beim Planen. BEWERTUNG 1–5 ist unsere eigene Einschätzung, sie steht nirgends sonst. BEVORZUGTER PARTNER (Stern) entscheidet, ob er auf der Plantafel steht. AKTIV aus heißt: taucht nirgends mehr auf, alte Einsätze bleiben aber erhalten.',
  },
  {
    pfad: '/subunternehmer',
    titel: 'Neu anlegen',
    text: 'Geht hier – aber der Betrieb landet NICHT in „Das Programm". Das kann die Schnittstelle dort nicht. Wer dauerhaft mit uns arbeitet, muss also auch in DAPO erfasst werden.',
  },
  {
    pfad: '/planvorschlaege',
    titel: 'Planvorschläge',
    text: 'Hier stehen alle offenen Vorschläge – von jedem, für jeden sichtbar. Wer sieht, dass ein anderer denselben Monteur will, klärt das vielleicht schon vorher. Einmal die Woche geht die Leitung die Liste durch: auswählen, annehmen. Ablehnen nur mit einem Satz Begründung.',
  },
  {
    pfad: '/offene-punkte',
    titel: 'Offene Punkte',
    text: 'Was heute Aufmerksamkeit braucht, automatisch berechnet. Jeder sieht nur SEINE eigenen Baustellen – die, bei denen er als Bauleiter eingetragen ist.',
  },
  {
    pfad: '/kommunikation',
    titel: 'Änderungen und Kommunikation',
    text: 'Noch fast leer – das wird die Telefonanlage, die Anrufe automatisch der richtigen Baustelle zuordnet. Kommt später. Heute nichts, was ihr tun müsst.',
  },
  {
    pfad: '/auswertung',
    titel: 'Auswertung',
    text: 'Lagertage, Besorgungsfahrten, Krankheit und Urlaub – je Person und Monat, als CSV für die Buchhaltung. Auch das ist erst der Anfang; was ihr hier braucht, kommt dazu.',
  },
  {
    pfad: '/einstellungen',
    titel: 'Einstellungen',
    text: 'Gewerke und Qualifikationen könnt ihr selbst hinzufügen und löschen – wenn etwas doppelt drinsteht oder fehlt. Auch der Abgleich mit „Das Programm" lässt sich hier von Hand anstoßen.',
  },
  {
    pfad: '/anleitung',
    titel: 'Das Wichtigste zum Schluss',
    text: 'Diese App ist kein gekauftes Programm. Sie ist bei uns entstanden und wächst NUR, wenn ihr sagt, was fehlt. Schreibt es auf einen Zettel, sobald es euch auffällt – und kommt alle ein, zwei Wochen damit zu Marlon. Kein Wunsch ist zu klein.',
  },
];
