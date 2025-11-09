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
        this.resumeCallback = null;

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
        this.appendToChat(context.name1 || '🎮 系统', userMessage);
        await new Promise(resolve => setTimeout(resolve, 100));
        const generateRaw = window.generateRaw || window.Generate?.generateRaw || getContext()?.generateRaw;
        if (!generateRaw) throw new Error('找不到SillyTavern生成函数');
        console.log('[AI对战] 触发GM回复...');
        const response = await generateRaw('', '', false, false);
        console.log('[AI对战] GM回复:', response.substring(0, 100) + '...');
        return response;
    }

    // 调用玩家AI
    async callPlayerAI(playerId, includeSecret = false) {
        const config = this.apiConfigs[playerId];
        if (!config || !config.key) throw new Error(`玩家 ${playerId} API未配置`);
        let prompt = '';
        if (config.customPrompt) prompt += `[你的人格设定]\n${config.customPrompt}\n\n`;
        prompt += `[公开信息 - 所有玩家都能看到]\n${this.getChatContext()}`;
        if (includeSecret && this.playerSecrets[playerId].length > 0) {
            prompt += `\n\n[秘密信息 - 只有你知道，其他玩家看不到]\n${this.playerSecrets[playerId].join('\n')}`;
        }
        prompt += `\n\n请根据以上信息做出你的行动或发言。`;
        const apiUrl = config.url.replace(/\/$/, '') + '/chat/completions';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
            body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 1500 })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API错误 ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        if (window.addPromptLog) window.addPromptLog(config.name, prompt, aiResponse);
        this.appendToChat(`🎮 ${config.name}`, aiResponse);
        return aiResponse;
    }

    addSecret(playerId, secretInfo) {
        if (this.playerSecrets[playerId] && !this.playerSecrets[playerId].includes(secretInfo)) {
            this.playerSecrets[playerId].push(secretInfo);
            console.log(`[AI对战] 给 ${this.apiConfigs[playerId].name} 添加秘密信息:`, secretInfo);
        }
    }

    clearAllSecrets() {
        Object.keys(this.playerSecrets).forEach(id => { this.playerSecrets[id] = []; });
    }

    getChatContext() {
        const context = getContext();
        const chat = context.chat || [];
        const recentMessages = chat.slice(-50);
        return recentMessages.map(msg => {
            const speaker = msg.is_user ? (context.name1 || '用户') : (msg.name || 'GM');
            let content = msg.mes.replace(/【秘密指示[：:].+?】/g, '[已执行秘密指示]');
            return `${speaker}: ${content}`;
        }).join('\n\n');
    }

    scanHistoryForSecrets() {
        const context = getContext();
        const chat = context.chat || [];
        console.log('[AI对战] 开始扫描历史消息，查找秘密指示...');
        let foundCount = 0;
        const recentMessages = chat.slice(-100);
        for (const msg of recentMessages) {
            const secretMatches = [...msg.mes.matchAll(/【秘密指示[：:]\s*(.+?)\s*[|｜]\s*(.+?)】/g)];
            for (const match of secretMatches) {
                const [, aiName, secretContent] = match;
                const player = this.findPlayerByName(aiName);
                if (player) {
                    this.addSecret(player.id, secretContent);
                    foundCount++;
                }
            }
        }
        if (foundCount > 0) {
            toastr.success(`已从历史消息中恢复 ${foundCount} 条秘密指示`, 'AI对战');
            window.addActionLog('系统', `从历史恢复了${foundCount}条秘密指示`);
            this.updatePlayersDisplay();
        }
    }

    appendToChat(speaker, message) {
        const context = getContext();
        context.chat.push({ name: speaker, is_user: false, is_system: false, mes: message, send_date: Date.now() });
        context.saveChat();
        eventSource.emit(event_types.MESSAGE_RECEIVED, context.chat.length - 1);
    }

    async startGame() {
        this.running = true;
        this.paused = false;
        roundCounter = 0;
        actionHistory = [];
        this.clearAllSecrets();

        window.updateGameStatus('运行中', 0, '扫描历史消息');
        this.updatePlayersDisplay();
        window.addActionLog('系统', '游戏初始化完成');

        const playerList = Object.values(this.apiConfigs).map(c => c.name).join('、');
        toastr.info('扩展已启动，正在扫描历史消息...', 'AI对战');
        
        this.scanHistoryForSecrets();

        const opening = await this.callGM(`🎮 扩展已启动，请继续主持游戏。\n\n玩家名单：${playerList}\n\n（提醒：使用【轮到：玩家名】或【秘密指示：玩家名|内容】来控制流程）`);
        window.addActionLog('GM', opening.substring(0, 100));

        this.gameLoop();
    }

    async gameLoop() {
        while (this.running) {
            roundCounter++;
            window.updateGameStatus(this.paused ? '暂停中' : '运行中', roundCounter, '等待GM指令');
            if (this.paused) {
                await this.waitForResume();
            }
            if (!this.running) break;

            const gmInstruction = await this.callGM(`请判断游戏状态，并指示下一个行动。使用格式：【轮到：AI名】或【秘密指示：AI名|内容】或说"游戏结束"`);
            window.addActionLog('GM', gmInstruction.substring(0, 100));

            if (gmInstruction.includes('游戏结束')) {
                this.stopGame('游戏结束');
                break;
            }

            const secretMatches = [...gmInstruction.matchAll(/【秘密指示[：:]\s*(.+?)\s*[|｜]\s*(.+?)】/g)];
            const publicMatch = gmInstruction.match(/【轮到[：:]\s*(.+?)】/);

            let actionTaken = false;
            if (secretMatches.length > 0) {
                actionTaken = true;
                for (const match of secretMatches) {
                    const [, aiName, secretContent] = match;
                    const player = this.findPlayerByName(aiName);
                    if (player) {
                        this.addSecret(player.id, secretContent);
                        this.appendToChat('🔒 系统', `已向 ${player.name} 发送秘密信息`);
                        window.updateGameStatus('运行中', roundCounter, `秘密通知→${aiName}`);
                        window.addActionLog('GM', `向 ${aiName} 发送秘密信息`);
                        this.updatePlayersDisplay();
                    } else {
                        this.appendToChat('🎮 系统', `⚠️ 未找到玩家"${aiName}"`);
                    }
                }
            }
            
            if (publicMatch) {
                actionTaken = true;
                const aiName = publicMatch[1].trim();
                const player = this.findPlayerByName(aiName);
                if (player) {
                    try {
                        window.updateGameStatus('运行中', roundCounter, `等待 ${player.name}`);
                        this.updatePlayersDisplay(player.id);
                        const hasSecret = this.playerSecrets[player.id].length > 0;
                        const response = await this.callPlayerAI(player.id, hasSecret);
                        window.addActionLog(player.name, response);
                        this.updatePlayersDisplay();
                    } catch (error) {
                        console.error(`[AI对战] ${player.name} 行动失败:`, error);
                        this.appendToChat(`🎮 ${player.name}`, '(沉默)');
                        toastr.error(`${player.name} 响应失败`, 'AI对战');
                    }
                } else {
                    this.appendToChat('🎮 系统', `⚠️ 未找到玩家"${aiName}"`);
                }
            }

            if (actionTaken) {
                this.paused = true;
                $('#continue_game').prop('disabled', false);
                this.appendToChat('🎮 系统', '⏸️ 点击"继续游戏"进入下一步');
            } else {
                this.appendToChat('🎮 系统', `⚠️ GM回复格式不正确，请使用【轮到:AI名】或【秘密指示:AI名|内容】`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒继续
            }
        }
    }

    findPlayerByName(name) {
        const searchName = name.trim().toLowerCase();
        for (let [id, config] of Object.entries(this.apiConfigs)) {
            if (config.name.toLowerCase() === searchName) {
                return { id, name: config.name };
            }
        }
        return null;
    }

    waitForResume() {
        return new Promise(resolve => { this.resumeCallback = resolve; });
    }

    resume() {
        if (this.paused && this.resumeCallback) {
            this.paused = false;
            $('#continue_game').prop('disabled', true);
            this.resumeCallback();
            this.resumeCallback = null;
        }
    }

    updatePlayersDisplay(activePlayerId = null) {
        const players = Object.values(this.apiConfigs).map(config => ({
            id: Object.keys(this.apiConfigs).find(key => this.apiConfigs[key] === config),
            name: config.name,
            active: Object.keys(this.apiConfigs).find(key => this.apiConfigs[key] === config) === activePlayerId,
            hasSecret: this.playerSecrets[Object.keys(this.apiConfigs).find(key => this.apiConfigs[key] === config)]?.length > 0,
        }));
        window.updatePlayersList(players);
    }

    stopGame(reason = '用户手动停止') {
        this.running = false;
        this.paused = false;
        if (this.resumeCallback) this.resume();
        $('#start_game').prop('disabled', false);
        $('#continue_game').prop('disabled', true);
        $('#stop_game').prop('disabled', true);
        window.updateGameStatus('已结束', roundCounter, reason);
        window.addActionLog('系统', `游戏停止: ${reason}`);
        toastr.info(`游戏已停止: ${reason}`, 'AI对战');
    }
}

