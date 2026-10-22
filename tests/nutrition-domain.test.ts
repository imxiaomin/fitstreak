import { test } from "node:test";
import assert from "node:assert/strict";
import { bmr, ensureNutritionEligible, exerciseKcal, nutritionTarget, totalFoods, validateFoods, validateNutritionProposal, validateProfile } from "../apps/api/src/nutrition/domain.js";
import { createNutritionProvider } from "../apps/api/src/nutrition/provider.js";
import type { NutritionProfile, NutritionProposal } from "../apps/api/src/nutrition/schema.js";
import { shiftDay } from "../apps/api/src/domain.js";

const profile: NutritionProfile = { age: 30, height_cm: 175, weight_kg: 75, sex: "male", goal: "maintain", activity_level: "light", allergies: "", preferences: "", has_conditions: false };
const food = { name: "Rice, chicken and vegetables", grams: 400, carbs_g: 105, protein_g: 40, fat_g: 25 };
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR90AAAAASUVORK5CYII=";
const start = "2026-10-21";
function proposal(): NutritionProposal {
  return { title: "Practical week", style: "easy", summary: "Simple preparation with weighed edible portions.", target_kcal: nutritionTarget(profile), days: Array.from({ length: 7 }, (_, i) => ({ date: shiftDay(start, i), meals: (["breakfast", "lunch", "dinner"] as const).map(meal_type => ({ meal_type, title: "Rice bowl", foods: [{ ...food }], instructions: "Cook thoroughly and weigh the cooked serving." })) })) };
}
function response(content: unknown, options: { status?: number; finish?: string; role?: string } = {}) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: options.finish ?? "stop", message: { role: options.role ?? "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: options.status ?? 200 });
}
const code = (expected: string) => (error: unknown) => (error as any)?.code === expected;

