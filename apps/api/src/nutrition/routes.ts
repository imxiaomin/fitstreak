import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, Queryable } from '../db.js';
import { shiftDay, weekday } from '../domain.js';
import { AgentError, obj } from '../agent/schema.js';
import type { AgentConfig } from '../agent/provider.js';
import { createNutritionProvider } from './provider.js';
import { bmr, exerciseKcal, nutritionTarget, totalFoods, validateFoods, validateNutritionProposal, validateProfile } from './domain.js';
import { foodSchema, mealTypes, profileSchema, type NutritionProfile } from './schema.js';

const uuid = { type: 'string', format: 'uuid' };
const dateSchema = { type: 'string', format: 'date' };
const localeSchema = { type: 'string', enum: ['zh-CN', 'en'] };
const recordMealTypes = [...mealTypes,'snack'];
const mealTypeSchema = { type: 'string', enum: recordMealTypes };
const foodArray = { type: 'array', minItems: 1, maxItems: 20, items: foodSchema };
const noteSchema = { type: 'string', maxLength: 1000 };
function fail(code: string, status = 400): never { throw new AgentError(code, status); }
const round = (value: number) => Math.round(value * 10) / 10;

/** Data URLs only. No user-controlled URL is ever fetched by this module. */
function imageData(value: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) fail('NUTRITION_INVALID_IMAGE');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 4 * 1024 * 1024) fail('NUTRITION_IMAGE_TOO_LARGE');
  if (bytes.toString('base64') !== match[2]) fail('NUTRITION_INVALID_IMAGE');
  const kind = match[1];
  const valid = kind === 'jpeg'
    ? bytes.length >= 16 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
    : kind === 'png'
      ? bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR' && bytes.toString('ascii',bytes.length - 8,bytes.length - 4) === 'IEND'
      : bytes.length >= 20 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!valid) fail('NUTRITION_INVALID_IMAGE');
  return value;
}

