#!/usr/bin/env node
/**
 * PS PERFUMES — copy Storage objects from the old project to the new one.
 *
 *   old: bucket "ps-perfumes"        in project jnrmmhzhhmjxefapkemv
 *   new: bucket "Ps-perfumes-media"  in project pwacxxrghlglvdtclbig
 *
 * TRUSTED MACHINE ONLY. This script needs the SECRET keys of both projects. They are read
 * from environment variables of the shell that runs it — never from .env (which is tracked
 * in Git and feeds the browser bundle), never written to disk, never printed.
 *
 *   OLD_SUPABASE_URL=https://jnrmmhzhhmjxefapkemv.supabase.co
 *   OLD_SUPABASE_SECRET_KEY=<old project secret key>
 *   NEW_SUPABASE_URL=https://pwacxxrghlglvdtclbig.supabase.co
 *   NEW_SUPABASE_SECRET_KEY=<new project secret key>
 *
 *   node scripts/copy-storage-to-new-project.mjs            # dry run: lists what would be copied
 *   node scripts/copy-storage-to-new-project.mjs --apply    # copies
 *
 * Behaviour
 *   - Object paths are preserved exactly (products/x-123.webp stays products/x-123.webp),
 *     so 06_post_import_fixups.sql only has to change the URL prefix.
 *   - Objects that already exist in the new bucket are skipped (never overwritten).
 *   - Nothing is ever deleted, in either project. The old project is only read.
 *   - Files whose MIME type the new bucket does not allow are reported, not copied.
 *   - Exit code 1 if any object failed, so the result cannot be mistaken for success.
 */
import { createClient } from '@supabase/supabase-js';

const OLD_BUCKET = 'ps-perfumes';
const NEW_BUCKET = 'Ps-perfumes-media';
const OLD_REF = 'jnrmmhzhhmjxefapkemv';
const NEW_REF = 'pwacxxrghlglvdtclbig';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const APPLY = process.argv.includes('--apply');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}. See the header of this file.`);
    process.exit(2);
  }
  return value;
}

const oldUrl = requireEnv('OLD_SUPABASE_URL');
const newUrl = requireEnv('NEW_SUPABASE_URL');
// Guard against swapped variables: the source must be the old project, the target the new one
if (!oldUrl.includes(OLD_REF) || !newUrl.includes(NEW_REF)) {
  console.error(`OLD_SUPABASE_URL must contain ${OLD_REF} and NEW_SUPABASE_URL must contain ${NEW_REF}. Refusing to run.`);
  process.exit(2);
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const source = createClient(oldUrl, requireEnv('OLD_SUPABASE_SECRET_KEY'), clientOptions);
const target = createClient(newUrl, requireEnv('NEW_SUPABASE_SECRET_KEY'), clientOptions);

/** Recursively lists every object in a bucket. Folders are entries without an id. */
async function listAll(client, bucket, prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data || []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        files.push(...(await listAll(client, bucket, path)));
      } else {
        files.push({ path, mimetype: entry.metadata?.mimetype || '', size: entry.metadata?.size || 0 });
      }
    }
    if (!data || data.length < 1000) break;
  }
  return files;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (copying)' : 'DRY RUN (nothing is written)'}`);

  const [sourceFiles, targetFiles] = await Promise.all([
    listAll(source, OLD_BUCKET),
    listAll(target, NEW_BUCKET),
  ]);
  const existing = new Set(targetFiles.map((f) => f.path));
  console.log(`Source objects: ${sourceFiles.length}; already in target: ${targetFiles.length}`);

  const copied = [];
  const skipped = [];
  const rejected = [];
  const failed = [];

  for (const file of sourceFiles) {
    if (existing.has(file.path)) {
      skipped.push(file.path);
      continue;
    }
    // image/jpg is not a registered type; the app normalises it to image/jpeg as well
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (!ALLOWED_MIME.has(mime)) {
      rejected.push(`${file.path} (${file.mimetype || 'unknown type'})`);
      continue;
    }
    if (!APPLY) {
      copied.push(file.path);
      continue;
    }

    const { data: blob, error: dlErr } = await source.storage.from(OLD_BUCKET).download(file.path);
    if (dlErr || !blob) {
      failed.push(`${file.path}: download failed (${dlErr?.message || 'no data'})`);
      continue;
    }
    const { error: upErr } = await target.storage.from(NEW_BUCKET).upload(file.path, blob, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) {
      failed.push(`${file.path}: upload failed (${upErr.message})`);
      continue;
    }
    copied.push(file.path);
    console.log(`copied ${file.path}`);
  }

  console.log('\nSummary');
  console.log(`  ${APPLY ? 'copied' : 'would copy'}: ${copied.length}`);
  console.log(`  skipped (already in target): ${skipped.length}`);
  console.log(`  not copied, type not allowed by ${NEW_BUCKET}: ${rejected.length}`);
  rejected.forEach((r) => console.log(`    - ${r}`));
  console.log(`  failed: ${failed.length}`);
  failed.forEach((f) => console.log(`    - ${f}`));

  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`Aborted: ${err.message}`);
  process.exit(1);
});
