# Distributed Highscore System for Jetrix

## Overview

Jetrix currently uses JSONIC's local database with cross-tab synchronization. This guide explains how to extend it to a truly distributed highscore system where players worldwide can compete on the same leaderboard.

## Current Architecture

```javascript
// Local JSONIC Database (current implementation)
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │     │   Browser    │     │   Browser    │
│    Tab 1     │◄───►│    Tab 2     │◄───►│    Tab 3     │
└──────────────┘     └──────────────┘     └──────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────────────┐
                    │  JSONIC OPFS   │
                    │  (Local Only)  │
                    └────────────────┘
```

## Distributed Architecture Options

### Option 1: WebSocket Server (Real-time)

```javascript
// Enhanced highscore.js with WebSocket sync
export class DistributedHighscoreManager extends HighscoreManager {
    constructor() {
        super();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.syncQueue = [];
    }
    
    async initializeDistribution(config = {}) {
        const {
            url = 'wss://jetrix-server.herokuapp.com',
            apiKey = null,
            retryDelay = 5000
        } = config;
        
        this.connectWebSocket(url, apiKey, retryDelay);
    }
    
    connectWebSocket(url, apiKey, retryDelay) {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('Connected to highscore server');
            this.reconnectAttempts = 0;
            
            // Authenticate if needed
            if (apiKey) {
                this.ws.send(JSON.stringify({
                    type: 'auth',
                    apiKey: apiKey
                }));
            }
            
            // Send queued scores
            this.flushSyncQueue();
            
            // Request latest scores
            this.ws.send(JSON.stringify({
                type: 'request_leaderboard',
                gameMode: 'all',
                limit: 100
            }));
        };
        
        this.ws.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'new_score':
                    await this.mergeRemoteScore(message.data);
                    break;
                    
                case 'leaderboard_update':
                    await this.updateLocalLeaderboard(message.data);
                    break;
                    
                case 'sync_batch':
                    await this.processSyncBatch(message.data);
                    break;
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server, attempting reconnect...');
            this.reconnectAttempts++;
            
            setTimeout(() => {
                if (this.reconnectAttempts < 10) {
                    this.connectWebSocket(url, apiKey, retryDelay);
                }
            }, retryDelay * Math.min(this.reconnectAttempts, 5));
        };
    }
    
    async submitScore(scoreData) {
        // First save locally
        const result = await super.submitScore(scoreData);
        
        // Then sync to server
        if (result.isHighscore && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'submit_score',
                data: {
                    ...scoreData,
                    playerId: this.playerId,
                    timestamp: Date.now(),
                    clientVersion: '1.0.0'
                }
            }));
        } else if (result.isHighscore) {
            // Queue for later sync
            this.syncQueue.push(scoreData);
        }
        
        return result;
    }
    
    async mergeRemoteScore(remoteScore) {
        const highscores = this.db.collection('highscores');
        
        // Check if score already exists
        const existing = await highscores.findOne({
            playerId: remoteScore.playerId,
            timestamp: remoteScore.timestamp
        });
        
        if (!existing) {
            await highscores.insertOne(remoteScore);
            this.notifySubscribers();
        }
    }
    
    flushSyncQueue() {
        while (this.syncQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const score = this.syncQueue.shift();
            this.ws.send(JSON.stringify({
                type: 'submit_score',
                data: score
            }));
        }
    }
}
```

### WebSocket Server Implementation (Node.js)

```javascript
// server.js - Simple WebSocket server for highscores
const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory store (use Redis/MongoDB for production)
const highscores = new Map();
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'submit_score':
                handleNewScore(data.data, ws);
                break;
                
            case 'request_leaderboard':
                sendLeaderboard(ws, data.gameMode, data.limit);
                break;
        }
    });
    
    ws.on('close', () => {
        clients.delete(ws);
    });
});

function handleNewScore(score, sender) {
    // Validate score
    if (!validateScore(score)) return;
    
    // Store score
    const key = `${score.gameMode}:${score.playerId}:${score.timestamp}`;
    highscores.set(key, score);
    
    // Broadcast to all clients
    const message = JSON.stringify({
        type: 'new_score',
        data: score
    });
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function validateScore(score) {
    // Add anti-cheat validation
    if (score.score < 0) return false;
    if (score.level < 1) return false;
    if (score.lines < 0) return false;
    
    // Check score reasonability
    const maxPossibleScore = score.lines * 1000 * score.level;
    if (score.score > maxPossibleScore) return false;
    
    return true;
}

server.listen(process.env.PORT || 8080);
```

