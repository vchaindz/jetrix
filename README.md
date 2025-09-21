# 🎮 Jetrix - Neon Tetris

A modern, browser-based Tetris clone with beautiful neon aesthetics and distributed highscore capabilities.

![Jetrix Screenshot](https://via.placeholder.com/800x400/0a0a2a/00ffff?text=JETRIX+NEON+TETRIS)

## ✨ Features

- 🎯 **Classic Tetris Gameplay** - All 7 tetromino pieces with authentic mechanics
- 🌈 **Neon Aesthetic** - Glowing effects, particles, and smooth animations
- 🎮 **Multiple Control Options** - Keyboard, touch, and gamepad support
- 📊 **Highscore System** - Local storage with future distributed sync support
- 📱 **Responsive Design** - Works perfectly on desktop and mobile
- 🎵 **Sound Effects** - Audio feedback for moves and line clears
- 🏆 **4 Difficulty Modes** - Easy, Normal, Hard, Extreme
- 💾 **Persistent Storage** - Scores saved locally across sessions
- 🔄 **Hold Piece** - Strategic piece holding mechanism
- 👁️ **Ghost Piece** - Shows where your piece will land
- ⚡ **60 FPS Rendering** - Smooth canvas-based graphics

## 🚀 Quick Start

### Play Online
Visit the live demo: **[https://yourusername.github.io/jetrix/](https://yourusername.github.io/jetrix/)**

### Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/jetrix.git
cd jetrix

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## 🎮 How to Play

### Controls
- **←→ Arrow Keys** - Move piece left/right
- **↑ Arrow Key** - Rotate piece clockwise
- **↓ Arrow Key** - Soft drop (faster descent)
- **Space Bar** - Hard drop (instant placement)
- **C** - Hold current piece
- **Escape** - Pause/Resume game

### Touch Controls (Mobile)
- **Tap** - Rotate piece
- **Swipe Left/Right** - Move piece
- **Swipe Down** - Soft drop
- **Quick Swipe Up** - Hard drop

### Gamepad Support
- **D-Pad/Left Stick** - Move and rotate
- **A Button** - Rotate clockwise
- **B Button** - Rotate counter-clockwise
- **X Button** - Hold piece
- **Y Button** - Hard drop
- **Start Button** - Pause

## 🚀 GitHub Pages Deployment

### Automatic Deployment (Recommended)

1. **Fork this repository** or push to your GitHub repo
2. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Set source to "GitHub Actions"
3. **Push to main branch** - Automatic deployment will trigger
4. **Visit your game** at `https://yourusername.github.io/jetrix/`

### Manual Deployment

```bash
# Option 1: Using the deploy script
./deploy.sh

# Option 2: Using npm scripts
npm run deploy

# Option 3: Manual build and deploy
npm run build:gh-pages
npx gh-pages -d docs
```

### Custom Domain (Optional)

1. Add your domain to `docs/CNAME` file:
   ```
   yourdomain.com
   ```

2. Configure DNS to point to GitHub Pages:
   ```
   CNAME: yourusername.github.io
   ```

## 🛠️ Development

### Project Structure
```
jetrix/
├── index.html          # Main game page
├── css/
│   └── styles.css      # Neon styling and animations
├── js/
│   ├── tetris.js       # Core game engine
│   ├── renderer.js     # Canvas rendering and effects
│   ├── controls.js     # Input handling (keyboard/touch/gamepad)
│   └── highscore.js    # Score management
├── .github/
│   └── workflows/
│       └── deploy.yml  # Automatic GitHub Pages deployment
├── docs/               # Built files for GitHub Pages
├── deploy.sh          # Manual deployment script
└── vite.config.js     # Build configuration
```

### Build Commands
```bash
npm run dev             # Development server
npm run build           # Production build
npm run build:gh-pages  # Build for GitHub Pages
npm run preview         # Preview production build
npm run deploy          # Deploy to GitHub Pages
```

### Adding Features

The codebase is modular and easy to extend:

1. **Game Logic** - Modify `js/tetris.js`
2. **Visual Effects** - Update `js/renderer.js`
3. **Controls** - Extend `js/controls.js`
4. **Styling** - Customize `css/styles.css`
5. **Scoring** - Enhance `js/highscore.js`

## 🌐 Distributed Highscores

The game includes a comprehensive guide for implementing distributed highscores across players. See `distributed-highscore.md` for implementations using:

- **WebSocket Server** - Real-time sync
- **Firebase** - Easy cloud integration
- **P2P WebRTC** - Serverless peer-to-peer
- **GitHub Gist** - Free and simple backend

## 🎨 Customization

### Themes
Modify the CSS custom properties in `css/styles.css`:

```css
:root {
  --primary-glow: #00ffff;
  --secondary-glow: #ff00ff;
  --background-start: #0a0a0a;
  --background-end: #2a0a3a;
}
```

### Game Balance
Adjust game parameters in `js/tetris.js`:

```javascript
const CONFIG = {
  INITIAL_SPEED: 800,
  SPEED_INCREASE: 50,
  POINTS: {
    SINGLE: 100,
    TETRIS: 800,
    // ... more settings
  }
};
```

## 🔧 Troubleshooting

### Common Issues

**Game doesn't load on GitHub Pages**
- Check that the repository name matches the base path in `vite.config.js`
- Ensure `.nojekyll` file exists in the root directory
- Verify GitHub Pages is enabled in repository settings

**Controls not working**
- Make sure the game canvas has focus (click on it)
- Check browser console for JavaScript errors
- Try refreshing the page

**Scores not saving**
- Check if localStorage is enabled in your browser
- Clear browser cache and try again
- Open browser developer tools to check for errors

### Browser Compatibility

- **Chrome/Edge** ✅ Full support
- **Firefox** ✅ Full support  
- **Safari** ✅ Full support
- **Mobile browsers** ✅ Touch controls

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 🎯 Roadmap

- [ ] Sound effects and background music
- [ ] Particle system enhancements
- [ ] Achievement system
- [ ] Tournament mode
- [ ] Real-time multiplayer
- [ ] Mobile app version
- [ ] AI opponent training

## 🙏 Acknowledgments

- Original Tetris concept by Alexey Pajitnov
- Modern web technologies: HTML5 Canvas, ES6 Modules, CSS3
- Inspired by neon aesthetic and retro gaming

---

**Made with ❤️ and lots of ☕**

*Ready to drop some blocks? [Play Jetrix now!](https://yourusername.github.io/jetrix/)*