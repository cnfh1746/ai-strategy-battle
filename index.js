// AI策略对战扩展 - 完整版
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";
import { loadWorldInfo } from "../../../world-info.js";

const extensionName = 'ai-strategy-battle';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 默认设置
const defaultSettings = {
    players: [
        { id: 'p1', name: 'AI-Alpha', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p2', name: 'AI-Beta', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p3', name: 'AI-Gamma', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p4', name: 'AI-Delta', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p5', name: 'AI-Echo', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' },
        { id: 'p6', name: 'AI-Foxtrot', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4', customPrompt: '' }
    ],
    worldbookName: ''
};

// ==================== 引擎层 ====================
class GameEngine {
    constructor(settings) {
        this.settings = settings;
        this.apiConfigs = {};
        settings.players.forEach(player => {
            this.apiConfigs[player.id] = {
                url: player.apiUrl || this.getDefaultApiUrl(player.apiType),
                key: player.apiKey,
                model: player.model,
                customPrompt: player.customPrompt || '',
                name: player.name
            };
        });
    }
    
    getDefaultApiUrl(apiType) {
        return apiType === 'openai' ? 'https://api.openai.com/v1' : '';
    }
    
    async callPlayerAI(playerId, publicContext, secretInfo = null) {
        const config = this.apiConfigs[playerId];
        if (!config || !config.key) throw new Error(`玩家 ${playerId} API未配置`);
        
        let fullPrompt = '';
        if (config.customPrompt) {
            fullPrompt += `[人格设定]\n${config.customPrompt}\n\n`;
        }
        fullPrompt += publicContext;
        if (secretInfo) {
            fullPrompt += `\n\n[系统秘密指令 - 其他玩家看不到]\n${secretInfo}`;
        }
        
        let apiUrl = config.url.replace(/\/$/, '') + '/v1/chat/completions';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.key}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: 0.7,
                max_tokens: 1000
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API错误 ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
    }
    
    async callGM(prompt) {
        const generateRaw = window.generateRaw || window.Generate?.generateRaw;
        if (!generateRaw) throw new Error('找不到SillyTavern生成函数');
        return await generateRaw(prompt, '', false, false);
    }
    
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
    
    getChatContext() {
        const context = getContext();
        const chat = context.chat || [];
        return chat.slice(-20).map(msg => {
            const speaker = msg.is_user ? (context.name1 || '用户') : (msg.name || 'GM');
            return `${speaker}: ${msg.mes}`;
        }).join('\n\n');
    }
    
    async getWorldBookRules(keyword) {
        if (!this.settings.worldbookName) return null;
        const bookData = await loadWorldInfo(this.settings.worldbookName);
        if (!bookData?.entries) return null;
        
        const entries = Object.values(bookData.entries).filter(entry => {
            if (entry.disable) return false;
            const allKeys = [...(entry.key || []), ...(entry.keysecondary || [])];
            return allKeys.some(key => key.toLowerCase().includes(keyword.toLowerCase()));
        });
        
        return entries.length > 0 ? entries.map(e => e.content).join('\n\n') : null;
    }
}

// ==================== 状态管理器 ====================
class GameStateManager {
    constructor(players) {
        this.state = {
            phase: 'init',
            round: 0,
            paused: false,
            players: {},
            nightActions: {},
            dayVotes: {},
            history: []
        };
        
        players.forEach(player => {
            this.state.players[player.id] = {
                id: player.id,
                name: player.name,
                role: null,
                alive: true,
                secretKnowledge: []
            };
        });
    }
    
    assignRoles() {
        const roles = ['狼人', '狼人', '村民', '村民', '预言家', '女巫'];
        const shuffled = roles.sort(() => Math.random() - 0.5);
        const playerIds = Object.keys(this.state.players);
        
        playerIds.forEach((id, i) => {
            this.state.players[id].role = shuffled[i];
        });
        
        console.log('[AI对战] 角色分配：', 
            Object.entries(this.state.players).map(([id, p]) => `${p.name}:${p.role}`)
        );
    }
    
    checkVictory() {
        const alive = Object.values(this.state.players).filter(p => p.alive);
        const wolves = alive.filter(p => p.role === '狼人').length;
        const goods = alive.length - wolves;
        
        if (wolves === 0) return 'good';
        if (wolves >= goods) return 'wolf';
        return null;
    }
    
    getAliveByRole(role) {
        return Object.values(this.state.players).filter(p => p.alive && p.role === role);
    }
    
    getAlivePlayers() {
        return Object.values(this.state.players).filter(p => p.alive);
    }
    
    findPlayerByName(name) {
        return Object.values(this.state.players).find(p => p.name === name);
    }
}

// ==================== 指令解析器 ====================
class ActionParser {
    static parse(text) {
        const patterns = {
            attack: /\[行动[：:]\s*(?:攻击|刀)\s*(.+?)\]/,
            check: /\[行动[：:]\s*(?:查验|验)\s*(.+?)\]/,
            vote: /\[行动[：:]\s*(?:投票|投)\s*(.+?)\]/,
            save: /\[行动[：:]\s*(?:救|解药)\s*(.+?)\]/,
            poison: /\[行动[：:]\s*(?:毒|毒药)\s*(.+?)\]/,
            skip: /\[行动[：:]\s*(?:不|跳过|放弃)\]/
        };
        
        for (let [action, regex] of Object.entries(patterns)) {
            const match = text.match(regex);
            if (match) {
                return { action, target: match[1] ? match[1].trim() : null };
            }
        }
        return null;
    }
    
    static async getActionWithRetry(engine, playerId, prompt, maxRetries = 2) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await engine.callPlayerAI(playerId, '', prompt);
                if (window.addPromptLog) {
                    window.addPromptLog(engine.apiConfigs[playerId].name, prompt, response);
                }
                
                const parsed = this.parse(response);
                if (parsed) return parsed;
                
                prompt = `⚠️ 格式错误！必须使用 [行动：XXX] 格式。\n\n${prompt}`;
            } catch (error) {
                console.error(`[AI对战] ${playerId} 行动失败:`, error);
                if (i === maxRetries - 1) throw error;
            }
        }
        return { action: 'skip', target: null };
    }
}

