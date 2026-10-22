import { Ajv } from "ajv";

const object = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, properties,
  required: Object.keys(properties),
});
const text = (maxLength: number, minLength = 1) => ({ type: "string", minLength, maxLength });
const number = (minimum: number, maximum: number) => ({ type: "number", minimum, maximum });
export const mealTypes = ["breakfast", "lunch", "dinner"] as const;
export const nutritionStyles = ["easy", "balanced", "precise"] as const;
export type MealType = typeof mealTypes[number];
export type NutritionStyle = typeof nutritionStyles[number];
export type NutritionProfile = {
  age: number; height_cm: number; weight_kg: number; sex: "male" | "female";
  goal: "lose" | "maintain" | "gain";
  activity_level: "sedentary" | "light" | "moderate";
  allergies: string; preferences: string; has_conditions: boolean;
};
export type Food = { name: string; grams: number; carbs_g: number; protein_g: number; fat_g: number };
export type FoodTotals = { grams: number; carbs_g: number; protein_g: number; fat_g: number; kcal: number };
export type NutritionAnalysis = { foods: Food[]; summary: string; warnings: string[] };
export type NutritionMeal = { meal_type: MealType; title: string; foods: Food[]; instructions: string };
export type NutritionProposal = {
  title: string; style: NutritionStyle; summary: string; target_kcal: number;
  days: { date: string; meals: NutritionMeal[] }[];
};
export const profileSchema = object({
  age: { type: "integer", minimum: 18, maximum: 100 },
  height_cm: number(120, 230), weight_kg: number(35, 300),
  sex: { type: "string", enum: ["male", "female"] },
  goal: { type: "string", enum: ["lose", "maintain", "gain"] },
  activity_level: { type: "string", enum: ["sedentary", "light", "moderate"] },
  allergies: text(500, 0), preferences: text(500, 0), has_conditions: { type: "boolean" },
});
export const foodSchema = object({
  name: text(100), grams: { type: "number", exclusiveMinimum: 0, maximum: 2000 },
  carbs_g: number(0, 500), protein_g: number(0, 500), fat_g: number(0, 500),
});
export const foodsSchema = { type: "array", minItems: 1, maxItems: 20, items: foodSchema };
export const analysisSchema = object({
  foods: { ...foodsSchema, minItems: 0 }, summary: text(1000),
  warnings: { type: "array", maxItems: 8, items: text(300) },
});
export const proposalSchema = object({
  title: text(100), style: { type: "string", enum: [...nutritionStyles] },
  summary: text(1600), target_kcal: { type: "integer", minimum: 1200, maximum: 8000 },
  days: {
    type: "array", minItems: 7, maxItems: 7,
    items: object({
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      meals: { type: "array", minItems: 3, maxItems: 3, items: object({
        meal_type: { type: "string", enum: [...mealTypes] }, title: text(100),
        foods: foodsSchema, instructions: text(800),
      }) },
    }),
  },
});
const ajv = new Ajv({ allErrors: true, coerceTypes: false, removeAdditional: false });
export const checkProfile = ajv.compile(profileSchema);
export const checkFoods = ajv.compile(foodsSchema);
export const checkAnalysis = ajv.compile(analysisSchema);
export const checkNutritionProposal = ajv.compile(proposalSchema);
