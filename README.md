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
- `dev auth` - Authenticate with GitHub, GitLab, and Google Cloud
- `dev status` - Comprehensive environment status and health validation
- `dev run <task>` - Execute project tasks using mise

### 🛠️ **Maintenance**

- `dev upgrade` - Update the dev CLI tool itself
- `dev help` - Usage information

## 🚀 Installation

### Quick Install

```bash
# Set up using defaults
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/bai/dev/refs/heads/main/hack/setup.sh)"

# Provide your config file URL
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/bai/dev/refs/heads/main/hack/setup.sh)" -- --config-url=<your_config_url>
```

This will:

- Install the dev CLI tool to `~/.dev`
- Install required dependencies via Homebrew
- Configure your shell (adds to `~/.zshrc`)
- Set up mise configuration

You can also pass URL of your config file for `dev` to use. One pattern would be to create a gist and provide raw file URL from the gist.
You can find example config in (hack/configs/dev-config.json)[hack/configs/dev-config.json].

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/bai/dev.git ~/.dev

# Run setup
bash ~/.dev/hack/setup.sh
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
dev clone --org myorg myrepo
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

# Authenticate services
dev auth                   # All services
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
- Required tool availability (git, fd, fzf, fzy, mise)
- Optional tool status (gh, glab, gcloud)
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
