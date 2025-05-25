#!/usr/bin/env bash

set -e

# Parse command line arguments
CONFIG_URL=""
for arg in "$@"; do
  case $arg in
    --config-url=*)
      CONFIG_URL="${arg#*=}"
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

echo ""
echo "🚀 Setting up dev CLI tool..."
echo ""

# Step 1: Repository
echo ""
echo "📦 Setting up dev repository..."
if [ ! -d "$HOME/.dev/.git" ]; then
  echo "   📥 Cloning repository..."
  git clone https://github.com/bai/dev.git "$HOME/.dev"
  echo "   ✅ Repository cloned"
else
  (cd "$HOME/.dev" && git pull 2>/dev/null) || true
  echo "   ✅ Repository updated"
fi

# Step 2: Config File (if provided)
if [ -n "$CONFIG_URL" ]; then
  echo ""
  echo "⚙️  Fetching configuration file..."
  echo "   📥 Downloading config from: $CONFIG_URL"
  if curl -fsSL "$CONFIG_URL" -o "$HOME/.dev/config.json"; then
    echo "   ✅ Configuration saved to ~/.dev/config.json"
  else
    echo "   ❌ Failed to download configuration file"
    echo "   ⚠️  Continuing with setup..."
  fi
fi

# Step 3: Homebrew
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

# Step 4: CLI Utilities
echo ""
echo "🛠️  Installing CLI utilities..."
for util in fd fzf fzy mise; do
  if ! command -v "$util" &>/dev/null; then
    echo "   📥 Installing $util..."
    brew install "$util"
    echo "   ✅ $util installed"
  else
    echo "   ✅ $util already installed"
  fi
done

# Step 5: Shell Integration
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
  source "$HOME/.zshrc" 2>/dev/null || true
  echo "   ✅ Shell configuration reloaded"
else
  echo "   ⚠️  ~/.zshrc not found - you may need to create it"
fi

# Step 7: Bun Runtime
echo ""
echo "🏃 Setting up bun runtime..."
if ! command -v bun &>/dev/null; then
  echo "   📥 Installing bun via mise..."
  mise install bun@latest
  echo "   ✅ Bun installed"
else
  echo "   ✅ Bun already available"
fi

# Step 8: Dev Setup
echo ""
bun run "$HOME"/.dev/src/index.ts setup
