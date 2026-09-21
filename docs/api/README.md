# 接口设计

在线 Swagger：启动后端后打开 `/docs`。导出合同运行 `npm run api:export`，生成 `openapi.json`。请求 schema 在路由声明中，响应 schema 在 `apps/api/src/contracts.ts`，均由 Fastify 执行。

成功格式 `{"data": ...}`；失败格式 `{"error":{"code":"VALIDATION_ERROR","requestId":"req-1"}}`。错误由客户端翻译，服务器返回稳定错误码。除登录、知识与健康检查之外均需要 `Authorization: Bearer <token>`。

|方法|路径|用途|成功码|
|---|---|---|---|
|GET|/health|健康检查|200|
|POST|/api/auth/demo|开发演示会话，生产404|201|
|POST|/api/auth/wechat|微信code换会话|200|
|GET/PATCH|/api/me|查看及保存个人信息|200|
|GET/POST|/api/plans|计划列表／新增|200/201|
|PATCH/DELETE|/api/plans/{id}|修改／归档|200|
|GET/POST|/api/checkins|历史查询／当天打卡|200/201|
|GET|/api/stats?days=7或30|聚合与补零时间序列|200|
|GET|/api/articles?locale=zh-CN&category=habits|文章列表|200|
|GET|/api/articles/{id}?locale=en|文章详情|200|

GET checkins 默认最近30天，接受 from/to 日期参数，区间不能倒置且跨度不超过366天。POST checkins 只接受 plan_id、duration_minutes、note；所有者和日期由服务端确定。计划周几用ISO星期1至7，结束日期为空表示长期执行。

典型错误：400 VALIDATION_ERROR / INVALID_DATE_RANGE / RANGE_TOO_LARGE；401 UNAUTHORIZED；404 NOT_FOUND；409 ALREADY_CHECKED_IN / PLAN_NOT_SCHEDULED / PLAN_ARCHIVED；503 配置缺失；502 微信上游失败。未知内部错误统一500 INTERNAL_ERROR，不返回SQL或堆栈。

计划归档是幂等操作。创建计划不是幂等操作，UI提交期间禁用按钮；网络失败时先刷新列表再决定是否再次创建。打卡有数据库唯一键，即使第一次成功但响应丢失，重试也只得到409，不会增加重复记录。
