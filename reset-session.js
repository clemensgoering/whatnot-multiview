// Loescht die gespeicherte Whatnot-Session (Cookies, Storage) dieser App.
// Nuetzlich, wenn ein Login-Versuch haengt oder die Seite die Sitzung
// als auffaellig markiert hat und man sauber neu anfangen will.
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_NAME = 'whatnot-multiview';

// Entspricht dem, was Electron als app.getPath('userData') liefert.
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
