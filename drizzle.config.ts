/**
 * Drizzle Studio 設定。
 * 環境変数 STUDIO_DB で対象 DB を切り替える。
 *
 * Usage:
 *   STUDIO_DB=cernere npx drizzle-kit studio
 *   STUDIO_DB=curare  npx drizzle-kit studio
 *   STUDIO_DB=schedula npx drizzle-kit studio
 */

import { defineConfig } from 'drizzle-kit';

const db = process.env['STUDIO_DB'] || 'cernere';

const dbMap: Record<string, { url: string; schema: string }> = {
  cernere:  { url: 'postgresql://ludiars:ludiars@localhost:5432/cernere',  schema: './schema/cernere.ts' },
  curare:   { url: 'postgresql://ludiars:ludiars@localhost:5432/curare',   schema: './schema/curare.ts' },
  schedula: { url: 'postgresql://ludiars:ludiars@localhost:5432/schedula', schema: './schema/schedula.ts' },
};

const target = dbMap[db];
if (!target) {
  throw new Error(`Unknown STUDIO_DB: ${db}. Use: ${Object.keys(dbMap).join(', ')}`);
}

export default defineConfig({
  schema: target.schema,
  dialect: 'postgresql',
  dbCredentials: { url: target.url },
});
