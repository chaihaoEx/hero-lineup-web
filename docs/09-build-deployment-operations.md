# 09. 构建、Nginx 与运维

## 1. 构建目标

项目构建命令：

```bash
npm ci
npm run build
```

只生成静态目录：

```text
dist/
```

生产服务器不需要安装 Node.js；Node.js 只用于本地或 CI 构建。

## 2. 环境配置

公开配置通过构建变量提供：

```text
VITE_BASE_PATH
VITE_CONTENT_BASE
VITE_APP_VERSION
```

不得在前端构建中放置密码、Token 或服务器私钥。浏览器包中的所有变量都可以被用户读取。

## 3. Nginx

当前测试域名：

```text
vst2t.i7yun.top
```

当前生产发布目录：

```text
/var/www/hero-lineup-web-releases/{commit-sha}/
/var/www/hero-lineup-web-current -> /var/www/hero-lineup-web-releases/{commit-sha}/
```

推荐配置：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vst2t.i7yun.top;

    root /var/www/hero-lineup-web-current;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /content/ {
        expires 30d;
        add_header Cache-Control "public";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

## 4. HTTPS

生产环境必须配置 HTTPS，原因包括：

- Clipboard API。
- Service Worker。
- PWA。
- 用户数据导入导出安全。

可使用 Let’s Encrypt：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d vst2t.i7yun.top
```

## 5. 发布方式

当前 GitHub Actions 采用版本目录和原子切换：

```text
/var/www/hero-lineup-web-releases/{commit-sha}/
/var/www/hero-lineup-web-current -> /var/www/hero-lineup-web-releases/{commit-sha}/
```

发布流程：

1. CI 完成测试。
2. 生成 `dist`。
3. 上传到新版本目录。
4. 校验文件数量和 hash。
5. 切换 `current`。
6. 执行 `nginx -t`。
7. 公网冒烟测试。
8. 保留最近若干版本用于回滚。

不要直接在活动目录逐个覆盖文件，否则用户可能同时加载到新旧两套 hash 文件。

## 6. GitHub Actions

流水线包含：

- `verify`：内容校验、类型、lint、单元测试、三浏览器 E2E、PWA 离线测试、根目录构建和虚拟目录构建。
- `deploy`：仅 `main` 部署，上传不可变版本目录并原子切换软链接。
- 部署后检查首页与 `content/manifest.json`。

部署凭据必须放在 GitHub Actions Secrets，不能写入仓库。

## 7. 日志与监控

纯静态应用无需应用服务器日志，但应关注：

- Nginx access log。
- Nginx error log。
- HTTP 状态码。
- TLS 证书到期。
- 磁盘空间。
- 首页和 manifest 可用性。

如不希望收集用户行为，不加入第三方分析脚本。

问题反馈入口可以反向代理到同机 Gitea 的 `/issues/`。这是可选的独立服务，不属于应用运行依赖；Gitea 不可用时，配装、计算、存储、导入导出和离线启动仍须全部正常。

## 8. 验收条件

- 全新服务器只安装 Nginx 即可运行。
- 发布过程不会产生半更新状态。
- 可以在数分钟内回滚到上一版本。
- HTTPS 自动续期正常。
- 静态资源缓存策略正确。
- 页面不依赖任何长期运行的 Node 或 Rust 进程。
