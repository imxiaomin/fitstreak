import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
test.beforeEach(async({request})=>{await request.get('http://127.0.0.1:3001/__reset');});
async function login(page:any){await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();await expect(page.getByText('今天，也为自己动起来。')).toBeVisible();}
for(const width of [375,768,1440])test(`FR-11 responsive ${width}px and bilingual navigation`,async({page})=>{
 await page.setViewportSize({width,height:980});await login(page);await expect(page.getByText('晨间舒展 · Morning flow').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:`docs/screenshots/home-${width}-zh.png`,fullPage:true});
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByText('A little stronger, every day.')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`docs/screenshots/home-${width}-en.png`,fullPage:true});
});
test('FR-02/04 create plan, check in, stats, edit and archive',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await login(page);await page.getByRole('button',{name:'创建计划',exact:false}).first().click();
 await page.getByPlaceholder('计划名称',{exact:true}).fill('E2E workout');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('E2E workout').first()).toBeVisible();
 const row=page.locator('.session-row').filter({hasText:'E2E workout'});await row.getByRole('button',{name:'去打卡'}).click();await page.getByPlaceholder('实际运动时长（分钟）').fill('42');await page.getByRole('button',{name:'完成打卡',exact:true}).click();await expect(row.getByRole('button',{name:'已完成'})).toBeDisabled();
 await page.locator('.sidebar').getByRole('button',{name:'运动数据',exact:true}).click();await expect(page.locator('.history').getByText('42 分钟')).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:'训练计划',exact:true}).click();const card=page.locator('.plan-card').filter({hasText:'E2E workout'});await card.getByRole('button',{name:'编辑',exact:true}).click();await page.getByPlaceholder('计划名称',{exact:true}).fill('Updated E2E');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.locator('.plan-card').filter({hasText:'Updated E2E'}).getByRole('button',{name:'归档',exact:true}).click();await page.locator('.confirm-dialog').getByRole('button',{name:'归档',exact:true}).click();await expect(page.getByText('Updated E2E',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'docs/screenshots/plans-desktop.png',fullPage:true});
});
test('FR-08/09 knowledge translation and profile persistence',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await login(page);await page.locator('.sidebar').getByRole('button',{name:'健身知识',exact:true}).click();await page.getByText('让运动成为日常的一部分',{exact:true}).click();await expect(page.locator('.article-body')).toBeVisible();await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.getByText('Make movement part of your day',{exact:true})).toBeVisible();await page.screenshot({path:'docs/screenshots/article-en.png',fullPage:true});
 await page.locator('.sidebar').getByRole('button',{name:'Profile',exact:true}).click();await page.getByPlaceholder('Display name').fill('Lin');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.locator('.profile-card').getByText('Lin',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('A little stronger, every day.')).toBeVisible();
});
test('FR-10 network error retry preserves page and clears error',async({page,request})=>{await login(page);await request.get('http://127.0.0.1:3001/__reset?scenario=error');await page.reload();await expect(page.locator('.error-banner')).toBeVisible();await request.get('http://127.0.0.1:3001/__reset');await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator('.error-banner')).toHaveCount(0);});
test('FR-10 empty state and invalid input keep form',async({page,request})=>{await request.get('http://127.0.0.1:3001/__reset?scenario=empty');await login(page);await expect(page.getByText('还没有训练计划',{exact:true})).toBeVisible();await page.getByRole('button',{name:'创建计划',exact:false}).first().click();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByText('请检查必填项和数值范围。')).toBeVisible();await expect(page.locator('.dialog')).toBeVisible();});
