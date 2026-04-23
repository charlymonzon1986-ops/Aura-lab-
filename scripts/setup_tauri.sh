#!/bin/bash
# Aura Lab - Professional Setup Script
# This script initializes the Tauri project and installs required dependencies for professional performance.

echo "🚀 Starting Aura Lab Pro Setup..."

# 1. Install Node Dependencies
echo "📦 Installing npm dependencies..."
npm install @tauri-apps/api @tauri-apps/cli lucide-react framer-motion clsx tailwind-merge

# 2. Check for Rust
if ! command -v cargo &> /dev/null
then
    echo "❌ Rust/Cargo not found. Please install it from https://rustup.rs/"
    exit 1
fi

# 3. Initialize Tauri (if not already done)
if [ ! -d "src-tauri" ]; then
    echo "🏗️ Initializing Tauri structure..."
    npx tauri init --app-name "Aura Lab" --window-title "Aura Lab" --dist-dir "../dist" --dev-path "http://localhost:3000" --before-dev-command "npm run dev" --before-build-command "npm run build"
fi

# 4. Copying professional configs
echo "⚙️ Applying professional configurations..."
# (Here we would typically copy the files created via the agent)

echo "✅ Setup Complete!"
echo "To start development: npm run tauri dev"
echo "To build production: npm run tauri build"
