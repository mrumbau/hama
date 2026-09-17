import { describe, expect, it } from 'vitest';
import {
  entscheideRueckschreiben,
  entscheideStatus,
  gehoertAufDieTafel,
  istGesperrt,
  istSubunternehmer,
  kuerzel,
  leseAnsprechpartner,
  leseGewerke,
} from '@/server/integrations/mapping';

describe('Projektstatus aus dem ERP', () => {
  it('nimmt eine Baustelle von der Tafel, sobald das ERP sie abschliesst', () => {
    // Der Fall, den der Disponent erwartet: im ERP zu -> auch hier weg.
    expect(entscheideStatus('closed', 'IN_AUSFUEHRUNG').neuerStatus).toBe('ERLEDIGT');
    expect(entscheideStatus('invoice', 'GEPLANT').neuerStatus).toBe('ERLEDIGT');
    expect(entscheideStatus('lost', 'GEPLANT').neuerStatus).toBe('ERLEDIGT');
  });

  it('dreht eine laufende Planung NICHT zurück', () => {
    // Ohne diese Regel springt eine laufende Baustelle auf „Terminierung
    // erforderlich", nur weil im ERP jemand gespeichert hat.
    const e = entscheideStatus('won', 'IN_AUSFUEHRUNG');
    expect(e.neuerStatus).toBeNull();
    expect(e.grund).toMatch(/weiter fortgeschritten/);

    expect(entscheideStatus('won', 'BESTAETIGT').neuerStatus).toBeNull();
    expect(entscheideStatus('order_fulfillment', 'WARTEN_AUF_MATERIAL').neuerStatus).toBeNull();
  });

  it('übernimmt den ERP-Status, solange die Dispo noch nichts entschieden hat', () => {
    expect(entscheideStatus('won', 'NEU').neuerStatus).toBe('TERMINIERUNG_ERFORDERLICH');
    expect(entscheideStatus('order_fulfillment', 'NEU').neuerStatus).toBe('IN_AUSFUEHRUNG');
  });

  it('nimmt auch Angebote und Altbestand von der Tafel', () => {
    // Genau die Zeilen, die beim ersten echten Abgleich gestört haben.
    expect(entscheideStatus('quotation', 'TERMINIERUNG_ERFORDERLICH').neuerStatus).toBe('ERLEDIGT');
    expect(entscheideStatus('active', 'TERMINIERUNG_ERFORDERLICH').neuerStatus).toBe('ERLEDIGT');
  });

  it('ändert nichts ohne Status und nimmt Unbekanntes von der Tafel', () => {
    expect(entscheideStatus(null, 'GEPLANT').neuerStatus).toBeNull();
    // Ein unbekannter Status ist kein Grund, eine Baustelle zu zeigen.
    expect(entscheideStatus('irgendwas', 'GEPLANT').neuerStatus).toBe('ERLEDIGT');
  });

  it('meldet keine Änderung, wenn die Baustelle schon weg ist', () => {
    expect(entscheideStatus('closed', 'ERLEDIGT').neuerStatus).toBeNull();
  });
});

describe('Subunternehmer unter den Lieferanten erkennen', () => {
  it('erkennt die gängigen Schreibweisen', () => {
    for (const comment of [
      'Lieferant seit: 12.01.2025 | Sub | AP bei: Stefan Müller',
      'Subunternehmer\nTätigkeit: Trockenbau',
      'Nachunternehmer',
      'SUB, Elektro',
    ]) {
      expect(istSubunternehmer({ comment, name: 'Firma' })).toBe(true);
    }
  });

  it('hält reine Materiallieferanten heraus', () => {
    expect(
      istSubunternehmer({
        comment: 'Lieferant seit: 04.11.2024\nTätigkeit: Holz- und Plattenwerkstoffe',
        name: 'Pfleiderer Deutschland GmbH',
      }),
    ).toBe(false);
  });

  it('lässt sich von „Substrat" nicht täuschen', () => {
    // Der Grund für die Wortgrenze im Muster.
    expect(
      istSubunternehmer({ comment: 'Tätigkeit: Substrat und Pflanzen', name: 'Garten Grün GmbH' }),
    ).toBe(false);
    expect(istSubunternehmer({ comment: 'Substanzprüfung', name: 'Labor' })).toBe(false);
  });

  it('kommt ohne Kommentar zurecht', () => {
    expect(istSubunternehmer({ comment: null, name: 'Irgendwer GmbH' })).toBe(false);
  });
});

