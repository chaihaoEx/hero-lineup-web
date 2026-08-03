# 缓存系统优化方案验证报告

> 验证对象：`12-cache-system-optimization.md`
>
> 验证日期：2026-08-03
>
> 验证范围：当前项目实现、Service Worker、内容加载、Nginx 配置、部署流程、离线测试及线上缓存响应头

## 1. 总体结论

方案的总体方向正确，对项目当前缓存现状的描述也基本准确，但不建议直接按照原文实施。

以下设计值得保留：

- 使用内容哈希目录，例如 `/content/versions/{contentVersion}/...`。
- 对版本化资源设置一年期 `immutable` 缓存。
- 使用稳定清单发现当前内容版本。
- 在单次会话中固定使用同一个内容版本，避免数据和图片跨版本。
- Sprite 图片继续按需加载，不全部加入预缓存。
- 部署时保留旧版不可变资源，并通过稳定入口进行原子切换。
- 分阶段实施并补充离线、升级和回滚测试。

不过，原方案仍存在多处缓存语义、Service Worker 生命周期、资源映射和回滚设计方面的问题。实施前至少需要修订本文列出的七项关键问题。

## 2. 当前状态验证

经项目代码和线上响应头核对，原文对下列现状的判断成立：

- 当前稳定内容清单约为 423 KB。
- 首次目录加载涉及的核心 JSON 未压缩体积约为 8.27 MB。
- 内容目录包含超过 2200 个 Sprite 文件。
- 当前 Service Worker 使用固定的 `hero-lineup-sprites-v1` 运行时缓存。
- 当前 Sprite 和 TextAsset 资源只有约一小时的浏览器缓存。
- Nginx 返回了重复的 `Cache-Control` 响应头。
- 部署使用新的 release 目录并切换符号链接；旧 release 目录虽然仍然存在，但旧资源无法继续通过原来的公开 URL 访问。
- 当前离线测试只覆盖单一构建版本的离线重载，没有覆盖两个版本之间的升级、失败回退和回滚。

相关实现位置：

- `vite.config.ts`
- `src/data/browserCatalog.ts`
- `src/platform/bridge.ts`
- `src/core/interchange.ts`
- `ops/nginx/hero-lineup-web.conf`
- `.github/workflows/ci-deploy.yml`
- `e2e-pwa/offline.spec.ts`

## 3. 必须修订的关键问题

### 3.1 未版本化兼容资源不能缓存 30 天

原方案为未版本化兼容资源设置：

```text
public, max-age=2592000, must-revalidate
```

这一规则存在缓存风险。`must-revalidate` 只在资源过期后生效；在 30 天的新鲜期内，浏览器仍可以直接使用旧资源而不向服务器确认。

这与“可变 URL 不能长时间缓存”的设计原则冲突。

建议：

- 未版本化资源保持 `no-cache`；或
- 在迁移期最多维持当前约一小时的缓存；
- 只有包含内容哈希的不可变 URL 才设置一年期 `immutable`。

参考：[RFC 9111 — HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)

### 3.2 稳定清单与 Workbox 预缓存职责冲突

当前 Vite PWA 配置会将 JSON 文件加入 Workbox 预缓存，其中包括稳定的 `content/manifest.json`。

Workbox 预缓存默认采用 cache-first。稳定清单一旦进入预缓存，受 Service Worker 控制的页面通常不会在每次启动时通过网络发现新内容，而要等到新的 Service Worker 安装。

原方案需要明确选择一种发布模型：

1. 内容发布永远伴随新的前端和 Service Worker，稳定清单由 SW 更新；或
2. 内容可以独立发布，稳定清单排除在 precache 之外，使用 `NetworkFirst` 或显式网络请求，并用旧清单作为离线回退。

如果项目未来需要独立更新内容，建议采用第二种方案。

参考：[Workbox Precaching](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)

### 3.3 动态 Sprite 缓存名称不能直接按原方案实现

原方案希望使用：

```text
hero-lineup-sprites-{activeVersion}
```

但 `activeVersion` 是运行时从稳定清单读取的，而当前 Workbox `generateSW` 配置中的 `cacheName` 是构建时确定的。

可以选择：

- 内容构建完成后，将 contentVersion 注入 Vite 配置；
- 改用 `injectManifest`，自行管理 Service Worker；
- 继续使用一个固定的 Sprite 缓存名称。

