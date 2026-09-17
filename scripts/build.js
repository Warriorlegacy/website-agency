import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DEMOS_DIR = path.join(ROOT_DIR, 'demos');
const TEMPLATES_DIR = path.join(ROOT_DIR, 'templates');
const PIPELINE_FILE = path.join(ROOT_DIR, 'pipeline.json');

console.log('📦 Building static production package for Vercel...');

// 1. Ensure public/demos directory exists and is synced
const targetDemos = path.join(PUBLIC_DIR, 'demos');
if (!fs.existsSync(targetDemos)) {
  fs.mkdirSync(targetDemos, { recursive: true });
}

if (fs.existsSync(DEMOS_DIR)) {
  fs.cpSync(DEMOS_DIR, targetDemos, { recursive: true });
  console.log('✅ Synced demos to public/demos/');
}

// 2. Sync templates to public/templates/
const targetTemplates = path.join(PUBLIC_DIR, 'templates');
if (!fs.existsSync(targetTemplates)) {
  fs.mkdirSync(targetTemplates, { recursive: true });
}
if (fs.existsSync(TEMPLATES_DIR)) {
  fs.cpSync(TEMPLATES_DIR, targetTemplates, { recursive: true });
  console.log('✅ Synced templates to public/templates/');
}

// 3. Copy pipeline.json to public/pipeline.json
if (fs.existsSync(PIPELINE_FILE)) {
  fs.copyFileSync(PIPELINE_FILE, path.join(PUBLIC_DIR, 'pipeline.json'));
  console.log('✅ Synced pipeline.json to public/pipeline.json');
}

console.log('✨ Production build complete in public/ ready for Vercel deployment!');
