const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const packageRoot = path.join(projectRoot, 'node_modules', 'pdfjs-dist');
const targetRoot = path.join(projectRoot, 'public', 'pdfjs');

fs.mkdirSync(targetRoot, { recursive: true });
fs.copyFileSync(path.join(packageRoot, 'build', 'pdf.worker.min.mjs'), path.join(targetRoot, 'pdf.worker.min.mjs'));

for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  fs.cpSync(path.join(packageRoot, directory), path.join(targetRoot, directory), { recursive: true, force: true });
}
