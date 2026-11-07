// Scroll through a page's 3D story in headless Chrome and save a frame at each step, for checking a
// story at desktop and phone sizes and for making GIFs (tools/gif.sh). Node 22+, no installs.
//   node tools/capture.mjs <url> <out-dir> [--size 1280x800] [--phone] [--frames 90] [--story "[data-story]"] [--wait 110]
//                          [--before "js to run once the page has loaded, e.g. dismissing a cookie banner"]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) { console.error('usage: capture.mjs <url> <out-dir> [--size WxH] [--phone] [--frames N] [--story SEL] [--wait MS]'); process.exit(1); }
const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const isPhone = rest.includes('--phone');
const [W, H] = (opt('--size', isPhone ? '390x844' : '1280x800')).split('x').map(Number);
const N = Number(opt('--frames', 90)), WAIT = Number(opt('--wait', 110)), SEL = opt('--story', '[data-story]');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(out, { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9347', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'story-'))}`,
  '--no-first-run', '--hide-scrollbars', '--host-resolver-rules=MAP *.googletagmanager.com 0.0.0.0', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const t = (await (await fetch('http://127.0.0.1:9347/json/list')).json()).find((x) => x.type === 'page'); if (t) ws = new WebSocket(t.webSocketDebuggerUrl); } catch {}
  if (!ws) await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: isPhone ? 2 : 1, mobile: isPhone });
await send('Page.navigate', { url });
for (let i = 0; i < 100 && (await js('document.readyState')) !== 'complete'; i++) await sleep(100);
const BEFORE = opt('--before', '');
if (BEFORE) await js(BEFORE);
await sleep(2500);   // fonts, textures, the intro swing
const range = await js(`(() => { const s = document.querySelector(${JSON.stringify(SEL)}); if (!s) return null;
  const top = s.getBoundingClientRect().top + scrollY; return [top, top + s.offsetHeight - innerHeight]; })()`);
if (!range) { console.error('no story matches', SEL); process.exit(1); }
const [y0, y1] = range;
const ready = await js(`!!document.querySelector('.is-ready, .no-gl') && (document.querySelector('.no-gl') ? 'no-gl' : 'ready')`);
for (let i = 0; i < N; i++) {
  const y = y0 + (y1 - y0) * (i / (N - 1));
  await js(`scrollTo(0, ${y})`);
  await sleep(WAIT);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  writeFileSync(join(out, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(shot.result.data, 'base64'));
}
const sideways = await js('document.documentElement.scrollWidth > innerWidth');
console.log(JSON.stringify({ url, size: `${W}x${H}`, frames: N, story: ready, sidewaysScroll: sideways }));
ws.close(); chrome.kill();
