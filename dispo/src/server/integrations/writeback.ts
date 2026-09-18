/**
 * Statusänderung aus der Dispo zurück nach „Das Programm“.
 *
 * Bewusst die einzige schreibende Verbindung ins ERP. Drei Regeln halten das
 * Risiko klein:
 *
 *  1. Es wird nur der Projektstatus geschrieben, nichts sonst.
 *  2. Nur vorwärts – die Dispo kann im ERP nichts zurückdrehen.
 *  3. Ein Fehler im ERP darf die Dispo nie blockieren: gespeichert ist
 *     gespeichert, das Zurückschreiben landet notfalls nur in der Historie.
 */
import type { ProjectStatusKey } from '@/lib/labels';
import { writeAudit } from '@/server/audit';
import { getErpProvider } from './index';
import { entscheideRueckschreiben } from './mapping';

export interface RueckschreibErgebnis {
  versucht: boolean;
  erfolg: boolean;
  nachricht: string;
}

/**
 * Meldet den neuen Dispo-Status ans ERP, sofern das sinnvoll und erlaubt ist.
 * Wirft nie – das Ergebnis steht in der Rückgabe und in der Projekt-Historie.
 */
export async function meldeStatusAnErp(
  projektId: string,
  erpId: string | null,
  neuerStatus: ProjectStatusKey,
): Promise<RueckschreibErgebnis> {
  if (!erpId) {
    return { versucht: false, erfolg: false, nachricht: 'Projekt stammt nicht aus dem ERP.' };
  }

  try {
    const provider = getErpProvider();
    if (!provider.canWriteBack || !provider.setProjectStatus) {
      return {
        versucht: false,
        erfolg: false,
        nachricht: 'Zurückschreiben ist nicht eingeschaltet.',
      };
    }

    // Der aktuelle ERP-Status entscheidet, ob überhaupt geschrieben wird.
    const imErp = await provider.getProject(erpId);
    if (!imErp) {
      return {
        versucht: false,
        erfolg: false,
        nachricht: `Projekt ${erpId} ist im ERP nicht (mehr) auffindbar.`,
      };
    }

    const entscheidung = entscheideRueckschreiben(neuerStatus, imErp.status);
    if (!entscheidung.erpStatus) {
      return { versucht: false, erfolg: false, nachricht: entscheidung.grund };
    }

    await provider.setProjectStatus(erpId, entscheidung.erpStatus);

    await writeAudit({
      entityType: 'project',
      entityId: projektId,
      projectId: projektId,
      action: 'synced',
      label: 'Status an Das Programm gemeldet',
      oldValue: { status: imErp.status },
      newValue: { status: entscheidung.erpStatus },
      source: 'DAS_PROGRAMM',
      note: entscheidung.grund,
    });

    return {
      versucht: true,
      erfolg: true,
      nachricht: `Im ERP auf „${entscheidung.erpStatus}" gesetzt.`,
    };
  } catch (e) {
    const nachricht = e instanceof Error ? e.message : 'Unbekannter Fehler.';
    // Nicht werfen: der Disponent hat gespeichert, und das soll gelten.
    // Aber sichtbar bleiben muss es, sonst glaubt jemand, es sei übertragen.
    await writeAudit({
      entityType: 'project',
      entityId: projektId,
      projectId: projektId,
      action: 'updated',
      label: 'Status konnte nicht an Das Programm gemeldet werden',
      newValue: { status: neuerStatus },
      source: 'DAS_PROGRAMM',
      note: nachricht,
    }).catch(() => undefined);

    return { versucht: true, erfolg: false, nachricht };
  }
}
