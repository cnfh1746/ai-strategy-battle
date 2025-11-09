# AI策略对战 - 完整流程分析

## 📋 整体架构

```
用户 → 扩展UI → UniversalGameEngine → GM(酒馆AI) + 玩家AI(外部API)
                      ↓
                 聊天记录(公开) + 秘密信息(私有)
```

## 🔄 完整游戏流程

### 1. 初始化阶段

**触发**: 页面加载时 `jQuery(async () => { ... })`

**步骤**:
1. ✅ 加载 settings.html 到扩展设置面板
2. ✅ 调用 `loadSettings()` 加载配置（6个AI的名字、API密钥等）
3. ✅ 创建浮动控制面板（右侧控制台）
4. ✅ 绑定按钮事件（开始、继续、停止、采访）
5. ✅ 0.5秒后显示控制面板

**潜在问题**: ❌ **无** - 初始化逻辑清晰

---

### 2. 用户配置阶段

**触发**: 用户在扩展设置中填写AI配置

**步骤**:
1. ✅ 用户填写每个AI的：
   - 名字（如 AI-Alpha）
   - API URL（默认 OpenAI）
   - API Key
   - 模型（如 gpt-4）
   - 自定义提示词（人格设定）

2. ✅ 点击"保存设置"触发 `saveSettings()`
3. ✅ 数据保存到 `extension_settings[extensionName]`

**潜在问题**: ❌ **无** - 保存逻辑正确

---

### 3. 游戏启动阶段

**触发**: 点击"▶️ 开始游戏"按钮 → `startGame()`

**步骤**:

```javascript
async function startGame() {
    // 3.1 检查API配置
    const missingConfig = settings.players.filter(p => !p.apiKey);
    if (missingConfig.length > 0) {
        toastr.error(`请先配置所有AI的API密钥`);
        return; // ✅ 阻止启动
    }
    
    // 3.2 更新UI状态
    $('#start_game').prop('disabled', true);   // ✅ 禁用开始按钮
    $('#stop_game').prop('disabled', false);   // ✅ 启用停止按钮
    
    // 3.3 创建游戏引擎实例
    gameEngine = new UniversalGameEngine(settings);
    // ✅ 初始化 apiConfigs（6个AI的配置）
    // ✅ 初始化 playerSecrets（每个AI的空秘密队列）
    
    // 3.4 更新采访目标下拉框
    $('#interview-target').empty().append(选项...);
    
    // 3.5 启动游戏主循环
    await gameEngine.startGame();
}
```

**潜在问题**: 
- ⚠️ **如果 `gameEngine.startGame()` 抛出异常，会进入 catch 块**
- ✅ catch 块正确恢复按钮状态
- ✅ 显示错误提示

---

### 4. 游戏主循环阶段

**触发**: `gameEngine.startGame()` 被调用

#### 4.1 开场白

```javascript
async startGame() {
    this.running = true;   // ✅ 标记游戏运行中
    this.paused = false;   // ✅ 初始未暂停
    
    toastr.info('游戏开始！扩展将协调6个AI依次行动');
    
    // 调用GM（酒馆AI）生成开场白
    const opening = await this.callGM('作为游戏主持人...');
    this.appendToChat('🎭 游戏主持', opening);
    // ✅ 开场白会出现在酒馆聊天记录中
```

**callGM 逻辑**:
```javascript
async callGM(prompt) {
    // 尝试4种方式查找生成函数
    const generateRaw = window.generateRaw || 
                      window.Generate?.generateRaw || 
                      getContext()?.generateRaw ||
                      SillyTavern?.getContext?.()?.generateRaw;
    
    if (!generateRaw) {
        // ✅ 打印调试信息
        console.error('[AI对战] 无法找到生成函数，尝试的路径:', {...});
        throw new Error('找不到SillyTavern生成函数...');
    }
    
    // ✅ 打印提示词和回复的前100字符（方便调试）
    console.log('[AI对战] 调用GM，提示词:', prompt.substring(0, 100) + '...');
    const response = await generateRaw(prompt, '', false, false);
    console.log('[AI对战] GM回复:', response.substring(0, 100) + '...');
    return response;
}
```

**潜在问题**:
- ⚠️ **如果找不到 generateRaw**：抛出异常 → 被 startGame() 的调用者（即 `async function startGame()`）捕获 → 进入 catch 块显示错误
- ✅ 错误处理完善

---

#### 4.2 主循环

```javascript
while (this.running) {
    // 4.2.1 检查暂停状态
    if (this.paused) {
        await this.waitForResume(); // ✅ 等待用户点击"继续"
    }
    
    // 4.2.2 询问GM下一步
    const gmInstruction = await this.callGM(`
作为游戏主持人，请判断：
1. 当前游戏是否结束？如果结束，请宣布结果并说"游戏结束"
2. 如果未结束，下一步需要哪个AI行动？请用格式回复：
   【轮到：AI名字】或【秘密指示：AI名字|秘密内容】