// ==================== 全局变量 ====================
let gameEngine = null;
let roundCounter = 0;
let actionHistory = [];

// ==================== UI辅助函数 ====================
window.updateGameStatus = function(status, round, currentPlayer) {
    $('#status-text').text(status);
    $('#round-number').text(round);
    $('#current-player').text(currentPlayer);
};

window.updatePlayersList = function(players) {
    const list = $('#players-list');
    list.empty();
    if (!players || players.length === 0) {
        list.html('<div>游戏未开始</div>');
        return;
    }
    players.forEach(p => {
        const playerHtml = `
            <div>
                <span>${p.name} ${p.hasSecret ? '🔒' : ''}</span>
                ${p.active ? ' (行动中...)' : ''}
            </div>`;
        list.append(playerHtml);
    });
};

window.addActionLog = function(actor, action) {
    const log = $('#recent-actions');
    const logHtml = `<div>[${new Date().toLocaleTimeString()}] <strong>${actor}:</strong> ${action.substring(0, 80)}...</div>`;
    log.prepend(logHtml);
    if (log.children().length > 10) log.children().last().remove();
};

window.addPromptLog = function(aiName, prompt, response) {
    const log = $('#prompt-logs');
    const logHtml = `
        <div>
            <strong>[${aiName}]</strong>
            <details>
                <summary>查看提示词</summary>
                <pre>${prompt}</pre>
            </details>
            <div>→ ${response.substring(0, 100)}...</div>
        </div>`;
    log.prepend(logHtml);
};

