/**
 * JSONIC Server Integration for Jetrix
 * Connects to the centralized JSONIC server for cross-device highscore synchronization
 */

export class JSONICServerClient {
    constructor(serverUrl = 'https://jsonic1.immudb.io') {
        this.serverUrl = serverUrl;
        this.apiEndpoint = `${serverUrl}/api/v1`;
        this.database = 'jetrix';
        this.collection = 'highscores';
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3; // Reduced to prevent spam
        this.reconnectDelay = 2000; // Increased delay
        this.syncQueue = [];
        this.callbacks = new Map();
        this.requestId = 0;
        this.mockMode = false; // Enable mock mode when server unavailable
        this.mockScores = []; // Mock global scores for development
    }

    /**
     * Initialize connection to JSONIC server
     */
    async connect() {
        // First, test if the server is available
        try {
            console.log('[JSONIC Server] Testing server availability...');
            const testResponse = await fetch(this.serverUrl, { 
                method: 'HEAD',
                mode: 'cors',
                cache: 'no-cache'
            });
            
            if (!testResponse.ok && testResponse.status === 404) {
                console.warn('[JSONIC Server] ⚠️ Server not available, enabling mock mode');
                return this.enableMockMode();
            }
        } catch (fetchError) {
            console.warn('[JSONIC Server] ⚠️ Server unreachable, enabling mock mode:', fetchError.message);
            return this.enableMockMode();
        }

        // Try WebSocket connection if server is available
        try {
            // Convert HTTPS to WSS for WebSocket connection
            const wsUrl = this.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
            const fullUrl = `${wsUrl}/ws`;
            
            console.log('[JSONIC Server] Attempting WebSocket connection to:', fullUrl);
            
            this.ws = new WebSocket(fullUrl);
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.warn('[JSONIC Server] WebSocket timeout, falling back to HTTP...');
                    this.ws?.close();
                    this.fallbackToHttp().then(resolve).catch(reject);
                }, 5000); // Reduced timeout

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.mockMode = false;
                    console.log('[JSONIC Server] ✅ WebSocket connected');
                    
                    // Send initialization message
                    this.send({
                        type: 'init',
                        database: this.database,
                        collection: this.collection
                    });
                    
                    // Process any queued messages
                    this.processSyncQueue();
                    