export async function registerNutrition(app: FastifyInstance, db: Database, auth: (req: any) => Promise<void>, today: () => string, config: AgentConfig & { visionModel?: string } = {}) {
  const provider = createNutritionProvider(config);
  const controllers = new Map<string, { user: string; controller: AbortController }>();
  const pending = new Set<Promise<void>>();
  const secure = { security: [{ bearerAuth: [] }], tags: ['Nutrition'] };
  const options = (body?: any) => ({ preHandler: auth, schema: { ...secure, ...(body ? { body } : {}) } });
  const pathOptions = (body?: any) => ({ preHandler: auth, schema: { ...secure, params: obj({ id: uuid }), ...(body ? { body } : {}) } });
  const result = (data: any) => ({ data });
  const profileData = (value: any):NutritionProfile => { const {version,bmr_kcal,target_kcal,...data}=value;return data; };
  const lock = (tx: Queryable, user: string) => tx.query('SELECT id FROM app_user WHERE id=$1 FOR UPDATE', [user]);
  const profile = async (user: string, tx: Queryable = db) => {
    const row = (await tx.query('SELECT data,version FROM nutrition_profile WHERE user_id=$1', [user])).rows[0];
    return row ? { ...row.data, version: row.version, bmr_kcal: bmr(row.data), target_kcal: nutritionTarget(row.data) } : null;
  };
  const quota = async (user: string, tx: Queryable = db) => {
    const row = (await tx.query("SELECT COUNT(*)::int AS used,MIN(created_at)+INTERVAL '1 hour' AS next_restore_at FROM nutrition_job WHERE user_id=$1 AND created_at>CURRENT_TIMESTAMP-INTERVAL '1 hour'", [user])).rows[0];
    return { limit: 12, used: row.used, remaining: Math.max(0, 12 - row.used), next_restore_at: row.next_restore_at ? new Date(row.next_restore_at).toISOString() : null };
  };
  const expire = (user: string, tx: Queryable = db) => tx.query("UPDATE nutrition_job SET status='failed',error_code='AI_INTERRUPTED',updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND status IN ('queued','running') AND created_at<CURRENT_TIMESTAMP-INTERVAL '3 minutes'", [user]);
  const publicJob = async (id: string, user: string, kind?: string, tx: Queryable = db) => {
    await expire(user, tx);
    const row = (await tx.query('SELECT id,kind,status,foods,summary,warnings,proposal,error_code,created_at,updated_at,(image_data IS NOT NULL) AS photo_available FROM nutrition_job WHERE id=$1 AND user_id=$2', [id,user])).rows[0];
    if (!row || (kind && row.kind !== kind)) fail('NOT_FOUND',404);
    if (row.foods) row.totals = totalFoods(row.foods);
    if(row.kind==='plan')row.checkins=(await tx.query('SELECT local_date::text AS date,plan_slot AS meal_type FROM nutrition_meal WHERE user_id=$1 AND plan_id=$2 ORDER BY local_date,plan_slot',[user,id])).rows;
    return row;
  };
  const publicMeal = (row: any) => ({ ...row, totals: totalFoods(row.foods), photo_available: Boolean(row.analysis_id) });
  const mealColumns = 'id,local_date::text AS date,meal_type,foods,note,analysis_id,plan_id,created_at,updated_at';
  const meal = async (id: string, user: string, tx: Queryable = db) => {
    const row = (await tx.query(`SELECT ${mealColumns} FROM nutrition_meal WHERE id=$1 AND user_id=$2`, [id,user])).rows[0];
    if (!row) fail('NOT_FOUND',404);
    return publicMeal(row);
  };
  function validDay(day: string, future = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day+'T00:00:00Z')) || new Date(day+'T00:00:00Z').toISOString().slice(0,10) !== day || day < shiftDay(today(),-366) || day > shiftDay(today(),future ? 30 : 0)) fail('NUTRITION_INVALID_DATE');
  }
  const snapshot = async (user: string, day: string, tx: Queryable) => {
    const p = await profile(user,tx);
    if (p) await tx.query('INSERT INTO nutrition_day(user_id,local_date,bmr_kcal,weight_kg,target_kcal,profile_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,local_date) DO NOTHING', [user,day,p.bmr_kcal,p.weight_kg,p.target_kcal,p.version]);
  };
  const saveMeal = async (user: string, body: any, tx: Queryable) => {
    const existing = (await tx.query('SELECT id FROM nutrition_meal WHERE user_id=$1 AND request_key=$2', [user,body.request_key])).rows[0];
    if (existing) {
      const saved=await meal(existing.id,user,tx);
      if(body.plan_id && (saved.plan_id!==body.plan_id || saved.date!==body.date || saved.meal_type!==body.meal_type))fail('NUTRITION_REQUEST_CONFLICT',409);
      return saved;
    }
    validDay(body.date);
    validateFoods(body.foods);
    if (body.analysis_id) {
      const source = await publicJob(body.analysis_id,user,'analysis',tx);
      if (source.status !== 'ready' || !source.photo_available) fail('NUTRITION_ANALYSIS_NOT_READY',409);
    }
    await snapshot(user,body.date,tx);
    const id = randomUUID();
    await tx.query('INSERT INTO nutrition_meal(id,user_id,request_key,local_date,meal_type,foods,note,analysis_id,plan_id,plan_slot) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)', [id,user,body.request_key,body.date,body.meal_type,JSON.stringify(body.foods),body.note ?? '',body.analysis_id ?? null,body.plan_id ?? null,body.plan_id ? body.meal_type : null]);
    return meal(id,user,tx);
  };

  app.get('/api/nutrition/profile', options(), async req => result(await profile(req.user.sub)));
  app.put('/api/nutrition/profile', options(profileSchema), async req => {
    validateProfile(req.body);
    await db.transaction(async tx => {
      await lock(tx,req.user.sub);
      await tx.query('INSERT INTO nutrition_profile(user_id,data,version) VALUES($1,$2::jsonb,$3) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,version=EXCLUDED.version,updated_at=CURRENT_TIMESTAMP', [req.user.sub,JSON.stringify(req.body),randomUUID()]);
      await tx.query("UPDATE nutrition_job SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND kind='plan' AND status='active'",[req.user.sub]);
      // Existing saved meals retain the metabolic basis captured on their first save.
    });
    return result(await profile(req.user.sub));
  });
  app.get('/api/nutrition/status',options(),async req => result({ configured: provider.configured, model: provider.model, vision_model: provider.visionModel, quota: await quota(req.user.sub) }));

  async function runJob(id: string, user: string, kind: string, input: any, p: any, controller: AbortController) {
    try {
      await db.query("UPDATE nutrition_job SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND status='queued'", [id,user]);
      if (kind === 'analysis') {
        const analysis = await provider.analyze({ image_data: input.image_data, description: input.description ?? '', locale: input.locale, signal: controller.signal });
        validateFoods(analysis.foods);
        if (controller.signal.aborted) fail('AI_INTERRUPTED');
        await db.query("UPDATE nutrition_job SET status='ready',foods=$3::jsonb,summary=$4,warnings=$5::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND status='running'", [id,user,JSON.stringify(analysis.foods),analysis.summary,JSON.stringify(analysis.warnings)]);
      } else {
        const proposal = await provider.plan({ profile: profileData(p), style: input.style, start_date: input.start_date, locale: input.locale, signal: controller.signal });
        validateNutritionProposal(proposal,profileData(p),input.start_date);
        if (proposal.style !== input.style) fail('NUTRITION_INVALID_PLAN');
        if (controller.signal.aborted) fail('AI_INTERRUPTED');
        await db.query("UPDATE nutrition_job SET status='draft',proposal=$3::jsonb,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND status='running'", [id,user,JSON.stringify(proposal)]);
      }
    } catch (error) {
      const code = controller.signal.aborted ? 'AI_INTERRUPTED' : error instanceof AgentError ? error.code : 'AI_UPSTREAM_ERROR';
      await db.query("UPDATE nutrition_job SET status='failed',error_code=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND status IN ('queued','running')",[id,user,code]);
    } finally { controllers.delete(id); }
  }
  async function admit(user: string, kind: 'analysis'|'plan', body: any) {
    if (!body.consent) fail('AI_CONSENT_REQUIRED');
    let created: { id: string; p: any; controller: AbortController } | undefined;
    let id: string;
    try {
      id = await db.transaction(async tx => {
        await lock(tx,user);
        const existing = (await tx.query('SELECT id,kind FROM nutrition_job WHERE user_id=$1 AND request_key=$2',[user,body.request_key])).rows[0];
        if (existing) { if (existing.kind !== kind) fail('NUTRITION_REQUEST_CONFLICT',409); return existing.id; }
        if (!provider.configured) fail('AI_NOT_CONFIGURED',503);
        const p = await profile(user,tx);
        if (kind === 'plan') {
          if (!p) fail('NUTRITION_PROFILE_REQUIRED');
          if (p.has_conditions) fail('NUTRITION_HEALTH_REVIEW_REQUIRED');
          validDay(body.start_date,true);
          if (body.start_date < today()) fail('NUTRITION_INVALID_DATE');
        }
        await expire(user,tx);
        if ((await quota(user,tx)).remaining <= 0) fail('NUTRITION_USER_RATE_LIMITED',429);
        if ((await tx.query("SELECT id FROM nutrition_job WHERE user_id=$1 AND status IN ('queued','running')",[user])).rows.length) fail('NUTRITION_ALREADY_RUNNING',409);
        if (controllers.size >= 4) fail('NUTRITION_CAPACITY_BUSY',503);
        const id = randomUUID(), controller = new AbortController();
        created = { id,p,controller };
        controllers.set(id,{ user,controller });
        const { image_data, consent, request_key, ...input } = body;
        await tx.query('INSERT INTO nutrition_job(id,user_id,kind,request_key,profile_version,status,model,locale,input,image_data) VALUES($1,$2,$3,$4,$5,\'queued\',$6,$7,$8::jsonb,$9)', [id,user,kind,body.request_key,p?.version ?? null,kind === 'analysis' ? provider.visionModel ?? provider.model : provider.model,body.locale,JSON.stringify(input),image_data ?? null]);
        return id;
      });
    } catch (error) { if (created) controllers.delete(created.id); throw error; }
    if (created) {
      const promise = runJob(id,user,kind,body,created.p,created.controller);
      pending.add(promise);
      void promise.finally(() => pending.delete(promise)).catch(() => {});
    }
    return publicJob(id,user,kind);
  }
  app.post('/api/nutrition/analyses', { ...options(obj({ image_data:{ type:'string',minLength:20,maxLength:5600000 },description:{ type:'string',maxLength:500 },locale:localeSchema,consent:{type:'boolean'},request_key:uuid }, ['image_data','locale','consent','request_key'])), bodyLimit:6*1024*1024 }, async (req,reply) => {
    const body = req.body as any;
    imageData(body.image_data);
    const data = await admit(req.user.sub,'analysis',body);
    reply.code(202); return result(data);
  });
  app.get('/api/nutrition/analyses/:id',pathOptions(),async req => result(await publicJob((req.params as any).id,req.user.sub,'analysis')));
  app.get('/api/nutrition/photos/:id',pathOptions(),async (req,reply) => {
    const row = (await db.query("SELECT image_data FROM nutrition_job WHERE id=$1 AND user_id=$2 AND kind='analysis'",[(req.params as any).id,req.user.sub])).rows[0];
    if (!row?.image_data) fail('NOT_FOUND',404);
    reply.header('Cache-Control','private, no-store');
    return result({ image_data:row.image_data });
  });
  app.delete('/api/nutrition/analyses/:id',pathOptions(),async req=>{
    const id=(req.params as any).id;
    await db.transaction(async tx=>{
      await lock(tx,req.user.sub);
      await publicJob(id,req.user.sub,'analysis',tx);
      if((await tx.query('SELECT id FROM nutrition_meal WHERE user_id=$1 AND analysis_id=$2',[req.user.sub,id])).rows.length)fail('NUTRITION_ANALYSIS_IN_USE',409);
      const active=controllers.get(id);active?.controller.abort();
      // Keep a minimal job shell so erasing a photograph cannot reset the rolling allowance.
      await tx.query("UPDATE nutrition_job SET status='failed',error_code='NUTRITION_ANALYSIS_DELETED',image_data=NULL,foods=NULL,summary='',warnings='[]',input='{}',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2",[id,req.user.sub]);
    });return result({deleted:true});
  });
  const mealBody = obj({ date:dateSchema,meal_type:mealTypeSchema,foods:foodArray,note:noteSchema,analysis_id:uuid,request_key:uuid },['date','meal_type','foods','request_key']);
  app.post('/api/nutrition/meals',options(mealBody),async (req,reply) => {
    const data = await db.transaction(async tx => { await lock(tx,req.user.sub); return saveMeal(req.user.sub,req.body,tx); });
    reply.code(201); return result(data);
  });
  app.get('/api/nutrition/meals',{preHandler:auth,schema:{...secure,querystring:obj({date:dateSchema},[])}},async req => {
    const day = (req.query as any).date ?? today(); validDay(day);
    const rows = (await db.query(`SELECT ${mealColumns} FROM nutrition_meal WHERE user_id=$1 AND local_date=$2 ORDER BY created_at`,[req.user.sub,day])).rows;
    return result({meals:rows.map(publicMeal),totals:totalFoods(rows.flatMap(row=>row.foods))});
  });
  app.patch('/api/nutrition/meals/:id',pathOptions({...obj({meal_type:mealTypeSchema,foods:foodArray,note:noteSchema},[]),minProperties:1}),async req => {
    const body = req.body as any;
    const data = await db.transaction(async tx => {
      await lock(tx,req.user.sub);
      const old = await meal((req.params as any).id,req.user.sub,tx);
      if(old.plan_id && body.meal_type && body.meal_type!==old.meal_type)fail('NUTRITION_PLAN_MEAL_TYPE_LOCKED',409);
      if (body.foods) validateFoods(body.foods);
      await tx.query('UPDATE nutrition_meal SET meal_type=$3,foods=$4::jsonb,note=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2', [old.id,req.user.sub,body.meal_type ?? old.meal_type,JSON.stringify(body.foods ?? old.foods),body.note ?? old.note]);
      return meal(old.id,req.user.sub,tx);
    }); return result(data);
  });
  app.delete('/api/nutrition/meals/:id',pathOptions(),async req => {
    await db.transaction(async tx=>{
      await lock(tx,req.user.sub);
      const old=await meal((req.params as any).id,req.user.sub,tx);
      await tx.query('DELETE FROM nutrition_meal WHERE id=$1 AND user_id=$2',[old.id,req.user.sub]);
      if(old.analysis_id){
        // A photograph disappears with its final saved meal, while the quota shell remains.
        await tx.query("UPDATE nutrition_job SET status='failed',error_code='NUTRITION_ANALYSIS_DELETED',image_data=NULL,foods=NULL,summary='',warnings='[]',input='{}',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND kind='analysis' AND NOT EXISTS(SELECT 1 FROM nutrition_meal WHERE user_id=$2 AND analysis_id=$1)",[old.analysis_id,req.user.sub]);
      }
    });
    return result({deleted:true});
  });
  app.get('/api/nutrition/summary',{preHandler:auth,schema:{...secure,querystring:obj({date:dateSchema},[])}},async req => {
    const day = (req.query as any).date ?? today(); validDay(day);
    const rows = (await db.query('SELECT foods FROM nutrition_meal WHERE user_id=$1 AND local_date=$2',[req.user.sub,day])).rows;
    const totals = totalFoods(rows.flatMap(row=>row.foods));
    const saved = (await db.query('SELECT bmr_kcal,weight_kg,target_kcal FROM nutrition_day WHERE user_id=$1 AND local_date=$2',[req.user.sub,day])).rows[0];
    const current = saved ? null : await profile(req.user.sub);
    const basis = saved ?? current;
    const checkins = (await db.query('SELECT activity,duration_minutes FROM checkin WHERE user_id=$1 AND local_date=$2',[req.user.sub,day])).rows;
    const exercise = basis ? round(checkins.reduce((sum,row)=>sum+exerciseKcal(row.activity,row.duration_minutes,Number(basis.weight_kg)),0)) : null;
    return result({date:day,bmr_kcal:basis?.bmr_kcal ?? null,target_kcal:basis?.target_kcal ?? null,exercise_kcal:exercise,intake_kcal:totals.kcal,carbs_g:totals.carbs_g,protein_g:totals.protein_g,fat_g:totals.fat_g,balance_kcal:rows.length && basis ? round(basis.bmr_kcal + exercise! - totals.kcal) : null,has_records:rows.length>0,meals_count:rows.length,basis:saved?'snapshot':current?'current':'missing'});
  });
  app.get('/api/nutrition/stats',{preHandler:auth,schema:{...secure,querystring:obj({date:dateSchema,period:{type:'string',enum:['day','week','month']}},['period'])}},async req => {
    const {period,date:requested} = req.query as any;
    const day = requested ?? today(); validDay(day);
    const from = period === 'week' ? shiftDay(day,1-weekday(day)) : period === 'month' ? day.slice(0,8)+'01' : day;
    const to = period === 'week' ? shiftDay(from,6) : period === 'month' ? new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),0)).toISOString().slice(0,10) : day;
    const rows = (await db.query('SELECT local_date::text AS date,meal_type,foods FROM nutrition_meal WHERE user_id=$1 AND local_date BETWEEN $2 AND $3',[req.user.sub,from,to])).rows;
    const point = (date:string,label:string,selected:any[]) => { const t=totalFoods(selected.flatMap(row=>row.foods));return {date,label,intake_kcal:t.kcal,carbs_g:t.carbs_g,protein_g:t.protein_g,fat_g:t.fat_g,has_records:selected.length>0}; };
    const series = period === 'day' ? recordMealTypes.map(type=>point(day,type,rows.filter(row=>row.meal_type===type))) : Array.from({length:Math.round((Date.parse(to)-Date.parse(from))/86400000)+1},(_,index)=>{const d=shiftDay(from,index);return point(d,d.slice(5),rows.filter(row=>row.date===d));});
    return result({from,to,period,series,total_intake_kcal:totalFoods(rows.flatMap(row=>row.foods)).kcal});
  });
  app.post('/api/nutrition/plans/generate',options(obj({style:{type:'string',enum:['easy','balanced','precise']},start_date:dateSchema,locale:localeSchema,consent:{type:'boolean'},request_key:uuid})),async (req,reply)=>{const data=await admit(req.user.sub,'plan',req.body);reply.code(202);return result(data);});
  app.get('/api/nutrition/plans',options(),async req=>{
    await expire(req.user.sub);
    const rows=(await db.query("SELECT id,kind,status,proposal,error_code,created_at,updated_at FROM nutrition_job WHERE user_id=$1 AND kind='plan' ORDER BY (status='active') DESC,created_at DESC LIMIT 10",[req.user.sub])).rows;
    const slots=(await db.query('SELECT plan_id,local_date::text AS date,plan_slot AS meal_type FROM nutrition_meal WHERE user_id=$1 AND plan_id IS NOT NULL',[req.user.sub])).rows;
    for(const row of rows)row.checkins=slots.filter(slot=>slot.plan_id===row.id).map(({date,meal_type})=>({date,meal_type}));
    return result(rows);
  });
  app.get('/api/nutrition/plans/:id',pathOptions(),async req=>result(await publicJob((req.params as any).id,req.user.sub,'plan')));
  app.post('/api/nutrition/plans/:id/activate',pathOptions(obj({confirm:{type:'boolean',const:true}})),async req=>{
    const id=(req.params as any).id;
    await db.transaction(async tx=>{
      await lock(tx,req.user.sub);
      const row=(await tx.query("SELECT * FROM nutrition_job WHERE id=$1 AND user_id=$2 AND kind='plan' FOR UPDATE",[id,req.user.sub])).rows[0];
      if(!row)fail('NOT_FOUND',404);
      const p=await profile(req.user.sub,tx);
      if(!p || p.version!==row.profile_version)fail('NUTRITION_PROFILE_CHANGED',409);
      if(p.has_conditions)fail('NUTRITION_HEALTH_REVIEW_REQUIRED');
      if(row.status==='active')return;
      if(!['draft','archived'].includes(row.status))fail('NUTRITION_PLAN_NOT_READY',409);
      const start=row.proposal?.days?.[0]?.date;
      validateNutritionProposal(row.proposal,profileData(p),start);
      if(row.proposal.days.at(-1)!.date<today())fail('NUTRITION_PLAN_EXPIRED',409);
      await tx.query("UPDATE nutrition_job SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND kind='plan' AND status='active'",[req.user.sub]);
      await tx.query("UPDATE nutrition_job SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2",[id,req.user.sub]);
    });return result(await publicJob(id,req.user.sub,'plan'));
  });
  app.post('/api/nutrition/plans/:id/checkins',pathOptions(obj({date:dateSchema,meal_type:{type:'string',enum:mealTypes},request_key:uuid})),async (req,reply)=>{
    const id=(req.params as any).id,body=req.body as any;
    const data=await db.transaction(async tx=>{
      await lock(tx,req.user.sub);validDay(body.date);
      const plan=(await tx.query("SELECT proposal,status FROM nutrition_job WHERE id=$1 AND user_id=$2 AND kind='plan'",[id,req.user.sub])).rows[0];
      if(!plan)fail('NOT_FOUND',404);
      if(plan.status!=='active')fail('NUTRITION_PLAN_NOT_ACTIVE',409);
      const existing=(await tx.query('SELECT id FROM nutrition_meal WHERE user_id=$1 AND plan_id=$2 AND local_date=$3 AND plan_slot=$4',[req.user.sub,id,body.date,body.meal_type])).rows[0];
      if(existing)return meal(existing.id,req.user.sub,tx);
      const slot=plan.proposal.days.find((d:any)=>d.date===body.date)?.meals.find((m:any)=>m.meal_type===body.meal_type);
      if(!slot)fail('NUTRITION_PLAN_SLOT_NOT_FOUND',404);
      return saveMeal(req.user.sub,{...body,plan_id:id,foods:slot.foods,note:slot.title},tx);
    });reply.code(201);return result(data);
  });
  return {async close(){for(const value of controllers.values())value.controller.abort();await Promise.allSettled([...pending]);}};
}