### Option 2: Firebase Realtime Database (Easiest)

```javascript
// firebase-sync.js
import { initializeApp } from 'firebase/app';
import { 
    getDatabase, 
    ref, 
    push, 
    onValue, 
    query, 
    orderByChild, 
    limitToLast 
} from 'firebase/database';

const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "jetrix-highscores.firebaseapp.com",
    databaseURL: "https://jetrix-highscores.firebaseio.com",
    projectId: "jetrix-highscores"
};

export class FirebaseHighscoreSync {
    constructor(highscoreManager) {
        this.highscoreManager = highscoreManager;
        this.app = initializeApp(firebaseConfig);
        this.db = getDatabase();
        this.setupListeners();
    }
    
    setupListeners() {
        // Listen to each game mode
        ['easy', 'normal', 'hard', 'extreme'].forEach(mode => {
            const scoresRef = query(
                ref(this.db, `highscores/${mode}`),
                orderByChild('score'),
                limitToLast(100)
            );
            
            onValue(scoresRef, (snapshot) => {
                const scores = [];
                snapshot.forEach((childSnapshot) => {
                    scores.push({
                        id: childSnapshot.key,
                        ...childSnapshot.val()
                    });
                });
                
                // Update local JSONIC database
                this.syncToLocal(mode, scores);
            });
        });
    }
    
    async submitScore(score) {
        const scoresRef = ref(this.db, `highscores/${score.gameMode}`);
        await push(scoresRef, {
            ...score,
            timestamp: Date.now(),
            verified: false  // Server can verify later
        });
    }
    
    async syncToLocal(gameMode, remoteScores) {
        const highscores = this.highscoreManager.db.collection('highscores');
        
        for (const score of remoteScores) {
            // Check if score exists locally
            const existing = await highscores.findOne({
                playerId: score.playerId,
                timestamp: score.timestamp
            });
            
            if (!existing) {
                await highscores.insertOne({
                    ...score,
                    gameMode: gameMode,
                    synced: true
                });
            }
        }
        
        this.highscoreManager.notifySubscribers();
    }
}

// Usage in highscore.js
async initialize() {
    await super.initialize();
    
    // Add Firebase sync
    this.firebaseSync = new FirebaseHighscoreSync(this);
}

async submitScore(scoreData) {
    const result = await super.submitScore(scoreData);
    
    if (result.isHighscore) {
        await this.firebaseSync.submitScore(scoreData);
    }
    
    return result;
}
```

### Option 3: P2P via WebRTC (No Server)

