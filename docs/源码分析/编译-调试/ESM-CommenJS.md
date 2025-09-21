# 🚨 错误摘要

```
SyntaxError: Cannot use import statement outside a module
    at ... src/lib/app.ts:2
    import * as express from 'express';
```

Node 报错：它试图按 **CommonJS** 方式解析文件，但文件里用了 `import` / `export`（ESM 语法），因此报错。

---

# 🕵️ 一、为什么会发生

1. **项目配置**

   * `tsconfig.json` → `"module": "commonjs"`
   * 意味着编译输出是 CommonJS。

2. **运行方式**

   * 你使用了 `--loader ts-node/esm`。
   * 这个 loader 只适配 ESM 项目（`module: "NodeNext"` 或 `ESNext`）。

3. **结果**

   * Loader 和项目配置不匹配。
   * ts-node 没有正确转换 `.ts` → ESM，Node 按 CJS 方式直接执行，碰到 `import` 语法 → ❌ 报错。

---

# 📝 二、证据

* 错误堆栈里出现：

  ```
  Module._compile
  Module._extensions..js
  ```

  说明 Node 最后还是按 CommonJS 编译路径执行 `.ts` 文件。
* 说明 loader 根本没生效 / 没兼容你的配置。

---

# 🔧 三、可行修复方案（推荐顺序）

## ✅ 方案 1（推荐，最快修复）：改用 `ts-node/register` 或 `npx ts-node`

适配当前 `"module": "commonjs"`，无需修改 tsconfig。

### 命令行验证

```bash
# 直接运行（忽略类型检查，更快）
npx ts-node --transpile-only src/lib/app.ts

# 或用 Node + ts-node/register
node -r ts-node/register src/lib/app.ts
```

### VS Code `launch.json`

（替换掉原来的 `--loader ts-node/esm` 配置）

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch: ts-node (npx)",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["ts-node", "--transpile-only", "src/lib/app.ts"],
      "cwd": "${workspaceFolder}",
      "env": { 
        "NODE_ENV": "development", 
        "TS_NODE_PROJECT": "${workspaceFolder}/tsconfig.json" 
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "sourceMaps": true
    },
    {
      "name": "Launch: ts-node (register)",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/lib/app.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "cwd": "${workspaceFolder}",
      "env": { 
        "NODE_ENV": "development", 
        "TS_NODE_PROJECT": "${workspaceFolder}/tsconfig.json" 
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "sourceMaps": true
    },
    {
      "name": "Debug: dist/app.js (compiled)",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/lib/app.js",
      "cwd": "${workspaceFolder}",
      "env": { "NODE_ENV": "development" },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

---

## 方案 2：调试编译产物（dist）

构建后运行，与生产环境一致。

### 命令

```bash
npm run build_notest
npm start   # 实际运行 dist/lib/app.js
```

### VS Code（你已有）

```jsonc
{
  "name": "Debug: dist/app.js (compiled)",
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/dist/lib/app.js",
  "cwd": "${workspaceFolder}",
  "env": { "NODE_ENV": "development" },
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen",
  "sourceMaps": true,
  "outFiles": ["${workspaceFolder}/dist/**/*.js"]
}
```

---

## 方案 3（大改）：迁移为 ESM

需要：

* `package.json` 加 `"type": "module"`
* `tsconfig.json` 改：

  ```json
  "module": "NodeNext",
  "moduleResolution": "NodeNext"
  ```
* 然后运行：

  ```bash
  node --loader ts-node/esm src/lib/app.ts
  ```

⚠️ 风险：可能要改 `require()`/导入语法，兼容性差，工作量大。

---

# 🚦 四、执行建议

1. **立刻尝试方案 1**（最小改动）。

   ```bash
   npx ts-node --transpile-only src/lib/app.ts
   ```

   如果能跑通 → 用上面给的 `launch.json` 替换掉旧配置即可。

2. 若要严格一致于生产，建议用 **方案 2**。

3. 仅当你团队计划长期迁移到 ESM，再考虑 **方案 3**。