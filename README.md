# dev

A CLI tool for quick directory navigation within `~/src` and environment management.

## Features

- `dev cd` - Opens fzf fuzzy search for code directories located in `~/src`, limited to third level paths (e.g., `~/src/github.com/bai/dev`). After selection, it performs `cd` into that directory.
- `dev cd <folder_name>` - Picks the best matching directory at the third level and performs `cd` into it.
- `dev up` - Runs `mise up` to update development tools.
- `dev upgrade` - Updates the dev CLI tool to the latest version by running the setup script.

## Requirements

- [Bun](https://bun.sh) - Fast JavaScript runtime
- [fd](https://github.com/sharkdp/fd) - A faster alternative to find
- [fzf](https://github.com/junegunn/fzf) - Fuzzy finder
- [mise](https://mise.jdx.dev/) - Development environment manager
- grep, sed, sort, head - Standard Unix utilities

## Installation

1. Install dependencies:

```bash
bun install
```

2. Run the setup script:

```bash
bash hack/setup.sh
```

This will:
- Install the dev CLI tool to ~/.dev
- Install required dependencies
- Automatically add the necessary configuration to your ~/.zshrc

## Usage

```bash
# Interactive fuzzy search for directories
dev cd

# Direct navigation to best matching directory
dev cd dev

# Update development tools
dev up

# Update the dev CLI tool itself
dev upgrade
```
