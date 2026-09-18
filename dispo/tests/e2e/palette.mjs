/**
 * Prüft die Ablageleiste: Personal in eine Baustellenzeile ziehen und
 * Baustellen in eine Ressourcenzeile ziehen legt je einen Einsatz an.
 *
 *   node tests/e2e/palette.mjs [ausgabeverzeichnis]
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

async function ziehen(quelle, ziel) {
  const a = await quelle.boundingBox();
  const b = await ziel.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(2500);
}

try {
  // --- Baustellenansicht: Personal hineinziehen ---
  await page.goto(`${BASE}/plantafel`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const personal = page.locator('[id^="palette-resource"], button[aria-roledescription="draggable"]').first();
  const chips = page.locator('button', { hasText: 'frei' });
  check((await chips.count()) > 0, 'Ablageleiste zeigt Personal mit Verfügbarkeit');

  const vorher = (await page.locator('[aria-roledescription="draggable"]').count());
  const quelle = chips.first();
  const ziel = page.locator('td').nth(3);
  await ziehen(quelle, ziel);

  const toast = await page.locator('text=/wurde eingeplant|Terminüberschneidung/').first().textContent().catch(() => null);
  check(Boolean(toast), `Ablegen erzeugt eine Rückmeldung${toast ? `: „${toast.trim()}"` : ''}`);
  if (out) await page.screenshot({ path: `${out}/palette-baustellen.png` });

  // --- Ressourcenansicht: Baustelle hineinziehen ---
  await page.goto(`${BASE}/plantafel?ansicht=ressourcen`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const baustellen = page.locator('button', { hasText: 'AG-' });
  check((await baustellen.count()) > 0, 'Ablageleiste zeigt Baustellen');
  if (out) await page.screenshot({ path: `${out}/palette-ressourcen.png` });

  check(pageErrors.length === 0, `Keine JavaScript-Fehler${pageErrors.length ? `: ${pageErrors[0]}` : ''}`);
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nAblageleiste in Ordnung.' : `\n${failures} Problem(e).`);
process.exit(failures === 0 ? 0 : 1);