// ==================== 狼人杀游戏 ====================
class WerewolfGame {
    constructor(engine, gsm) {
        this.engine = engine;
        this.gsm = gsm;
        this.waitingForUser = false;
        this.resumeCallback = null;
    }
    
    async start() {
        try {
            const rules = await this.engine.getWorldBookRules('狼人杀');
            if (!rules) {
                toastr.warning('未找到狼人杀规则，将使用默认规则', 'AI对战');
            }
            
            this.gsm.assignRoles();
            if (window.updateGameStatus) {
                window.updateGameStatus('游戏开始', 0);
            }
            
            const opening = await this.engine.callGM('作为狼人杀主持人，宣布游戏开始，简单介绍规则。');
            this.engine.appendToChat('🎭 游戏主持', opening);
            
            await this.gameLoop();
            
        } catch (error) {
            console.error('[AI对战] 游戏启动失败:', error);
            toastr.error(`游戏启动失败: ${error.message}`, 'AI对战');
            $('#start_game').prop('disabled', false);
        }
    }
    
    async gameLoop() {
        while (true) {
            this.gsm.state.round++;
            
            this.gsm.state.phase = 'night';
            if (window.updateGameStatus) {
                window.updateGameStatus(`第${this.gsm.state.round}夜`, this.gsm.state.round);
            }
            await this.executeNight();
            await this.waitForUser('夜晚结束，点击"继续游戏"进入白天');
            
            const nightWinner = this.gsm.checkVictory();
            if (nightWinner) {
                this.announceWinner(nightWinner);
                break;
            }
            
            this.gsm.state.phase = 'day_speech';
            if (window.updateGameStatus) {
                window.updateGameStatus(`第${this.gsm.state.round}天 - 发言`, this.gsm.state.round);
            }
            await this.executeDaySpeech();
            await this.waitForUser('发言结束，点击"继续游戏"进入投票');
            
            this.gsm.state.phase = 'day_vote';
            if (window.updateGameStatus) {
                window.updateGameStatus(`第${this.gsm.state.round}天 - 投票`, this.gsm.state.round);
            }
            await this.executeDayVote();
            await this.waitForUser('投票结束，点击"继续游戏"进入夜晚');
            
            const dayWinner = this.gsm.checkVictory();
            if (dayWinner) {
                this.announceWinner(dayWinner);
                break;
            }
        }
    }
    
    async waitForUser(message) {
        this.engine.appendToChat('🎮 系统', `⏸️ ${message}`);
        this.waitingForUser = true;
        $('#continue_game').prop('disabled', false);
        
        return new Promise(resolve => {
            this.resumeCallback = resolve;
        });
    }
    
    resume() {
        if (this.waitingForUser && this.resumeCallback) {
            this.waitingForUser = false;
            $('#continue_game').prop('disabled', true);
            this.resumeCallback();
        }
    }
    
