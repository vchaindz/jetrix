// Jetrix Highscore Manager using JSONIC WebAssembly Database
import JSONIC from './jsonic-wrapper.js';

export class HighscoreManager {
    constructor() {
        this.db = null;
        this.playerId = null;
        this.leaderboardCache = new Map();
        this.updateCallbacks = new Set();
        this.isInitialized = false;
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            // Get or create player ID
            this.playerId = localStorage.getItem('playerId');
            if (!this.playerId) {
                this.playerId = this.generatePlayerId();
                localStorage.setItem('playerId', this.playerId);
            }
            
            // Configure JSONIC for Jetrix
            JSONIC.configure({
                debug: false,
                enablePersistence: true,
                persistenceKey: 'jetrix_highscores'
            });
            
            // Initialize JSONIC database
            this.db = await JSONIC.createDatabase();
            
            console.log('✅ JSONIC highscore database initialized successfully');
            
            // Load initial leaderboard
            await this.loadMiniLeaderboard();
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('❌ Failed to initialize JSONIC database:', error);
            console.log('📦 Falling back to localStorage...');
            
            // Fallback to localStorage if JSONIC fails
            this.useFallbackStorage();
            await this.loadMiniLeaderboard();
            this.isInitialized = true;
        }
    }
    
    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }
    
    async submitScore(scoreData) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        const result = {
            isHighscore: false,
            rank: null,
            personalBest: null
        };
        
        try {
            if (!this.db) {
                return this.submitScoreFallback(scoreData);
            }
            
            // Check personal best for this game mode
            const personalBest = await this.getPersonalBest(scoreData.gameMode);
            result.personalBest = personalBest?.score || 0;
            
            // Only save if it's a new personal best or first score
            if (!personalBest || scoreData.score > personalBest.score) {
                // Create highscore entry
                const highscoreEntry = {
                    playerId: this.playerId,
                    playerName: scoreData.playerName || 'Anonymous',
                    score: scoreData.score,
                    level: scoreData.level,
                    lines: scoreData.lines,
                    gameMode: scoreData.gameMode,
                    timestamp: Date.now(),
                    metadata: scoreData.metadata || {}
                };
                
                // Insert into JSONIC database
                await this.db.insertScore(highscoreEntry);
                
                // Get current rank
                result.rank = await this.getRank(scoreData.score, scoreData.gameMode);
                result.isHighscore = true;
                
                // Clear cache and update displays
                this.leaderboardCache.clear();
                await this.loadMiniLeaderboard();
                this.notifySubscribers();
                
                console.log(`🏆 New highscore saved: ${scoreData.score} (Rank #${result.rank})`);
            }
            
        } catch (error) {
            console.error('Failed to submit score to JSONIC:', error);
            return this.submitScoreFallback(scoreData);
        }
        
        return result;
    }
    
    async getPersonalBest(gameMode) {
        if (!this.db) return this.getPersonalBestFallback(gameMode);
        
        try {
            const scores = await this.db.findScores({
                playerId: this.playerId,
                gameMode: gameMode
            }, {
                sort: { score: -1 },
                limit: 1
            });
            
            return scores[0] || null;
        } catch (error) {
            console.error('Failed to get personal best:', error);
            return this.getPersonalBestFallback(gameMode);
        }
    }
    
    async getRank(score, gameMode) {
        if (!this.db) {
            const scores = this.getLocalScores();
            const filtered = scores.filter(s => s.gameMode === gameMode && s.score > score);
            return filtered.length + 1;
        }
        
        try {
            const higherScores = await this.db.countScores({
                gameMode: gameMode,
                score: { $gt: score }
            });
            
            return higherScores + 1;
        } catch (error) {
            console.error('Failed to get rank:', error);
            return 999;
        }
    }
    
    async getLeaderboard(gameMode = 'normal', timeRange = 'all', limit = 100) {
        const cacheKey = `${gameMode}-${timeRange}-${limit}`;
        
        // Check cache
        if (this.leaderboardCache.has(cacheKey)) {
            const cached = this.leaderboardCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 30000) { // 30 second cache
                return cached.data;
            }
        }
        
        if (!this.db) return this.getLeaderboardFallback(gameMode, timeRange, limit);
        
        try {
            // Build query filter
            const filter = { gameMode: gameMode };
            if (timeRange !== 'all') {
                filter.timestamp = { $gte: this.getTimeCutoff(timeRange) };
            }
            
            console.log('🔍 Getting leaderboard with filter:', filter);
            
            // Get scores from JSONIC
            const scores = await this.db.findScores(filter, {
                sort: { score: -1 },
                limit: limit
            });
            
            console.log('📊 Found scores:', scores);
            
            // Format as leaderboard entries
            const leaderboard = scores.map((score, index) => ({
                rank: index + 1,
                playerId: score.playerId,
                playerName: score.playerName,
                score: score.score,
                level: score.level,
                lines: score.lines,
                timestamp: score.timestamp,
                isCurrentPlayer: score.playerId === this.playerId
            }));
            
            // Cache result
            this.leaderboardCache.set(cacheKey, {
                data: leaderboard,
                timestamp: Date.now()
            });
            
            return leaderboard;
            
        } catch (error) {
            console.error('Failed to get leaderboard from JSONIC:', error);
            return this.getLeaderboardFallback(gameMode, timeRange, limit);
        }
    }
    
    getTimeCutoff(timeRange) {
        const now = Date.now();
        switch (timeRange) {
            case 'daily':
                return now - 24 * 60 * 60 * 1000;
            case 'weekly':
                return now - 7 * 24 * 60 * 60 * 1000;
            case 'monthly':
                return now - 30 * 24 * 60 * 60 * 1000;
            default:
                return 0;
        }
    }
    
    async loadMiniLeaderboard() {
        try {
            const scores = await this.getLeaderboard('normal', 'all', 5);
            this.updateMiniLeaderboard(scores);
        } catch (error) {
            console.error('Failed to load mini leaderboard:', error);
            this.updateMiniLeaderboard([]);
        }
    }
    
    updateMiniLeaderboard(scores) {
        const container = document.getElementById('miniLeaderboard');
        if (!container) return;
        
        if (scores.length === 0) {
            container.innerHTML = '<div class="no-scores">No scores yet</div>';
            return;
        }
        
        container.innerHTML = scores.map(entry => `
            <div class="mini-score-entry ${entry.isCurrentPlayer ? 'current-player' : ''}">
                <span class="rank">#${entry.rank}</span>
                <span class="name">${this.truncateName(entry.playerName, 10)}</span>
                <span class="score">${entry.score.toLocaleString()}</span>
            </div>
        `).join('');
    }
    
    async displayLeaderboard() {
        const content = document.getElementById('leaderboardContent');
        if (!content) return;
        
        // Set up tab handlers
        this.setupLeaderboardTabs();
        
        // Load default leaderboard
        await this.loadLeaderboardContent('normal', 'all');
    }
    
    setupLeaderboardTabs() {
        // Time range tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const range = e.target.dataset.range;
                const mode = document.querySelector('.mode-btn.active')?.dataset.mode || 'normal';
                await this.loadLeaderboardContent(mode, range);
            });
        });
        
        // Game mode tabs
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const mode = e.target.dataset.mode;
                const range = document.querySelector('.tab-btn.active')?.dataset.range || 'all';
                await this.loadLeaderboardContent(mode, range);
            });
        });
    }
    
    async loadLeaderboardContent(gameMode, timeRange) {
        const content = document.getElementById('leaderboardContent');
        if (!content) return;
        
        content.innerHTML = '<div class="loading">Loading scores...</div>';
        
        try {
            const scores = await this.getLeaderboard(gameMode, timeRange, 50);
            
            if (scores.length === 0) {
                content.innerHTML = '<div class="no-scores">No scores recorded yet. Be the first!</div>';
                return;
            }
            
            content.innerHTML = `
                <div class="leaderboard-table">
                    <div class="leaderboard-header">
                        <span class="col-rank">RANK</span>
                        <span class="col-name">PLAYER</span>
                        <span class="col-score">SCORE</span>
                        <span class="col-level">LEVEL</span>
                        <span class="col-lines">LINES</span>
                        <span class="col-date">DATE</span>
                    </div>
                    <div class="leaderboard-entries">
                        ${scores.map(entry => this.renderLeaderboardEntry(entry)).join('')}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load leaderboard content:', error);
            content.innerHTML = '<div class="no-scores">Failed to load leaderboard. Please try again.</div>';
        }
    }
    
    renderLeaderboardEntry(entry) {
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
        });
        
        return `
            <div class="leaderboard-entry ${entry.isCurrentPlayer ? 'current-player' : ''}">
                <span class="col-rank">
                    ${entry.rank <= 3 ? this.getRankMedal(entry.rank) : ''}
                    #${entry.rank}
                </span>
                <span class="col-name">${this.truncateName(entry.playerName, 15)}</span>
                <span class="col-score">${entry.score.toLocaleString()}</span>
                <span class="col-level">${entry.level}</span>
                <span class="col-lines">${entry.lines}</span>
                <span class="col-date">${dateStr}</span>
            </div>
        `;
    }
    
    getRankMedal(rank) {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return '';
        }
    }
    
    truncateName(name, maxLength) {
        if (name.length <= maxLength) return name;
        return name.substr(0, maxLength - 3) + '...';
    }
    
    subscribe(callback) {
        this.updateCallbacks.add(callback);
        return () => this.updateCallbacks.delete(callback);
    }
    
    notifySubscribers() {
        this.updateCallbacks.forEach(cb => cb());
    }
    
    async getStats() {
        if (!this.db) {
            const scores = this.getLocalScores();
            return {
                totalScores: scores.length,
                uniquePlayers: new Set(scores.map(s => s.playerId)).size,
                highestScore: Math.max(...scores.map(s => s.score), 0)
            };
        }
        
        try {
            return await this.db.getStats();
        } catch (error) {
            console.error('Failed to get stats:', error);
            return { totalScores: 0, uniquePlayers: 0, highestScore: 0 };
        }
    }
    
    // Fallback methods using localStorage (unchanged from before)
    useFallbackStorage() {
        console.log('📦 Using localStorage fallback for highscores');
        this.db = null;
    }
    
    submitScoreFallback(scoreData) {
        const scores = this.getLocalScores();
        
        // Add new score
        scores.push({
            ...scoreData,
            playerId: this.playerId,
            timestamp: Date.now()
        });
        
        // Sort and keep top 100
        scores.sort((a, b) => b.score - a.score);
        scores.splice(100);
        
        localStorage.setItem('jetrix_scores', JSON.stringify(scores));
        
        // Find rank
        const rank = scores.findIndex(s => 
            s.playerId === this.playerId && 
            s.score === scoreData.score
        ) + 1;
        
        return {
            isHighscore: rank <= 100,
            rank: rank,
            personalBest: this.getPersonalBestFallback(scoreData.gameMode)?.score || 0
        };
    }
    
    getPersonalBestFallback(gameMode) {
        const scores = this.getLocalScores();
        const playerScores = scores.filter(s => 
            s.playerId === this.playerId && 
            s.gameMode === gameMode
        );
        
        if (playerScores.length === 0) return null;
        
        return playerScores.reduce((best, score) => 
            score.score > best.score ? score : best
        );
    }
    
    getLeaderboardFallback(gameMode, timeRange, limit) {
        const scores = this.getLocalScores();
        const cutoff = this.getTimeCutoff(timeRange);
        
        const filtered = scores.filter(s => 
            s.gameMode === gameMode && 
            s.timestamp >= cutoff
        );
        
        return filtered.slice(0, limit).map((score, index) => ({
            rank: index + 1,
            playerId: score.playerId,
            playerName: score.playerName || 'Anonymous',
            score: score.score,
            level: score.level || 1,
            lines: score.lines || 0,
            timestamp: score.timestamp,
            isCurrentPlayer: score.playerId === this.playerId
        }));
    }
    
    getLocalScores() {
        try {
            const stored = localStorage.getItem('jetrix_scores');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }
}