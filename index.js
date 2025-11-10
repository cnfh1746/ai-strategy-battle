// AI策略对战扩展 - 通用版
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, updateMessageBlock } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";
import { WerewolfGameEngine } from "./src/core/werewolf-engine.js";

const extensionName = 'ai-strategy-battle';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 默认设置
const defaultSettings = {
    gameMode: 'universal',  // 'universal' 或 'werewolf'
    gmSystemPrompt: `你是一个游戏主持人（GM），负责协调多个AI玩家进行游戏。

你的职责：
1. 严格根据聊天记录中的游戏规则主持游戏
2. 使用【轮到：玩家名】来指定某个玩家公开行动
3. 使用【秘密指示：玩家名|内容】来给某个玩家发送秘密信息
4. 绝对不要偏离当前游戏主题，不要回答无关问题`,
    gmApiUrl: '',           // ⭐ 新增
    gmApiKey: '',           // ⭐ 新增
    gmModel: 'gpt-4',       // ⭐ 新增
    players: [
        { id: 'p1', name: 'AI-Alpha', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p2', name: 'AI-Beta', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p3', name: 'AI-Gamma', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p4', name: 'AI-Delta', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p5', name: 'AI-Echo', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p6', name: 'AI-Foxtrot', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' }
    ]
};

// ==================== 游戏消息存储 ====================
let gameMessages = {
    public: [],   // 公开消息：{ speaker, content, timestamp, type: 'public' }
    private: []   // 私密消息：{ speaker, content, participants: [], timestamp, type: 'private' }
};

