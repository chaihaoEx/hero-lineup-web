# 05. 冒险模拟器迁移

## 1. 目标

将原 Rust 冒险模拟器迁移为纯 TypeScript，并在 Web Worker 中运行，避免阻塞 React 主线程。

## 2. 必须迁移的规则

- 普通伤害。
- 暴击伤害。
- 防御阈值和分段公式。
- 回避。
- 威胁权重与目标选择。
- 每轮怪物伤害变化。
- 狂战士阶段。
- 元素屏障。
- 冒险强化道具。
- 精英环境修正。
- 泰坦层数修正。
- 一次和二次尝试。
- 成员生存率和伤害统计。
- 固定随机种子。

## 3. Worker 协议

主线程发出：

```ts
type SimulationCommand =
  | { type: "start"; taskId: string; request: SimulationRequest }
  | { type: "cancel"; taskId: string };
```

Worker 返回：

```ts
type SimulationMessage =
  | { type: "progress"; taskId: string; completed: number; total: number }
  | { type: "result"; taskId: string; result: SimulationResult }
  | { type: "cancelled"; taskId: string }
  | { type: "error"; taskId: string; message: string };
```

## 4. 确定性随机数

不能使用 `Math.random()`。

必须实现明确算法并记录：

- 种子位宽。
- 溢出规则。
- 整数到浮点数的映射。
- 每次随机调用顺序。

同一输入和 seed 必须得到可重复结果。若需要与 Rust 完全一致，应迁移 Rust 当前使用的具体 PRNG 和调用顺序。

## 5. 取消和并发

- Worker 每批模拟后检查取消状态。
- 默认只启用一个模拟 Worker。
- 多个任务进入队列。
- 页面关闭或任务删除时取消对应模拟。
- 取消后不保存部分结果。
- 进度消息需要节流，避免每次迭代都更新 React。

## 6. 结果保存

结果必须记录：

- 游戏数据版本。
- 模拟器版本。
- seed。
- 迭代次数。
- 完成时间。
- 成功率。
- 平均、最小和最大回合。
- 成员伤害和生存率。
- 是否使用第二次尝试。

当游戏数据或模拟器版本发生变化时，旧结果标记为 stale。

## 7. 性能测试

至少测量：

- 100 次。
- 1,000 次。
- 10,000 次。
- 四人队伍。
- 最复杂精英/泰坦环境。
- 模拟过程中持续操作 UI。

验收目标：

- UI 主线程无明显卡顿。
- 取消能够在可接受时间内生效。
- 进度稳定递增。
- Worker 崩溃不会破坏用户体系数据。

## 8. 验收条件

- 不再返回固定演示成功率。
- Rust 和 TypeScript 对固定 seed 的 golden case 一致。
- 10,000 次模拟可以完成。
- 取消、错误和重试状态正确。
- 模拟结果可保存、恢复和标记过期。
