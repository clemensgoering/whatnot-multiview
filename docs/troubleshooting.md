# Troubleshooting

[Guide](README.md) · [Installation](installation.md) · [First steps](getting-started.md) · [Audio](audio.md) · [Layout](layout.md) · **Troubleshooting**

---

## Windows blocked the installer

**Symptom:** *"Windows protected your PC — Microsoft Defender SmartScreen
prevented an unrecognised app from starting."*

Expected, and not a sign that anything is wrong with the file. The builds carry
no code signature, so SmartScreen cannot tell who published them. It is reporting
that it does not know, not that it found something bad.

The dialog shows only a **Don't run** button. The one you want is hidden: click
**More info**, and **Run anyway** appears beside it.

On macOS the equivalent is *"cannot be opened because the developer cannot be
verified"* — right-click the app and choose **Open**.

To convince yourself the download is intact, check it against the
[published checksums](installation.md#verifying-a-download). To remove the
warning outright you would need a signing certificate; the
[options are listed here](installation.md#removing-the-warning-properly), and
building from source avoids it entirely.

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

The 💬 button flashes red when it finds nothing to hide.

**The direct fix: shift-click 💬**, then click the chat in the tile. That pick is
remembered for every tile and across restarts, so you only do it once. See
[Audio](audio.md#when-automatic-detection-fails).

Before that, check the obvious:

- On a listing or profile page there is no chat to hide. Open a stream first.
- Give the stream a moment to finish loading, then try again.

To help fix the automatic detection, **alt-click 💬**. That copies a structural
report — viewport size, which strategies matched, the shape of the page's
scrollable containers and input fields — with no chat messages or account details
in it. Paste it into an
[issue](https://github.com/clemensgoering/whatnot-multiview/issues).

If it hides the wrong element, press it again to restore, then reload the tile
with ⟳.

## The audio controls do nothing

Reload the tile with **⟳** first — the volume hook is installed on every page
load, so a tile that loaded oddly recovers with a reload.

If it stays broken, **alt-click the tile's 🔊 button**. That copies an audio
report to your clipboard: whether the webview is muted at Electron level, whether
it is currently producing sound, and what media elements the page actually has —
their volume, muted and paused state. No account details, no page content.

The useful pair of numbers is `mediaCount` against `registered`:

- **`mediaCount` counts elements in the document.** On a Whatnot stream this is
  1 — the muted `<video>` carrying the picture.
- **`registered` counts every element that could be an audio sink**, including
  the ones the player creates without appending. On a stream this is typically 4,
  and the one marked `PLAYING` and not muted is where the sound comes from.

If `registered` is 1 on a live stream, the hook did not install early enough —
reload the tile. If the volumes in the report match what you asked for and the
sound is still unchanged, the level is being applied somewhere further along.

Either way, please
[open an issue](https://github.com/clemensgoering/whatnot-multiview/issues) with
the report. `npm run audio-check` verifies the app's own audio path against a
controlled page, which separates an app fault from a site change.

## The update button says "Update failed"

Click it again — it retries the check and shows the reason as its tooltip.

The most likely cause is that your installed version predates the updater:
releases up to v1.0.0 carry no `latest.yml`, the manifest the updater reads, so
there is nothing for it to compare against. Download the current release once by
hand and updating works from then on.

A background check that fails stays silent by design, so a button appearing at
all means you asked for the check yourself.

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
