BEGIN;
INSERT INTO article(id,category,reading_minutes) VALUES
 ('10000000-0000-4000-8000-000000000001','habits',3),
 ('10000000-0000-4000-8000-000000000002','training',4),
 ('10000000-0000-4000-8000-000000000003','recovery',3)
ON CONFLICT(id) DO NOTHING;
INSERT INTO article_translation(article_id,locale,title,summary,body) VALUES
 ('10000000-0000-4000-8000-000000000001','zh-CN','让运动成为日常的一部分','从一项清晰的小计划开始，给每次坚持留下一条记录。','把运动安排在每天容易记住的时间，例如下班后。\n\n先选择一项容易执行的任务，再根据实际完成情况调整目标。记录运动时间和感受，有助于回顾哪些安排适合自己。\n\n偶尔中断时，可以从下一次计划继续。这里的打卡用于个人记录，不代表对运动效果的评价。'),
 ('10000000-0000-4000-8000-000000000001','en','Make movement part of your day','Start with a clear, manageable plan and record each step.','Attach your session to a familiar moment in your day, such as after work.\n\nChoose an achievable task and adjust it based on your experience. Recording time and a short reflection helps you understand which routines work for you.\n\nIf you miss a day, continue with your next planned session. A check-in is a personal record, not a measure of fitness outcomes.'),
 ('10000000-0000-4000-8000-000000000002','zh-CN','给每一次训练一个清晰目标','运动项目、计划时长和执行日期，让计划更容易落实。','创建计划时，为任务起一个具体的名字，例如午后散步。\n\n填写预计时长，并选择真正有空的日期。完成后记录实际时长，计划值与实际值可以不同。\n\n回顾一周的记录，找到容易执行的时段，逐步形成适合自己的安排。'),
 ('10000000-0000-4000-8000-000000000002','en','Give each session a clear goal','An activity, a duration and a date make a plan easier to follow.','Use a specific name, such as afternoon walk, when creating a plan.\n\nChoose a target duration and days that fit your schedule. Record the actual duration afterward; it may differ from the target.\n\nReview your weekly records to find the times that work best for you.'),
 ('10000000-0000-4000-8000-000000000003','zh-CN','为休息留出位置','回顾训练感受，合理安排下一次运动。','记录不只包括完成次数。也可以在备注中写下训练后的感受。\n\n安排下一次计划时，结合自己的状态和日程，给休息留出空间。\n\n本栏目提供一般记录与习惯管理知识，不提供个体化训练处方。'),
 ('10000000-0000-4000-8000-000000000003','en','Leave room for rest','Reflect on your sessions when planning what comes next.','A useful record includes more than a count. Add a short note about how your session felt.\n\nConsider your own experience and schedule when making your next plan, and leave space for rest.\n\nThis section shares general information about recording and habits, not personalized training prescriptions.')
ON CONFLICT(article_id,locale) DO NOTHING;
COMMIT;
