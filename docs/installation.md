# Installation

[Guide](README.md) · **Installation** · [First steps](getting-started.md) · [Audio](audio.md) · [Layout](layout.md) · [Troubleshooting](troubleshooting.md)

---

There are two ways in. Pick the installer unless you want to change the code.

## Installer (recommended)

1. Open the [Releases page](https://github.com/clemensgoering/whatnot-multiview/releases).
2. Download the file for your system:

   | System | File |
   | --- | --- |
   | Windows | `WhatnotMultiView-Setup-<version>.exe` |
   | macOS | `WhatnotMultiView-<version>-<arch>.dmg` |
   | Linux | `WhatnotMultiView-<version>.AppImage` |

3. Run it. On Windows the installer lets you choose the folder and creates a
   desktop shortcut. On macOS, drag the app into Applications. On Linux, mark the
   AppImage executable (`chmod +x`) and run it.

No Node.js, no terminal, no `npm` — everything is bundled.

### About the security warning

The builds are not code-signed, because a signing certificate costs money every
year. Windows SmartScreen will therefore show *"Windows protected your PC"* on
first launch. Click **More info → Run anyway**. macOS will say the developer
cannot be verified; right-click the app and choose **Open**.

If that is not acceptable to you — a reasonable position — build from source
instead. You then run code you compiled yourself.

## From source

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/clemensgoering/whatnot-multiview.git
cd whatnot-multiview
npm install
npm start
```

### Building your own installer

```bash
npm run dist:win      # Windows  -> dist/WhatnotMultiView-Setup-<version>.exe
npm run dist:mac      # macOS    -> dist/WhatnotMultiView-<version>-<arch>.dmg
npm run dist:linux    # Linux    -> dist/WhatnotMultiView-<version>.AppImage
```

Each target has to be built on its own platform; `electron-builder` cannot
cross-compile a macOS DMG from Windows.

### Why `npm start` goes through a launcher

`npm start` runs `launch.js` rather than `electron .` directly. VS Code's
integrated terminal sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as
plain Node — `app` is then undefined and the window never appears. The launcher
strips that variable before spawning Electron.

---

Next: [First steps](getting-started.md) →