推荐第三种。由于资源 URL 本身已经包含 contentVersion，固定缓存不会导致跨版本串用资源，同时还能避免为每个版本建立一个最多容纳 3000 项的新缓存。

### 3.4 保留上一个完整版本与自动清理机制冲突

当前配置启用了：

```ts
cleanupOutdatedCaches: true
```

Workbox 会在新的 Service Worker 激活时清理旧的预缓存，而页面对新内容进行结构和业务校验发生在激活之后。

如果新文件能够返回 HTTP 200，但内容结构不合法，旧的预缓存可能已经被清理，从而无法实现原方案提出的“回退到上一个完整版本”。

若要提供可靠的 last-known-good 回退，应补充：

- 持久记录最后一次验证成功的 contentVersion；
- 明确定义一个“完整版本”需要包含的 JSON、Schema 和默认资源；
- 新版本通过完整业务校验后，才允许清理旧版本；
- 使用自定义 Service Worker 或独立命名的核心内容缓存管理两个版本。

仅依靠 `cleanupOutdatedCaches` 无法提供该保证。

### 3.5 共享不可变资源目录缺少 Nginx 映射

原方案提出建立：

```text
/var/www/hero-lineup-static/assets
/var/www/hero-lineup-static/content/versions
```

但其 Nginx 示例仍然通过当前 release 根目录执行 `try_files $uri`。浏览器请求 `/hero-lineup/content/versions/...` 时，不会自动访问上述共享目录。

需要在方案中明确增加以下任一方式：

- 使用 Nginx `alias` 将公开 URL 映射到共享目录；
- 在稳定根目录建立固定符号链接；
- 使用独立静态资源域名或静态资源根目录。

否则 release 切换后，旧版本文件仍可能返回 404。

### 3.6 回滚范围不完整

原方案认为回滚主要切换 `index.html`、`sw.js` 和稳定内容清单。实际上至少还需要保持以下内容一致：

- `index.html`
- `sw.js`
- `manifest.webmanifest`
- 稳定内容清单
- 稳定应用图标，例如 `app-icon.svg`
- 当前前端版本对应的静态入口
- 对应版本的内容发现信息

建议不要逐个替换文件，而是将这些稳定文件组成完整 release，通过符号链接进行原子切换。

还需要考虑 Service Worker 的异步激活过程。强制 `skipWaiting` 可能使已打开的页面在运行中同时访问新旧版本资源，因此升级和回滚测试必须覆盖已经打开的客户端。

