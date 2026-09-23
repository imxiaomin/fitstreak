import {test,expect} from '@playwright/test';
for(const width of [375,768,1440])test(`AI coach: consent, preview, confirmed persistence and bilingual layout at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:980});await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();
 const menu=page.locator(width<=760?'.mobile-nav':'.sidebar');await menu.getByRole('button',{name:'AI 教练',exact:true}).click();
 await expect(page.locator('.coach-title')).toHaveText('AI 健身教练');await expect(page.locator('.quota-remaining')).toContainText('6 次');
 await page.locator('.health-age input').fill('28');await page.locator('.health-height_cm input').fill('170');await page.locator('.health-weight_kg input').fill('65');
 await page.locator('.profile-consent').click();await page.locator('.save-health').click();await expect(page.locator('.coach-saved')).toBeVisible();
 await page.locator('.coach-prompt textarea').fill('请帮我制定轻松步行计划');await expect(page.locator('.generate-plan')).toBeDisabled();await page.locator('.run-consent').click();
 await page.locator('.generate-plan').click();await expect(page.locator('.confirm-plan')).toBeVisible({timeout:15000});await expect(page.locator('.quota-remaining')).toContainText('5 次');await expect(page.locator('.coach-tools')).toContainText('校验计划草稿');await page.locator('.view-draft').click();await expect(page.locator('.draft-dialog')).toContainText('AI 轻松步行');await page.locator('.draft-close').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`docs/screenshots/ai-coach-${width}-zh.png`,fullPage:true});
 await page.locator('.confirm-plan').click();await expect(page.locator('.coach-success')).toContainText('已添加计划数：1');
 await page.getByRole('button',{name:'查看训练计划',exact:true}).click();const card=page.locator('.plan-card').filter({hasText:'AI 轻松步行'});await expect(card).toBeVisible();await expect(card).toContainText('480');await expect(card.getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);
 await page.reload();await menu.getByRole('button',{name:'AI 教练',exact:true}).click();await expect(page.locator('.coach-success')).toContainText('已添加计划数：1');await expect(page.locator('.health-age input')).toHaveValue('28');
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.locator('.coach-title')).toHaveText('AI fitness coach');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`docs/screenshots/ai-coach-${width}-en.png`,fullPage:true});
});

for(const width of [375,1440])test(`Follow-up reply is visible and continues its conversation at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:980});await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();
 const menu=page.locator(width<=760?'.mobile-nav':'.sidebar');await menu.getByRole('button',{name:'AI 教练',exact:true}).click();
 await page.locator('.health-age input').fill('28');await page.locator('.health-height_cm input').fill('170');await page.locator('.health-weight_kg input').fill('65');await page.locator('.profile-consent').click();await page.locator('.save-health').click();await expect(page.locator('.coach-saved')).toBeVisible();
 await page.locator('.coach-prompt textarea').fill('请先询问我的偏好');await page.locator('.run-consent').click();await page.locator('.generate-plan').click();
 await expect(page.locator('.coach-reply')).toBeVisible();await expect(page.locator('.coach-ai-message')).toContainText('你希望以步行还是力量训练为主？');
 await page.reload();await menu.getByRole('button',{name:'AI 教练',exact:true}).click();await expect(page.locator('.coach-reply-input textarea')).toBeVisible();
 await page.getByRole('button',{name:'EN',exact:true}).click();await expect(page.locator('.coach-reply')).toContainText('Reply to your AI coach');await page.getByRole('button',{name:'中文',exact:true}).click();
 await page.locator('.coach-reply-input textarea').fill('以轻松步行为主，每次10分钟');await expect(page.getByRole('button',{name:'发送回复并继续',exact:true})).toBeDisabled();await page.locator('.coach-reply .run-consent').click();
 await page.locator('.coach-reply-input').scrollIntoViewIfNeeded();await page.screenshot({path:`docs/screenshots/ai-followup-${width}.png`,fullPage:true});
 const sent=page.waitForRequest(r=>r.url().endsWith('/api/agent/runs')&&r.method()==='POST');await page.getByRole('button',{name:'发送回复并继续',exact:true}).click();const payload=(await sent).postDataJSON();expect(payload.parent_id).toBeTruthy();expect(payload.message).toBe('以轻松步行为主，每次10分钟');
 await expect(page.locator('.confirm-plan')).toBeVisible({timeout:15000});await expect(page.locator('.coach-reply')).toHaveCount(0);
});

test('Failed draft is readable with reasons after reload and cannot be added',async({page})=>{
 await page.setViewportSize({width:375,height:980});await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();await page.locator('.mobile-nav').getByRole('button',{name:'AI 教练',exact:true}).click();
 await page.locator('.health-age input').fill('28');await page.locator('.health-height_cm input').fill('170');await page.locator('.health-weight_kg input').fill('65');await page.locator('.profile-consent').click();await page.locator('.save-health').click();await expect(page.locator('.coach-saved')).toBeVisible();
 await page.locator('.coach-prompt textarea').fill('测试无效草稿');await page.locator('.run-consent').click();await page.locator('.generate-plan').click();await expect(page.locator('.coach-ai-message')).toContainText('生成未完成');
 await page.reload();await page.locator('.mobile-nav').getByRole('button',{name:'AI 教练',exact:true}).click();await page.locator('.view-draft').click();await expect(page.locator('.draft-dialog')).toContainText('未通过校验');await expect(page.locator('.draft-issues')).toContainText('次数填 null');await expect(page.locator('.draft-dialog')).toContainText('AI 轻松步行');await expect(page.locator('.confirm-plan')).toHaveCount(0);await page.screenshot({path:'docs/screenshots/ai-invalid-draft-375.png',fullPage:true});
});

test('Allowance exhaustion is visible and refreshing restores the generate button',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'开始使用',exact:true}).click();await page.locator('.sidebar').getByRole('button',{name:'AI 教练',exact:true}).click();await expect(page.locator('.quota-remaining')).toContainText('6 次');
 await page.locator('.health-age input').fill('28');await page.locator('.health-height_cm input').fill('170');await page.locator('.health-weight_kg input').fill('65');await page.locator('.profile-consent').click();await page.locator('.save-health').click();await expect(page.locator('.coach-saved')).toBeVisible();await page.locator('.coach-prompt textarea').fill('请制定训练计划');await page.locator('.run-consent').click();
 let remaining=0;await page.route('**/api/agent/status',route=>route.fulfill({json:{data:{configured:true,provider:'DeepSeek',model:'fixture',quota:{limit:6,used:6-remaining,remaining,window_minutes:60,next_restore_at:new Date(Date.now()+60000).toISOString()}}}}));
 await page.getByRole('button',{name:'刷新次数',exact:true}).click();await expect(page.locator('.quota-remaining')).toContainText('0 次');await expect(page.locator('.coach-quota')).toContainText('下次恢复1次的时间');await expect(page.locator('.generate-plan')).toBeDisabled();
 remaining=1;await page.getByRole('button',{name:'刷新次数',exact:true}).click();await expect(page.locator('.quota-remaining')).toContainText('1 次');await expect(page.locator('.generate-plan')).toBeEnabled();await expect(page.locator('.coach-prompt textarea')).toHaveValue('请制定训练计划');
});
