// Deletes this app's stored Whatnot session (cookies, storage).
// Useful when a login attempt gets stuck or the site has flagged the session,
// and you want to start clean.
const fs = require('fs');
const path = require('path');
const os = require('os');

// Packaged builds use productName for userData, dev runs use the package name.
const APP_NAMES = ['Whatnot MultiView', 'whatnot-multiview'];

// Mirrors what Electron returns for app.getPath('userData').
function userDataDir(name) {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), name);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', name);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), name);
}

const targets = APP_NAMES.map((n) => path.join(userDataDir(n), 'Partitions', 'whatnot'));
const found = targets.filter((p) => fs.existsSync(p));

if (!found.length) {
  console.log('No stored session found. Looked in:');
  targets.forEach((p) => console.log('  ' + p));
  process.exit(0);
}

found.forEach((p) => {
  fs.rmSync(p, { recursive: true, force: true });
  console.log('Session deleted: ' + p);
});
console.log('The app will start logged out.');
