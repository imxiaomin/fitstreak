import { foodSchema, profileSchema, proposalSchema } from './schema.js';
const text = { type: 'string' }, number = { type: 'number' }, bool = { type: 'boolean' };
const id = { type: 'string', format: 'uuid' }, date = { type: 'string', format: 'date' };
const nullable = (value: any) => ({ anyOf: [value, { type: 'null' }] });
const object = (properties: Record<string, any>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items: any) => ({ type: 'array', items });
const totals = object({ grams: number, carbs_g: number, protein_g: number, fat_g: number, kcal: number });
const meal = object({ id, date, meal_type: text, foods: list(foodSchema), note: text, analysis_id: nullable(id), plan_id: nullable(id), created_at: text, updated_at: text, totals, photo_available: bool });
const job = object({ id, kind: text, status: text, foods: nullable(list(foodSchema)), summary: text, warnings: list(text), proposal: nullable(proposalSchema), error_code: nullable(text), created_at: text, updated_at: text, photo_available: bool, totals, checkins: list(object({ date, meal_type: text })) }, ['id', 'kind', 'status', 'proposal', 'error_code', 'created_at', 'updated_at']);
const point = object({ date, label: text, intake_kcal: number, carbs_g: number, protein_g: number, fat_g: number, has_records: bool });
export function nutritionResponseFor(url: string, method: string) {
  if (!url.startsWith('/api/nutrition/')) return undefined;
  let data: any;
  if (url.endsWith('/profile')) data = nullable(object({ ...(profileSchema.properties as any), version: id, bmr_kcal: number, target_kcal: number }));
  else if (url.endsWith('/status')) data = object({ configured: bool, model: text, vision_model: text, quota: object({ limit: number, used: number, remaining: number, next_restore_at: nullable(text) }) });
  else if (url.includes('/photos/')) data = object({ image_data: text });
  else if (url.endsWith('/summary')) data = object({ date, bmr_kcal: nullable(number), target_kcal: nullable(number), exercise_kcal: nullable(number), intake_kcal: number, carbs_g: number, protein_g: number, fat_g: number, balance_kcal: nullable(number), has_records: bool, meals_count: number, basis: { type: 'string', enum: ['snapshot', 'current', 'missing'] } });
  else if (url.endsWith('/stats')) data = object({ from: date, to: date, period: text, series: list(point), total_intake_kcal: number });
  else if (url.endsWith('/meals') && method === 'GET') data = object({ meals: list(meal), totals });
  else if (url.includes('/meals') || url.endsWith('/checkins')) data = method === 'DELETE' ? object({ deleted: bool }) : meal;
  else if (url.endsWith('/analyses/:id') && method === 'DELETE') data = object({ deleted: bool });
  else if (url.endsWith('/plans') && method === 'GET') data = list(job);
  else data = job;
  const error = object({ error: object({ code: text, requestId: text }) });
  const response = object({ data });
  return { 200: response, 201: response, 202: response, '4xx': error, '5xx': error };
}
