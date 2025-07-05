# <code>&gt; dev</code>

🚀 A powerful CLI tool for quick directory navigation, repository management, and development environment setup.

## ✨ Features

### 🧭 **Navigation**

- `dev cd` - Interactive fuzzy search for code directories in `~/src`
- `dev cd <folder_name>` - Quick navigation to projects by name

### 📦 **Repository Management**

- `dev clone <repo>` - Smart repository cloning with automatic provider detection
- Support for GitHub, GitLab, and custom organizations
- Automatic directory structure organization (`~/src/provider/org/repo`)

### 🔧 **Environment Management**

- `dev up` - Install and update development tools using mise
- `dev status` - Comprehensive environment status and health validation
- `dev run <task>` - Execute project tasks using mise

### 🛠️ **Maintenance**

- `dev upgrade` - Update the dev CLI tool itself

## 🚀 Installation

### Quick Install

```bash
# Set up using defaults
/bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/bai/dev/refs/heads/main/hack/setup.sh)"

# Provide your config file URL
/bin/zsh -c "$(curl -fsSL https://raw.githubusercontent.com/bai/dev/refs/heads/main/hack/setup.sh)" -- --config-url=<your_config_url>
```

This will:

- Install the dev CLI tool to `~/.dev`
- Install required dependencies via Homebrew
- Configure your shell (adds to `~/.zshrc`)
- Set up mise configuration

You can customize `dev` by providing your own configuration file URL. A common approach is to create a GitHub Gist and use its raw file URL. For reference, see the example configuration at [docs/examples/configs/example.json](docs/examples/configs/example.json).

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/bai/dev ~/.dev

# Run setup
zsh ~/.dev/hack/setup.sh
```

## 📖 Usage

### Navigation Commands

```bash
# Interactive directory selection
dev cd

# Direct navigation
dev cd myproject
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
```

### Environment Management

```bash
# Check environment status and validate installation
dev status

# Set up development tools
dev up

# Execute project tasks
dev run <task>              # Run specific task
dev run build --watch       # Run with arguments

```

### Maintenance

```bash
# Update the CLI tool
dev upgrade
```

## 💡 Tips

- Use `dev cd` without arguments for interactive fuzzy search
- Clone repos with just the name if using default org: `dev clone myrepo`
- Run `dev up` in any git repository to set up development tools
- Use `dev run <task>` to execute project-specific tasks with mise
- Use `dev status` to check your environment setup and validate installation

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

## 🔍 Troubleshooting

### Check Environment Status

```bash
dev status
```

This command shows:

- Base directory existence and validation
- Required tool availability (git, fzf, mise)
- Optional tool status (gcloud)
- Git repository status and uncommitted changes
- Mise configuration
- CLI tool installation and version
- Package configuration validation
- Source files verification
- Shell integration status
- Health check summary with pass/fail counts

## 🛠️ Development

### Running Locally

```bash
# Run directly
bun run src/index.ts --help

# Use npm scripts
bun run typecheck
bun run lint
```
