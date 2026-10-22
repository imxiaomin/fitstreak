import { AgentError, validDate, type PlanIssue } from "../agent/schema.js";
import { shiftDay } from "../domain.js";
import {
  checkFoods, checkNutritionProposal, checkProfile, mealTypes,
  type Food, type FoodTotals, type NutritionProfile, type NutritionProposal,
} from "./schema.js";

export function validateProfile(value: unknown): asserts value is NutritionProfile {
  if (!checkProfile(value)) throw new AgentError("NUTRITION_INVALID_PROFILE", 400);
}
export function ensureNutritionEligible(profile: NutritionProfile) {
  validateProfile(profile);
  if (profile.has_conditions) throw new AgentError("NUTRITION_REVIEW_REQUIRED", 422);
}
/** Mifflin–St Jeor estimate in kcal/day; formula sex is an explicit profile input. */
export function bmr(profile: NutritionProfile): number {
  validateProfile(profile);
  return Math.round(10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + (profile.sex === "male" ? 5 : -161));
}
/** Activity factor already includes habitual movement: do not add exercise again to this target. */
export function nutritionTarget(profile: NutritionProfile): number {
  const factors = { sedentary: 1.2, light: 1.375, moderate: 1.55 };
  const adjustments = { lose: -300, maintain: 0, gain: 200 };
  return Math.max(profile.sex === "male" ? 1500 : 1200, Math.round(bmr(profile) * factors[profile.activity_level] + adjustments[profile.goal]));
}
const oneDecimal = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
/** Planning guide only. The model must select real foods/portions; generated nutrients remain independently validated. */
export function nutritionMacroTargets(profile: NutritionProfile) {
  const kcal = nutritionTarget(profile);
  const protein_g = oneDecimal(Math.min(profile.weight_kg * 1.4, 350));
  const fat_g = oneDecimal(kcal * 0.3 / 9);
  const carbs_g = oneDecimal((kcal - protein_g * 4 - fat_g * 9) / 4);
  return { kcal, carbs_g, protein_g, fat_g };
}
export function totalFoods(foods: readonly Food[]): FoodTotals {
  const result = foods.reduce((sum, food) => ({
    grams: sum.grams + food.grams, carbs_g: sum.carbs_g + food.carbs_g,
    protein_g: sum.protein_g + food.protein_g, fat_g: sum.fat_g + food.fat_g,
  }), { grams: 0, carbs_g: 0, protein_g: 0, fat_g: 0 });
  // Calories are always recomputed from macros, never accepted from an AI response.
  return { grams: oneDecimal(result.grams), carbs_g: oneDecimal(result.carbs_g), protein_g: oneDecimal(result.protein_g), fat_g: oneDecimal(result.fat_g), kcal: Math.round(result.carbs_g * 4 + result.protein_g * 4 + result.fat_g * 9) };
}
export function validateFoods(value: unknown): asserts value is Food[] {
  if (!checkFoods(value)) throw new AgentError("NUTRITION_INVALID_FOODS", 422);
  const foods = value as Food[];
  if (foods.some(food => !food.name.trim() || food.carbs_g + food.protein_g + food.fat_g > food.grams + 0.5))
    throw new AgentError("NUTRITION_INVALID_FOODS", 422);
  const totals = totalFoods(foods);
  if (totals.grams > 6000 || totals.kcal > 9000 || totals.carbs_g > 1500 || totals.protein_g > 750 || totals.fat_g > 750)
    throw new AgentError("NUTRITION_INVALID_FOODS", 422);
}
/** NET activity energy, excluding the resting portion already included in BMR. */
export function exerciseKcal(activity: string, minutes: number, weight: number): number {
  const met: Record<string, number> = { run: 8, strength: 3.5, yoga: 2.5, walk: 3.5, cycle: 6 };
  if (!Object.hasOwn(met, activity) || !Number.isFinite(minutes) || minutes < 0 || minutes > 1440 || !Number.isFinite(weight) || weight < 35 || weight > 300)
    throw new AgentError("NUTRITION_INVALID_ACTIVITY", 400);
  return Math.round((met[activity] - 1) * 3.5 * weight / 200 * minutes);
}
export function validateNutritionProposal(value: unknown, profile: NutritionProfile, startDate: string): asserts value is NutritionProposal {
  ensureNutritionEligible(profile);
  if (!validDate(startDate)) throw new AgentError("NUTRITION_INVALID_DATE", 400);
  if (!checkNutritionProposal(value)) {
    const issues = (checkNutritionProposal.errors ?? []).slice(0, 8).map(error => ({
      zh: `饮食草稿字段 ${error.instancePath || "/"} 不符合要求（${error.keyword}）：${JSON.stringify(error.params)}。`,
      en: `Nutrition draft field ${error.instancePath || "/"}: ${error.message}; ${JSON.stringify(error.params)}.`,
    }));
    const days = (value as any)?.days;
    if (Array.isArray(days) && days.length !== 7) issues.unshift({
      zh: `实际生成 ${days.length} 天，必须仅生成 ${startDate} 至 ${shiftDay(startDate, 6)} 的 7 天。不要添加第 8 天。`,
      en: `Received ${days.length} days; return exactly 7 days, ${startDate} through ${shiftDay(startDate, 6)} inclusive. No eighth day.`,
    });
    throw new AgentError("NUTRITION_INVALID_PLAN", 422, issues);
  }
  const plan = value as NutritionProposal;
  const target = nutritionTarget(profile), floor = profile.sex === "male" ? 1500 : 1200;
  // A conservative keyword guard complements the model prompt; it cannot detect hidden ingredients.
  const allergens = [
    { label: "花生 / peanut", declaration: /花生|\bpeanuts?\b/i, foods: /花生|\bpeanuts?\b/i },
    { label: "奶 / dairy", declaration: /牛奶|乳|奶|\bdairy\b|\bmilk\b/i, foods: /奶|乳|芝士|\bmilk\b|\bdairy\b|\bcheese\b|\byogh?urt\b|\bwhey\b|\bcream\b|\bbutter\b/i },
    { label: "蛋 / egg", declaration: /鸡蛋|鸭蛋|鹌鹑蛋|蛋类|\beggs?\b/i, foods: /鸡蛋|鸭蛋|鹌鹑蛋|蛋黄|蛋清|蛋液|煎蛋|炒蛋|蒸蛋|\beggs?\b|\bomelet(?:te)?\b/i },
    { label: "甲壳类 / shellfish", declaration: /虾|蟹|贝|海鲜|\bshellfish\b|\bshrimp\b|\bprawn\b|\bcrab\b/i, foods: /虾|蟹|蛤|蚬|蚌|牡蛎|生蚝|扇贝|龙虾|\bshrimp\b|\bprawns?\b|\bcrab\b|\blobster\b|\bclams?\b|\bmussels?\b|\boysters?\b|\bscallops?\b/i },
    { label: "坚果 / nuts", declaration: /坚果|核桃|杏仁|腰果|\bnuts?\b|\balmonds?\b|\bwalnuts?\b/i, foods: /坚果|核桃|杏仁|腰果|榛子|开心果|碧根果|花生|\bnuts?\b|\bpeanuts?\b|\balmonds?\b|\bwalnuts?\b|\bcashews?\b|\bpistachios?\b|\bhazelnuts?\b|\bpecans?\b/i },
    { label: "大豆 / soy", declaration: /大豆|黄豆|豆制品|\bsoy\b|\bsoya\b/i, foods: /大豆|黄豆|豆腐|豆浆|豆干|毛豆|酱油|味噌|\bsoy\b|\bsoya\b|\btofu\b|\bedamame\b|\bmiso\b|\btempeh\b/i },
    { label: "小麦 / wheat", declaration: /小麦|麸质|\bwheat\b|\bgluten\b/i, foods: /小麦|面粉|面包|面条|馒头|饺子|包子|意大利面|乌冬|\bwheat\b|\bflour\b|\bbread\b|\bpasta\b|\bnoodles?\b|\bcouscous\b|\bbulgur\b/i },
    { label: "鱼 / fish", declaration: /鱼|海鲜|\bfish\b/i, foods: /鱼|\bfish\b|\bsalmon\b|\btuna\b|\bcod\b|\btrout\b|\bsardines?\b/i },
  ].filter(allergen => allergen.declaration.test(profile.allergies));
  const issues: PlanIssue[] = [];
  const add = (zh: string, en: string) => issues.push({ zh, en });
  if (!plan.title.trim() || !plan.summary.trim()) add("缺少计划名称或说明。", "Plan title and summary must not be empty.");
  if (plan.target_kcal !== target) add(`每日目标应为 ${target} 千卡。`, `Daily target must be ${target} kcal.`);
  for (const [index, day] of plan.days.entries()) {
    const date = shiftDay(startDate, index);
    if (day.date !== date || !validDate(day.date)) add(`第 ${index + 1} 天日期应为 ${date}。`, `Day ${index + 1} must be ${date}.`);
    if (new Set(day.meals.map(meal => meal.meal_type)).size !== 3 || mealTypes.some(type => !day.meals.some(meal => meal.meal_type === type)))
      add(`${date} 必须包含早餐、午餐和晚餐各一顿。`, `${date} must have one breakfast, lunch and dinner.`);
    const foods: Food[] = [];
    for (const meal of day.meals) {
      if (!meal.title.trim() || !meal.instructions.trim()) add(`${date} 缺少餐食名称或做法。`, `${date} has an empty meal title or instructions.`);
      try { validateFoods(meal.foods); } catch { add(`${date} ${meal.meal_type} 的食物重量或营养数据无效。`, `${date} ${meal.meal_type} has invalid food quantities or nutrients.`); }
      const ingredients = `${meal.title} ${meal.instructions} ${meal.foods.map(food => food.name).join(" ")}`;
      for (const allergen of allergens) if (allergen.foods.test(ingredients))
        add(`${date} 餐食含已声明过敏原关键词：${allergen.label}，请替换并检查配料。`, `${date} contains a declared allergen keyword (${allergen.label}); substitute it and check ingredients.`);
      foods.push(...meal.foods);
    }
    const totals = totalFoods(foods);
    if (totals.kcal < Math.max(floor, target * 0.8) || totals.kcal > target * 1.2)
      add(`${date} 热量 ${totals.kcal} 千卡应在 ${Math.ceil(Math.max(floor, target * 0.8))}～${Math.floor(target * 1.2)} 千卡范围内。`, `${date} calories (${totals.kcal}) must be within 20% of target and above the minimum intake.`);
    if (totals.protein_g < profile.weight_kg * 0.8 || totals.protein_g > Math.min(profile.weight_kg * 2.2, 350))
      add(`${date} 实际蛋白质 ${totals.protein_g} 克，应为 ${oneDecimal(profile.weight_kg * 0.8)}～${oneDecimal(Math.min(profile.weight_kg * 2.2, 350))} 克。`, `${date} protein is ${totals.protein_g} g; required range is ${oneDecimal(profile.weight_kg * 0.8)}–${oneDecimal(Math.min(profile.weight_kg * 2.2, 350))} g.`);
    const fatRatio = totals.kcal ? totals.fat_g * 9 / totals.kcal : 0;
    if (fatRatio < 0.19 || fatRatio > 0.41)
      add(`${date} 实际脂肪 ${totals.fat_g} 克，供能占比 ${oneDecimal(fatRatio * 100)}%，应约为 20%～40%。`, `${date} fat is ${totals.fat_g} g (${oneDecimal(fatRatio * 100)}% of calories); required energy share is approximately 20–40%.`);
    if (totals.grams > 12000 || totals.kcal > 8000) add(`${date} 的单日食物总量过大。`, `${date} exceeds the daily food quantity limit.`);
  }
  if (issues.length) throw new AgentError("NUTRITION_INVALID_PLAN", 422, issues.slice(0, 12));
}
