// Jetrix Highscore Manager using JSONIC WebAssembly Database with Server Sync
import JSONIC from './jsonic-wrapper.js';
import JSONICServerClient from './jsonic-server.js';
import FingerprintManager from './fingerprint-manager.js';

export class HighscoreManager {
    constructor() {
        this.db = null;
        this.serverClient = null;
        this.playerId = null;
        this.fingerprintManager = new FingerprintManager();
        this.leaderboardCache = new Map();
        this.updateCallbacks = new Set();
        this.isInitialized = false;
        this.serverEnabled = true; // Enable server sync by default
    }

    async initialize() {
        if (this.isInitialized) return;

        console.log('🎮 Starting Highscore System Initialization...');
        console.log('📱 User Agent:', navigator.userAgent);
        console.log('📱 Platform:', navigator.platform);
        console.log('📱 Mobile Device:', /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent));
        console.log('📄 DOM Ready State:', document.readyState);

        try {
            // Initialize browser fingerprint for stable user identification
            const browserId = await this.fingerprintManager.initialize();

            // Use fingerprint as player ID for consistent cross-session identification
            this.playerId = browserId || this.generatePlayerId();

            // Store playerId for backward compatibility
            localStorage.setItem('playerId', this.playerId);

            console.log('✅ Player ID initialized:', this.playerId.substring(0, 12) + '...');
            
            // Configure JSONIC for local storage
            JSONIC.configure({
                debug: false,
                enablePersistence: true,
                persistenceKey: 'jetrix_highscores'
            });
            
            // Initialize local JSONIC database
            this.db = await JSONIC.createDatabase();
            
            console.log('✅ JSONIC local database initialized successfully');
            
            // Initialize server connection
            if (this.serverEnabled) {
                try {
                    this.serverClient = new JSONICServerClient('https://jsonic1.immudb.io');
                    await this.serverClient.connect();
                    console.log('✅ Connected to JSONIC server for global leaderboard');
                    
                    // Listen for real-time updates
                    window.addEventListener('jsonic-leaderboard-update', (event) => {
                        this.handleServerUpdate(event.detail);
                    });
                    
                    // Only sync existing scores if this is the first time connecting
                    // or if explicitly requested (not on every page refresh)
                    const hasInitialSyncKey = 'jetrix_initial_sync_done';
                    const hasInitialSync = localStorage.getItem(hasInitialSyncKey);
                    
                    if (!hasInitialSync) {
                        console.log('🚀 First time connection - syncing existing scores...');
                        await this.syncExistingScoresToServer();
                        localStorage.setItem(hasInitialSyncKey, 'true');
                    } else {
                        console.log('✅ Initial sync already done - skipping auto-sync on refresh');
                    }
                } catch (serverError) {
                    console.warn('⚠️ Could not connect to JSONIC server, using local storage only:', serverError);
                    this.serverClient = null;
                }
            }
            
            // Load initial leaderboard
            console.log('📊 Loading initial mini leaderboard...');
            await this.loadMiniLeaderboard();
            
            this.isInitialized = true;
            console.log('✅ Highscore system initialization complete');
            
        } catch (error) {
            console.error('❌ Failed to initialize JSONIC database:', error);
            console.log('📦 Falling back to localStorage...');
            
            // Fallback to localStorage if JSONIC fails
            this.useFallbackStorage();
            console.log('📊 Loading mini leaderboard with fallback...');
            await this.loadMiniLeaderboard();
            this.isInitialized = true;
            console.log('✅ Highscore system initialized with fallback storage');
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
            personalBest: null,
            globalRank: null
        };

