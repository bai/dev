#!/usr/bin/env zsh

set -eu

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

# Step 0: Install mise
echo ""
echo "🎯 Installing mise..."
sh hack/mise-setup.sh
echo "eval \"\$($HOME/.local/bin/mise activate zsh)\"" >> "$HOME/.zshrc"

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

# Step 2: Create dev data and config directories
mkdir -p "$HOME/.local/share/dev"
mkdir -p "$HOME/.config/dev"

# Step 3: Config File (if provided)
if [ -n "$CONFIG_URL" ]; then
  echo ""
  echo "⚙️  Fetching configuration file..."
  echo "   📥 Downloading config from: $CONFIG_URL"
  if curl -fsSL "$CONFIG_URL" -o "$HOME/.config/dev/config.json"; then
    echo "   ✅ Configuration saved to ~/.config/dev/config.json"
  else
    echo "   ❌ Failed to download configuration file"
    echo "   ⚠️  Continuing with setup..."
  fi
fi

# Step 4: Shell Integration
echo ""
echo "🐚 Setting up shell integration..."
if [ -f "$HOME/.zshrc" ]; then
  if ! grep -q "source \$HOME/.dev/hack/zshrc.sh" "$HOME/.zshrc"; then
    echo "   📝 Adding dev CLI to ~/.zshrc..."
    echo 'source $HOME/.dev/hack/zshrc.sh' >> "$HOME/.zshrc"
    echo "   ✅ Shell integration added"
  else
    echo "   ✅ Shell integration already configured"
  fi
  source "$HOME/.zshrc"
  echo "   ✅ Shell configuration reloaded"
else
  echo "   ⚠️  ~/.zshrc not found - you may need to create it"
fi

# Step 5: Bun Runtime
echo ""
echo "🏃 Setting up bun runtime..."
if ! command -v bun &>/dev/null; then
  echo "   📥 Installing bun via mise..."
  mise install bun@latest
  echo "   ✅ Bun installed"
else
  echo "   ✅ Bun already available"
fi

# Step 6: Dependencies
echo ""
echo "📚 Installing project dependencies..."
cd "$HOME/.dev"
bun install
echo "   ✅ Dependencies installed"

# Step 7: Dev Setup
echo ""
bun run "$HOME"/.dev/src/index.ts setup
