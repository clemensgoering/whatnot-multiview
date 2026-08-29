/*
 * Verifies that every relative link and heading anchor in the documentation
 * actually resolves. Cheap insurance: broken anchors are invisible on GitHub
 * until someone clicks them.
 *
 *   npm run check-links
 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'README.md',
  'docs/README.md',
  'docs/installation.md',
  'docs/getting-started.md',
  'docs/audio.md',
  'docs/layout.md',
  'docs/troubleshooting.md',
];

/** Mirrors how GitHub turns a heading into an anchor. */
function slug(heading) {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[`*_]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const root = path.join(__dirname, '..');
const anchors = {};

FILES.forEach((file) => {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const headings = text.match(/^#{1,6} .+$/gm) || [];
  anchors[file] = headings.map((h) => slug(h.replace(/^#+ /, '')));
});

let checked = 0;
let bad = 0;

FILES.forEach((file) => {
  const dir = path.dirname(file);
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const links = text.match(/\]\(([^)\s]+)\)/g) || [];

  links.forEach((raw) => {
    const target = raw.slice(2, -1);
    if (/^(https?:|mailto:)/.test(target)) return;
    checked += 1;

    const parts = target.split('#');
    const rel = parts[0];
    const hash = parts[1];
    const resolved = rel
      ? path.posix.normalize(path.posix.join(dir.split(path.sep).join('/'), rel))
      : file;

    if (rel && !fs.existsSync(path.join(root, resolved))) {
      console.log('  MISSING FILE  ' + file + '  ->  ' + target);
      bad += 1;
      return;
    }

    if (!hash) return;

    const list = anchors[resolved];
    if (!list) return; // Not a documentation page, e.g. an image or LICENSE.
    if (!list.includes(hash)) {
      console.log('  BAD ANCHOR    ' + file + '  ->  ' + target);
      console.log('                available: ' + list.join(', '));
      bad += 1;
    }
  });
});

console.log(checked + ' internal links checked, ' + bad + ' broken');
process.exit(bad === 0 ? 0 : 1);