        try {
            if (!this.db) {
                return this.submitScoreFallback(scoreData);
            }

            // Check personal best for this game mode
            const personalBest = await this.getPersonalBest(scoreData.gameMode);
            result.personalBest = personalBest?.score || 0;

            // Get browser fingerprint for consistent identification
            const browserId = this.fingerprintManager.getBrowserId();

            // Create highscore entry
            const highscoreEntry = {
                playerId: this.playerId,
                browserId: browserId, // Add browser ID for fingerprinting
                playerName: scoreData.playerName || 'Anonymous',
                score: scoreData.score,
                level: scoreData.level,
                lines: scoreData.lines,
                gameMode: scoreData.gameMode,
                timestamp: Date.now(),
                metadata: scoreData.metadata || {}
            };

            // Generate content fingerprint to detect duplicate submissions
            const contentFingerprint = await this.fingerprintManager.generateContentFingerprint({
                playerId: this.playerId,
                score: scoreData.score,
                level: scoreData.level,
                lines: scoreData.lines,
                gameMode: scoreData.gameMode
            });

            if (contentFingerprint) {
                highscoreEntry._fingerprint = contentFingerprint;
            }
            
            // Always submit to server if connected (for global leaderboard)
            if (this.serverClient) {
                try {
                    await this.serverClient.submitScore(highscoreEntry);
                    console.log('🌐 Score synced to global leaderboard');
                    
                    // Track this score as synced to prevent duplicate uploads
                    const syncedScoresKey = 'jetrix_synced_score_ids';
                    const syncedScoreIds = JSON.parse(localStorage.getItem(syncedScoresKey) || '[]');
                    const scoreId = `${highscoreEntry.playerId}_${highscoreEntry.score}_${highscoreEntry.timestamp}`;
                    
                    if (!syncedScoreIds.includes(scoreId)) {
                        syncedScoreIds.push(scoreId);
                        localStorage.setItem(syncedScoresKey, JSON.stringify(syncedScoreIds));
                        console.log('✅ Score marked as synced to prevent duplicate uploads');
                    }
                    
                    // Get global rank
                    const globalLeaderboard = await this.serverClient.getLeaderboard(scoreData.gameMode, { limit: 1000 });
                    result.globalRank = globalLeaderboard.findIndex(s => s.score < scoreData.score) + 1;
                    if (result.globalRank === 0) result.globalRank = globalLeaderboard.length + 1;
                } catch (serverError) {
                    console.warn('⚠️ Could not sync score to server:', serverError);
                }
            }
            
            // Save to local database if it's a new personal best or first score
            if (!personalBest || scoreData.score > personalBest.score) {
                // Insert into local JSONIC database
                await this.db.insertScore(highscoreEntry);
                
                // Get local rank
                result.rank = await this.getRank(scoreData.score, scoreData.gameMode);
                result.isHighscore = true;
                
                console.log(`🏆 New personal best saved: ${scoreData.score} (Local Rank #${result.rank}, Global Rank #${result.globalRank || 'N/A'})`);
            } else {
                console.log(`📊 Score submitted to global leaderboard: ${scoreData.score} (Global Rank #${result.globalRank || 'N/A'})`);
            }
            
            // Always clear cache and update displays to show new global scores
            this.leaderboardCache.clear();
            await this.loadMiniLeaderboard();
            this.notifySubscribers();
            
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
    
    async getLeaderboard(gameMode = 'normal', timeRange = 'all', limit = 100, source = 'global') {
        console.log('🎯 getLeaderboard() called:', { gameMode, timeRange, limit, source });
        const cacheKey = `${source}-${gameMode}-${timeRange}-${limit}`;
        
        // Check cache
        if (this.leaderboardCache.has(cacheKey)) {
            const cached = this.leaderboardCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 30000) { // 30 second cache
                console.log('📦 Returning cached leaderboard data');
                return cached.data;
            }
        }
        
        let leaderboard = [];
        
        // Try to get global leaderboard from server
        console.log('📡 Server client:', this.serverClient ? 'exists' : 'null');
        console.log('📡 Requesting source:', source);
        
        if (source === 'global' && this.serverClient) {
            try {
                console.log('📡 Fetching from JSONIC server...');
                const serverScores = await this.serverClient.getLeaderboard(gameMode, { limit, timeRange });
                console.log('📊 Server returned', serverScores.length, 'scores');
                console.log('📊 Raw server response:', JSON.stringify(serverScores, null, 2));
                
                // Format server scores
                leaderboard = serverScores.map((score, index) => ({
                    rank: index + 1,
                    playerId: score.playerId,
                    playerName: score.playerName,
                    score: score.score,
                    level: score.level,
                    lines: score.lines,
                    timestamp: score.timestamp,
                    isCurrentPlayer: score.playerId === this.playerId,
                    source: 'global'
                }));
                
                console.log(`🌐 Loaded ${leaderboard.length} scores from global leaderboard`);
            } catch (serverError) {
                console.warn('⚠️ Could not load global leaderboard:', serverError);
                source = 'local'; // Fall back to local
            }
        }
        
        // Get local leaderboard
        if (source === 'local' || leaderboard.length === 0) {
            if (!this.db) return this.getLeaderboardFallback(gameMode, timeRange, limit);
            
            try {
                // Build query filter
                const filter = { gameMode: gameMode };
                if (timeRange !== 'all') {
                    filter.timestamp = { $gte: this.getTimeCutoff(timeRange) };
                }
                
                // Get scores from local JSONIC
                const scores = await this.db.findScores(filter, {
                    sort: { score: -1 },
                    limit: limit
                });
                
                // Format as leaderboard entries
                leaderboard = scores.map((score, index) => ({
                    rank: index + 1,
                    playerId: score.playerId,
                    playerName: score.playerName,
                    score: score.score,
                    level: score.level,
                    lines: score.lines,
                    timestamp: score.timestamp,
                    isCurrentPlayer: score.playerId === this.playerId,
                    source: 'local'
                }));
                
                console.log(`📱 Loaded ${leaderboard.length} scores from local leaderboard`);
            } catch (error) {
                console.error('Failed to get leaderboard from JSONIC:', error);
                return this.getLeaderboardFallback(gameMode, timeRange, limit);
            }
        }
        
        // Cache result
        this.leaderboardCache.set(cacheKey, {
            data: leaderboard,
            timestamp: Date.now()
        });
        
        return leaderboard;
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
        console.log('🔄 loadMiniLeaderboard() called');
        console.log('📱 DOM ready state:', document.readyState);
        console.log('📱 miniLeaderboard element exists:', !!document.getElementById('miniLeaderboard'));
        
        try {
            // Try to load global leaderboard first, fall back to local
            console.log('📡 Attempting to fetch global leaderboard...');
            const scores = await this.getLeaderboard('normal', 'all', 5, 'global');
            console.log('📊 Global scores received:', scores.length, 'entries');
            console.log('📊 Score data:', JSON.stringify(scores, null, 2));
            this.updateMiniLeaderboard(scores);
        } catch (error) {
            console.error('❌ Failed to load mini leaderboard:', error.message);
            // Try local as fallback
            try {
                console.log('📁 Trying local leaderboard fallback...');
                const localScores = await this.getLeaderboard('normal', 'all', 5, 'local');
                console.log('📊 Local scores received:', localScores.length, 'entries');
                console.log('📊 Local data:', JSON.stringify(localScores, null, 2));
                this.updateMiniLeaderboard(localScores);
            } catch (localError) {
                console.error('❌ Failed to load local mini leaderboard:', localError.message);
                console.log('📊 Displaying empty leaderboard');
                this.updateMiniLeaderboard([]);
            }
        }
    }
    
