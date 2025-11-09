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
    
    // 调用酒馆AI（GM）
    async callGM(prompt) {
        // 尝试多种方式获取生成函数
        const generateRaw = window.generateRaw || 
                          window.Generate?.generateRaw || 
                          getContext()?.generateRaw ||
                          SillyTavern?.getContext?.()?.generateRaw;
        
        if (!generateRaw) {
            console.error('[AI对战] 无法找到生成函数，尝试的路径:', {
                'window.generateRaw': typeof window.generateRaw,
                'window.Generate': typeof window.Generate,
                'getContext()': typeof getContext(),
                'SillyTavern': typeof window.SillyTavern
            });
            throw new Error('找不到SillyTavern生成函数。请确保在聊天界面中启动游戏。');
        }
        
        console.log('[AI对战] 调用GM，提示词:', prompt.substring(0, 100) + '...');
        const response = await generateRaw(prompt, '', false, false);
        console.log('[AI对战] GM回复:', response.substring(0, 100) + '...');
        return response;
    }
    
    // 调用玩家AI（可以包含秘密信息）
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
        window.updateGameStatus('运行中', 0, 'GM准备中');
        const initialPlayers = Object.entries(this.apiConfigs).map(([id, config]) => ({
            name: config.name,
            active: false,
            hasSecret: false,
            lastAction: null
        }));
        window.updatePlayersList(initialPlayers);
        window.addActionLog('系统', '游戏初始化完成');
        
        // 添加游戏规则和玩家名单说明
        const playerList = Object.values(this.apiConfigs).map(c => c.name).join('、');
        this.appendToChat('🎮 系统', `
━━━━━━━━━━━━━━━━━━━━
🎮 游戏开始！

📋 参与玩家：${playerList}

【GM指令格式说明】
请GM严格使用以下格式之一来指挥游戏：

1️⃣ 让某个AI公开行动：
   【轮到：AI-Alpha】

2️⃣ 给某个AI秘密信息：
   【秘密指示：AI-Alpha|你的身份是狼人】

3️⃣ 结束游戏：
   在回复中说"游戏结束"并宣布结果

⚠️ 请务必使用【】符号和冒号，玩家名字必须完全匹配！
━━━━━━━━━━━━━━━━━━━━
`);
        
        toastr.info('游戏开始！扩展将协调6个AI依次行动', 'AI对战');
        
        // 让GM宣布游戏开始
        const opening = await this.callGM(`作为游戏主持人，游戏即将开始。

参与玩家：${playerList}

请根据游戏规则，宣布游戏正式开始，说明当前游戏状态，然后使用格式【轮到：玩家名】来指定第一个行动的玩家，或使用【秘密指示：玩家名|秘密内容】来分配秘密信息（如角色身份）。`);
        this.appendToChat('🎭 游戏主持', opening);
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
            const gmInstruction = await this.callGM(`
【当前游戏状态和完整历史】
${gameContext}

【你的任务】
作为游戏主持人，请根据以上完整的游戏历史判断：
1. 当前游戏是否结束？如果结束，请宣布结果并说"游戏结束"
2. 如果未结束，下一步需要哪个AI行动？请用格式回复：【轮到：AI名字】或【秘密指示：AI名字|秘密内容】

【指令格式】
• 给AI秘密信息：【秘密指示：AI-Alpha|你的身份是狼人，队友是AI-Beta】
• 公开发言：【轮到：AI-Alpha】
`);
            
            this.appendToChat('🎭 游戏主持', gmInstruction);
            window.addActionLog('GM', gmInstruction.substring(0, 100));
            
            // 检查游戏是否结束
            if (gmInstruction.includes('游戏结束')) {
                window.updateGameStatus('已结束', roundCounter, '游戏结束');
                window.addActionLog('系统', '游戏结束');
                toastr.success('游戏结束！', 'AI对战');
                this.stopGame();
                break;
            }
            
            // 解析GM指令
            const secretMatch = gmInstruction.match(/【秘密指示[：:]\s*(.+?)\s*[|｜]\s*(.+?)】/);
            const publicMatch = gmInstruction.match(/【轮到[：:]\s*(.+?)】/);
            
            if (secretMatch) {
                // 秘密指示
                const [, aiName, secretContent] = secretMatch;
                const player = this.findPlayerByName(aiName);
                if (player) {
                    this.addSecret(player.id, secretContent);
                    toastr.info(`已向 ${aiName} 发送秘密信息`, 'AI对战');
                    
                    // 更新UI
                    window.updateGameStatus('运行中', roundCounter, `秘密通知→${aiName}`);
                    window.addActionLog('GM', `向 ${aiName} 发送秘密信息`);
                    this.updatePlayersDisplay();
                } else {
                    // 找不到玩家，提示GM
                    toastr.warning(`找不到玩家"${aiName}"`, 'AI对战');
                    this.appendToChat('🎮 系统', `⚠️ 未找到玩家"${aiName}"，请检查名字是否正确。可用玩家：${playerList}`);
                }
            } else if (publicMatch) {
                // 轮到某个AI公开行动
                const aiName = publicMatch[1].trim();
                const player = this.findPlayerByName(aiName);
                
                if (player) {
                    try {
                        // 更新UI - 轮到这个玩家
                        window.updateGameStatus('运行中', roundCounter, player.name);
                        this.updatePlayersDisplay(player.id);
                        
                        const hasSecret = this.playerSecrets[player.id].length > 0;
                        const response = await this.callPlayerAI(player.id, hasSecret);
                        this.appendToChat(`🎮 ${player.name}`, response);
                        
                        // 记录动作
                        window.addActionLog(player.name, response);
                        this.updatePlayersDisplay();
                    } catch (error) {
                        console.error(`[AI对战] ${player.name} 行动失败:`, error);
                        this.appendToChat(`🎮 ${player.name}`, '(沉默)');
                        toastr.error(`${player.name} 响应失败`, 'AI对战');
                    }
                } else {
                    // 找不到玩家，提示GM
                    toastr.warning(`找不到玩家"${aiName}"`, 'AI对战');
                    this.appendToChat('🎮 系统', `⚠️ 未找到玩家"${aiName}"，请检查名字是否正确。可用玩家：${playerList}`);
                }
            } else {
                // GM回复格式不正确
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

// ==================== 全局变量 ====================
let gameEngine = null;
let roundCounter = 0;
let actionHistory = [];

// ==================== UI辅助函数 ====================
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

// ==================== UI函数 ====================
function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    const settings = extension_settings[extensionName];
    
    // 加载玩家配置
    settings.players.forEach((player, i) => {
        $(`#player${i + 1}_name`).val(player.name);
        $(`#player${i + 1}_api_url`).val(player.apiUrl || '');
        $(`#player${i + 1}_api_key`).val(player.apiKey);
        $(`#player${i + 1}_model`).val(player.model);
        $(`#player${i + 1}_custom_prompt`).val(player.customPrompt || '');
    });
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    
    // 保存玩家配置
    settings.players.forEach((player, i) => {
        player.name = $(`#player${i + 1}_name`).val();
        player.apiUrl = $(`#player${i + 1}_api_url`).val() || '';
        player.apiKey = $(`#player${i + 1}_api_key`).val();
        player.model = $(`#player${i + 1}_model`).val();
        player.customPrompt = $(`#player${i + 1}_custom_prompt`).val() || '';
    });
    
    saveSettingsDebounced();
    toastr.success('设置已保存', 'AI对战');
}

async function startGame() {
    const settings = extension_settings[extensionName];
    
    // 检查API配置
    const missingConfig = settings.players.filter(p => !p.apiKey);
    if (missingConfig.length > 0) {
        toastr.error(`请先配置所有AI的API密钥`, 'AI对战');
        return;
    }
    
    $('#start_game').prop('disabled', true);
    $('#stop_game').prop('disabled', false);
    
    try {
        gameEngine = new UniversalGameEngine(settings);
        
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
    const settingsHtml = await $.get(`${extensionFolderPath}settings.html`);
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
    loadSettings();
    
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
    
    // 绑定事件
    $(document).on('click', '#save_battle_settings', saveSettings);
    $(document).on('click', '#start_game', startGame);
    $(document).on('click', '#continue_game', continueGame);
    $(document).on('click', '#stop_game', stopGame);
    $(document).on('click', '#send-interview', sendInterview);
    
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