    async executeNight() {
        const announce = await this.engine.callGM(`宣布第${this.gsm.state.round}夜到来，天黑请闭眼。`);
        this.engine.appendToChat('🎭 游戏主持', announce);
        
        this.gsm.state.nightActions = {};
        
        const wolves = this.gsm.getAliveByRole('狼人');
        if (wolves.length > 0) {
            const wolf = wolves[0];
            const targets = this.gsm.getAlivePlayers()
                .filter(p => p.role !== '狼人')
                .map(p => p.name);
            
            const prompt = this.generatePrompt(wolf.id, 'wolf_action', { targets });
            const action = await ActionParser.getActionWithRetry(this.engine, wolf.id, prompt);
            this.gsm.state.nightActions.attack = action.target;
        }
        
        const seers = this.gsm.getAliveByRole('预言家');
        if (seers.length > 0) {
            const seer = seers[0];
            const targets = this.gsm.getAlivePlayers()
                .filter(p => p.id !== seer.id)
                .map(p => p.name);
            
            const prompt = this.generatePrompt(seer.id, 'seer_action', { targets });
            const action = await ActionParser.getActionWithRetry(this.engine, seer.id, prompt);
            
            if (action.target) {
                const target = this.gsm.findPlayerByName(action.target);
                if (target) {
                    const result = target.role === '狼人' ? '狼人' : '好人';
                    seer.secretKnowledge.push(`${action.target}是${result}`);
                }
            }
        }
        
        const witches = this.gsm.getAliveByRole('女巫');
        if (witches.length > 0 && this.gsm.state.nightActions.attack) {
            const witch = witches[0];
            const prompt = this.generatePrompt(witch.id, 'witch_action', {
                victim: this.gsm.state.nightActions.attack
            });
            const action = await ActionParser.getActionWithRetry(this.engine, witch.id, prompt);
            this.gsm.state.nightActions.witchSave = (action.action === 'save');
        }
        
        this.resolveNight();
    }
    
    resolveNight() {
        const { attack, witchSave } = this.gsm.state.nightActions;
        
        if (attack && !witchSave) {
            const victim = this.gsm.findPlayerByName(attack);
            if (victim) {
                victim.alive = false;
                this.engine.appendToChat('🎭 游戏主持', `天亮了，昨晚 ${attack} 被杀害了。`);
            }
        } else {
            this.engine.appendToChat('🎭 游戏主持', '天亮了，昨晚是平安夜。');
        }
    }
    
    async executeDaySpeech() {
        const alivePlayers = this.gsm.getAlivePlayers();
        
        for (let player of alivePlayers) {
            const prompt = this.generatePrompt(player.id, 'day_speech');
            try {
                const speech = await this.engine.callPlayerAI(
                    player.id,
                    this.engine.getChatContext(),
                    prompt
                );
                if (window.addPromptLog) {
                    window.addPromptLog(player.name, prompt, speech);
                }
                this.engine.appendToChat(`🎮 ${player.name}`, speech);
            } catch (error) {
                console.error(`[AI对战] ${player.name} 发言失败:`, error);
                this.engine.appendToChat(`🎮 ${player.name}`, '(沉默)');
            }
        }
    }
    
    async executeDayVote() {
        const alivePlayers = this.gsm.getAlivePlayers();
        const votes = {};
        
        for (let player of alivePlayers) {
            const targets = alivePlayers.map(p => p.name);
            const prompt = this.generatePrompt(player.id, 'day_vote', { targets });
            
            try {
                const action = await ActionParser.getActionWithRetry(this.engine, player.id, prompt);
                if (action.target) {
                    votes[player.id] = action.target;
                    this.engine.appendToChat(`🎮 ${player.name}`, `我投票给 ${action.target}`);
                }
            } catch (error) {
                console.error(`[AI对战] ${player.name} 投票失败:`, error);
            }
        }
        
        const voteCount = {};
        Object.values(votes).forEach(target => {
            voteCount[target] = (voteCount[target] || 0) + 1;
        });
        
        let maxVotes = 0;
        let eliminated = null;
        for (let [name, count] of Object.entries(voteCount)) {
            if (count > maxVotes) {
                maxVotes = count;
                eliminated = name;
            }
        }
        
        if (eliminated) {
            const player = this.gsm.findPlayerByName(eliminated);
            if (player) {
                player.alive = false;
                const result = await this.engine.callGM(
                    `宣布投票结果：${eliminated} 被驱逐出局，身份是 ${player.role}。`
                );
                this.engine.appendToChat('🎭 游戏主持', result);
            }
        }
    }
    
    announceWinner(winner) {
        const message = winner === 'good' ? '🎉 好人阵营获胜！' : '🎉 狼人阵营获胜！';
        this.engine.appendToChat('🎭 游戏主持', message);
        toastr.success(message, 'AI对战');
        $('#start_game').prop('disabled', false);
        $('#continue_game').prop('disabled', true);
    }
    
