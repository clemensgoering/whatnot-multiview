/*
 * Generates the documentation screenshots and the application icon.
 *
 * The screenshots show the real interface, but the tiles are filled with a local
 * demo page instead of live Whatnot streams. That keeps third-party content and
 * any account details out of the public repository.
 *
 *   npm run assets
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'images');
const BUILD = path.join(ROOT, 'build');
const WIDTH = 1500;
const HEIGHT = 900;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const DEMOS = [
  { seller: 'vintage-cams', lot: 'LOT 04', price: '$24', v: '312', a: '#6d8bff', b: '#2b2f6d' },
  { seller: 'card-vault', lot: 'LOT 11', price: '$155', v: '1.2k', a: '#ff8a5b', b: '#6d2f1f' },
  { seller: 'sneaker-lab', lot: 'LOT 02', price: '$78', v: '640', a: '#3ecf9a', b: '#14503c' },
  { seller: 'retro-toys', lot: 'LOT 09', price: '$41', v: '205', a: '#c77dff', b: '#3f2060' },
];

function startServer() {
  const page = fs.readFileSync(path.join(__dirname, 'demo-stream.html'));
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(page);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function shoot(win, name, rect) {
  let image = await win.webContents.capturePage();
  if (rect) image = image.crop(rect);
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, image.toPNG());
  const size = image.getSize();
  console.log('  ' + name + '.png  ' + size.width + 'x' + size.height);
}

/** Minimal ICO writer: the Vista format simply embeds PNG frames. */
function writeIco(pngBuffers, file) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;
  pngBuffers.forEach(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  });

  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.data)]));
}

const ICON_HTML = `
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:512px;height:512px;background:transparent}
  .c{width:512px;height:512px;border-radius:112px;background:linear-gradient(150deg,#1d2430,#0c0f14);
     display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 8px #2b3543}
  .g{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:26px;width:280px;height:280px}
  .t{border-radius:22px;background:#39445a}
  .t.on{background:#ffb020;box-shadow:0 0 46px rgba(255,176,32,.55)}
</style></head><body>
  <div class="c"><div class="g">
    <div class="t on"></div><div class="t"></div><div class="t"></div><div class="t"></div>
  </div></div>
</body></html>`;

async function makeIcon() {
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(ICON_HTML));
  await wait(600);
  const full = await win.webContents.capturePage();

  fs.writeFileSync(path.join(BUILD, 'icon.png'), full.toPNG());
  console.log('  build/icon.png  512x512');

  const sizes = [256, 128, 64, 48, 32, 16];
  const frames = sizes.map((size) => ({
    size,
    data: full.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  writeIco(frames, path.join(BUILD, 'icon.ico'));
  console.log('  build/icon.ico  ' + sizes.join(', '));
  win.destroy();
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(BUILD, { recursive: true });

  const { server, port } = await startServer();
  const urlFor = (d) =>
    'http://127.0.0.1:' + port + '/?seller=' + d.seller + '&lot=' + encodeURIComponent(d.lot) +
    '&price=' + encodeURIComponent(d.price) + '&v=' + d.v +
    '&a=' + encodeURIComponent(d.a) + '&b=' + encodeURIComponent(d.b);

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    backgroundColor: '#0d0f13',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  await win.loadFile(path.join(ROOT, 'index.html'));
  // Start from a clean slate so a previous run cannot leak into the shots.
  await win.webContents.executeJavaScript(
    'localStorage.removeItem("whatnot-multiview.state.v1"); state.streams.length = 0; render(); true'
  );
  await wait(400);

  console.log('Screenshots:');
  await shoot(win, '01-empty');

  for (const d of DEMOS) {
    await win.webContents.executeJavaScript('addStream(' + JSON.stringify(urlFor(d)) + '); true');
  }
  await wait(3500);

  // Give the tiles readable names; the demo pages have no real titles.
  await win.webContents.executeJavaScript(
    'state.streams.forEach((s,i)=>{s.title=' + JSON.stringify(DEMOS.map((d) => d.seller)) + '[i];});' +
    'tiles.forEach((t)=>{t.title.textContent=t.stream.title;});' +
    'state.streams[0].muted=false;state.streams[1].muted=true;' +
    'state.streams[2].muted=true;state.streams[3].muted=true;' +
    'state.streams[0].volume=85;state.streams[1].volume=40;' +
    'syncControls();true'
  );
  await wait(500);
  await shoot(win, '02-grid');

  // Toolbar close-up: brand, input, grid selector and master volume.
  await shoot(win, '03-toolbar', { x: 0, y: 0, width: WIDTH, height: 46 });

  // Tile header close-up: the per-stream audio controls.
  const headerBox = await win.webContents.executeJavaScript(
    'const r=document.querySelector(".tile-header").getBoundingClientRect();' +
    'JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)})'
  );
  const box = JSON.parse(headerBox);
  await shoot(win, '04-tile-controls', {
    x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4),
    width: Math.min(WIDTH, box.width + 8), height: box.height + 8,
  });

  // Solo on the second tile.
  await win.webContents.executeJavaScript('soloByIndex(1); true');
  await wait(400);
  await shoot(win, '05-solo');

  // Focus mode on the first tile.
  await win.webContents.executeJavaScript(
    'soloByIndex(1); state.focusId = state.streams[0].id; applyLayout(); true'
  );
  await wait(600);
  await shoot(win, '06-focus');

  // Light theme, back in the grid.
  await win.webContents.executeJavaScript(
    'state.focusId=null; applyLayout(); document.getElementById("theme-toggle").click(); true'
  );
  await wait(500);
  await shoot(win, '07-light');

  // Leave nothing behind in the real app state.
  await win.webContents.executeJavaScript(
    'localStorage.removeItem("whatnot-multiview.state.v1"); true'
  );

  console.log('Icon:');
  await makeIcon();

  server.close();
  win.destroy();
  console.log('done');
  app.exit(0);
}).catch((e) => {
  console.error('FAILED: ' + e.message);
  app.exit(1);
});

setTimeout(() => { console.error('TIMEOUT'); app.exit(3); }, 120000);
