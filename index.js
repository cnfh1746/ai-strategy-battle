// AI策略对战扩展 - 通用版
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";

const extensionName = 'ai-strategy-battle';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 默认设置
const defaultSettings = {
    players: [
        { id: 'p1', name: 'AI-Alpha', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p2', name: 'AI-Beta', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p3', name: 'AI-Gamma', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p4', name: 'AI-Delta', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p5', name: 'AI-Echo', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p6', name: 'AI-Foxtrot', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' }
    ]
};

// ==================== 通用游戏引擎 ====================
class UniversalGameEngine {
    constructor(settings) {
        this.settings = settings;
        this.apiConfigs = {};
        this.running = false;
        this.paused = false;
        this.playerSecrets = {}; // 存储每个玩家的秘密信息
        
        settings.players.forEach(player => {
            this.apiConfigs[player.id] = {
                url: player.apiUrl || 'https://api.openai.com/v1',
                key: player.apiKey,
                model: player.model,
                customPrompt: player.customPrompt || '',
                name: player.name
            };
            this.playerSecrets[player.id] = []; // 初始化秘密信息队列
        });
    }
    
    // 调用酒馆AI（GM）- 直接让酒馆角色回复
    async callGM(userMessage) {
        const context = getContext();
        
        // 1. 添加用户消息到聊天（触发GM思考）
        this.appendToChat(context.name1 || '🎮 系统', userMessage);
        
        // 2. 等待一小段时间让界面更新
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 3. 触发GM生成回复
        const generateRaw = window.generateRaw || 
                          window.Generate?.generateRaw || 
                          getContext()?.generateRaw;
        
        if (!generateRaw) {
            throw new Error('找不到SillyTavern生成函数');
        }
        
        console.log('[AI对战] 触发GM回复...');
        
        // 调用生成函数，让GM基于当前聊天历史回复
        const response = await generateRaw('', '', false, false);
        
        console.log('[AI对战] GM回复:', response.substring(0, 100) + '...');
        return response;
    }
    
    // 调用玩家AI（可以包含秘密信息）- 并把回复插入酒馆
    async callPlayerAI(playerId, includeSecret = false) {
        const config = this.apiConfigs[playerId];
        if (!config || !config.key) throw new Error(`玩家 ${playerId} API未配置`);
        
        // 构建提示词
        let prompt = '';
        
        // 1. 人格设定
        if (config.customPrompt) {
            prompt += `[你的人格设定]\n${config.customPrompt}\n\n`;
        }
        
        // 2. 公开信息（聊天记录）
        prompt += `[公开信息 - 所有玩家都能看到]\n`;
        prompt += this.getChatContext();
        
        // 3. 秘密信息（只有这个AI知道）
        if (includeSecret && this.playerSecrets[playerId].length > 0) {
            prompt += `\n\n[秘密信息 - 只有你知道，其他玩家看不到]\n`;
            prompt += this.playerSecrets[playerId].join('\n');
        }
        
        prompt += `\n\n请根据以上信息做出你的行动或发言。`;
        
        // 调用API
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
        
        // 记录提示词
        if (window.addPromptLog) {
            window.addPromptLog(config.name, prompt, aiResponse);
        }
        
        // ⭐ 关键：把AI回复插入到酒馆聊天中
        this.appendToChat(`🎮 ${config.name}`, aiResponse);
        
        return aiResponse;
    }
    
    // 给某个AI添加秘密信息
    addSecret(playerId, secretInfo) {
        if (this.playerSecrets[playerId]) {
            this.playerSecrets[playerId].push(secretInfo);
            console.log(`[AI对战] 给 ${this.apiConfigs[playerId].name} 添加秘密信息:`, secretInfo);
        }
    }
    
    // 清空某个AI的秘密信息
    clearSecrets(playerId) {
        if (this.playerSecrets[playerId]) {
            this.playerSecrets[playerId] = [];
        }
    }
    
    // 清空所有AI的秘密信息
    clearAllSecrets() {
        Object.keys(this.playerSecrets).forEach(id => {
            this.playerSecrets[id] = [];
        });
    }
    
    // 获取聊天上下文（公开信息）- 过滤掉秘密指示
    getChatContext() {
        const context = getContext();
        const chat = context.chat || [];
        
        // 获取最近50条消息，确保GM能看到足够多的历史
        const recentMessages = chat.slice(-50);
        
        const contextText = recentMessages.map(msg => {
            const speaker = msg.is_user ? (context.name1 || '用户') : (msg.name || 'GM');
            let content = msg.mes;
            
            // 移除所有秘密指示标记（其他AI不应该看到）
            content = content.replace(/【秘密指示[：:].+?】/g, '[已执行秘密指示]');
            
            return `${speaker}: ${content}`;
        }).join('\n\n');
        
        console.log('[AI对战] GM上下文长度:', contextText.length, '字符');
        return contextText;
    }
    
