import { handler, ok, fail } from '@/server/api';
import { verlange } from '@/server/auth';
import { writeAudit } from '@/server/audit';
import { prisma } from '@/lib/db';
import { boxZugang, fehlendeBoxAngaben, legeInBoxAb } from '@/server/box';
import { dateiname, erstelleSicherung, wirktBefuellt } from '@/server/sicherung';
import { stammtVomZeitplan, ZEITPLAN_HEADER } from '@/server/zeitplan';

export const dynamic = 'force-dynamic';

/** Wo der letzte Lauf festgehalten wird – die Einstellungen zeigen ihn an. */
const SCHLUESSEL = 'letzteSicherung';

/**
 * Den aktuellen Stand herunterladen.
 *
 * Auch dann, wenn Box eingerichtet ist: Wer prüfen will, ob in der Sicherung
 * wirklich etwas drinsteht, soll sie ansehen können, ohne einen Ordner zu
 * suchen. Eine Sicherung, die niemand je geöffnet hat, ist eine Vermutung.
 */
export const GET = handler(async () => {
  await verlange('system');
  const sicherung = await erstelleSicherung();
  return new Response(JSON.stringify(sicherung, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dateiname(sicherung.stand)}"`,
    },
  });
});

/**
 * Sichern und in Box ablegen.
 *
 * Jede Nacht ruft der Zeitplan hier an. Von Hand geht es auch – über die
 * Einstellungen, damit niemand bis zur nächsten Nacht warten muss, wenn er
 * gleich etwas Großes vorhat.
 */
export const POST = handler(async (request: Request) => {
  const vomZeitplan = await stammtVomZeitplan(request.headers.get(ZEITPLAN_HEADER));
  if (!vomZeitplan) await verlange('system');

  const zugang = boxZugang();
  if (!zugang) {
    return fail(`Box ist noch nicht eingerichtet. Es fehlt: ${fehlendeBoxAngaben().join(', ')}.`, 503, {
      fehlt: fehlendeBoxAngaben(),
    });
  }

  const sicherung = await erstelleSicherung();

  // Eine leere Datei, die jede Nacht die gestrige ersetzt, ist schlimmer als
  // keine: Sie sieht aus wie eine Sicherung.
  if (!wirktBefuellt(sicherung)) {
    return fail('Die Sicherung enthält keine Stammdaten – es wurde nichts hochgeladen.', 409, {
      anzahl: sicherung.anzahl,
    });
  }

  const name = dateiname(sicherung.stand);
  const inhalt = JSON.stringify(sicherung, null, 2);
  const ablage = await legeInBoxAb(zugang, name, inhalt);

  const ergebnis = {
    stand: sicherung.stand,
    datei: ablage.name,
    dateiId: ablage.dateiId,
    neu: ablage.neu,
    bytes: Buffer.byteLength(inhalt, 'utf8'),
    anzahl: sicherung.anzahl,
    ausloeser: vomZeitplan ? 'zeitplan' : 'benutzer',
  };

  await prisma.setting.upsert({
    where: { key: SCHLUESSEL },
    update: { value: JSON.stringify(ergebnis) },
    create: { key: SCHLUESSEL, value: JSON.stringify(ergebnis) },
  });

  await writeAudit({
    entityType: 'integration',
    entityId: 'box-sicherung',
    action: 'sicherung',
    label: `Sicherung in Box abgelegt: ${ablage.name}`,
    newValue: ergebnis,
    source: 'AUTOMATISCH',
  });

  return ok(ergebnis);
});
