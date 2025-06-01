# Dev CLI wrapper for interactive shells
#
# This script is used to wrap the dev command in a way that is compatible with
# interactive shells. It is sourced from the user's .zshrc file.

[[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
[[ -x ~/.local/bin/mise ]] && eval "$(~/.local/bin/mise activate zsh)"
[ -f "$HOME"/.local/share/mise/installs/gcloud/latest/path.zsh.inc ] && source "$HOME"/.local/share/mise/installs/gcloud/latest/path.zsh.inc
[ -f "$HOME"/.local/share/mise/installs/gcloud/latest/completion.zsh.inc ] && source "$HOME"/.local/share/mise/installs/gcloud/latest/completion.zsh.inc

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

  # Look for a CD: directive anywhere in the output
  local cd_line
  cd_line=$(echo "$result" | grep "^CD:" || true)

  if [[ -n "$cd_line" ]]; then
    # Extract the directory path from the CD: line
    local dir="${cd_line#CD:}"

    # Print all output except the CD: line
    echo "$result" | grep -v "^CD:"

    # Change to the directory
    cd "$dir" || return
  else
    # No CD directive, just print the output
    echo "$result"
  fi
}
