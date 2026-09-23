# DeepSeek AI 健身教练

更新：2026-09-22。新增功能复用现有 uni-app、Fastify、PostgreSQL，不需要另外安装 Agent 框架。

## 本地使用

1. 在 `apps/api/.env` 配置以下变量。已有文件只补充变量，不要覆盖数据库连接、微信配置和 JWT 密钥。

   ```dotenv
   DEEPSEEK_API_KEY=填写自己的密钥
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   DEEPSEEK_MODEL=deepseek-flash
   DEEPSEEK_THINKING=false
   ```

2. 重启 `npm run dev:api`，另一个终端运行 `npm run dev`。后端启动自动执行可重入迁移 `database/004_ai_coach.sql`。
3. 打开 H5 或重新构建、导入微信小程序，在 **AI 教练** 页填写健康与训练档案，保存并授权本次使用。
4. 描述目标，生成草稿。资料不足时，问题下方显示高亮的 **回复 AI 教练** 输入区；填写补充信息、勾选本次授权后点击 **发送回复并继续**。刷新页面后也可继续回复，服务端关联上一轮对话和原计划开始日期。检查日期、动作、组数、次数／时长，点击 **确认并添加训练计划**。计划页与打卡弹窗会显示动作明细。
5. 已确认的 AI 计划可打卡、归档；需要调整时归档并重新生成，避免只修改总时长而动作明细未同步。

密钥只由服务端读取，不进入前端包、浏览器存储或 Git。无密钥时明确提示未配置，不伪造 AI 响应。更换模型可修改 `DEEPSEEK_MODEL`；官方接口地址限制为 `https://api.deepseek.com` 或其 `/v1` 路径。

## 工作流程与工具

架构源文件：[ai-coach-architecture.mmd](diagrams/ai-coach-architecture.mmd)。数据关系源文件：[ai-coach-er.mmd](diagrams/ai-coach-er.mmd)。

1. 前端提交目标和本次授权，服务端鉴权并核对健康档案版本。
2. 后台任务调用 DeepSeek Chat Completions，前端轮询会话状态。
3. 模型通过 `get_health_profile`、`get_training_history`、`search_exercises` 获取当前用户资料。工具不接受任意用户 ID、SQL 或 URL。
4. 模型调用 `propose_training_plan`。服务端校验日期、动作白名单、器械、训练量及现有计划，失败时允许模型在限额内修正；资料不足可调用 `ask_followup`。
5. 合格结果持久化为草稿。用户确认后，后端确认接口调用计划创建逻辑，在同一个事务中写入计划、动作明细及完成状态。

模型只能提出草稿，不能自行确认、替用户打卡或执行任意后端接口。页面展示工具执行摘要，不展示或保存模型内部推理内容。

## 接口

所有下列接口均要求当前用户 Bearer Token。完整请求与响应见 [OpenAPI](api/openapi.json)。

|方法|路径|作用|
|---|---|---|
|GET|`/api/agent/status`|模型名与是否已配置，不返回密钥|
|GET / PUT / DELETE|`/api/health-profile`|读取、保存、删除自己的档案；删除同时清除 AI 会话|
|POST|`/api/agent/runs`|创建后台任务；新任务返回 202；相同 request_key 重试复用会话|
|GET|`/api/agent/runs`|最近 10 条会话|
|GET|`/api/agent/runs/:id`|轮询会话及草稿|
|POST|`/api/agent/runs/:id/cancel`|取消生成或放弃草稿|
|POST|`/api/agent/runs/:id/confirm`|显式确认并原子创建计划，重复确认返回相同计划 ID|

状态：`queued → running → needs_input / draft / failed`；`draft → committed`；活动任务或草稿可以变为 `cancelled`。补充回答以 `parent_id` 引用本人最近选择的提问或草稿，传递上一轮需求与答案；当前不发送无限历史对话。

## 数据与约束

迁移新增 `health_profile`、`agent_run`、`plan_exercise`，并在 `fitness_plan` 新增 `agent_run_id`。档案数据采用 JSONB、版本 UUID；保存档案使未完成任务和旧草稿失效。删除档案与会话保留已生成计划和打卡，关联会话字段置空。

- 适用范围：18 岁及以上的一般健身计划；填写伤病／医疗运动限制时暂停自动规划。系统不提供诊断、治疗或康复处方。
- 每次规划未来七天内 1–5 次训练，每天最多新增一项计划，开始日期为今天至未来 30 天。仅使用项目现有 10 个动作。
- 初学者单日训练预算最高 30 分钟，每动作最多 3 组、每组最多 12 次；力量静态保持每组最高 60 秒。所有用户总预算最高 60 分钟，已有计划计入预算。
- 组数、次数、时长、休息、日期和器械均由服务器验证；次数和时长二选一。草稿有效期 24 小时，确认时再次检查档案版本和当前安排。
- PostgreSQL 用同一连接执行批量事务；按用户锁定确认过程。唯一幂等键防止重复生成，相同草稿重复确认不重复写入；任一动作写入失败则整批回滚。
- 对外只发送授权档案、近期训练汇总、当前计划安排、本次及上一轮对话。不发送昵称、用户标识、登录凭据和打卡笔记。用户自己在对话输入的文字会发送给 DeepSeek。

数据库中的健康资料和对话并非应用层加密字段。正式部署应配置 HTTPS、数据库访问权限和存储加密；页面删除不会自动清理已有运维备份或第三方已处理的数据，需依据实际部署的留存策略处理。

## 运行边界

