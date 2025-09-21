import { Renderer } from './renderer.js';
import { Controls } from './controls.js';
import { HighscoreManager } from './highscore.js';

// Tetromino definitions - all 7 pieces
const TETROMINOS = {
    I: {
        shape: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
        color: '#00ffff'
    },
    O: {
        shape: [[1,1], [1,1]],
        color: '#ffff00'
    },
    T: {
        shape: [[0,1,0], [1,1,1], [0,0,0]],
        color: '#ff00ff'
    },
    S: {
        shape: [[0,1,1], [1,1,0], [0,0,0]],
        color: '#00ff00'
    },
    Z: {
        shape: [[1,1,0], [0,1,1], [0,0,0]],
        color: '#ff0000'
    },
    J: {
        shape: [[1,0,0], [1,1,1], [0,0,0]],
        color: '#0000ff'
    },
    L: {
        shape: [[0,0,1], [1,1,1], [0,0,0]],
        color: '#ff8800'
    }
};

// Game configuration
const CONFIG = {
    BOARD_WIDTH: 10,
    BOARD_HEIGHT: 20,
    INITIAL_SPEED: 800,
    SPEED_INCREASE: 50,
    LOCK_DELAY: 500,
    DAS_DELAY: 150,
    ARR_DELAY: 50,
    SOFT_DROP_SPEED: 50,
    POINTS: {
        SINGLE: 100,
        DOUBLE: 300,
        TRIPLE: 500,
        TETRIS: 800,
        T_SPIN_MINI: 100,
        T_SPIN: 400,
        T_SPIN_SINGLE: 800,
        T_SPIN_DOUBLE: 1200,
        T_SPIN_TRIPLE: 1600,
        SOFT_DROP: 1,
        HARD_DROP: 2,
        COMBO_MULTIPLIER: 50
    },
    DIFFICULTY: {
        easy: { speed: 1000, levelSpeed: 80 },
        normal: { speed: 800, levelSpeed: 60 },
        hard: { speed: 600, levelSpeed: 40 },
        extreme: { speed: 400, levelSpeed: 20 }
    }
};

export class Game {
    constructor() {
        this.board = [];
        this.currentPiece = null;
        this.nextPieces = [];
        this.holdPiece = null;
        this.canHold = true;
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.combo = 0;
        this.gameMode = 'normal';
        this.isPlaying = false;
        this.isPaused = false;
        this.isGameOver = false;
        this.dropTimer = 0;
        this.lockTimer = 0;
        this.bag = [];
        this.renderer = null;
        this.controls = null;
        this.highscores = null;
        this.playerName = 'Player';
        this.stats = {
            piecesPlaced: 0,
            tSpins: 0,
            maxCombo: 0,
            startTime: 0,
            endTime: 0
        };
    }
    
    async initialize() {
        // Initialize game board
        this.resetBoard();
        
        // Initialize renderer
        this.renderer = new Renderer(this);
        this.renderer.initialize();
        
        // Initialize controls
        this.controls = new Controls(this);
        this.controls.initialize();
        
        // Initialize highscores
        this.highscores = new HighscoreManager();
        await this.highscores.initialize();
        
        // Set up UI event handlers
        this.setupUI();
        
        // Show start modal
        this.showStartModal();
    }
    
    resetBoard() {
        this.board = Array(CONFIG.BOARD_HEIGHT).fill(null).map(() => 
            Array(CONFIG.BOARD_WIDTH).fill(0)
        );
    }
    
