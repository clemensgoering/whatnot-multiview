// Startet Electron in einem sauberen Environment.
// VS-Code-Terminals setzen ELECTRON_RUN_AS_NODE=1 - damit wuerde electron.exe
// als reines Node starten und "app" waere undefined.
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env, windowsHide: false });
child.on('close', (code) => process.exit(code === null ? 1 : code));