每人每小时最多 6 次生成、同时最多 1 次；当前进程最多 4 个任务。一次任务最多 8 轮模型调用、90 秒，每次调用最多 45 秒、输出 5000 tokens，累计用量返回超过 30000 tokens 后停止继续调用。最后一轮已发生的用量仍由提供方计费，这不是预付费硬额度。

任务保存在数据库，执行器位于当前 API 进程，尚未使用 Redis／独立消息队列。进程重启不会自动重放付费请求；超过三分钟的残留活动任务在查询详情或再次生成时标记中断。多实例生产部署需要共享队列与全局容量控制。历史查询返回最近 10 条，数据库保留更早记录直至删除。

当前国际化覆盖界面、提示和动作名；模型按生成时语言回复，切换界面语言不会重新翻译已保存的自由文本。

## 验证方法与结果

```sh
npm test
npm run test:agent
npm run test:e2e
npm run test:live
npm run build
npm run api:export
```

`tests/fixtures/deepseek.ts` 是明确隔离的模型传输 Mock，仅测试入口引用；浏览器测试使用真实 Fastify 路由和独立内存 PGlite。覆盖授权、资料隔离、未知工具、非法动作、上游错误、取消、授权撤销、并发幂等、确认后持久化和整批回滚。

2026-09-22 真实 DeepSeek 联调使用虚构成年人资料与独立内存数据库：`deepseek-flash` 成功读取三项上下文工具，修正一次未通过校验的草稿，生成 3 次训练安排并确认保存。累计返回用量 6871 tokens。证据：[deepseek-verification.json](deepseek-verification.json)。

需要再次进行真实调用时运行 `npx tsx scripts/verify-deepseek.mts`，此命令会产生模型费用；不纳入 CI。报告仅记录模型、工具状态、用量和成功标志，不记录密钥或健康档案内容。

微信小程序已进行编译验证；微信开发者工具、真实 AppID 登录及真机网络仍需在用户的微信环境验收。

## 官方接口参考

- [DeepSeek 工具调用](https://api-docs.deepseek.com/guides/tool_calls/)
- [思考模式与工具轮次](https://api-docs.deepseek.com/guides/thinking_mode/)
- [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
- [模型列表接口](https://api-docs.deepseek.com/api/list-models/)


## 草稿查看与生成纠错（2026-09-23）

- 当前会话新增「查看草稿」入口；最近会话选择后也能查看已保留的草稿，查看不会调用模型或创建计划。
- 合格草稿以日期、动作、组数和时长展示。未通过校验的候选内容显示明确提示及原因，只读且不能确认添加；无法解析的文本以纯文本展示，不执行 HTML。
- 迁移 `005_agent_draft_review.sql` 增加 `candidate_text` 和 `validation_issues`。只保留当前会话最后一个候选内容（最多 20000 字符），不保存推理内容。旧版本失败时丢弃的草稿无法恢复；请求未返回或输出截断也可能没有可查看草稿。
- 后端将具体日期、重复日、动作类别、器械、互斥剂量字段、初学者上限、时长合计及已有计划冲突反馈给模型。最多允许 3 次不合格提案；普通文字回复允许一次格式纠正。成功后清空当前错误；执行记录仍保留历史失败步骤。
- 非思考模式使用 `tool_choice=required`，思考模式继续使用 `auto`（官方接口不支持思考模式下 required）。输出上限提高至 5000 tokens；总时限 90 秒与总用量停止阈值 30000 tokens 保持。
- 每天目前仍只有一种训练类别；力量与有氧可以安排在不同日期。未降低现有校验约束以追求生成成功率。
- 真实 DeepSeek 隔离测试：虚构档案、一周 5 天、每天 30 分钟、力量与有氧；本次首次提案通过，5 项计划确认入库，返回总用量 4033 tokens。见 [联调记录](deepseek-mixed-verification.json)。此结果不保证每次模型输出均合格。

再次执行该付费隔离测试：`npx tsx scripts/verify-deepseek.mts --mixed`。

## 请求次数与错误提示（2026-09-23）

AI 教练显示本系统过去 60 分钟已用次数、剩余次数和下次恢复 1 次的时间，页面每 30 秒自动刷新，也可手动刷新。每位用户最多 6 次，按滚动时间窗口逐次恢复，不是整点清零。次数为零时禁止提交，已输入的回复保留。

每次被后端接收的生成任务计一次，包括补充回答、生成失败或取消；同一任务内部纠错不额外计次，查看草稿不计次。提交前被拒绝的请求不计次。统计来自当前用户的任务记录。

| 情况 | 错误码 | 页面说明 |
| --- | --- | --- |
| 本系统 6 次用完 | AI_USER_RATE_LIMITED | 等待页面显示的恢复时间 |
| 本系统并发容量已满 | AI_CAPACITY_BUSY | 稍后重试，本次未扣次数 |
| DeepSeek 请求频率受限（429） | AI_PROVIDER_RATE_LIMITED | 服务商限流，稍后重试 |
| DeepSeek 账户余额不足（402） | AI_PROVIDER_BALANCE_LOW | 管理员检查余额或充值 |
| DeepSeek 服务繁忙（503） | AI_PROVIDER_BUSY | 服务商繁忙，稍后重试 |
| 普通页面接口访问频繁 | HTTP_RATE_LIMITED | 等待一分钟再试 |

显示的次数仅属于本系统，不代表 DeepSeek 的余额或服务商剩余请求数。服务商未返回可用的剩余次数时，不推测具体数值。旧记录中原有 AI_RATE_LIMITED 无法追溯具体来源，界面明确说明。状态码参考 [DeepSeek 官方错误说明](https://api-docs.deepseek.com/quick_start/error_codes/)。