参考：[Workbox Service Worker Lifecycle](https://developer.chrome.com/docs/workbox/service-worker-lifecycle)

### 3.7 contentVersion 的可复现性存在漏洞

当前内容清单包含 `createdAt`。如果 contentVersion 只根据内容文件计算，而不可变版本清单中的 `createdAt` 每次构建都会变化，就会产生以下情况：

- contentVersion 相同；
- 对应的 manifest 文件字节内容不同。

这违反了“同一个不可变 URL 永远对应相同内容”的原则。

建议选择一种处理方式：

- 从不可变版本清单中移除构建时间；
- 使用源数据中稳定、可复现的时间；
- 将最终版本清单的完整字节内容纳入 contentVersion 计算。

## 4. 需要补充的设计

### 4.1 建立统一的内容 URL 解析器

当前项目存在多套固定内容路径：

- `browserCatalog.ts` 加载 TextAsset 和清单；
- `bridge.ts` 生成图片等内容资源 URL；
- `interchange.ts` 加载 Schema。

版本化迁移必须覆盖全部路径，而不能只修改 React 图片组件。

建议建立统一的 `ContentVersionContext` 或内容 URL 解析服务，由它负责：

- 当前固定的 contentVersion；
- TextAsset URL；
- Sprite URL；
- Schema URL；
- 稳定清单 URL；
- 离线回退版本。

### 4.2 应用版本不能继续硬编码

当前浏览器目录加载器中的应用版本为硬编码的 `0.1.0`。

如果稳定清单使用 `minimumAppVersion`，应用版本应从 package 或构建环境注入，否则版本兼容判断可能失真。

### 4.3 重新定义资源保留期限

“发布后保留 400 天”并不等于严格支持客户端离线一年。旧客户端可能很久以后才首次请求某个旧 Sprite，此时服务器上的旧版本可能已经被删除。

需要明确：

- 支持旧客户端的最长时间；
- 可自动清理版本的条件；
- 可回滚版本的固定保留策略；
- 是否按最后访问时间而不是发布时间清理；
- 是否允许不可变资源长期保留。

### 4.4 评估整目录版本化的复用成本

整个内容目录共用一个 contentVersion 可以保证强一致性，但只修改一张图片也会改变所有内容 URL，降低浏览器和 CDN 的跨版本缓存复用率。

该方案可以作为第一阶段实现，但应记录这一取舍。后续如存储或流量压力明显，可升级为单文件内容哈希或分组版本。

### 4.5 统一 Nginx 配置

项目根目录还存在另一套 `nginx.conf`。其通用图片规则可能将未版本化 PNG 缓存一年，与生产配置不一致。

建议删除不再使用的配置，或让所有部署入口引用同一份缓存策略，避免不同环境产生完全不同的缓存行为。

## 5. 测试方案补充

当前测试主要验证单一构建版本的离线访问。缓存系统改造后，至少应加入以下完整流程：

1. 部署构建 A。
2. 在线访问并缓存 A。
3. 将服务器切换到构建 B。
4. 更新 Service Worker 并加载 B。
5. 验证同一页面内所有内容 URL 都来自同一个 contentVersion。
6. 模拟 B 缺少文件或 JSON 业务校验失败。
7. 验证可以回退到最后一次成功的 A。
8. 断网并重新启动页面。
9. 验证离线仍能打开最后一个完整版本。
10. 将服务器回滚到 A，验证新旧 Service Worker 客户端均可恢复。

还应在真实 Nginx 环境或容器中验证：

- 稳定入口使用 `no-cache`；
- 哈希静态资源使用一年期 `immutable`；
- 未版本化兼容资源没有长缓存；
- 响应中不存在重复或互相冲突的 `Cache-Control`；
- 旧 contentVersion 在新 release 部署后仍可访问。

## 6. 与首次手机加载速度的关系

本方案主要解决：

- 缓存一致性；
- 新旧版本混用；
- 离线访问；
- 内容回滚；
- 重复下载不可变资源。

它不会直接解决首次手机访问速度问题。

目前首次打开仍然需要下载约 8.27 MB 的核心 JSON，新的两阶段清单流程还可能增加一次阻塞网络往返。如果目标同时包括优化移动端首次打开速度，还需要单独实施：

- 将大型 JSON 按页面或功能拆分；
- 首屏只加载必需数据；
- 其余内容按需加载；
- 检查并优化 Brotli/Gzip 压缩；
- 缩小稳定清单；
- 减少首次目录构建和 JSON 解析成本。

## 7. 建议实施顺序

### 第一阶段：建立正确的版本化资源基础

- 生成可复现的 contentVersion。
- 输出版本化内容目录和版本清单。
- 建立统一内容 URL 解析器。
- 对版本化资源使用长期 `immutable`。
- 未版本化兼容资源保持短缓存或 `no-cache`。

### 第二阶段：修正部署和共享存储

- 为共享静态目录增加明确的 Nginx 映射。
- 使用完整 release 符号链接原子切换稳定文件。
- 统一项目内的 Nginx 配置。
- 确保旧版本资源在 release 切换后继续可访问。

### 第三阶段：完善 Service Worker

- 明确稳定清单是否跟随 SW 发布。
- 优先使用固定的 Sprite 运行时缓存和版本化 URL。
- 如确实需要 last-known-good 回退，再改为自定义 Service Worker。
- 定义缓存清理、版本固定和失败回退算法。

### 第四阶段：补齐升级和回滚测试

- 增加构建 A 到构建 B 的升级测试。
- 增加不完整 B 的失败回退测试。
- 增加在线、离线和服务器回滚组合测试。
- 在真实 Nginx 环境中验证缓存响应头。

## 8. 最终判断

原方案可以作为缓存系统重构的设计基础，但实施前必须先修正：

1. 未版本化资源 30 天缓存问题；
2. 稳定清单与 Workbox precache 的职责冲突；
3. 动态缓存名称的实现方式；
4. 自动清理与 last-known-good 回退的冲突；
5. 共享资源目录的 Nginx 映射；
6. 回滚边界和 Service Worker 生命周期；
7. contentVersion 与版本清单的可复现性。

完成这些修订后，方案在缓存正确性、离线可靠性和部署回滚方面才具备可实施性。
