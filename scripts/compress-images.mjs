#!/usr/bin/env node
/**
 * One-shot image compression pass for the static assets in
 * apps/web/public.
 *
 * Strategy:
 *   - roster/*.png   — character full-body cards, hero size, currently
 *                      6-8MB each. Convert to WebP @ q82, max 1200px
 *                      wide. Expect ~50x smaller (150-300KB).
 *   - hero.png       — landing-page background, currently 4.6MB.
 *                      WebP @ q82, max 1920px wide. Expect ~500KB.
 *   - reference/*.png — sent to OpenAI gpt-image-1 as vision reference
 *                      for selfie generation. Compress more
 *                      conservatively (JPEG @ q92, max 1280px) so
 *                      face fidelity survives the model's downscale.
 *                      Expect ~300-500KB each.
 *
 * Originals are kept for safety in /public-orig (gitignored) — only
 * the compressed versions ship.
 */
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

const ROOT = path.resolve('apps/web/public');
const BACKUP = path.resolve('apps/web/public-orig');

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(0)}KB`;
}

async function ensureBackup() {
  try {
    await mkdir(BACKUP, { recursive: true });
  } catch {
    /* exists */
  }
}

async function backup(from) {
  const rel = path.relative(ROOT, from);
  const to = path.join(BACKUP, rel);
  await mkdir(path.dirname(to), { recursive: true });
  try {
    await stat(to);
    // already backed up, skip
  } catch {
    // copy via sharp (works cross-volume on Windows)
    const { default: { copyFile } } = await import('node:fs/promises');
    await copyFile(from, to);
  }
}

async function compressRoster(file) {
  const before = (await stat(file)).size;
  const outWebp = file.replace(/\.png$/i, '.webp');
  await sharp(file)
    .resize({ width: 1200, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: 82, effort: 6 })
    .toFile(outWebp);
  const after = (await stat(outWebp)).size;
  console.log(
    `  roster ${path.basename(file)} → ${path.basename(outWebp)}  ${fmtKB(before)} → ${fmtKB(after)}  (${Math.round((1 - after / before) * 100)}% smaller)`,
  );
  return outWebp;
}

async function compressHero(file) {
  const before = (await stat(file)).size;
  const outWebp = file.replace(/\.png$/i, '.webp');
  await sharp(file)
    .resize({ width: 1920, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: 82, effort: 6 })
    .toFile(outWebp);
  const after = (await stat(outWebp)).size;
  console.log(
    `  hero ${path.basename(file)} → ${path.basename(outWebp)}  ${fmtKB(before)} → ${fmtKB(after)}  (${Math.round((1 - after / before) * 100)}% smaller)`,
  );
  return outWebp;
}

async function compressReference(file) {
  const before = (await stat(file)).size;
  // Keep PNG container because OpenAI gpt-image-1 image-edit accepts PNG
  // most reliably, but re-encode with quantized palette + max 1280px.
  // If still over 800KB, fall back to JPEG q92.
  const tmpPng = file + '.tmp.png';
  await sharp(file)
    .resize({ width: 1280, withoutEnlargement: true, fit: 'inside' })
    .png({ quality: 92, compressionLevel: 9, palette: true })
    .toFile(tmpPng);
  const tmpSize = (await stat(tmpPng)).size;
  let outFile = tmpPng;
  if (tmpSize > 800 * 1024) {
    // PNG still big — switch to JPEG q92 for further savings.
    const tmpJpg = file + '.tmp.jpg';
    await sharp(file)
      .resize({ width: 1280, withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(tmpJpg);
    outFile = tmpJpg;
    // The PNG attempt was bigger — discard it.
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(tmpPng);
    } catch {
      /* ignore */
    }
  }
  const finalSize = (await stat(outFile)).size;
  // Replace the original with the compressed version (keep extension
  // whether png or jpg). For the JPEG path, rename to .jpg and the
  // catalog code below will be updated to match.
  const ext = path.extname(outFile).replace('.tmp', '');
  const target = file.replace(/\.[^.]+$/, ext);
  await rename(outFile, target);
  // Remove the original if extension changed (e.g. png → jpg)
  if (target !== file) {
    const { unlink } = await import('node:fs/promises');
    try {
      await unlink(file);
    } catch {
      /* ignore */
    }
  }
  console.log(
    `  reference ${path.basename(file)} → ${path.basename(target)}  ${fmtKB(before)} → ${fmtKB(finalSize)}  (${Math.round((1 - finalSize / before) * 100)}% smaller)`,
  );
  return target;
}

async function main() {
  await ensureBackup();
  console.log('🗜️  Compressing public/ images…');
  console.log();

  // Roster
  console.log('▶ Roster (PNG → WebP, max 1200px, q82):');
  const rosterDir = path.join(ROOT, 'roster');
  for (const entry of await readdir(rosterDir)) {
    if (!entry.endsWith('.png')) continue;
    const file = path.join(rosterDir, entry);
    await backup(file);
    await compressRoster(file);
    // Remove the source PNG since WebP replaces it
    const { unlink } = await import('node:fs/promises');
    await unlink(file);
  }

  // Hero
  console.log();
  console.log('▶ Hero (PNG → WebP, max 1920px, q82):');
  const heroFile = path.join(ROOT, 'hero.png');
  try {
    await stat(heroFile);
    await backup(heroFile);
    await compressHero(heroFile);
    const { unlink } = await import('node:fs/promises');
    await unlink(heroFile);
  } catch (err) {
    console.log(`  (skip — ${err.message})`);
  }

  // Reference
  console.log();
  console.log('▶ Reference (PNG → PNG quantized or JPEG q92, max 1280px):');
  const refDir = path.join(ROOT, 'reference');
  for (const entry of await readdir(refDir)) {
    if (!/\.(png|jpg|jpeg)$/i.test(entry)) continue;
    const file = path.join(refDir, entry);
    await backup(file);
    await compressReference(file);
  }

  console.log();
  console.log('✅ done.');
  console.log(`📦 originals backed up to: ${path.relative(process.cwd(), BACKUP)}`);
}

main().catch((err) => {
  console.error('compression failed:', err);
  process.exit(1);
});
