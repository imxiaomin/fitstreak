// Explicit paid integration check. Uses synthetic input and a disposable memory DB.
// Never invoked by CI; no user health data, secrets or meal photographs are reported.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildApp } from '../apps/api/src/app.js';
import { database } from '../apps/api/src/db.js';
import { localDate } from '../apps/api/src/domain.js';
process.loadEnvFile('apps/api/.env');
if (!process.env.DEEPSEEK_API_KEY) throw new Error('Configure DEEPSEEK_API_KEY locally first.');
const diagnostic = process.argv.includes('--diagnostic');
const captures: unknown[] = [];
const transport: typeof fetch = async (url, init) => {
  const response = await fetch(url, init);
  if (diagnostic) {
    const value = await response.clone().json().catch(() => null) as any;
    captures.push({ status: response.status, content: value?.choices?.[0]?.message?.content ?? null, error: value?.error ?? null });
    await mkdir('.data', { recursive: true });
    await writeFile('.data/nutrition-live-diagnostic.json', JSON.stringify(captures, null, 2));
  }
  return response;
};
const app = await buildApp({ db: await database(), demo: true,
  secret: 'nutrition-synthetic-live-test-secret-32-characters',
  nutrition: { apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_DIET_MODEL ?? process.env.DEEPSEEK_MODEL,
    visionModel: process.env.DEEPSEEK_VISION_MODEL ?? 'deepseek-flash', transport } });
try {
  const token = (await app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} })).json().data.token;
  const req = (method: any, url: string, payload?: any) => app.inject({ method, url, payload, headers: { authorization: 'Bearer ' + token } });
  const wait = async (resource: string, value: any) => {
    let run = value;
    for (let i = 0; i < 90 && ['queued', 'running'].includes(run.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      run = (await req('GET', `/api/nutrition/${resource}/${run.id}`)).json().data;
    }
    return run;
  };
  const configured = (await req('GET', '/api/nutrition/status')).json().data;
  const blank = await req('POST', '/api/nutrition/analyses', {
    image_data: 'data:image/png;base64,' + (await readFile('apps/web/src/static/icons/nutrition-forest.png')).toString('base64'),
    description: 'This is a synthetic line icon, not a meal photograph. If no actual food is visible, return an empty foods array.',
    locale: 'en', consent: true, request_key: randomUUID(),
  });
  const vision = blank.statusCode === 202 ? await wait('analyses', blank.json().data) : { error_code: blank.json().error?.code };
  await req('PUT', '/api/nutrition/profile', { age: 29, height_cm: 175, weight_kg: 72,
    sex: 'male', goal: 'maintain', activity_level: 'sedentary', allergies: '', preferences: '家常食物，简单备餐', has_conditions: false });
  const day = localDate(new Date());
  const started = await req('POST', '/api/nutrition/plans/generate', { style: 'easy', start_date: day, locale: 'zh-CN', consent: true, request_key: randomUUID() });
  const plan = started.statusCode === 202 ? await wait('plans', started.json().data) : { error_code: started.json().error?.code };
  let activated = false, checkedIn = false;
  if (plan.status === 'draft') {
    activated = (await req('POST', `/api/nutrition/plans/${plan.id}/activate`, { confirm: true })).statusCode === 200;
    if (activated) checkedIn = (await req('POST', `/api/nutrition/plans/${plan.id}/checkins`, { date: day, meal_type: 'breakfast', request_key: randomUUID() })).statusCode === 201;
  }
  const report = { checkedAt: new Date().toISOString(), provider: 'DeepSeek', model: configured.model, visionModel: configured.vision_model,
    syntheticData: true, storage: 'isolated in-memory PGlite',
    vision: { input: 'synthetic line icon', rejectedInventedFood: vision.error_code === 'NUTRITION_NO_FOOD', error: vision.error_code ?? null },
    plan: { status: plan.status ?? 'rejected', error: plan.error_code ?? null, days: plan.proposal?.days?.length ?? 0, activated, checkedIn },
    actualMealAccuracyTested: false };
  await writeFile('docs/deepseek-nutrition-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!report.vision.rejectedInventedFood || !checkedIn) process.exitCode = 1;
} finally { await app.close(); }
