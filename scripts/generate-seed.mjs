import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const catalog = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'data', 'catalog.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'data', 'siteSettings.json'), 'utf8'));
const media = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'data', 'mediaManifest.json'), 'utf8'));

function sqlEscape(str) {
  return `'${String(str ?? '').replace(/'/g, "''")}'`;
}

// Initial master user hash (SHA-256 of initial admin password)
const defaultPassHash = crypto.createHash('sha256').update('admin999').digest('hex');

const lines = [
  '-- ============================================================================',
  '-- INITIAL SEED - RSTK CATÁLOGO (51 VINIS + 52 MÍDIAS + CONFIGURAÇÕES)',
  '-- ============================================================================',
  '',
  '-- Configurações gerais e textos do catálogo',
  `INSERT INTO rstk_site_content (section_key, content_json, updated_at) VALUES ('settings', ${sqlEscape(JSON.stringify(settings))}, CURRENT_TIMESTAMP) ON CONFLICT(section_key) DO NOTHING;`,
  `INSERT INTO rstk_site_content (section_key, content_json, updated_at) VALUES ('catalog_initialized', '{"initialized":true}', CURRENT_TIMESTAMP) ON CONFLICT(section_key) DO NOTHING;`,
  '',
  '-- Usuário Master inicial',
  `INSERT INTO rstk_users (id, username, email, password_hash, role, created_at) VALUES ('usr_master', 'Jeff Waismann', 'jeff@smartweb.com.br', '${defaultPassHash}', 'master', CURRENT_TIMESTAMP) ON CONFLICT(email) DO NOTHING;`,
  '',
  '-- Biblioteca de mídias extraída do catálogo original'
];

for (const item of media) {
  lines.push(
    `INSERT INTO rstk_media (id, filename, r2_key, url, mime_type, size_bytes, created_at) VALUES (${sqlEscape(item.id)}, ${sqlEscape(item.filename)}, ${sqlEscape(item.r2_key)}, ${sqlEscape(item.url)}, ${sqlEscape(item.mime_type)}, ${Number(item.size_bytes) || 0}, CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING;`
  );
}

lines.push('');
lines.push('-- 51 Vinis do catálogo inicial');

for (const album of catalog) {
  lines.push(
    `INSERT INTO rstk_products (id, artist, title, source_title, units, media, release_date, genre, cover_url, external_source, price_cents, active, featured_hero, sort_order, updated_at) VALUES (${Number(album.id)}, ${sqlEscape(album.artist)}, ${sqlEscape(album.title)}, ${sqlEscape(album.sourceTitle)}, ${Number(album.units) || 1}, ${sqlEscape(album.media || 'LP')}, ${sqlEscape(album.date)}, ${sqlEscape(album.genre)}, ${sqlEscape(album.cover)}, ${sqlEscape(album.source || '')}, ${Number(album.priceCents) || 18999}, ${album.active ? 1 : 0}, ${album.featuredHero ? 1 : 0}, ${Number(album.sortOrder) || Number(album.id)}, CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING;`
  );
}

lines.push('');
fs.writeFileSync(path.join(rootDir, 'seed.sql'), lines.join('\n'), 'utf8');
console.log(`Generated seed.sql with ${catalog.length} products and ${media.length} media records.`);
