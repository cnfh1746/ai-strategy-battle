// AI策略对战扩展 - 主入口
import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = 'ai-strategy-battle';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

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
    executionMode: 'sequential',
    gameType: 'werewolf',
    matchStructure: 'single-game'
};

// 动态导入模块
async function loadModules() {
    try {
        const [gameCoordModule, uiModule] = await Promise.all([
            import(`${extensionFolderPath}src/core/game-coordinator.js`),
            import(`${extensionFolderPath}src/ui/ui-controller.js`)
        ]);
        return {
            GameCoordinator: gameCoordModule.GameCoordinator,
            UIController: uiModule.UIController
        };
    } catch (error) {
        console.error('[AI策略对战] 模块加载失败:', error);
        throw error;
    }
}

// 注册扩展
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}settings.html`);
    
    // 创建扩展面板
    const extensionPanel = $(`
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎮 AI策略对战</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${settingsHtml}
            </div>
        </div>
    `);
    
    $('#extensions_settings2').append(extensionPanel);
    
    // 初始化设置
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    
    // 加载设置
    loadSettings();
    
    // 绑定事件
    bindEvents();
    
    console.log('[AI策略对战] 扩展已加载');
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
    
    // 拉取模型列表
    for (let i = 1; i <= 6; i++) {
        $(document).on('click', `#fetch_models_${i}`, () => fetchModels(i));
    }
}

// 开始游戏
async function startGame() {
    const settings = extension_settings[extensionName];
    
    try {
        // 动态加载模块
        const { GameCoordinator, UIController } = await loadModules();
        
        // 创建游戏协调器
        gameCoordinator = new GameCoordinator(settings);
        
        // 创建UI控制器
        uiController = new UIController('#game_display');
        
        // 启动游戏
        toastr.info('游戏启动中...', 'AI策略对战');
        await gameCoordinator.start(uiController);
        
        toastr.success('游戏已开始', 'AI策略对战');
    } catch (error) {
        console.error('[AI策略对战] 启动失败:', error);
        toastr.error(`启动失败: ${error.message}`, 'AI策略对战');
    }
}

// 下一步 (手动模式)
async function nextStep() {
    if (!gameCoordinator) {
        toastr.warning('请先开始游戏', 'AI策略对战');
        return;
    }
    
    try {
        await gameCoordinator.nextStep();
    } catch (error) {
        console.error('[AI策略对战] 执行失败:', error);
        toastr.error(`执行失败: ${error.message}`, 'AI策略对战');
    }
}

// 停止游戏
function stopGame() {
    if (gameCoordinator) {
        gameCoordinator.stop();
        gameCoordinator = null;
        toastr.info('游戏已停止', 'AI策略对战');
    }
}

// 拉取模型列表
async function fetchModels(playerIndex) {
    const apiType = $(`#player${playerIndex}_api_type`).val();
    const apiUrl = $(`#player${playerIndex}_api_url`).val();
    const apiKey = $(`#player${playerIndex}_api_key`).val();
    
    if (!apiKey) {
        toastr.warning('请先填写API Key', 'AI策略对战');
        return;
    }
    
    try {
        toastr.info('正在拉取模型列表...', 'AI策略对战');
        
        let url = apiUrl || getDefaultApiUrl(apiType);
        if (!url.endsWith('/')) url += '/';
        url += 'models';
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 解析模型列表
        let models = [];
        if (data.data && Array.isArray(data.data)) {
            models = data.data.map(m => m.id || m.name || m).filter(Boolean);
        } else if (Array.isArray(data)) {
            models = data.map(m => m.id || m.name || m).filter(Boolean);
        }
        
        if (models.length === 0) {
            toastr.warning('未找到可用模型', 'AI策略对战');
            return;
        }
        
        // 显示模型选择对话框
        showModelSelector(playerIndex, models);
        
    } catch (error) {
        console.error('[AI策略对战] 拉取模型失败:', error);
        toastr.error(`拉取失败: ${error.message}`, 'AI策略对战');
    }
}

// 获取默认API地址
function getDefaultApiUrl(apiType) {
    switch (apiType) {
        case 'openai':
            return 'https://api.openai.com/v1';
        case 'claude':
            return 'https://api.anthropic.com/v1';
        default:
            return '';
    }
}

// 显示模型选择器
function showModelSelector(playerIndex, models) {
    const html = `
        <div class="model-selector-popup" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
             background: var(--SmartThemeBlurTintColor); border: 2px solid var(--SmartThemeBorderColor); 
             border-radius: 10px; padding: 20px; z-index: 9999; max-width: 500px; max-height: 70vh; overflow-y: auto;">
            <h3 style="margin-top: 0;">选择模型 - 玩家 ${playerIndex}</h3>
            <div style="max-height: 400px; overflow-y: auto; margin: 10px 0;">
                ${models.map(model => `
                    <div class="model-option" data-model="${model}" style="padding: 8px; margin: 5px 0; 
                         background: var(--black30a); border-radius: 5px; cursor: pointer; 
                         border: 1px solid transparent; transition: all 0.2s;">
                        <span style="color: var(--SmartThemeBodyColor);">${model}</span>
                    </div>
                `).join('')}
            </div>
            <div style="text-align: right; margin-top: 15px;">
                <button class="menu_button" id="close-model-selector">取消</button>
            </div>
        </div>
        <div class="model-selector-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; 
             background: rgba(0, 0, 0, 0.7); z-index: 9998;"></div>
    `;
    
    $('body').append(html);
    
    // 选择模型
    $('.model-option').on('click', function() {
        const model = $(this).data('model');
        $(`#player${playerIndex}_model`).val(model);
        $('.model-selector-popup, .model-selector-overlay').remove();
        toastr.success(`已选择模型: ${model}`, 'AI策略对战');
    });
    
    // 鼠标悬停效果
    $('.model-option').on('mouseenter', function() {
        $(this).css({
            'border-color': 'var(--SmartThemeQuoteColor)',
            'background': 'var(--black50a)'
        });
    }).on('mouseleave', function() {
        $(this).css({
            'border-color': 'transparent',
            'background': 'var(--black30a)'
        });
    });
    
    // 关闭对话框
    $('#close-model-selector, .model-selector-overlay').on('click', function() {
        $('.model-selector-popup, .model-selector-overlay').remove();
    });
}
