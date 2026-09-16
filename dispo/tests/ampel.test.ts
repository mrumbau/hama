import { describe, expect, it } from 'vitest';
import { computeAmpel, type AmpelInput } from '@/server/ampel';
import type { AssignmentDTO } from '@/lib/types';

const HEUTE = '2026-09-16';

function assignment(partial: Partial<AssignmentDTO> = {}): AssignmentDTO {
  return {
    id: 'a1',
    projectId: 'p1',
    resourceType: 'MITARBEITER',
    resourceLabel: 'Luigi Curatolo',
    resourceShort: 'LC',
    resourceKey: 'MITARBEITER:e1',
    employeeId: 'e1',
    siteManagerId: null,
    subcontractorId: null,
    placeholderLabel: null,
    startDate: '2026-09-16',
    endDate: '2026-09-16',
    startTime: null,
    endTime: null,
    note: null,
    status: 'BESTAETIGT',
    source: 'MANUELL',
    color: '#000',
    ...partial,
  };
}

function base(partial: Partial<AmpelInput> = {}): AmpelInput {
  return {
    status: 'GEPLANT',
    plannedStart: '2026-09-20',
    plannedEnd: '2026-09-22',
    materialStatus: 'VOLLSTAENDIG',
    customerConfirmed: 'BESTAETIGT',
    primarySiteManagerId: 'm1',
    assignments: [assignment({ startDate: '2026-09-20', endDate: '2026-09-22' })],
    hasStaffConflict: false,
    hasSubDoubleBooking: false,
    openChangeRequests: 0,
    ...partial,
  };
}

describe('Ampelsystem', () => {
  it('ist grün, wenn alles vollständig geplant ist', () => {
    expect(computeAmpel(base(), HEUTE).light).toBe('GRUEN');
  });

  it('ist grau ohne geplanten Beginn', () => {
    const result = computeAmpel(base({ plannedStart: null }), HEUTE);
    expect(result.light).toBe('GRAU');
    expect(result.reasons[0]).toMatch(/Kein geplanter Beginn/);
  });

  it('ist gelb, wenn der Kunde noch nicht bestätigt hat', () => {
    const result = computeAmpel(base({ customerConfirmed: 'ANGEFRAGT' }), HEUTE);
    expect(result.light).toBe('GELB');
    expect(result.reasons.join(' ')).toMatch(/nicht bestätigt/);
  });

  it('ist rot, wenn die Baustelle morgen beginnt und niemand eingeplant ist', () => {
    const result = computeAmpel(
      base({ plannedStart: '2026-09-17', plannedEnd: '2026-09-18', assignments: [] }),
      HEUTE,
    );
    expect(result.light).toBe('ROT');
    expect(result.reasons.join(' ')).toMatch(/kein Mitarbeiter/);
  });

  it('ist rot bei fehlendem Material kurz vor Beginn', () => {
    const result = computeAmpel(
      base({ plannedStart: '2026-09-17', plannedEnd: '2026-09-18', materialStatus: 'OFFEN' }),
      HEUTE,
    );
    expect(result.light).toBe('ROT');
    expect(result.reasons.join(' ')).toMatch(/Material fehlt/);
  });

  it('ist rot bei Personalkonflikt', () => {
    expect(computeAmpel(base({ hasStaffConflict: true }), HEUTE).light).toBe('ROT');
  });

  it('ist nur gelb, wenn lediglich ein SUB doppelt geplant ist', () => {
    // Ein SUB darf mehrere Teams haben – das ist erlaubt, aber sichtbar.
    const result = computeAmpel(base({ hasSubDoubleBooking: true }), HEUTE);
    expect(result.light).toBe('GELB');
    expect(result.reasons.join(' ')).toMatch(/mehreren Baustellen/);
  });

  it('ist rot bei ungeklärter Terminänderung aus einem Telefonat', () => {
    const result = computeAmpel(base({ openChangeRequests: 1 }), HEUTE);
    expect(result.light).toBe('ROT');
    expect(result.reasons.join(' ')).toMatch(/ungeklärte Terminänderung/);
  });

  it('ist rot, wenn Einsätze außerhalb des Planzeitraums liegen', () => {
    const result = computeAmpel(
      base({ assignments: [assignment({ startDate: '2026-09-25', endDate: '2026-09-25' })] }),
      HEUTE,
    );
    expect(result.light).toBe('ROT');
    expect(result.reasons.join(' ')).toMatch(/außerhalb/);
  });

  it('ist rot, wenn die Baustelle über das geplante Ende hinaus läuft', () => {
    const result = computeAmpel(
      base({
        status: 'IN_AUSFUEHRUNG',
        plannedStart: '2026-09-10',
        plannedEnd: '2026-09-12',
        assignments: [assignment({ startDate: '2026-09-10', endDate: '2026-09-12' })],
      }),
      HEUTE,
    );
    expect(result.light).toBe('ROT');
    expect(result.reasons.join(' ')).toMatch(/über das geplante Ende/);
  });

  it('macht abgeschlossene Projekte nie rot', () => {
    const result = computeAmpel(
      base({ status: 'ERLEDIGT', assignments: [], materialStatus: 'OFFEN' }),
      HEUTE,
    );
    expect(result.light).toBe('GRUEN');
  });
});
