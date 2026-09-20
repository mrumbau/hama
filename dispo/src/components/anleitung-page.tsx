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
  CheckCircle2,
  HelpCircle,
  LayoutGrid,
  MousePointerClick,
  Palmtree,
  PlayCircle,
  MessageSquare,
  RefreshCw,
  Settings,
  Smartphone,
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
            <p>
              Ein Beispiel: Luigi in den Montag ziehen, dann seine rechte Kante bis Freitag
              aufziehen – schon steht er die ganze Woche. Du musst ihn nicht fünfmal einzeln
              hineinziehen.
            </p>
          </Abschnitt>

          <Abschnitt icon={Smartphone} titel="Am Handy">
            <p>
              Dieselbe Adresse, dasselbe Passwort – die Dispo merkt selbst, dass sie auf einem
              kleinen Bildschirm steht, und zeigt die Plantafel anders:{' '}
              <span className="font-medium text-foreground">einen Tag</span>, die Baustellen
              untereinander, darunter wer dort ist. Mit den Pfeilen links und rechts vom Datum
              blätterst du einen Tag weiter.
            </p>
            <Schritt
              was="Auf eine Zeile tippen"
              dann="öffnet den Einsatz – dort stehen Datum, Uhrzeit, Tätigkeiten und Notiz."
            />
            <Schritt
              was="„Jemanden einplanen“ unter der Baustelle"
              dann="plant direkt auf diese Baustelle und diesen Tag."
            />
            <Schritt
              was="Oben auf „Ressourcen“ wechseln"
              dann="zeigt die Leute statt der Baustellen – mit „frei“ an allen, die an diesem Tag noch nichts haben."
            />
            <p className="rounded-md bg-muted/60 p-2">
              Am Handy wird nichts gezogen. Das Verschieben über mehrere Tage braucht die ganze
              Woche nebeneinander, und die passt auf kein Telefon. Wenn du einen Einsatz verlegen
              willst: antippen und das Datum im Einsatz ändern. Dasselbe Ergebnis, ein Fingertipp
              mehr.
            </p>
            <p>
              Auf dem Bildschirm im Büro bleibt alles wie gehabt – das Raster, das Ziehen, die
              ganze Woche auf einmal. Beides ist dieselbe Dispo mit denselben Daten; wenn Gerhard
              auf der Baustelle etwas einträgt, steht es sofort auch am Rechner.
            </p>
          </Abschnitt>

          <Abschnitt icon={CheckCircle2} titel="Erst Vorschlag, dann Termin">
            <p>
              Alles, was jemand hineinzieht, ist zuerst ein{' '}
              <span className="font-medium text-foreground">Vorschlag</span> – grau, gestrichelt,
              mit den Initialen dran: „Vorschlag GP".{' '}
              <span className="font-medium text-foreground">Das gilt für alle</span>, auch für die
              Geschäftsführung. Unsere Leute sind knapp, und niemand soll still einen greifen –
              auch nicht der Chef.
            </p>
            <p>
              <span className="font-medium text-foreground">Marlon und Carsten nehmen
              Vorschläge an</span> – dann wird richtige Planung daraus. Alle offenen Vorschläge
              stehen unter „Planvorschläge", für jeden sichtbar.
            </p>
            <p>
              Und wenn der angenommene Einsatz dann{' '}
              <span className="font-medium text-foreground">bestätigt</span> wird, wird ein grünes{' '}
              <span className="font-medium text-foreground">T</span> daraus – ein fester Termin.
              Solange kein T dasteht, ist nichts zugesagt. Genau dafür ist der Buchstabe da: Man
              sieht über die ganze Tafel hinweg, was steht und was nicht.
            </p>
            <p>
              Im geöffneten Einsatz trägst du außerdem ein, was zu tun ist{' '}
              <span className="font-medium text-foreground">(Tätigkeiten)</span> und was sonst
              wichtig ist <span className="font-medium text-foreground">(Notiz)</span> – etwa
              welches Baumaterial mitkommt. Uhrzeiten nur, wenn sie zählen: Wer den ganzen Tag da
              ist, braucht keine.
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
              <span className="font-medium text-foreground">Eine rote Baustelle ist die einzige,
              die heute deine Zeit braucht.</span> Gelb heißt: nachschauen, bevor es rot wird.
              Grün und grau kannst du liegen lassen.
            </p>
            <p>
              Der <span className="font-medium text-foreground">Materialstatus</span> am Projekt
              geht direkt in die Ampel ein: Fehlt Material, wird die Baustelle gelb oder rot. Es
              lohnt sich also, ihn zu pflegen.
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
            <p className="rounded-md border border-dashed p-2">
              <span className="font-medium text-foreground">Findet die Suche nichts</span>, dann
              gibt es das Projekt in „Das Programm" noch nicht. Dann bitte{' '}
              <span className="font-medium text-foreground">zuerst dort anlegen</span>, nicht
              hier. Zehn Minuten später steht es von selbst auf der Tafel. Nur so bleiben
              Auftragsnummer, Kunde und Rechnung an einer Stelle.
            </p>
            <p>
              Klickst du ein Projekt an, öffnet sich die Baustelle mit allem:{' '}
              <span className="font-medium text-foreground">Übersicht</span> (Ampel und Eckdaten),{' '}
              <span className="font-medium text-foreground">Planung</span> (alle Einsätze),{' '}
              <span className="font-medium text-foreground">Team</span>,{' '}
              <span className="font-medium text-foreground">SUBs</span>,{' '}
              <span className="font-medium text-foreground">Kommunikation</span>,{' '}
              <span className="font-medium text-foreground">Änderungen</span> und{' '}
              <span className="font-medium text-foreground">Notizen</span>.
            </p>
            <p>
              Dort setzt du auch <span className="font-medium text-foreground">zwei
              Bauleiter</span> – einen ersten und einen zweiten, falls sich jemand vertreten lässt.
            </p>
            <p>
              <span className="font-medium text-foreground">Fertig ist erst fertig, wenn der
              Status es sagt.</span> Eine Baustelle verschwindet von der Tafel, wenn ihr Status auf
              „erledigt" steht – oder wenn sie in „Das Programm" einen Status bekommt, der nicht
              auf die Tafel gehört (Angebotserstellung, abgeschlossen). Gelöscht ist sie nie; über
              „Projekt finden" ist sie wieder da.
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
            <p>
              Bei jedem lässt sich eine <span className="font-medium text-foreground">Notiz</span>{' '}
              hinterlegen: Führerschein, Sprache, wer mit wem gut arbeitet – was immer beim Planen
              hilft und sonst nirgends steht.
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
            <p>Klickst du einen Betrieb an, stehen dort vier Dinge, die du selbst pflegst:</p>
            <p>
              <span className="font-medium text-foreground">Gewerke</span> – was der Betrieb kann.
              Danach suchst du beim Planen. Kommen aus „Das Programm", lassen sich hier aber
              ergänzen.
            </p>
            <p>
              <span className="font-medium text-foreground">Bewertung 1–5</span> – unsere eigene
              Einschätzung. Steht nirgends sonst und sieht kein Kunde. Wer gut gearbeitet hat,
              bekommt beim nächsten Mal den Zuschlag.
            </p>
            <p>
              <span className="font-medium text-foreground">Bevorzugter Partner (Stern)</span> –
              entscheidet, ob der Betrieb auf der Plantafel steht. Von dreißig braucht man beim
              Planen eine Handvoll.
            </p>
            <p>
              <span className="font-medium text-foreground">Aktiv</span> – ausgeschaltet
              verschwindet er überall. Alte Einsätze bleiben aber stehen, die Historie geht nicht
              verloren.
            </p>
            <p className="rounded-md border border-dashed p-2">
              <span className="font-medium text-foreground">Achtung:</span> Ein neuer Subunternehmer
              wird <span className="font-medium text-foreground">nicht</span> nach „Das Programm"
              übertragen – die Schnittstelle dort kann das nicht. Wer dauerhaft mit uns arbeitet,
              muss also auch in DAPO erfasst werden.
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

          <Abschnitt icon={MessageSquare} titel="Was noch kommt">
            <p>
              <span className="font-medium text-foreground">Änderungen / Kommunikation</span> ist
              heute fast leer. Dort wird später die Telefonanlage andocken und Anrufe automatisch
              der richtigen Baustelle zuordnen. Bis dahin ist da nichts zu tun.
            </p>
            <p>
              Auch die <span className="font-medium text-foreground">Auswertung</span> ist erst der
              Anfang. Was ihr dort wirklich braucht, kommt dazu – sagt es einfach.
            </p>
          </Abschnitt>

          <Abschnitt icon={Settings} titel="Einstellungen">
            <p>
              <span className="font-medium text-foreground">Gewerke und Qualifikationen</span> könnt
              ihr selbst hinzufügen und löschen – wenn etwas doppelt drinsteht oder fehlt. Ein
              Gewerk, das noch bei jemandem hinterlegt ist, lässt sich nicht löschen; die App sagt
              dann, bei wem.
            </p>
            <p>
              Den Abgleich mit „Das Programm" könnt ihr hier auch von Hand anstoßen. Nötig ist es
              nicht – er läuft alle zehn Minuten von selbst.
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

          {/*
            Der Schluss, und bewusst der auffaelligste Kasten der Seite. Eine
            Eigenentwicklung steht und faellt damit, dass die Leute sagen,
            was fehlt - sonst benutzen sie sie schweigend falsch.
          */}
          <section className="rounded-lg border-2 border-primary bg-primary/5 p-4">
            <h2 className="text-base font-bold">Das Wichtigste zum Schluss</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed">
              Diese App ist kein gekauftes Programm. Sie ist bei MR Umbau selbst entstanden,
              aufgebaut von Marlon Tschon und zugeschnitten auf genau unsere Arbeit.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Das heißt aber auch:{' '}
              <span className="font-bold">
                Sie kann nur wachsen und besser werden, wenn Kritik und Vorschläge von euch kommen.
              </span>{' '}
              Kein Hersteller merkt von allein, dass hier ein Klick fehlt oder dort etwas
              umständlich ist. Nur ihr merkt das.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Deshalb die Bitte: Wenn euch beim Arbeiten auffällt „das müsste einfacher gehen" oder
              „hier fehlt mir etwas" –{' '}
              <span className="font-bold">schreibt es sofort auf einen Zettel.</span> Nicht merken,
              aufschreiben; bis zum Feierabend ist es sonst weg.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              Und dann kommt alle{' '}
              <span className="font-bold">ein bis zwei Wochen mit dem Zettel zu Marlon.</span> Wir
              gehen das zusammen durch: was geht, was nicht, was Probleme machen würde.{' '}
              <span className="font-bold">Kein Wunsch ist zu klein.</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
