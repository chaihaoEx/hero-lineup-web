# 06. 本地存储与数据交换

## 1. 目标

使用 IndexedDB 替代 SQLite 和完整体系 `localStorage`，同时保持桌面旧版文件格式兼容。

## 2. IndexedDB 结构

推荐使用 Dexie：

```ts
interface HeroLineupDatabase {
  systems: LineupSystemRecord;
  templates: BuildTemplateRecord;
  settings: SettingRecord;
  simulationHistory: SimulationRecord;
  metadata: MetadataRecord;
}
```

建议索引：

- `systems`: `id`, `updatedAt`, `gameDataVersion`
- `templates`: `id`, `classId`, `updatedAt`
- `simulationHistory`: `id`, `systemId`, `taskId`, `completedAt`
- `settings`: `key`
- `metadata`: `key`

## 3. 数据库迁移

每次 schema 变化必须：

1. 增加数据库版本。
2. 编写升级事务。
3. 对旧数据提供默认值。
4. 增加迁移测试。
5. 失败时保持旧数据库可恢复。

首次启动时检查旧 `localStorage`：

- 成功迁移到 IndexedDB。
- 写入迁移完成标记。
- 不重复导入。
- 在用户确认前不删除旧数据。

## 4. 保存语义

- 编辑期间保留 dirty 状态。
- 用户点击保存后使用事务写入。
- 切换体系前保留未保存提醒。
- 删除操作需要确认。
- 数据库错误需要显示可操作的错误信息。

## 5. `.zyslineup`

Web 版需要实现：

- schema 校验。
- 版本信息。
- checksum。
- 单体系限制。
- ID 冲突处理。
- 游戏数据版本兼容检查。
- Blob 下载。
- File Input 导入。

导出内容不得依赖浏览器内部数据库格式。

## 6. `.zysbackup`

备份至少包含：

- 所有体系。
- 所有模板。
- 设置。
- 必要的版本信息。

恢复流程：

1. 解析文件。
2. 校验 schema 和 checksum。
3. 检查数据版本。
4. 显示替换确认。
5. 使用单个 IndexedDB 事务写入。
6. 全部成功后刷新内存状态。
7. 任一步失败则回滚。

## 7. 浏览器文件能力

基础兼容方案：

- `<input type="file">` 导入。
- Blob + `<a download>` 导出。

增强方案：

- 支持 File System Access API 的浏览器可显示原生保存窗口。
- Safari 和 Firefox 自动回退到普通下载。

剪贴板写入和 PNG 复制要求 HTTPS 或 localhost 安全上下文，失败时提供下载替代方案。

## 8. 容量和异常

需要处理：

- 隐私模式。
- IndexedDB 被禁用。
- 浏览器配额不足。
- 用户清理站点数据。
- 多标签页同时编辑。
- JSON 文件过大或损坏。

建议使用 `BroadcastChannel` 通知其他标签页数据已更新。

## 9. 验收条件

- 刷新和重启浏览器后数据存在。
- 可以保存至少 100 个体系和大量模拟历史。
- `.zyslineup` 可与旧桌面版双向交换。
- 完整备份恢复具有事务性。
- localStorage 旧数据只迁移一次。
- 配额和权限错误不会导致页面白屏。
