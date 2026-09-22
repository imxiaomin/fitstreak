# 数据库设计

目标：PostgreSQL 17。字符数据采用 UTF-8，时刻存储为 TIMESTAMPTZ，业务日期存储 DATE。主键由应用生成 UUID。生产环境通过 DATABASE_URL 连接，开发默认 PGlite 文件数据库。

## 数据字典

|表|字段|类型与约束|含义|
|---|---|---|---|
|app_user|id|UUID PK|用户标识|
|app_user|open_id|VARCHAR(128) UNIQUE NOT NULL|仅服务端获取的微信身份；开发有 demo 前缀|
|app_user|nickname|VARCHAR(40) NOT NULL|昵称|
|app_user|locale|VARCHAR(5) CHECK|zh-CN 或 en|
|app_user|timezone|VARCHAR(64)|固定 Asia/Shanghai，当前不提供用户修改|
|app_user|weekly_goal|SMALLINT CHECK 1..7|每周目标运动天数|
|app_user|created_at|TIMESTAMPTZ|注册时间|
|fitness_plan|id|UUID PK|计划标识|
|fitness_plan|user_id|UUID FK|归属用户|
|fitness_plan|title|VARCHAR(80) 非空白|计划名称|
|fitness_plan|activity|VARCHAR(16) CHECK|run/strength/yoga/walk/cycle|
|fitness_plan|target_minutes|SMALLINT CHECK 1..600|每次目标分钟|
|fitness_plan|weekdays|SMALLINT[]|ISO 星期 1..7；API 校验去重|
|fitness_plan|start_date/end_date|DATE|开始必填，结束可空，不早于开始|
|fitness_plan|archived_at|TIMESTAMPTZ NULL|为空表示有效；归档时间|
|fitness_plan|created_at|TIMESTAMPTZ|创建时间|
|checkin|id|UUID PK|打卡标识|
|checkin|user_id/plan_id|UUID 复合外键|确保打卡用户即计划所有者|
|checkin|local_date|DATE|服务端计算的北京时间日期|
|checkin|duration_minutes|SMALLINT CHECK 1..600|实际运动分钟|
|checkin|note|VARCHAR(500)|训练备注，可空字符串|
|checkin|plan_title/activity|VARCHAR|打卡时的计划信息快照|
|checkin|created_at|TIMESTAMPTZ|提交时间|
|article|id|UUID PK|文章标识|
|article|category|VARCHAR(16) CHECK|training/recovery/habits|
|article|reading_minutes|SMALLINT > 0|预计阅读分钟|
|article|published_at|TIMESTAMPTZ|发布时间|
|article_translation|article_id/locale|复合 PK，文章 FK|同一文章每种语言一份|
|article_translation|title|VARCHAR(120)|翻译标题|
|article_translation|summary|VARCHAR(300)|摘要|
|article_translation|body|TEXT|纯文本正文|

## 完整性与统计

`checkin(user_id, plan_id, local_date)` 唯一约束阻止重复打卡；`(plan_id,user_id)` 外键阻止跨用户归属。计划按所有者和创建时间建索引，打卡按所有者及业务日期建索引。统计不持久化冗余计数，直接聚合打卡数据，避免缓存与原始记录不一致。

一个用户有零至多个计划和打卡；一个计划属于一个用户，有零至多条打卡。文章有零至多个翻译，种子数据保证中文及英文齐全。文章目前由版本化 SQL 维护，无后台 CMS。

按天汇总用 SUM(duration_minutes)；打卡次数用 COUNT(*)；运动天数用 COUNT(DISTINCT local_date)。连续天数从今天（无打卡时从昨天）逆向逐日计算，不按计划分别计算。计划归档后历史仍参与统计。

## 初始化与维护

依次运行 `001_schema.sql`、`002_seed.sql` 和 `004_ai_coach.sql`，均为可重入初始化。后续结构升级应新增编号迁移文件，不修改已部署版本。`003_queries.sql` 为参数化查询示例，不能把用户输入拼接成 SQL。

## AI 教练扩展（2026-09-22）

|表 / 字段|用途|
|---|---|
|health_profile|用户一对一档案：JSONB 健康与训练偏好、版本 UUID、AI 使用授权、更新时间|
|agent_run|用户会话、幂等请求键、档案版本、状态、草稿、工具摘要、用量和已创建计划 ID|
|fitness_plan.agent_run_id|可空的生成会话外键，删除会话时置空并保留计划|
|plan_exercise|以计划 ID 与位置为复合主键，保存动作、组数、次数或时长及组间休息|

SQL 完整字段、约束和索引见 `database/004_ai_coach.sql`；关系源文件为 `docs/diagrams/ai-coach-er.mmd`。API 启动迁移使用 PostgreSQL advisory lock，避免并行启动时重复 DDL 冲突。确认计划采用同一连接事务，动作明细失败则整批回滚。授权、删除和运行限制见 [AI 教练说明](ai-coach.md)。

演示和测试账号由应用在隔离数据库生成，不写入生产种子。备份使用 PostgreSQL `pg_dump`，恢复至独立数据库后检查用户数、计划数、打卡总分钟及外键约束。PGlite 测试不覆盖真实 PostgreSQL 的连接池、备份与并发性能，应在部署验收时补测。
