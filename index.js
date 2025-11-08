// AI策略对战扩展 - 游戏管理员系统
// 架构：引擎层 + 游戏逻辑层
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";
import { loadWorldInfo } from "../../../world-info.js";

const extensionName = 'ai-strategy-battle';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 默认设置
const defaultSettings = {
    players: [
        { id: 'p1', name: 'AI-Alpha', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p2', name: 'AI-Beta', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p3', name: 'AI-Gamma', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p4', name: 'AI-Delta', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p5', name: 'AI-Echo', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p6', name: 'AI-Foxtrot', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' }
    ],
    worldbookName: ''
};

// 引擎层
class GameEngine {
    constructor(settings) {
        this.settings = settings;
        this.apiConfigs = {};
        settings.players.forEach(player => {
            this.apiConfigs[player.id] = {
                url: player.apiUrl || this.getDefaultApiUrl(player.apiType),
                key: player.apiKey,
                model: player.model,
                type: player.apiType
            };
        });
    }
    
    getDefaultApiUrl(apiType) {
        return apiType === 'openai' ? 'https://api.openai.com/v1' : '';
    }
    
    async callPlayerAI(playerId, publicContext, secretInfo = null) {
        const config = this.apiConfigs[playerId];
        if (!config || !config.key) throw new Error(`玩家 ${playerId} API未配置`);
        
        let fullPrompt = publicContext;
        if (secretInfo) fullPrompt += `\n\n[系统秘密指令]\n${secretInfo}`;
        
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
        
        if (!response.ok) throw new Error(`API错误 ${response.status}`);
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

// 全局变量
let gameEngine = null;
let currentGame = null;

// UI函数
function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    const settings = extension_settings[extensionName];
    settings.players.forEach((player, i) => {
        $(`#player${i + 1}_name`).val(player.name);
        $(`#player${i + 1}_api_key`).val(player.apiKey);
        $(`#player${i + 1}_model`).val(player.model);
    });
    $('#worldbook_name').val(settings.worldbookName || '');
}

function saveSettings() {
    const settings = extension_settings[extensionName];
    settings.players.forEach((player, i) => {
        player.name = $(`#player${i + 1}_name`).val();
        player.apiKey = $(`#player${i + 1}_api_key`).val();
        player.model = $(`#player${i + 1}_model`).val();
    });
    settings.worldbookName = $('#worldbook_name').val();
    saveSettingsDebounced();
    toastr.success('设置已保存', 'AI对战');
}

async function startWerewolfGame() {
    const settings = extension_settings[extensionName];
    if (!settings.worldbookName) {
        toastr.error('请先设置世界书名称', 'AI对战');
        return;
    }
    
    toastr.info('狼人杀游戏即将开始...', 'AI对战');
    gameEngine = new GameEngine(settings);
    gameEngine.appendToChat('🎭 系统', '🎮 AI狼人杀游戏开始！请在世界书中配置"狼人杀"规则。');
}

// 初始化
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}settings.html`);
    const panel = $(`
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎮 AI策略对战</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">${settingsHtml}</div>
        </div>
    `);
    
    $('#extensions_settings2').append(panel);
    loadSettings();
    
    $(document).on('click', '#save_battle_settings', saveSettings);
    
    eventSource.on(event_types.MESSAGE_SENT, (data) => {
        const msg = data.trim();
        if (msg.includes('开始狼人杀')) {
            startWerewolfGame();
        }
    });
    
    console.log('[AI策略对战] 扩展已加载');
});