`);
    
    this.appendToChat('🎭 游戏主持', gmInstruction);
    
    // 4.2.3 检查游戏结束
    if (gmInstruction.includes('游戏结束')) {
        toastr.success('游戏结束！', 'AI对战');
        this.stopGame(); // ✅ 清理状态
        break;           // ✅ 退出循环
    }
    
    // 4.2.4 解析GM指令
    const secretMatch = gmInstruction.match(/【秘密指示[：:]\s*(.+?)\s*[|｜]\s*(.+?)】/);
    const publicMatch = gmInstruction.match(/【轮到[：:]\s*(.+?)】/);
    
    if (secretMatch) {
        // 秘密指示：给某个AI添加秘密信息
        const [, aiName, secretContent] = secretMatch;
        const player = this.findPlayerByName(aiName);
        if (player) {
            this.addSecret(player.id, secretContent);
            toastr.info(`已向 ${aiName} 发送秘密信息`);
        }
        // ⚠️ **注意**: 这里只是添加秘密信息，不调用AI
        //     AI会在下次【轮到：该AI】时看到秘密信息
        
    } else if (publicMatch) {
        // 公开行动：让某个AI发言/行动
        const aiName = publicMatch[1].trim();
        const player = this.findPlayerByName(aiName);
        
        if (player) {
            try {
                const hasSecret = this.playerSecrets[player.id].length > 0;
                const response = await this.callPlayerAI(player.id, hasSecret);
                this.appendToChat(`🎮 ${player.name}`, response);
            } catch (error) {
                console.error(`[AI对战] ${player.name} 行动失败:`, error);
                this.appendToChat(`🎮 ${player.name}`, '(沉默)');
                toastr.error(`${player.name} 响应失败`);
            }
        }
    }
    
    // 4.2.5 暂停并等待用户点击"继续"
    this.paused = true;
    $('#continue_game').prop('disabled', false); // ✅ 启用继续按钮
    this.appendToChat('🎮 系统', '⏸️ 点击"继续游戏"进入下一步');
}
```

**潜在问题分析**:

1. ⚠️ **GM没有按格式回复**
   - 如果GM既不说"游戏结束"，也不用【轮到：】或【秘密指示：】格式
   - 结果：什么都不会执行，直接暂停等待用户点击"继续"
   - 解决方案：❌ **需要添加兜底逻辑**

2. ⚠️ **findPlayerByName 找不到玩家**
   - 如果GM写的名字不匹配（如"AI Alpha"而不是"AI-Alpha"）
   - 结果：`player` 为 null，不会调用AI
   - 解决方案：❌ **需要模糊匹配或提示GM使用正确名字**

3. ✅ **callPlayerAI 异常处理完善**
   - API调用失败会被 catch 捕获
   - 显示"(沉默)"并继续游戏

---

#### 4.3 调用玩家AI

```javascript
async callPlayerAI(playerId, includeSecret = false) {
    const config = this.apiConfigs[playerId];
    if (!config || !config.key) {
        throw new Error(`玩家 ${playerId} API未配置`);
    }
    
    // 构建提示词
    let prompt = '';
    
    // 1. 人格设定
    if (config.customPrompt) {
        prompt += `[你的人格设定]\n${config.customPrompt}\n\n`;
    }
    
    // 2. 公开信息（聊天记录最近20条）
    prompt += `[公开信息 - 所有玩家都能看到]\n`;
    prompt += this.getChatContext(); // ✅ 过滤掉秘密指示
    
    // 3. 秘密信息（只有这个AI知道）
    if (includeSecret && this.playerSecrets[playerId].length > 0) {
        prompt += `\n\n[秘密信息 - 只有你知道，其他玩家看不到]\n`;
        prompt += this.playerSecrets[playerId].join('\n');
    }
    
    prompt += `\n\n请根据以上信息做出你的行动或发言。`;
    
    // 调用外部API
    let apiUrl = config.url.replace(/\/$/, '') + '/chat/completions';
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.key}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 1500
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API错误 ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // 记录到提示词日志
    if (window.addPromptLog) {
        window.addPromptLog(config.name, prompt, aiResponse);
    }
    
    return aiResponse;
}
```

**潜在问题**:
- ✅ API配置检查完善
- ✅ 异常处理完善（会被上层catch捕获）
- ✅ 提示词记录功能正常

---

#### 4.4 获取聊天上下文

```javascript
getChatContext() {
    const context = getContext();
    const chat = context.chat || [];
    return chat.slice(-20).map(msg => {
        const speaker = msg.is_user ? (context.name1 || '用户') : (msg.name || 'GM');
        let content = msg.mes;
        
        // 移除秘密指示标记（其他AI不应该看到）
        content = content.replace(/【秘密指示[：:].+?】/g, '[已执行秘密指示]');
        
        return `${speaker}: ${content}`;
    }).join('\n\n');
}
```

