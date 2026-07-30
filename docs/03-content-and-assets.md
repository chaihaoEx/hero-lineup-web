# 03. 游戏数据与图片资源

## 1. 目标

把原项目约 28MB、2,293 个文件的 `content` 目录迁移为 Web 静态资源，并确保版本化、可校验、可缓存。

## 2. 目标结构

```text
public/content/
├── manifest.json
├── TextAsset/
├── Sprite/
└── schemas/
```

构建后保持相同相对路径：

```text
dist/content/
```

代码不得继续依赖 Tauri `asset:` protocol 或开发期 `/offline-assets/` 中间件。

## 3. 启动加载流程

1. 请求 `/content/manifest.json`。
2. 校验 schema version 和最低应用版本。
3. 并行加载核心 JSON。
4. 校验必要字段和唯一 ID。
5. 创建 `RuntimeCatalog`。
6. 将 catalog 作为只读对象提供给应用。
7. 图片在组件显示时按需加载。
8. Service Worker 在后台缓存静态资源。

## 4. 内存索引

至少建立：

```ts
interface RuntimeCatalog {
  classesById: Map<string, HeroClass>;
  championsById: Map<string, Champion>;
  itemsById: Map<string, Item>;
  itemsByType: Map<string, Item[]>;
  itemsBySlot: Map<string, Item[]>;
  skillsById: Map<string, Skill>;
  skillsByFamily: Map<string, Skill[]>;
  skillsByClass: Map<string, Skill[]>;
  questsById: Map<string, Quest>;
}
```

索引创建一次，装备弹窗、技能弹窗和计算过程只使用索引查询。

## 5. URL 规则

资源地址必须通过统一函数生成：

```ts
contentUrl("Sprite/example.png");
```

该函数需要支持：

- 根域名部署。
- 子路径部署。
- URL 编码。
- 禁止 `..` 路径。
- 内容版本前缀。

禁止在组件中散落：

```ts
"/offline-assets/..."
"/content/..."
```

## 6. 数据维护工具

使用 Node + TypeScript 建立：

```text
tools/content/
├── validate-content.ts
├── verify-assets.ts
├── generate-manifest.ts
└── build-content.ts
```

脚本必须检查：

- JSON 能否解析。
- schema 是否匹配。
- ID 是否重复。
- 引用的职业、技能、装备和任务是否存在。
- 引用的图片是否存在。
- 文件大小和数量是否符合预期。
- SHA-256 是否正确。

## 7. 更新与缓存

manifest 至少包含：

```json
{
  "schemaVersion": 1,
  "gameDataVersion": "string",
  "assetVersion": "string",
  "createdAt": "ISO-8601",
  "files": 0,
  "totalBytes": 0
}
```

更新规则：

- `index.html` 和 manifest 不长期缓存。
- 带 hash 的 JS/CSS 缓存一年。
- 版本化内容缓存 30 天或使用 immutable。
- 新内容完整下载并校验后再标记为活动版本。
- 更新失败继续使用旧缓存。

## 8. 验收条件

- 生产 `dist` 包含完整数据和图片。
- 不启动 Vite 中间件也能读取所有资源。
- 英雄、勇士、装备、技能和任务数量符合 manifest。
- Playwright 检查关键图片无 404。
- 页面部署到子路径时资源地址仍正确。
- 断网重启后已缓存资源仍可使用。
