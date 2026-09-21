# 图标与动作示意图升级

## 参考与来源

用户提供视频标题为“做健身 App 必备！302 个动作全部开源”，短链 https://b23.tv/PPSAK6G 本次无法直接访问。根据标题与动作数量检索到 [bryllim/workout-guide](https://github.com/bryllim/workout-guide)，并从仓库核对素材及授权；没有声称观看了视频。

素材版本锁定为 `aac599224bb9780305239607ef98540b7e0ce389`。原库包含 302 个动作，本项目选取与现有五类运动相关的 10 个动作、30 张原始 PNG（三帧/动作），约 1.18 MB。没有把全部 302 个动作打入小程序主包。

## 已升级的界面

- 导航、运动类别、统计、播放、方向和关闭控件使用统一 24 px、1.75 px 线宽图标，代替依赖系统字体的字符图标。
- 首页使用徒手深蹲示意图，增加动作指南入口。
- 今日训练、计划卡片和知识文章封面显示对应动作图。
- 创建/编辑计划和打卡表单展示运动类别参考动作，可手动切换三帧、播放、暂停。
- 健身知识增加“知识阅读 / 动作指南”切换。动作指南支持力量、伸展、有氧筛选，显示动作名称、器材和主要肌群。
- 所有新增界面提供简体中文和英文，适配 375、768、1440 px。

当前计划仍以跑步、力量、瑜伽、步行、骑行分类；示意图明确标为“项目动作参考”，不是为历史计划新增具体动作绑定。原有计划和打卡记录不变。

## 素材与源文件

| 内容 | 路径 |
|---|---|
| 22 个原创图标，四种配色 SVG | `design/icons/` |
| 图标 PNG（72 px，供小程序与 H5 使用） | `apps/web/src/static/icons/` |
| 原始动作 SVG 源文件 | `design/workout-guide/source/` |
| 原始动作 PNG | `apps/web/src/static/exercises/` |
| 精选动作原始元数据和逐帧署名 | `design/workout-guide/manifest.json` |
| 原仓库许可证与署名 | `design/workout-guide/LICENSE*`、`ATTRIBUTION.md` |
| 双语动作目录 | `apps/web/src/lib/exercises.ts` |
| 组件 | `ExerciseArt.vue`、`ExercisePlayer.vue`、`ExerciseReference.vue`、`ExerciseLibrary.vue` |
| 可复现生成/导入脚本 | `scripts/build-visual-assets.mjs` |

图标为 FitStreak 原创 SVG，源文件随项目提供；动作图按 CC BY-SA 4.0 授权，作者为 Bryl Lim，部分原始姿态来源 Everkinetic。PNG/SVG 按原文件复制，未改色、裁切或改变姿态；中文名称另存于应用代码。动作素材及其衍生版本保留 CC BY-SA 4.0，不受项目代码许可证覆盖。

页面底部及动作指南提供作者、素材来源、授权名称和可复制链接。完整来源和逐帧上游修改记录保存在清单中。

## 重新生成

```powershell
git clone https://github.com/bryllim/workout-guide.git .data/workout-guide-upstream
git -C .data/workout-guide-upstream checkout aac599224bb9780305239607ef98540b7e0ce389
node scripts/build-visual-assets.mjs
npm.cmd run build
```

图标导出用 Playwright：Windows 使用已有 Edge，其他平台使用已安装的 Playwright Chromium。SVG 源文件放在 design 中，不重复打入小程序。

## 验证

- H5、微信小程序、后端构建通过。
- 14 项浏览器测试通过，包括已有业务流程和 5 项新增动作图测试。
- 新增覆盖：三种宽度、中文/英文、切帧、播放暂停、分类筛选、更换动作时重置帧、表单类别预览、30 张本地图片可访问、图片失败回退。
- 小程序生成目录约 1.44 MB；WXSS 没有通配符选择器。该数值是本地文件总量，不代替微信开发者工具的实际打包统计。
- 截图位于 `docs/screenshots/movements-*-*.png`，首页与表单截图已更新。
- 微信开发者工具实际运行及真机视觉验收仍需在工具中重新编译检查；构建成功不代表所有机型均已验收。
