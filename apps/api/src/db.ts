import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export interface Database {
 query(sql: string, params?: any[]): Promise<{ rows: Record<string, any>[] }>;
 exec(sql: string): Promise<unknown>;
 close(): Promise<void>;
}
export async function database(options: {url?: string; path?: string} = {}): Promise<Database> {
 let db: Database;
 if (options.url) {
   const pool = new pg.Pool({connectionString: options.url});
   db = {query: (sql, params) => pool.query(sql, params), exec: sql => pool.query(sql), close: () => pool.end()};
 } else { db = new PGlite(options.path); }
 for (const file of ['001_schema.sql','002_seed.sql']) {
   await db.exec(await readFile(fileURLToPath(new URL(`../../../database/${file}`, import.meta.url)), 'utf8'));
 }
 return db;
}
