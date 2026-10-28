// End-to-end smoke test in real Chromium (mobile viewport) with a mocked Supabase client.
// Usage: python3 -m http.server 8080 &  then  node tests/e2e.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require(require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright'); } })();
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8080/';
const mock = fs.readFileSync(new URL('./mock-supabase.js', import.meta.url), 'utf8');
const shots = new URL('./screenshots/', import.meta.url).pathname;
const errors = []; let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.log('  FAIL', m); } else console.log('  ok  ', m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => { localStorage.setItem('pl_supabase', JSON.stringify({ url: 'https://abc.supabase.co', key: 'x'.repeat(40) })); });
await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: mock }));
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const snap = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: shots + n + '.png' }); };
const go = async (hash) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(500); };

console.log('Onboarding');
await page.goto(BASE); await page.waitForSelector('.onboarding');
await snap('01-onboarding-name');
await page.fill('.onboarding input', 'Mayank'); await page.click('text=Continue'); await page.waitForTimeout(300);
await snap('02-onboarding-units');
await page.click('text=Continue'); await page.waitForTimeout(250); await page.click('text=Intermediate'); await page.click('text=Build muscle'); await snap('03-onboarding-level');
await page.click('text=Continue'); await page.waitForTimeout(250); await page.click('.day >> nth=1'); await page.click('.day >> nth=3'); await page.click('.day >> nth=5'); await page.click('text=Dumbbell'); await snap('04-onboarding-days');
await page.click('text=Continue'); await page.waitForTimeout(250); await page.fill('.onboarding input', '78.4'); await page.click('text=Continue'); await page.waitForTimeout(250);
await snap('05-onboarding-finish');
await page.click('text=Use editable example routines'); await page.waitForSelector('.list-row'); 
ok(page.url().includes('#/plan'), 'finished onboarding → Plan');
await snap('06-plan-routines');
ok(await page.locator('.list-row').count() >= 6, 'six example routines created');

console.log('Start & log a workout');
await page.click('[aria-label="Start Full Body (example)"]'); await page.waitForSelector('.aw-clock');
ok(page.url().includes('#/workout/active'), 'active workout open');
await snap('07-active-empty-sets');
const firstSet = page.locator('.set-row').first();
await firstSet.locator('input').nth(0).fill('60'); await firstSet.locator('input').nth(1).fill('8');
await firstSet.locator('.check-btn').click(); await page.waitForTimeout(400);
ok(await firstSet.evaluate(e => e.classList.contains('done')) || await page.locator('.set-row.done').count() === 1, 'set completes');
ok(await page.locator('.rest-dock').count() === 1, 'rest timer started');
await snap('08-active-set-done');
// blank set must refuse
await page.locator('.set-row').nth(1).locator('input').nth(1).fill('');
await page.locator('.set-row').nth(1).locator('.check-btn').click(); await page.waitForTimeout(200);
ok(await page.locator('.set-row.done').count() === 1, 'blank set is NOT completed');
// complete 2nd set properly + undo
await page.locator('.set-row').nth(1).locator('input').nth(1).fill('8'); await page.locator('.set-row').nth(1).locator('.check-btn').click(); await page.waitForTimeout(300);
await page.locator('.toast-action').last().click(); await page.waitForTimeout(300);
ok(await page.locator('.set-row.done').count() === 1, 'undo reverts completion');
await page.locator('.set-row').nth(1).locator('.check-btn').click(); await page.waitForTimeout(300);
// reload mid-workout: must survive
await page.reload(); await page.waitForSelector('.aw-clock'); 
ok(await page.locator('.set-row.done').count() === 2, 'workout survives reload (IndexedDB autosave)');
await page.click('.rest-dock >> text=Skip'); 
await page.click('text=Add set >> nth=0'); await page.waitForTimeout(200);
ok(await page.locator('.ex-card').first().locator('.set-row').count() === 4, 'add set works');
await page.click('.finish-bar >> text=Finish'); await page.waitForSelector('.bottom-sheet'); await snap('09-finish-sheet');
await page.click('text=Solid'); await page.click('text=Save workout'); await page.waitForSelector('.done-badge');
ok(page.url().includes('#/session/'), 'finished → session detail');
await snap('10-session-detail');

console.log('Other screens');
for (const [h, n, sel] of [['/home', '11-home', '.today-card'], ['/workout', '12-workout-start', '.plate-art'], ['/progress', '13-progress', '.bubble-field'], ['/profile', '14-profile', '.profile-head'], ['/exercises', '15-exercises', '.ex-list'], ['/history', '16-history', '.list-row'], ['/sync', '17-sync', '.state-card'], ['/tools/plates', '18-plates', '.sheet']]) {
  await go(h); await page.waitForSelector(sel, { timeout: 4000 }).then(() => ok(true, h + ' renders')).catch(() => ok(false, h + ' renders'));
  await snap(n);
}
await go('/exercise/6d55c51d-0bbf-5fdc-a8d9-00f5bf0e8bc2'); await snap('19-exercise-detail'); ok(await page.locator('.muscle-fig').count() === 1, 'exercise detail has muscle diagram');
await go('/routine/new'); await snap('20-routine-builder');
await go('/plan'); await page.click('[role=tab] >> text=Calendar'); await snap('21-calendar');
await page.setViewportSize({ width: 1280, height: 800 }); await go('/home'); await snap('22-desktop-home');

console.log('\nConsole/page errors:', errors.length); errors.forEach(e => console.log('  ', e));
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
await browser.close(); process.exit(failed || errors.length ? 1 : 0);
