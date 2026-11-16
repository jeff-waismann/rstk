import * as esbuild from 'esbuild';
import fs from 'node:fs';

async function buildAdmin() {
  const version = Date.now();
  console.log(`Building Agile Admin bundle (v=${version})...`);

  fs.mkdirSync('public/assets/js', { recursive: true });
  fs.mkdirSync('public/admin', { recursive: true });

  await esbuild.build({
    entryPoints: ['src/admin/admin-entry.jsx'],
    bundle: true,
    minify: true,
    outfile: 'public/assets/js/admin-bundle.js',
    loader: { '.jsx': 'jsx' },
    jsx: 'automatic',
    jsxImportSource: 'react',
    target: ['es2020']
  });

  const adminHtmlPath = 'public/admin/index.html';
  if (fs.existsSync(adminHtmlPath)) {
    const html = fs.readFileSync(adminHtmlPath, 'utf8');
    const updated = html.replace(/admin-bundle\.js(\?v=\d+)?/g, `admin-bundle.js?v=${version}`);
    fs.writeFileSync(adminHtmlPath, updated, 'utf8');
  }

  console.log('Admin bundle compiled successfully at public/assets/js/admin-bundle.js');
}

buildAdmin().catch((err) => {
  console.error('Admin build failed:', err);
  process.exit(1);
});
