#!/usr/bin/env bash
#
# Dev CLI wrapper for interactive shells
#
# This script is used to wrap the dev command in a way that is compatible with
# interactive shells. It is sourced from the user's .zshrc file.

export FZF_DEFAULT_COMMAND='fd --type f --hidden --exclude .git --exclude node_modules'

export BUNDLE_IGNORE_MESSAGES=true
export BUNDLE_IGNORE_FUNDING_REQUESTS=true

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ANALYTICS=1
export HOMEBREW_NO_ENV_HINTS=1

function dev() {
  local result
  result=$(bun "$HOME"/.dev/src/index.ts "$@")
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
