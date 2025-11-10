# Chrome DevTools MCP 使用指南

## ✅ 已完成配置（一次性设置）

### 1. ✅ MCP 已配置完成

配置文件：`cline_mcp_settings.json`

```json
{
  "mcpServers": {
    "chrome-devtools-mcp": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"],
      "disabled": false
    }
  }
}
```

### 2. 启动 Edge（推荐用 Edge）

**方法 1：双击脚本（推荐）**
```
启动Edge远程调试.bat
```

**方法 2：手动启动**
```cmd
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
```

### 3. 验证连接
访问 http://localhost:9222 - 能看到调试界面就成功了

---

## 🚀 日常使用流程

### 判断是否需要启动浏览器

**第一步：检查调试端口**
```
访问 http://localhost:9222
```

**结果判断：**
- ✅ **能访问** → Edge 已运行，MCP 直接可用，标签页完全保留
- ❌ **不能访问** → 需要启动 Edge（双击 `启动Edge远程调试.bat`）

### MCP 工具使用流程

1. **列出所有标签页**
   ```
   工具：list_pages
   结果：显示所有打开的标签页及索引
   ```

2. **切换标签页**
   ```
   工具：select_page
   参数：pageIdx (标签页索引)
   ```

3. **截图操作**
   ```
   工具：take_screenshot
   
   ⚠️ 重要：必须使用完整绝对路径
   
   正确示例：
   filePath: "e:/AXMU/B项目大全/mcp/chrome-devtools-mcp-chrome-devtools-mcp-v0.10.1/截图.png"
   
   错误示例：
   filePath: "截图.png"  ❌ 不会保存到当前目录
   ```

---

## 💡 核心要点

### ✅ 保留标签页的秘诀

```
1. 用远程调试参数启动 Edge（只需一次）
2. 保持 Edge 运行，不要关闭
3. MCP 随时连接/断开都不影响浏览器
4. 标签页永久保留
```

### 判断是否需要重启

访问 http://localhost:9222
- ✅ 能访问 → 直接用，不需要任何操作
- ❌ 不能访问 → 需要用远程调试参数重启

---

## 🔧 故障排查

**MCP 连接失败？**
1. 检查 Edge 是否运行
2. 访问 http://localhost:9222 验证
3. 如果不行，用远程调试参数重启 Edge

**端口被占用？**
```cmd
netstat -ano | findstr 9222
taskkill /F /PID <进程ID>
```

---

## 📝 最佳实践

1. **创建快捷方式**（推荐）
   - 目标：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222`
   - 以后都用这个快捷方式打开 Edge

2. **保持运行**
   - 启动后让 Edge 一直运行
   - MCP 可以随时连接
   - 工作状态完全保留

---

## 🎯 AI 使用避坑指南

### ❌ 常见错误

1. **截图路径错误**
   ```javascript
   // ❌ 错误：相对路径不会保存到当前目录
   filePath: "screenshot.png"
   
   // ✅ 正确：使用完整绝对路径
   filePath: "e:/AXMU/B项目大全/mcp/chrome-devtools-mcp-chrome-devtools-mcp-v0.10.1/screenshot.png"
   ```

2. **重复配置 MCP**
   - ⚠️ MCP 已配置完成（cline_mcp_settings.json）
   - ⚠️ 不要反复从配置开始
   - ✅ 直接使用 MCP 工具即可

3. **不必要的重启浏览器**
   - ⚠️ 先访问 http://localhost:9222 检查
   - ✅ 能访问就直接用，不需要重启
   - ❌ 不要每次都重启浏览器

### ✅ 正确流程

```
1. 检查端口 → http://localhost:9222
   ├── 能访问 → 直接用 MCP 工具
   └── 不能访问 → 启动浏览器

2. 使用 MCP 工具
   ├── list_pages → 查看所有标签页
   ├── select_page → 切换到目标标签页
   └── take_screenshot → 截图（用绝对路径！）

3. 标签页完全保留
   ├── 不需要重新登录
   ├── 不需要重新打开
   └── 工作状态持久化
```

---

## 📸 验证截图示例

### 已验证功能：
- ✅ 连接到运行中的 Edge
- ✅ 识别多个标签页（哔哩哔哩 + SillyTavern 酒馆）
- ✅ 标签页完全保留
- ✅ 可以切换和截图
- ✅ 工作状态不中断

**测试文件：**
- `酒馆页面截图.png` - SillyTavern 界面
- `哔哩哔哩页面截图.png` - B站首页
