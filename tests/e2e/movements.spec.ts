import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.get('http://127.0.0.1:3013/__reset');});
for(const width of [375,768,1440])test(`Movement library: ${width}px, frames, filters and English`,async({page})=>{
 await page.setViewportSize({width,height:980});await page.goto('/');
 const menu=page.locator(width<=760?'.mobile-nav':'.sidebar');
 await menu.getByRole('button',{name:'健身知识',exact:true}).click();
 await page.getByRole('button',{name:'动作指南',exact:true}).click();
 await expect(page.locator('.movement-card')).toHaveCount(10);
 await expect(page.locator('.movement-detail .exercise-image img')).toHaveJSProperty('naturalWidth',512);
 await page.getByRole('button',{name:'帧 2',exact:true}).click();
 await expect(page.locator('.movement-stage-top')).toContainText('02 / 03');
 await expect(page.locator('.movement-detail .exercise-image img')).toHaveAttribute('src',/push-up\/frame-2\.png/);
 await page.getByRole('button',{name:'下一帧',exact:true}).click();
 await expect(page.locator('.movement-stage-top')).toContainText('03 / 03');
 await page.getByRole('button',{name:'播放示意',exact:true}).click();
 await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'暂停',exact:true}).click();
 await page.getByRole('button',{name:'伸展',exact:true}).click();
 await expect(page.locator('.movement-card')).toHaveCount(3);
 await page.getByRole('button',{name:'查看动作 猫牛式伸展',exact:true}).click();
 await expect(page.locator('.movement-stage-top')).toContainText('01 / 03');
 await expect(page.locator('.movement-meta .card-title')).toHaveText('猫牛式伸展');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'全部动作',exact:true}).click();
 await page.screenshot({path:`docs/screenshots/movements-${width}-zh.png`,fullPage:true});
 await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(page.locator('.movement-meta .card-title')).toHaveText('Cat-cow stretch');
 await expect(page.locator('.movement-credit')).toContainText('CC BY-SA 4.0');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`docs/screenshots/movements-${width}-en.png`,fullPage:true});
});

test('Category preview changes in plan form; all three frames are served locally',async({page,request})=>{
 await page.setViewportSize({width:1440,height:980});await page.goto('/');
 await page.getByRole('button',{name:'开始使用',exact:true}).click();
 await page.getByRole('button',{name:'创建计划',exact:false}).first().click();
 await page.locator('.activity-picker').getByRole('button',{name:'瑜伽',exact:true}).click();
 await expect(page.locator('.movement-reference-label')).toContainText('猫牛式伸展');
 await page.getByRole('button',{name:'帧 3',exact:true}).click();
 await expect(page.locator('.movement-reference .exercise-image img')).toHaveAttribute('src',/cat-cow-stretch\/frame-3\.png/);
 for(const slug of ['running','walking','cycling','push-up','bodyweight-squat','plank','forward-lunge','cat-cow-stretch','childs-pose','cross-body-shoulder-stretch'])for(let frame=1;frame<=3;frame++){
  const r=await request.get(`/static/exercises/${slug}/frame-${frame}.png`);
  expect(r.status()).toBe(200);expect(r.headers()['content-type']).toContain('image/png');
 }
});

test('Missing exercise image has a readable fallback',async({page})=>{
 await page.route('**/static/exercises/push-up/frame-1.png',route=>route.abort());
 await page.setViewportSize({width:1440,height:980});await page.goto('/');
 await page.locator('.sidebar').getByRole('button',{name:'健身知识',exact:true}).click();
 await page.getByRole('button',{name:'动作指南',exact:true}).click();
 await expect(page.locator('.movement-detail .exercise-fallback')).toHaveText('示意图暂不可用');
});
