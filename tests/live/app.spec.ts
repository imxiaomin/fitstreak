import {test,expect} from '@playwright/test';
test('Real API and persistent database support the complete browser workflow',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();await expect(page.getByText('Morning flow',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'创建计划',exact:false}).first().click();await page.locator('.dialog .field').filter({hasText:'计划名称'}).locator('input').fill('真实接口联调');await page.getByRole('button',{name:'保存',exact:true}).click();
 const row=page.locator('.session-row').filter({hasText:'真实接口联调'});await expect(row).toBeVisible();await row.getByRole('button',{name:'去打卡'}).click();await page.locator('.dialog input').first().fill('37');await page.getByRole('button',{name:'完成打卡',exact:true}).click();await expect(row.getByRole('button',{name:'已完成'})).toBeDisabled();
 await page.reload();await expect(page.locator('.session-row').filter({hasText:'真实接口联调'}).getByRole('button',{name:'已完成'})).toBeDisabled();
 await page.locator('.sidebar').getByRole('button',{name:'运动数据',exact:true}).click();await expect(page.locator('.history').getByText('37 分钟')).toBeVisible();await expect(page.locator('.metric-value').first()).toHaveText('37');await page.screenshot({path:'docs/screenshots/live-stats-desktop.png',fullPage:true});
 await page.locator('.sidebar').getByRole('button',{name:'个人中心',exact:true}).click();
 await page.locator('.preferences .field').filter({hasText:'昵称'}).locator('input').fill('偏好保存验证');
 await page.locator('.preferences .field').filter({hasText:'每周目标（天）'}).locator('input').fill('6');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/me')&&r.request().method()==='PATCH');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 expect((await saved).status()).toBe(200);
 await expect(page.locator('.profile-card .card-title')).toHaveText('偏好保存验证');
 await expect(page.locator('.error-banner')).toHaveCount(0);
 await page.reload();
 await page.locator('.sidebar').getByRole('button',{name:'个人中心',exact:true}).click();
 await expect(page.locator('.preferences .field').filter({hasText:'昵称'}).locator('input')).toHaveValue('偏好保存验证');
 await expect(page.locator('.preferences .field').filter({hasText:'每周目标（天）'}).locator('input')).toHaveValue('6');
});

for(const width of [375,1440])test(`Archive confirmation reports failures and persists success at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:980});await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();
 const menu=page.locator(width<=760?'.mobile-nav':'.sidebar');await menu.getByRole('button',{name:'训练计划',exact:true}).click();
 const card=page.locator('.plan-card').filter({hasText:'Morning flow'});await card.getByRole('button',{name:'归档',exact:true}).click();
 await page.route('**/api/plans/*',async route=>{if(route.request().method()==='DELETE')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'INTERNAL_ERROR'}})});else await route.continue();});
 await page.locator('.confirm-dialog').getByRole('button',{name:'归档',exact:true}).click();await expect(page.locator('.archive-error')).toBeVisible();await expect(card).toBeVisible();await page.unroute('**/api/plans/*');
 const response=page.waitForResponse(r=>r.request().method()==='DELETE'&&r.url().includes('/api/plans/'));await page.locator('.confirm-dialog').getByRole('button',{name:'归档',exact:true}).click();const archived=await response;expect(archived.status(),await archived.text()).toBe(200);
 await expect(page.locator('.confirm-dialog')).toHaveCount(0);await expect(card).toHaveCount(0);await page.reload();await menu.getByRole('button',{name:'训练计划',exact:true}).click();await expect(card).toHaveCount(0);
});
