// UI控制器
export class UIController {
    constructor(containerSelector) {
        this.$container = $(containerSelector);
        this.logEntries = [];
        this.isExpanded = false;
        this.gameState = {
            status: 'waiting',
            round: 0,
            phase: '',
            currentPlayer: '',
            lastAction: ''
        };
    }
    
    displayGameStart(players, gameType) {
        const html = `
            <div class="game-container" id="game-container">
                <div class="game-header">
                    <h2>游戏类型: ${this.getGameTypeName(gameType)}</h2>
                    <div class="header-controls">
                        <button id="toggle-size" class="icon-btn" title="展开/收起">
                            <span class="expand-icon">⛶</span>
                        </button>
                        <div id="game-status" class="status-indicator">
                            <span class="status-dot running"></span>
                            <span class="status-text">游戏进行中</span>
                        </div>
                    </div>
                </div>
                
                <div class="game-content">
                    <!-- 实时监控面板 -->
                    <div class="monitor-panel" id="monitor-panel">
                        <div class="monitor-section">
                            <h3>📊 游戏状态</h3>
                            <div class="monitor-item">
                                <span class="label">回合:</span>
                                <span class="value" id="monitor-round">0</span>
                            </div>
                            <div class="monitor-item">
                                <span class="label">阶段:</span>
                                <span class="value" id="monitor-phase">准备中</span>
                            </div>
                            <div class="monitor-item">
                                <span class="label">当前行动:</span>
                                <span class="value" id="monitor-current">-</span>
                            </div>
                        </div>
                        
                        <div class="monitor-section">
                            <h3>👥 玩家状态</h3>
                            <div id="monitor-players"></div>
                        </div>
                        
                        <div class="monitor-section">
                            <h3>⚡ 最近动作</h3>
                            <div id="monitor-actions" class="recent-actions"></div>
                        </div>
                    </div>
                    
                    <div class="main-panel">
                        <div class="players-panel" id="players-panel"></div>
                        <div class="game-log" id="game-log"></div>
                    </div>
                </div>
                
                <div class="game-controls">
                    <button id="next_step" style="display:none;">下一步</button>
                </div>
                
                <!-- 调整大小的手柄 -->
                <div class="resize-handle resize-right"></div>
                <div class="resize-handle resize-bottom"></div>
                <div class="resize-handle resize-corner"></div>
            </div>
        `;
        this.$container.html(html);
        
        this.updatePlayersPanel(players);
        this.initializeMonitor(players);
        this.setupResizable();
        this.setupToggleSize();
        this.addLog('游戏开始！', 'round-start');
        
        // 更新游戏状态
        this.updateGameState({
            status: 'running',
            round: 1,
            phase: '游戏开始'
        });
    }
    
    initializeMonitor(players) {
        this.updateMonitorPlayers(players);
        this.recentActions = [];
    }
    
    setupToggleSize() {
        $('#toggle-size').on('click', () => {
            this.isExpanded = !this.isExpanded;
            const $container = $('#game-container');
            
            if (this.isExpanded) {
                $container.addClass('expanded');
                $('.expand-icon').text('⛶');
            } else {
                $container.removeClass('expanded');
                $('.expand-icon').text('⛶');
            }
        });
    }
    
    setupResizable() {
        const $container = $('#game-container');
        let isResizing = false;
        let resizeType = null;
        let startX, startY, startWidth, startHeight;
        
        $('.resize-handle').on('mousedown', function(e) {
            isResizing = true;
            resizeType = $(this).hasClass('resize-right') ? 'right' : 
                        $(this).hasClass('resize-bottom') ? 'bottom' : 'corner';
            
            startX = e.clientX;
            startY = e.clientY;
            startWidth = $container.width();
            startHeight = $container.height();
            
            e.preventDefault();
        });
        
        $(document).on('mousemove', function(e) {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            if (resizeType === 'right' || resizeType === 'corner') {
                const newWidth = Math.max(400, Math.min(1200, startWidth + deltaX));
                $container.css('width', newWidth + 'px');
            }
            
            if (resizeType === 'bottom' || resizeType === 'corner') {
                const newHeight = Math.max(300, Math.min(800, startHeight + deltaY));
                $container.css('height', newHeight + 'px');
            }
        });
        
        $(document).on('mouseup', function() {
            isResizing = false;
            resizeType = null;
        });
    }
    
