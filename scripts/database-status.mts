import {existsSync} from 'node:fs';
import pg from 'pg';
if(existsSync('apps/api/.env')) process.loadEnvFile('apps/api/.env');
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
 await client.connect();
 const info=await client.query('SELECT current_database() AS database, current_user AS username, version() AS version');
 console.log(info.rows[0]);
 for(const table of ['app_user','fitness_plan','checkin','article','article_translation','health_profile','agent_run','plan_exercise']) {
  const result=await client.query(`SELECT count(*)::integer AS count FROM ${table}`);
  console.log(`${table}: ${result.rows[0].count}`);
 }
} finally {await client.end();}