    generatePrompt(playerId, actionType, context = {}) {
        const player = this.gsm.state.players[playerId];
        const alive = this.gsm.getAlivePlayers().map(p => p.name);
        
        let prompt = `你的身份：${player.role}\n`;
        prompt += `存活玩家：${alive.join('、')}\n`;
        
        if (player.secretKnowledge.length > 0) {
            prompt += `你的秘密情报：${player.secretKnowledge.join('；')}\n`;
        }
        
        if (player.role === '狼人') {
            const teammates = this.gsm.getAliveByRole('狼人')
                .filter(p => p.id !== playerId)
                .map(p => p.name);
            if (teammates.length > 0) {
                prompt += `你的狼人队友：${teammates.join('、')}\n`;
            }
        }
        
        switch(actionType) {
            case 'wolf_action':
                prompt += `\n现在是夜晚，请选择攻击目标。\n可选目标：${context.targets.join('、')}\n请用格式回复：[行动：攻击XXX]`;
                break;
            case 'seer_action':
                prompt += `\n现在是夜晚，你是预言家，请选择查验目标。\n可选目标：${context.targets.join('、')}\n请用格式回复：[行动：查验XXX]`;
                break;
            case 'witch_action':
                prompt += `\n现在是夜晚，你是女巫，${context.victim} 被攻击。\n你可以选择：[行动：救] 或 [行动：不]`;
                break;
            case 'day_speech':
                prompt += `\n现在是白天发言阶段，请根据场上信息分析局势并表明立场。`;
                break;
            case 'day_vote':
                prompt += `\n现在是投票阶段，请选择你要驱逐的玩家。\n可选目标：${context.targets.join('、')}\n请用格式回复：[行动：投票XXX]`;
                break;
        }
        
        return prompt;
    }
}

// ==================== 全局变量 ====================
let gameEngine = null;
let currentGame = null;

// ==================== UI辅助函数 ====================
window.updateGameStatus = function(phase, round) {
    $('#phase-text').text(phase);
    $('#round-text').text(round);
};

window.addPromptLog = function(aiName, prompt, response) {
    const timestamp = new Date().toLocaleTimeString();
    const logHtml = `
        <div style="margin-bottom: 10px; border-left: 3px solid var(--SmartThemeQuoteColor); padding-left: 8px;">
            <div style="color: var(--SmartThemeQuoteColor); font-weight: bold;">
                [${timestamp}] ${aiName}
            </div>
            <details style="margin-top: 5px;">
                <summary style="cursor: pointer; color: #888;">查看提示词</summary>
                <pre style="white-space: pre-wrap; font-size: 11px; color: #aaa; margin-top: 5px;">${prompt}</pre>
            </details>
            <div style="color: #6c6; margin-top: 5px;">→ ${response.substring(0, 100)}...</div>
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
    settings.players.forEach((player, i) => {
        $(`#player${i + 1}_name`).val(player.name);
        $(`#player${i + 1}_api_key`).val(player.apiKey);
        $(`#player${i + 1}_model`).val(player.model);
        $(`#player${i + 1}_custom_prompt`).val(player.customPrompt || '');
    });
    $('#worldbook_name').val(settings.worldbookName || '');
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    settings.players.forEach((player, i) => {
        player.name = $(`#player${i + 1}_name`).val();
        player.apiKey = $(`#player${i + 1}_api_key`).val();
        player.model = $(`#player${i + 1}_model`).val();
        player.customPrompt = $(`#player${i + 1}_custom_prompt`).val() || '';
    });
    settings.worldbookName = $('#worldbook_name').val();
    saveSettingsDebounced();
    toastr.success('设置已保存', 'AI对战');
}

async function startGame() {
    const settings = extension_settings[extensionName];
    if (!settings.worldbookName) {
        toastr.warning('建议设置世界书名称', 'AI对战');
    }
    
    $('#start_game').prop('disabled', true);
    $('#stop_game').prop('disabled', false);
    
    try {
        gameEngine = new GameEngine(settings);
        const gsm = new GameStateManager(settings.players);
        currentGame = new WerewolfGame(gameEngine, gsm);
        
        // 更新采访目标选择器
        $('#interview-target').empty().append('<option value="">选择要采访的AI...</option>');
        settings.players.forEach(p => {
            $('#interview-target').append(`<option value="${p.id}">${p.name}</option>`);
        });
        
        await currentGame.start();
    } catch (error) {
        console.error('[AI对战] 启动失败:', error);
        toastr.error(`启动失败: ${error.message}`, 'AI对战');
        $('#start_game').prop('disabled', false);
        $('#stop_game').prop('disabled', true);
    }
}

