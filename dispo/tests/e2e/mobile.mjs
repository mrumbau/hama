/**
 * Prüft die mobile und die Tablet-Darstellung auf horizontalen Seiten-Overflow.
 *
 *   node tests/e2e/mobile.mjs [ausgabeverzeichnis]
 */
import { chromium } from 'playwright';

const BASE = process.env.DISPO_TEST_URL ?? 'http://127.0.0.1:3000';
const out = process.argv[2] ?? null;
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? undefined;

let failures = 0;
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});

for (const [name, viewport, mobile] of [
  ['handy', { width: 390, height: 844 }, true],
  ['tablet', { width: 1024, height: 768 }, false],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  for (const route of ['plantafel', 'offene-punkte', 'subunternehmer', 'kommunikation']) {
    await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    // Die Plantafel darf intern scrollen – die SEITE darf es nicht.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    console.log(`${overflow ? '✗' : '✓'} ${name}/${route}: kein Seiten-Overflow`);
    if (overflow) failures++;
    if (out) await page.screenshot({ path: `${out}/${name}-${route}.png` });
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nDarstellung in Ordnung.' : `\n${failures} Problem(e).`);
process.exit(failures === 0 ? 0 : 1);
