# Troubleshooting

[Guide](README.md) · [Installation](installation.md) · [First steps](getting-started.md) · [Audio](audio.md) · [Layout](layout.md) · **Troubleshooting**

---

## Google sign-in is blocked

**Symptom:** *"Couldn't sign you in — this browser or app may not be secure."*

Google blocks its sign-in flow inside embedded browser views on principle. It is
an anti-phishing policy with no allowlist, and it **cannot** be configured away in
the Google Cloud Console either — the OAuth client belongs to Whatnot, not to this
app, so there is nothing of yours to change.

**Fix:** sign in with email and password on Whatnot's login page. Apple and
Facebook also work.

## "Suspicious activity detected"

**Symptom:** Whatnot's own login rejects you and suggests changing browser.

That is Whatnot's fraud detection. In the version that first showed this, the app
was setting a fake `Chrome/131` user agent while `navigator.userAgentData` still
reported `Chromium 130` — and that contradiction is exactly what such systems look
for. A browser that misrepresents itself inconsistently is a *stronger* signal
than an honest one.

The spoofing was removed and login worked. This app deliberately does not disguise
its browser identity, and will not: the detection protects against account
takeover and bidding bots, working around it violates Whatnot's terms, and bidding
involves real money.

If it appears anyway:

1. **Answer the cookie banner** inside the tile. While it is up, it blocks the page.
2. **Sign out and retry** with the **⏻** button in the toolbar, which clears this
   app's cookies and storage. From source you can also run `npm run reset-session`.

## The window stays black, or nothing starts

Almost always `ELECTRON_RUN_AS_NODE=1` in the environment, which makes Electron
start as plain Node. VS Code's integrated terminal sets it.

- Running from source: use `npm start`, not `electron .`. The launcher strips the
  variable.
- Running the installed app from a terminal: unset the variable first, or just
  start it from the Start menu or Finder.

## A tile shows "This stream could not be loaded"

Click **Try again** in the tile, or **⟳** in its header. If it persists, the
stream has probably ended — open it with **↗** in your browser to check.

## Video stutters with several streams

Every tile is a full video decode. Beyond roughly six simultaneous streams, CPU
and bandwidth become the limit on most machines.

- Close tiles you are not watching (**✕**).
- Use [focus mode](layout.md#focus-mode) rather than a large grid when you only
  need one picture — hidden tiles still decode, but the compositing cost drops.
- Lower the stream quality inside the tile if Whatnot offers the option.

## The chat toggle does nothing

The 💬 button flashes red when it finds nothing to hide. It identifies the chat by
the shape of the page rather than by class name, using one strategy for the
desktop layout (a column right of the video) and another for the mobile layout a
narrow tile gets (the block around the chat's message field).

- On a listing or profile page there is no chat to hide. Open a stream first.
- Give the stream a moment to finish loading, then try again.
- If it works in [focus mode](layout.md#focus-mode) but not in a small tile, the
  mobile strategy has missed — please report it with the tile width.
- If the page has a chat but the button never finds it, Whatnot has probably
  changed its layout; please
  [open an issue](https://github.com/clemensgoering/whatnot-multiview/issues).

If it hides the wrong element, press it again to restore, then reload the tile
with ⟳.

## The volume slider does not change anything

Muting works at the webview level and is reliable. The slider works by setting
`volume` on the page's `<video>` elements, which depends on Whatnot using standard
media elements. If Whatnot changes its player, mute and solo keep working while
the fine-grained levels may not.

Reload the tile with **⟳** first — the injection runs on every page load. If it
stays broken, please
[open an issue](https://github.com/clemensgoering/whatnot-multiview/issues).

## Where is my data stored?

Two places, both local:

| What | Where |
| --- | --- |
| Stream list, volumes, layout, theme | Browser `localStorage` of the app window |
| Whatnot session (cookies, site storage) | `<userData>/Partitions/whatnot` |

`<userData>` is `%APPDATA%\whatnot-multiview` on Windows,
`~/Library/Application Support/whatnot-multiview` on macOS, and
`~/.config/whatnot-multiview` on Linux.

Nothing is sent anywhere except to Whatnot itself. There is no telemetry and no
server belonging to this project.

---

← [Layout](layout.md) · [Back to the guide](README.md)
