# 02. 目标架构与目录

## 1. 运行时架构

```text
Nginx 静态文件
    │
    ├── HTML / JavaScript / CSS
    ├── JSON 游戏数据
    └── PNG / SVG 图片
             │
             ▼
浏览器主线程
    ├── React UI
    ├── RuntimeCatalog 内存索引
    ├── TypeScript 属性计算
    ├── IndexedDB
    └── 文件、剪贴板和下载 API
             │
             ▼
Web Worker
    └── TypeScript 冒险模拟器
```

运行时不存在后端 API。

## 2. 推荐项目目录

```text
hero-lineup-web/
├── docs/
├── public/
│   └── content/
├── src/
│   ├── app/
│   ├── components/
│   ├── core/
│   │   ├── calculation/
│   │   ├── catalog/
│   │   ├── interchange/
│   │   ├── simulation/
│   │   └── validation/
│   ├── data/
│   ├── platform/
│   ├── state/
│   ├── storage/
│   ├── types/
│   ├── utils/
│   └── workers/
├── tests/
│   ├── fixtures/
│   ├── golden/
│   ├── integration/
│   └── unit/
├── e2e/
├── tools/
│   └── content/
├── index.html
├── nginx.conf
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 3. 模块边界

### `src/app` 和 `src/components`

只负责界面、交互和展示，不直接访问 IndexedDB，也不直接解释游戏原始 JSON。

### `src/core/catalog`

加载静态数据并建立只读索引。业务模块通过明确的方法查询，不直接反复遍历原始大数组。

### `src/core/calculation`

实现英雄、勇士、装备和技能的精确计算。计算函数必须是无副作用的纯函数。

### `src/core/simulation`

实现冒险模拟规则，允许在测试中直接调用，在生产环境由 Web Worker 调用。

### `src/storage`

封装 IndexedDB、迁移、事务、备份和恢复。UI 不依赖具体数据库实现。

### `src/platform`

封装浏览器能力：

- 文件选择。
- Blob 下载。
- Clipboard API。
- Web Worker。
- Service Worker。
- 资源 URL。

### `src/core/interchange`

实现 `.zyslineup`、`.zysbackup`、版本检查和 checksum。

## 4. 依赖方向

允许：

```text
UI → State → Core
UI → Platform
State → Storage
Worker → Simulation → Core Types
Core → Types
```

禁止：

```text
Core → React
Core → IndexedDB
Calculation → UI
Storage → React
Worker → DOM
```

## 5. 与旧项目的关系

迁移期间：

- 从旧项目复制可复用的 React、CSS、类型和测试。
- 原 Rust 项目保持只读基准地位。
- 新功能只在 `hero-lineup-web` 中实现。
- 不通过符号链接依赖旧目录。
- 不在构建时读取旧项目文件。

迁移完成后，`hero-lineup-web` 必须可以单独复制到另一台电脑完成：

```bash
npm ci
npm test
npm run build
```

## 6. 技术栈

建议依赖：

- React。
- TypeScript。
- Vite。
- Dexie。
- Ajv。
- Vitest。
- Playwright。
- ESLint。
- 可选的 `vite-plugin-pwa`。

依赖选择原则：

- 浏览器原生能力足够时不引入重型框架。
- 不引入服务器运行时依赖。
- 不引入 WebAssembly。
- 不引入远程 CDN 运行时依赖。
