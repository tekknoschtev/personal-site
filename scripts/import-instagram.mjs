#!/usr/bin/env node
/**
 * Seed the art collection from an Instagram data export.
 *
 * Get the export: Accounts Center -> Your information and permissions ->
 * Download your information -> JSON format. Unzip it, then:
 *
 *   node scripts/import-instagram.mjs path/to/export-dir [options]
 *
 * Options:
 *   --dry-run       list what would be created, write nothing
 *   --since DATE    only posts on/after DATE (e.g. 2019-01-01)
 *   --match REGEX   only posts whose caption matches (case-insensitive),
 *                   e.g. --match "pastel|painting|drawing"
 *   --all-images    carousel posts become one entry per image
 *                   (default: first image only)
 *
 * For each post this writes src/content/art/<slug>.md and copies the
 * image to src/content/art/images/. Existing entries are never
 * overwritten, so re-running is safe and you can freely edit or delete
 * the generated files afterwards. Videos are skipped.
 */

import fs from 'node:fs';
import path from 'node:path';

const ART_DIR = new URL('../src/content/art/', import.meta.url).pathname;
const IMG_DIR = path.join(ART_DIR, 'images');

// ---- args ----------------------------------------------------------

const args = process.argv.slice(2);
const flags = { dryRun: false, allImages: false, since: null, match: null };
let exportDir = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dry-run') flags.dryRun = true;
  else if (arg === '--all-images') flags.allImages = true;
  else if (arg === '--since') flags.since = new Date(args[++i]);
  else if (arg === '--match') flags.match = new RegExp(args[++i], 'i');
  else exportDir = arg;
}

if (!exportDir || !fs.existsSync(exportDir)) {
  console.error('usage: node scripts/import-instagram.mjs <export-dir> [--dry-run] [--since DATE] [--match REGEX] [--all-images]');
  process.exit(1);
}

// ---- find posts_*.json anywhere in the export -----------------------

function findPostsFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findPostsFiles(full));
    else if (/^posts_\d+\.json$/.test(entry.name)) found.push(full);
  }
  return found;
}

const postsFiles = findPostsFiles(exportDir);
if (postsFiles.length === 0) {
  console.error(`no posts_*.json found under ${exportDir} — is this an unzipped JSON-format export?`);
  process.exit(1);
}

// ---- helpers ---------------------------------------------------------

// Instagram exports store text as UTF-8 bytes escaped per-byte
// (mojibake). Re-decode when high bytes are present and the fix round-trips clean.
function fixEncoding(text) {
  if (!text) return '';
  if (!/[\u0080-\u00ff]/.test(text)) return text;
  const decoded = Buffer.from(text, 'latin1').toString('utf8');
  return decoded.includes('�') ? text : decoded;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .split('-')
    .slice(0, 6)
    .join('-');
}

// drop lines that are only hashtags/mentions; keep prose
function cleanCaption(text) {
  return text
    .split('\n')
    .filter((line) => {
      const words = line.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) return true; // keep blank lines
      return !words.every((word) => word.startsWith('#') || word.startsWith('@'));
    })
    .join('\n')
    .trim();
}

function yamlString(value) {
  return JSON.stringify(value); // valid single-line YAML string
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

// ---- import ----------------------------------------------------------

let created = 0;
let skippedExisting = 0;
let skippedFiltered = 0;
let skippedNoImage = 0;

const posts = postsFiles.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')));

if (!flags.dryRun) fs.mkdirSync(IMG_DIR, { recursive: true });

for (const post of posts) {
  const media = (post.media ?? []).filter((m) => IMAGE_EXT.test(m.uri ?? ''));
  if (media.length === 0) {
    skippedNoImage++;
    continue;
  }

  // caption lives on the post for carousels, on the media item for singles
  const rawCaption = post.title || media[0].title || '';
  const caption = cleanCaption(fixEncoding(rawCaption));

  const timestamp = post.creation_timestamp ?? media[0].creation_timestamp;
  const date = new Date((timestamp ?? 0) * 1000);
  const isoDate = date.toISOString().slice(0, 10);

  if (flags.since && date < flags.since) {
    skippedFiltered++;
    continue;
  }
  if (flags.match && !flags.match.test(caption)) {
    skippedFiltered++;
    continue;
  }

  const chosen = flags.allImages ? media : [media[0]];

  chosen.forEach((item, index) => {
    const firstLine = caption.split('\n')[0] ?? '';
    const title =
      firstLine.length > 0
        ? firstLine.slice(0, 60) + (firstLine.length > 60 ? '…' : '')
        : `Untitled (${isoDate})`;

    const baseSlug =
      `${isoDate}-${slugify(firstLine) || 'untitled'}` +
      (chosen.length > 1 ? `-${index + 1}` : '');
    const mdPath = path.join(ART_DIR, `${baseSlug}.md`);

    if (fs.existsSync(mdPath)) {
      skippedExisting++;
      return;
    }

    const sourceImage = path.join(exportDir, item.uri);
    if (!fs.existsSync(sourceImage)) {
      console.warn(`! image missing in export, skipping: ${item.uri}`);
      return;
    }

    const imageName = baseSlug + path.extname(item.uri).toLowerCase();
    const lines = [
      '---',
      `title: ${yamlString(title)}`,
      ...(caption && caption !== firstLine ? [`caption: ${yamlString(caption)}`] : []),
      `image: ./images/${imageName}`,
      `date: ${isoDate}`,
      '---',
      '',
    ];

    if (flags.dryRun) {
      console.log(`would create ${baseSlug}.md  (${isoDate})  ${title}`);
    } else {
      fs.copyFileSync(sourceImage, path.join(IMG_DIR, imageName));
      fs.writeFileSync(mdPath, lines.join('\n'));
      console.log(`created ${baseSlug}.md`);
    }
    created++;
  });
}

console.log(
  `\n${flags.dryRun ? 'would create' : 'created'}: ${created}` +
    `  skipped: ${skippedExisting} existing, ${skippedFiltered} filtered, ${skippedNoImage} without images`,
);
if (!flags.dryRun && created > 0) {
  console.log('review the generated files, add medium: fields if you like, then build.');
}
