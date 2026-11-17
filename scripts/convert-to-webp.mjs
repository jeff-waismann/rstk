import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function main() {
  const coversDir = path.resolve('public/assets/covers');
  const imagesDir = path.resolve('public/assets/images');

  let totalBefore = 0;
  let totalAfter = 0;
  let convertedCovers = 0;

  console.log('--- Converting covers to WebP ---');
  const coverFiles = fs.readdirSync(coversDir);
  for (const file of coverFiles) {
    if (file.endsWith('.jpg') || file.endsWith('.png')) {
      const srcPath = path.join(coversDir, file);
      const baseName = file.replace(/\.(jpg|png)$/, '');
      const destPath = path.join(coversDir, `${baseName}.webp`);

      const origStat = fs.statSync(srcPath);
      totalBefore += origStat.size;

      await sharp(srcPath)
        .resize({ width: 600, height: 600, fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 82, effort: 6 })
        .toFile(destPath);

      const newStat = fs.statSync(destPath);
      totalAfter += newStat.size;
      convertedCovers++;

      // Delete the original file
      fs.unlinkSync(srcPath);
      console.log(`Converted: ${file} (${(origStat.size / 1024).toFixed(1)} KB) -> ${baseName}.webp (${(newStat.size / 1024).toFixed(1)} KB)`);
    } else if (file.endsWith('.webp')) {
      const p = path.join(coversDir, file);
      totalBefore += fs.statSync(p).size;
      totalAfter += fs.statSync(p).size;
    }
  }

  console.log('--- Converting logo to WebP ---');
  const logoPng = path.join(imagesDir, 'logo-rstk.png');
  if (fs.existsSync(logoPng)) {
    const logoStat = fs.statSync(logoPng);
    totalBefore += logoStat.size;
    const logoDest = path.join(imagesDir, 'logo-rstk.webp');

    await sharp(logoPng)
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 85, effort: 6 })
      .toFile(logoDest);

    const newLogoStat = fs.statSync(logoDest);
    totalAfter += newLogoStat.size;
    fs.unlinkSync(logoPng);
    console.log(`Converted logo: logo-rstk.png (${(logoStat.size / 1024).toFixed(1)} KB) -> logo-rstk.webp (${(newLogoStat.size / 1024).toFixed(1)} KB)`);
  }

  console.log('\n--- Summary ---');
  console.log(`Total covers converted: ${convertedCovers}`);
  console.log(`Total size before: ${(totalBefore / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total size after:  ${(totalAfter / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Reduction: -${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
