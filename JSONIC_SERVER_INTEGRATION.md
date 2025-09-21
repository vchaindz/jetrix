# JSONIC Server Integration for Jetrix

This document explains the integration of Jetrix with the centralized JSONIC server at `https://jsonic1.immudb.io` for global highscore synchronization.

## Overview

The integration enables Jetrix to:
- Store highscores locally using JSONIC WebAssembly database
- Sync highscores to a centralized server for global leaderboards
- Display both local and global leaderboards
- Provide real-time updates when new scores are submitted globally
- Fall back gracefully when the server is unavailable

## Architecture

### Local Storage (JSONIC WASM)
- Local highscores stored in browser using JSONIC WebAssembly
- Provides fast, offline-first experience
- Uses OPFS (Origin Private File System) for persistence when available
- Falls back to localStorage if JSONIC fails

### Server Integration (JSONIC Server)
- Connects to `https://jsonic1.immudb.io` via WebSocket and HTTP
- Submits personal best scores to global leaderboard
- Retrieves global leaderboards for comparison
- Handles real-time updates from other players
- Graceful degradation when server is unavailable

## Files Modified/Added

### New Files
1. `js/jsonic-server.js` - JSONIC server client implementation
2. `test-server-integration.html` - Test page for server integration
3. `JSONIC_SERVER_INTEGRATION.md` - This documentation

### Modified Files
1. `js/highscore.js` - Enhanced with server synchronization
   - Added server client integration
   - Local/global leaderboard switching
   - Real-time update handling
   - Fallback mechanisms

## Features

### Dual Leaderboards
- **Local Leaderboard**: Shows only scores from this device/browser
- **Global Leaderboard**: Shows scores from all Jetrix players worldwide

### Smart Synchronization
- Only submits personal best scores to reduce server load
- Caches leaderboards locally for 30 seconds
- Automatic retry with exponential backoff on connection failures

### Real-time Updates
- WebSocket connection for real-time leaderboard updates
- Automatic cache invalidation when new global scores arrive
- Event-driven UI updates

### Offline Support
- Full functionality when server is unavailable
- Local storage maintains game experience
- Automatic sync when connection is restored

## API Usage

### Initialization
```javascript
const highscoreManager = new HighscoreManager();
await highscoreManager.initialize();
```

### Submit Score (with server sync)
```javascript
const result = await highscoreManager.submitScore({
    playerName: 'Player1',
    score: 75000,
    level: 5,
    lines: 150,
    gameMode: 'normal'
});

console.log(`Local Rank: #${result.rank}`);
console.log(`Global Rank: #${result.globalRank}`);
```

### Get Leaderboards
```javascript
// Global leaderboard (default)
const globalScores = await highscoreManager.getLeaderboard('normal', 'all', 10, 'global');

// Local leaderboard
const localScores = await highscoreManager.getLeaderboard('normal', 'all', 10, 'local');
```

## Server Configuration

### Database Structure
- **Database**: `jetrix`
- **Collection**: `highscores`
- **Document Schema**:
  ```json
  {
    "id": "player_abc123_1234567890",
    "playerId": "player_abc123",
    "playerName": "Anonymous",
    "score": 75000,
    "level": 5,
    "lines": 150,
    "gameMode": "normal",
    "timestamp": 1634567890123,
    "metadata": {}
  }
  ```

### Connection Methods
1. **WebSocket** (Primary): `wss://jsonic1.immudb.io/ws`
2. **HTTP API** (Fallback): `https://jsonic1.immudb.io/api/v1`

### Message Format
```json
{
  "type": "insert|query|update|delete",
  "requestId": "req_123",
  "database": "jetrix",
  "collection": "highscores",
  "document": { ... },
  "filter": { ... },
  "options": { ... }
}
```

## Error Handling

### Connection Failures
- Automatic reconnection with exponential backoff
- Maximum 5 retry attempts before falling back to HTTP
- Graceful degradation to local-only mode

### Score Submission Failures
- Scores always saved locally first (optimistic updates)
- Server sync happens in background
- Failed submissions logged but don't interrupt gameplay

### Leaderboard Loading Failures
- Global leaderboard falls back to local leaderboard
- Cache serves stale data if fresh data unavailable
- User-friendly error messages in UI

## Testing

### Test Page
Open `test-server-integration.html` in a browser to test:
- Server connection
- Score submission
- Leaderboard loading
- Error handling

### Manual Testing
1. Play a game and submit a score
2. Check both local and global leaderboards
3. Test with network disconnected
4. Verify fallback behavior

## Security Considerations

### Data Privacy
- Player IDs are generated locally and don't contain personal information
- Player names are provided by users and not validated
- No authentication required for basic leaderboard functionality

### Rate Limiting
- Only personal best scores submitted to reduce server load
- Leaderboard caching prevents excessive API calls
- Connection pooling and request batching where possible

### Data Validation
- All scores validated locally before submission
- Server-side validation recommended for production use
- Sanitization of player names and metadata

## Future Enhancements

### Planned Features
1. **Authentication**: Optional user accounts for persistent identity
2. **Tournaments**: Time-limited competitive events
3. **Statistics**: Detailed player analytics and trends
4. **Social Features**: Friend lists and challenges
5. **Anti-Cheat**: Score validation and anomaly detection

### Performance Optimizations
1. **Compression**: Gzip compression for large leaderboards
2. **Pagination**: Lazy loading for large datasets
3. **Caching**: CDN integration for global leaderboards
4. **Indexing**: Database indexes for faster queries

## Troubleshooting

### Common Issues

#### WebSocket connection errors in console
**Note**: If you see WebSocket connection errors to `/ws`, these are likely from webpack-dev-server's Hot Module Replacement (HMR) system, NOT from the JSONIC client. This is normal in development builds.

- **Webpack HMR errors**: `WebSocket connection to 'ws://localhost:8080/ws' failed` (Normal - webpack development server)
- **JSONIC client**: Connects to `wss://jsonic1.immudb.io/api/v1/ws` (Our integration)

#### "Failed to connect to server"
- Check internet connection
- Verify server URL is accessible
- Look for CORS issues in browser console
- JSONIC client will automatically fall back to mock mode

#### "Score not appearing in global leaderboard"
- Verify score is a personal best
- Check server connection status
- Wait for cache to refresh (30 seconds)
- If server unavailable, scores appear in mock global leaderboard

#### "Local scores not saving"
- Check browser storage permissions
- Verify JSONIC WASM loading
- Look for JavaScript errors in console

### Debug Mode
Enable debug logging:
```javascript
JSONIC.configure({ debug: true });
```

This will show detailed logs of:
- WASM loading process
- Database operations
- Server communication
- Error details

## Support

For issues or questions:
1. Check browser console for error messages
2. Test with `test-server-integration.html`
3. Verify network connectivity to `jsonic1.immudb.io`
4. Report issues with specific error messages and steps to reproduce