// AI策略对战扩展 - 主入口
import { GameCoordinator } from './src/core/game-coordinator.js';
import { UIController } from './src/ui/ui-controller.js';

const extensionName = 'ai-strategy-battle';
let gameCoordinator = null;
let uiController = null;

// 扩展设置
const defaultSettings = {
    players: [
        { id: 'p1', name: 'AI-Alpha', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p2', name: 'AI-Beta', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p3', name: 'AI-Gamma', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p4', name: 'AI-Delta', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p5', name: 'AI-Echo', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' },
        { id: 'p6', name: 'AI-Foxtrot', apiType: 'openai', apiUrl: '', apiKey: '', model: 'gpt-4' }
    ],
    executionMode: 'sequential', // sequential | parallel | manual
    gameType: 'werewolf',
    matchStructure: 'single-game' // single-game | tournament | league
};

// 注册扩展
jQuery(async () => {
    const settingsHtml = await $.get(`scripts/extensions/${extensionName}/settings.html`);
    $('#extensions_settings2').append(settingsHtml);
    
    // 加载设置
    loadSettings();
    
    // 绑定事件
    bindEvents();
    
    console.log(`[${extensionName}] 扩展已加载`);
});

// 加载设置
function loadSettings() {
    const settings = extension_settings[extensionName] || defaultSettings;
    extension_settings[extensionName] = settings;
    
    // 填充UI
    settings.players.forEach((player, index) => {
        $(`#player${index + 1}_name`).val(player.name);
        $(`#player${index + 1}_api_type`).val(player.apiType);
        $(`#player${index + 1}_api_url`).val(player.apiUrl);
        $(`#player${index + 1}_api_key`).val(player.apiKey);
        $(`#player${index + 1}_model`).val(player.model);
    });
    
    $('#execution_mode').val(settings.executionMode);
    $('#game_type').val(settings.gameType);
    $('#match_structure').val(settings.matchStructure);
}

// 保存设置
function saveSettings() {
    const settings = extension_settings[extensionName];
    
    settings.players.forEach((player, index) => {
        player.name = $(`#player${index + 1}_name`).val();
        player.apiType = $(`#player${index + 1}_api_type`).val();
        player.apiUrl = $(`#player${index + 1}_api_url`).val();
        player.apiKey = $(`#player${index + 1}_api_key`).val();
        player.model = $(`#player${index + 1}_model`).val();
    });
    
    settings.executionMode = $('#execution_mode').val();
    settings.gameType = $('#game_type').val();
    settings.matchStructure = $('#match_structure').val();
    
    saveSettingsDebounced();
    toastr.success('设置已保存');
}

// 绑定事件
function bindEvents() {
    // 保存设置
    $(document).on('click', '#save_battle_settings', saveSettings);
    
    // 开始游戏
    $(document).on('click', '#start_game', startGame);
    
    // 手动模式 - 下一步
    $(document).on('click', '#next_step', nextStep);
    
    // 停止游戏
    $(document).on('click', '#stop_game', stopGame);
}

// 开始游戏
async function startGame() {
    const settings = extension_settings[extensionName];
    
    try {
        // 创建游戏协调器
        gameCoordinator = new GameCoordinator(settings);
        
        // 创建UI控制器
        uiController = new UIController('#game_display');
        
        // 启动游戏
        toastr.info('游戏启动中...');
        await gameCoordinator.start(uiController);
        
        toastr.success('游戏已开始');
    } catch (error) {
        console.error('[AI策略对战] 启动失败:', error);
        toastr.error(`启动失败: ${error.message}`);
    }
}

// 下一步 (手动模式)
async function nextStep() {
    if (!gameCoordinator) {
        toastr.warning('请先开始游戏');
        return;
    }
    
    try {
        await gameCoordinator.nextStep();
    } catch (error) {
        console.error('[AI策略对战] 执行失败:', error);
        toastr.error(`执行失败: ${error.message}`);
    }
}

// 停止游戏
function stopGame() {
    if (gameCoordinator) {
        gameCoordinator.stop();
        gameCoordinator = null;
        toastr.info('游戏已停止');
    }
}
