/*
 * Audio regression check:  npm run audio-check
 *
 * Whatnot plays over WebRTC with a muted <video> and the sound routed through
 * Web Audio, so element.volume reaches nothing. This drives the real app
 * against a page built the same way — audio produced by a Web Audio graph, plus
 * an ordinary <audio> element — and verifies the level reaches both.
 */
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(label, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '   ' + detail : ''));
  if (!cond) failures += 1;
}

/** Mirrors main.js, which this harness does not load. */
function configureStreamSession() {
  session.fromPartition('persist:whatnot')
    .setPreloads([path.join(ROOT, 'webview-preload.js')]);
}

const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>audio probe</title></head>
<body style="background:#111;color:#eee;font:14px sans-serif">
<audio id="a" src="${WAV}" loop autoplay></audio>
<script>
  // Built the way Whatnot's player is: the audible path is a Web Audio graph,
  // and it is connected to the destination after the page loads.
  // The case Whatnot actually presents: the audio sink is created but never
  // appended, so querySelectorAll cannot see the element making the sound.
  var detached = document.createElement('audio');
  detached.src = document.getElementById('a').src;
  detached.loop = true;
  detached.play().catch(function () {});
  window.__detached = detached;

  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var osc = ctx.createOscillator();
  var pageGain = ctx.createGain();
  pageGain.gain.value = 0.0001;
  osc.connect(pageGain);
  pageGain.connect(ctx.destination);
  osc.start();
  window.__ctx = ctx;
  window.__pageGain = pageGain;
</script>
</body></html>`;

app.whenReady().then(async () => {
  configureStreamSession();

  const server = http.createServer((_q, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';

  const win = new BrowserWindow({
    width: 1200, height: 800, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true,
    },
  });
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const inTile = (c) => js('document.querySelector("webview").executeJavaScript(' + JSON.stringify(c) + ')');

  await win.loadFile(path.join(ROOT, 'index.html'));
  await js('localStorage.clear(); state.streams.length=0; render(); true');
  await js('addStream(' + JSON.stringify(url) + '); true');
  await wait(3500);

  check('tile reports ready', await js('tiles.values().next().value.ready === true'));
  check('hook came from the preload, in the page world',
    JSON.parse(await inTile('window.__mvAudio.describe()')).hookInstalledAt === 'preload');
  check('the page graph was rerouted through our gain',
    (await inTile('Boolean(window.__ctx && window.__ctx.__mvGain)')) === true);

  /* ---- per-tile volume must reach BOTH paths ---- */
  await js('state.streams[0].muted = false; state.streams[0].volume = 40; state.masterVolume = 100; syncControls(); applyAllAudio(); true');
  await wait(900);
  const gain40 = await inTile('window.__ctx.__mvGain.gain.value');
  const el40 = await inTile('document.getElementById("a").volume');
  check('volume 40 reaches the Web Audio gain', Math.abs(gain40 - 0.4) < 0.02, 'gain=' + gain40);
  check('volume 40 reaches the media element', Math.abs(el40 - 0.4) < 0.02, 'element=' + el40);
  const det40 = await inTile('window.__detached.volume');
  check('volume 40 reaches the DETACHED element', Math.abs(det40 - 0.4) < 0.02, 'detached=' + det40);
  check('the detached element is in the registry',
    (await inTile('JSON.parse(window.__mvAudio.describe()).registered')) >= 2);

  /* ---- master scales both ---- */
  await js('state.masterVolume = 50; applyAllAudio(); true');
  await wait(900);
  check('master 50 halves the gain',
    Math.abs((await inTile('window.__ctx.__mvGain.gain.value')) - 0.2) < 0.02);

  /* ---- the page's own graph must survive untouched ---- */
  check('the page keeps its own gain node',
    Math.abs((await inTile('window.__pageGain.gain.value')) - 0.0001) < 0.00005);

  /* ---- mute stays an Electron-level switch ---- */
  await js('state.masterMuted = true; applyAllAudio(); true');
  await wait(600);
  check('master mute sets webview.isAudioMuted',
    (await js('document.querySelector("webview").isAudioMuted()')) === true);
  await js('state.masterMuted = false; applyAllAudio(); true');
  await wait(600);
  check('unmute clears it',
    (await js('document.querySelector("webview").isAudioMuted()')) === false);

  const report = JSON.parse(await js('describeAudio(tiles.values().next().value)'));
  check('report counts the Web Audio gains', report.page.webAudioGains >= 1,
    JSON.stringify(report.page).slice(0, 160));

  await js('localStorage.clear(); true');
  server.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILURES');
  app.exit(failures === 0 ? 0 : 1);
}).catch((e) => { console.log('ERROR: ' + e.message); app.exit(1); });

setTimeout(() => { console.log('TIMEOUT'); app.exit(3); }, 90000);
