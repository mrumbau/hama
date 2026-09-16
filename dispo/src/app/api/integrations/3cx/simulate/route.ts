import { handler, ok } from '@/server/api';
import { ingestThreeCxEvent } from '@/server/integrations/threecx';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * „3CX-Testanruf simulieren“ (Master-Prompt Abschnitt 43).
 * Erzeugt genau das Beispielgespräch aus der Spezifikation.
 */
export const POST = handler(async () => {
  // Das Beispielprojekt bevorzugen, sonst irgendein laufendes Projekt.
  const project =
    (await prisma.project.findFirst({ where: { orderNumber: 'AG-260047' } })) ??
    (await prisma.project.findFirst({
      where: { status: { notIn: ['FERTIG', 'ERLEDIGT'] } },
      orderBy: { plannedStart: 'asc' },
    }));

  const result = await ingestThreeCxEvent({
    callId: `demo-${Date.now()}`,
    occurredAt: new Date().toISOString(),
    direction: 'EINGEHEND',
    callerNumber: project?.contactPhone ?? '+49 8024 998877',
    calledNumber: '+49 89 1234567-11',
    durationSeconds: 392,
    agentName: 'Carsten Reuter',
    customerName: project?.customerName ?? 'Daniel Kufner',
    orderNumber: project?.orderNumber ?? 'AG-260047',
    summary:
      'Herr Kufner kann am Dienstag nicht. Die Arbeiten sollen nach Möglichkeit am ' +
      'Donnerstag stattfinden.',
    transcript:
      'Kufner: Guten Tag, bei uns passt der Dienstag leider doch nicht. ' +
      'Reuter: Kein Problem, wann wäre es Ihnen lieber? ' +
      'Kufner: Donnerstag wäre uns lieber, da ist meine Frau zu Hause.',
    actionItems: ['Termin auf Donnerstag verschieben'],
    isDemo: true,
  });

  return ok(
    {
      ...result,
      message: result.duplicate
        ? 'Testanruf war bereits erfasst.'
        : 'Testanruf wurde empfangen und ausgewertet.',
    },
    { status: 201 },
  );
});
