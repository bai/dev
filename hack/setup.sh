#!/usr/bin/env zsh

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

# Homebrew
echo ""
echo "🍺 Checking Homebrew..."
if ! command -v brew &>/dev/null; then
  echo "   📥 Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  echo "   🔧 Configuring Homebrew..."
  eval "$(/opt/homebrew/bin/brew shellenv)"
  echo "   ✅ Homebrew installed and configured"
else
  echo "   ✅ Homebrew already installed"
fi

# Mise
echo ""
echo "🎯 Installing mise..."
curl -fsSL https://mise.run | MISE_QUIET=1 sh
echo "   🔧 Configuring Mise..."
eval "$(~/.local/bin/mise activate zsh)"
echo "   ✅ Mise installed"

# Bun Runtime
echo ""
echo "🏃 Setting up bun runtime..."
if ! command -v bun &>/dev/null; then
  echo "   📥 Installing bun via mise..."
  mise install bun@latest
  mise use -g bun@latest
  echo "   ✅ Bun installed"
else
  echo "   ✅ Bun already available"
fi

# Repository
echo ""
echo "📦 Setting up dev repository..."
if [ ! -d "$HOME/.dev/.git" ]; then
  echo "   📥 Cloning repository..."
  git clone https://github.com/bai/dev "$HOME/.dev"
  echo "   ✅ Repository cloned"
else
  (cd "$HOME/.dev" && git pull 2>/dev/null) || true
  echo "   ✅ Repository updated"
fi

# Dev state directory
mkdir -p "$HOME/.dev/state"

# Config File (if provided)
if [ -n "$CONFIG_URL" ]; then
  echo ""
  echo "⚙️  Fetching configuration file..."
  echo "   📥 Downloading config from: $CONFIG_URL"
  if curl -fsSL "$CONFIG_URL" -o "$HOME/.dev/state/config.json"; then
    echo "   ✅ Configuration saved to ~/.dev/state/config.json"
  else
    echo "   ❌ Failed to download configuration file"
    echo "   ⚠️  Continuing with setup..."
  fi
fi

# Shell Integration
echo ""
echo "🐚 Setting up shell integration..."
if [ ! -f "$HOME/.zshrc" ]; then
  echo "   📝 Creating ~/.zshrc..."
  touch "$HOME/.zshrc"
  echo "   ✅ ~/.zshrc created"
fi

if ! grep -q "source \$HOME/.dev/hack/zshrc.sh" "$HOME/.zshrc"; then
  echo "   📝 Adding dev CLI to ~/.zshrc..."
  echo 'source $HOME/.dev/hack/zshrc.sh' >> "$HOME/.zshrc"
  echo "   ✅ Shell integration added"
else
  echo "   ✅ Shell integration already configured"
fi
source "$HOME/.zshrc"
echo "   ✅ Shell configuration reloaded"

# Dependencies
echo ""
echo "📚 Installing project dependencies..."
cd "$HOME/.dev"
bun install
echo "   ✅ Dependencies installed"