// ==================== UI函数 ====================
function loadSettings() {
    const settings = extension_settings[extensionName] || defaultSettings;
    settings.players.forEach((player, i) => {
        $(`#player${i + 1}_name`).val(player.name);
        $(`#player${i + 1}_api_url`).val(player.apiUrl);
        $(`#player${i + 1}_api_key`).val(player.apiKey);
        $(`#player${i + 1}_model`).val(player.model);
        $(`#player${i + 1}_custom_prompt`).val(player.customPrompt);
    });
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    settings.players.forEach((player, i) => {
        player.name = $(`#player${i + 1}_name`).val();
        player.apiUrl = $(`#player${i + 1}_api_url`).val();
        player.apiKey = $(`#player${i + 1}_api_key`).val();
        player.model = $(`#player${i + 1}_model`).val();
        player.customPrompt = $(`#player${i + 1}_custom_prompt`).val();
    });
    saveSettingsDebounced();
    toastr.success('设置已保存', 'AI对战');
}

async function startGame() {
    const settings = extension_settings[extensionName];
    if (settings.players.some(p => !p.apiKey)) {
        toastr.error('请先配置所有AI的API密钥', 'AI对战');
        return;
    }
    $('#start_game').prop('disabled', true);
    $('#stop_game').prop('disabled', false);
    gameEngine = new UniversalGameEngine(settings);
    await gameEngine.startGame();
}

function continueGame() {
    if (gameEngine) gameEngine.resume();
}

function stopGame() {
    if (gameEngine) gameEngine.stopGame();
}

async function sendInterview() {
    const targetId = $('#interview-target').val();
    const question = $('#interview-question').val().trim();
    if (!targetId || !question || !gameEngine) return;
    // ... (interview logic can be added later)
}

// ==================== 初始化 ====================
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}settings.html`);
    $('#extensions_settings2').append(`<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>🎮 AI策略对战</b></div><div class="inline-drawer-content">${settingsHtml}</div></div>`);
    loadSettings();

    const floatingPanel = `
        <div id="ai-battle-panel" style="position: fixed; right: 20px; top: 100px; width: 320px; background: #333; border-radius: 10px; padding: 15px; z-index: 1000; color: white;">
            <h3>🎮 AI对战控制台</h3>
            <div>状态: <span id="status-text">未开始</span> / 回合: <span id="round-number">-</span></div>
            <div>当前行动: <span id="current-player">-</span></div>
            <div id="players-list" style="margin-top: 10px;"></div>
            <div id="recent-actions" style="margin-top: 10px; max-height: 150px; overflow-y: auto;"></div>
            <button id="start_game" class="menu_button">▶️ 开始游戏</button>
            <button id="continue_game" class="menu_button" disabled>⏭️ 继续游戏</button>
            <button id="stop_game" class="menu_button" disabled>⏹️ 停止游戏</button>
            <div id="prompt-logs" style="margin-top: 10px; max-height: 200px; overflow-y: auto;"></div>
        </div>`;
    $('body').append(floatingPanel);

    $(document).on('click', '#save_battle_settings', saveSettings);
    $(document).on('click', '#start_game', startGame);
    $(document).on('click', '#continue_game', continueGame);
    $(document).on('click', '#stop_game', stopGame);
    
    console.log('[AI策略对战] 扩展已加载 - 通用版');
});