test("Nutrition profile is strict, adult-only, finite and preserves formula sex", () => {
  validateProfile(profile);
  for (const patch of [{ age: 17 }, { age: 101 }, { age: 30.5 }, { height_cm: 119 }, { weight_kg: 301 }, { weight_kg: NaN }, { sex: "unknown" }, { activity_level: "extreme" }, { allergies: "x".repeat(501) }, { admin: true }])
    assert.throws(() => validateProfile({ ...profile, ...patch }), code("NUTRITION_INVALID_PROFILE"));
  assert.throws(() => ensureNutritionEligible({ ...profile, has_conditions: true }), code("NUTRITION_REVIEW_REQUIRED"));
});
test("BMR and intake target use explicit formula, activity factor and intake floors", () => {
  assert.equal(bmr(profile), 1699);
  assert.equal(bmr({ ...profile, sex: "female" }), 1533);
  assert.equal(nutritionTarget(profile), 2336);
  assert.equal(nutritionTarget({ ...profile, goal: "lose" }), 2036);
  assert.equal(nutritionTarget({ ...profile, goal: "gain" }), 2536);
  assert.equal(nutritionTarget({ ...profile, age: 100, height_cm: 120, weight_kg: 35, activity_level: "sedentary", goal: "lose" }), 1500);
  assert.equal(nutritionTarget({ ...profile, age: 100, height_cm: 120, weight_kg: 35, activity_level: "sedentary", goal: "lose", sex: "female" }), 1200);
});
test("Calories always follow 4/4/9 macros and impossible foods are rejected", () => {
  validateFoods([food]);
  assert.deepEqual(totalFoods([food]), { grams: 400, carbs_g: 105, protein_g: 40, fat_g: 25, kcal: 805 });
  assert.equal(totalFoods([{ ...food, carbs_g: 0.14, protein_g: 0.14, fat_g: 0.14 }]).kcal, 2);
  for (const input of [[], [{ ...food, grams: 10 }], [{ ...food, name: " " }], [{ ...food, fat_g: -1 }], [{ ...food, kcal: 1 }], Array.from({ length: 21 }, () => food), Array.from({ length: 16 }, () => food)])
    assert.throws(() => validateFoods(input), code("NUTRITION_INVALID_FOODS"));
});
test("Exercise estimate excludes resting MET energy and rejects invalid activities", () => {
  assert.equal(exerciseKcal("walk", 30, 75), 98);
  assert.equal(exerciseKcal("run", 30, 75), 276);
  assert.equal(exerciseKcal("strength", 0, 75), 0);
  for (const args of [["__proto__", 30, 75], ["swim", 30, 75], ["walk", NaN, 75], ["walk", -1, 75], ["walk", 1441, 75], ["walk", 30, 0]] as const)
    assert.throws(() => exerciseKcal(...args), code("NUTRITION_INVALID_ACTIVITY"));
});
test("Valid weekly plans have sequential dates, exactly three meals and bounded daily nutrition", () => {
  validateNutritionProposal(proposal(), profile, start);
  for (const mutate of [
    (p: NutritionProposal) => p.days.pop(),
    (p: NutritionProposal) => p.days[1].date = p.days[0].date,
    (p: NutritionProposal) => p.days[0].meals[1].meal_type = "breakfast",
    (p: NutritionProposal) => p.target_kcal = 1200,
    (p: NutritionProposal) => p.days[0].meals[0].foods[0].grams = 5,
    (p: NutritionProposal) => p.days[0].meals.forEach(meal => meal.foods[0].protein_g = 0),
    (p: NutritionProposal) => p.days[0].meals.forEach(meal => { meal.foods[0].fat_g = 0; meal.foods[0].carbs_g = 150; }),
    (p: NutritionProposal) => p.days[0].meals.forEach(meal => { meal.foods[0].fat_g = 5; meal.foods[0].carbs_g = 10; }),
  ]) {
    const value = proposal(); mutate(value);
    assert.throws(() => validateNutritionProposal(value, profile, start), code("NUTRITION_INVALID_PLAN"));
  }
  assert.throws(() => validateNutritionProposal(proposal(), profile, "2026-02-30"), code("NUTRITION_INVALID_DATE"));
});
test("Daily intake itself respects minimum even when 20 percent tolerance would allow less", () => {
  const small = { ...profile, age: 70, height_cm: 140, weight_kg: 45, goal: "lose" as const, activity_level: "sedentary" as const };
  const p = proposal(); p.target_kcal = nutritionTarget(small);
  p.days.forEach(day => day.meals.forEach(meal => { meal.foods = [{ name: "Meal", grams: 400, carbs_g: 60, protein_g: 15, fat_g: 15 }]; })); // 1305 kcal, above 80% of 1500 but below floor
  assert.throws(() => validateNutritionProposal(p, small, start), code("NUTRITION_INVALID_PLAN"));
});
for (const [allergies, ingredient] of [["花生", "Peanut butter"], ["milk", "Greek yoghurt"], ["鸡蛋", "煎蛋"], ["shellfish", "清蒸虾"], ["坚果", "Almonds"], ["soy", "豆腐"], ["小麦", "Whole wheat bread"]])
  test(`Declared allergen keyword rejects ${allergies} -> ${ingredient}`, () => {
    const p = proposal(); p.days[0].meals[0].foods[0].name = ingredient;
    assert.throws(() => validateNutritionProposal(p, { ...profile, allergies }, start), code("NUTRITION_INVALID_PLAN"));
  });
