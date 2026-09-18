/**
 * Demo-Daten (Master-Prompt Abschnitt 34).
 *
 * Alles, was hier angelegt wird, ist mit `isDemo: true` markiert und in der
 * Oberflaeche als "Demo" erkennbar. `pnpm db:seed` ist idempotent: bestehende
 * Demo-Daten werden vorher entfernt, echte Daten bleiben unberuehrt.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- Datums-Helfer (bewusst dupliziert: Seed laeuft ohne Next-Alias) ---
function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
function fromIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function addDays(iso: string, days: number) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}
function dbDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}
function startOfWeek(iso: string) {
  const dow = fromIso(iso).getDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

const TODAY = toIso(new Date());
const MO = startOfWeek(TODAY);
const DI = addDays(MO, 1);
const MI = addDays(MO, 2);
const DO = addDays(MO, 3);
const FR = addDays(MO, 4);
const NEXT_MO = addDays(MO, 7);
const NEXT_DI = addDays(MO, 8);
const NEXT_MI = addDays(MO, 9);

const TRADES: { name: string; color: string; sortOrder: number }[] = [
  { name: 'Elektro', color: '#f59e0b', sortOrder: 10 },
  { name: 'Sanitär', color: '#0ea5e9', sortOrder: 20 },
  { name: 'Heizung', color: '#ef4444', sortOrder: 30 },
  { name: 'Trockenbau', color: '#8b5cf6', sortOrder: 40 },
  { name: 'Maler', color: '#10b981', sortOrder: 50 },
  { name: 'Fliesen', color: '#06b6d4', sortOrder: 60 },
  { name: 'Boden', color: '#a16207', sortOrder: 70 },
  { name: 'Schreiner', color: '#b45309', sortOrder: 80 },
  { name: 'Brandschutz', color: '#dc2626', sortOrder: 90 },
  { name: 'Lüftung', color: '#38bdf8', sortOrder: 100 },
  { name: 'Gerüst', color: '#64748b', sortOrder: 110 },
  { name: 'Abbruch', color: '#78716c', sortOrder: 120 },
  { name: 'Reinigung', color: '#22c55e', sortOrder: 130 },
  { name: 'Montage', color: '#6366f1', sortOrder: 140 },
  { name: 'Bauleitung', color: '#2563eb', sortOrder: 150 },
  { name: 'Helfer', color: '#94a3b8', sortOrder: 160 },
];

async function main() {
  console.log('→ Demo-Daten werden zurückgesetzt …');

  // Nur Demo-Daten entfernen. Echte Daten bleiben unangetastet.
  await prisma.changeRequest.deleteMany({ where: { source: { in: ['SEED', 'TELEFON_3CX'] }, communication: { isDemo: true } } });
  await prisma.communication.deleteMany({ where: { isDemo: true } });
  await prisma.assignment.deleteMany({ where: { project: { isDemo: true } } });
  await prisma.projectNote.deleteMany({ where: { project: { isDemo: true } } });
  await prisma.auditLog.deleteMany({ where: { source: 'SEED' } });
  await prisma.project.deleteMany({ where: { isDemo: true } });
  await prisma.employee.deleteMany({ where: { isDemo: true } });
  await prisma.siteManager.deleteMany({ where: { isDemo: true } });
  await prisma.subcontractor.deleteMany({ where: { isDemo: true } });

  // --- Gewerke / Qualifikationen -----------------------------------------
  console.log('→ Gewerke …');
  for (const t of TRADES) {
    await prisma.trade.upsert({
      where: { name: t.name },
      update: { color: t.color, sortOrder: t.sortOrder },
      create: t,
    });
  }
  const trades = await prisma.trade.findMany();
  const trade = (name: string) => {
    const found = trades.find((t) => t.name === name);
    if (!found) throw new Error(`Gewerk fehlt: ${name}`);
    return found.id;
  };

  // --- Bauleiter ----------------------------------------------------------
  console.log('→ Bauleiter …');
  const carsten = await prisma.siteManager.create({
    data: {
      firstName: 'Carsten',
      lastName: 'Reuter',
      shortCode: 'CR',
      phone: '+49 89 1234567-11',
      email: 'c.reuter@mrumbau.example',
      color: '#2563eb',
      note: 'Schwerpunkt Landkreis München Süd.',
      isDemo: true,
    },
  });
  const marlon = await prisma.siteManager.create({
    data: {
      firstName: 'Marlon',
      lastName: 'Tschon',
      shortCode: 'MT',
      phone: '+49 89 1234567-12',
      email: 'm.tschon@mrumbau.example',
      color: '#c026d3',
      note: 'Schwerpunkt Stadtgebiet München.',
      isDemo: true,
    },
  });

  // --- Mitarbeiter --------------------------------------------------------
  console.log('→ Mitarbeiter …');
  const luigi = await prisma.employee.create({
    data: {
      firstName: 'Luigi',
      lastName: 'Curatolo',
      shortCode: 'LC',
      phone: '+49 170 1111111',
      profession: 'Trockenbau',
      weeklyHours: 40,
      driversLicense: true,
      note: 'Auch Fliesenarbeiten möglich.',
      isDemo: true,
      trades: { create: [{ tradeId: trade('Trockenbau') }, { tradeId: trade('Fliesen') }] },
    },
  });
  const max = await prisma.employee.create({
    data: {
      firstName: 'Max',
      lastName: 'Muster',
      shortCode: 'MM',
      phone: '+49 170 2222222',
      profession: 'Montage',
      weeklyHours: 40,
      driversLicense: true,
      isDemo: true,
      trades: { create: [{ tradeId: trade('Montage') }, { tradeId: trade('Schreiner') }] },
    },
  });
  const gerhard = await prisma.employee.create({
    data: {
      firstName: 'Gerhard',
      lastName: 'Beispiel',
      shortCode: 'GB',
      phone: '+49 170 3333333',
      profession: 'Maler',
      weeklyHours: 35,
      isDemo: true,
      trades: { create: [{ tradeId: trade('Maler') }, { tradeId: trade('Helfer') }] },
    },
  });

  // --- Subunternehmer -----------------------------------------------------
  console.log('→ Subunternehmer …');
  const elektroMueller = await prisma.subcontractor.create({
    data: {
      companyName: 'Elektro Müller GmbH',
      contactName: 'Stefan Müller',
      phone: '+49 89 55500-1',
      email: 'info@elektro-mueller.example',
      city: 'München',
      zip: '81675',
      preferred: true,
      rating: 5,
      crewSize: 4,
      note: 'Zwei Teams, sehr zuverlässig.',
      isDemo: true,
      trades: { create: [{ tradeId: trade('Elektro') }] },
    },
  });
  const trockenbauHuber = await prisma.subcontractor.create({
    data: {
      companyName: 'Trockenbau Huber',
      contactName: 'Josef Huber',
      phone: '+49 8104 5550-2',
      email: 'buero@trockenbau-huber.example',
      city: 'Aying',
      zip: '85653',
      preferred: true,
      rating: 4,
      crewSize: 3,
      isDemo: true,
      trades: { create: [{ tradeId: trade('Trockenbau') }] },
    },
  });
  const sanitaerMaier = await prisma.subcontractor.create({
    data: {
      companyName: 'Sanitär Maier',
      contactName: 'Anja Maier',
      phone: '+49 8104 5550-3',
      city: 'Otterfing',
      zip: '83627',
      rating: 4,
      crewSize: 2,
      isDemo: true,
      trades: { create: [{ tradeId: trade('Sanitär') }, { tradeId: trade('Heizung') }] },
    },
  });
  const malerSchmidt = await prisma.subcontractor.create({
    data: {
      companyName: 'Maler Schmidt',
      contactName: 'Peter Schmidt',
      phone: '+49 89 55500-4',
      city: 'München',
      zip: '80331',
      rating: 3,
      crewSize: 2,
      isDemo: true,
      trades: { create: [{ tradeId: trade('Maler') }] },
    },
  });

  // --- Projekte -----------------------------------------------------------
  console.log('→ Projekte …');
  const kufner = await prisma.project.create({
    data: {
      erpId: 'DP-10047',
      orderNumber: 'AG-260047',
      projectNumber: 'P-2026-047',
      customerName: 'Daniel Kufner',
      name: 'Badsanierung OG',
      street: 'Rosenstraße 12',
      zip: '83624',
      city: 'Otterfing',
      contactName: 'Daniel Kufner',
      contactPhone: '+49 8024 998877',
      contactEmail: 'd.kufner@example.com',
      primarySiteManagerId: carsten.id,
      plannedStart: dbDate(DI),
      plannedEnd: dbDate(MI),
      status: 'GEPLANT',
      priority: 'NORMAL',
      materialStatus: 'VOLLSTAENDIG',
      customerConfirmed: 'ANGEFRAGT',
      internalNotes: 'Kunde ist nur vormittags erreichbar.',
      isDemo: true,
    },
  });

  const mueller = await prisma.project.create({
    data: {
      erpId: 'DP-10051',
      orderNumber: 'AG-260051',
      projectNumber: 'P-2026-051',
      customerName: 'Müller Immobilien GmbH',
      name: 'Umbau Ladenfläche',
      street: 'Leopoldstraße 88',
      zip: '80802',
      city: 'München',
      contactName: 'Frau Berger',
      contactPhone: '+49 89 4455667',
      contactEmail: 'berger@mueller-immobilien.example',
      primarySiteManagerId: marlon.id,
      secondarySiteManagerId: carsten.id,
      plannedStart: dbDate(MO),
      plannedEnd: dbDate(FR),
      status: 'IN_AUSFUEHRUNG',
      priority: 'HOCH',
      materialStatus: 'VOLLSTAENDIG',
      customerConfirmed: 'BESTAETIGT',
      specialNotes: 'Anlieferung nur vor 09:00 Uhr möglich (Fußgängerzone).',
      isDemo: true,
    },
  });

  const schmidt = await prisma.project.create({
    data: {
      erpId: 'DP-10055',
      orderNumber: 'AG-260055',
      projectNumber: 'P-2026-055',
      customerName: 'Familie Schmidt',
      name: 'Dachgeschossausbau',
      street: 'Am Anger 4',
      zip: '85653',
      city: 'Aying',
      contactName: 'Herr Schmidt',
      contactPhone: '+49 8095 112233',
      primarySiteManagerId: carsten.id,
      plannedStart: dbDate(MO),
      plannedEnd: dbDate(NEXT_MI),
      status: 'IN_AUSFUEHRUNG',
      priority: 'NORMAL',
      materialStatus: 'TEILWEISE',
      customerConfirmed: 'BESTAETIGT',
      isDemo: true,
    },
  });

  // Rote Baustelle: beginnt morgen, niemand eingeplant, Material offen.
  const wagner = await prisma.project.create({
    data: {
      erpId: 'DP-10062',
      orderNumber: 'AG-260062',
      projectNumber: 'P-2026-062',
      customerName: 'Wagner GbR',
      name: 'Bürotrennwände',
      street: 'Industriestraße 7',
      zip: '82024',
      city: 'Taufkirchen',
      contactName: 'Herr Wagner',
      contactPhone: '+49 89 7788990',
      primarySiteManagerId: marlon.id,
      plannedStart: dbDate(addDays(TODAY, 1)),
      plannedEnd: dbDate(addDays(TODAY, 3)),
      status: 'GEPLANT',
      priority: 'HOCH',
      materialStatus: 'OFFEN',
      customerConfirmed: 'BESTAETIGT',
      internalNotes: 'Material war für KW davor avisiert – Lieferant nachfassen!',
      isDemo: true,
    },
  });

  // Graue Baustelle: noch nicht terminierbar.
  const hofer = await prisma.project.create({
    data: {
      erpId: 'DP-10070',
      orderNumber: 'AG-260070',
      projectNumber: 'P-2026-070',
      customerName: 'Hofer Bau AG',
      name: 'Sanierung Treppenhaus',
      street: 'Bahnhofplatz 2',
      zip: '83022',
      city: 'Rosenheim',
      contactName: 'Frau Hofer',
      contactPhone: '+49 8031 445566',
      status: 'TERMINIERUNG_ERFORDERLICH',
      priority: 'NIEDRIG',
      materialStatus: 'OFFEN',
      customerConfirmed: 'OFFEN',
      isDemo: true,
    },
  });

  // --- Einsaetze ----------------------------------------------------------
  console.log('→ Einsätze …');
  const assignments: {
    projectId: string;
    resourceType: 'BAULEITER' | 'MITARBEITER' | 'SUBUNTERNEHMER' | 'UNBESETZT';
    siteManagerId?: string;
    employeeId?: string;
    subcontractorId?: string;
    placeholderLabel?: string;
    startDate: string;
    endDate: string;
    startTime?: string;
    endTime?: string;
    status?: 'GEPLANT' | 'BESTAETIGT';
    kind?: string;
    tasks?: string[];
  }[] = [
    // Müller München – läuft die ganze Woche.
    // Der Bauleiter ist nicht zum Arbeiten da, sondern für Abstimmung und Abnahme.
    { projectId: mueller.id, resourceType: 'BAULEITER', siteManagerId: marlon.id, startDate: MO, endDate: MO, kind: 'BESPRECHUNG', tasks: ['Schlüsselübergabe', 'Ablauf mit Frau Berger abstimmen'] },
    { projectId: mueller.id, resourceType: 'BAULEITER', siteManagerId: marlon.id, startDate: FR, endDate: FR, kind: 'ABNAHME', tasks: ['Abnahme mit Kunde', 'Mängel aufnehmen'] },
    { projectId: mueller.id, resourceType: 'MITARBEITER', employeeId: max.id, startDate: MO, endDate: DI, startTime: '07:00', endTime: '16:00', tasks: ['Alte Ladeneinrichtung demontieren', 'Schutt in Container'] },
    { projectId: mueller.id, resourceType: 'MITARBEITER', employeeId: luigi.id, startDate: MO, endDate: MO },
    { projectId: mueller.id, resourceType: 'SUBUNTERNEHMER', subcontractorId: elektroMueller.id, startDate: MI, endDate: DO, status: 'BESTAETIGT' as const },
    { projectId: mueller.id, resourceType: 'UNBESETZT', placeholderLabel: 'Helfer für Abnahme', startDate: FR, endDate: FR },

    // Kufner Otterfing.
    { projectId: kufner.id, resourceType: 'BAULEITER', siteManagerId: carsten.id, startDate: DI, endDate: DI, kind: 'AUFMASS', tasks: ['Aufmaß Duschabtrennung'] },
    { projectId: kufner.id, resourceType: 'MITARBEITER', employeeId: luigi.id, startDate: DI, endDate: MI, startTime: '07:30', endTime: '16:30', tasks: ['Fliesen Bad OG legen', 'Silikonfugen ziehen'] },
    { projectId: kufner.id, resourceType: 'SUBUNTERNEHMER', subcontractorId: sanitaerMaier.id, startDate: MI, endDate: MI },

    // Schmidt Aying.
    { projectId: schmidt.id, resourceType: 'BAULEITER', siteManagerId: carsten.id, startDate: MI, endDate: MI, kind: 'MATERIAL_BESTELLEN', tasks: ['Dämmung nachbestellen', 'Liefertermin mit Huber klären'] },
    { projectId: schmidt.id, resourceType: 'SUBUNTERNEHMER', subcontractorId: trockenbauHuber.id, startDate: MO, endDate: DI, status: 'BESTAETIGT' as const },
    { projectId: schmidt.id, resourceType: 'MITARBEITER', employeeId: max.id, startDate: MI, endDate: FR, tasks: ['Dachschrägen beplanken', 'Dampfsperre setzen'] },
    { projectId: schmidt.id, resourceType: 'MITARBEITER', employeeId: gerhard.id, startDate: NEXT_MO, endDate: NEXT_DI },
    { projectId: schmidt.id, resourceType: 'SUBUNTERNEHMER', subcontractorId: malerSchmidt.id, startDate: NEXT_DI, endDate: NEXT_MI },

    // Bewusste Doppelbelegung eines SUB am selben Tag (erlaubt, aber Warnung).
    { projectId: kufner.id, resourceType: 'SUBUNTERNEHMER', subcontractorId: elektroMueller.id, startDate: MI, endDate: MI },
  ];

  for (const a of assignments) {
    await prisma.assignment.create({
      data: {
        ...a,
        startDate: dbDate(a.startDate),
        endDate: dbDate(a.endDate),
        kind: (a.kind ?? 'ARBEIT') as never,
        tasks: a.tasks ?? [],
        source: 'SEED',
      },
    });
  }

  // --- Projektnotizen + Historie -----------------------------------------
  console.log('→ Notizen und Historie …');
  await prisma.projectNote.createMany({
    data: [
      { projectId: kufner.id, body: 'Schlüssel liegt beim Nachbarn (Hausnummer 14).', pinned: true, source: 'SEED' },
      { projectId: mueller.id, body: 'Schlüsselübergabe Montag 06:45 vor Ort.', source: 'SEED' },
      { projectId: wagner.id, body: 'Lieferant hat Materialtermin noch nicht bestätigt.', pinned: true, source: 'SEED' },
    ],
  });

  const historie: { projectId: string; label: string; action: string; daysAgo: number; note?: string }[] = [
    { projectId: kufner.id, label: 'Auftrag erstellt', action: 'created', daysAgo: 60 },
    { projectId: kufner.id, label: 'Liefertermin bestätigt', action: 'updated', daysAgo: 30 },
    { projectId: kufner.id, label: 'Material eingetroffen', action: 'updated', daysAgo: 12, note: 'Vollständig im Lager.' },
    { projectId: kufner.id, label: 'Montage geplant', action: 'scheduled', daysAgo: 6 },
    { projectId: mueller.id, label: 'Auftrag erstellt', action: 'created', daysAgo: 90 },
    { projectId: mueller.id, label: 'Kunde bestätigt', action: 'updated', daysAgo: 20 },
    { projectId: mueller.id, label: 'Ausführung begonnen', action: 'updated', daysAgo: 1 },
    { projectId: schmidt.id, label: 'Auftrag erstellt', action: 'created', daysAgo: 45 },
    { projectId: wagner.id, label: 'Auftrag erstellt', action: 'created', daysAgo: 25 },
  ];
  for (const h of historie) {
    await prisma.auditLog.create({
      data: {
        entityType: 'project',
        entityId: h.projectId,
        projectId: h.projectId,
        action: h.action,
        label: h.label,
        source: 'SEED',
        note: h.note ?? null,
        createdAt: new Date(Date.now() - h.daysAgo * 86_400_000),
      },
    });
  }

  // --- Kommunikation + Aenderungsvorschlag (3CX-Demo) ---------------------
  console.log('→ Kommunikation …');
  const telefonat = await prisma.communication.create({
    data: {
      occurredAt: new Date(Date.now() - 3 * 3_600_000),
      direction: 'EINGEHEND',
      callerNumber: '+49 8024 998877',
      calledNumber: '+49 89 1234567-11',
      contactNumber: '0802 4998877',
      durationSeconds: 392,
      callId: `demo-${Date.now()}`,
      agentName: 'Carsten Reuter',
      customerName: 'Daniel Kufner',
      projectId: kufner.id,
      summary:
        'Herr Kufner kann am Dienstag nicht. Die Arbeiten sollen nach Möglichkeit am Donnerstag stattfinden.',
      transcript:
        'Kufner: Guten Tag Herr Reuter, bei uns passt der Dienstag leider doch nicht. ' +
        'Reuter: Kein Problem, wann wäre es Ihnen lieber? ' +
        'Kufner: Donnerstag wäre uns lieber, da ist meine Frau zu Hause.',
      aiNotes: 'Kunde bittet um Verschiebung des Montagetermins von Dienstag auf Donnerstag.',
      actionItems: ['Termin auf Donnerstag verschieben', 'Sanitär Maier neu terminieren'],
      status: 'NEU',
      source: 'TELEFON_3CX',
      isDemo: true,
    },
  });

  await prisma.changeRequest.create({
    data: {
      type: 'TERMIN_AENDERUNG',
      communicationId: telefonat.id,
      projectId: kufner.id,
      title: 'Mögliche Terminänderung erkannt',
      description:
        'Im Telefonat wurde ein anderer Wunschtermin genannt: „Donnerstag wäre uns lieber.“',
      currentValue: { plannedStart: DI, plannedEnd: MI },
      proposedValue: { plannedStart: DO, plannedEnd: FR },
      reason: 'KUNDE',
      reasonText: 'Kundenwunsch – Dienstag nicht möglich.',
      confidence: 0.86,
      status: 'OFFEN',
      source: 'TELEFON_3CX',
    },
  });

  await prisma.syncState.upsert({
    where: { provider: 'das-programm' },
    update: {},
    create: { provider: 'das-programm', status: 'NIE_GELAUFEN' },
  });

  console.log('✓ Demo-Daten angelegt.');
  console.log(`  Woche ab ${MO} · ${assignments.length} Einsätze · 5 Projekte`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
