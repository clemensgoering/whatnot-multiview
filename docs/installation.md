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
year. Every download therefore triggers a warning on first launch.

**Windows** shows *"Windows protected your PC"* with only a **Don't run** button
visible. The one you want is hidden: click **More info** first, and **Run anyway**
appears next to it.

**macOS** says the developer cannot be verified. Right-click the app and choose
**Open**, which offers a confirmation the plain double-click does not.

### Verifying a download

Releases after v1.0.0 carry a `SHA256SUMS.txt` listing the checksum of every
file, so you can confirm a download is byte-for-byte what the build produced:

```powershell
# Windows
Get-FileHash .\WhatnotMultiView-Setup-1.0.0.exe -Algorithm SHA256
```

```bash
# macOS / Linux
shasum -a 256 WhatnotMultiView-1.0.0.dmg
```

This proves the file arrived intact. It is not a substitute for code signing,
which is what would remove the warning itself.

### Removing the warning properly

Only a code signing certificate does that. If you fork this and want signed
builds, the realistic options are an OV certificate (a few hundred euro a year,
and SmartScreen only trusts it once the signature has built reputation), an EV
certificate (more expensive, trusted immediately), or Azure Trusted Signing,
which is far cheaper and works with electron-builder.

If none of that appeals — a reasonable position — build from source instead. You
then run code you compiled yourself, and no warning appears.

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
