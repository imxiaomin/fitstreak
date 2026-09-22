import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export interface Queryable {
 query(sql: string, params?: any[]): Promise<{ rows: Record<string, any>[] }>;
}
export interface Database extends Queryable {
 exec(sql: string): Promise<unknown>;
 close(): Promise<void>;
 transaction<T>(work:(tx:Queryable)=>Promise<T>):Promise<T>;
}
export async function database(options: {url?: string; path?: string} = {}): Promise<Database> {
 let db: Database;
 if (options.url) {
   const pool = new pg.Pool({connectionString: options.url});
   db = {query: (sql, params) => pool.query(sql, params), exec: async sql => {
     // Serialize reentrant DDL across API instances sharing the database.
     const client=await pool.connect();
     try{await client.query('SELECT pg_advisory_lock(734821091)');return await client.query(sql);}
     catch(e){await client.query('ROLLBACK');throw e;}
     finally{try{await client.query('SELECT pg_advisory_unlock(734821091)');}finally{client.release();}}
   }, close: () => pool.end(),transaction:async work=>{
     const client=await pool.connect();try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   }};
 } else {
   if(options.path)await mkdir(dirname(options.path),{recursive:true});
   const local=new PGlite(options.path);
   db={query:async(sql,params)=>local.query<Record<string,any>>(sql,params),exec:sql=>local.exec(sql),close:()=>local.close(),transaction:work=>local.transaction(tx=>work({query:async(sql,params)=>tx.query<Record<string,any>>(sql,params)}))};
 }
 for (const file of ['001_schema.sql','002_seed.sql','004_ai_coach.sql']) {
   await db.exec(await readFile(fileURLToPath(new URL(`../../../database/${file}`, import.meta.url)), 'utf8'));
 }
 return db;
}
