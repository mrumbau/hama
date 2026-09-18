'use client';
/**
 * Die Anleitung – für die vier Bauleiter, nicht für Entwickler.
 *
 * Bewusst eine Seite in der App und kein Dokument: Ein PDF liegt nach zwei
 * Wochen in irgendeinem Ordner, eine Seite ist immer da, wo man gerade
 * steht. Und sie veraltet nicht getrennt von der App.
 *
 * Aufgebaut nach dem, was jemand am ersten Tag wirklich tut – nicht nach
 * dem Aufbau des Menüs.
 */
import * as React from 'react';
import {
  AlertTriangle,
  CalendarRange,
  HelpCircle,
  LayoutGrid,
  MousePointerClick,
  Palmtree,
  PlayCircle,
  RefreshCw,
  Truck,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTour } from '@/components/tour/tour';

/**
 * Lesen ist das eine, einmal gezeigt bekommen das andere. Der Knopf steht
 * oben, weil er das Erste ist, was jemand am ersten Tag drueckt.
 */
function TourKnopf() {
  const { starten } = useTour();
  return (
    <Button size="sm" onClick={starten}>
      <PlayCircle /> Tour starten
    </Button>
  );
}

function Abschnitt({
  icon: Icon,
  titel,
  children,
}: {
  icon: React.ElementType;
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border">
      <h2 className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {titel}
      </h2>
      <div className="space-y-2 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** Eine Handlung und was dabei passiert. */
function Schritt({ was, dann }: { was: string; dann: string }) {
  return (
    <p>
      <span className="font-medium text-foreground">{was}</span> – {dann}
    </p>
  );
}

export function AnleitungPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Anleitung"
        description="Was die Dispo macht, was sie nicht macht, und wie man sie bedient."
        actions={<TourKnopf />}
      />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto grid max-w-3xl gap-3">
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Lieber einmal gezeigt bekommen?{' '}
            <span className="font-medium text-foreground">„Tour starten"</span> oben rechts geht die
            App Schritt für Schritt mit dir durch und zeigt dabei auf die Stellen, um die es geht.
            Dauert zwei Minuten, lässt sich jederzeit mit Escape beenden und ändert nichts an euren
            Daten.
          </p>

          <Abschnitt icon={HelpCircle} titel="Wofür ist das hier?">
            <p>
              Die Dispo beantwortet eine einzige Frage:{' '}
              <span className="font-medium text-foreground">
                Wer arbeitet wann auf welcher Baustelle?
              </span>
            </p>
            <p>
              Alles Kaufmännische bleibt in „Das Programm": Kunde, Anschrift, Auftragsnummer,
              Angebot, Rechnung. Die Dispo holt sich das von dort und rührt es nicht an. Was hier
              entsteht, ist die Planung – und die gibt es in „Das Programm" nicht.
            </p>
            <p>
              Projekte kommen alle zehn Minuten von selbst herüber. Niemand muss etwas abtippen.
            </p>
          </Abschnitt>

          <Abschnitt icon={CalendarRange} titel="Plantafel – die beiden Ansichten">
            <p>
              <span className="font-medium text-foreground">Baustellen:</span> Eine Zeile je
              Baustelle. Gut, um zu sehen, wer auf einer Baustelle ist.
            </p>
            <p>
              <span className="font-medium text-foreground">Ressourcen:</span> Eine Zeile je Person.
              Gut, um zu sehen, wer noch frei ist.
            </p>
            <p>
              Beide zeigen dieselben Daten. Oben schaltest du um, blätterst wochenweise und wählst
              den Zeitraum.
            </p>
          </Abschnitt>

          <Abschnitt icon={MousePointerClick} titel="Einplanen – die vier Gesten">
            <Schritt
              was="Aus der Leiste unten in eine Zelle ziehen"
              dann="plant eine Person oder einen Betrieb auf diesen Tag ein."
            />
            <Schritt
              was="Karte anfassen und verschieben"
              dann="verschiebt den Einsatz auf einen anderen Tag oder eine andere Zeile."
            />
            <Schritt
              was="Rechte Kante der Karte packen und ziehen"
              dann="zieht den Einsatz über mehrere Tage auf. Während des Ziehens steht darüber, bis wann."
            />
            <Schritt
              was="Auf die Karte klicken"
              dann="öffnet den Einsatz: Uhrzeit, Tätigkeiten, Notiz, bestätigen, löschen."
            />
            <p className="rounded-md bg-muted/60 p-2">
              Verschieben und Aufziehen sind zwei verschiedene Sachen. Der Mauszeiger sagt dir,
              welche: <span className="font-medium text-foreground">Hand</span> = verschieben,{' '}
              <span className="font-medium text-foreground">Doppelpfeil</span> = aufziehen.
            </p>
          </Abschnitt>

          <Abschnitt icon={AlertTriangle} titel="Die Ampel">
            <p>
              Sie wird nicht eingetragen, sondern gerechnet – aus Terminen, Material, Bestätigung
              und Konflikten. Fahr mit der Maus darauf, dann steht da, warum sie die Farbe hat.
            </p>
            <p className="flex flex-wrap items-center gap-1.5">
              <Badge variant="rot">Rot</Badge> Eingreifen nötig
              <Badge variant="gelb">Gelb</Badge> im Blick behalten
              <Badge variant="gruen">Grün</Badge> läuft
              <Badge variant="grau">Grau</Badge> nichts zu tun
            </p>
            <p>
              Ein <span className="font-medium text-foreground">T</span> auf einer Karte heißt:
              Termin bestätigt, mit dem Kunden abgestimmt. „vorl." heißt: nur geplant.
            </p>
          </Abschnitt>

          <Abschnitt icon={Palmtree} titel="Lager, Urlaub, Krank, Besorgungsfahrten">
            <p>
              Ganz unten auf der Tafel stehen vier feste Zeilen. Sie sind keine Baustellen, aber die
              Leute sind dort belegt – und genau das muss man sehen.
            </p>
            <p>
              <span className="font-medium text-ampel-rot">Krank / Abwesend</span> (rot) und{' '}
              <span className="font-medium" style={{ color: '#7c3aed' }}>
                Urlaub
              </span>{' '}
              (lila): Person hineinziehen, rechte Kante über die Tage aufziehen. Fertig. Wer dort
              steht, wird beim Doppelbelegen angemeckert wie auf einer Baustelle.
            </p>
            <p>
              <span className="font-medium" style={{ color: '#2563eb' }}>
                Lager
              </span>{' '}
              (blau): interner Arbeitsort.
            </p>
            <p>
              <span className="font-medium" style={{ color: '#2563eb' }}>
                Besorgungsfahrten
              </span>
              : In der Ressourcenansicht eine eigene Zeile. Auf einer Baustelle wählst du statt
              dessen die Einsatzart „Besorgungsfahrt" – eine Besorgung geht ja immer für eine
              Baustelle.
            </p>
            <p>
              Unter <span className="font-medium text-foreground">Auswertung</span> steht, wie viele
              Tage das je Person und Monat waren.
            </p>
          </Abschnitt>

          <Abschnitt icon={LayoutGrid} titel="Projekte">
            <p>
              <span className="font-medium text-foreground">Projekt finden</span> sucht über alle
              Projekte aus „Das Programm" – auch über die, die gerade nicht auf der Tafel stehen.
              Mit einem Klick holst du eines zurück auf die Tafel.
            </p>
            <p>
              Erst wenn dort wirklich nichts ist – etwa ein kleiner Auftrag für einen Tag, den es in
              „Das Programm" gar nicht gibt – legst du eines von Hand an. Solche Projekte überleben
              jeden Abgleich; sie gehen nicht verloren.
            </p>
            <p>
              Eine Baustelle verschwindet von der Tafel, wenn sie in „Das Programm" einen Status
              bekommt, der nicht dorthin gehört (Angebotserstellung, abgeschlossen). Sie ist nicht
              gelöscht – über „Projekt finden" ist sie wieder da.
            </p>
          </Abschnitt>

          <Abschnitt icon={Users} titel="Mitarbeiter und Bauleiter">
            <p>
              Wer bei den Tätigkeiten{' '}
              <span className="font-medium text-foreground">„Bauleitung"</span> angekreuzt hat,
              steht in der Bauleiterliste und ist am Projekt auswählbar – und dann nicht mehr bei
              den Mitarbeitern. Über den Schalter „Bauleiter mit anzeigen" holst du ihn zurück,
              falls du das Häkchen wieder entfernen willst.
            </p>
            <p>
              <span className="font-medium text-foreground">„Büro"</span> nimmt jemanden von der
              Plantafel – Verwaltung wird nicht disponiert.
            </p>
          </Abschnitt>

          <Abschnitt icon={Truck} titel="Subunternehmer">
            <p>
              Von dreißig Betrieben braucht man beim Planen eine Handvoll. In der Ressourcenansicht
              holst du sie dir unten über{' '}
              <span className="font-medium text-foreground">„Subunternehmer hinzufügen"</span> auf
              die Tafel und nimmst sie mit dem{' '}
              <span className="font-medium text-foreground">×</span> wieder herunter. Wer schon
              eingeplant ist, bleibt stehen.
            </p>
            <p>Betriebe, die in „Das Programm" gesperrt sind, kommen gar nicht erst herein.</p>
            <p>
              <span className="font-medium text-foreground">Achtung:</span> Ein neuer Subunternehmer
              wird <span className="font-medium text-foreground">nicht</span> nach „Das Programm"
              übertragen – die Schnittstelle dort kann das nicht. Er muss dort von Hand erfasst
              werden.
            </p>
          </Abschnitt>

          <Abschnitt icon={AlertTriangle} titel="Offene Punkte">
            <p>
              Was heute Aufmerksamkeit braucht, automatisch berechnet.{' '}
              <span className="font-medium text-foreground">
                Jeder sieht nur seine eigenen Baustellen
              </span>{' '}
              – also die, bei denen er als Bauleiter eingetragen ist.
            </p>
            <p>Abgehakte Punkte bleiben abgehakt, bis jemand sie wieder öffnet.</p>
          </Abschnitt>

          <Abschnitt icon={RefreshCw} titel="Was die Dispo nie von allein tut">
            <p>
              Sie löscht nichts. Weder Projekte noch Einsätze noch Personen – das macht immer ein
              Mensch.
            </p>
            <p>
              Sie überschreibt nicht, was du von Hand geändert hast. Korrigierst du einen
              Firmennamen, bleibt deine Schreibweise stehen, auch nach dem nächsten Abgleich.
            </p>
            <p>
              Sie ändert nichts in „Das Programm" außer dem Projektstatus – und den nur vorwärts.
            </p>
          </Abschnitt>

          <Abschnitt icon={HelpCircle} titel="Wenn etwas nicht stimmt">
            <p>
              Erst <span className="font-medium text-foreground">Strg + Umschalt + R</span> – das
              lädt die Seite wirklich neu. Überraschend oft ist es das.
            </p>
            <p>
              Fehlt eine Baustelle, schau in „Das Programm" nach ihrem Status. Steht sie dort auf
              Angebotserstellung oder abgeschlossen, gehört sie nach unseren eigenen Regeln nicht
              auf die Tafel.
            </p>
            <p>Alles andere: Marlon Bescheid geben.</p>
          </Abschnitt>
        </div>
      </div>
    </div>
  );
}