// ==================== 通用游戏引擎 ====================
class UniversalGameEngine {
    constructor(settings) {
        this.settings = settings;
        this.gmSystemPrompt = settings.gmSystemPrompt || defaultSettings.gmSystemPrompt;
        
        // ⭐ 新增：GM API 配置
        this.gmApiUrl = settings.gmApiUrl || '';
        this.gmApiKey = settings.gmApiKey || '';
        this.gmModel = settings.gmModel || 'gpt-4';
        
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
    
    // 调用GM API - 直接调用独立的API
    async callGM(userMessage) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[AI对战][GM] 📤 发送触发消息:', userMessage);

        // 检查 GM API 配置
        if (!this.gmApiUrl || !this.gmApiKey) {
            const error = 'GM API 未配置！请在设置中配置 GM 的 API 地址和密钥。';
            console.error('[AI对战][GM] ❌', error);
            toastr.error(error, 'AI对战');
            throw new Error(error);
        }

        // 构建上下文
        const currentContext = this.getChatContext();
        
        console.log('[AI对战][GM] 🎯 系统提示词:', this.gmSystemPrompt);
        console.log('[AI对战][GM] 🎯 上下文长度:', currentContext.length, '字符');

        // 调用 GM 的独立 API
        try {
            let apiUrl = this.gmApiUrl.replace(/\/$/, '') + '/chat/completions';
            console.log('[AI对战][GM] 🌐 调用 API:', apiUrl, ', 模型:', this.gmModel);
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.gmApiKey}`
                },
                body: JSON.stringify({
                    model: this.gmModel,
                    messages: [
                        {
                            role: 'system',
                            content: this.gmSystemPrompt
                        },
                        {
                            role: 'user',
                            content: `[当前游戏状态]\n${currentContext}\n\n[系统触发]\n${userMessage}`
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[AI对战][GM] ❌ API 错误:', errorText);
                throw new Error(`API错误 ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const gmResponse = data.choices[0].message.content;

            console.log('[AI对战][GM] 📥 GM 回复 (前300字):\n', gmResponse.substring(0, 300));
            console.log('[AI对战][GM] 📥 完整回复长度:', gmResponse.length, '字符');
            console.log('[AI对战][GM] 📥 ========== GM 完整回复 ==========');
            console.log(gmResponse);
            console.log('[AI对战][GM] 📥 ========== 回复结束 ==========');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // ⭐ 把 GM 回复插入到酒馆聊天中
            this.appendToChat('🎮 GM', gmResponse);

            window.updateGmDebugPanel({ 
                lastTrigger: userMessage, 
                contextLength: currentContext.length,
                rawResponse: gmResponse.substring(0, 100) + '...'
            });

            return gmResponse;

        } catch (error) {
            console.error('[AI对战][GM] ❌ 调用失败:', error);
            toastr.error(`GM 调用失败: ${error.message}`, 'AI对战');
            throw error;
        }
    }
    
    // 调用玩家AI（可以包含秘密信息）- 并把回复插入酒馆
    async callPlayerAI(playerId, includeSecret = false) {
        const config = this.apiConfigs[playerId];
        if (!config || !config.key) throw new Error(`玩家 ${playerId} API未配置`);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`[AI对战][玩家] 🎯 调用玩家: ${config.name}`);
        
        // ⭐ 新增：显示"AI思考中"提示
        if (window.addPublicMessage) {
            window.addPublicMessage('⏳ 系统', `${config.name} 正在思考...`);
        }
        window.updateGameStatus(
            this.paused ? '暂停中' : '运行中', 
            roundCounter, 
            `${config.name} 思考中`
        );
        
        // 构建提示词
        let prompt = '';
        
        // 1. 人格设定
        if (config.customPrompt) {
            prompt += `[你的人格设定]\n${config.customPrompt}\n\n`;
            console.log(`[AI对战][玩家] 👤 使用自定义人格 (${config.customPrompt.length}字符)`);
        }
        
        // 2. 公开信息（聊天记录）
        prompt += `[公开信息 - 所有玩家都能看到]\n`;
        const publicInfo = this.getChatContext();
        prompt += publicInfo;
        console.log(`[AI对战][玩家] 📢 公开信息长度: ${publicInfo.length}字符`);
        
        // 3. 秘密信息（只有这个AI知道）
        if (includeSecret && this.playerSecrets[playerId].length > 0) {
            prompt += `\n\n[秘密信息 - 只有你知道，其他玩家看不到]\n`;
            prompt += this.playerSecrets[playerId].join('\n');
            console.log(`[AI对战][玩家] 🔒 秘密信息条数: ${this.playerSecrets[playerId].length}`);
            console.log(`[AI对战][玩家] 🔒 秘密内容:`, this.playerSecrets[playerId]);
        }
        
        prompt += `\n\n请根据以上信息做出你的行动或发言。`;
        
        console.log(`[AI对战][玩家] 📋 完整提示词 (前500字):\n`, prompt.substring(0, 500));
        console.log(`[AI对战][玩家] 📋 提示词总长度: ${prompt.length}字符`);

        // 调用API
        console.log(`[AI对战][玩家] 🌐 调用API: ${config.url}, 模型: ${config.model}`);
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
            console.error(`[AI对战][玩家] ❌ API错误:`, errorText);
            
            // ⭐ 新增：清除"思考中"提示，显示错误
            if (window.addPublicMessage) {
                window.addPublicMessage('❌ 系统', `${config.name} 响应失败，跳过该回合`);
            }
            
            throw new Error(`API错误 ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        console.log(`[AI对战][玩家] 💬 ${config.name} 回复 (前200字):\n`, aiResponse.substring(0, 200));
        console.log(`[AI对战][玩家] 💬 回复总长度: ${aiResponse.length}字符`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
    
    // 添加消息到聊天 - 实时显示版本
    appendToChat(speaker, message) {
        const context = getContext();
        
        // 添加新消息到聊天数组
        const newMessage = {
            name: speaker,
            is_user: false,
            is_system: false,
            mes: message,
            send_date: Date.now(),
            extra: {}
        };
        context.chat.push(newMessage);
        
        const messageIndex = context.chat.length - 1;
        
        // 🔥 关键修复：使用 setTimeout 确保 DOM 元素先被创建
        setTimeout(() => {
            try {
                // 调用 updateMessageBlock 强制更新 DOM 显示
                updateMessageBlock(messageIndex, context.chat[messageIndex]);
                console.log(`[AI对战] ✅ 消息 DOM 已更新，索引: ${messageIndex}`);
            } catch (error) {
                console.warn(`[AI对战] ⚠️ updateMessageBlock 调用失败:`, error);
                // 如果 updateMessageBlock 失败，尝试触发事件
                eventSource.emit(event_types.MESSAGE_RECEIVED, messageIndex);
            }
        }, 0);
        
        // 保存聊天记录
        context.saveChat();
    }
    
    // 游戏主循环
    async startGame() {
        this.running = true;
        this.paused = false;
        roundCounter = 0;
        actionHistory = [];
        
        // 初始化UI状态
        window.updateGameStatus('运行中', 0, 'GM准备中');
        const initialPlayers = Object.entries(this.apiConfigs).map(([id, config]) => ({
            name: config.name,
            active: false,
            hasSecret: false,
            lastAction: null
        }));
        window.updatePlayersList(initialPlayers);
        window.addActionLog('系统', '游戏初始化完成');
        
        // 不插入游戏规则（规则应该在世界书中由GM说明）
        const playerList = Object.values(this.apiConfigs).map(c => c.name).join('、');

        toastr.info('扩展已启动，开始协调AI行动', 'AI对战');
        window.updateGmDebugPanel({ lastTrigger: '游戏开始', contextLength: 0, rawResponse: '', parsedInstruction: '无', secretQueue: '无' });

        // 触发GM继续游戏（GM此时的上下文中应包含由世界书触发的游戏规则）
        const opening = await this.callGM(`扩展已启动，请根据聊天记录中的规则和当前游戏状态，继续主持游戏。`);
        
        window.addActionLog('GM', opening.substring(0, 100));
        
        // 主循环：让GM指挥游戏进程
        while (this.running) {
            roundCounter++;
            window.updateGameStatus(this.paused ? '暂停中' : '运行中', roundCounter, '等待GM指令');
            if (this.paused) {
                await this.waitForResume();
            }
            
            // 询问GM下一步该做什么
            const gmInstruction = await this.callGM(`请根据当前的聊天记录和游戏进展，继续主持游戏，并发出下一步行动指令。`);
            window.addActionLog('GM', gmInstruction.substring(0, 100));
            
            // 检查游戏是否结束
            if (gmInstruction.includes('游戏结束')) {
                window.updateGameStatus('已结束', roundCounter, '游戏结束');
                window.addActionLog('系统', '游戏结束');
                toastr.success('游戏结束！', 'AI对战');
                this.stopGame();
                break;
            }
            
            // 解析GM指令 - 提取所有秘密指示和公开指令
            console.log('[AI对战][解析] 🔍 开始解析GM指令...');
            const secretMatches = [...gmInstruction.matchAll(/【秘密指示[：:]\s*(.+?)\s*[|｜]\s*(.+?)】/g)];
            console.log(`[AI对战][解析] 🔒 找到 ${secretMatches.length} 条秘密指示`);
            const publicMatch = gmInstruction.match(/【轮到[：:]\s*(.+?)】/);
            console.log(`[AI对战][解析] 👉 公开行动指令:`, publicMatch ? publicMatch[1].trim() : '无');
            
            let hasAction = false;
            let parsedInstruction = '无';

            // 处理所有秘密指示
            if (secretMatches.length > 0) {
                hasAction = true;
                for (const match of secretMatches) {
                    const [, aiName, secretContent] = match;
                    const player = this.findPlayerByName(aiName);
                    if (player) {
                        this.addSecret(player.id, secretContent);
                        toastr.info(`已向 ${aiName} 发送秘密信息`, 'AI对战');
                        
                        // 在酒馆中插入一条系统消息（不包含秘密内容）
                        this.appendToChat('🔒 系统', `已向 ${player.name} 发送秘密信息`);
                        
                        // 更新UI
                        parsedInstruction = `秘密→${aiName}`;
                        window.updateGameStatus('运行中', roundCounter, `秘密通知→${aiName}`);
                        window.addActionLog('GM', `向 ${aiName} 发送秘密信息`);
                        this.updatePlayersDisplay();
                    } else {
                        // 找不到玩家，提示GM
                        toastr.warning(`找不到玩家"${aiName}"`, 'AI对战');
                        this.appendToChat('🎮 系统', `⚠️ 未找到玩家"${aiName}"，请检查名字是否正确。可用玩家：${playerList}`);
                    }
                }
            }
            
            // 处理公开行动
            if (publicMatch) {
                hasAction = true;
                const aiName = publicMatch[1].trim();
                const player = this.findPlayerByName(aiName);
                
                if (player) {
                    try {
                        // 更新UI - 轮到这个玩家
                        parsedInstruction = `轮到→${aiName}`;
                        window.updateGameStatus('运行中', roundCounter, player.name);
                        this.updatePlayersDisplay(player.id);
                        
                        const hasSecret = this.playerSecrets[player.id].length > 0;
                        const response = await this.callPlayerAI(player.id, hasSecret);
                        
                        // 记录动作
                        window.addActionLog(player.name, response);
                        this.updatePlayersDisplay();
                    } catch (error) {
                        console.error(`[AI对战] ${player.name} 行动失败:`, error);
                        
                        // ⭐ 关键改进：向聊天中插入明确的失败通知
                        const failureMessage = `${player.name} 因技术原因未能响应（API 请求失败）`;
                        this.appendToChat('🎮 系统', failureMessage);
                        
                        // 记录到动作日志
                        window.addActionLog('系统', `${player.name} 请求失败，视为沉默`);
                        
                        // 显示用户通知
                        toastr.warning(`${player.name} 响应失败，游戏继续`, 'AI对战');
                        
                        // ⭐ 继续游戏流程，不中断
                        this.updatePlayersDisplay();
                    }
                } else {
                    // 找不到玩家，提示GM
                    toastr.warning(`找不到玩家"${aiName}"`, 'AI对战');
                    this.appendToChat('🎮 系统', `⚠️ 未找到玩家"${aiName}"，请检查名字是否正确。可用玩家：${playerList}`);
                }
            }
            
            // 如果GM回复了，但没有有效指令
            if (!hasAction) {
                console.warn('[AI对战] GM回复格式错误:', gmInstruction);
                toastr.warning('GM回复格式不正确，正在提示...', 'AI对战');
                
                // 提示GM使用正确格式（但不暂停，继续下一轮）
                this.appendToChat('🎮 系统', `
⚠️ GM回复格式不正确！

请使用以下格式之一：
1. 【轮到：AI-Alpha】（让AI-Alpha公开行动）
2. 【秘密指示：AI-Alpha|秘密内容】（给AI-Alpha秘密信息）
3. 说"游戏结束"并宣布结果

当前玩家：${playerList}
`);
            }

            // 更新调试面板
            const secretQueue = Object.entries(this.playerSecrets)
                .filter(([, secrets]) => secrets.length > 0)
                .map(([id, secrets]) => `${this.apiConfigs[id].name}(${secrets.length})`)
                .join(', ') || '无';
            window.updateGmDebugPanel({ parsedInstruction, secretQueue });
            
            // 暂停等待用户点击"继续"
            this.paused = true;
            $('#continue_game').prop('disabled', false);
            this.appendToChat('🎮 系统', '⏸️ 点击"继续游戏"进入下一步');
        }
    }
    
    // 查找玩家（支持模糊匹配）
    findPlayerByName(name) {
        const searchName = name.trim();
        
        // 1. 精确匹配
        for (let [id, config] of Object.entries(this.apiConfigs)) {
            if (config.name === searchName) {
                return { id, name: config.name };
            }
        }
        
        // 2. 忽略大小写和空格匹配
        const cleanName = searchName.toLowerCase().replace(/\s+/g, '-');
        for (let [id, config] of Object.entries(this.apiConfigs)) {
            const configName = config.name.toLowerCase().replace(/\s+/g, '-');
            if (configName === cleanName) {
                console.log(`[AI对战] 名字匹配成功: "${searchName}" → "${config.name}"`);
                return { id, name: config.name };
            }
        }
        
        // 3. 模糊匹配（包含关系）
        for (let [id, config] of Object.entries(this.apiConfigs)) {
            if (config.name.includes(searchName) || searchName.includes(config.name)) {
                console.warn(`[AI对战] 使用模糊匹配: "${searchName}" → "${config.name}"`);
                return { id, name: config.name };
            }
        }
        
        console.error(`[AI对战] 找不到玩家: "${searchName}"，可用玩家:`, 
                     Object.values(this.apiConfigs).map(c => c.name));
        return null;
    }
    
    // 等待继续
    waitForResume() {
        return new Promise(resolve => {
            this.resumeCallback = resolve;
        });
    }
    
    // 继续游戏
    resume() {
        if (this.paused && this.resumeCallback) {
            this.paused = false;
            $('#continue_game').prop('disabled', true);
            this.resumeCallback();
        }
    }
    
    // 更新玩家显示
    updatePlayersDisplay(activePlayerId = null) {
        const players = Object.entries(this.apiConfigs).map(([id, config]) => ({
            name: config.name,
            active: id === activePlayerId,
            hasSecret: this.playerSecrets[id].length > 0,
            lastAction: actionHistory.find(a => a.actor === config.name)?.action.substring(0, 30) || null
        }));
        window.updatePlayersList(players);
    }
    
    // 停止游戏
    stopGame() {
        this.running = false;
        this.paused = false;
        this.clearAllSecrets();
        $('#start_game').prop('disabled', false);
        $('#continue_game').prop('disabled', true);
        $('#stop_game').prop('disabled', true);
        
        // 重置UI
        window.updateGameStatus('未开始', '-', '-');
        window.updatePlayersList([]);
    }
}

// ==================== 游戏消息处理函数 ====================
// 添加公开消息
window.addPublicMessage = function(speaker, content) {
    const msg = {
        speaker: speaker,
        content: content,
        timestamp: Date.now(),
        type: 'public'
    };
    
    gameMessages.public.push(msg);
    displayPublicMessage(msg);
    
    console.log('[游戏面板] 添加公开消息:', speaker, content.substring(0, 50));
}

// 添加私密消息
window.addPrivateMessage = function(participants, speaker, content) {
    const msg = {
        speaker: speaker,
        content: content,
        participants: participants,
        timestamp: Date.now(),
        type: 'private'
    };
    
    gameMessages.private.push(msg);
    displayPrivateMessage(msg);
    
    console.log('[游戏面板] 添加私密消息:', speaker, '→', participants.join(','));
}

// 显示公开消息
function displayPublicMessage(msg) {
    const container = document.getElementById('publicMessages');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-item ${msg.speaker === 'GM' || msg.speaker === '🎮 GM' ? 'gm' : 'player'}`;
    
    const time = new Date(msg.timestamp).toLocaleTimeString();
    
    messageDiv.innerHTML = `
        <div class="message-speaker">${msg.speaker}:</div>
        <div class="message-content">${msg.content}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// 显示私密消息
function displayPrivateMessage(msg) {
    const container = document.getElementById('privateMessages');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-item private';
    
    const time = new Date(msg.timestamp).toLocaleTimeString();
    
    messageDiv.innerHTML = `
        <div class="message-speaker">${msg.speaker}:</div>
        <div class="message-content">${msg.content}</div>
        <div class="private-participants">👥 ${msg.participants.join(', ')}</div>
        <div class="message-timestamp">${time}</div>
    `;
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
}

// 清空游戏历史
function clearGameHistory() {
    gameMessages = { public: [], private: [] };
    
    const publicContainer = document.getElementById('publicMessages');
    const privateContainer = document.getElementById('privateMessages');
    
    if (publicContainer) publicContainer.innerHTML = '';
    if (privateContainer) privateContainer.innerHTML = '';
    
    console.log('[游戏面板] 历史已清空');
}

// 导出完整游戏历史到酒馆
function exportGameHistoryToTavern() {
    console.log('[导出] 开始导出游戏历史到酒馆...');
    
    const allMessages = [
        ...gameMessages.public.map(m => ({...m, area: 'public'})),
        ...gameMessages.private.map(m => ({...m, area: 'private'}))
    ].sort((a, b) => a.timestamp - b.timestamp);
    
    let exportText = '\n\n========== 🎮 AI大乱斗对局记录 ==========\n\n';
    
    allMessages.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        
        if (msg.area === 'public') {
            exportText += `[公开 ${time}] ${msg.speaker}: ${msg.content}\n\n`;
        } else {
            const participants = msg.participants.join(', ');
            exportText += `[私密 ${time}] 👥 ${participants}\n`;
            exportText += `${msg.speaker}: ${msg.content}\n\n`;
        }
    });
    
    exportText += '========== 对局结束 ==========\n';
    
    const context = SillyTavern.getContext();
    context.chat.push({
        name: 'System',
        mes: exportText,
        is_system: true,
        is_user: false,
        send_date: Date.now()
    });
    
    context.saveChat();
    context.reloadCurrentChat();
    
    toastr.success('游戏历史已导出到酒馆聊天！');
    console.log('[导出] 完成！共导出', allMessages.length, '条消息');
}

// ==================== 全局变量 ====================
let gameEngine = null;
let roundCounter = 0;
let actionHistory = [];

// ==================== UI辅助函数 ====================
// 更新GM调试面板
window.updateGmDebugPanel = function(data) {
    if (data.lastTrigger) $('#gm-debug-trigger').text(data.lastTrigger);
    if (data.contextLength) $('#gm-debug-context').text(data.contextLength + ' 字符');
    if (data.rawResponse) $('#gm-debug-response').text(data.rawResponse);
    if (data.parsedInstruction) $('#gm-debug-instruction').text(data.parsedInstruction);
    if (data.secretQueue) $('#gm-debug-secrets').text(data.secretQueue);
};

// 更新游戏状态显示
window.updateGameStatus = function(status, round, currentPlayer) {
    $('#status-text').text(status).css('color', 
        status === '运行中' ? '#4CAF50' : 
        status === '暂停中' ? '#FF9800' : '#888'
    );
    $('#round-number').text(round || '-');
    $('#current-player').text(currentPlayer || '-');
};

// 更新玩家列表
window.updatePlayersList = function(players) {
    if (!players || players.length === 0) {
        $('#players-list').html('<div style="color: #888; text-align: center; padding: 10px;">游戏未开始</div>');
        return;
    }
    
    const playersHtml = players.map(p => `
        <div style="padding: 5px; margin-bottom: 5px; background: var(--black50a); border-radius: 4px; border-left: 3px solid ${p.active ? '#4CAF50' : '#555'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; color: ${p.active ? '#4CAF50' : '#ccc'};">${p.name}</span>
                <span style="font-size: 10px; color: ${p.hasSecret ? '#FF9800' : '#666'};">
                    ${p.hasSecret ? '🔒 有秘密' : '💬 公开'}
                </span>
            </div>
            ${p.lastAction ? `<div style="font-size: 10px; color: #888; margin-top: 3px;">最后: ${p.lastAction}</div>` : ''}
        </div>
    `).join('');
    
    $('#players-list').html(playersHtml);
};

// 添加动作记录
window.addActionLog = function(actor, action) {
    const timestamp = new Date().toLocaleTimeString();
    const logHtml = `
        <div style="padding: 5px; margin-bottom: 5px; background: var(--black50a); border-radius: 4px; border-left: 2px solid #FF9800;">
            <div style="color: #FF9800; font-weight: bold; font-size: 10px;">[${timestamp}] ${actor}</div>
            <div style="color: #ccc; margin-top: 2px;">${action.substring(0, 80)}${action.length > 80 ? '...' : ''}</div>
        </div>
    `;
    
    actionHistory.unshift({ actor, action, timestamp });
    if (actionHistory.length > 10) actionHistory.pop();
    
    $('#recent-actions').prepend(logHtml);
    
    // 只保留最近10条
    $('#recent-actions > div').slice(10).remove();
};

window.addPromptLog = function(aiName, prompt, response) {
    const timestamp = new Date().toLocaleTimeString();
    const logHtml = `
        <div style="margin-bottom: 10px; border-left: 3px solid var(--SmartThemeQuoteColor); padding-left: 8px;">
            <div style="color: var(--SmartThemeQuoteColor); font-weight: bold;">
                [${timestamp}] ${aiName}
            </div>
            <details style="margin-top: 5px;">
                <summary style="cursor: pointer; color: #888;">📋 查看完整提示词</summary>
                <pre style="white-space: pre-wrap; font-size: 11px; color: #aaa; margin-top: 5px;">${prompt}</pre>
            </details>
            <div style="color: #6c6; margin-top: 5px;">→ ${response.substring(0, 150)}${response.length > 150 ? '...' : ''}</div>
        </div>
    `;
    $('#prompt-logs').prepend(logHtml);
};

// ==================== UI函数 (重构版) ====================

// 动态生成玩家配置UI
function initPlayerConfigs() {
    const container = $('#players_config_container');
    const template = $('#player_config_template').html();
    container.empty();

    for (let i = 1; i <= 6; i++) {
        const playerHtml = template.replace(/{PLAYER_NUM}/g, i);
        container.append(playerHtml);
    }
    console.log('[AI对战] 玩家配置UI已生成');
}

// 根据游戏模式显示/隐藏相关设置
function toggleGameModeSettings() {
    const gameMode = $('#game_mode').val();
    if (gameMode === 'werewolf') {
        $('#gm_system_prompt_section').hide();
        $('#commentator_section').show();
    } else {
        $('#gm_system_prompt_section').show();
        $('#commentator_section').hide();
    }
    console.log(`[AI对战] 切换到 ${gameMode} 模式`);
}

function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = { ...defaultSettings };
    }
    const settings = extension_settings[extensionName];
    
    // 加载游戏模式
    $('#game_mode').val(settings.gameMode || 'universal');
    
    // 加载 GM 系统提示词
    $('#gm_system_prompt').val(settings.gmSystemPrompt || defaultSettings.gmSystemPrompt);

    // 加载 GM API 配置
    $('#gm_api_url').val(settings.gmApiUrl || '');
    $('#gm_api_key').val(settings.gmApiKey || '');
    // 模型需要先拉取，这里只设置初始值
    $('#gm_model').empty().append(`<option value="${settings.gmModel || 'gpt-4'}">${settings.gmModel || 'gpt-4'}</option>`);

    // 加载解说员配置
    $('#commentatorEnabled').prop('checked', settings.commentatorEnabled || false);
    $('#commentatorStyle').val(settings.commentatorStyle || '');

    // 加载玩家配置
    settings.players.forEach((player, i) => {
        const playerNum = i + 1;
        $(`#player${playerNum}_name`).val(player.name);
        $(`#player${playerNum}_api_url`).val(player.apiUrl || '');
        $(`#player${playerNum}_api_key`).val(player.apiKey);
        $(`#player${playerNum}_model`).empty().append(`<option value="${player.model}">${player.model}</option>`);
        $(`#player${playerNum}_custom_prompt`).val(player.customPrompt || '');
    });

    // 应用模式切换的显示逻辑
    toggleGameModeSettings();
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    
    settings.gameMode = $('#game_mode').val();
    settings.gmSystemPrompt = $('#gm_system_prompt').val();
    settings.gmApiUrl = $('#gm_api_url').val();
    settings.gmApiKey = $('#gm_api_key').val();
    settings.gmModel = $('#gm_model').val();
    settings.commentatorEnabled = $('#commentatorEnabled').prop('checked');
    settings.commentatorStyle = $('#commentatorStyle').val().trim();

    settings.players = [];
    for (let i = 1; i <= 6; i++) {
        settings.players.push({
            id: `p${i}`,
            name: $(`#player${i}_name`).val(),
            apiUrl: $(`#player${i}_api_url`).val() || '',
            apiKey: $(`#player${i}_api_key`).val(),
            model: $(`#player${i}_model`).val(),
            customPrompt: $(`#player${i}_custom_prompt`).val() || ''
        });
    }
    
    saveSettingsDebounced();
    toastr.success('设置已保存', 'AI对战');
}