**潜在问题**:
- ✅ 只取最近20条（避免上下文过长）
- ✅ 正确过滤秘密指示
- ⚠️ **系统消息也会被包含**：`msg.is_user` 为 false 且 `msg.name` 为空时，会显示为 "GM"

---

### 5. 用户交互阶段

#### 5.1 点击"继续游戏"

**触发**: 用户点击"⏭️ 继续游戏"按钮 → `continueGame()`

```javascript
function continueGame() {
    if (gameEngine) {
        gameEngine.resume();
    }
}

// 在 UniversalGameEngine 中
resume() {
    if (this.paused && this.resumeCallback) {
        this.paused = false;                      // ✅ 取消暂停标志
        $('#continue_game').prop('disabled', true); // ✅ 禁用继续按钮
        this.resumeCallback();                    // ✅ 恢复主循环
    }
}

waitForResume() {
    return new Promise(resolve => {
        this.resumeCallback = resolve;  // ✅ 保存 resolve 函数
    });
}
```

**潜在问题**: ❌ **无** - 暂停/恢复机制完善

---

#### 5.2 点击"停止游戏"

**触发**: 用户点击"⏹️ 停止游戏"按钮 → `stopGame()`

```javascript
function stopGame() {
    if (gameEngine) {
        gameEngine.stopGame();
    }
    gameEngine = null;  // ✅ 清空引擎实例
    toastr.info('游戏已停止', 'AI对战');
}

// 在 UniversalGameEngine 中
stopGame() {
    this.running = false;  // ✅ 主循环会在下次检查时退出
    this.paused = false;   // ✅ 如果正在暂停，取消暂停
    this.clearAllSecrets(); // ✅ 清空所有秘密信息
    
    // ✅ 恢复按钮状态
    $('#start_game').prop('disabled', false);
    $('#continue_game').prop('disabled', true);
    $('#stop_game').prop('disabled', true);
}
```

**潜在问题**:
- ⚠️ **如果在等待GM回复时点击停止**：
  - `this.running` 被设为 false
  - 但 `await this.callGM()` 仍在执行
  - GM回复后会继续执行一次循环，检查到 `this.running === false` 才退出
  - **影响**：可能多执行一次GM调用
  - **解决方案**：❌ 需要在 callGM 中检查 running 状态

---

#### 5.3 采访AI功能

**触发**: 用户选择AI并点击"💬 发送采访"按钮 → `sendInterview()`

```javascript
async function sendInterview() {
    const targetId = $('#interview-target').val();
    const question = $('#interview-question').val().trim();
    
    // 验证输入
    if (!targetId || !question) {
        toastr.warning('请选择AI并输入问题');
        return;
    }
    
    if (!gameEngine || !gameEngine.running) {
        toastr.error('游戏未开始');
        return;
    }
    
    const config = gameEngine.apiConfigs[targetId];
    
    // 构建采访提示词（包含秘密信息）
    const interviewPrompt = `
[系统：玩家正在私密采访你]

你当前的秘密信息：
${gameEngine.playerSecrets[targetId].join('\n') || '(无)'}

当前公开聊天记录：
${gameEngine.getChatContext()}

玩家问：${question}

请根据你的记忆和当前状态真实回答（你可以选择对玩家隐瞒部分秘密信息）。
`;
    
    try {
        $('#send-interview').prop('disabled', true).text('思考中...');
        
        // 直接调用API（不经过聊天记录）
        let apiUrl = config.url.replace(/\/$/, '') + '/chat/completions';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: 'user', content: interviewPrompt }],
                temperature: 0.7,
                max_tokens: 1000
            })
        });
        
        if (!response.ok) throw new Error(`API错误 ${response.status}`);
        
        const data = await response.json();
        const answer = data.choices[0].message.content;
        
        // 显示回答
        $('#interview-answer').text(answer);
        $('#interview-response').slideDown();
        
        // 记录到提示词日志
        window.addPromptLog(`[采访] ${config.name}`, interviewPrompt, answer);
        
    } catch (error) {
        toastr.error(`采访失败: ${error.message}`);
    } finally {
        $('#send-interview').prop('disabled', false).text('💬 发送采访');
    }
}
```

**潜在问题**: ❌ **无** - 逻辑完善，不影响游戏进程

---

## 🐛 发现的所有问题汇总

### 严重问题 🔴

1. **GM不按格式回复时的处理**
   - 位置：主循环 4.2.4
   - 问题：如果GM既不说"游戏结束"，也不用【轮到：】或【秘密指示：】格式，会直接暂停，用户点继续后再次询问GM
   - 影响：可能导致无限循环
   - 建议：添加兜底逻辑，提示GM使用正确格式

