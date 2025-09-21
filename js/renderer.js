export class Renderer {
    constructor(game) {
        this.game = game;
        this.canvas = null;
        this.ctx = null;
        this.nextCanvas = null;
        this.nextCtx = null;
        this.holdCanvas = null;
        this.holdCtx = null;
        this.cellSize = 30;
        this.animationFrame = 0;
        this.lineClearAnimation = null;
        this.particles = [];
    }
    
    initialize() {
        // Main game canvas
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Next piece canvas
        this.nextCanvas = document.getElementById('nextCanvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        
        // Hold piece canvas
        this.holdCanvas = document.getElementById('holdCanvas');
        this.holdCtx = this.holdCanvas.getContext('2d');
        
        // Set up canvas properties for crisp rendering
        [this.ctx, this.nextCtx, this.holdCtx].forEach(ctx => {
            ctx.imageSmoothingEnabled = false;
        });
        
        // Initialize particle system
        this.initParticles();
    }
    
    initParticles() {
        // Create background particles for visual effect
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: Math.random() * 0.5 + 0.5,
                size: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.1
            });
        }
    }
    
    render() {
        this.clearCanvas();
        this.drawGrid();
        this.drawBoard();
        this.drawGhostPiece();
        this.drawCurrentPiece();
        this.drawParticles();
        this.renderNext();
        this.renderHold();
        
        // Update animation frame
        this.animationFrame++;
        
        // Handle line clear animation
        if (this.lineClearAnimation) {
            this.drawLineClearAnimation();
        }
    }
    
    clearCanvas() {
        // Create gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#0a0a0a');
        gradient.addColorStop(1, '#1a0a2a');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        
        // Draw vertical lines
        for (let x = 0; x <= 10; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.cellSize, 0);
            this.ctx.lineTo(x * this.cellSize, this.canvas.height);
            this.ctx.stroke();
        }
        
        // Draw horizontal lines
        for (let y = 0; y <= 20; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.cellSize);
            this.ctx.lineTo(this.canvas.width, y * this.cellSize);
            this.ctx.stroke();
        }
    }
    
    drawBoard() {
        const board = this.game.board;
        
        for (let row = 0; row < board.length; row++) {
            for (let col = 0; col < board[row].length; col++) {
                if (board[row][col]) {
                    this.drawCell(col, row, board[row][col], 1);
                }
            }
        }
    }
    
    drawCurrentPiece() {
        const piece = this.game.currentPiece;
        if (!piece) return;
        
        const shape = piece.shape;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    this.drawCell(
                        piece.x + col,
                        piece.y + row,
                        piece.color,
                        1
                    );
                }
            }
        }
    }
    
    drawGhostPiece() {
        const ghost = this.game.getGhostPosition();
        if (!ghost) return;
        
        const shape = ghost.shape;
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    this.drawCell(
                        ghost.x + col,
                        ghost.y + row,
                        ghost.color,
                        0.2
                    );
                }
            }
        }
    }
    
    drawCell(x, y, color, opacity = 1) {
        const pixelX = x * this.cellSize;
        const pixelY = y * this.cellSize;
        const size = this.cellSize;
        const padding = 1;
        
        // Main cell color with gradient
        const gradient = this.ctx.createLinearGradient(
            pixelX, pixelY,
            pixelX + size, pixelY + size
        );
        
        // Parse color and create gradient
        const baseColor = this.hexToRgb(color);
        gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`);
        gradient.addColorStop(1, `rgba(${baseColor.r * 0.6}, ${baseColor.g * 0.6}, ${baseColor.b * 0.6}, ${opacity})`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(
            pixelX + padding,
            pixelY + padding,
            size - padding * 2,
            size - padding * 2
        );
        
        // Add glow effect
        if (opacity > 0.5) {
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 10;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(
                pixelX + padding,
                pixelY + padding,
                size - padding * 2,
                size - padding * 2
            );
            this.ctx.shadowBlur = 0;
        }
        
        // Inner highlight
        this.ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.3})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(
            pixelX + padding + 2,
            pixelY + padding + 2,
            size - padding * 2 - 4,
            size - padding * 2 - 4
        );
    }
    
    renderNext() {
        // Clear next canvas
        const gradient = this.nextCtx.createLinearGradient(0, 0, 0, this.nextCanvas.height);
        gradient.addColorStop(0, 'rgba(10, 10, 10, 0.8)');
        gradient.addColorStop(1, 'rgba(26, 10, 42, 0.8)');
        this.nextCtx.fillStyle = gradient;
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        // Draw next pieces
        const nextPieces = this.game.nextPieces;
        const TETROMINOS = {
            I: { shape: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], color: '#00ffff' },
            O: { shape: [[1,1], [1,1]], color: '#ffff00' },
            T: { shape: [[0,1,0], [1,1,1], [0,0,0]], color: '#ff00ff' },
            S: { shape: [[0,1,1], [1,1,0], [0,0,0]], color: '#00ff00' },
            Z: { shape: [[1,1,0], [0,1,1], [0,0,0]], color: '#ff0000' },
            J: { shape: [[1,0,0], [1,1,1], [0,0,0]], color: '#0000ff' },
            L: { shape: [[0,0,1], [1,1,1], [0,0,0]], color: '#ff8800' }
        };
        
        for (let i = 0; i < Math.min(3, nextPieces.length); i++) {
            const piece = TETROMINOS[nextPieces[i]];
            if (piece) {
                this.drawPiecePreview(
                    this.nextCtx,
                    piece.shape,
                    piece.color,
                    60,
                    40 + i * 120,
                    20
                );
            }
        }
    }
    
    renderHold() {
        // Clear hold canvas
        const gradient = this.holdCtx.createLinearGradient(0, 0, 0, this.holdCanvas.height);
        gradient.addColorStop(0, 'rgba(10, 10, 10, 0.8)');
        gradient.addColorStop(1, 'rgba(26, 10, 42, 0.8)');
        this.holdCtx.fillStyle = gradient;
        this.holdCtx.fillRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
        
        // Draw hold piece
        if (this.game.holdPiece) {
            const TETROMINOS = {
                I: { shape: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]], color: '#00ffff' },
                O: { shape: [[1,1], [1,1]], color: '#ffff00' },
                T: { shape: [[0,1,0], [1,1,1], [0,0,0]], color: '#ff00ff' },
                S: { shape: [[0,1,1], [1,1,0], [0,0,0]], color: '#00ff00' },
                Z: { shape: [[1,1,0], [0,1,1], [0,0,0]], color: '#ff0000' },
                J: { shape: [[1,0,0], [1,1,1], [0,0,0]], color: '#0000ff' },
                L: { shape: [[0,0,1], [1,1,1], [0,0,0]], color: '#ff8800' }
            };
            
            const piece = TETROMINOS[this.game.holdPiece];
            if (piece) {
                const opacity = this.game.canHold ? 1 : 0.3;
                this.drawPiecePreview(
                    this.holdCtx,
                    piece.shape,
                    piece.color,
                    60,
                    60,
                    20,
                    opacity
                );
            }
        }
    }
    
    drawPiecePreview(ctx, shape, color, centerX, centerY, cellSize, opacity = 1) {
        const cols = shape[0].length;
        const rows = shape.length;
        const offsetX = centerX - (cols * cellSize) / 2;
        const offsetY = centerY - (rows * cellSize) / 2;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (shape[row][col]) {
                    const x = offsetX + col * cellSize;
                    const y = offsetY + row * cellSize;
                    
                    // Draw cell
                    const gradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize);
                    const baseColor = this.hexToRgb(color);
                    gradient.addColorStop(0, `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`);
                    gradient.addColorStop(1, `rgba(${baseColor.r * 0.6}, ${baseColor.g * 0.6}, ${baseColor.b * 0.6}, ${opacity})`);
                    
                    ctx.fillStyle = gradient;
                    ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                    
                    // Add border
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.3})`;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
                }
            }
        }
    }
    
    drawParticles() {
        this.ctx.save();
        
        for (let particle of this.particles) {
            // Update particle position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Wrap around screen
            if (particle.y > this.canvas.height) {
                particle.y = -10;
                particle.x = Math.random() * this.canvas.width;
            }
            if (particle.x < 0) particle.x = this.canvas.width;
            if (particle.x > this.canvas.width) particle.x = 0;
            
            // Draw particle
            this.ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }
    
    animateLineClear(linesCleared) {
        this.lineClearAnimation = {
            lines: linesCleared,
            frame: 0,
            maxFrames: 30
        };
    }
    
    drawLineClearAnimation() {
        const anim = this.lineClearAnimation;
        const progress = anim.frame / anim.maxFrames;
        
        // Flash effect
        if (anim.frame < 10) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * (1 - progress * 3)})`;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Particle burst
        if (anim.frame === 0) {
            for (let i = 0; i < anim.lines * 10; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width,
                    y: this.canvas.height * 0.7,
                    vx: (Math.random() - 0.5) * 5,
                    vy: -Math.random() * 5 - 2,
                    size: Math.random() * 3 + 2,
                    opacity: 1,
                    lifetime: 30
                });
            }
        }
        
        // Update animation
        anim.frame++;
        if (anim.frame >= anim.maxFrames) {
            this.lineClearAnimation = null;
        }
        
        // Clean up temporary particles
        this.particles = this.particles.filter(p => !p.lifetime || --p.lifetime > 0);
    }
    
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }
}