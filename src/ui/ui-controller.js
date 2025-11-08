// UI控制器
export class UIController {
    constructor(containerSelector) {
        this.$container = $(containerSelector);
        this.logEntries = [];
    }
    
    displayGameStart(players, gameType) {
        const html = `
            <div class="game-container">
                <div class="game-header">
                    <h2>游戏类型: ${this.getGameTypeName(gameType)}</h2>
                    <div id="game-status">游戏进行中...</div>
                </div>
                <div class="players-panel" id="players-panel"></div>
                <div class="game-log" id="game-log"></div>
                <div class="game-controls">
                    <button id="next_step" style="display:none;">下一步</button>
                </div>
            </div>
        `;
        this.$container.html(html);
        
        this.updatePlayersPanel(players);
        this.addLog('游戏开始！', 'round-start');
    }
    
    getGameTypeName(type) {
        const names = {
            'werewolf': '狼人杀',
            'resource-battle': '资源争夺',
            'custom': '自定义游戏'
        };
        return names[type] || type;
    }
    
    updatePlayersPanel(players) {
        const html = players.map(p => `
            <div class="player-card ${p.alive ? 'alive' : 'dead'}">
                <div class="player-name">${p.name}</div>
                <div class="player-status">${p.alive ? '存活' : '死亡'}</div>
            </div>
        `).join('');
        
        $('#players-panel').html(html);
    }
    
    displayRoundStart(round) {
        this.addLog(`\n========== 第 ${round} 回合 ==========`, 'round-start');
    }
    
    displayPlayerThinking(player) {
        this.addLog(`${player.name} 正在思考...`, 'thinking');
    }
    
    displayPlayerAction(player, action) {
        let text = `${player.name}: `;
        
        if (action.action === 'kill') {
            text += `选择杀害 ${action.target}`;
        } else if (action.action === 'check') {
            text += `查验 ${action.target}`;
        } else if (action.action === 'save') {
            text += `使用解药救 ${action.target}`;
        } else if (action.action === 'vote') {
            text += `投票给 ${action.target}`;
        } else if (action.speech) {
            text += `发言: ${action.speech}`;
            if (action.suspicion) {
                text += ` (怀疑: ${action.suspicion})`;
            }
        } else if (action.action === 'pass') {
            text += `不采取行动`;
        } else {
            text += JSON.stringify(action);
        }
        
        this.addLog(text, 'action');
    }
    
    displayRoundResult(result) {
        if (result.lastNightResult) {
            this.addLog(`【结算】${result.lastNightResult}`, 'result');
        }
        
        if (result.speeches && result.speeches.length > 0) {
            this.addLog('--- 发言总结 ---', 'result');
            result.speeches.forEach(s => {
                this.addLog(`${s.player}: ${s.speech}`, 'result');
            });
        }
    }
    
    displayGameEnd(winner) {
        this.addLog(`\n========== 游戏结束 ==========`, 'game-end');
        this.addLog(winner.message || `获胜者: ${winner.name || winner.team}`, 'game-end');
        $('#game-status').text('游戏已结束');
    }
    
    displayTournamentRound(round, players) {
        this.addLog(`\n╔═══════════════════════════╗`, 'tournament');
        this.addLog(`║   淘汰赛 - 第 ${round} 轮   ║`, 'tournament');
        this.addLog(`╚═══════════════════════════╝`, 'tournament');
        this.addLog(`参赛选手: ${players.map(p => p.name).join(', ')}`, 'tournament');
    }
    
    displayMatchStart(match) {
        this.addLog(`\n--- 对战: ${match.player1.name} VS ${match.player2.name} ---`, 'match');
    }
    
    displayMatchEnd(match, winner) {
        this.addLog(`✓ ${winner.name} 获胜！`, 'match-result');
    }
    
    displayChampion(champion) {
        this.addLog(`\n★★★★★★★★★★★★★★★★★★★★`, 'champion');
        this.addLog(`🏆 冠军: ${champion.name} 🏆`, 'champion');
        this.addLog(`★★★★★★★★★★★★★★★★★★★★`, 'champion');
    }
    
    showNextButton(show) {
        if (show) {
            $('#next_step').show();
        } else {
            $('#next_step').hide();
        }
    }
    
    addLog(text, className = '') {
        const $log = $('#game-log');
        const $entry = $('<div>')
            .addClass('log-entry')
            .addClass(className)
            .text(text);
        
        $log.append($entry);
        $log.scrollTop($log[0].scrollHeight);
        
        this.logEntries.push({ text, className, time: new Date() });
    }
}
