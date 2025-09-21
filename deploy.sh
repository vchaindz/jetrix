#!/bin/bash

# Deploy Jetrix to GitHub Pages
# This script builds the project and deploys it to the gh-pages branch

set -e

echo "🎮 Deploying Jetrix to GitHub Pages..."

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository"
    exit 1
fi

# Check if we have uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "⚠️  Warning: You have uncommitted changes"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled"
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build for GitHub Pages
echo "🔨 Building for GitHub Pages..."
npm run build:gh-pages

# Check if docs directory was created
if [ ! -d "docs" ]; then
    echo "❌ Error: Build failed - docs directory not found"
    exit 1
fi

# Add CNAME file if deploying to custom domain
# Uncomment and modify if you have a custom domain
# echo "yourdomain.com" > docs/CNAME

# Deploy using gh-pages
echo "🚀 Deploying to GitHub Pages..."
npx gh-pages -d docs -m "Deploy Jetrix $(date '+%Y-%m-%d %H:%M:%S')"

echo "✅ Deployment complete!"
echo "🎮 Your game will be available at: https://yourusername.github.io/jetrix/"
echo ""
echo "📝 Remember to:"
echo "   1. Enable GitHub Pages in repository settings"
echo "   2. Set source to 'gh-pages' branch"
echo "   3. Wait a few minutes for deployment to complete"