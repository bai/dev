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
  local cd_target_file="$HOME/.local/share/dev/cd_target"

  # Ensure the file doesn't exist before running
  rm -f "$cd_target_file"

  # Run the command, allowing its output to go directly to the terminal
  bun "$HOME"/.dev/src/index.ts "$@"
  local exit_code=$?

  # After the command finishes, check if the target file was created
  if [[ -f "$cd_target_file" ]]; then
    local dir_to_cd
    dir_to_cd=$(<"$cd_target_file")
    rm -f "$cd_target_file"

    if [[ -n "$dir_to_cd" ]]; then
      cd "$dir_to_cd"
    fi
  fi

  return $exit_code
}
