# dev

A CLI tool for quick directory navigation within `~/src`.

## Features

- `dev cd` - Opens fzf fuzzy search for code directories located in `~/src`, limited to third level paths (e.g., `~/src/github.com/bai/dev`). After selection, it performs `cd` into that directory.
- `dev cd <folder_name>` - Picks the best matching directory at the third level and performs `cd` into it.

## Requirements

- [Bun](https://bun.sh) - Fast JavaScript runtime
- [fd](https://github.com/sharkdp/fd) - A faster alternative to find
- [fzf](https://github.com/junegunn/fzf) - Fuzzy finder
- grep, sed, sort, head - Standard Unix utilities

## Installation

1. Install dependencies:

```bash
bun install
```

2. Add the following to your shell config (~/.bashrc, ~/.zshrc, etc.):

```bash
alias dev='. _dev_wrapper'
_dev_wrapper() {
  local target_dir
  target_dir="$(bun /path/to/your/dev/index.ts "$@")"
  if [ -n "$target_dir" ]; then
    cd "$target_dir"
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
```
