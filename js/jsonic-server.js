/**
 * JSONIC Server Integration for Jetrix
 * Connects to the centralized JSONIC server for cross-device highscore synchronization
 */

export class JSONICServerClient {
    constructor(serverUrl = 'https://jsonic1.immudb.io') {
        this.serverUrl = serverUrl;
        this.apiEndpoint = `${serverUrl}/api/v1`;
        this.database = 'demo'; // Use the available demo database
        this.collection = 'highscores';
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 2000;
        this.syncQueue = [];
        this.callbacks = new Map();
        this.requestId = 0;
    }

    /**
     * Initialize connection to JSONIC server
     */
    async connect() {
        console.log('[JSONIC Server] Connecting to JSONIC server...');
        
        // Try WebSocket connection first
        try {
            // Convert HTTPS to WSS for WebSocket connection
            const wsUrl = this.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
            const fullUrl = `${wsUrl}/api/v1/ws`;
            
            console.log('[JSONIC Server] Attempting WebSocket connection to:', fullUrl);
            
            this.ws = new WebSocket(fullUrl);
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.warn('[JSONIC Server] WebSocket timeout, falling back to HTTP...');
                    this.ws?.close();
                    this.fallbackToHttp().then(resolve).catch(reject);
                }, 5000);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.reconnectAttempts = 0;
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
            console.log('[JSONIC Server] Max reconnection attempts reached.');
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
        const scoreDoc = {
            ...scoreData,
            id: `${scoreData.playerId}_${Date.now()}`,
            timestamp: scoreData.timestamp || Date.now()
        };

