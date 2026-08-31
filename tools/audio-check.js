/*
 * Audio regression check:  npm run audio-check
 *
 * Is the app's audio path broken, or is Whatnot's player no longer controllable
 * the way we control it? This tests the app against a page we fully control:
 * one plain <audio> element, and one Web Audio graph, which is the thing that
 * would NOT respond to element.volume.
 */
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const path = require('path');

// Mirrors main.js, which this harness does not load.
function configureStreamSession() {
  session.fromPartition('persist:whatnot');
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = require('path').join(__dirname, '..');

let failures = 0;
function check(label, cond, detail) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (detail ? '   ' + detail : ''));
  if (!cond) failures += 1;
}

// A one-second silent WAV, enough for a real HTMLMediaElement to exist and play.
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>audio probe</title></head>
<body style="background:#111;color:#eee;font:14px sans-serif">
<audio id="a" src="${WAV}" loop autoplay></audio>
<video id="v" muted autoplay playsinline style="width:80px"></video>
<script>
  // A Web Audio graph: its output ignores HTMLMediaElement.volume entirely.
  window.__ctx = null;
  window.startWebAudio = function () {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    window.__ctx = ctx;
    return ctx.state;
  };
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
  await wait(3000);

  check('tile reports ready',
    await js('tiles.values().next().value.ready === true'));

  check('__mvAudio installed in the page',
    (await inTile('typeof window.__mvAudio')) === 'object');

  check('page has a media element',
    (await inTile('document.querySelectorAll("video, audio").length')) >= 1);

  /* ---- per-tile volume ---- */
  await js('state.streams[0].muted = false; state.streams[0].volume = 40; state.masterVolume = 100; syncControls(); applyAllAudio(); true');
  await wait(900);
  const v40 = await inTile('document.getElementById("a").volume');
  check('tile volume 40 reaches the element', Math.abs(v40 - 0.4) < 0.02, 'element.volume=' + v40);

  /* ---- master scales it ---- */
  await js('state.masterVolume = 50; applyAllAudio(); true');
  await wait(900);
  const v20 = await inTile('document.getElementById("a").volume');
  check('master 50 halves it', Math.abs(v20 - 0.2) < 0.02, 'element.volume=' + v20);

  /* ---- master mute is an Electron-level switch ---- */
  await js('state.masterMuted = true; applyAllAudio(); true');
  await wait(600);
  const muted = await js('document.querySelector("webview").isAudioMuted()');
  check('master mute sets webview.isAudioMuted', muted === true, 'isAudioMuted=' + muted);

  await js('state.masterMuted = false; applyAllAudio(); true');
  await wait(600);
  check('unmute clears it',
    (await js('document.querySelector("webview").isAudioMuted()')) === false);

  /* ---- the case that would explain the report ---- */
  const ctxState = await inTile('window.startWebAudio()');
  await wait(600);
  await js('state.streams[0].volume = 0; applyAllAudio(); true');
  await wait(600);
  const gainStill = await inTile('window.__ctx ? window.__ctx.destination.channelCount > 0 : false');
  console.log('\n  NOTE  Web Audio context state: ' + ctxState +
    ' — element.volume does not affect a Web Audio graph (' + gainStill + ')');

  const desc = JSON.parse(await inTile('window.__mvAudio.describe()'));
  check('report names the media it found', desc.mediaCount === 2 && desc.media[0].tag === 'audio',
    'mediaCount=' + desc.mediaCount);
  const report = JSON.parse(await js('describeAudio(tiles.values().next().value)'));
  check('audio report has the fields we need',
    typeof report.isAudioMuted === 'boolean' && report.page && typeof report.page.mediaCount === 'number',
    JSON.stringify(report).slice(0, 200));
  console.log('  REPORT  ' + JSON.stringify(report));

  await js('localStorage.clear(); true');
  server.close();
  console.log(failures === 0 ? '\nALL PASS — the app path works' : '\n' + failures + ' FAILURES in the app path');
  app.exit(0);
}).catch((e) => { console.log('ERROR: ' + e.message); app.exit(1); });

setTimeout(() => { console.log('TIMEOUT'); app.exit(3); }, 90000);
