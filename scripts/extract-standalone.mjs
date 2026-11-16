import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const legacyFile = fs.existsSync(path.join(rootDir, 'RSTK_Catalogo_Novembro_2026.html'))
  ? path.join(rootDir, 'RSTK_Catalogo_Novembro_2026.html')
  : path.join(rootDir, 'legacy', 'RSTK_Catalogo_Novembro_2026.html');

if (!fs.existsSync(legacyFile)) {
  throw new Error(`Standalone HTML not found at ${legacyFile}`);
}

const html = fs.readFileSync(legacyFile, 'utf8');

const imagesDir = path.join(rootDir, 'public', 'assets', 'images');
const coversDir = path.join(rootDir, 'public', 'assets', 'covers');
const dataDir = path.join(rootDir, 'src', 'data');

fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(coversDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

function mimeToExt(mime) {
  const m = mime.toLowerCase();
  if (m === 'jpeg' || m === 'jpg') return 'jpg';
  if (m === 'png') return 'png';
  if (m === 'webp') return 'webp';
  return 'bin';
}

// 1. Extract header brand logo
const brandMatch = html.match(/class="brand"[^>]*><img\s+src="data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)"/i);
if (!brandMatch) {
  throw new Error('Header brand logo base64 not found');
}
const logoExt = mimeToExt(brandMatch[1]);
const logoFilename = `logo-rstk.${logoExt}`;
const logoBuffer = Buffer.from(brandMatch[2], 'base64');
fs.writeFileSync(path.join(imagesDir, logoFilename), logoBuffer);
fs.writeFileSync(path.join(rootDir, 'public', 'favicon.png'), logoBuffer);
console.log(`Extracted header logo: /assets/images/${logoFilename} (${logoBuffer.length} bytes)`);

// 2. Extract DATA array
const dataMatch = html.match(/const\s+DATA\s*=\s*(\[[\s\S]*?\]);\r?\n/);
if (!dataMatch) {
  throw new Error('DATA array not found in HTML');
}

const rawData = JSON.parse(dataMatch[1]);
if (!Array.isArray(rawData) || rawData.length !== 51) {
  throw new Error(`Expected 51 items in DATA, got ${Array.isArray(rawData) ? rawData.length : typeof rawData}`);
}

const mediaManifest = [
  {
    id: 'm_logo_rstk',
    filename: logoFilename,
    r2_key: `assets/images/${logoFilename}`,
    url: `/assets/images/${logoFilename}`,
    mime_type: `image/${brandMatch[1].toLowerCase()}`,
    size_bytes: logoBuffer.length
  }
];

const catalog = rawData.map((item, idx) => {
  const match = String(item.cover || '').match(/^data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error(`Invalid base64 cover for item id=${item.id} (${item.title})`);
  }
  const mimeSub = match[1].toLowerCase();
  const ext = mimeToExt(mimeSub);
  const paddedId = String(item.id).padStart(2, '0');
  const filename = `album-${paddedId}.${ext}`;
  const coverBuffer = Buffer.from(match[2], 'base64');
  fs.writeFileSync(path.join(coversDir, filename), coverBuffer);

  const coverPath = `/assets/covers/${filename}`;

  mediaManifest.push({
    id: `m_cover_${paddedId}`,
    filename,
    r2_key: `assets/covers/${filename}`,
    url: coverPath,
    mime_type: `image/${mimeSub}`,
    size_bytes: coverBuffer.length
  });

  return {
    id: Number(item.id),
    artist: item.artist,
    title: item.title,
    sourceTitle: item.sourceTitle || item.title.toUpperCase(),
    units: Number(item.units) || 1,
    media: item.media || 'LP',
    date: item.date || '2026-01-01',
    genre: item.genre || 'Rock',
    cover: coverPath,
    coverUrl: item.coverUrl || '',
    source: item.source || '',
    priceCents: 18999,
    active: true,
    featuredHero: [7, 28, 24].includes(Number(item.id)),
    sortOrder: idx + 1
  };
});

fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog, null, 2), 'utf8');
fs.writeFileSync(path.join(dataDir, 'mediaManifest.json'), JSON.stringify(mediaManifest, null, 2), 'utf8');

const siteSettings = {
  brandName: 'RSTK',
  brandAlt: 'RSTK ATACADO',
  logoUrl: `/assets/images/${logoFilename}`,
  headerTagline: 'Vinis importados · Atacado',
  heroEyebrow: 'Catálogo Novembro 2026',
  heroTitle: 'Vinis lacrados e importados',
  heroSubtitle: 'Somente vendas no atacado pra lojistas',
  launchLabel: 'Preço único de lançamento',
  priceCents: 18999,
  validityText: 'Até 30/11/2026 ou enquanto durar o estoque.',
  validityDate: '30/11/2026',
  heroCaption: 'Álbuns que atravessam gerações',
  heroFeaturedIds: [7, 28, 24],
  browseTitle: 'Explore o catálogo',
  browseSubtitle: 'Do primeiro play ao próximo favorito.',
  whatsappNumber: '553488293565',
  whatsappDefaultMessage:
    'Olá, RSTK! Tenho interesse nos vinis lacrados e importados para minha loja. Gostaria de saber mais sobre as vendas no atacado e a oferta de lançamento de R$ 189,99.',
  detailNote:
    'Preço único de lançamento até 30/11/2026 ou enquanto durar o estoque. A capa identifica o álbum; confirme os detalhes da edição física antes do pedido.',
  footerTextPrimary:
    'Vinis lacrados e importados · Somente vendas no atacado pra lojistas. Preço único de lançamento: R$ 189,99 até 30/11/2026 ou enquanto durar o estoque.',
  footerTextSecondary:
    'Capas de referência dos álbuns; a arte e os detalhes da edição física podem variar. Datas conforme a lista fornecida. Gêneros organizados para facilitar a navegação.',
  seoTitle: 'RSTK • Catálogo Novembro 2026 | Vinis Lacrados no Atacado',
  seoDescription:
    'Catálogo RSTK Atacado de vinis lacrados e importados para lojistas. Mais de 50 títulos clássicos e contemporâneos em LP com preço único de lançamento.',
  ogImage: '/assets/covers/album-28.jpg',
  siteUrl: 'https://rstk.pages.dev'
};

fs.writeFileSync(path.join(dataDir, 'siteSettings.json'), JSON.stringify(siteSettings, null, 2), 'utf8');

console.log(`Extracted ${catalog.length} covers to public/assets/covers/`);
console.log(`Saved src/data/catalog.json, src/data/siteSettings.json, and src/data/mediaManifest.json`);
