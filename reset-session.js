// Deletes this app's stored Whatnot session (cookies, storage).
// Useful when a login attempt gets stuck or the site has flagged the session,
// and you want to start clean.
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_NAME = 'whatnot-multiview';

// Mirrors what Electron returns for app.getPath('userData').
function userDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_NAME);
}

const partition = path.join(userDataDir(), 'Partitions', 'whatnot');

if (!fs.existsSync(partition)) {
  console.log('No stored session found at:');
  console.log('  ' + partition);
  process.exit(0);
}

fs.rmSync(partition, { recursive: true, force: true });
console.log('Session deleted:');
console.log('  ' + partition);
console.log('The app will start logged out.');