    // 扫描历史消息，提取已有的秘密指示
    scanHistoryForSecrets() {
        const context = getContext();
        const chat = context.chat || [];
        
        console.log('[AI对战] 开始扫描历史消息，查找秘密指示...');
        
        let foundCount = 0;
        
        // 扫描最近100条消息
        const recentMessages = chat.slice(-100);
        
        for (const msg of recentMessages) {
            const content = msg.mes;
            
            // 查找所有秘密指示
            const secretMatches = [...content.matchAll(/【秘密指示[：:]\s*(.+?)\s*[|｜]\s*(.+?)】/g)];
            
            for (const match of secretMatches) {
                const [, aiName, secretContent] = match;
                const player = this.findPlayerByName(aiName);
                
                if (player) {
                    // 检查是否已经有这条秘密了（避免重复）
                    if (!this.playerSecrets[player.id].includes(secretContent)) {
                        this.addSecret(player.id, secretContent);
                        foundCount++;
                        console.log(`[AI对战] 从历史中恢复秘密: ${player.name} - ${secretContent.substring(0, 30)}...`);
                    }
                }
            }
        }
        
        if (foundCount > 0) {
            toastr.success(`已从历史消息中恢复 ${foundCount} 条秘密指示`, 'AI对战');
            window.addActionLog('系统', `从历史恢复了${foundCount}条秘密指示`);
            this.updatePlayersDisplay();
        } else {
            console.log('[AI对战] 历史消息中未找到秘密指示');
        }
    }
    
    // 添加消息到聊天
    appendToChat(speaker, message) {
        const context = getContext();
        context.chat.push({
            name: speaker,
            is_user: false,
            is_system: false,
            mes: message,
            send_date: Date.now()
        });
        context.saveChat();
        eventSource.emit(event_types.MESSAGE_RECEIVED, context.chat.length - 1);
    }
    
    // 游戏主循环
    async startGame() {
        this.running = true;
        this.paused = false;
        roundCounter = 0;
        actionHistory = [];
        
        // 初始化UI状态
        window.updateGameStatus('运行中', 0, '扫描历史消息');
        const initialPlayers = Object.entries(this.apiConfigs).map(([id, config]) => ({
            name: config.name,
            active: false,
            hasSecret: false,
            lastAction: null
        }));
        window.updatePlayersList(initialPlayers);
        window.addActionLog('系统', '游戏初始化完成');
        
        const playerList = Object.values(this.apiConfigs).map(c => c.name).join('、');
        
        toastr.info('扩展已启动，正在扫描历史消息...', 'AI对战');
        
        // ⭐ 关键：先扫描历史消息，提取已有的秘密指示
        // （因为用户可能在启动扩展前，就已经让GM分配了身份）
        this.scanHistoryForSecrets();
        
        // 不插入任何游戏规则或说明！
        // GM已经从世界书读取了规则，扩展只需要默默协调
        
        // 向酒馆发送一条简短的系统消息，触发GM继续
        const opening = await this.callGM(`🎮 扩展已启动，请继续主持游戏。

玩家名单：${playerList}

（使用【轮到：玩家名】让AI行动，使用【秘密指示：玩家名|内容】发送秘密信息）`);
        // GM的回复已经在 callGM 中插入酒馆了
        window.addActionLog('GM', opening.substring(0, 100));
        
        // 主循环：让GM指挥游戏进程
        while (this.running) {
            roundCounter++;
            window.updateGameStatus(this.paused ? '暂停中' : '运行中', roundCounter, '等待GM指令');
            if (this.paused) {
                await this.waitForResume();
            }
            
            // 构建完整的游戏上下文给GM
            const gameContext = this.getChatContext();
            
            // 询问GM下一步该做什么
            const gmInstruction = await this.callGM(`请判断游戏状态，并指示下一个行动。使用格式：【轮到：AI名】或【秘密指示：AI名|内容】或说"游戏结束"`);
            // GM的回复已经在 callGM 中插入酒馆了
            window.addActionLog('GM', gmInstruction.substring(0, 100));
            
            // 检查游戏是否结束
            if (gmInstruction.includes('游戏结束')) {
                window.updateGameStatus('已结束', roundCounter, '游戏结束');
                window.addActionLog('系统', '游戏结束');
                toastr.success('游戏结束！', 'AI对战');
                this.stopGame();
                break;
            }
            
            // 解析GM指令 -
