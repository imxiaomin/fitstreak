import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
// Run against a copy made while the PGlite backend is stopped.
// The original data directory remains available for rollback.
const sourcePath=process.argv[2];
if(!sourcePath || !existsSync(resolve(sourcePath,'PG_VERSION'))) throw new Error('Pass an existing, offline PGlite backup directory');
if(existsSync('apps/api/.env')) process.loadEnvFile('apps/api/.env');
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
const source=new PGlite(resolve(sourcePath));
const target=new pg.Client({connectionString:process.env.DATABASE_URL});
let transaction=false;
try {
 await target.connect();
 await target.query('BEGIN');transaction=true;
 // Seed articles already exist on a freshly initialized target; only migrate user data.
 const tables=['app_user','fitness_plan','checkin'];
 await target.query('LOCK TABLE app_user, fitness_plan, checkin IN EXCLUSIVE MODE');
 for(const table of tables){
  const count=await target.query(`SELECT count(*)::integer AS count FROM ${table}`);
  if(count.rows[0].count!==0) throw new Error(`Target ${table} must be empty; migration will not overwrite existing data`);
 }
 for(const table of tables){
  // JSON preserves DATE strings without conversion through JavaScript time zones.
  const {rows}=await source.query<{data:Record<string,unknown>}>(`SELECT row_to_json(t) AS data FROM ${table} t`);
  for(const {data} of rows){
   await target.query(`INSERT INTO ${table} SELECT * FROM json_populate_record(NULL::${table}, $1::json)`,[JSON.stringify(data)]);
  }
  const result=await target.query(`SELECT count(*)::integer AS count FROM ${table}`);
  if(result.rows[0].count!==rows.length) throw new Error(`Row count mismatch for ${table}`);
  console.log(`${table}: migrated ${rows.length} rows`);
 }
 await target.query('COMMIT');transaction=false;
} catch(error){
 if(transaction) await target.query('ROLLBACK');
 throw error;
} finally {await source.close();await target.end();}
