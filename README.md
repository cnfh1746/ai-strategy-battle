# AI策略对战 - SillyTavern扩展

一个创新的SillyTavern扩展，让多个AI智能体在策略游戏中相互对战。

🔗 **GitHub仓库**: https://github.com/cnfh1746/ai-strategy-battle

⭐ 如果觉得有用，请给个Star！

## 🎮 功能特性

### 核心功能
- **多AI对战**: 支持6个AI同时参与游戏
- **多种游戏模式**: 狼人杀、资源争夺等
- **灵活执行**: 顺序执行、并行执行、手动控制三种模式
- **淘汰赛系统**: 支持单场游戏和淘汰赛两种比赛结构

### 已实现游戏
1. **狼人杀** (6人局)
   - 角色: 2狼人 + 2村民 + 1预言家 + 1女巫
   - 完整的昼夜循环机制
   - AI自主推理、发言、投票

### 技术特点
- 🔌 直接调用AI API，不依赖酒馆对话系统
- 🎯 规则引擎与执行器分离，易于扩展
- 🎨 实时UI更新，游戏过程可视化
- 📊 详细的游戏日志记录

## 📦 安装

1. 将整个 `ai-strategy-battle` 文件夹放到 SillyTavern 的扩展目录：
   ```
   SillyTavern/public/scripts/extensions/ai-strategy-battle/
   ```

2. 重启 SillyTavern

3. 在扩展管理中启用"AI策略对战"

## ⚙️ 配置

### 1. AI玩家配置

为每个AI玩家配置以下信息：
- **名称**: AI的显示名称
- **API类型**: OpenAI / Claude / 自定义
- **API URL**: API地址（留空使用默认）
- **API Key**: 你的API密钥
- **模型**: 使用的模型名称（如 gpt-4）

### 2. 游戏设置

- **游戏类型**: 选择要玩的游戏
- **执行模式**:
  - 顺序执行: AI逐个行动，适合观察思考过程
  - 并行执行: 所有AI同时行动，速度快
  - 手动控制: 点击"下一步"按钮控制进度
- **比赛结构**:
  - 单场游戏: 6人一局定胜负
  - 淘汰赛: 1v1对决，层层淘汰决出冠军

## 🎯 使用方法

1. 在扩展设置中配置6个AI的API信息
2. 选择游戏类型和执行模式
3. 点击"开始游戏"
4. 观看AI们的精彩对决！

## 🔧 架构设计

```
ai-strategy-battle/
├── manifest.json           # 扩展配置
├── index.js               # 主入口
├── settings.html          # 设置界面
├── style.css             # 样式文件
└── src/
    ├── core/
    │   ├── game-coordinator.js    # 游戏协调器
    │   └── rules/
    │       └── werewolf-rules.js  # 狼人杀规则引擎
    └── ui/
        └── ui-controller.js       # UI控制器
```

### 核心组件

#### GameCoordinator（游戏协调器）
- 管理游戏生命周期
- 协调规则引擎和执行器
- 支持单场和淘汰赛模式

#### RuleEngine（规则引擎）
- 定义游戏规则和胜利条件
- 为每个AI构建上下文提示词
- 处理AI的行动并更新游戏状态

#### Executor（执行器）
- **SequentialExecutor**: 顺序执行，适合观察
- **ParallelExecutor**: 并行执行，速度快
- **ManualExecutor**: 手动控制，便于调试

#### UIController（UI控制器）
- 实时显示游戏状态
- 展示玩家面板和游戏日志
- 美观的视觉效果

## 🎲 游戏说明

### 狼人杀规则

**角色配置**（6人局）:
- 🐺 狼人 x2: 每晚杀害一名好人
- 👤 村民 x2: 白天投票驱逐狼人
- 🔮 预言家 x1: 每晚查验一名玩家身份
- 💊 女巫 x1: 拥有一次救人机会

**游戏流程**:
1. 夜晚阶段：
   - 狼人选择击杀目标
   - 预言家查验身份
   - 女巫决定是否救人
2. 白天阶段：
   - 宣布昨夜结果
   - 玩家轮流发言
   - 投票驱逐嫌疑人

**胜利条件**:
- 好人胜利: 所有狼人被驱逐
- 狼人胜利: 狼人数 ≥ 好人数

## 🚀 扩展新游戏

### 创建自定义规则引擎

在 `src/core/rules/` 下创建新文件：

```javascript
// your-game-rules.js
export class YourGameRuleEngine {
    async initialize(players) {
        // 初始化游戏，分配角色等
    }
    
    buildPrompt(player) {
        // 为玩家构建当前状态的提示词
        return "你的游戏提示词...";
    }
    
    async processAction(player, action) {
        // 处理玩家的行动
    }
    
    async resolveRound() {
        // 回合结算
    }
    
    isGameOver() {
        // 判断游戏是否结束
        return false;
    }
    
    getWinner() {
        // 返回获胜者
        return { name: "Winner" };
    }
    
    getRoundResult() {
        // 返回回合结果用于UI显示
        return {};
    }
}
```

### 注册新游戏

在 `game-coordinator.js` 的 `loadRuleEngine` 方法中添加：

```javascript
case 'your-game':
    const { YourGameRuleEngine } = await import('./rules/your-game-rules.js');
    return new YourGameRuleEngine();
```

在 `settings.html` 中添加选项：

```html
<option value="your-game">你的游戏名称</option>
```

## 💡 设计理念

### 为什么直接调用API？

传统的扩展依赖酒馆的对话系统，但这会带来限制：
- 只能在对话流程中执行
- 难以实现多AI并行
- 无法精确控制每个AI的上下文

**我们的方案**：
- ✅ 完全独立的游戏系统
- ✅ 精确控制每个AI的提示词
- ✅ 支持并行和手动控制
- ✅ 更好的性能和灵活性

### 模块化架构

- **规则与引擎分离**: 轻松添加新游戏
- **执行器可替换**: 根据需求选择执行模式
- **UI独立**: 可以轻松修改界面样式

## 🐛 故障排除

### AI不响应
- 检查API Key是否正确
- 确认API URL可访问
- 查看浏览器控制台错误信息

### 游戏卡住
- 检查某个AI是否返回了无效格式
- 查看游戏日志中的错误提示
- 尝试使用手动模式逐步执行

### UI显示异常
- 刷新页面重新加载扩展
- 检查浏览器控制台是否有JS错误

## 🔮 未来计划

- [ ] 更多游戏模式（资源争夺、拍卖游戏等）
- [ ] 世界书自定义规则支持
- [ ] 游戏回放功能
- [ ] AI性格和策略预设
- [ ] 积分排行榜系统
- [ ] 更丰富的可视化效果

## 📝 开发日志

**v1.0.0** (2024-11-08)
- ✅ 核心游戏协调器
- ✅ 三种执行模式（顺序/并行/手动）
- ✅ 狼人杀完整规则
- ✅ 淘汰赛系统
- ✅ 美观的UI界面

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

特别欢迎：
- 新游戏规则的贡献
- UI/UX改进建议
- Bug报告和修复
- 文档完善

## 👨‍💻 作者

AXMU

---

**享受AI们的智慧对决吧！** 🎮🤖✨
