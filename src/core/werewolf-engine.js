// 狼人杀游戏引擎 - 内置完整规则
export class WerewolfGameEngine {
    constructor(settings, appendToChatFn, callPlayerAIFn) {
        this.settings = settings;
        this.appendToChat = appendToChatFn;
        this.callPlayerAI = callPlayerAIFn;
        
        // 游戏状态
        this.running = false;
        this.paused = false;
        this.phase = 'init'; // init, night, day, vote, result
        this.dayNumber = 0;
        
        // 玩家配置
        this.apiConfigs = {};
        settings.players.forEach(player => {
            this.apiConfigs[player.id] = {
                url: player.apiUrl || 'https://api.openai.com/v1',
                key: player.apiKey,
                model: player.model,
                customPrompt: player.customPrompt || '',
                name: player.name
            };
        });
        
        // 游戏数据
        this.players = {}; // playerId -> { id, name, role, isAlive, votedFor }
        this.gameHistory = []; // 游戏历史记录
        this.nightActions = {}; // 夜晚行动记录
        
        // 身份配置（6人局）
        this.roles = {
            'werewolf': { count: 2, name: '狼人', team: 'werewolf' },
            'seer': { count: 1, name: '预言家', team: 'villager' },
            'witch': { count: 1, name: '女巫', team: 'villager' },
            'villager': { count: 2, name: '平民', team: 'villager' }
        };
        
        // 女巫药水状态
        this.witchPotions = {
            antidote: true,  // 解药
            poison: true     //毒药
        };
    }
    
    // ==================== 游戏初始化 ====================
    async startGame() {
        this.running = true;
        this.paused = false;
        this.dayNumber = 0;
        
        console.log('[狼人杀] 游戏开始！');
        
        // 1. 发布游戏开场白
        const opening = `🎮 欢迎来到AI狼人杀大乱斗！

📋 游戏配置：
• 参与玩家：${Object.values(this.apiConfigs).map(c => c.name).join('、')}
• 身份配置：2狼人、1预言家、1女巫、2平民

🎯 胜利条件：
• 狼人获胜：屠边（所有好人或所有神职死亡）
• 好人获胜：所有狼人出局

现在开始分配身份...`;
        
        this.appendToChat('🎮 系统', opening);
        if (window.addPublicMessage) window.addPublicMessage('🎮 系统', '游戏开始，正在分配身份...');
        
        // 2. 分配身份
        await this.assignRoles();
        
        // 3. 公布身份分配完成
        this.appendToChat('🎮 系统', '✅ 身份已秘密分配完成！游戏即将开始...');
        
        // 4. 开始第一个夜晚
        await this.startNightPhase();
        
        return true;
    }
    
    // 分配身份
    async assignRoles() {
        const playerIds = Object.keys(this.apiConfigs);
        const roleList = [];
        
        // 构建身份列表
        for (const [roleKey, roleConfig] of Object.entries(this.roles)) {
            for (let i = 0; i < roleConfig.count; i++) {
                roleList.push(roleKey);
            }
        }
        
        // 洗牌
        for (let i = roleList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roleList[i], roleList[j]] = [roleList[j], roleList[i]];
        }
        
        // 分配给玩家
        playerIds.forEach((playerId, index) => {
            const role = roleList[index];
            const config = this.apiConfigs[playerId];
            
            this.players[playerId] = {
                id: playerId,
                name: config.name,
                role: role,
                roleInfo: this.roles[role],
                isAlive: true,
                votedFor: null
            };
            
            console.log(`[狼人杀] ${config.name} 的身份：${this.roles[role].name}`);
        });
        
