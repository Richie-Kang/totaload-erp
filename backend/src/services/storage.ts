// Totaload ERP — disk storage for uploaded images and generated PDFs (docs/ARCHITECTURE.md §2.1, ADR-006).
// Files are stored under STORAGE_DIR with UUID names; callers only ever pass DB-derived relative paths.

import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';

const here = path.dirname(fileURLToPath(import.meta.url)); // backend/{src,dist}/services
const repoRoot = path.resolve(here, '..', '..', '..'); // -> backend -> repo root

export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(repoRoot, 'storage'));
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const GENERATED_DIR = path.join(STORAGE_DIR, 'generated');

mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(GENERATED_DIR, { recursive: true });

// Persists an uploaded file. Returns the STORAGE_DIR-relative path (e.g. `uploads/<uuid>.jpg`).
export async function save(buf: Buffer, ext: string): Promise<string> {
  const rel = path.posix.join('uploads', `${randomUUID()}.${ext}`);
  await writeFile(path.join(STORAGE_DIR, rel), buf);
  return rel;
}

// Persists a generated file (currently always a PDF). Returns the STORAGE_DIR-relative path.
export async function saveGenerated(buf: Buffer, ext = 'pdf'): Promise<string> {
  const rel = path.posix.join('generated', `${randomUUID()}.${ext}`);
  await writeFile(path.join(STORAGE_DIR, rel), buf);
  return rel;
}

// Opens a stored file for reading. `relPath` must come from the DB; this asserts it resolves inside
// STORAGE_DIR (path-traversal guard) and that the file exists.
export function openRead(relPath: string): { stream: Readable; absPath: string } {
  const absPath = path.resolve(STORAGE_DIR, relPath);
  if (absPath !== STORAGE_DIR && !absPath.startsWith(STORAGE_DIR + path.sep)) {
    throw new Error(`path escapes storage dir: ${relPath}`);
  }
  if (!existsSync(absPath)) {
    throw new Error(`file not found: ${relPath}`);
  }
  return { stream: createReadStream(absPath), absPath };
}

export function mimeOf(relPath: string): string {
  switch (path.extname(relPath).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}
