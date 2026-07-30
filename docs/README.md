# Hero Lineup Web 迁移文档

本目录用于指导 `hero-lineup` 从 Rust/Tauri 桌面应用迁移为完全独立的纯 Web 静态应用。

最终项目必须满足：

- 运行时完全脱离 Rust、Tauri、Node.js 服务和本地监听端口。
- 使用 React、TypeScript、Web Worker、IndexedDB 和静态游戏资源。
- `npm run build` 输出可直接由 Nginx 托管的 `dist/`。
- 英雄、勇士、装备、技能和冒险模拟结果与原 Rust 版本一致。
- 用户数据默认只保存在浏览器本机。
- 支持导入、导出、完整备份和离线缓存。

## 文档导航

1. [迁移目标与范围](./01-goals-and-scope.md)
2. [目标架构与目录](./02-target-architecture.md)
3. [游戏数据与图片资源](./03-content-and-assets.md)
4. [属性计算引擎迁移](./04-calculation-engine.md)
5. [冒险模拟器迁移](./05-simulation-worker.md)
6. [本地存储与数据交换](./06-storage-and-interchange.md)
7. [UI 与交互迁移](./07-ui-and-ux-migration.md)
8. [测试与一致性验收](./08-testing-and-parity.md)
9. [构建、Nginx 与运维](./09-build-deployment-operations.md)
10. [分阶段实施路线](./10-implementation-roadmap.md)
11. [完成度审计与验收证据](./11-completion-audit.md)

## 核心决策

| 决策 | 结论 |
|---|---|
| 浏览器运行时使用 Rust | 不使用 |
| 使用 WebAssembly | 不使用 |
| 部署后运行 Node 服务 | 不使用 |
| 后端 API 和服务端数据库 | 第一阶段不建设 |
| 页面技术 | React + TypeScript + Vite |
| 复杂计算 | TypeScript |
| 冒险模拟 | TypeScript Web Worker |
| 用户数据 | IndexedDB |
| 静态资源 | Nginx `/content/` |
| 离线能力 | Service Worker + Cache Storage |
| 原 Rust 项目用途 | 迁移期间作为公式和测试基准 |

## 文档状态约定

- `未开始`：尚未实施。
- `进行中`：已开始但未达到验收条件。
- `待验收`：功能完成，等待一致性或人工验收。
- `已完成`：已通过对应文档的验收条件。

任何模块只有在测试通过后才能标记为“已完成”。