        if (this.connected) {
            const requestId = `req_${++this.requestId}`;
            const message = {
                type: 'insert',
                requestId,
                database: this.database,
                collection: this.collection,
                document: scoreDoc
            };

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Submit timeout, falling back to HTTP');
                    this.submitScoreHttp(scoreDoc).then(resolve).catch(reject);
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        console.warn('[JSONIC Server] Submit failed, falling back to HTTP:', response.error);
                        this.submitScoreHttp(scoreDoc).then(resolve).catch(reject);
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP API
            return this.submitScoreHttp(scoreDoc);
        }
    }

    /**
     * Get leaderboard from server
     */
    async getLeaderboard(gameMode = 'normal', limit = 100, timeRange = null) {
        const filter = { gameMode };
        if (timeRange) {
            const cutoff = this.getTimeCutoff(timeRange);
            filter.timestamp = { $gte: cutoff };
        }

        if (this.connected) {
            const requestId = `req_${++this.requestId}`;
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

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Leaderboard timeout, falling back to HTTP');
                    this.getLeaderboardHttp(gameMode, limit, timeRange).then(resolve).catch(reject);
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success) {
                        resolve(response.data || []);
                    } else {
                        console.warn('[JSONIC Server] Leaderboard failed, falling back to HTTP:', response.error);
                        this.getLeaderboardHttp(gameMode, limit, timeRange).then(resolve).catch(reject);
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP API
            return this.getLeaderboardHttp(gameMode, limit, timeRange);
        }
    }

    /**
     * Get player's personal best from server
     */
    async getPersonalBest(playerId, gameMode = 'normal') {
        if (this.connected) {
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

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Personal best timeout, falling back to HTTP');
                    this.getPersonalBestHttp(playerId, gameMode).then(resolve).catch(() => resolve(null));
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
            // Use HTTP API
            return this.getPersonalBestHttp(playerId, gameMode);
        }
    }

    /**
     * Get global statistics from server
     */
    async getGlobalStats() {
        if (this.connected) {
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

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.callbacks.delete(requestId);
                    console.warn('[JSONIC Server] Stats timeout, falling back to HTTP');
                    this.getGlobalStatsHttp().then(resolve).catch(() => resolve(this.getDefaultStats()));
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
                        this.getGlobalStatsHttp().then(resolve).catch(() => resolve(this.getDefaultStats()));
                    }
                });

                this.send(message);
            });
        } else {
            // Use HTTP API
            return this.getGlobalStatsHttp();
        }
    }

    /**
     * HTTP Fallback Methods
     */
    async fallbackToHttp() {
        console.log('[JSONIC Server] Using HTTP API...');
        this.connected = false;
        
        try {
            // Test HTTP API with databases endpoint
            const response = await fetch(`${this.apiEndpoint}/databases`, {
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
            console.error('[JSONIC Server] ❌ HTTP API unavailable:', error.message);
            throw error;
        }
    }


    async submitScoreHttp(scoreData) {
        console.log('[JSONIC Server] Submitting score via HTTP API...');
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

            console.log('[JSONIC Server] ✅ Score submitted successfully via HTTP');
            const data = await response.text(); // Server might return text instead of JSON
            return { success: true, data: data || scoreData.id };
        } catch (error) {
            console.error('[JSONIC Server] ❌ HTTP submit failed:', error.message);
            throw error;
        }
    }

    async getLeaderboardHttp(gameMode, limit, timeRange) {
        console.log('[JSONIC Server] Getting leaderboard via HTTP API...');
        try {
            // For now, get all documents and filter client-side
            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/documents`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            let documents = Array.isArray(data) ? data : (data.documents || []);
            
            // Filter by game mode
            documents = documents.filter(doc => doc.gameMode === gameMode);
            
            // Apply time filter if specified
            if (timeRange) {
                const cutoff = this.getTimeCutoff(timeRange);
                documents = documents.filter(doc => doc.timestamp >= cutoff);
            }
            
            // Sort by score descending
            documents.sort((a, b) => (b.score || 0) - (a.score || 0));
            
            // Apply limit
            documents = documents.slice(0, limit);
            
            console.log(`[JSONIC Server] ✅ Retrieved ${documents.length} scores via HTTP`);
            return documents;
        } catch (error) {
            console.error('[JSONIC Server] ❌ HTTP get leaderboard failed:', error.message);
            throw error;
        }
    }

    async getPersonalBestHttp(playerId, gameMode) {
        console.log('[JSONIC Server] Getting personal best via HTTP API...');
        try {
            // Get all documents and filter client-side for personal best
            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/documents`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            let documents = Array.isArray(data) ? data : (data.documents || []);
            
            // Filter by player and game mode
            const playerScores = documents.filter(doc => 
                doc.playerId === playerId && doc.gameMode === gameMode
            );
            
            if (playerScores.length === 0) return null;
            
            // Return highest score
            const best = playerScores.reduce((best, score) => 
                (score.score || 0) > (best.score || 0) ? score : best
            );
            
            console.log('[JSONIC Server] ✅ Retrieved personal best via HTTP');
            return best;
        } catch (error) {
            console.error('[JSONIC Server] ❌ HTTP get personal best failed:', error.message);
            throw error;
        }
    }

    async getGlobalStatsHttp() {
        console.log('[JSONIC Server] Getting global stats via HTTP API...');
        try {
            // Get all documents and calculate stats client-side
            const response = await fetch(`${this.apiEndpoint}/databases/${this.database}/collections/${this.collection}/documents`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            let documents = Array.isArray(data) ? data : (data.documents || []);
            
            const stats = {
                totalGames: documents.length,
                uniquePlayers: new Set(documents.map(d => d.playerId)).size,
                highestScore: Math.max(...documents.map(d => d.score || 0), 0),
                totalLines: documents.reduce((sum, d) => sum + (d.lines || 0), 0)
            };
            
            console.log('[JSONIC Server] ✅ Retrieved global stats via HTTP');
            return stats;
        } catch (error) {
            console.error('[JSONIC Server] ❌ HTTP get stats failed:', error.message);
            throw error;
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
     * Disconnect from server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.syncQueue = [];
        this.callbacks.clear();
    }
}

// Export as default
export default JSONICServerClient;