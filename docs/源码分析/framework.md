# 🚀 启动流程梳理

## 1. 启动前检查与全局 handler（`app.ts` 顶部）

* **环境检查**：`confirmRequiredEnvironment()`
  ➝ 确认必须的环境变量存在，不满足就退出。
* **进程信号与异常处理**：

  * `process.on('uncaughtException', shutdown.crash)` → 捕获未处理异常。
  * `process.on('SIGTERM'/'SIGINT', shutdown.now(...))` → 优雅关机。
* **维护模式标记**：`env.inMaintenanceMode()` → 决定后续 API 是否注册。

---

## 2. 初始化外部依赖（`app.ts`）

* `slack.init()` → Slack 通知。
* `email.init()` → 邮件发送池。
* `objectstore.init()` → S3/Object Storage。
* `iamcache.init()` → IAM token 缓存。
* `credentialscheck.init()` → 权限/密钥检查。

---

## 3. 连接数据库（`store.init()`）

* 只有 DB **连接成功** 才继续。
* 成功后：

  * `sitealerts.refreshCache()` → 缓存站点公告。
  * `const app = express()` → 创建 Express 实例。
  * `host/port` 读取 → `process.env.HOST` / `env.getPortNumber()`。
  * 调用 `restapi(app)`。
  * `app.listen(port, host)` 启动 HTTP 服务。

---

## 4. 注册中间件 & 路由（`restapi/index.ts`）

### (1) 安全/通用中间件

* `app.use(query())` → 解析 query 参数。
* `app.use(helmet({ ... }))` → 设置安全头：

  * `contentSecurityPolicy: { directives: CSP_DIRECTIVES, reportOnly: true }`
  * 其它：`crossOriginResourcePolicy: same-site`，`crossOriginEmbedderPolicy: false`。

### (2) UI 静态文件（`setupUI` in `config.ts`）

* `/static/*` → `web/static`（前端 js/css/images）。
* `/` 根路径 → `web/dynamic`（SPA 入口）。
* 特殊挂载：

  * `/static/bower_components/tensorflow-models` → tf 模型。
  * `/scratch` → `mlforkids-scratch/scratch3`。
  * `/stories/<name>` → story html。
  * `/twitter-card.html` → 移除 `x-frame-options` 允许嵌入。
* 静态资源全部带：`compression()` + 缓存头（`ONE_YEAR` / `ONE_HOUR` / `FIVE_MINUTES`）。

### (3) Body parser 按路由限流

* 不同 API 限制 payload 大小：

  * ngrams: 3MB
  * sounds: 400kb
  * 默认: 100kb

### (4) API 注册

* `registerBluemixApis(app)`
* `registerUserApis(app)`
* `registerProjectApis(app)`
* `registerLocalProjectApis(app)`
* `registerTrainingApis(app)`
* `registerImageApis(app)`
* `registerSoundApis(app)`
* `registerModelApis(app)`
* `registerScratchApis(app)`
* `registerAppInventorApis(app)`
* `registerWatsonApis(app)`
* `registerClassifierApis(app)`
* `registerNgramApis(app)`
* `registerSessionUserApis(app)`
* `registerDebugApis(app)`
* `registerSiteAlertApis(app)`（**总是注册**）

> ⚠️ 若 `env.inMaintenanceMode() === true`，除 site alerts 外，其余 API 都被替换为 `errors.siteInMaintenanceMode`。

### (5) 错误处理

* `errors.registerErrorHandling(app)` → 统一错误响应。
* `errors.register404Handler(app)` → 处理未知路由。

---

# 🌐 启动后提供的服务

1. **静态 UI 路径**

   * `/` → 前端 SPA
   * `/static/*` → 静态资源（js/css/img）
   * `/scratch`, `/stories/*`, `/twitter-card.html` 等
2. **REST API**

   * 用户、项目、训练、模型、图像、音频、Watson、Scratch、Ngram、调试接口。
3. **Site alerts**

   * 总是可用，即使维护模式。

---

# 🔑 关键安全/性能设置

* **CSP (`reportOnly`)**：安全监控，调试时能在浏览器控制台看到 CSP 报告。
* **compression**：gzip 压缩，减小传输量。
* **缓存头 (maxAge)**：提高静态文件加载性能。
* **bodyParser 分流限流**：避免大 payload 攻击。
* **store.init gating**：确保 DB 先连上再监听端口。
* **维护模式开关**：快速屏蔽业务 API。
* **进程信号 handler**：保证优雅退出。

---

# 🛠️ 启动后检查清单

1. **日志**：控制台应有 `Running on host:port`。
2. **静态资源**：`curl http://host:port/static/` → 应返回文件列表。
3. **首页**：浏览器打开 `http://host:port/` → SPA 页面。
4. **CSP Header**：在浏览器 DevTools → Network → Response Headers 检查 `content-security-policy-report-only`。
5. **API**：

   * `curl http://host:port/sitealerts` → 应返回 JSON。
   * 若在维护模式，`curl http://host:port/projects` → 应返回 maintenance 错误。
6. **DB 状态**：若 DB 失败，进程不会进入 listen。
7. **对象存储/IAM**：测试上传图片/音频接口是否正常。

---

# 📌 总结

* **执行顺序**：
  环境检查 → 初始化外部依赖 → 连接数据库 → 创建 Express → 中间件/静态 UI → API 注册 → 错误处理 → listen。
* **服务内容**：
  前端 UI 静态文件 + REST API（分领域） + sitealerts。
* **调试重点**：
  路径映射（`__dirname`）、CSP 报告、bodyParser 限流、维护模式逻辑。
