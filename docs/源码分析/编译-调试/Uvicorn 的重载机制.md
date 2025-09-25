# 为什么打印两次 `"Logging to file mlforkids.log"`

## 现象

在代码中加入的调试语句：

```python
if getenv("MODE") == "development":
    basicConfig(filename="mlforkids.log", encoding="utf-8", level="INFO")
    print("Logging to file mlforkids.log")
```

启动应用时会打印两次 `"Logging to file mlforkids.log"`。

---

## 步骤分析

### 1. 模块加载

* 这段代码位于模块顶层。
* 每次模块被导入或执行时，都会立即运行。

### 2. 使用 `uvicorn.run(..., reload=True)`

```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,     # 开启重载模式
        log_level="debug"
    )
```

### 3. Uvicorn 的重载机制

* **主进程（reloader）**
  负责监视代码文件的变化。它会先导入 `app.main`，因此打印语句执行一次。
* **子进程（server）**
  真正运行 FastAPI 应用的进程。它再次导入 `app.main`，打印语句执行第二次。

> 所以打印出现两次是 **预期行为**，并非 bug。

---

## 为什么重载模式会这样？

* `--reload` 或 `reload=True` 的实现机制：一个进程负责热重启监控，另一个进程运行应用。
* 每个进程都需要导入并执行你的模块，导致顶层代码运行两次。

---

## 解决方案

### ✅ 方法 1 — 移到 `if __name__ == "__main__":`

```python
if __name__ == "__main__":
    if getenv("MODE") == "development":
        print("Logging to file mlforkids.log")
    import uvicorn
    uvicorn.run(...)
```

这样只有在直接运行脚本时才会打印。

---

### ✅ 方法 2 — 用 FastAPI 的启动事件

```python
@app.on_event("startup")
async def startup_event():
    if getenv("MODE") == "development":
        basicConfig(filename="mlforkids.log", encoding="utf-8", level="INFO")
        print("Logging to file mlforkids.log")
```

保证只在应用真正运行时执行，而不会在监控进程执行。

---

### ✅ 方法 3 — 接受开发模式的双进程行为

* 在开发时，看到两次打印是正常的。
* 生产环境一般不会开启 `--reload`，因此只会打印一次。

---

## 总结

* **原因**：Uvicorn 的 `reload=True` 会产生两个进程，各自导入模块 → 顶层代码运行两次。
* **解决办法**：

  * 移打印逻辑到 `if __name__ == "__main__":`
  * 或使用 FastAPI 的 `startup` 事件
  * 或直接接受开发模式的双打印