    updateMiniLeaderboard(scores) {
        console.log('🖥️ updateMiniLeaderboard() called with', scores?.length || 0, 'scores');

        const performUpdate = () => {
            const container = document.getElementById('miniLeaderboard');
            if (!container) {
                console.error('❌ miniLeaderboard container not found. Element may be missing from HTML or not yet rendered.');
                return;
            }

            console.log('✅ Container found. Rendering scores.');
            if (!scores || scores.length === 0) {
                container.innerHTML = '<div class="no-scores">No scores yet</div>';
                return;
            }

            const html = scores.map((entry) => `
                <div class="mini-score-entry ${entry.isCurrentPlayer ? 'current-player' : ''}">
                    <span class="rank">#${entry.rank}</span>
                    <span class="name">${this.truncateName(entry.playerName, 10)}</span>
                    <span class="score">${entry.score.toLocaleString()}</span>
                </div>
            `).join('');

            container.innerHTML = html;
            console.log('✅ Leaderboard updated.');
        };

        // Defer update until the DOM is fully loaded and parsed.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', performUpdate);
        } else {
            // If DOM is already interactive or complete, execute immediately.
            performUpdate();
        }
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
        
        // Default to global source for cross-device highscores
        // If source buttons exist, check which is active, otherwise use global
        const sourceBtn = document.querySelector('.source-btn.active');
        const source = sourceBtn ? sourceBtn.dataset.source : 'global';
        
