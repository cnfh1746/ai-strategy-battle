// 狼人杀规则引擎
export class WerewolfRuleEngine {
    constructor() {
        this.gameState = {
            phase: 'night',
            round: 0,
            nightActions: {},
            daySpeeches: [],
            votes: {},
            publicInfo: {
                dead: [],
                exiled: []
            },
            seerChecks: {},
            witchHealUsed: false,
            lastNightResult: ''
        };
    }
    
    async initialize(players) {
        // 分配角色（6人局标准配置）
        const roles = ['werewolf', 'werewolf', 'villager', 'villager', 'seer', 'witch'];
        const shuffled = this.shuffle(roles);
        
        players.forEach((player, index) => {
            player.role = shuffled[index];
            player.alive = true;
        });
        
        this.players = players;
        console.log('[狼人杀] 角色分配完成');
    }
    
    buildPrompt(player) {
        if (this.gameState.phase === 'night') {
            return this.buildNightPrompt(player);
        } else if (this.gameState.phase === 'day_discussion') {
            return this.buildDayDiscussionPrompt(player);
        } else if (this.gameState.phase === 'day_vote') {
            return this.buildVotePrompt(player);
        }
    }
    
    buildNightPrompt(player) {
        const alivePlayers = this.players.filter(p => p.alive).map(p => p.name);
        
        if (player.role === 'werewolf') {
            const teammates = this.players
                .filter(p => p.role === 'werewolf' && p.id !== player.id && p.alive)
                .map(p => p.name);
            
            return `【狼人杀 - 第${this.gameState.round}夜】

你是狼人，你的队友是：${teammates.join(', ') || '无（队友已死）'}
当前存活玩家：${alivePlayers.join(', ')}

请选择今晚要杀害的目标玩家（不能选择队友）。

请以JSON格式回复：
{"action": "kill", "target": "目标玩家名字", "reasoning": "简短理由"}`;
        }
        
        if (player.role === 'seer') {
            const checkedList = Object.keys(this.gameState.seerChecks).join(', ') || '无';
            return `【狼人杀 - 第${this.gameState.round}夜】

你是预言家，可以查验一名玩家的身份。
当前存活玩家：${alivePlayers.join(', ')}
你已查验过：${checkedList}

请选择要查验的玩家：
{"action": "check", "target": "目标玩家名字"}`;
        }
        
        if (player.role === 'witch') {
            const victim = this.gameState.nightActions.werewolfTarget;
            if (victim && !this.gameState.witchHealUsed) {
                return `【狼人杀 - 第${this.gameState.round}夜】

你是女巫。今晚${victim}被狼人杀害。
你有一瓶解药（仅一次机会），是否要救他？

救人：{"action": "save", "target": "${victim}"}
不救：{"action": "pass"}`;
            } else {
                return null; // 女巫已用过解药或无人被杀
            }
        }
        
        return null; // 村民夜间无行动
    }
    
    buildDayDiscussionPrompt(player) {
        const lastNight = this.gameState.lastNightResult || '昨晚平安无事';
        const speeches = this.gameState.daySpeeches
            .map(s => `${s.player}: ${s.speech}`)
            .join('\n');
        
        const roleHint = this.getRoleHint(player);
        const alivePlayers = this.players.filter(p => p.alive).map(p => p.name).join(', ');
        const deadPlayers = this.gameState.publicInfo.dead.join(', ') || '无';
        
        return `【狼人杀 - 第${this.gameState.round}天 白天讨论】

${roleHint}

【昨晚情况】
${lastNight}

【当前存活】
${alivePlayers}

【已死亡】
${deadPlayers}

【之前的发言】
${speeches || '你是第一个发言的'}

现在轮到你发言，请分析局势并表达你的看法。

请以JSON格式回复：
{"speech": "你的发言内容（100字内）", "suspicion": "你最怀疑的玩家名字"}`;
    }
    
    buildVotePrompt(player) {
        const alivePlayers = this.players.filter(p => p.alive && p.id !== player.id).map(p => p.name);
        const speeches = this.gameState.daySpeeches
            .map(s => `${s.player}: ${s.speech} (怀疑: ${s.suspicion})`)
            .join('\n');
        
        return `【狼人杀 - 第${this.gameState.round}天 投票阶段】

根据刚才的发言，请投票决定要驱逐谁。

【今天的发言回顾】
${speeches}

【可投票对象】
${alivePlayers.join(', ')}

请以JSON格式回复：
{"action": "vote", "target": "要投票的玩家名字"}`;
    }
    