                    resolve();
                };

                this.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.warn('[JSONIC Server] WebSocket error, falling back to HTTP...');
                    this.fallbackToHttp().then(resolve).catch(reject);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    console.log('[JSONIC Server] WebSocket disconnected');
                    this.handleDisconnect();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
            });
        } catch (error) {
            console.warn('[JSONIC Server] WebSocket failed, falling back to HTTP:', error.message);
            return this.fallbackToHttp();
        }
    }

    /**
     * Send message to server
     */
    send(message) {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            // Queue message for later
            this.syncQueue.push(message);
        }
    }

    /**
     * Handle incoming messages from server
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.requestId && this.callbacks.has(message.requestId)) {
                const callback = this.callbacks.get(message.requestId);
                this.callbacks.delete(message.requestId);
                callback(message);
            }
            
            // Handle real-time updates
            if (message.type === 'update' && message.collection === this.collection) {
                this.handleRealtimeUpdate(message.data);
            }
        } catch (error) {
            console.error('[JSONIC Server] Failed to handle message:', error);
        }
    }

    /**
     * Handle disconnection and attempt reconnect
     */
    handleDisconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
            this.reconnectAttempts++;
            
            console.log(`[JSONIC Server] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect().catch(error => {
                    console.warn('[JSONIC Server] Reconnection failed:', error.message);
                });
            }, delay);
        } else {
            console.log('[JSONIC Server] Max reconnection attempts reached. Enabling mock mode.');
            this.enableMockMode();
        }
    }

    /**
     * Process queued sync messages
     */
    processSyncQueue() {
        while (this.syncQueue.length > 0 && this.connected) {
            const message = this.syncQueue.shift();
            this.send(message);
        }
    }

    /**
     * Submit a highscore to the server
     */
    async submitScore(scoreData) {
        if (this.mockMode) {
            return this.submitScoreMock(scoreData);
        }

        const requestId = `req_${++this.requestId}`;
        
        const message = {
            type: 'insert',
            requestId,
            database: this.database,
            collection: this.collection,
            document: {
                ...scoreData,
                id: `${scoreData.playerId}_${Date.now()}`,
                timestamp: scoreData.timestamp || Date.now(),
                serverTime: null // Will be set by server
            }
        };

        if (this.connected) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Submit timeout, using mock fallback');
                    this.submitScoreMock(scoreData).then(resolve).catch(reject);
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        console.warn('[JSONIC Server] Submit failed, using mock fallback:', response.error);
                        this.submitScoreMock(scoreData).then(resolve).catch(reject);
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP fallback
            return this.submitScoreHttp(scoreData);
        }
    }

    /**
     * Get leaderboard from server
     */
    async getLeaderboard(gameMode = 'normal', limit = 100, timeRange = null) {
        if (this.mockMode) {
            return this.getLeaderboardMock(gameMode, limit, timeRange);
        }

        const requestId = `req_${++this.requestId}`;
        
        const filter = { gameMode };
        if (timeRange) {
            const cutoff = this.getTimeCutoff(timeRange);
            filter.timestamp = { $gte: cutoff };
        }

        const message = {
            type: 'query',
            requestId,
            database: this.database,
            collection: this.collection,
            filter,
            options: {
                sort: { score: -1 },
                limit
            }
        };

        if (this.connected) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Leaderboard timeout, using mock fallback');
                    this.getLeaderboardMock(gameMode, limit, timeRange).then(resolve).catch(reject);
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success) {
                        resolve(response.data || []);
                    } else {
                        console.warn('[JSONIC Server] Leaderboard failed, using mock fallback:', response.error);
                        this.getLeaderboardMock(gameMode, limit, timeRange).then(resolve).catch(reject);
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP fallback
            return this.getLeaderboardHttp(gameMode, limit, timeRange);
        }
    }

    /**
     * Get player's personal best from server
     */
    async getPersonalBest(playerId, gameMode = 'normal') {
        if (this.mockMode) {
            return this.getPersonalBestMock(playerId, gameMode);
        }

        const requestId = `req_${++this.requestId}`;
        
        const message = {
            type: 'query',
            requestId,
            database: this.database,
            collection: this.collection,
            filter: {
                playerId,
                gameMode
            },
            options: {
                sort: { score: -1 },
                limit: 1
            }
        };

        if (this.connected) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Personal best timeout, using mock fallback');
                    this.getPersonalBestMock(playerId, gameMode).then(resolve).catch(() => resolve(null));
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success && response.data && response.data.length > 0) {
                        resolve(response.data[0]);
                    } else {
                        resolve(null);
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP fallback
            return this.getPersonalBestHttp(playerId, gameMode);
        }
    }

    /**
     * Get global statistics from server
     */
    async getGlobalStats() {
        if (this.mockMode) {
            return this.getGlobalStatsMock();
        }

        const requestId = `req_${++this.requestId}`;
        
        const message = {
            type: 'aggregate',
            requestId,
            database: this.database,
            collection: this.collection,
            pipeline: [
                {
                    $group: {
                        _id: null,
                        totalGames: { $sum: 1 },
                        uniquePlayers: { $addToSet: '$playerId' },
                        highestScore: { $max: '$score' },
                        totalLines: { $sum: '$lines' }
                    }
                }
            ]
        };

        if (this.connected) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Stats timeout, using mock fallback');
                    this.getGlobalStatsMock().then(resolve).catch(() => resolve(this.getDefaultStats()));
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success && response.data && response.data.length > 0) {
                        const stats = response.data[0];
                        resolve({
                            totalGames: stats.totalGames || 0,
                            uniquePlayers: stats.uniquePlayers ? stats.uniquePlayers.length : 0,
                            highestScore: stats.highestScore || 0,
                            totalLines: stats.totalLines || 0
                        });
                    } else {
                        this.getGlobalStatsMock().then(resolve).catch(() => resolve(this.getDefaultStats()));
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP fallback
            return this.getGlobalStatsHttp();
        }
    }

    /**
     * HTTP Fallback Methods
     */
    async fallbackToHttp() {
        console.log('[JSONIC Server] Attempting HTTP API fallback...');
        this.connected = false;
        
        try {
            // Test HTTP API endpoint
            const response = await fetch(`${this.apiEndpoint}/health`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            
            if (response.ok) {
                console.log('[JSONIC Server] ✅ HTTP API available');
                return true;
            } else {
                throw new Error(`HTTP API returned ${response.status}`);
            }
        } catch (error) {
            console.warn('[JSONIC Server] ⚠️ HTTP API unavailable, enabling mock mode:', error.message);
            return this.enableMockMode();
        }
    }

    /**
     * Enable mock mode for development/offline use
     */
    async enableMockMode() {
        console.log('[JSONIC Server] 🔧 Mock mode enabled - using simulated global leaderboard');
        this.mockMode = true;
        this.connected = false;
        
        // Initialize with some sample scores
        this.mockScores = [
            {
                playerId: 'demo_player_1',
                playerName: 'TetrisAce',
                score: 125000,
                level: 8,
                lines: 200,
                gameMode: 'normal',
                timestamp: Date.now() - 3600000 // 1 hour ago
            },
            {
                playerId: 'demo_player_2', 
                playerName: 'BlockMaster',
                score: 98500,
                level: 7,
                lines: 175,
                gameMode: 'normal',
                timestamp: Date.now() - 7200000 // 2 hours ago
            },
            {
                playerId: 'demo_player_3',
                playerName: 'DropZone',
                score: 87200,
                level: 6,
                lines: 150,
                gameMode: 'normal',
                timestamp: Date.now() - 10800000 // 3 hours ago
            }
        ];
        
        return true;
    }

    async submitScoreHttp(scoreData) {
        try {
            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/documents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scoreData)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.warn('[JSONIC Server] HTTP submit failed, using mock fallback:', error.message);
            return this.submitScoreMock(scoreData);
        }
    }

    async getLeaderboardHttp(gameMode, limit, timeRange) {
        try {
            const filter = { gameMode };
            if (timeRange) {
                filter.timestamp = { $gte: this.getTimeCutoff(timeRange) };
            }

            const params = new URLSearchParams({
                filter: JSON.stringify(filter),
                sort: JSON.stringify({ score: -1 }),
                limit: limit.toString()
            });

            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/documents?${params}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.documents || [];
        } catch (error) {
            console.warn('[JSONIC Server] HTTP get leaderboard failed, using mock fallback:', error.message);
            return this.getLeaderboardMock(gameMode, limit, timeRange);
        }
    }

    async getPersonalBestHttp(playerId, gameMode) {
        try {
            const params = new URLSearchParams({
                filter: JSON.stringify({ playerId, gameMode }),
                sort: JSON.stringify({ score: -1 }),
                limit: '1'
            });

            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/documents?${params}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data.documents && data.documents.length > 0 ? data.documents[0] : null;
        } catch (error) {
            console.warn('[JSONIC Server] HTTP get personal best failed, using mock fallback:', error.message);
            return this.getPersonalBestMock(playerId, gameMode);
        }
    }

    async getGlobalStatsHttp() {
        try {
            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/stats`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.warn('[JSONIC Server] HTTP get stats failed, using mock fallback:', error.message);
            return this.getGlobalStatsMock();
        }
    }

    /**
     * Helper methods
     */
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

    getDefaultStats() {
        return {
            totalGames: 0,
            uniquePlayers: 0,
            highestScore: 0,
            totalLines: 0
        };
    }

    handleRealtimeUpdate(data) {
        // Emit custom event for real-time updates
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('jsonic-leaderboard-update', { 
                detail: data 
            }));
        }
    }

    /**
     * Mock Methods for Development/Offline Use
     */
    async submitScoreMock(scoreData) {
        console.log('[JSONIC Server] 🔧 Mock: Submitting score to simulated global leaderboard');
        
        // Add score to mock scores
        const mockScore = {
            ...scoreData,
            id: `${scoreData.playerId}_${Date.now()}`,
            timestamp: scoreData.timestamp || Date.now()
        };
        
        this.mockScores.push(mockScore);
        
        // Sort by score descending
        this.mockScores.sort((a, b) => b.score - a.score);
        
        // Keep only top 100
        this.mockScores = this.mockScores.slice(0, 100);
        
        // Simulate server response
        return {
            id: mockScore.id,
            success: true
        };
    }

    async getLeaderboardMock(gameMode = 'normal', limit = 100, timeRange = null) {
        console.log('[JSONIC Server] 🔧 Mock: Loading simulated global leaderboard');
        
        let scores = [...this.mockScores].filter(score => score.gameMode === gameMode);
        
        // Apply time filter
        if (timeRange) {
            const cutoff = this.getTimeCutoff(timeRange);
            scores = scores.filter(score => score.timestamp >= cutoff);
        }
        
        // Apply limit
        scores = scores.slice(0, limit);
        
        return scores;
    }

    async getPersonalBestMock(playerId, gameMode = 'normal') {
        console.log('[JSONIC Server] 🔧 Mock: Getting personal best from simulated leaderboard');
        
        const playerScores = this.mockScores.filter(score => 
            score.playerId === playerId && score.gameMode === gameMode
        );
        
        if (playerScores.length === 0) return null;
        
        return playerScores.reduce((best, score) => 
            score.score > best.score ? score : best
        );
    }

    async getGlobalStatsMock() {
        console.log('[JSONIC Server] 🔧 Mock: Getting global stats from simulated leaderboard');
        
        return {
            totalGames: this.mockScores.length,
            uniquePlayers: new Set(this.mockScores.map(s => s.playerId)).size,
            highestScore: Math.max(...this.mockScores.map(s => s.score), 0),
            totalLines: this.mockScores.reduce((sum, s) => sum + (s.lines || 0), 0)
        };
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.mockMode = false;
        this.syncQueue = [];
        this.callbacks.clear();
    }
}

// Export as default
export default JSONICServerClient;