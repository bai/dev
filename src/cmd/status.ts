import { spawnSync } from "bun";
import fs from "fs";
import path from "path";
import { baseSearchDir, homeDir } from "~/utils";

/**
 * Shows status information about the dev environment
 */
export function handleStatusCommand(): void {
  console.log("🔍 Dev Environment Status\n");

  // Check base search directory
  console.log(`📁 Base search directory: ${baseSearchDir}`);
  if (fs.existsSync(baseSearchDir)) {
    try {
      const dirs = fs
        .readdirSync(baseSearchDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory()).length;
      console.log(`   ✅ Exists (${dirs} provider directories found)`);
    } catch (error) {
      console.log(`   ⚠️  Exists but cannot read contents`);
    }
  } else {
    console.log(`   ❌ Does not exist`);
  }

  // Check current directory
  const cwd = process.cwd();
  console.log(`\n📍 Current directory: ${cwd}`);

  // Check if we're in a git repository
  const gitDir = path.join(cwd, ".git");
  if (fs.existsSync(gitDir)) {
    console.log(`   ✅ Git repository detected`);

    // Try to get git status
    try {
      const gitStatus = spawnSync(["git", "status", "--porcelain"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (gitStatus.exitCode === 0 && gitStatus.stdout) {
        const changes = gitStatus.stdout
          .toString()
          .trim()
          .split("\n")
          .filter((line) => line.length > 0);
        if (changes.length > 0) {
          console.log(`   📝 ${changes.length} uncommitted changes`);
        } else {
          console.log(`   ✨ Working directory clean`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Could not check git status`);
    }
  } else {
    console.log(`   ℹ️  Not a git repository`);
  }

  // Check for mise configuration
  const miseConfig = path.join(cwd, ".config", "mise", "config.toml");
  if (fs.existsSync(miseConfig)) {
    console.log(`   ✅ Mise configuration found`);
  } else {
    console.log(`   ℹ️  No mise configuration`);
  }

  // Check required tools
  console.log(`\n🛠️  Required tools:`);
  const tools = [
    { name: "git", required: true },
    { name: "fd", required: true },
    { name: "fzf", required: true },
    { name: "mise", required: true },
    { name: "gh", required: false },
    { name: "glab", required: false },
    { name: "gcloud", required: false },
  ];

  for (const tool of tools) {
    try {
      const result = spawnSync(["which", tool.name], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      if (result.exitCode === 0) {
        const toolPath = result.stdout?.toString().trim();
        console.log(`   ✅ ${tool.name}: ${toolPath}`);
      } else {
        const status = tool.required ? "❌" : "⚠️ ";
        const note = tool.required ? " (required)" : " (optional)";
        console.log(`   ${status} ${tool.name}: not found${note}`);
      }
    } catch (error) {
      const status = tool.required ? "❌" : "⚠️ ";
      console.log(`   ${status} ${tool.name}: check failed`);
    }
  }

  // Check dev CLI version/update status
  console.log(`\n🚀 Dev CLI:`);
  const devDir = path.join(homeDir, ".dev");
  if (fs.existsSync(devDir)) {
    console.log(`   ✅ Installed at: ${devDir}`);

    // Check if it's a git repository to show version info
    const devGitDir = path.join(devDir, ".git");
    if (fs.existsSync(devGitDir)) {
      try {
        const gitLog = spawnSync(["git", "log", "-1", "--format=%h %s"], {
          cwd: devDir,
          stdio: ["ignore", "pipe", "pipe"],
        });

        if (gitLog.exitCode === 0 && gitLog.stdout) {
          const lastCommit = gitLog.stdout.toString().trim();
          console.log(`   📝 Latest commit: ${lastCommit}`);
        }
      } catch (error) {
        console.log(`   ⚠️  Could not check version info`);
      }
    }
  } else {
    console.log(`   ❌ Not found at expected location`);
  }

  console.log(`\n💡 Run 'dev help' for usage information`);
}