    getRoleHint(player) {
        if (player.role === 'werewolf') {
            const teammates = this.players
                .filter(p => p.role === 'werewolf' && p.id !== player.id && p.alive)
                .map(p => p.name);
            return `你是狼人（秘密），队友：${teammates.join(', ') || '无'}。你需要伪装成好人。`;
        }
        if (player.role === 'seer') {
            const checks = Object.entries(this.gameState.seerChecks)
                .map(([name, identity]) => `${name}(${identity})`)
                .join(', ');
            return `你是预言家，你已查验：${checks || '无'}`;
        }
        if (player.role === 'witch') {
            return `你是女巫。解药状态：${this.gameState.witchHealUsed ? '已使用' : '未使用'}`;
        }
        return `你是村民，你需要找出狼人。`;
    }
    
    async processAction(player, action) {
        if (this.gameState.phase === 'night') {
            this.gameState.nightActions[player.id] = action;
            if (action.action === 'kill') {
                this.gameState.nightActions.werewolfTarget = action.target;
            }
        } else if (this.gameState.phase === 'day_discussion') {
            this.gameState.daySpeeches.push({
                player: player.name,
                speech: action.speech,
                suspicion: action.suspicion
            });
        } else if (this.gameState.phase === 'day_vote') {
            this.gameState.votes[player.id] = action.target;
        }
    }
    
    async resolveRound() {
        if (this.gameState.phase === 'night') {
            await this.resolveNight();
            this.gameState.phase = 'day_discussion';
        } else if (this.gameState.phase === 'day_discussion') {
            this.gameState.phase = 'day_vote';
        } else if (this.gameState.phase === 'day_vote') {
            await this.resolveVote();
            this.gameState.phase = 'night';
            this.gameState.round++;
        }
    }
    
    async resolveNight() {
        // 狼人杀人
        const werewolfTarget = this.gameState.nightActions.werewolfTarget;
        
        if (werewolfTarget) {
            // 检查女巫是否救人
            const witchSave = Object.values(this.gameState.nightActions)
                .find(a => a.action === 'save');
            
            if (!witchSave || witchSave.target !== werewolfTarget) {
                // 目标死亡
                const victim = this.players.find(p => p.name === werewolfTarget);
                if (victim) {
                    victim.alive = false;
                    this.gameState.publicInfo.dead.push(werewolfTarget);
                    this.gameState.lastNightResult = `昨晚 ${werewolfTarget} 死了`;
                }
            } else {
                this.gameState.witchHealUsed = true;
                this.gameState.lastNightResult = `昨晚平安无事`;
            }
        } else {
            this.gameState.lastNightResult = `昨晚平安无事`;
        }
        
        // 预言家查验
        const seerCheck = Object.values(this.gameState.nightActions)
            .find(a => a.action === 'check');
        
        if (seerCheck) {
            const target = this.players.find(p => p.name === seerCheck.target);
            if (target) {
                this.gameState.seerChecks[target.name] = 
                    target.role === 'werewolf' ? '狼人' : '好人';
            }
        }
        
        this.gameState.nightActions = {};
    }
    
    async resolveVote() {
        // 统计投票
        const voteCounts = {};
        Object.values(this.gameState.votes).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
        });
        
        // 找出得票最多的
        let maxVotes = 0;
        let exiled = null;
        Object.entries(voteCounts).forEach(([name, count]) => {
            if (count > maxVotes) {
                maxVotes = count;
                exiled = name;
            }
        });
        
        if (exiled) {
            const victim = this.players.find(p => p.name === exiled);
            if (victim) {
                victim.alive = false;
                this.gameState.publicInfo.exiled.push(exiled);
                this.gameState.lastNightResult = `昨天 ${exiled} 被投票驱逐`;
            }
        }
        
        this.gameState.votes = {};
        this.gameState.daySpeeches = [];
    }
    
    isGameOver() {
        const aliveWerewolves = this.players.filter(p => p.alive && p.role === 'werewolf').length;
        const aliveGood = this.players.filter(p => p.alive && p.role !== 'werewolf').length;
        
        return aliveWerewolves === 0 || aliveWerewolves >= aliveGood;
    }
    
    getWinner() {
        const aliveWerewolves = this.players.filter(p => p.alive && p.role === 'werewolf').length;
        
        if (aliveWerewolves === 0) {
            return { team: 'good', message: '好人阵营获胜！所有狼人已被驱逐！' };
        } else {
            return { team: 'wolf', message: '狼人阵营获胜！狼人数量已达到或超过好人！' };
        }
    }
    
    getRoundResult() {
        return {
            phase: this.gameState.phase,
            round: this.gameState.round,
            lastNightResult: this.gameState.lastNightResult,
            speeches: this.gameState.daySpeeches,
            alive: this.players.filter(p => p.alive).map(p => p.name)
        };
    }
    
    shuffle(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}
