/**
 * Browser-Rauchtest der Plantafel.
 *
 * Prüft, was sich mit API-Tests nicht abdecken lässt:
 * Drag & Drop, Undo-Toast und Kontextmenü.
 *
 *   node tests/e2e/smoke.mjs [ausgabeverzeichnis]
 *
 * Voraussetzung: Die App läuft (Standard http://127.0.0.1:3000).
 */
import { chromium } from 'playwright';

const BASE = process.env.DISPO_TEST_URL ?? 'http://127.0.0.1:3000';
const out = process.argv[2] ?? null;
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? undefined;

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}/plantafel`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const chips = page.locator('[aria-roledescription="draggable"]');
  check((await chips.count()) > 0, 'Plantafel zeigt Einsätze');

  const box = await chips.first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(2500);

  const toast = await page
    .locator('text=/wurde von .* auf .* verschoben/')
    .first()
    .textContent()
    .catch(() => null);
  check(Boolean(toast), `Verschiebe-Meldung erscheint${toast ? `: „${toast.trim()}“` : ''}`);
  if (out) await page.screenshot({ path: `${out}/dnd-toast.png` });

  const undo = page.locator('button', { hasText: 'Rückgängig' }).first();
  const undoVisible = await undo.isVisible().catch(() => false);
  check(undoVisible, 'Rückgängig-Button wird angeboten');

  if (undoVisible) {
    await undo.click();
    await page.waitForTimeout(2500);
    check(
      await page.locator('text=/rückgängig gemacht/').first().isVisible().catch(() => false),
      'Verschieben lässt sich rückgängig machen',
    );
  }

  await chips.first().click({ button: 'right' });
  await page.waitForTimeout(600);
  check(
    await page.locator('text=Als bestätigt markieren').first().isVisible().catch(() => false),
    'Kontextmenü am Einsatz',
  );
  await page.keyboard.press('Escape');

  // Alle Hauptseiten müssen fehlerfrei rendern.
  for (const route of [
    'plantafel?ansicht=ressourcen',
    'projekte',
    'mitarbeiter',
    'subunternehmer',
    'kommunikation',
    'offene-punkte',
    'einstellungen',
  ]) {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const body = await page.locator('body').textContent();
    check(!body.includes('Application error'), `Seite /${route} rendert`);
  }

  check(pageErrors.length === 0, `Keine JavaScript-Fehler${pageErrors.length ? `: ${pageErrors[0]}` : ''}`);
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nAlle Rauchtests bestanden.' : `\n${failures} Rauchtest(s) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