    updateGameState(newState) {
        Object.assign(this.gameState, newState);
        
        if (newState.round !== undefined) {
            $('#monitor-round').text(newState.round);
        }
        if (newState.phase !== undefined) {
            $('#monitor-phase').text(newState.phase);
        }
        if (newState.currentPlayer !== undefined) {
            $('#monitor-current').text(newState.currentPlayer || '-');
        }
        if (newState.status !== undefined) {
            const $dot = $('.status-dot');
            $dot.removeClass('running paused ended');
            $dot.addClass(newState.status);
            
            const statusText = {
                'running': '游戏进行中',
                'paused': '已暂停',
                'ended': '已结束',
                'waiting': '等待中'
            };
            $('.status-text').text(statusText[newState.status] || newState.status);
        }
    }
    
    updateMonitorPlayers(players) {
        const html = players.map(p => `
            <div class="monitor-player ${p.alive ? 'alive' : 'dead'}">
                <span class="player-icon">${p.alive ? '🟢' : '🔴'}</span>
                <span class="player-name">${p.name}</span>
                ${p.role ? `<span class="player-role">(${p.role})</span>` : ''}
            </div>
        `).join('');
        $('#monitor-players').html(html);
    }
    
    addRecentAction(action) {
        this.recentActions.unshift(action);
        if (this.recentActions.length > 5) {
            this.recentActions.pop();
        }
        
        const html = this.recentActions.map((a, i) => `
            <div class="action-item ${i === 0 ? 'latest' : ''}">
                <span class="action-time">${this.formatTime(a.time)}</span>
                <span class="action-text">${a.text}</span>
            </div>
        `).join('');
        $('#monitor-actions').html(html);
    }
    
    formatTime(date) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        const s = String(date.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
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
        this.updateGameState({ round, phase: '回合开始' });
        this.addRecentAction({
            text: `第 ${round} 回合开始`,
            time: new Date()
        });
    }
    
    displayPlayerThinking(player) {
        this.addLog(`${player.name} 正在思考...`, 'thinking');
        this.updateGameState({ currentPlayer: player.name, phase: '思考中' });
    }
    
    displayPlayerAction(player, action) {
        let text = `${player.name}: `;
        let actionText = '';
        
        if (action.action === 'kill') {
            actionText = `选择杀害 ${action.target}`;
        } else if (action.action === 'check') {
            actionText = `查验 ${action.target}`;
        } else if (action.action === 'save') {
            actionText = `使用解药救 ${action.target}`;
        } else if (action.action === 'vote') {
            actionText = `投票给 ${action.target}`;
        } else if (action.speech) {
            actionText = `发言: ${action.speech}`;
            if (action.suspicion) {
                actionText += ` (怀疑: ${action.suspicion})`;
            }
        } else if (action.action === 'pass') {
            actionText = `不采取行动`;
        } else {
            actionText = JSON.stringify(action);
        }
        
        text += actionText;
        this.addLog(text, 'action');
        
        // 更新监控面板
        this.updateGameState({ currentPlayer: player.name });
        this.addRecentAction({
            text: `${player.name}: ${actionText}`,
            time: new Date()
        });
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
        
        this.updateGameState({ 
            status: 'ended', 
            phase: '游戏结束',
            currentPlayer: ''
        });
        
        this.addRecentAction({
            text: `游戏结束 - ${winner.name || winner.team} 获胜`,
            time: new Date()
        });
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
