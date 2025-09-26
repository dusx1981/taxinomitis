# 存储服务数据存储位置分析

这个存储服务采用了 **双重存储策略**，根据浏览器环境自动选择存储位置。以下是详细分析：

---

## 第一步：存储策略决策流程

```javascript
function confirmLocalStorage() {
    // 1. 检查浏览器是否支持 localStorage
    // 2. 测试 localStorage 是否实际可用
    // 3. 根据测试结果选择存储方案
}
```

---

## 第二步：两种存储方案的具体实现

### 方案A：真正的 Local Storage（持久化存储）

```javascript
function setupLocalStorage() {
    clearFn = $window.localStorage.clear.bind(localStorage);
    setItemFn = $window.localStorage.setItem.bind(localStorage);
    getItemFn = $window.localStorage.getItem.bind(localStorage);
    removeItemFn = $window.localStorage.removeItem.bind(localStorage);
}
```

**存储位置**：`浏览器本地存储 (Local Storage)`

* **持久化**：浏览器关闭后数据仍然存在
* **容量**：通常 5-10MB
* **访问方式**：浏览器开发者工具 → Application → Local Storage

---

### 方案B：临时内存存储（会话级存储）

```javascript
function setupTemporaryLocalStorage() {
    $window._tempLocalStorage = {};  
    
    clearFn = function () {
        $window._tempLocalStorage = {};
    };
    setItemFn = function (key, val) {
        $window._tempLocalStorage[key] = val;
    };
    getItemFn = function (key) {
        return $window._tempLocalStorage[key];
    };
}
```

**存储位置**：`浏览器内存中的 JavaScript 对象`

* **临时性**：页面刷新或关闭后数据丢失
* **容量**：受限于浏览器内存
* **访问方式**：浏览器控制台输入 `window._tempLocalStorage`

---

## 第三步：存储位置判断逻辑

### 检测条件

```javascript
try {
    if ($window.localStorage) {
        $window.localStorage.setItem('test', 1);
        $window.localStorage.removeItem('test');
        localStorageAvailable = true;
    }
} catch (e) {
    setupTemporaryLocalStorage();
}
```

### 触发临时存储的常见场景

1. Safari 隐私浏览模式
2. 浏览器禁用 localStorage
3. 存储空间已满
4. 某些移动浏览器限制

---

## 第四步：实际数据存储示例

### 场景1：正常浏览器环境

```javascript
storageService.setItem('userSettings', '{theme: "dark"}');
```

存储位置：

* **Chrome DevTools → Application → Local Storage → 当前域名**
* Key: `userSettings`
* Value: `{theme: "dark"}`

---

### 场景2：隐私浏览模式

```javascript
storageService.setItem('userSettings', '{theme: "dark"}');
```

存储位置：

```javascript
window._tempLocalStorage = {
    'userSettings': '{theme: "dark"}'
}
```

---

## 第五步：数据持久性对比

| 特性       | localStorage 存储 ✅ | 临时内存存储 ❌ |
| -------- | ----------------- | -------- |
| **持久性**  | 页面刷新、浏览器重启后依然存在   | 页面刷新后丢失  |
| **容量限制** | 5-10MB            | 受限于可用内存  |
| **共享范围** | 同源的所有标签页共享        | 仅当前标签页有效 |
| **数据安全** | 存储在磁盘上            | 仅在内存中    |

---

## 第六步：验证存储位置的调试方法

### 方法1：浏览器开发者工具

```javascript
// 如果使用 localStorage：
localStorage.getItem('your-key');

// 如果使用临时存储：
window._tempLocalStorage['your-key'];
```

### 方法2：服务调试

```javascript
function setItem(key, val) {
    if (!setItemFn) {
        confirmLocalStorage();
    }
    console.log('存储方式:', window._tempLocalStorage ? '临时存储' : 'localStorage');
    setItemFn(key, val);
}
```

---

## 总结

**存储服务的数据可能存储在两个地方：**

1. **首选位置**：`浏览器 Local Storage`（持久化）

   * 适用于大多数现代浏览器
   * 数据持久保存

2. **备用位置**：`浏览器内存中的临时对象`（临时性）

   * 用于隐私模式或受限环境
   * 数据仅在当前会话有效

**智能选择策略确保了应用在各种浏览器环境下的兼容性**，即使在不支持 localStorage 的环境中也能正常运行，只是数据无法持久化保存。