        try {
            const scores = await this.getLeaderboard(gameMode, timeRange, 50, source);
            
            if (scores.length === 0) {
                content.innerHTML = `<div class="no-scores">No ${source} scores recorded yet. Be the first!</div>`;
                return;
            }
            
            // Add source indicator
            const sourceIndicator = source === 'global' ? '🌐 Global' : '📱 Local';
            
            content.innerHTML = `
                <div class="leaderboard-source">${sourceIndicator} Leaderboard</div>
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
    
    handleServerUpdate(data) {
        // Clear cache when server data updates
        this.leaderboardCache.clear();
        
        // Reload mini leaderboard if it's a new high score
        if (data.score && data.gameMode === 'normal') {
            this.loadMiniLeaderboard();
        }
        
        // Notify subscribers of update
        this.notifySubscribers();
        
        console.log('📡 Received leaderboard update from server:', data);
    }
    
    async syncWithServer() {
        if (!this.serverClient) return;
        
        try {
            // Get all local scores
            const localScores = await this.db.getAllScores();
            
            // Submit each score to server (server will handle duplicates)
            for (const score of localScores) {
                try {
                    await this.serverClient.submitScore(score);
                } catch (error) {
                    console.warn('Failed to sync score:', score, error);
                }
            }
            
            console.log(`✅ Synced ${localScores.length} local scores to server`);
        } catch (error) {
            console.error('Failed to sync with server:', error);
        }
    }
    
    async syncExistingScoresToServer() {
        if (!this.serverClient) return;
        
        try {
            console.log('🔄 Checking for existing local scores to sync...');
            
            // Check if we've already synced scores this session
            const lastSyncKey = 'jetrix_last_sync_timestamp';
            const syncedScoresKey = 'jetrix_synced_score_ids';
            
            // Get list of already synced score IDs
            const syncedScoreIds = JSON.parse(localStorage.getItem(syncedScoresKey) || '[]');
            console.log(`📝 Already synced ${syncedScoreIds.length} scores to server`);
            console.log('📝 Synced score IDs:', syncedScoreIds);
            
            // Get all local scores from JSONIC WASM database
            let localScores = [];
            if (this.db) {
                localScores = await this.db.getAllScores();
                console.log(`📱 Found ${localScores.length} scores in local JSONIC database`);
            }
            
            // Also check localStorage for legacy scores from before JSONIC integration
            const legacyScores = this.getLocalScores();
            console.log(`💾 Found ${legacyScores.length} legacy scores in localStorage`);
            
            // Combine and deduplicate scores
            const allScores = [...localScores];
            
            // Add legacy scores that aren't already in JSONIC
            for (const legacyScore of legacyScores) {
                const exists = allScores.some(score => 
                    score.playerId === legacyScore.playerId && 
                    score.score === legacyScore.score &&
                    score.timestamp === legacyScore.timestamp
                );
                
                if (!exists) {
                    // Convert legacy score format to JSONIC format
                    const convertedScore = {
                        playerId: legacyScore.playerId || this.playerId,
                        playerName: legacyScore.playerName || 'Anonymous',
                        score: legacyScore.score,
                        level: legacyScore.level || 1,
                        lines: legacyScore.lines || 0,
                        gameMode: legacyScore.gameMode || 'normal',
                        timestamp: legacyScore.timestamp || Date.now(),
                        metadata: legacyScore.metadata || {}
                    };
                    
                    allScores.push(convertedScore);
                    
                    // Also save to local JSONIC database
                    if (this.db) {
                        await this.db.insertScore(convertedScore);
                    }
                }
            }
            
            // Filter out already synced scores
            const scoresToSync = allScores.filter(score => {
                // Create a unique ID for each score
                const scoreId = `${score.playerId}_${score.score}_${score.timestamp}`;
                console.log(`🔍 Checking score ID: ${scoreId} (synced: ${syncedScoreIds.includes(scoreId)})`);
                return !syncedScoreIds.includes(scoreId);
            });
            
            console.log(`🎯 Found ${scoresToSync.length} new scores to sync (out of ${allScores.length} total)`);
            
            if (scoresToSync.length === 0) {
                console.log('✅ No new scores to sync');
                return;
            }
            
            // Upload each new score to server
            let syncedCount = 0;
            let skippedCount = 0;
            const newlySyncedIds = [];
            
            for (const score of scoresToSync) {
                try {
                    await this.serverClient.submitScore(score);
                    syncedCount++;
                    
                    // Track this score as synced
                    const scoreId = `${score.playerId}_${score.score}_${score.timestamp}`;
                    newlySyncedIds.push(scoreId);
                    
                    console.log(`✅ Synced score: ${score.score} by ${score.playerName}`);
                } catch (error) {
                    skippedCount++;
                    console.warn(`⚠️ Failed to sync score ${score.score}:`, error.message);
                }
            }
            
            // Update the list of synced scores
            if (newlySyncedIds.length > 0) {
                const updatedSyncedIds = [...syncedScoreIds, ...newlySyncedIds];
                localStorage.setItem(syncedScoresKey, JSON.stringify(updatedSyncedIds));
                localStorage.setItem(lastSyncKey, Date.now().toString());
            }
            
            console.log(`🌐 Sync complete: ${syncedCount} uploaded, ${skippedCount} skipped`);
            
            // Clear cache to reload with server data
            this.leaderboardCache.clear();
            
        } catch (error) {
            console.error('❌ Failed to sync existing scores:', error);
        }
    }
    
    disconnect() {
        if (this.serverClient) {
            this.serverClient.disconnect();
            this.serverClient = null;
        }
    }
}