```javascript
// p2p-sync.js
import Peer from 'peerjs';

export class P2PHighscoreSync {
    constructor(highscoreManager) {
        this.highscoreManager = highscoreManager;
        this.peer = null;
        this.connections = new Map();
        this.knownPeers = new Set();
        this.initializePeer();
    }
    
    initializePeer() {
        // Create peer with auto-generated ID
        this.peer = new Peer();
        
        this.peer.on('open', (id) => {
            console.log('P2P ID:', id);
            this.shareIdViaSignaling(id);
            this.connectToKnownPeers();
        });
        
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });
    }
    
    handleConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            
            // Send our top scores
            this.sendTopScores(conn);
            
            // Request their scores
            conn.send({
                type: 'request_scores',
                gameMode: 'all'
            });
        });
        
        conn.on('data', async (data) => {
            switch (data.type) {
                case 'scores_batch':
                    await this.mergeScores(data.scores);
                    break;
                    
                case 'new_score':
                    await this.mergeScore(data.score);
                    break;
                    
                case 'request_scores':
                    this.sendTopScores(conn);
                    break;
                    
                case 'peer_list':
                    this.addKnownPeers(data.peers);
                    break;
            }
        });
        
        conn.on('close', () => {
            this.connections.delete(conn.peer);
        });
    }
    
    async sendTopScores(conn) {
        const highscores = this.highscoreManager.db.collection('highscores');
        const topScores = await highscores
            .find({})
            .sort({ score: -1 })
            .limit(100)
            .exec();
        
        conn.send({
            type: 'scores_batch',
            scores: topScores
        });
    }
    
    broadcastScore(score) {
        const message = {
            type: 'new_score',
            score: score
        };
        
        this.connections.forEach(conn => {
            conn.send(message);
        });
    }
    
    shareIdViaSignaling(peerId) {
        // Share via multiple methods
        
        // 1. URL Hash
        window.location.hash = peerId;
        
        // 2. QR Code
        this.generateQRCode(peerId);
        
        // 3. Clipboard
        navigator.clipboard.writeText(
            `${window.location.origin}#peer=${peerId}`
        );
        
        // 4. Simple signaling server (optional)
        fetch('https://jetrix-signal.herokuapp.com/announce', {
            method: 'POST',
            body: JSON.stringify({ peerId, game: 'jetrix' })
        });
    }
    
    connectToKnownPeers() {
        // Check URL for peer ID
        const urlPeer = new URLSearchParams(window.location.search).get('peer');
        if (urlPeer) this.connectToPeer(urlPeer);
        
        // Get peers from signaling server
        fetch('https://jetrix-signal.herokuapp.com/peers?game=jetrix')
            .then(res => res.json())
            .then(peers => {
                peers.forEach(peerId => this.connectToPeer(peerId));
            });
    }
    
    connectToPeer(peerId) {
        if (this.connections.has(peerId)) return;
        
        const conn = this.peer.connect(peerId);
        this.handleConnection(conn);
    }
}
```

### Option 4: GitHub Gist Backend (Free, Simple)

```javascript
// gist-sync.js
export class GistHighscoreSync {
    constructor(highscoreManager) {
        this.highscoreManager = highscoreManager;
        this.gistId = 'YOUR_GIST_ID';
        this.token = 'YOUR_GITHUB_TOKEN'; // Use environment variable
        this.syncInterval = 30000; // 30 seconds
        this.lastSync = 0;
        
        this.startSync();
    }
    
    startSync() {
        // Initial sync
        this.syncWithGist();
        
        // Periodic sync
        setInterval(() => this.syncWithGist(), this.syncInterval);
    }
    
    async syncWithGist() {
        try {
            // Fetch current gist content
            const response = await fetch(
                `https://api.github.com/gists/${this.gistId}`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            const gist = await response.json();
            const content = gist.files['highscores.json']?.content;
            
            if (!content) {
                await this.createInitialGist();
                return;
            }
            
            const remoteScores = JSON.parse(content);
            
            // Get local scores
            const highscores = this.highscoreManager.db.collection('highscores');
            const localScores = await highscores.find({}).exec();
            
            // Merge scores
            const merged = this.mergeHighscores(localScores, remoteScores);
            
            // Update if changed
            if (merged.hasChanges) {
                await this.updateGist(merged.scores);
                await this.updateLocalScores(merged.newScores);
            }
            
            this.lastSync = Date.now();
            
        } catch (error) {
            console.error('Gist sync failed:', error);
        }
    }
    
    mergeHighscores(local, remote) {
        const scoreMap = new Map();
        const newScores = [];
        
        // Add remote scores
        remote.forEach(score => {
            const key = `${score.playerId}:${score.timestamp}`;
            scoreMap.set(key, score);
        });
        
        // Add/update local scores
        let hasChanges = false;
        local.forEach(score => {
            const key = `${score.playerId}:${score.timestamp}`;
            if (!scoreMap.has(key)) {
                scoreMap.set(key, score);
                hasChanges = true;
                newScores.push(score);
            }
        });
        
        // Sort by score and limit to top 1000
        const scores = Array.from(scoreMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 1000);
        
        return { scores, hasChanges, newScores };
    }
    
    async updateGist(scores) {
        await fetch(
            `https://api.github.com/gists/${this.gistId}`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        'highscores.json': {
                            content: JSON.stringify(scores, null, 2)
                        },
                        'last_updated.txt': {
                            content: new Date().toISOString()
                        }
                    }
                })
            }
        );
    }
    
    async createInitialGist() {
        const response = await fetch(
            'https://api.github.com/gists',
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: 'Jetrix Highscores',
                    public: false,
                    files: {
                        'highscores.json': {
                            content: JSON.stringify([])
                        }
                    }
                })
            }
        );
        
        const gist = await response.json();
        this.gistId = gist.id;
        console.log('Created gist:', gist.id);
    }
}
```

## Implementation Guide

### Step 1: Choose Your Distribution Method

| Method | Pros | Cons | Best For |
|--------|------|------|----------|
| **WebSocket** | Real-time, bidirectional | Requires server | Competitive gaming |
| **Firebase** | Easy setup, scalable | Vendor lock-in | Quick deployment |
| **P2P WebRTC** | No server needed | Complex NAT traversal | Decentralized |
| **GitHub Gist** | Free, simple | Rate limits | Small communities |

### Step 2: Update highscore.js

```javascript
// highscore.js
import { DistributedHighscoreManager } from './distributed-highscore.js';

