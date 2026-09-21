# Windows 本地 PostgreSQL

## 本机已完成的配置

- PostgreSQL 17.11（EDB Windows 安装包），安装目录 `C:\Program Files\PostgreSQL\17`。
- Windows 服务 `postgresql-x64-17`，自动启动。
- 数据库 `listen_addresses=localhost`，只接受本机连接。
- 主机 `127.0.0.1`，端口 `5432`，业务数据库 `fitstreak`，账号 `fitstreak`。
- 账号不是超级用户，没有创建数据库或角色的权限。
- `fitstreak_test` 为独立测试库，测试不能指向业务数据库。
- 后端 `apps/api/.env` 已配置 `DATABASE_URL` 和固定随机 `JWT_SECRET`。
- 凭据、数据库数据、备份均不进入 Git。克隆仓库到其他电脑后，需要自行安装并配置。

## 日常启动

在项目根目录运行，两个终端分别执行：

```powershell
npm.cmd run dev:api
npm.cmd run dev
```

访问 http://127.0.0.1:5173 。数据库由 Windows 服务启动，不需要每次手动执行数据库命令。

检查数据库类型、版本及各表记录数量：

```powershell
npm.cmd run db:status
```

此命令只查询数据，不显示连接密码。后端配置优先采用已有进程环境变量，其次读取 `apps/api/.env`；修改 `.env` 后重启后端。

## 使用 pgAdmin 或 Navicat 查看表

新建 PostgreSQL 连接，主机填 `127.0.0.1`，端口 `5432`，数据库 `fitstreak`，用户名 `fitstreak`。pgAdmin 注册服务器时，Maintenance database 也填 `fitstreak`。

密码在本机 `.data/postgres-setup/credentials.json` 的 `appPassword` 字段中；也可从 `apps/api/.env` 的连接串中查看。管理员密码是同一凭据文件中的 `adminPassword`，日常查看数据使用 `fitstreak` 账号即可。不要上传这些文件或含密码的截图。

连接后展开 `Schemas → public → Tables`：

| 表 | 内容 |
|---|---|
| app_user | 用户昵称、每周目标、语言 |
| fitness_plan | 健身计划 |
| checkin | 打卡记录 |
| article | 知识文章 |
| article_translation | 中英文文章内容 |

可执行以下查询确认保存结果：

```sql
SELECT id, nickname, weekly_goal, locale FROM app_user ORDER BY created_at DESC;
SELECT id, title, target_minutes FROM fitness_plan ORDER BY created_at DESC;
SELECT local_date, plan_title, duration_minutes FROM checkin ORDER BY created_at DESC;
```

## 原数据与账号说明

迁移前原数据保存在 `.data/fitstreak`，离线副本在 `.data/pglite-before-postgresql`。本次迁移了 4 个用户、7 个计划、5 条打卡；知识种子为 3 篇文章、6 条翻译。数量仅代表迁移时状态。

演示登录每次创建独立用户；数据库持久化并不改变这个行为。固定 JWT 密钥使后续登录在正常重启后仍能保持到令牌过期，但本次更换密钥会使旧令牌失效。旧用户的数据库记录没有删除。

## 迁移工具

先停止使用 PGlite 的后端，复制其整个数据目录作为离线备份。目标 PostgreSQL 应已执行 `database/001_schema.sql` 和 `002_seed.sql`，且用户、计划、打卡表必须为空：

```powershell
npm.cmd run db:migrate:pglite -- .data/pglite-before-postgresql
```

工具在事务中按外键顺序导入三个业务表，核对数量；目标已有业务数据时拒绝执行。它保留源目录，不覆盖目标现有数据，不迁移自定义文章内容。本机迁移已经完成，不要重复执行。

## 测试隔离

接口测试用 `TEST_DATABASE_URL` 指向 `fitstreak_test`；真实浏览器测试用 `LIVE_DATABASE_URL` 指向 `fitstreak_test`。未设置 `LIVE_DATABASE_URL` 时浏览器测试显式选择独立 PGlite 测试库，避免意外读取本机 `.env` 中的业务数据库连接。

2026-09-21 本机验证：`npm test` 25 项通过，其中接口/SQL 用例连接 PostgreSQL 测试库；`npm run test:live` 1 项通过，浏览器通过真实后端连接 PostgreSQL，覆盖计划创建、打卡、统计及昵称/每周目标保存与刷新。业务接口返回健康状态 200，调用知识接口后在 `pg_stat_activity` 中确认 `fitstreak` 账号连接 `fitstreak` 数据库。

官方安装来源：[PostgreSQL Windows 下载](https://www.postgresql.org/download/windows/)，[EDB 安装参数](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/command_line_parameters/)。
