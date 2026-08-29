// Starts Electron with a clean environment.
// VS Code terminals set ELECTRON_RUN_AS_NODE=1, which would make electron.exe
// start as plain Node, leaving "app" undefined and the window never appearing.
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env, windowsHide: false });
child.on('close', (code) => process.exit(code === null ? 1 : code));
