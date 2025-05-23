#!/usr/bin/env bash
set -e

echo "Setting up dev CLI tool..."

# Check if Xcode command line tools are installed
if ! xcode-select -p &>/dev/null; then
  echo "Xcode command line tools not found. Installing..."
  xcode-select --install
  echo ""
  echo "⚠️  Please complete the Xcode CLI tools installation in the dialog that appeared,"
  echo "   then re-run this setup script once the installation is finished."
  echo ""
  echo "   Re-run with: bash $0"
  exit 1
else
  echo "✅ Xcode command line tools already installed."
fi

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

# Install required CLI utilities for dev CLI
REQUIRED_UTILS=(fd fzf fzy mise)
for util in "${REQUIRED_UTILS[@]}"; do
  if ! command -v "$util" &>/dev/null; then
    echo "Installing $util..."
    brew install "$util"
  fi
done

# Install bun using mise
echo "Installing bun..."
mise install bun@latest

# Install dependencies
echo "Installing dependencies..."
cd "$HOME/.dev" && bun install

# Create gcloud config directory if it doesn't exist
if [ ! -d "$HOME/.config/gcloud" ]; then
  echo "Creating gcloud config directory..."
  mkdir -p "$HOME/.config/gcloud"
fi

# Copy default-cloud-sdk-components file
echo "Copying default-cloud-sdk-components file..."
cp "$HOME/.dev/hack/configs/default-cloud-sdk-components" "$HOME/.config/gcloud/.default-cloud-sdk-components"

# Create mise config directory if it doesn't exist
if [ ! -d "$HOME/.config/mise" ]; then
  echo "Creating mise config directory..."
  mkdir -p "$HOME/.config/mise"
fi

# Copy mise-config-global.toml if it doesn't exist
if [ ! -f "$HOME/.config/mise/config.toml" ]; then
  echo "Copying mise config file..."
  cp "$HOME/.dev/hack/configs/mise-config-global.toml" "$HOME/.config/mise/config.toml"
fi

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
echo "  dev cd <name>  # Direct navigation to best matching directory"
echo "  dev up         # Update development tools and mise configuration"
echo "  dev upgrade    # Update the dev CLI tool itself"
echo "  dev help       # Show help message"