2. **玩家名字不匹配时的处理**
   - 位置：findPlayerByName
   - 问题：严格字符串匹配，GM写错名字（如空格、大小写）会找不到
   - 影响：该回合AI无法行动
   - 建议：添加模糊匹配（去除空格、不区分大小写）

### 中等问题 🟡

3. **停止游戏时可能多执行一次GM调用**
   - 位置：stopGame() 与 callGM() 的时序
   - 问题：如果在等待GM回复时点击停止，GM仍会回复
   - 影响：浪费一次API调用
   - 建议：在 callGM 开始时检查 running 状态

4. **系统消息被识别为GM消息**
   - 位置：getChatContext()
   - 问题：系统消息（如"⏸️ 点击继续游戏"）会被当作GM的话
   - 影响：可能误导玩家AI
   - 建议：过滤或标记系统消息

### 轻微问题 🟢

5. **没有游戏开始前的规则说明**
   - 问题：GM需要从聊天记录推断规则
   - 建议：在 startGame 前添加一条系统消息，说明游戏规则和玩家名单

---

## ✅ 代码质量评估

### 优点

1. ✅ **错误处理完善**：所有异步操作都有 try-catch
2. ✅ **状态管理清晰**：running、paused 标志明确
3. ✅ **按钮状态同步**：各阶段按钮启用/禁用正确
4. ✅ **秘密信息机制**：隔离良好，其他AI看不到
5. ✅ **日志记录完善**：方便调试
6. ✅ **暂停/恢复机制**：Promise-based，逻辑清晰

### 需要改进的地方

1. ❌ GM指令解析的鲁棒性不足
2. ❌ 缺少对GM的格式提示和错误纠正
3. ❌ 玩家名字匹配太严格
4. ❌ 缺少游戏状态的持久化（刷新页面会丢失）
5. ❌ 没有游戏历史记录功能

---

## 🔧 建议的改进方案

### 1. 增强GM指令解析

```javascript
// 在主循环中添加
if (!secretMatch && !publicMatch && !gmInstruction.includes('游戏结束')) {
    // GM没有按格式回复
    console.warn('[AI对战] GM回复格式错误:', gmInstruction);
    
    // 提示GM使用正确格式
    const reminder = await this.callGM(`
你刚才的回复格式不正确。请严格使用以下格式之一：
1. 【轮到：AI-Alpha】（让AI-Alpha公开行动）
2. 【秘密指示：AI-Alpha|秘密内容】（给AI-Alpha秘密信息）
3. 说"游戏结束"并宣布结果

当前玩家名单：${Object.values(this.apiConfigs).map(c => c.name).join('、')}

现在请重新判断下一步行动。
`);
    this.appendToChat('🎭 游戏主持', reminder);
    // 不暂停，直接进入下一次循环
    continue;
}
```

### 2. 改进玩家名字匹配

```javascript
findPlayerByName(name) {
    const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
    
    for (let [id, config] of Object.entries(this.apiConfigs)) {
        const configName = config.name.toLowerCase().replace(/\s+/g, '-');
        if (configName === cleanName || config.name === name.trim()) {
            return { id, name: config.name };
        }
    }
    
    // 模糊匹配
    for (let [id, config] of Object.entries(this.apiConfigs)) {
        if (config.name.includes(name.trim()) || name.includes(config.name)) {
            console.warn(`[AI对战] 使用模糊匹配: "${name}" → "${config.name}"`);
            return { id, name: config.name };
        }
    }
    
    return null;
}
```

### 3. 在游戏开始前添加规则说明

```javascript
async startGame() {
    this.running = true;
    this.paused = false;
    
    // 添加游戏规则和玩家名单
    const playerList = Object.values(this.apiConfigs).map(c => c.name).join('、');
    this.appendToChat('🎮 系统', `
游戏开始！
参与玩家：${playerList}

【GM指令格式说明】
- 让某个AI行动：【轮到：AI名字】
- 给某个AI秘密信息：【秘密指示：AI名字|秘密内容】
- 结束游戏：说"游戏结束"

请GM根据上述规则指挥游戏进行。
`);
    
    toastr.info('游戏开始！扩展将协调6个AI依次行动', 'AI对战');
    
    const opening = await this.callGM('作为游戏主持人...');
    this.appendToChat('🎭 游戏主持', opening);
    
    // ... 后续代码
}
```

---

## 📊 总体评价

**代码质量**: ⭐⭐⭐⭐☆ (4/5)

**优点**:
- 核心逻辑正确，流程清晰
- 错误处理完善
- 代码结构良好，易于维护

**改进空间**:
- GM指令解析需要更强的鲁棒性
- 玩家匹配可以更智能
- 缺少一些提示和容错机制

**结论**: 现有代码可以正常工作，但在GM不按格式回复时可能卡住。建议添加上述3个改进方案。
