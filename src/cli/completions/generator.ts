import { Effect } from "effect";

import type { CliCommandSpec } from "../../domain/models";

/**
 * Shell completion generator
 * Generates completion scripts for bash, zsh, and fish
 */
export interface CompletionGenerator {
  generateBashCompletion(commands: CliCommandSpec[], programName: string): Effect.Effect<string, never>;
  generateZshCompletion(commands: CliCommandSpec[], programName: string): Effect.Effect<string, never>;
  generateFishCompletion(commands: CliCommandSpec[], programName: string): Effect.Effect<string, never>;
}

export class CompletionGeneratorImpl implements CompletionGenerator {
  generateBashCompletion(commands: CliCommandSpec[], programName: string): Effect.Effect<string, never> {
    return Effect.sync(() => {
      const commandNames = commands.map(cmd => cmd.name).join(' ');
      const aliases = commands.flatMap(cmd => cmd.aliases || []).join(' ');
      
      return `#!/bin/bash
# Bash completion for ${programName}

_${programName}_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    if [[ \${COMP_CWORD} == 1 ]]; then
        opts="${commandNames} ${aliases} completion version help"
        COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
        return 0
    fi

    # Command-specific completions
    case "\${COMP_WORDS[1]}" in
        cd)
            # Complete with directory names from base search directory
            COMPREPLY=( $(compgen -d -- \${cur}) )
            ;;
        clone)
            # Complete with repository names (could be enhanced with remote repos)
            return 0
            ;;
        completion)
            opts="bash zsh fish"
            COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
            ;;
        *)
            return 0
            ;;
    esac
}

complete -F _${programName}_completion ${programName}
`;
    });
  }

  generateZshCompletion(commands: CliCommandSpec[], programName: string): Effect.Effect<string, never> {
    return Effect.sync(() => {
      const commandCompletions = commands.map(cmd => {
        const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
        return `    "${cmd.name}:${cmd.description}${aliases}"`;
      }).join('\n');

      return `#compdef ${programName}

# Zsh completion for ${programName}

_${programName}() {
    local context state line
    typeset -A opt_args

    _arguments -C \\
        '1: :_${programName}_commands' \\
        '*::arg:->args'

    case $state in
        args)
            case $line[1] in
                cd)
                    _directories
                    ;;
                clone)
                    _message 'repository name'
                    ;;
                completion)
                    _arguments \\
                        '1:shell:(bash zsh fish)'
                    ;;
                help)
                    _${programName}_commands
                    ;;
            esac
            ;;
    esac
}

_${programName}_commands() {
    local commands; commands=(
${commandCompletions}
        "completion:Generate shell completion scripts"
        "version:Show version information"
        "help:Show help information"
    )
    _describe 'commands' commands
}

_${programName} "$@"
`;
    });
  }

  generateFishCompletion(commands: CliCommandSpec[], programName: string): Effect.Effect<string, never> {
    return Effect.sync(() => {
      const commandCompletions = commands.map(cmd => {
        const desc = cmd.description.replace(/'/g, "\\'");
        return `complete -c ${programName} -f -n "__fish_use_subcommand" -a "${cmd.name}" -d "${desc}"`;
      }).join('\n');

      const aliasCompletions = commands.flatMap(cmd => 
        (cmd.aliases || []).map(alias => 
          `complete -c ${programName} -f -n "__fish_use_subcommand" -a "${alias}" -d "Alias for ${cmd.name}"`
        )
      ).join('\n');

      return `# Fish completion for ${programName}

# Main commands
${commandCompletions}
${aliasCompletions}

# Built-in commands
complete -c ${programName} -f -n "__fish_use_subcommand" -a "completion" -d "Generate shell completion scripts"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "version" -d "Show version information"
complete -c ${programName} -f -n "__fish_use_subcommand" -a "help" -d "Show help information"

# Completion command options
complete -c ${programName} -f -n "__fish_seen_subcommand_from completion" -a "bash zsh fish" -d "Shell type"
complete -c ${programName} -f -n "__fish_seen_subcommand_from completion" -l install -d "Install completion for current shell"

# cd command - complete with directories
complete -c ${programName} -n "__fish_seen_subcommand_from cd" -a "(__fish_complete_directories)"

# Help command - complete with available commands
complete -c ${programName} -f -n "__fish_seen_subcommand_from help" -a "${commands.map(cmd => cmd.name).join(' ')}"
`;
    });
  }
}