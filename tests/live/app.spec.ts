import {test,expect} from '@playwright/test';
test('Real API and persistent database support the complete browser workflow',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();await expect(page.getByText('Morning flow',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'创建计划',exact:false}).first().click();await page.locator('.dialog .field').filter({hasText:'计划名称'}).locator('input').fill('真实接口联调');await page.getByRole('button',{name:'保存',exact:true}).click();
 const row=page.locator('.session-row').filter({hasText:'真实接口联调'});await expect(row).toBeVisible();await row.getByRole('button',{name:'去打卡'}).click();await page.locator('.dialog input').first().fill('37');await page.getByRole('button',{name:'完成打卡',exact:true}).click();await expect(row.getByRole('button',{name:'已完成'})).toBeDisabled();
 await page.reload();await expect(page.locator('.session-row').filter({hasText:'真实接口联调'}).getByRole('button',{name:'已完成'})).toBeDisabled();
 await page.locator('.sidebar').getByRole('button',{name:'运动数据',exact:true}).click();await expect(page.locator('.history').getByText('37 分钟')).toBeVisible();await expect(page.locator('.metric-value').first()).toHaveText('37');await page.screenshot({path:'docs/screenshots/live-stats-desktop.png',fullPage:true});
});
