import { describe, expect, it } from 'vitest';
import {
  entscheideStatus,
  istSubunternehmer,
  kuerzel,
  leseAnsprechpartner,
  leseGewerke,
} from '@/server/integrations/mapping';

describe('Projektstatus aus dem ERP', () => {
  it('übernimmt einen Abschluss immer', () => {
    // Der Fall, den der Disponent erwartet: im ERP geschlossen -> auch hier zu.
    expect(entscheideStatus('closed', 'IN_AUSFUEHRUNG').neuerStatus).toBe('ERLEDIGT');
    expect(entscheideStatus('invoice', 'GEPLANT').neuerStatus).toBe('FERTIG');
    expect(entscheideStatus('lost', 'GEPLANT').neuerStatus).toBe('ERLEDIGT');
  });

  it('dreht eine laufende Planung NICHT zurück', () => {
    // Ohne diese Regel springt eine laufende Baustelle auf „Terminierung
    // erforderlich", nur weil im ERP jemand gespeichert hat.
    const e = entscheideStatus('active', 'IN_AUSFUEHRUNG');
    expect(e.neuerStatus).toBeNull();
    expect(e.grund).toMatch(/weiter fortgeschritten/);

    expect(entscheideStatus('won', 'BESTAETIGT').neuerStatus).toBeNull();
    expect(entscheideStatus('active', 'WARTEN_AUF_MATERIAL').neuerStatus).toBeNull();
  });

  it('übernimmt den ERP-Status, solange die Dispo noch nichts entschieden hat', () => {
    expect(entscheideStatus('won', 'NEU').neuerStatus).toBe('TERMINIERUNG_ERFORDERLICH');
    expect(entscheideStatus('quotation', 'TERMINIERUNG_ERFORDERLICH').neuerStatus).toBe('NEU');
  });

  it('lässt laufende Ausführung im ERP bewusst in Ruhe', () => {
    // order_fulfillment sagt nichts darüber, wie weit die Baustelle ist.
    expect(entscheideStatus('order_fulfillment', 'GEPLANT').neuerStatus).toBeNull();
  });

  it('ändert nichts bei unbekanntem oder fehlendem Status', () => {
    expect(entscheideStatus(null, 'GEPLANT').neuerStatus).toBeNull();
    const e = entscheideStatus('irgendwas', 'GEPLANT');
    expect(e.neuerStatus).toBeNull();
    expect(e.grund).toMatch(/Unbekannter ERP-Status/);
  });

  it('meldet keine Änderung, wenn der Status schon stimmt', () => {
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
