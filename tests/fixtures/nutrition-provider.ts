// Test-only DeepSeek transport. No production module imports this file.
import { shiftDay } from '../../apps/api/src/domain.js';
export function nutritionTransport(): typeof fetch {
  return (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const user = body.messages.find((m: any) => m.role === 'user');
    let result: any;
    if (Array.isArray(user.content)) {
      const description = JSON.parse(user.content[0].text).description;
      result = description.includes('无食物')
        ? { foods: [], summary: '没有可识别食物', warnings: ['请重新拍摄。'] }
        : { foods: [{ name: '米饭', grams: 150, carbs_g: 42, protein_g: 4, fat_g: 0.5 }, { name: '鸡胸肉', grams: 100, carbs_g: 0, protein_g: 30, fat_g: 3 }], summary: '测试识别结果，请校正份量。', warnings: ['份量和用油为估算。'] };
    } else {
      const input = JSON.parse(user.content);
      const target = input.target_kcal;
      const protein = input.profile.weight_kg * 1.4 / 3;
      const fat = target * 0.3 / 9 / 3;
      const carbs = (target / 3 - protein * 4 - fat * 9) / 4;
      result = { title: '七日均衡饮食', style: input.style, summary: '测试饮食计划：规律三餐，复核过敏原。', target_kcal: target,
        days: Array.from({ length: 7 }, (_, i) => ({ date: shiftDay(input.start_date, i), meals: ['breakfast', 'lunch', 'dinner'].map(meal_type => ({ meal_type, title: '均衡餐盘', foods: [{ name: '谷物鸡肉蔬菜餐盘', grams: 600, carbs_g: carbs, protein_g: protein, fat_g: fat }], instructions: '按份量备餐，熟透后食用。' })) })) };
    }
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } }], usage: { total_tokens: 800 } }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}