test("Image provider sends official multimodal JSON and validates macro quantities", async () => {
  let body: any;
  const provider = createNutritionProvider({ apiKey: "test-key", visionModel: "deepseek-flash", transport: (async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/chat/completions"); body = JSON.parse(init!.body as string);
    return response({ foods: [food], summary: "A rice meal.", warnings: ["Portion and oil estimates need review."] });
  }) as typeof fetch });
  const result = await provider.analyze({ image_data: image, description: "Lunch", locale: "en-US" });
  assert.equal(totalFoods(result.foods).kcal, 805);
  assert.equal(body.messages[1].content[1].image_url.url, image);
  assert.equal(body.model, "deepseek-flash"); assert.equal(body.max_tokens, 2500);
  assert.equal(body.response_format.type, "json_object");
  assert.match(body.messages[0].content, /English/);
});
test("No food, malformed AI output and truncated output produce distinct failures", async () => {
  for (const [content, finish, expected] of [
    [{ foods: [], summary: "No meal", warnings: ["No recognizable food."] }, "stop", "NUTRITION_NO_FOOD"],
    [{ foods: [{ ...food, grams: 1 }], summary: "Meal", warnings: [] }, "stop", "NUTRITION_INVALID_FOODS"],
    ["not JSON", "stop", "NUTRITION_INVALID_RESPONSE"],
    [{ foods: [food], summary: "Meal", warnings: [] }, "length", "AI_OUTPUT_TRUNCATED"],
  ] as const) {
    const provider = createNutritionProvider({ apiKey: "test-key", transport: (async () => response(content, { finish })) as typeof fetch });
    await assert.rejects(provider.analyze({ image_data: image, description: "", locale: "en" }), code(expected));
  }
});
test("Provider errors distinguish billing, rate limit and overload without exposing response content", async () => {
  for (const [status, expected] of [[401, "AI_AUTH_FAILED"], [402, "AI_PROVIDER_BALANCE_LOW"], [429, "AI_PROVIDER_RATE_LIMITED"], [503, "AI_PROVIDER_BUSY"], [500, "AI_UPSTREAM_ERROR"]] as const) {
    const provider = createNutritionProvider({ apiKey: "test-key", transport: (async () => new Response("private provider detail", { status })) as typeof fetch });
    await assert.rejects(provider.analyze({ image_data: image, description: "", locale: "en" }), error => code(expected)(error) && !JSON.stringify(error).includes("private provider"));
  }
});
test("Unconfigured models and unsafe endpoint/image inputs never produce invented food", async () => {
  assert.throws(() => createNutritionProvider({ baseUrl: "http://api.deepseek.com" }));
  assert.throws(() => createNutritionProvider({ baseUrl: "https://api.deepseek.com.evil.test" }));
  assert.throws(() => createNutritionProvider({ baseUrl: "https://api.deepseek.com:8443" }));
  assert.throws(() => createNutritionProvider({ baseUrl: "https://api.deepseek.com/v1?key=x" }));
  const provider = createNutritionProvider({});
  await assert.rejects(provider.analyze({ image_data: image, description: "", locale: "en" }), code("AI_NOT_CONFIGURED"));
  await assert.rejects(provider.analyze({ image_data: "data:image/svg+xml;base64,aaaa", description: "", locale: "en" }), code("NUTRITION_INVALID_IMAGE"));
});
test("Weekly planner retries one invalid draft with actionable feedback and returns only validated results", async () => {
  let calls = 0; let correction: any;
  const provider = createNutritionProvider({ apiKey: "test-key", transport: (async (_url, init) => {
    calls++; const body = JSON.parse(init!.body as string);
    const user = JSON.parse(body.messages[1].content); assert.equal(user.start_date, start); assert.equal(user.style, "easy");
    const p = proposal(); if (calls === 1) p.days[0].date = "2025-01-01"; else correction = JSON.parse(body.messages.at(-1).content);
    return response(p);
  }) as typeof fetch });
  const result = await provider.plan({ profile, style: "easy", start_date: start, locale: "en" });
  assert.equal(calls, 2); assert.equal(result.days[0].date, start); assert.ok(correction.validation_errors.some((issue: any) => issue.en.includes(start)));
});
test("Invalid retries stay invalid and declared conditions are blocked before network calls", async () => {
  let calls = 0;
  const provider = createNutritionProvider({ apiKey: "test-key", transport: (async () => { calls++; const p = proposal(); p.days[0].date = "2025-01-01"; return response(p); }) as typeof fetch });
  await assert.rejects(provider.plan({ profile, style: "easy", start_date: start, locale: "en" }), code("NUTRITION_INVALID_PLAN"));
  assert.equal(calls, 2);
  await assert.rejects(provider.plan({ profile: { ...profile, has_conditions: true }, style: "easy", start_date: start, locale: "en" }), code("NUTRITION_REVIEW_REQUIRED"));
  await assert.rejects(provider.plan({ profile, style: "easy", start_date: "2026-02-30", locale: "en" }), code("NUTRITION_INVALID_DATE"));
  assert.equal(calls, 2);
});
