export BUNDLE_IGNORE_MESSAGES=true
export BUNDLE_IGNORE_FUNDING_REQUESTS=true

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ANALYTICS=1
export HOMEBREW_NO_ENV_HINTS=1

function dev() {
  local result
  result=$(bun "$HOME"/.dev/index.ts "$@")
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