    setupUI() {
        // Start game button
        const startBtn = document.getElementById('startGame');
        startBtn?.addEventListener('click', () => this.startGame());
        
        // Difficulty buttons
        document.querySelectorAll('.btn-difficulty').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-difficulty').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.gameMode = e.target.dataset.mode;
            });
        });
        
        // Player name input
        const nameInput = document.getElementById('playerName');
        nameInput?.addEventListener('change', (e) => {
            this.playerName = e.target.value || 'Player';
            localStorage.setItem('playerName', this.playerName);
        });
        
        // Load saved name
        const savedName = localStorage.getItem('playerName');
        if (savedName && nameInput) {
            nameInput.value = savedName;
            this.playerName = savedName;
        }
        
        // Highscores button
        document.getElementById('viewHighscores')?.addEventListener('click', () => {
            this.showHighscoresModal();
        });
        
        // Close highscores
        document.getElementById('closeHighscores')?.addEventListener('click', () => {
            document.getElementById('highscoreModal').style.display = 'none';
        });
        
        // Game over buttons
        document.getElementById('playAgain')?.addEventListener('click', () => {
            this.hideGameOverModal();
            this.startGame();
        });
        
        document.getElementById('mainMenu')?.addEventListener('click', () => {
            this.hideGameOverModal();
            this.showStartModal();
        });
        
        // Pause overlay button
        document.getElementById('overlayButton')?.addEventListener('click', () => {
            if (this.isPaused) {
                this.resume();
            }
        });
    }
    
    showStartModal() {
        document.getElementById('startModal').style.display = 'flex';
        document.getElementById('gameOverModal').style.display = 'none';
        document.getElementById('highscoreModal').style.display = 'none';
    }
    
    hideStartModal() {
        document.getElementById('startModal').style.display = 'none';
    }
    
    showHighscoresModal() {
        document.getElementById('highscoreModal').style.display = 'flex';
        this.highscores.displayLeaderboard();
    }
    
    showGameOverModal() {
        const modal = document.getElementById('gameOverModal');
        document.getElementById('finalScore').textContent = this.score.toLocaleString();
        document.getElementById('finalLevel').textContent = this.level;
        document.getElementById('finalLines').textContent = this.lines;
        
        modal.style.display = 'flex';
    }
    
    hideGameOverModal() {
        document.getElementById('gameOverModal').style.display = 'none';
    }
    
    async startGame() {
        // Reset game state
        this.resetBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.combo = 0;
        this.isPlaying = true;
        this.isPaused = false;
        this.isGameOver = false;
        this.holdPiece = null;
        this.canHold = true;
        this.bag = [];
        this.nextPieces = [];
        this.stats = {
            piecesPlaced: 0,
            tSpins: 0,
            maxCombo: 0,
            startTime: Date.now(),
            endTime: 0
        };
        
        // Hide modals
        this.hideStartModal();
        this.hideGameOverModal();
        
        // Update display
        this.updateDisplay();
        
        // Fill next pieces queue
        for (let i = 0; i < 3; i++) {
            this.nextPieces.push(this.getNextFromBag());
        }
        
        // Spawn first piece
        this.spawnPiece();
        
        // Start game loop
        this.gameLoop();
    }
    
    gameLoop(timestamp = 0) {
        if (!this.isPlaying || this.isGameOver) return;
        
        if (!this.isPaused) {
            // Handle automatic drop
            const dropSpeed = this.getDropSpeed();
            this.dropTimer += 16.67; // ~60 FPS
            
            if (this.dropTimer >= dropSpeed) {
                this.dropTimer = 0;
                if (!this.moveDown()) {
                    // Piece can't move down, start lock timer
                    this.lockTimer += dropSpeed;
                    if (this.lockTimer >= CONFIG.LOCK_DELAY) {
                        this.lockPiece();
                    }
                } else {
                    this.lockTimer = 0;
                }
            }
        }
        
        // Render game
        this.renderer.render();
        
        // Continue loop
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
    
    getDropSpeed() {
        const difficulty = CONFIG.DIFFICULTY[this.gameMode];
        const baseSpeed = difficulty.speed;
        const speedDecrease = difficulty.levelSpeed * (this.level - 1);
        return Math.max(50, baseSpeed - speedDecrease);
    }
    
    getNextFromBag() {
        if (this.bag.length === 0) {
            // Refill bag with all tetromino types
            this.bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
            // Shuffle bag
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        return this.bag.pop();
    }
    
    spawnPiece() {
        const type = this.nextPieces.shift();
        this.nextPieces.push(this.getNextFromBag());
        
        const shape = TETROMINOS[type].shape;
        const color = TETROMINOS[type].color;
        
        this.currentPiece = {
            type,
            shape,
            color,
            x: Math.floor((CONFIG.BOARD_WIDTH - shape[0].length) / 2),
            y: 0,
            rotation: 0
        };
        
        // Check if spawn position is blocked (game over)
        if (!this.isValidPosition(this.currentPiece.x, this.currentPiece.y, shape)) {
            this.gameOver();
        }
        
        this.canHold = true;
        this.dropTimer = 0;
        this.lockTimer = 0;
    }
    
    isValidPosition(x, y, shape) {
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const boardX = x + col;
                    const boardY = y + row;
                    
                    // Check boundaries
                    if (boardX < 0 || boardX >= CONFIG.BOARD_WIDTH || 
                        boardY >= CONFIG.BOARD_HEIGHT) {
                        return false;
                    }
                    
                    // Check collision with placed pieces
                    if (boardY >= 0 && this.board[boardY][boardX]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    
    moveLeft() {
        if (!this.currentPiece || this.isPaused) return false;
        
        if (this.isValidPosition(this.currentPiece.x - 1, this.currentPiece.y, this.currentPiece.shape)) {
            this.currentPiece.x--;
            this.lockTimer = 0;
            return true;
        }
        return false;
    }
    
    moveRight() {
        if (!this.currentPiece || this.isPaused) return false;
        
        if (this.isValidPosition(this.currentPiece.x + 1, this.currentPiece.y, this.currentPiece.shape)) {
            this.currentPiece.x++;
            this.lockTimer = 0;
            return true;
        }
        return false;
    }
    
    moveDown() {
        if (!this.currentPiece || this.isPaused) return false;
        
        if (this.isValidPosition(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
            this.currentPiece.y++;
            this.score += CONFIG.POINTS.SOFT_DROP;
            return true;
        }
        return false;
    }
    
    hardDrop() {
        if (!this.currentPiece || this.isPaused) return;
        
        let dropDistance = 0;
        while (this.isValidPosition(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.shape)) {
            this.currentPiece.y++;
            dropDistance++;
        }
        
        this.score += dropDistance * CONFIG.POINTS.HARD_DROP;
        this.lockPiece();
        this.playSound('drop');
    }
    
    rotate(clockwise = true) {
        if (!this.currentPiece || this.isPaused) return false;
        
        const rotated = this.rotateMatrix(this.currentPiece.shape, clockwise);
        
        // Try basic rotation
        if (this.isValidPosition(this.currentPiece.x, this.currentPiece.y, rotated)) {
            this.currentPiece.shape = rotated;
            this.currentPiece.rotation = (this.currentPiece.rotation + (clockwise ? 1 : 3)) % 4;
            this.lockTimer = 0;
            this.checkTSpin();
            return true;
        }
        
        // Try wall kicks (SRS)
        const kicks = this.getWallKicks(this.currentPiece.type, this.currentPiece.rotation, clockwise);
        for (const [kickX, kickY] of kicks) {
            if (this.isValidPosition(this.currentPiece.x + kickX, this.currentPiece.y + kickY, rotated)) {
                this.currentPiece.x += kickX;
                this.currentPiece.y += kickY;
                this.currentPiece.shape = rotated;
                this.currentPiece.rotation = (this.currentPiece.rotation + (clockwise ? 1 : 3)) % 4;
                this.lockTimer = 0;
                this.checkTSpin();
                return true;
            }
        }
        
        return false;
    }
    
    rotateMatrix(matrix, clockwise = true) {
        const n = matrix.length;
        const rotated = Array(n).fill(null).map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (clockwise) {
                    rotated[j][n - 1 - i] = matrix[i][j];
                } else {
                    rotated[n - 1 - j][i] = matrix[i][j];
                }
            }
        }
        
        return rotated;
    }
    
    getWallKicks(type, rotation, clockwise) {
        // Simplified SRS wall kicks
        if (type === 'I') {
            return [[-1, 0], [2, 0], [-1, 2], [2, -1]];
        } else if (type === 'O') {
            return [];
        } else {
            return [[-1, 0], [1, 0], [-1, -1], [1, -1], [0, 1]];
        }
    }
    
    checkTSpin() {
        if (this.currentPiece.type !== 'T') return false;
        
        // Simplified T-spin detection
        const corners = [
            [this.currentPiece.x - 1, this.currentPiece.y - 1],
            [this.currentPiece.x + 1, this.currentPiece.y - 1],
            [this.currentPiece.x - 1, this.currentPiece.y + 1],
            [this.currentPiece.x + 1, this.currentPiece.y + 1]
        ];
        
        let filledCorners = 0;
        for (const [x, y] of corners) {
            if (x < 0 || x >= CONFIG.BOARD_WIDTH || y >= CONFIG.BOARD_HEIGHT || 
                (y >= 0 && this.board[y][x])) {
                filledCorners++;
            }
        }
        
        if (filledCorners >= 3) {
            this.stats.tSpins++;
            return true;
        }
        
        return false;
    }
    
    hold() {
        if (!this.currentPiece || !this.canHold || this.isPaused) return;
        
        const currentType = this.currentPiece.type;
        
        if (this.holdPiece) {
            // Swap with hold piece
            const holdType = this.holdPiece;
            this.holdPiece = currentType;
            
            // Create new piece from hold
            const shape = TETROMINOS[holdType].shape;
            const color = TETROMINOS[holdType].color;
            
            this.currentPiece = {
                type: holdType,
                shape,
                color,
                x: Math.floor((CONFIG.BOARD_WIDTH - shape[0].length) / 2),
                y: 0,
                rotation: 0
            };
        } else {
            // Put current piece in hold
            this.holdPiece = currentType;
            this.spawnPiece();
        }
        
        this.canHold = false;
        this.renderer.renderHold();
    }
    
    lockPiece() {
        if (!this.currentPiece) return;
        
        // Place piece on board
        const shape = this.currentPiece.shape;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const boardY = this.currentPiece.y + row;
                    const boardX = this.currentPiece.x + col;
                    
                    if (boardY >= 0) {
                        this.board[boardY][boardX] = this.currentPiece.color;
                    }
                }
            }
        }
        
        this.stats.piecesPlaced++;
        
        // Check for completed lines
        const linesCleared = this.clearLines();
        if (linesCleared > 0) {
            this.updateScore(linesCleared);
            this.combo++;
            this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
        } else {
            this.combo = 0;
        }
        
        // Spawn next piece
        this.spawnPiece();
    }
    
    clearLines() {
        let linesCleared = 0;
        
        for (let row = CONFIG.BOARD_HEIGHT - 1; row >= 0; row--) {
            if (this.board[row].every(cell => cell !== 0)) {
                // Remove line
                this.board.splice(row, 1);
                // Add empty line at top
                this.board.unshift(Array(CONFIG.BOARD_WIDTH).fill(0));
                linesCleared++;
                row++; // Check same row again
            }
        }
        
        if (linesCleared > 0) {
            this.lines += linesCleared;
            
            // Check for level up
            const newLevel = Math.floor(this.lines / 10) + 1;
            if (newLevel > this.level) {
                this.level = newLevel;
                this.playSound('levelUp');
            }
            
            // Play sound based on lines cleared
            if (linesCleared === 4) {
                this.playSound('tetris');
            } else {
                this.playSound('clear');
            }
            
            // Trigger line clear animation
            this.renderer.animateLineClear(linesCleared);
        }
        
        return linesCleared;
    }
    
    updateScore(linesCleared) {
        let points = 0;
        
        switch (linesCleared) {
            case 1:
                points = CONFIG.POINTS.SINGLE;
                break;
            case 2:
                points = CONFIG.POINTS.DOUBLE;
                break;
            case 3:
                points = CONFIG.POINTS.TRIPLE;
                break;
            case 4:
                points = CONFIG.POINTS.TETRIS;
                break;
        }
        
        // Apply level multiplier
        points *= this.level;
        
        // Apply combo bonus
        if (this.combo > 0) {
            points += CONFIG.POINTS.COMBO_MULTIPLIER * this.combo;
        }
        
        this.score += points;
        this.updateDisplay();
    }
    
    updateDisplay() {
        document.getElementById('score').textContent = this.score.toLocaleString();
        document.getElementById('level').textContent = this.level;
        document.getElementById('lines').textContent = this.lines;
    }
    
    pause() {
        if (!this.isPlaying || this.isGameOver) return;
        
        this.isPaused = true;
        const overlay = document.getElementById('gameOverlay');
        overlay.style.display = 'flex';
        document.getElementById('overlayTitle').textContent = 'PAUSED';
        document.getElementById('overlayMessage').textContent = 'Press SPACE or ESC to continue';
    }
    
    resume() {
        this.isPaused = false;
        document.getElementById('gameOverlay').style.display = 'none';
    }
    
    async gameOver() {
        this.isGameOver = true;
        this.isPlaying = false;
        this.stats.endTime = Date.now();
        
        this.playSound('gameOver');
        
        // Submit score to highscores
        const result = await this.highscores.submitScore({
            playerName: this.playerName,
            score: this.score,
            level: this.level,
            lines: this.lines,
            gameMode: this.gameMode,
            metadata: {
                piecesPlaced: this.stats.piecesPlaced,
                tSpins: this.stats.tSpins,
                maxCombo: this.stats.maxCombo,
                timeElapsed: this.stats.endTime - this.stats.startTime
            }
        });
        
        // Show rank if new highscore
        if (result.isHighscore) {
            const rankElement = document.getElementById('highscoreRank');
            const rankNumber = document.getElementById('rankNumber');
            rankElement.style.display = 'flex';
            rankNumber.textContent = result.rank;
        } else {
            document.getElementById('highscoreRank').style.display = 'none';
        }
        
        // Show game over modal
        setTimeout(() => this.showGameOverModal(), 1000);
    }
    
    playSound(soundType) {
        // Sound will be implemented later
        // const audio = document.getElementById(soundType + 'Sound');
        // if (audio) {
        //     audio.currentTime = 0;
        //     audio.play();
        // }
    }
    
    getGhostPosition() {
        if (!this.currentPiece) return null;
        
        let ghostY = this.currentPiece.y;
        while (this.isValidPosition(this.currentPiece.x, ghostY + 1, this.currentPiece.shape)) {
            ghostY++;
        }
        
        return {
            x: this.currentPiece.x,
            y: ghostY,
            shape: this.currentPiece.shape,
            color: this.currentPiece.color
        };
    }
}