        // 给每个玩家发送秘密身份
        for (const [playerId, player] of Object.entries(this.players)) {
            let secretMessage = `【你的身份】\n你的身份是：${player.roleInfo.name}\n`;
            
            if (player.role === 'werewolf') {
                const teammates = Object.values(this.players)
                    .filter(p => p.role === 'werewolf' && p.id !== playerId)
                    .map(p => p.name);
                secretMessage += `你的狼人队友：${teammates.join('、')}\n`;
                secretMessage += `\n🎯 你的目标：在夜晚与队友商议杀人，白天隐藏身份并投票出局好人。`;
            } else if (player.role === 'seer') {
                secretMessage += `\n🔮 你的能力：每晚可以查验一名玩家的身份（狼人或好人）。`;
            } else if (player.role === 'witch') {
                secretMessage += `\n💊 你的能力：\n• 解药（一次）：救活当晚被狼人杀死的玩家\n• 毒药（一次）：毒杀任意一名玩家\n• 同一晚只能使用一瓶药`;
            } else if (player.role === 'villager') {
                secretMessage += `\n👤 你的目标：通过发言和投票找出狼人。`;
            }
            
            this.appendToChat('🔒 系统', `已向 ${player.name} 发送身份信息`);
            if (window.addPrivateMessage) window.addPrivateMessage([player.name], '🔒 系统', `你的身份是：${player.roleInfo.name}`);
            
            // 直接调用 AI 告知身份
            await this.sendSecretToPlayer(playerId, secretMessage);
        }
    }
    
    // 发送秘密信息给玩家
    async sendSecretToPlayer(playerId, secretMessage) {
        const config = this.apiConfigs[playerId];
        const prompt = `[系统通知 - 这是只有你知道的秘密信息]\n\n${secretMessage}\n\n请回复"收到"或简短回应，表示你已了解你的身份和目标。`;
        
        try {
            console.log(`[狼人杀] 向 ${config.name} 发送秘密:`, secretMessage);
            
            const apiUrl = config.url.replace(/\/$/, '') + '/chat/completions';
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
                    max_tokens: 100
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const reply = data.choices[0].message.content;
                console.log(`[狼人杀] ${config.name} 回应:`, reply);
            }
        } catch (error) {
            console.error(`[狼人杀] 发送秘密给 ${config.name} 失败:`, error);
        }
    }
    
    // ==================== 夜晚阶段 ====================
    async startNightPhase() {
        this.dayNumber++;
        this.phase = 'night';
        this.nightActions = {};
        
        console.log(`[狼人杀] 第${this.dayNumber}天 - 夜晚阶段`);
        
        this.appendToChat('🌙 系统', `\n========== 第 ${this.dayNumber} 天 - 夜晚 ==========\n\n天黑请闭眼...`);
        if (window.addPublicMessage) window.addPublicMessage('🌙 系统', `第 ${this.dayNumber} 天 - 夜晚`);

        // 🎙️ 解说点1：夜晚开始
        await this.callCommentator(
            this.getPublicContext(),
            `第${this.dayNumber}夜降临，游戏进入夜晚阶段。当前存活玩家：${Object.values(this.players).filter(p => p.isAlive).map(p => p.name).join('、')}`
        );
        
        // 1. 狼人行动
        await this.werewolvesAction();
        
        // 2. 预言家行动
        await this.seerAction();
        
        // 3. 女巫行动
        await this.witchAction();
        
        // 4. 结算夜晚结果
        await this.resolveNight();

        // 🎙️ 解说点2：夜晚结束，制造悬念
        await this.callCommentator(
            this.getPublicContext(),
            `第${this.dayNumber}夜即将结束，黎明将至。今晚发生了什么？让我们拭目以待...`
        );
        
        // 5. 进入白天
        await this.startDayPhase();
    }
    
    // 狼人行动
    async werewolvesAction() {
        const werewolves = Object.values(this.players).filter(p => p.role === 'werewolf' && p.isAlive);
        
        if (werewolves.length === 0) {
            console.log('[狼人杀] 没有存活的狼人');
            return;
        }
        
        this.appendToChat('🐺 系统', '狼人请睁眼，选择今晚要击杀的目标...');
        if (window.addPrivateMessage) window.addPrivateMessage(werewolves.map(w => w.name), '🐺 系统', '狼人请睁眼，商议击杀目标。');
        
        // 获取可选目标
        const targets = Object.values(this.players)
            .filter(p => p.role !== 'werewolf' && p.isAlive)
            .map(p => p.name);
        
        if (targets.length === 0) {
            console.log('[狼人杀] 没有可击杀的目标');
            return;
        }
        
        // 让每个狼人投票
        const votes = {};
        for (const wolf of werewolves) {
            const prompt = `[狼人夜晚行动]

你是狼人，现在是夜晚。

存活的玩家：${Object.values(this.players).filter(p => p.isAlive).map(p => p.name).join('、')}
可击杀的目标：${targets.join('、')}

${werewolves.length > 1 ? `你的狼人队友：${werewolves.filter(w => w.id !== wolf.id).map(w => w.name).join('、')}` : ''}

请选择你想击杀的目标（只需回复目标的名字）：`;
            
            try {
                const response = await this.callPlayerAI(wolf.id, prompt);
                // 解析回复，找出目标名字
                const target = this.findPlayerNameInText(response, targets);
                if (target) {
                    votes[target] = (votes[target] || 0) + 1;
                    console.log(`[狼人杀] ${wolf.name} 选择击杀 ${target}`);
                    this.appendToChat('🐺 系统', `${wolf.name} 做出了选择...`);
                }
            } catch (error) {
                console.error(`[狼人杀] ${wolf.name} 行动失败:`, error);
            }
        }
        
        // 统计投票结果
        if (Object.keys(votes).length > 0) {
            const maxVotes = Math.max(...Object.values(votes));
            const victims = Object.keys(votes).filter(name => votes[name] === maxVotes);
            const victim = victims[Math.floor(Math.random() * victims.length)];
            
            this.nightActions.wolfKill = victim;
            console.log(`[狼人杀] 狼人决定击杀：${victim}`);
            this.appendToChat('🐺 系统', '狼人已做出选择，请闭眼...');
            if (window.addPrivateMessage) window.addPrivateMessage(werewolves.map(w => w.name), '🐺 系统', `狼人决定击杀：${victim}`);
        }
    }
    
    // 预言家行动
    async seerAction() {
        const seer = Object.values(this.players).find(p => p.role === 'seer' && p.isAlive);
        
        if (!seer) {
            console.log('[狼人杀] 预言家不存在或已死亡');
            return;
        }
        
        this.appendToChat('🔮 系统', '预言家请睁眼，选择你要查验的目标...');
        if (window.addPrivateMessage) window.addPrivateMessage([seer.name], '🔮 系统', '预言家请睁眼，选择查验目标。');
        
        const targets = Object.values(this.players)
            .filter(p => p.id !== seer.id && p.isAlive)
            .map(p => p.name);
        
        const prompt = `[预言家夜晚行动]

你是预言家，拥有查验身份的能力。

存活的玩家：${targets.join('、')}

请选择你想查验的目标（只需回复目标的名字）：`;
        
        try {
            const response = await this.callPlayerAI(seer.id, prompt);
            const target = this.findPlayerNameInText(response, targets);
            
            if (target) {
                const targetPlayer = Object.values(this.players).find(p => p.name === target);
                const isWerewolf = targetPlayer.role === 'werewolf';
                const result = isWerewolf ? '狼人' : '好人';
                
                console.log(`[狼人杀] 预言家查验 ${target}，结果：${result}`);
                this.appendToChat('🔮 系统', `预言家查验了 ${target}...`);
                if (window.addPrivateMessage) window.addPrivateMessage([seer.name], '🔮 系统', `查验结果：${target} 是 ${result}`);
                
                // 告知预言家结果
                await this.sendSecretToPlayer(seer.id, `[查验结果]\n你查验的 ${target} 是：${result}`);
            }
        } catch (error) {
            console.error(`[狼人杀] 预言家行动失败:`, error);
        }
        
        this.appendToChat('🔮 系统', '预言家请闭眼...');
    }
    
    // 女巫行动
    async witchAction() {
        const witch = Object.values(this.players).find(p => p.role === 'witch' && p.isAlive);
        
        if (!witch) {
            console.log('[狼人杀] 女巫不存在或已死亡');
            return;
        }
        
        this.appendToChat('💊 系统', '女巫请睁眼...');
        if (window.addPrivateMessage) window.addPrivateMessage([witch.name], '💊 系统', '女巫请睁眼，等待你的行动。');
        
        let prompt = `[女巫夜晚行动]

你是女巫，拥有两瓶药：
• 解药（${this.witchPotions.antidote ? '✅ 可用' : '❌ 已用'}）：可以救活今晚被狼人杀死的玩家
• 毒药（${this.witchPotions.poison ? '✅ 可用' : '❌ 已用'}）：可以毒杀任意一名玩家

`;
        
        // 告知女巫谁被杀了
        if (this.nightActions.wolfKill) {
            prompt += `今晚狼人击杀的玩家是：${this.nightActions.wolfKill}\n\n`;
        } else {
            prompt += `今晚没有玩家被狼人击杀。\n\n`;
        }
        
        const aliveTargets = Object.values(this.players).filter(p => p.isAlive).map(p => p.name);
        
        prompt += `请选择你的行动（回复格式）：
1. "使用解药" - 救活被杀的玩家
2. "使用毒药杀XX" - 毒杀某个玩家（将XX替换为玩家名字）
3. "不使用" - 本回合不使用药水

可选目标：${aliveTargets.join('、')}

请回复你的选择：`;
        
        try {
            const response = await this.callPlayerAI(witch.id, prompt);
            console.log(`[狼人杀] 女巫回应:`, response);
            
            // 解析女巫的行动
            if (response.includes('使用解药') && this.witchPotions.antidote && this.nightActions.wolfKill) {
                this.nightActions.witchSave = true;
                this.witchPotions.antidote = false;
                console.log(`[狼人杀] 女巫使用解药救了 ${this.nightActions.wolfKill}`);
                this.appendToChat('💊 系统', '女巫使用了解药...');
                if (window.addPrivateMessage) window.addPrivateMessage([witch.name], '💊 系统', `你使用了【解药】救活了 ${this.nightActions.wolfKill}`);
            } else if (response.includes('使用毒药') && this.witchPotions.poison) {
                const poisonTarget = this.findPlayerNameInText(response, aliveTargets);
                if (poisonTarget) {
                    this.nightActions.witchPoison = poisonTarget;
                    this.witchPotions.poison = false;
                    console.log(`[狼人杀] 女巫使用毒药毒杀 ${poisonTarget}`);
                    this.appendToChat('💊 系统', '女巫使用了毒药...');
                    if (window.addPrivateMessage) window.addPrivateMessage([witch.name], '💊 系统', `你使用了【毒药】杀死了 ${poisonTarget}`);
                }
            } else {
                console.log('[狼人杀] 女巫选择不使用药水');
                this.appendToChat('💊 系统', '女巫选择不使用药水...');
            }
        } catch (error) {
            console.error(`[狼人杀] 女巫行动失败:`, error);
        }
        
        this.appendToChat('💊 系统', '女巫请闭眼...');
    }
    
    // 结算夜晚结果
    async resolveNight() {
        const deaths = [];
        
        // 1. 狼人击杀（如果女巫没救）
        if (this.nightActions.wolfKill && !this.nightActions.witchSave) {
            deaths.push(this.nightActions.wolfKill);
        }
        
        // 2. 女巫毒杀
        if (this.nightActions.witchPoison) {
            deaths.push(this.nightActions.witchPoison);
        }
        
        // 标记死亡玩家
        deaths.forEach(name => {
            const player = Object.values(this.players).find(p => p.name === name);
            if (player) {
                player.isAlive = false;
                console.log(`[狼人杀] ${player.name}(${player.roleInfo.name}) 在夜晚死亡`);
            }
        });
        
        this.nightActions.deaths = deaths;
    }
    
    // ==================== 白天阶段 ====================
    async startDayPhase() {
        this.phase = 'day';
        
        console.log(`[狼人杀] 第${this.dayNumber}天 - 白天阶段`);
        
        const deaths = this.nightActions.deaths || [];
        
        if (deaths.length === 0) {
            this.appendToChat('☀️ 系统', '\n========== 天亮了 ==========\n\n昨晚是平安夜，没有玩家死亡。');
            if (window.addPublicMessage) window.addPublicMessage('☀️ 系统', '昨晚是平安夜，没有玩家死亡。');
            
            // 🎙️ 解说点3a：平安夜
            await this.callCommentator(
                this.getPublicContext(),
                `平安夜！没有玩家死亡。这是暴风雨前的宁静，还是局势的转折？`
            );
        } else {
            this.appendToChat('☀️ 系统', `\n========== 天亮了 ==========\n\n昨晚死亡的玩家是：${deaths.join('、')}\n\n请存活的玩家依次发言...`);
            if (window.addPublicMessage) window.addPublicMessage('☀️ 系统', `昨晚死亡的玩家是：${deaths.join('、')}`);
            
            // 🎙️ 解说点3b：有人死亡
            const deathInfo = deaths.map(name => {
                const player = Object.values(this.players).find(p => p.name === name);
                return `${name}`;
            }).join('、');
            
            await this.callCommentator(
                this.getPublicContext(),
                `天亮了！${deathInfo}倒下了！这对局势会产生怎样的影响？存活玩家：${Object.values(this.players).filter(p => p.isAlive).map(p => p.name).join('、')}`
            );
        }
        
        // 检查游戏是否结束
        if (this.checkGameOver()) {
            return;
        }
        
        // 所有存活玩家依次发言
        await this.playersSpeech();
        
        // 🎙️ 解说点4：发言结束
        const recentSpeeches = this.getRecentSpeeches(alivePlayers.length);
        await this.callCommentator(
            recentSpeeches,
            `发言环节结束！每位玩家都表达了自己的观点。投票即将开始，谁会被送上审判台？`
        );

        // 投票环节
        await this.votingPhase();
    }
    
    // 玩家发言环节
    async playersSpeech() {
        const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
        
        this.appendToChat('💬 系统', '现在进入发言环节，请存活的玩家依次发言...');
        
        for (const player of alivePlayers) {
            const context = this.getGameContextForPlayer(player.id);
            const prompt = `[白天发言环节]

${context}

现在轮到你发言，请根据当前局势发表你的看法和分析。你可以：
- 分析昨晚的死亡情况
- 表明你的立场或身份（如果你愿意）
- 指出你怀疑的对象
- 为自己辩护（如果有人怀疑你）

请发言：`;
            
            try {
                const speech = await this.callPlayerAI(player.id, prompt);
                this.appendToChat(`💬 ${player.name}`, speech);
                if (window.addPublicMessage) window.addPublicMessage(`💬 ${player.name}`, speech);
                console.log(`[狼人杀] ${player.name} 发言完毕`);
                
                // 暂停一下让玩家继续
                this.paused = true;
                await this.waitForResume();
            } catch (error) {
                console.error(`[狼人杀] ${player.name} 发言失败:`, error);
                this.appendToChat('🎮 系统', `${player.name} 因技术原因未能发言`);
            }
        }
    }
    
    // 投票环节
    async votingPhase() {
        this.phase = 'vote';
        
        this.appendToChat('🗳️ 系统', '\n========== 投票环节 ==========\n\n请所有存活玩家投票，选出你认为最可疑的人...');
        
        const alivePlayers = Object.values(this.players).filter(p => p.isAlive);
        const votes = {};
        
        for (const player of alivePlayers) {
            const targets = alivePlayers.filter(p => p.id !== player.id).map(p => p.name);
            const context = this.getGameContextForPlayer(player.id);
            
            const prompt = `[投票环节]

${context}

现在请投票选出你认为最可疑的玩家。

可投票对象：${targets.join('、')}

请直接回复你要投票的玩家名字：`;
            
            try {
                const response = await this.callPlayerAI(player.id, prompt);
                const target = this.findPlayerNameInText(response, targets);
                
                if (target) {
                    player.votedFor = target;
                    votes[target] = (votes[target] || 0) + 1;
                    console.log(`[狼人杀] ${player.name} 投票给 ${target}`);
                    this.appendToChat('🗳️ 系统', `${player.name} 完成了投票`);
                }
            } catch (error) {
                console.error(`[狼人杀] ${player.name} 投票失败:`, error);
                this.appendToChat('🎮 系统', `${player.name} 未能完成投票`);
            }
        }
        
        // 统计投票结果
        if (Object.keys(votes).length > 0) {
            const voteResults = Object.entries(votes).map(([name, count]) => `${name}(${count}票)`).join('、');
            this.appendToChat('🗳️ 系统', `\n投票结果：${voteResults}`);
            if (window.addPublicMessage) window.addPublicMessage('🗳️ 系统', `投票结果：${voteResults}`);
            
            const maxVotes = Math.max(...Object.values(votes));
            const eliminated = Object.keys(votes).filter(name => votes[name] === maxVotes);
            
            if (eliminated.length === 1) {
                const eliminatedPlayer = Object.values(this.players).find(p => p.name === eliminated[0]);
                eliminatedPlayer.isAlive = false;
                
                this.appendToChat('🗳️ 系统', `\n${eliminated[0]} 被投票出局！\n身份是：${eliminatedPlayer.roleInfo.name}`);
                if (window.addPublicMessage) window.addPublicMessage('🗳️ 系统', `${eliminated[0]} 被投票出局！身份是：${eliminatedPlayer.roleInfo.name}`);
                console.log(`[狼人杀] ${eliminated[0]}(${eliminatedPlayer.roleInfo.name}) 被投票出局`);

                // 🎙️ 解说点5a：单人出局
                await this.callCommentator(
                    this.getPublicContext(),
                    `${eliminated[0]}被投票驱逐，身份是${eliminatedPlayer.roleInfo.name}！这是正确的选择吗？让我们继续观察...`
                );
            } else {
                this.appendToChat('🗳️ 系统', `\n平票！${eliminated.join('、')} 都获得了最高票数，本轮无人出局。`);
                if (window.addPublicMessage) window.addPublicMessage('🗳️ 系统', `平票！${eliminated.join('、')} 都获得了最高票数，本轮无人出局。`);

                // 🎙️ 解说点5b：平票
                await this.callCommentator(
                    this.getPublicContext(),
                    `平票！${eliminated.join('、')}都获得最高票，无人出局！这是巧合还是有人在操纵局势？`
                );
            }
        }
        
        // 检查游戏是否结束
        if (this.checkGameOver()) {
            return;
        }
        
        // 进入下一个夜晚
        this.paused = true;
        this.appendToChat('🎮 系统', '\n⏸️ 点击"继续游戏"进入下一个夜晚...');
        await this.waitForResume();
        
        await this.startNightPhase();
    }
    
    // ==================== 辅助方法 ====================

    getPublicContext() {
        // 只返回公开聊天记录，不包含秘密信息
        const context = window.SillyTavern.getContext();
        const recentChat = context.chat
            .slice(-20) // 最近20条消息
            .filter(msg => !msg.mes.includes('[秘密]')) // 过滤秘密消息
            .map(msg => `${msg.name}: ${msg.mes}`)
            .join('\n');
        
        return recentChat;
    }

    getPlayerIdByName(name) {
        for (const id in this.players) {
            if (this.players[id].name === name) {
                return id;
            }
        }
        return null;
    }

    getRecentSpeeches(count = 6) {
        const context = window.SillyTavern.getContext();
        const alivePlayerIds = new Set(Object.values(this.players).filter(p => p.isAlive).map(p => p.id));
        
        const speeches = context.chat
            .slice(-count * 2) // 넉넉하게 가져오기
            .filter(msg => {
                const playerId = this.getPlayerIdByName(msg.name);
                return playerId && alivePlayerIds.has(playerId);
            })
            .slice(-count)
            .map(msg => `${msg.name}: ${msg.mes.substring(0, 100)}...`)
            .join('\n');
        
        return speeches;
    }

    async callCommentator(context, situation) {
        // 检查是否启用解说员
        if (!this.settings.commentatorEnabled) {
            return;
        }

        try {
            console.log('[解说员] 准备生成解说...');
            
            // 构建解说员提示词
            const commentatorStyle = this.settings.commentatorStyle || `
你是狼人杀游戏的金牌解说员，风格特点：
- 激情澎湃，声情并茂
- 善于制造悬念和戏剧冲突
- 使用比喻和夸张手法
- 短促有力的句子，节奏感强
- 适当使用"哦！""天哪！""这是什么操作！"等感叹

示例风格：
"夜幕降临！狼人们在黑暗中蠢蠢欲动，今晚会有谁成为他们的目标？"
"投票结果出来了！AI-Alpha以微弱优势被送上了审判台，这是正义的裁决还是冤案？"
            `.trim();

            const prompt = `${commentatorStyle}

【当前情况】
${situation}

【公开信息】
${context}

【任务】
请用激情澎湃的语言对当前情况进行解说，控制在100字左右。

重要约束：
1. 只能根据公开信息解说
2. 不能透露玩家的真实身份
3. 不能透露夜晚的秘密行动
4. 制造悬念，不要揭晓答案
5. 不要使用"解说员说"等自我指代

直接输出解说内容即可。`;

            // 复用 callPlayerAI 的底层逻辑
            const response = await this.callPlayerAI('commentator', prompt, {
                url: this.settings.gmApiUrl,
                key: this.settings.gmApiKey,
                model: this.settings.gmModel
            });

            if (response && response.trim()) {
                this.appendToChat('🎙️ 解说员', response.trim());
                if (window.addPublicMessage) window.addPublicMessage('🎙️ 解说员', response.trim());
                console.log('[解说员] 解说完成');
            }

        } catch (error) {
            console.error('[解说员] 解说失败:', error);
        }
    }
    
    // 检查游戏是否结束
    checkGameOver() {
        const aliveWerewolves = Object.values(this.players).filter(p => p.role === 'werewolf' && p.isAlive);
        const aliveVillagers = Object.values(this.players).filter(p => p.roleInfo.team === 'villager' && p.isAlive);
        const aliveGods = aliveVillagers.filter(p => p.role !== 'villager');
        
        let winner = null;
        
        // 狼人全灭，好人获胜
        if (aliveWerewolves.length === 0) {
            winner = 'villager';
        }
        // 好人全灭或神职全灭，狼人获胜
        else if (aliveVillagers.length === 0 || aliveGods.length === 0) {
            winner = 'werewolf';
        }
        
        if (winner) {
            this.running = false;
            const winnerTeam = winner === 'werewolf' ? '狼人' : '好人';
            
            let result = `\n🎉========== 游戏结束 ==========🎉\n\n`;
            result += `获胜方：${winnerTeam}阵营\n\n`;
            result += `身份揭晓：\n`;
            
            Object.values(this.players).forEach(p => {
                const status = p.isAlive ? '✅ 存活' : '💀 阵亡';
                result += `• ${p.name}：${p.roleInfo.name} (${status})\n`;
            });
            
            this.appendToChat('🎮 系统', result);
            if (window.addPublicMessage) window.addPublicMessage('🎮 系统', `游戏结束！${winnerTeam}阵营获胜！`);
            console.log(`[狼人杀] 游戏结束，${winnerTeam}阵营获胜`);

            // 启用导出按钮
            $('#export_history').prop('disabled', false);
            
            return true;
        }
        
        return false;
    }
    
    // 获取玩家的游戏上下文
    getGameContextForPlayer(playerId) {
        const player = this.players[playerId];
        const alivePlayers = Object.values(this.players).filter(p => p.isAlive).map(p => p.name);
        const deadPlayers = Object.values(this.players).filter(p => !p.isAlive).map(p => p.name);
        
        let context = `你的身份：${player.roleInfo.name}\n`;
        context += `当前是第 ${this.dayNumber} 天\n\n`;
        context += `存活玩家：${alivePlayers.join('、')}\n`;
        
        if (deadPlayers.length > 0) {
            context += `已出局玩家：${deadPlayers.join('、')}\n`;
        }
        
        context += `\n`;
        
        return context;
    }
    
    // 在文本中查找玩家名字
    findPlayerNameInText(text, candidateNames) {
        for (const name of candidateNames) {
            if (text.includes(name)) {
                return name;
            }
        }
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
            this.resumeCallback();
        }
    }
    
    // 停止游戏
    stopGame() {
        this.running = false;
        this.paused = false;
        console.log('[狼人杀] 游戏已停止');
    }
}