// Replace the basic manager with distributed version
export class HighscoreManager extends DistributedHighscoreManager {
    async initialize() {
        await super.initialize();
        
        // Initialize distribution based on environment
        const distributionConfig = {
            method: 'websocket', // or 'firebase', 'p2p', 'gist'
            url: process.env.HIGHSCORE_SERVER || 'wss://localhost:8080',
            apiKey: process.env.API_KEY
        };
        
        await this.initializeDistribution(distributionConfig);
    }
}
```

### Step 3: Add Security & Anti-Cheat

```javascript
class AntiCheat {
    static validateScore(score) {
        // Time-based validation
        const timePerLine = (score.metadata?.timeElapsed || 0) / score.lines;
        if (timePerLine < 500) return false; // Too fast
        
        // Score/lines ratio
        const avgScorePerLine = score.score / score.lines;
        const maxPossible = 1200 * score.level; // Tetris * level
        if (avgScorePerLine > maxPossible) return false;
        
        // Pieces placed validation
        const minPieces = score.lines * 2.5; // Rough estimate
        if (score.metadata?.piecesPlaced < minPieces) return false;
        
        return true;
    }
    
    static generateChecksum(score) {
        const data = `${score.playerId}:${score.score}:${score.timestamp}`;
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    }
}
```

### Step 4: Deploy

#### For WebSocket:
```bash
# Deploy to Heroku
heroku create jetrix-highscores
git push heroku main

# Or use Railway/Render/Fly.io
railway up
```

#### For Firebase:
```bash
# Initialize Firebase
firebase init
firebase deploy
```

#### For P2P:
```javascript
// Just needs a simple signaling server
// Can use free PeerJS cloud server
```

#### For GitHub Gist:
```bash
# Create a personal access token
# https://github.com/settings/tokens
# Add to environment variables
```

## Testing Distribution Locally

```bash
# Terminal 1: Start local WebSocket server
node server.js

# Terminal 2: Start game server
npm run dev

# Open multiple browser windows/tabs
# Play games and watch scores sync!
```

## Monitoring & Analytics

```javascript
class HighscoreAnalytics {
    static async getStats() {
        return {
            totalPlayers: await this.getUniquePlayerCount(),
            totalGames: await this.getTotalGames(),
            dailyActive: await this.getDailyActivePlayers(),
            averageScore: await this.getAverageScore(),
            topCountries: await this.getTopCountries(),
            cheatersCaught: await this.getCheaterCount()
        };
    }
}
```

## Troubleshooting

### Scores not syncing?
1. Check network connection
2. Verify server is running
3. Check browser console for errors
4. Ensure CORS is configured

### Too many requests?
- Implement rate limiting
- Batch score updates
- Use exponential backoff

### Data inconsistency?
- Implement conflict resolution
- Use timestamps for ordering
- Add version vectors for causality

## Future Enhancements

1. **Replay System**: Store and share game replays
2. **Tournaments**: Scheduled competitive events
3. **Achievements**: Unlock badges and rewards
4. **Social Features**: Friend lists, challenges
5. **Cross-Platform**: Mobile app with same backend
6. **Blockchain**: Immutable score records
7. **AI Opponents**: Train on top player data

## Resources

- [JSONIC Documentation](../jsonic/README.md)
- [WebSocket MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Firebase Realtime Database](https://firebase.google.com/docs/database)
- [WebRTC Guide](https://webrtc.org/getting-started/overview)
- [GitHub Gist API](https://docs.github.com/en/rest/gists)

---

Choose the distribution method that best fits your needs and scale. Start simple with GitHub Gist or Firebase, then migrate to WebSocket or P2P as your player base grows!