// 拉取模型列表通用函数
async function fetchModels(apiUrl, apiKey, selectElement, buttonElement) {
    if (!apiUrl || !apiKey) {
        toastr.warning('请先填写对应的 API 地址和密钥', 'AI对战');
        return;
    }
    
    const originalButtonText = buttonElement.text();
    buttonElement.prop('disabled', true).text('⏳');
    
    try {
        const modelsUrl = apiUrl.replace(/\/$/, '') + '/models';
        const response = await fetch(modelsUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        if (!response.ok) throw new Error(`API错误 ${response.status}`);
        
        const data = await response.json();
        const models = data.data || data.models || [];
        
        if (models.length === 0) {
            toastr.warning('未找到可用模型', 'AI对战');
            return;
        }
        
        const currentValue = selectElement.val();
        selectElement.empty();
        
        models.forEach(model => {
            const modelId = model.id || model;
            selectElement.append(`<option value="${modelId}">${modelId}</option>`);
        });
        
        if (models.find(m => (m.id || m) === currentValue)) {
            selectElement.val(currentValue);
        }
        
        toastr.success(`已加载 ${models.length} 个模型`, 'AI对战');
        
    } catch (error) {
        console.error('[AI对战] 拉取模型失败:', error);
        toastr.error(`拉取模型失败: ${error.message}`, 'AI对战');
    } finally {
        buttonElement.prop('disabled', false).text(originalButtonText);
    }
}

// 测试API连接通用函数
async function testApiConnection(apiUrl, apiKey, model, buttonElement) {
    if (!apiUrl || !apiKey || !model) {
        toastr.warning('请先填写 API 地址、密钥并选择一个模型', 'AI对战');
        return;
    }

    const originalButtonText = buttonElement.text();
    buttonElement.prop('disabled', true).text('⏳');

    try {
        const testUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
        const response = await fetch(testUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Test' }],
                max_tokens: 1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API返回错误 ${response.status}: ${errorText.substring(0, 100)}`);
        }
        
        toastr.success('API 连接成功！', 'AI对战');

    } catch (error) {
        console.error('[AI对战] API测试失败:', error);
        toastr.error(`API 测试失败: ${error.message}`, 'AI对战');
    } finally {
        buttonElement.prop('disabled', false).text(originalButtonText);
    }
}

async function startGame() {
    const settings = extension_settings[extensionName];

    // 清空历史记录并禁用导出按钮
    clearGameHistory();
    $('#export_history').prop('disabled', true);
    
    // ⭐ 新增：强制清空占位符内容，确保容器干净
    const publicContainer = document.getElementById('publicMessages');
    const privateContainer = document.getElementById('privateMessages');
    if (publicContainer) publicContainer.innerHTML = '';
    if (privateContainer) privateContainer.innerHTML = '';
    
    // ⭐ 新增：添加"等待AI启动"的提示
    if (window.addPublicMessage) {
        window.addPublicMessage('🎮 系统', '⏳ 游戏初始化中，请稍候...');
    }
    
    // 检查API配置
    const missingConfig = settings.players.filter(p => !p.apiKey);
    if (missingConfig.length > 0) {
        toastr.error(`请先配置所有AI的API密钥`, 'AI对战');
        return;
    }
    
    $('#start_game').prop('disabled', true);
    $('#stop_game').prop('disabled', false);
    
    try {
        // 根据游戏模式选择引擎
        const gameMode = settings.gameMode || 'universal';
        
        if (gameMode === 'werewolf') {
            // 狼人杀模式
            console.log('[AI对战] 🐺 启动狼人杀模式');
            toastr.info('启动狼人杀模式...', 'AI对战');
            
            gameEngine = new WerewolfGameEngine(
                settings,
                (speaker, message) => {
                    const context = getContext();
                    const newMessage = {
                        name: speaker,
                        is_user: false,
                        is_system: false,
                        mes: message,
                        send_date: Date.now(),
                        extra: {}
                    };
                    context.chat.push(newMessage);
                    const messageIndex = context.chat.length - 1;
                    setTimeout(() => {
                        try {
                            updateMessageBlock(messageIndex, context.chat[messageIndex]);
                        } catch (error) {
                            eventSource.emit(event_types.MESSAGE_RECEIVED, messageIndex);
                        }
                    }, 0);
                    context.saveChat();
                },
                async (playerId, prompt) => {
                    const config = settings.players.find(p => p.id === playerId);
                    if (!config || !config.apiKey) {
                        throw new Error(`玩家 ${playerId} API未配置`);
                    }

                    // ⭐ 新增：显示"AI思考中"提示
                    if (window.addPublicMessage) {
                        window.addPublicMessage('⏳ 系统', `${config.name} 正在思考...`);
                    }
                    
                    const apiUrl = (config.apiUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
                    
                    try {
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${config.apiKey}`
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
                        return data.choices[0].message.content;

                    } catch (error) {
                        // ⭐ 新增：在API调用失败时显示错误信息
                        if (window.addPublicMessage) {
                            window.addPublicMessage('❌ 系统', `${config.name} 响应失败`);
                        }
                        // 重新抛出错误，让上层逻辑知道
                        throw error;
                    }
                }
            );
        } else {
            // 通用模式
            console.log('[AI对战] 🎮 启动通用模式');
            gameEngine = new UniversalGameEngine(settings);
        }
        
        // 更新采访目标选择器
        $('#interview-target').empty().append('<option value="">选择要采访的AI...</option>');
        settings.players.forEach(p => {
            $('#interview-target').append(`<option value="${p.id}">${p.name}</option>`);
        });
        
        await gameEngine.startGame();
    } catch (error) {
        console.error('[AI对战] 启动失败:', error);
        toastr.error(`启动失败: ${error.message}`, 'AI对战');
        $('#start_game').prop('disabled', false);
        $('#stop_game').prop('disabled', true);
    }
}

