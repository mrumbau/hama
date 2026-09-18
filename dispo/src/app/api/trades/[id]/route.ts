import { handler, ok } from '@/server/api';
import { prisma } from '@/lib/db';
import { writeAudit } from '@/server/audit';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Gewerke, die die App selbst auswertet. Wer sie loescht, nimmt der App eine
 * Regel weg: Ohne „Bauleitung" wird niemand mehr zum Bauleiter, ohne „Buero"
 * steht die Verwaltung wieder auf der Plantafel. Umbenennen darf man sie -
 * loeschen nicht.
 */
const UNVERZICHTBAR = ['bauleitung', 'büro', 'buero'];

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const trade = await prisma.trade.findUnique({
    where: { id },
    include: { _count: { select: { employees: true, subcontractors: true } } },
  });
  if (!trade) return ok({ message: 'Gewerk nicht gefunden.' }, { status: 404 });

  if (UNVERZICHTBAR.includes(trade.name.trim().toLowerCase())) {
    return ok(
      {
        message: `„${trade.name}" steuert, wie die App Personen einsortiert, und kann nicht gelöscht werden.`,
      },
      { status: 409 },
    );
  }

  /*
   * Ein benutztes Gewerk wird nicht stillschweigend aus allen Personen
   * herausgeloest. Wer es wirklich loswerden will, nimmt es dort zuerst
   * weg - dann sieht er auch, wen es betrifft.
   */
  const benutzt = trade._count.employees + trade._count.subcontractors;
  if (benutzt > 0) {
    const wer = [
      trade._count.employees ? `${trade._count.employees} Mitarbeitern` : null,
      trade._count.subcontractors ? `${trade._count.subcontractors} Subunternehmern` : null,
    ]
      .filter(Boolean)
      .join(' und ');
    return ok(
      {
        message: `„${trade.name}" ist noch bei ${wer} hinterlegt. Bitte dort zuerst entfernen.`,
        benutzt,
      },
      { status: 409 },
    );
  }

  await prisma.trade.delete({ where: { id } });
  await writeAudit({
    entityType: 'trade',
    entityId: id,
    action: 'deleted',
    label: `Gewerk gelöscht: ${trade.name}`,
  });

  return ok({ message: `Gewerk „${trade.name}" wurde gelöscht.` });
});
