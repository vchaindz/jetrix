export class Controls {
    constructor(game) {
        this.game = game;
        this.keys = {};
        this.keyTimers = {};
        this.dasTimer = null;
        this.arrTimer = null;
        this.touchStartX = null;
        this.touchStartY = null;
        this.touchStartTime = null;
    }
    
    initialize() {
        // Keyboard controls
        this.setupKeyboardControls();
        
        // Touch controls for mobile
        this.setupTouchControls();
        
        // Gamepad support
        this.setupGamepadControls();
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }
    
    handleKeyDown(e) {
        // Prevent default for game keys
        if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ', 'c', 'C', 'Escape'].includes(e.key)) {
            e.preventDefault();
        }
        
        // Ignore if key already pressed
        if (this.keys[e.key]) return;
        
        this.keys[e.key] = true;
        
        // Handle immediate actions
        switch (e.key) {
            case 'ArrowLeft':
                this.handleMoveLeft();
                this.startDAS('left');
                break;
            
            case 'ArrowRight':
                this.handleMoveRight();
                this.startDAS('right');
                break;
            
            case 'ArrowDown':
                this.handleSoftDrop();
                break;
            
            case 'ArrowUp':
                this.handleRotate();
                break;
            
            case 'z':
            case 'Z':
                this.handleRotate(false);
                break;
            
            case ' ':
                this.handleHardDrop();
                break;
            
            case 'c':
            case 'C':
                this.handleHold();
                break;
            
            case 'Escape':
                this.handlePause();
                break;
            
            case 'Enter':
                if (this.game.isGameOver) {
                    this.game.startGame();
                }
                break;
        }
    }
    
    handleKeyUp(e) {
        delete this.keys[e.key];
        
        // Stop DAS/ARR
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            this.stopDAS();
        }
        
        // Stop soft drop timer
        if (e.key === 'ArrowDown') {
            this.stopSoftDrop();
        }
    }
    
    handleMoveLeft() {
        if (!this.game.isPlaying || this.game.isPaused) return;
        this.game.moveLeft();
        this.game.playSound('move');
    }
    
    handleMoveRight() {
        if (!this.game.isPlaying || this.game.isPaused) return;
        this.game.moveRight();
        this.game.playSound('move');
    }
    
    handleRotate(clockwise = true) {
        if (!this.game.isPlaying || this.game.isPaused) return;
        if (this.game.rotate(clockwise)) {
            this.game.playSound('rotate');
        }
    }
    
    handleSoftDrop() {
        if (!this.game.isPlaying || this.game.isPaused) return;
        
        // Immediate drop
        this.game.moveDown();
        
        // Start continuous soft drop
        if (!this.keyTimers.softDrop) {
            this.keyTimers.softDrop = setInterval(() => {
                if (this.keys['ArrowDown'] && !this.game.isPaused) {
                    this.game.moveDown();
                }
            }, 50);
        }
    }
    
    stopSoftDrop() {
        if (this.keyTimers.softDrop) {
            clearInterval(this.keyTimers.softDrop);
            this.keyTimers.softDrop = null;
        }
    }
    
    handleHardDrop() {
        if (!this.game.isPlaying || this.game.isPaused) return;
        this.game.hardDrop();
    }
    
    handleHold() {
        if (!this.game.isPlaying || this.game.isPaused) return;
        this.game.hold();
        this.game.playSound('move');
    }
    
    handlePause() {
        if (!this.game.isPlaying) return;
        
        if (this.game.isPaused) {
            this.game.resume();
        } else {
            this.game.pause();
        }
    }
    
    // DAS (Delayed Auto Shift) and ARR (Auto Repeat Rate) for smoother movement
    startDAS(direction) {
        this.stopDAS();
        
        // Start DAS timer
        this.dasTimer = setTimeout(() => {
            // Start ARR after DAS delay
            this.arrTimer = setInterval(() => {
                if (!this.game.isPaused) {
                    if (direction === 'left' && this.keys['ArrowLeft']) {
                        this.game.moveLeft();
                    } else if (direction === 'right' && this.keys['ArrowRight']) {
                        this.game.moveRight();
                    } else {
                        this.stopDAS();
                    }
                }
            }, 30); // ARR speed (30ms)
        }, 150); // DAS delay (150ms)
    }
    
    stopDAS() {
        if (this.dasTimer) {
            clearTimeout(this.dasTimer);
            this.dasTimer = null;
        }
        if (this.arrTimer) {
            clearInterval(this.arrTimer);
            this.arrTimer = null;
        }
    }
    
    // Touch controls for mobile
    setupTouchControls() {
        const canvas = document.getElementById('gameCanvas');
        
        canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.touchStartTime = Date.now();
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        if (!this.touchStartX || !this.touchStartY) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;
        
        // Swipe threshold
        const threshold = 30;
        
        // Horizontal swipe (move piece)
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0) {
                this.handleMoveRight();
            } else {
                this.handleMoveLeft();
            }
            this.touchStartX = touch.clientX;
        }
        
        // Vertical swipe down (soft drop)
        if (deltaY > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
            this.handleSoftDrop();
            this.touchStartY = touch.clientY;
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        
        if (!this.touchStartTime) return;
        
        const touchDuration = Date.now() - this.touchStartTime;
        const touch = e.changedTouches[0];
        const deltaX = Math.abs(touch.clientX - this.touchStartX);
        const deltaY = Math.abs(touch.clientY - this.touchStartY);
        
        // Tap detection (rotate)
        if (touchDuration < 200 && deltaX < 10 && deltaY < 10) {
            this.handleRotate();
        }
        
        // Quick swipe up (hard drop)
        if (touchDuration < 200 && deltaY > 50 && (touch.clientY - this.touchStartY) < -50) {
            this.handleHardDrop();
        }
        
        // Reset touch tracking
        this.touchStartX = null;
        this.touchStartY = null;
        this.touchStartTime = null;
        this.stopSoftDrop();
    }
    
    // Gamepad support
    setupGamepadControls() {
        this.gamepadIndex = null;
        this.gamepadButtons = {};
        
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad.id);
            this.gamepadIndex = e.gamepad.index;
        });
        
        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected:', e.gamepad.id);
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
            }
        });
        
        // Poll gamepad state
        this.pollGamepad();
    }
    
    pollGamepad() {
        if (this.gamepadIndex !== null) {
            const gamepad = navigator.getGamepads()[this.gamepadIndex];
            
            if (gamepad) {
                // D-pad or left analog stick
                const leftPressed = gamepad.buttons[14]?.pressed || gamepad.axes[0] < -0.5;
                const rightPressed = gamepad.buttons[15]?.pressed || gamepad.axes[0] > 0.5;
                const downPressed = gamepad.buttons[13]?.pressed || gamepad.axes[1] > 0.5;
                const upPressed = gamepad.buttons[12]?.pressed || gamepad.axes[1] < -0.5;
                
                // Handle movement
                if (leftPressed && !this.gamepadButtons.left) {
                    this.handleMoveLeft();
                    this.gamepadButtons.left = true;
                } else if (!leftPressed) {
                    this.gamepadButtons.left = false;
                }
                
                if (rightPressed && !this.gamepadButtons.right) {
                    this.handleMoveRight();
                    this.gamepadButtons.right = true;
                } else if (!rightPressed) {
                    this.gamepadButtons.right = false;
                }
                
                if (downPressed && !this.gamepadButtons.down) {
                    this.handleSoftDrop();
                    this.gamepadButtons.down = true;
                } else if (!downPressed) {
                    this.gamepadButtons.down = false;
                    this.stopSoftDrop();
                }
                
                // A button - rotate
                if (gamepad.buttons[0]?.pressed && !this.gamepadButtons.a) {
                    this.handleRotate();
                    this.gamepadButtons.a = true;
                } else if (!gamepad.buttons[0]?.pressed) {
                    this.gamepadButtons.a = false;
                }
                
                // B button - rotate counter-clockwise
                if (gamepad.buttons[1]?.pressed && !this.gamepadButtons.b) {
                    this.handleRotate(false);
                    this.gamepadButtons.b = true;
                } else if (!gamepad.buttons[1]?.pressed) {
                    this.gamepadButtons.b = false;
                }
                
                // X button - hold
                if (gamepad.buttons[2]?.pressed && !this.gamepadButtons.x) {
                    this.handleHold();
                    this.gamepadButtons.x = true;
                } else if (!gamepad.buttons[2]?.pressed) {
                    this.gamepadButtons.x = false;
                }
                
                // Y button - hard drop
                if (gamepad.buttons[3]?.pressed && !this.gamepadButtons.y) {
                    this.handleHardDrop();
                    this.gamepadButtons.y = true;
                } else if (!gamepad.buttons[3]?.pressed) {
                    this.gamepadButtons.y = false;
                }
                
                // Start button - pause
                if (gamepad.buttons[9]?.pressed && !this.gamepadButtons.start) {
                    this.handlePause();
                    this.gamepadButtons.start = true;
                } else if (!gamepad.buttons[9]?.pressed) {
                    this.gamepadButtons.start = false;
                }
            }
        }
        
        // Continue polling
        requestAnimationFrame(() => this.pollGamepad());
    }
}