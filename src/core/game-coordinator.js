// 游戏协调器 - 核心控制中心
export class GameCoordinator {
    constructor(settings) {
        this.settings = settings;
        this.players = this.initializePlayers(settings.players);
        this.executor = this.createExecutor(settings.executionMode);
        this.ruleEngine = null;
        this.state = {
            running: false,
            paused: false,
            round: 0,
            phase: 'setup'
        };
    }
    
    // 初始化玩家
    initializePlayers(playerConfigs) {
        return playerConfigs.map(config => ({
            ...config,
            alive: true,
            role: null,
            stats: {},
            history: []
        }));
    }
    
    // 创建执行器
    createExecutor(mode) {
        switch(mode) {
            case 'sequential':
                return new SequentialExecutor();
            case 'parallel':
                return new ParallelExecutor();
            case 'manual':
                return new ManualExecutor();
            default:
                return new SequentialExecutor();
        }
    }
    
    // 启动游戏
    async start(uiController) {
        this.uiController = uiController;
        this.state.running = true;
        
        // 初始化规则引擎
        this.ruleEngine = await this.loadRuleEngine(this.settings.gameType);
        
        // 初始化游戏
        await this.ruleEngine.initialize(this.players);
        
        // 显示初始状态
        this.uiController.displayGameStart(this.players, this.settings.gameType);
        
        // 根据比赛结构执行
        if (this.settings.matchStructure === 'tournament') {
            await this.runTournament();
        } else {
            await this.runSingleGame();
        }
    }
    
    // 单场游戏
    async runSingleGame() {
        while (this.state.running && !this.ruleEngine.isGameOver()) {
            this.state.round++;
            
            // 显示回合开始
            this.uiController.displayRoundStart(this.state.round);
            
            // 执行回合
            await this.executor.executeRound(
                this.players,
                this.ruleEngine,
                this.uiController
            );
            
            // 检查胜利条件
            if (this.ruleEngine.isGameOver()) {
                const winner = this.ruleEngine.getWinner();
                this.uiController.displayGameEnd(winner);
                break;
            }
        }
    }
    
    // 淘汰赛
    async runTournament() {
        let bracket = [...this.players];
        let round = 1;
        
        while (bracket.length > 1) {
            this.uiController.displayTournamentRound(round, bracket);
            
            const matches = this.createMatches(bracket);
            const winners = [];
            
            for (const match of matches) {
                this.uiController.displayMatchStart(match);
                
                const winner = await this.runMatch(match.player1, match.player2);
                winners.push(winner);
                
                this.uiController.displayMatchEnd(match, winner);
            }
            
            bracket = winners;
            round++;
        }
        
        this.uiController.displayChampion(bracket[0]);
    }
    
    // 1v1对战
    async runMatch(player1, player2) {
        const matchPlayers = [player1, player2];
        const matchRuleEngine = await this.loadRuleEngine(this.settings.gameType);
        await matchRuleEngine.initialize(matchPlayers);
        
        while (!matchRuleEngine.isGameOver()) {
            await this.executor.executeRound(
                matchPlayers,
                matchRuleEngine,
                this.uiController
            );
        }
        
        return matchRuleEngine.getWinner();
    }
    
    // 创建对阵
    createMatches(players) {
        const matches = [];
        for (let i = 0; i < players.length; i += 2) {
            matches.push({
                player1: players[i],
                player2: players[i + 1]
            });
        }
        return matches;
    }
    
    // 加载规则引擎
    async loadRuleEngine(gameType) {
        switch(gameType) {
            case 'werewolf':
                const { WerewolfRuleEngine } = await import('./rules/werewolf-rules.js');
                return new WerewolfRuleEngine();
            case 'resource-battle':
                const { ResourceBattleRuleEngine } = await import('./rules/resource-rules.js');
                return new ResourceBattleRuleEngine();
            case 'custom':
                const { CustomRuleEngine } = await import('./rules/custom-rules.js');
                return new CustomRuleEngine();
            default:
                throw new Error(`未知的游戏类型: ${gameType}`);
        }
    }
    
    // 下一步 (手动模式)
    async nextStep() {
        if (this.executor instanceof ManualExecutor) {
            await this.executor.nextStep();
        }
    }
    
    // 停止游戏
    stop() {
        this.state.running = false;
    }
}

