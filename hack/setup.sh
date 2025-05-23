#!/usr/bin/env bash

set -e

echo ""
echo "🚀 Setting up dev CLI tool..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Repository
echo ""
echo "📦 Setting up dev repository..."
if [ ! -d "$HOME/.dev/.git" ]; then
  echo "   📥 Cloning repository..."
  git clone https://github.com/bai/dev.git "$HOME/.dev"
  echo "   ✅ Repository cloned"
else
  echo "   🔄 Updating existing repository..."
  cd "$HOME/.dev" && git pull
  echo "   ✅ Repository updated"
fi

# Step 2: Homebrew
echo ""
echo "🍺 Checking Homebrew..."
if ! command -v brew &>/dev/null; then
  echo "   📥 Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  echo "   🔧 Configuring Homebrew PATH..."
  if [[ "$(uname -m)" == "arm64" ]]; then
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  else
    echo 'eval "$(/usr/local/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  echo "   ✅ Homebrew installed and configured"
else
  echo "   ✅ Homebrew already installed"
fi

# Step 3: CLI Utilities
echo ""
echo "🛠️  Installing CLI utilities..."
for util in fd fzf fzy mise git 1password-cli; do
  if ! command -v "$util" &>/dev/null; then
    echo "   📥 Installing $util..."
    brew install "$util"
    echo "   ✅ $util installed"
  else
    echo "   ✅ $util already installed"
  fi
done

# Step 4: Bun Runtime
echo ""
echo "🏃 Setting up bun runtime..."
if ! command -v bun &>/dev/null; then
  echo "   📥 Installing bun via mise..."
  mise install bun@latest
  echo "   ✅ Bun installed"
else
  echo "   ✅ Bun already available"
fi

# Step 5: Dependencies
echo ""
echo "📚 Installing project dependencies..."
cd "$HOME/.dev"
bun install
echo "   ✅ Dependencies installed"

# Step 6: Google Cloud Config
echo ""
echo "☁️  Setting up Google Cloud configuration..."
if [ ! -d "$HOME/.config/gcloud" ]; then
  echo "   📂 Creating gcloud config directory..."
  mkdir -p "$HOME/.config/gcloud"
fi
echo "   📄 Copying cloud SDK components config..."
cp "$HOME/.dev/hack/configs/default-cloud-sdk-components" "$HOME/.config/gcloud/.default-cloud-sdk-components"
echo "   ✅ Google Cloud config ready"

# Step 7: Mise Configuration
echo ""
echo "🎯 Setting up mise configuration..."
if [ ! -d "$HOME/.config/mise" ]; then
  echo "   📂 Creating mise config directory..."
  mkdir -p "$HOME/.config/mise"
fi
if [ ! -f "$HOME/.config/mise/config.toml" ]; then
  echo "   📄 Copying mise global config..."
  cp "$HOME/.dev/hack/configs/mise-config-global.toml" "$HOME/.config/mise/config.toml"
  echo "   ✅ Mise config installed"
else
  echo "   ✅ Mise config already exists"
fi

# Step 8: Shell Integration
echo ""
echo "🐚 Setting up shell integration..."
if [ -f "$HOME/.zshrc" ]; then
  if ! grep -q "source \$HOME/.dev/hack/zshrc.sh" "$HOME/.zshrc"; then
    echo "   📝 Adding dev CLI to ~/.zshrc..."
    cat >> "$HOME/.zshrc" << 'EOF'

# Dev CLI integration
source $HOME/.dev/hack/zshrc.sh
EOF
    echo "   ✅ Shell integration added"
  else
    echo "   ✅ Shell integration already configured"
  fi
else
  echo "   ⚠️  ~/.zshrc not found - you may need to create it"
fi

# Step 9: Activate Changes
echo ""
echo "🔄 Activating changes..."
if [ -f "$HOME/.zshrc" ]; then
  source "$HOME/.zshrc" 2>/dev/null || true
  echo "   ✅ Shell configuration reloaded"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Dev CLI setup complete!"
echo ""
echo "💡 Usage examples:"
echo "   dev cd         → Interactive directory navigation"
echo "   dev cd <name>  → Jump to matching directory"
echo "   dev up         → Update development tools"
echo "   dev upgrade    → Update dev CLI itself"
echo "   dev help       → Show all available commands"
echo ""
echo "🔧 To start using dev CLI:"
echo "   • Restart your terminal, or"
echo "   • Run: source ~/.zshrc"
echo ""
