#!/bin/bash
set -e

echo "Setting up dev CLI tool..."

# Create ~/.dev directory if it doesn't exist
if [ ! -d "$HOME/.dev" ]; then
  echo "Creating ~/.dev directory..."
  mkdir -p "$HOME/.dev"
fi

# Clone the repository
echo "Cloning dev repository to ~/.dev..."
git clone https://github.com/bai/dev.git "$HOME/.dev" 2>/dev/null || (cd "$HOME/.dev" && git pull)

# Install Homebrew if not installed
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

  # Add Homebrew to PATH for macOS
  if [[ "$(uname -m)" == "arm64" ]]; then
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  else
    echo 'eval "$(/usr/local/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

# Install mise using Homebrew
echo "Installing mise..."
brew install mise

# Install bun using mise
echo "Installing bun..."
mise install bun@latest

# Install dependencies
echo "Installing dependencies..."
cd "$HOME/.dev" && bun install

# Source the dev function from the repo's zshrc file
if [ -f "$HOME/.zshrc" ] && ! grep -q "source \$HOME/.dev/hack/zshrc.sh" "$HOME/.zshrc"; then
  echo "Adding source reference to ~/.zshrc..."
  cat >> "$HOME/.zshrc" << 'EOF'

source $HOME/.dev/hack/zshrc.sh
EOF
fi

echo "Setup complete! Please restart your terminal or run 'source ~/.zshrc' to start using dev."
echo "Usage examples:"
echo "  dev cd         # Interactive fuzzy search for directories"
echo "  dev cd <name>     # Direct navigation to best matching directory"
echo "  dev up         # Update development tools"
echo "  dev upgrade    # Update the dev CLI tool itself"