describe('Gewerk und Ansprechpartner aus dem Kommentarfeld', () => {
  it('liest ein einzelnes Gewerk', () => {
    expect(leseGewerke('Sub\nTätigkeit: Elektro')).toEqual(['Elektro']);
  });

  it('trennt mehrere Gewerke', () => {
    expect(leseGewerke('Tätigkeit: Sanitär, Heizung')).toEqual(['Sanitär', 'Heizung']);
    expect(leseGewerke('Tätigkeit: Trockenbau und Akustikdecken')).toEqual([
      'Trockenbau',
      'Akustikdecken',
    ]);
  });

  it('stoppt am Trennzeichen der Vorspalte', () => {
    expect(leseGewerke('Lieferant seit: 01.01.2025 | Status: Ungeprüft')).toEqual([]);
  });

  it('liest den Ansprechpartner', () => {
    expect(leseAnsprechpartner('Sub | AP bei: Stefan Müller\nTätigkeit: Elektro')).toBe(
      'Stefan Müller',
    );
    expect(leseAnsprechpartner('Lieferant seit: 01.01.2025')).toBeNull();
  });
});

describe('Kürzel', () => {
  it('bildet Initialen', () => {
    expect(kuerzel('Carsten', 'Reuter')).toBe('CR');
    expect(kuerzel('Luigi', 'Curatolo')).toBe('LC');
  });

  it('bleibt bei leeren Namen brauchbar', () => {
    expect(kuerzel('', '')).toBe('XX');
  });
});

describe('Rückschreiben in Das Programm', () => {
  it('meldet eine erledigte Baustelle als abgeschlossen', () => {
    const e = entscheideRueckschreiben('ERLEDIGT', 'order_fulfillment');
    expect(e.erpStatus).toBe('closed');
  });

  it('meldet den Beginn der Ausführung', () => {
    expect(entscheideRueckschreiben('IN_AUSFUEHRUNG', 'won').erpStatus).toBe('order_fulfillment');
  });

  it('dreht das ERP niemals zurück', () => {
    // Im ERP ist bereits eine Rechnung geschrieben. Wenn jemand in der Dispo
    // den Status auf „in Ausführung" zurücksetzt, darf das dort nichts ändern.
    const e = entscheideRueckschreiben('IN_AUSFUEHRUNG', 'invoice');
    expect(e.erpStatus).toBeNull();
    expect(e.grund).toContain('nicht zurückgesetzt');
  });

  it('fasst ein bereits abgeschlossenes Projekt nicht an', () => {
    expect(entscheideRueckschreiben('ERLEDIGT', 'closed').erpStatus).toBeNull();
  });

  it('lässt verlorene Aufträge in Ruhe', () => {
    expect(entscheideRueckschreiben('ERLEDIGT', 'lost').erpStatus).toBeNull();
  });

  it('schreibt reine Planungszustände nicht ins ERP', () => {
    // „Warten auf Material" ist eine Dispo-Angelegenheit und geht das
    // kaufmännische System nichts an.
    expect(
      entscheideRueckschreiben('WARTEN_AUF_MATERIAL', 'order_fulfillment').erpStatus,
    ).toBeNull();
    expect(entscheideRueckschreiben('GEPLANT', 'won').erpStatus).toBeNull();
  });

  it('überschreibt keinen unbekannten ERP-Status', () => {
    const e = entscheideRueckschreiben('ERLEDIGT', 'irgendwas_neues');
    expect(e.erpStatus).toBeNull();
    expect(e.grund).toContain('unbekannt');
  });
});