function continueGame() {
    if (currentGame) {
        currentGame.resume();
    }
}

function stopGame() {
    currentGame = null;
    gameEngine = null;
    $('#start_game').prop('disabled', false);
    $('#continue_game').prop('disabled', true);
    $('#stop_game').prop('disabled', true);
    toastr.info('游戏已停止', 'AI对战');
}

async function sendInterview() {
    const targetId = $('#interview-target').val();
    const question = $('#interview-question').val().trim();
    
    if (!targetId || !question) {
        toastr.warning('请选择AI并输入问题', 'AI对战');
        return;
    }
    
    if (!currentGame) {
        toastr.error('游戏未开始', 'AI对战');
        return;
    }
    
    const player = currentGame.gsm.state.players[targetId];
    const interviewPrompt = `
[系统：玩家正在采访你]
你的身份：${player.role}
你的秘密情报：${player.secretKnowledge.join('；')}
当前游戏阶段：${currentGame.gsm.state.phase}

玩家问：${question}

请根据你的角色和记忆真实回答（可以选择隐瞒部分信息）。
`;
    
    try {
        $('#send-interview').prop('disabled', true).text('思考中...');
        
        const answer = await currentGame.engine.callPlayerAI(
            targetId,
            currentGame.engine.getChatContext(),
            interviewPrompt
        );
        
        $('#interview-answer').text(answer);
        $('#interview-response').slideDown();
        
        addPromptLog(`[采访] ${player.name}`, interviewPrompt, answer);
        
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
                <b>🎮 AI策略对战 - 配置</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">${settingsHtml}</div>
        </div>
    `);
    $('#extensions_settings2').append(panel);
    loadSettings();
    
    // 创建浮动控制面板
    const floatingPanel = $(`
        <div id="ai-battle-panel" style="position: fixed; right: 20px; top: 100px; width: 400px; max-height: 80vh; overflow-y: auto; background: var(--SmartThemeBlurTintColor); border: 2px solid var(--SmartThemeBorderColor); border-radius: 10px; padding: 15px; z-index: 1000; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0;">🎮 AI对战控制台</h3>
                <button id="toggle-panel" class="menu_button" style="padding: 5px 10px;">−</button>
            </div>
            
            <div class="control-section" style="margin-bottom: 15px;">
                <button id="start_game" class="menu_button" style="width: 100%; margin-bottom: 5px;">▶️ 开始游戏</button>
                <button id="continue_game" class="menu_button" style="width: 100%; margin-bottom: 5px;" disabled>⏭️ 继续游戏</button>
                <button id="stop_game" class="menu_button" style="width: 100%;" disabled>⏹️ 停止游戏</button>
            </div>
            
            <div id="game-status" style="margin-bottom: 15px; padding: 10px; background: var(--black30a); border-radius: 5px;">
                <div>游戏状态：<span id="phase-text">未开始</span></div>
                <div>回合：<span id="round-text">0</span></div>
            </div>
            
            <div class="prompt-display-section" style="margin-bottom: 15px;">
                <h4 style="cursor: pointer; margin: 0 0 10px 0;" onclick="$('#prompt-logs').toggle()">📝 实时提示词记录 ▼</h4>
                <div id="prompt-logs" style="max-height: 200px; overflow-y: auto; background: var(--black50a); padding: 10px; border-radius: 5px; font-size: 12px;"></div>
            </div>
            
            <div class="interview-section" style="border-top: 2px solid var(--SmartThemeBorderColor); padding-top: 15px;">
                <h4 style="margin: 0 0 10px 0;">🎤 采访AI</h4>
                <select id="interview-target" class="text_pole" style="width: 100%; margin-bottom: 10px;">
                    <option value="">选择要采访的AI...</option>
                </select>
                <textarea id="interview-question" class="text_pole" placeholder="输入你的问题（AI会根据其角色和记忆回答）" style="width: 100%; height: 60px; margin-bottom: 10px; resize: vertical;"></textarea>
                <button id="send-interview" class="menu_button" style="width: 100%;">💬 发送采访</button>
                <div id="interview-response" style="margin-top: 10px; padding: 10px; background: var(--black30a); border-radius: 5px; max-height: 200px; overflow-y: auto; display: none;">
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
    $(document).on('click', '#toggle-panel', function() {
        const content = $('#ai-battle-panel > div:not(:first)');
        content.toggle();
        $(this).text(content.is(':visible') ? '−' : '+');
    });
    
    console.log('[AI策略对战] 扩展已加载');
});
