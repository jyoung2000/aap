// Copies the built WXT archives into the backend's static bundle folder with the
// canonical names the container serves:
//   .output/jobpilot-<ver>-chrome.zip   -> backend/app/static/extension/jobpilot-chrome.zip
//   .output/jobpilot-<ver>-firefox.zip  -> backend/app/static/extension/jobpilot-firefox.xpi
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', '.output');
const destDir = join(__dirname, '..', '..', 'backend', 'app', 'static', 'extension');

if (!existsSync(outDir)) {
  console.error(`No .output directory at ${outDir}. Run the builds first.`);
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });

const files = readdirSync(outDir).filter((f) => f.endsWith('.zip'));
const chromeZip = files.find((f) => /chrome/.test(f) && !/sources/.test(f));
const firefoxZip = files.find((f) => /firefox/.test(f) && !/sources/.test(f));

if (!chromeZip) {
  console.error(`Chrome zip not found in .output. Present: ${files.join(', ') || '(none)'}`);
  process.exit(1);
}
if (!firefoxZip) {
  console.error(`Firefox zip not found in .output. Present: ${files.join(', ') || '(none)'}`);
  process.exit(1);
}

copyFileSync(join(outDir, chromeZip), join(destDir, 'jobpilot-chrome.zip'));
copyFileSync(join(outDir, firefoxZip), join(destDir, 'jobpilot-firefox.xpi'));

console.log(`Bundled:`);
console.log(`  ${chromeZip}  ->  ${join(destDir, 'jobpilot-chrome.zip')}`);
console.log(`  ${firefoxZip}  ->  ${join(destDir, 'jobpilot-firefox.xpi')}`);