function continueGame() {
    if (gameEngine) {
        gameEngine.resume();
    }
}

function stopGame() {
    if (gameEngine) {
        gameEngine.stopGame();
    }
    gameEngine = null;
    toastr.info('游戏已停止', 'AI对战');
}

async function sendInterview() {
    const targetId = $('#interview-target').val();
    const question = $('#interview-question').val().trim();
    
    if (!targetId || !question) {
        toastr.warning('请选择AI并输入问题', 'AI对战');
        return;
    }
    
    if (!gameEngine || !gameEngine.running) {
        toastr.error('游戏未开始', 'AI对战');
        return;
    }
    
    const config = gameEngine.apiConfigs[targetId];
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
        
        // 直接调用API，不进入聊天记录
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
        
        $('#interview-answer').text(answer);
        $('#interview-response').slideDown();
        
        window.addPromptLog(`[采访] ${config.name}`, interviewPrompt, answer);
        
    } catch (error) {
        toastr.error(`采访失败: ${error.message}`, 'AI对战');
    } finally {
        $('#send-interview').prop('disabled', false).text('💬 发送采访');
    }
}

// ==================== 初始化 ====================
jQuery(async () => {
    // 加载设置页面
    const settingsHtml = await $.get(`${extensionFolderPath}ui.html`);
    const panel = $(`
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎮 AI策略对战 - 通用版</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">${settingsHtml}</div>
        </div>
    `);
    $('#extensions_settings2').append(panel);

    // 初始化UI和事件
    initPlayerConfigs();
    loadSettings();
    
    // 绑定事件
    $(document).on('change', '#game_mode', toggleGameModeSettings);
    $(document).on('click', '#save_battle_settings', saveSettings);
    
    // 绑定GM和玩家的按钮事件
    $(document).on('click', '#fetch_gm_models', function() {
        fetchModels($('#gm_api_url').val(), $('#gm_api_key').val(), $('#gm_model'), $(this));
    });

    for (let i = 1; i <= 6; i++) {
        $(document).on('click', `#fetch_player${i}_models`, function() {
            fetchModels($(`#player${i}_api_url`).val(), $(`#player${i}_api_key`).val(), $(`#player${i}_model`), $(this));
        });
        $(document).on('click', `#test_player${i}_api`, function() {
            testApiConnection($(`#player${i}_api_url`).val(), $(`#player${i}_api_key`).val(), $(`#player${i}_model`).val(), $(this));
        });
    }
    
    // 创建浮动控制面板
    const floatingPanel = $(`
        <div id="ai-battle-panel" class="compact-mode" style="position: fixed; right: 20px; top: 100px; width: 320px; max-height: 85vh; overflow-y: auto; background: var(--SmartThemeBlurTintColor); border: 2px solid var(--SmartThemeBorderColor); border-radius: 10px; padding: 15px; z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: none; font-size: 12px; resize: both; min-width: 280px; min-height: 400px;">
            <div id="panel-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; cursor: move; user-select: none;">
                <h3 style="margin: 0; font-size: 15px;">🎮 AI对战控制台</h3>
                <div style="display: flex; gap: 5px;">
                    <button id="toggle-size" class="menu_button" style="padding: 5px 10px;" title="切换大小面板">⛶</button>
                    <button id="toggle-panel" class="menu_button" style="padding: 5px 10px;" title="折叠/展开">−</button>
                </div>
            </div>
            
            <!-- 游戏状态区 -->
            <div class="status-section" style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 8px; border-left: 3px solid #4CAF50;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #4CAF50;">📊 游戏状态</h4>
                <div id="game-status" style="font-size: 11px; line-height: 1.6;">
                    <div>状态: <span id="status-text" style="color: #888;">未开始</span></div>
                    <div>回合: <span id="round-number">-</span></div>
                    <div>当前行动: <span id="current-player">-</span></div>
                </div>
            </div>
            
            <!-- 游戏消息面板 -->
            <div class="game-messages-section" style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #FF5722;">📺 实时游戏流程</h4>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <!-- 左栏：公开消息 -->
                    <div>
                        <div style="font-size: 11px; color: #4CAF50; margin-bottom: 5px; font-weight: bold;">📢 公开消息</div>
                        <div id="publicMessages" style="height: 200px; overflow-y: auto; background: var(--black30a); border: 1px solid #4CAF50; border-radius: 5px; padding: 8px; font-size: 11px;">
                            <div style="color: #888; text-align: center; padding: 20px;">等待游戏开始...</div>
                        </div>
                    </div>
                    
                    <!-- 右栏：私密消息 -->
                    <div>
                        <div style="font-size: 11px; color: #FF9800; margin-bottom: 5px; font-weight: bold;">🔒 私密消息</div>
                        <div id="privateMessages" style="height: 200px; overflow-y: auto; background: var(--black30a); border: 1px solid #FF9800; border-radius: 5px; padding: 8px; font-size: 11px;">
                            <div style="color: #888; text-align: center; padding: 20px;">等待私密信息...</div>
                        </div>
                    </div>
                </div>
                
                <!-- 导出按钮 -->
                <button id="export_history" class="menu_button" style="width: 100%; margin-top: 10px; font-size: 12px;" disabled>💾 导出完整历史到酒馆</button>
            </div>
            
            <!-- 玩家状态列表 -->
            <div class="players-section" style="margin-bottom: 15px;">
                <h4 style="cursor: pointer; margin: 0 0 10px 0; font-size: 13px; color: #2196F3;" onclick="$('#players-list').toggle()">
                    👥 玩家状态 <span style="font-size: 10px; color: #888;">(点击展开/收起)</span>
                </h4>
                <div id="players-list" style="font-size: 11px; background: var(--black30a); padding: 8px; border-radius: 5px; max-height: 150px; overflow-y: auto;">
                    <div style="color: #888; text-align: center; padding: 10px;">游戏未开始</div>
                </div>
            </div>
            
            <!-- 最近动作记录 -->
            <div class="actions-section" style="margin-bottom: 15px;">
                <h4 style="cursor: pointer; margin: 0 0 10px 0; font-size: 13px; color: #FF9800;" onclick="$('#recent-actions').toggle()">
                    📜 最近动作 <span style="font-size: 10px; color: #888;">(点击展开/收起)</span>
                </h4>
                <div id="recent-actions" style="font-size: 10px; background: var(--black30a); padding: 8px; border-radius: 5px; max-height: 120px; overflow-y: auto;">
                    <div style="color: #888; text-align: center; padding: 10px;">暂无记录</div>
                </div>
            </div>

            <!-- GM调试区 -->
            <div class="gm-debug-section" style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 8px; border-left: 3px solid #9C27B0;">
                <h4 style="cursor: pointer; margin: 0 0 8px 0; font-size: 13px; color: #9C27B0;" onclick="$(this).next().toggle()">🔬 GM调试信息</h4>
                <div id="gm-debug-info" style="font-size: 11px; line-height: 1.6; display: none;">
                    <div>触发消息: <span id="gm-debug-trigger">-</span></div>
                    <div>上下文长度: <span id="gm-debug-context">-</span></div>
                    <div>GM原始回复: <span id="gm-debug-response">-</span></div>
                    <div>解析指令: <span id="gm-debug-instruction">-</span></div>
                    <div>秘密队列: <span id="gm-debug-secrets">-</span></div>
                </div>
            </div>
            
            <!-- 控制按钮 -->
            <div class="control-section" style="margin-bottom: 15px; border-top: 2px solid var(--SmartThemeBorderColor); padding-top: 15px;">
                <button id="start_game" class="menu_button" style="width: 100%; margin-bottom: 5px;">▶️ 开始游戏</button>
                <button id="continue_game" class="menu_button" style="width: 100%; margin-bottom: 5px;" disabled>⏭️ 继续游戏</button>
                <button id="stop_game" class="menu_button" style="width: 100%;" disabled>⏹️ 停止游戏</button>
            </div>
            
            <!-- 提示词记录 -->
            <div class="prompt-display-section" style="margin-bottom: 15px; border-top: 2px solid var(--SmartThemeBorderColor); padding-top: 15px;">
                <h4 style="cursor: pointer; margin: 0 0 10px 0; font-size: 13px;" onclick="$('#prompt-logs').toggle()">📝 提示词记录 ▼</h4>
                <div id="prompt-logs" style="max-height: 150px; overflow-y: auto; background: var(--black50a); padding: 8px; border-radius: 5px; font-size: 11px;"></div>
            </div>
            
            <!-- 采访AI -->
            <div class="interview-section" style="border-top: 2px solid var(--SmartThemeBorderColor); padding-top: 15px;">
                <h4 style="margin: 0 0 10px 0; font-size: 13px;">🎤 采访AI</h4>
                <select id="interview-target" class="text_pole" style="width: 100%; margin-bottom: 10px; font-size: 12px;">
                    <option value="">选择AI...</option>
                </select>
                <textarea id="interview-question" class="text_pole" placeholder="输入问题（AI会根据秘密信息回答）" style="width: 100%; height: 60px; margin-bottom: 10px; resize: vertical; font-size: 12px;"></textarea>
                <button id="send-interview" class="menu_button" style="width: 100%; font-size: 12px;">💬 发送采访</button>
                <div id="interview-response" style="margin-top: 10px; padding: 10px; background: var(--black30a); border-radius: 5px; max-height: 150px; overflow-y: auto; display: none; font-size: 12px;">
                    <strong>回答：</strong>
                    <div id="interview-answer"></div>
                </div>
            </div>
        </div>
    `);
    $('body').append(floatingPanel);
    
    // 显示面板
    setTimeout(() => $('#ai-battle-panel').fadeIn(), 500);
    
    // 绑定浮动面板事件
    $(document).on('click', '#start_game', startGame);
    $(document).on('click', '#continue_game', continueGame);
    $(document).on('click', '#stop_game', stopGame);
    $(document).on('click', '#send-interview', sendInterview);
    $(document).on('click', '#export_history', exportGameHistoryToTavern);
    
    // 折叠/展开面板
    $(document).on('click', '#toggle-panel', function() {
        const content = $('#ai-battle-panel > div:not(#panel-header)');
        content.toggle();
        $(this).text(content.is(':visible') ? '−' : '+');
    });
    
    // 切换大小模式
    $(document).on('click', '#toggle-size', function() {
        const panel = $('#ai-battle-panel');
        
        if (panel.hasClass('compact-mode')) {
            // 切换到大面板模式
            panel.removeClass('compact-mode').addClass('expanded-mode');
            panel.css({
                'width': '80vw',
                'height': '70vh',
                'max-width': '1200px',
                'max-height': '800px',
                'left': '50%',
                'top': '50%',
                'right': 'auto',
                'transform': 'translate(-50%, -50%)',
                'overflow': 'hidden'
            });
            
            // 调整内部区域高度
            $('#players-list').css('max-height', '250px');
            $('#recent-actions').css('max-height', '200px');
            $('#prompt-logs').css('max-height', '250px');
            
            $(this).attr('title', '切换到小面板');
            toastr.info('已切换到大面板模式', 'AI对战');
        } else {
            // 切换到小面板模式
            panel.removeClass('expanded-mode').addClass('compact-mode');
            panel.css({
                'width': '260px',
                'height': 'auto',
                'max-width': 'none',
                'max-height': '85vh',
                'left': 'auto',
                'top': '100px',
                'right': '20px',
                'transform': 'none',
                'overflow-y': 'auto'
            });
            
            // 恢复内部区域高度
            $('#players-list').css('max-height', '150px');
            $('#recent-actions').css('max-height', '120px');
            $('#prompt-logs').css('max-height', '150px');
            
            $(this).attr('title', '切换到大面板');
            toastr.info('已切换到小面板模式', 'AI对战');
        }
    });
    
    // 面板拖动功能
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    
    $(document).on('mousedown', '#panel-header', function(e) {
        // 如果点击的是按钮，不触发拖动
        if ($(e.target).is('button') || $(e.target).closest('button').length) {
            return;
        }
        
        isDragging = true;
        const panel = $('#ai-battle-panel');
        const panelOffset = panel.offset();
        
        dragOffsetX = e.pageX - panelOffset.left;
        dragOffsetY = e.pageY - panelOffset.top;
        
        panel.css('cursor', 'grabbing');
        e.preventDefault();
    });
    
    $(document).on('mousemove', function(e) {
        if (isDragging) {
            const panel = $('#ai-battle-panel');
            
            let newLeft = e.pageX - dragOffsetX;
            let newTop = e.pageY - dragOffsetY;
            
            // 限制在窗口范围内
            const maxLeft = $(window).width() - panel.outerWidth();
            const maxTop = $(window).height() - panel.outerHeight();
            
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            
            panel.css({
                'left': newLeft + 'px',
                'top': newTop + 'px',
                'right': 'auto',
                'transform': 'none'
            });
        }
    });
    
    $(document).on('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            $('#ai-battle-panel').css('cursor', '');
            $('#panel-header').css('cursor', 'move');
        }
    });
    
    console.log('[AI策略对战] 扩展已加载 - 通用版');
});