describe('Nur Beauftragtes auf die Plantafel', () => {
  it('zeigt beauftragt und Auftragserfüllung', () => {
    expect(gehoertAufDieTafel('won')).toBe(true);
    expect(gehoertAufDieTafel('order_fulfillment')).toBe(true);
  });

  it('zeigt nichts aus dem Vertrieb und nichts aus der Buchhaltung', () => {
    for (const s of [
      'new',
      'quotation',
      'sales',
      'lost',
      'invoice',
      'waiting_for_payment',
      'closed',
    ]) {
      expect(gehoertAufDieTafel(s)).toBe(false);
    }
  });

  it('zeigt einen unbekannten Status nicht', () => {
    // „active" ist Altbestand und steckt bei MR Umbau in acht Projekten, die
    // nie zu einem Auftrag geworden sind. Ein neuer Status im ERP soll die
    // Tafel nicht von selbst fluten.
    expect(gehoertAufDieTafel('active')).toBe(false);
    expect(gehoertAufDieTafel('irgendwas_neues')).toBe(false);
    expect(gehoertAufDieTafel(null)).toBe(false);
  });

  it('nimmt eine Baustelle von der Tafel, sobald sie abgerechnet ist', () => {
    const e = entscheideStatus('invoice', 'IN_AUSFUEHRUNG');
    expect(e.neuerStatus).toBe('ERLEDIGT');
    expect(e.grund).toContain('Rechnung');
  });

  it('dreht eine laufende Planung nicht zurück', () => {
    expect(entscheideStatus('won', 'IN_AUSFUEHRUNG').neuerStatus).toBeNull();
  });
});

describe('Gesperrte Subunternehmer', () => {
  it('erkennt die Sperre, auch wenn darunter noch „Sub aktiv" steht', () => {
    // Genau so steht es bei AH Group Andreas Hertwig im ERP.
    const kommentar =
      'GESPERRT  LaberRababer Nichts dahinter ausser Aufwand\nSubunternehmer , Abriss, Sub\nTätigkeit: Subunternehmer – Abbruch und Demontage\nSub aktiv';
    expect(istGesperrt(kommentar)).toBe(true);
    // Als Subunternehmer erkannt wird er trotzdem – die Sperre entscheidet
    // erst danach, ob er auf die Tafel darf.
    expect(istSubunternehmer({ comment: kommentar, name: 'AH Group' })).toBe(true);
  });

  it('lässt aktive Subunternehmer in Ruhe', () => {
    expect(
      istGesperrt('Lieferant seit: 29.05.2024\nTätigkeit: Subunternehmer – Bau\nSub aktiv'),
    ).toBe(false);
  });
});

describe('Gewerke ohne das Wort Subunternehmer', () => {
  it('schneidet die Kennzeichnung ab und behält das Gewerk', () => {
    expect(leseGewerke('Tätigkeit: Subunternehmer – Trockenbau und Innenausbau')).toEqual([
      'Trockenbau',
      'Innenausbau',
    ]);
    expect(leseGewerke('Tätigkeit: Subunternehmer – Abbruch und Demontage')).toEqual([
      'Abbruch',
      'Demontage',
    ]);
  });

  it('kommt auch ohne Kennzeichnung zurecht', () => {
    expect(leseGewerke('Tätigkeit: Sanitär, Heizung')).toEqual(['Sanitär', 'Heizung']);
  });

  it('liefert kein Gewerk, das nur „Subunternehmer" heißt', () => {
    expect(leseGewerke('Tätigkeit: Subunternehmer')).toEqual([]);
  });
});

describe('Gewerke ohne hängenden Bindestrich', () => {
  it('macht aus „Bau- und Renovierungsarbeiten" zwei saubere Gewerke', () => {
    expect(leseGewerke('Tätigkeit: Subunternehmer – Bau- und Renovierungsarbeiten')).toEqual([
      'Bau',
      'Renovierungsarbeiten',
    ]);
  });

  it('räumt auch ohne SUB-Kennzeichnung auf', () => {
    expect(leseGewerke('Tätigkeit: Putz- und Malerarbeiten')).toEqual(['Putz', 'Malerarbeiten']);
  });
});