// 顺序执行器
class SequentialExecutor {
    async executeRound(players, ruleEngine, uiController) {
        const activePlayers = players.filter(p => p.alive);
        
        for (const player of activePlayers) {
            // 构建提示词
            const prompt = ruleEngine.buildPrompt(player);
            
            if (!prompt) continue; // 某些角色可能在某阶段无行动
            
            // 显示AI思考中
            uiController.displayPlayerThinking(player);
            
            // 请求AI
            const response = await this.requestAI(player, prompt);
            
            // 解析响应
            const action = this.parseResponse(response);
            
            // 处理行动
            await ruleEngine.processAction(player, action);
            
            // 更新UI
            uiController.displayPlayerAction(player, action);
            
            // 延迟，让用户看清
            await this.sleep(1500);
        }
        
        // 回合结算
        await ruleEngine.resolveRound();
        uiController.displayRoundResult(ruleEngine.getRoundResult());
    }
    
    async requestAI(player, prompt) {
        const url = player.apiUrl || this.getDefaultApiUrl(player.apiType);
        
        try {
            const response = await fetch(`${url}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${player.apiKey}`
                },
                body: JSON.stringify({
                    model: player.model,
                    messages: [
                        { role: 'system', content: '你是一个策略游戏AI玩家，请仔细分析并做出最优决策。' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error(`[AI请求失败] ${player.name}:`, error);
            throw error;
        }
    }
    
    getDefaultApiUrl(apiType) {
        switch(apiType) {
            case 'openai':
                return 'https://api.openai.com/v1';
            case 'claude':
                return 'https://api.anthropic.com/v1';
            default:
                return 'https://api.openai.com/v1';
        }
    }
    
    parseResponse(response) {
        try {
            // 尝试提取JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            // 如果没有JSON，返回原文本
            return { raw: response };
        } catch (error) {
            console.error('解析响应失败:', error);
            return { raw: response, error: true };
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 并行执行器
class ParallelExecutor extends SequentialExecutor {
    async executeRound(players, ruleEngine, uiController) {
        const activePlayers = players.filter(p => p.alive);
        
        // 显示所有AI思考中
        activePlayers.forEach(p => {
            const prompt = ruleEngine.buildPrompt(p);
            if (prompt) uiController.displayPlayerThinking(p);
        });
        
        // 并行请求所有AI
        const promises = activePlayers.map(async player => {
            const prompt = ruleEngine.buildPrompt(player);
            if (!prompt) return null;
            
            const response = await this.requestAI(player, prompt);
            const action = this.parseResponse(response);
            return { player, action };
        });
        
        // 等待所有响应
        const results = await Promise.all(promises);
        
        // 处理所有行动
        for (const result of results) {
            if (!result) continue;
            const { player, action } = result;
            await ruleEngine.processAction(player, action);
            uiController.displayPlayerAction(player, action);
        }
        
        // 回合结算
        await ruleEngine.resolveRound();
        uiController.displayRoundResult(ruleEngine.getRoundResult());
    }
}

// 手动执行器
class ManualExecutor extends SequentialExecutor {
    constructor() {
        super();
        this.currentPlayerIndex = 0;
        this.players = null;
        this.ruleEngine = null;
        this.uiController = null;
    }
    
    async executeRound(players, ruleEngine, uiController) {
        this.players = players.filter(p => p.alive);
        this.ruleEngine = ruleEngine;
        this.uiController = uiController;
        this.currentPlayerIndex = 0;
        
        // 显示"下一步"按钮
        uiController.showNextButton(true);
    }
    
    async nextStep() {
        if (this.currentPlayerIndex >= this.players.length) {
            // 回合结束
            await this.ruleEngine.resolveRound();
            this.uiController.displayRoundResult(this.ruleEngine.getRoundResult());
            this.uiController.showNextButton(false);
            return;
        }
        
        const player = this.players[this.currentPlayerIndex];
        
        const prompt = this.ruleEngine.buildPrompt(player);
        if (!prompt) {
            this.currentPlayerIndex++;
            return this.nextStep();
        }
        
        this.uiController.displayPlayerThinking(player);
        
        const response = await this.requestAI(player, prompt);
        const action = this.parseResponse(response);
        
        await this.ruleEngine.processAction(player, action);
        this.uiController.displayPlayerAction(player, action);
        
        this.currentPlayerIndex++;
    }
}
