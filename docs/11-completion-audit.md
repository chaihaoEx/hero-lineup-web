# 11. 完成度审计与验收证据

审计日期：2026-07-31

## 1. 结论

`hero-lineup-web` 已完成纯静态 Web 迁移。生产构建只包含 HTML、CSS、JavaScript、图片、字体和 JSON，可直接由 Nginx 托管；应用运行不依赖 Rust、Tauri、WebAssembly、Node.js 服务、本地监听端口或后端 API。

问题反馈使用同域 `/issues/` 下的可选 Gitea 服务。它不是应用运行依赖，反馈服务不可用不会影响配装、计算、模拟、存储、导入导出和离线启动。

## 2. 静态内容

- Manifest 覆盖 2,292 个文件、16 个 JSON 文档、24,314,090 字节。
- 校验器逐文件检查 SHA-256、大小、JSON 可解析性、manifest 与磁盘双向覆盖、统计值和引用完整性。
- 职业、勇士、物品、技能、任务及其图片均由 `/content/` 本地静态目录加载。
- 生产目录不存在 `.rs`、`.wasm`、Tauri 运行时或远程游戏数据地址。

验收命令：

```bash
npm run content:validate
npm run build
```

## 3. 计算与模拟一致性

- 英雄和勇士属性由完整运行时目录计算，不使用演示目录或近似预览。
- 装备品质、星锻、超越、元素附魔、精萃附魔、技能等级、种子、卡片、勇士之魂和泰坦塔/墓均进入计算。
- 勇士之魂与泰坦塔/墓是两个独立状态和独立计算机制。
- TypeScript 目录计算通过原 Rust fixture 的完整六件套与阿尔贡 golden case。
- 冒险模拟通过高级战斗规则与 Timekeeper 重试的 Rust golden case。
- 固定 seed、舍入顺序和二次尝试的增益顺序与 Rust 基准一致。
- 全局模拟队列保证同一时间只有一个 Worker；支持排队、进度、取消和崩溃后继续。
- 10,000 次模拟的 Chromium、Firefox、WebKit 端到端流程通过。

主要证据：

```text
tests/goldenCatalog.test.ts
tests/simulationCore.test.ts
tests/golden/advanced-combat-rules.json
tests/golden/timekeeper-retry.json
tests/simulationQueue.test.ts
```

## 4. 数据交换与本地存储

- `.zyslineup` 与 `.zysbackup` 使用正式 JSON Schema、SHA-256 checksum 和 Rust serde 兼容序列化。
- Web 导出的复杂体系和备份已由原 Rust 解码器实际接受。
- Web 同时接受 Rust 规范化后的 payload，覆盖双向交换。
- IndexedDB 保存体系、模板、设置和模拟结果。
- localStorage 旧数据只迁移一次。
- 100 个体系批量保存并关闭、重开数据库后完整恢复。
- BroadcastChannel 通知其他标签页；未保存编辑不会被外部更新静默覆盖。
- 数据库初始化失败时显示可恢复错误，不出现空白页或无限加载。

主要证据：

```text
tests/rustInterchange.test.ts
tests/interchange.test.ts
tests/storage.test.ts
tests/App.test.tsx
```

## 5. 浏览器、离线和部署

- Vitest：17 个测试文件、92 个测试通过。
- Playwright：Chromium、Firefox、WebKit 共 72 个端到端测试通过。
- PWA：首次缓存后，完全断网重新启动测试通过。
- 根目录 `/` 和虚拟目录 `/hero-lineup/` 两种构建均通过。
- E2E 阻止远程请求，证明核心工作流不依赖外网接口。
- GitHub Actions 在不安装 Rust 的 Ubuntu 环境完成校验、构建和部署。
- `main` 构建上传到 commit SHA 版本目录，通过软链接原子发布到 `https://vst2t.i7yun.top/`。

本地完整门禁：

```bash
npm run content:validate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:pwa
VITE_BASE_PATH=/hero-lineup/ npx vite build --outDir dist-subpath --emptyOutDir
node tools/validate-subpath-build.mjs dist-subpath /hero-lineup/
```

## 6. 维护规则

- 目录或图片更新必须同步更新 `public/content/manifest.json` 并通过 `content:validate`。
- 计算规则修改必须增加或更新 Rust golden case，不得只改 UI 展示值。
- interchange 结构修改必须同时更新 schema、Rust 兼容序列化和双向测试。
- IndexedDB 升级必须新增迁移测试。
- `main` 只有在所有门禁通过后才能自动切换生产版本。
