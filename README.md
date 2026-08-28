# Whatnot MultiView

Watch several Whatnot livestreams side by side in one window, with a dark UI and
per-stream volume control.

Whatnot's own site shows one stream at a time. Juggling browser tabs does not
really work either, because every tab keeps playing audio and you end up hunting
for the one that is talking. MultiView puts the streams in a grid and gives each
one its own volume slider, a mute button and a solo button.

> Not affiliated with, endorsed by, or connected to Whatnot Inc. This is a
> personal viewer that renders whatnot.com in embedded browser views. You still
> need your own Whatnot account, and your use of the site remains subject to
> Whatnot's Terms of Service.

## Why a desktop app and not a website

This was the first thing I checked, and it settles the architecture:

```
$ curl -sSI https://www.whatnot.com/ | grep -i x-frame-options
X-Frame-Options: SAMEORIGIN
```

Whatnot sends `X-Frame-Options: SAMEORIGIN` plus a strict Content-Security-Policy.
No website and no `<iframe>` can embed those streams — a browser-based multiview
is technically impossible, not merely inconvenient.

This app uses Electron `<webview>` containers instead. Those are genuine separate
browser views rather than frames, so the embedding restriction does not apply to
them. Each tile is a full browser: you can log in, browse, bid and chat inside it.

## Requirements

- Node.js 18 or newer
- Windows, macOS or Linux
- A Whatnot account

## Install and run

```bash
git clone https://github.com/clemensgoering/whatnot-multiview.git
cd whatnot-multiview
npm install
npm start
```

`npm start` goes through `launch.js`, which strips `ELECTRON_RUN_AS_NODE` from the
environment. Without that, launching from a VS Code integrated terminal makes
Electron start as plain Node, `app` is undefined and the window never appears.

## Usage

### Adding streams

Paste into the input at the top:

- a full link — `https://www.whatnot.com/live/...`
- a link without the scheme — `whatnot.com/live/...`
- a bare username — `seller123`, which opens that profile

The most practical route is the **Login** button in the toolbar: sign in once,
then browse and click streams directly inside the tile. All tiles share one
session, so a single login covers every tile and survives restarts.

### Audio

This is the part the app exists for.

| Control | Effect |
| --- | --- |
| Slider per tile | That stream's own volume, 0–100 |
| Speaker button | Mute or unmute a single tile |
| `S` (solo) | Hear only this stream, silence the rest; click again to release |
| Master slider | Scales every tile together |

New tiles start muted, so adding a stream never makes everything talk at once.

Volume is applied by setting `volume` on the `<video>` elements inside the page.
A `MutationObserver` and a short interval re-apply it, because the player is
rebuilt on reconnect. If that injection ever fails, muting still works at the
webview level as a fallback.

### Keyboard

| Key | Action |
| --- | --- |
| `1`–`9` | Solo tile 1–9 (press again to release) |
| `0` | Release solo |
| `M` | Mute everything / restore |
| `Esc` | Leave focus mode |
| `F11` | Fullscreen |

### Layout

- `Auto` arranges tiles roughly square; `1`–`4` forces a column count
- `⛶` on a tile makes it fill the window. The others keep running unseen, so
  their audio continues
- Drag a tile by its header to reorder
- `⟳` reload, `↗` open in your system browser, `✕` remove

Stream list, volumes, layout and theme are saved automatically.

## Logging in

Two findings worth knowing, both discovered the hard way.

### Google sign-in does not work, and cannot be made to

Google blocks its sign-in flow inside embedded browser views on principle
("This browser or app may not be secure"). It is a fixed anti-phishing policy
with no allowlist — and it cannot be configured away in the Google Cloud Console
either, because the OAuth client belongs to Whatnot, not to this app.

Use **email and password** on Whatnot's login page instead. Apple and Facebook
work as well.

### Do not fake the user agent

An earlier version set the user agent to `Chrome/131` while `navigator.userAgentData`
still reported `Chromium 130`. Both Google's sign-in and Whatnot's fraud detection
flagged exactly that contradiction — a browser that misrepresents itself
inconsistently is a far stronger bot signal than an honest one.

The spoofing was removed. The app now identifies itself truthfully as
`Chrome/130 Electron/33`, with version and brand consistent, and login works.

This app deliberately does **not** disguise its browser identity. That detection
protects against account takeover and bidding bots, working around it violates
Whatnot's terms, and bidding involves real money.

If a login problem shows up anyway:

1. Accept the cookie banner inside the tile. While it is up, it blocks the page.
2. `npm run reset-session`, then restart. This clears only this app's cookies and
   storage.

## Project structure

| File | Purpose |
| --- | --- |
| `main.js` | Electron main process, shared session, popup rules |
| `preload.js` | Narrow bridge to the renderer (`openExternal`, fullscreen) |
| `renderer.js` | State, tiles, audio logic, layout |
| `index.html` / `styles.css` | Interface, dark and light color tokens |
| `launch.js` | Launcher with a cleaned environment |
| `reset-session.js` | Deletes the stored Whatnot session |

Tiles are reconciled rather than re-rendered: existing `<webview>` elements are
moved in the DOM, never recreated, because recreating one would restart the stream.

OAuth popups from Whatnot, Google, Apple and Facebook are kept inside the app so
the session cookie lands in this app's partition. Everything else opens in the
system browser.

Source comments are in German.

## Known limitations

- A Whatnot login is required to watch — via email and password, not Google.
- Many parallel video streams cost CPU and bandwidth. Beyond roughly six at once
  it pays to close tiles you are not watching.
- Volume control depends on Whatnot's player using standard `<video>` elements.
  Should that change, hard muting at the webview level still works, and only the
  fine-grained levels would be affected.

## License

MIT — see [LICENSE](LICENSE).
