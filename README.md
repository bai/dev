# dev

🚀 A powerful CLI tool for quick directory navigation, repository management, and development environment setup.

## ✨ Features

### 🧭 **Navigation**

- `dev ls` or `dev cd` - Interactive fuzzy search for code directories in `~/src`
- `dev cd <folder_name>` - Quick navigation to projects by name
- `dev open [folder_name]` - Open projects in your preferred editor/IDE

### 📦 **Repository Management**

- `dev clone <repo>` - Smart repository cloning with automatic provider detection
- Support for GitHub, GitLab, and custom organizations
- Automatic directory structure organization (`~/src/provider/org/repo`)

### 🔧 **Environment Management**

- `dev up` - Install and update development tools using mise
- `dev auth` - Authenticate with GitHub, GitLab, and Google Cloud
- `dev status` - Check your development environment health

### 🛠️ **Maintenance**

- `dev upgrade` - Update the dev CLI tool itself
- Automatic background updates (every 10 runs)
- `dev help` - Comprehensive usage information

## 📋 Requirements

- [Bun](https://bun.sh) - Fast JavaScript runtime
- [fd](https://github.com/sharkdp/fd) - A faster alternative to find
- [fzf](https://github.com/junegunn/fzf) - Fuzzy finder
- [mise](https://mise.jdx.dev/) - Development environment manager
- Standard Unix utilities: grep, sed, sort, head

### Optional Tools

- [gh](https://cli.github.com/) - GitHub CLI (for GitHub authentication)
- [glab](https://glab.readthedocs.io/) - GitLab CLI (for GitLab authentication)
- [gcloud](https://cloud.google.com/sdk/docs/install) - Google Cloud CLI

## 🚀 Installation

### Quick Install

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/bai/dev/refs/heads/main/hack/setup.sh)"
```

This will:

- Install the dev CLI tool to `~/.dev`
- Install required dependencies via Homebrew
- Configure your shell (adds to `~/.zshrc`)
- Set up mise configuration

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/bai/dev.git ~/.dev
cd ~/.dev

# Install dependencies
bun install

# Run setup
bash hack/setup.sh
```

## 📖 Usage

### Navigation Commands

```bash
# Interactive directory selection
dev ls
dev cd

# Direct navigation
dev cd myproject

# Open in editor
dev open                    # Current directory
dev open myproject         # Specific project
```

### Repository Management

```bash
# Clone with automatic detection
dev clone myrepo                           # Uses default org
dev clone org/myrepo                       # Specify organization
dev clone https://github.com/org/myrepo    # Full URL

# Provider-specific cloning
dev clone --github myrepo
dev clone --gitlab myrepo
dev clone --org myorg myrepo
```

### Environment Management

```bash
# Check environment status
dev status

# Set up development tools
dev up

# Authenticate services
dev auth                    # All services
dev auth github            # GitHub only
dev auth gitlab            # GitLab only
dev auth gcloud            # Google Cloud only
```

### Maintenance

```bash
# Update the CLI tool
dev upgrade

# Get help
dev help
```

## 🏗️ Directory Structure

The tool organizes repositories in a structured way:

```
~/src/
├── github.com/
│   ├── myorg/
│   │   ├── project1/
│   │   └── project2/
│   └── anotherorg/
│       └── project3/
└── gitlab.com/
    └── myorg/
        └── project4/
```

## ⚙️ Configuration

### Organization Mapping

Edit `src/utils.ts` to configure organization-to-provider mappings:

```typescript
export const orgToProvider: Record<string, GitProvider> = {
  flywheelsoftware: "gitlab",
  mycompany: "github",
  // Add your organizations here
};
```

### Default Organization

Change the default organization in `src/utils.ts`:

```typescript
export const defaultOrg = "your-default-org";
```

## 🔍 Troubleshooting

### Check Environment Status

```bash
dev status
```

This command shows:

- Base directory existence
- Required tool availability
- Git repository status
- Mise configuration
- CLI tool version

### Common Issues

#### "Command not found" errors

- Run `dev status` to check which tools are missing
- Install missing tools: `brew install fd fzf mise`

#### Directory not found

- Ensure `~/src` exists: `mkdir -p ~/src`
- Check directory structure matches expected format

#### Authentication issues

- Run `dev auth` to set up authentication
- For GitHub: `gh auth login`
- For GitLab: `glab auth login`

#### Permission errors during clone

- Check repository access permissions
- Verify authentication: `dev auth`

## 🛠️ Development

### Project Structure

```
.dev/
├── src/
│   ├── cmd/           # Command implementations
│   ├── utils.ts       # Shared utilities
│   └── index.ts       # Main CLI entry point
├── hack/
│   ├── setup.sh       # Installation script
│   ├── zshrc.sh       # Shell integration
│   └── configs/       # Configuration templates
└── package.json
```

### Running Locally

```bash
# Run directly
bun run src/index.ts --help

# Use npm scripts
bun run dev --help
bun run typecheck
bun run lint
```

### Adding New Commands

1. Create a new file in `src/cmd/`
2. Export a handler function
3. Add the command to `src/index.ts`
4. Update the usage information in `src/utils.ts`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh)
- Uses [fd](https://github.com/sharkdp/fd) for fast file finding
- Uses [fzf](https://github.com/junegunn/fzf) for fuzzy searching
- Environment management via [mise](https://mise.jdx.dev/)
