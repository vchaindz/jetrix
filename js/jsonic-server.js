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
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.syncQueue = [];
        this.callbacks = new Map();
        this.requestId = 0;
    }

    /**
     * Initialize connection to JSONIC server
     */
    async connect() {
        try {
            // Convert HTTPS to WSS for WebSocket connection
            const wsUrl = this.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
            const fullUrl = `${wsUrl}/ws`;
            
            console.log('[JSONIC Server] Connecting to:', fullUrl);
            
            this.ws = new WebSocket(fullUrl);
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    console.log('[JSONIC Server] ✅ Connected to server');
                    
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
                    console.error('[JSONIC Server] Connection error:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    console.log('[JSONIC Server] Disconnected');
                    this.handleDisconnect();
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };
            });
        } catch (error) {
            console.error('[JSONIC Server] Failed to connect:', error);
            // Fall back to HTTP API if WebSocket fails
            this.connected = false;
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
                this.connect();
            }, delay);
        } else {
            console.log('[JSONIC Server] Max reconnection attempts reached. Falling back to HTTP.');
            this.fallbackToHttp();
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
                    reject(new Error('Request timeout'));
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.error || 'Failed to submit score'));
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
                    reject(new Error('Request timeout'));
                }, 5000);

                this.callbacks.set(requestId, (response) => {
                    clearTimeout(timeout);
                    
                    if (response.success) {
                        resolve(response.data || []);
                    } else {
                        reject(new Error(response.error || 'Failed to get leaderboard'));
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
                    resolve(null); // Return null on timeout for personal best
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
                    resolve(this.getDefaultStats());
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
                        resolve(this.getDefaultStats());
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
        console.log('[JSONIC Server] Using HTTP API fallback');
        this.connected = false;
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
            console.error('[JSONIC Server] HTTP submit failed:', error);
            throw error;
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
            console.error('[JSONIC Server] HTTP get leaderboard failed:', error);
            return [];
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
            console.error('[JSONIC Server] HTTP get personal best failed:', error);
            return null;
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
            console.error('[JSONIC Server] HTTP get stats failed:', error);
            return this.getDefaultStats();
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