# FitStreak 技术调研与架构决策

调研日期：2026-09-21。范围为国内小程序生态与国际通用后端生态中的代表性方案。以下比较基于官方文档的能力核对和本项目约束，不代表市场占有率排名，也不将工具国别等同于使用地区。

## 需求驱动

同一套界面覆盖微信小程序和手机／桌面 H5；中文及英文；个人计划、打卡、关系数据约束及聚合查询；独立后端与可复现测试；适合单人毕业设计开发维护。无需支付、实时聊天、社交排名或独立管理后台。

## 前端候选

|方案|官方能力依据|项目取舍|
|---|---|---|
|微信原生 WXML/WXSS/JS|原生小程序组件和平台接口|平台适配直接，但 H5 需要另一套页面；不选|
|uni-app Vue 3|支持 CLI 与 Vue 3/Vite，跨小程序和 H5，提供国际化指南|与 Vue 组件开发一致，可共用业务界面；采用|
|Taro React/Vue|支持 React、Vue，组件遵循小程序规范，提供 H5 实现|同样可行，当前项目选择 Vue/uni-app 以减少框架组合；保留为替代|
|Flutter / React Native|主要面向原生移动端与跨端 UI|微信小程序不是本项目所需的一等编译目标，不进入实现|

## 后端与数据候选

|方案|优势|成本及决定|
|---|---|---|
|Spring Boot|成熟模块化生态和 Java 类型系统|可用于同类毕设，需额外 Java 构建链；本项目不选|
|NestJS|模块、依赖注入、验证和 OpenAPI 集成|团队扩展能力强，当前领域规模可采用更少框架层；不选|
|Fastify 5 + TypeScript|JSON Schema 校验、插件隔离、请求注入测试|与前端共享语言，接口合同可导出；采用|
|MySQL|成熟的关系数据库|适合同类项目；本项目选择 PostgreSQL 的约束和日期聚合|
|PostgreSQL 17|主键、唯一键、外键、CHECK 约束及事务|采用；生产使用独立服务器|
|PGlite|嵌入式 PostgreSQL WASM|本地开发与自动化测试使用；不作为生产多用户数据库替代|

选择模块化单体：界面 → HTTPS JSON API → 认证与校验 → 领域服务 → PostgreSQL。暂不引入 Redis、消息队列、微服务，避免对当前五个核心功能无收益的运行复杂度。SQL 按版本保存，接口合同与实现由同一套路由 schema 导出。

## 工程决策

1. 前端使用 `view/text/button/input/scroll-view` 跨端组件，自绘轻量柱状图；移动底栏、桌面侧栏由媒体查询控制。使用 CSS 图形而非依赖远程图片，降低加载失败。
2. 翻译字典集中管理，中文和英文键一致；文章有独立翻译表。用户输入不自动翻译。语言持久化到本地，保存个人设置时同步服务端。
3. 业务日固定 Asia/Shanghai，时间戳使用 TIMESTAMPTZ。语言切换仅改变显示，不能改变历史打卡归属日。
4. 打卡使用数据库唯一约束处理并发重复；历史标题与运动类型存快照；计划归档不删除打卡。
5. 演示登录仅用于开发且为每个浏览器会话生成独立用户；生产禁用。正式登录由服务端调用微信 code2Session，不接受客户端 openid。
6. Mock 使用 MSW Node 拦截器和 HTTP 桥接，同一 Mock 服务供 H5 与小程序开发测试。真实后端另做数据库与授权测试，不能用 Mock 通过代替后端正确性。
7. 原型及图形使用 diagrams.net 可编辑 XML，另交互 HTML 用于无需设计工具的浏览。SVG 用于文档嵌入；源码才是后续修改依据。
8. npm 锁文件固定完整依赖。uni-app 编译器版本与其官方 Vite/Vue 依赖保持一致；上游工具链较旧传递依赖列入维护风险，不自行跨主版本强行升级。

## 官方资料

- uni-app CLI：https://uniapp.dcloud.net.cn/quickstart-cli
- uni-app 国际化：https://uniapp.dcloud.io/tutorial/i18n.html
- Taro Vue：https://docs.taro.zone/docs/vue-overall
- Taro 组件：https://docs.taro.zone/docs/components-desc
- Spring Boot：https://spring.io/projects/spring-boot
- NestJS 校验：https://docs.nestjs.com/techniques/validation
- NestJS OpenAPI：https://docs.nestjs.com/openapi/introduction
- Fastify：https://fastify.dev/docs/latest/
- PostgreSQL 约束：https://www.postgresql.org/docs/current/ddl-constraints.html
- MSW Node：https://mswjs.io/docs/integrations/node/
- diagrams.net 界面原型：https://www.drawio.com/docs/tutorials/mockups-in-jira/

文档描述的是设计决策。构建与测试是否通过以 `docs/testing.md` 的实测记录为准；微信真机、正式 AppID 和线上服务的验收单独记录。
