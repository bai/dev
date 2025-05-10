# dev

A CLI tool for quick directory navigation within `~/src` and environment management.

## Features

- `dev cd` - Opens fzf fuzzy search for code directories located in `~/src`, limited to third level paths (e.g., `~/src/github.com/bai/dev`). After selection, it performs `cd` into that directory.
- `dev cd <folder_name>` - Picks the best matching directory at the third level and performs `cd` into it.
- `dev up` - Runs `mise up` to update development tools.

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

2. Add the following to your shell config (~/.bashrc, ~/.zshrc, etc.):

```bash
function dev() {
  local result
  result=$(bun /path/to/your/dev/index.ts "$@")
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    return $exit_code
  fi

  # Check if the output starts with CD: to handle directory changes
  if [[ "$result" == CD:* ]]; then
    local dir="${result#CD:}"
    cd "$dir" || return
  else
    echo "$result"
  fi
}
```

Replace `/path/to/your/dev/index.ts` with the actual path to the script.

## Usage

```bash
# Interactive fuzzy search for directories
dev cd

# Direct navigation to best matching directory
dev cd dev

# Update development tools
dev up
```
