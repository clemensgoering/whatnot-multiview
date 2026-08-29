// Runs an Electron script with a clean environment (see launch.js for why).
const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, process.argv.slice(2), { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code === null ? 1 : code));
