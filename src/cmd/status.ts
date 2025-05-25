import fs from "fs";
import path from "path";

import { spawnSync } from "bun";

import { baseSearchDir, devDir, homeDir } from "~/lib/constants";

/**
 * Shows comprehensive status information about the dev environment
 * and validates CLI functionality
 */
export function handleStatusCommand(): void {
  console.log("🔍 Dev Environment Status & Health Check\n");

  let testsPassed = 0;
  let testsFailed = 0;

  // Check base search directory
  console.log(`📁 Base search directory: ${baseSearchDir}`);
  if (fs.existsSync(baseSearchDir)) {
    try {
      const dirs = fs
        .readdirSync(baseSearchDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory()).length;
      console.log(`   ✅ Exists (${dirs} provider directories found)`);
      testsPassed++;
    } catch (error) {
      console.log(`   ⚠️  Exists but cannot read contents`);
      testsFailed++;
    }
  } else {
    console.log(`   ❌ Does not exist`);
    testsFailed++;
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
    { name: "fzy", required: true },
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
        if (tool.required) testsPassed++;
      } else {
        const status = tool.required ? "❌" : "⚠️ ";
        const note = tool.required ? " (required)" : " (optional)";
        console.log(`   ${status} ${tool.name}: not found${note}`);
        if (tool.required) testsFailed++;
      }
    } catch (error) {
      const status = tool.required ? "❌" : "⚠️ ";
      console.log(`   ${status} ${tool.name}: check failed`);
      if (tool.required) testsFailed++;
    }
  }

  // Check dev CLI installation and configuration
  console.log(`\n🚀 Dev CLI:`);
  if (fs.existsSync(devDir)) {
    console.log(`   ✅ Installed at: ${devDir}`);
    testsPassed++;

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

    // Check package.json validation
    const packageJsonPath = path.join(devDir, "package.json");
    try {
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        if (packageJson.name === "dev") {
          console.log(`   ✅ Package configuration valid`);
          testsPassed++;
        } else {
          console.log(`   ❌ Package.json has incorrect name`);
          testsFailed++;
        }
      } else {
        console.log(`   ❌ Package.json not found`);
        testsFailed++;
      }
    } catch (error) {
      console.log(`   ❌ Package.json is invalid JSON`);
      testsFailed++;
    }

    // Check source files
    const indexPath = path.join(devDir, "src", "index.ts");
    if (fs.existsSync(indexPath)) {
      console.log(`   ✅ Source files exist`);
      testsPassed++;
    } else {
      console.log(`   ❌ Source files not found`);
      testsFailed++;
    }
  } else {
    console.log(`   ❌ Not found at expected location`);
    testsFailed++;
  }

  // Check shell integration
  console.log(`\n🐚 Shell integration:`);
  const zshrcPath = path.join(homeDir, ".zshrc");
  if (fs.existsSync(zshrcPath)) {
    const zshrcContent = fs.readFileSync(zshrcPath, "utf-8");
    if (zshrcContent.includes("source $HOME/.dev/hack/zshrc.sh")) {
      console.log(`   ✅ Shell integration configured`);
      testsPassed++;
    } else {
      console.log(`   ⚠️  Shell integration not found in .zshrc`);
      console.log(`   💡 Run the setup script to configure shell integration`);
      testsFailed++;
    }
  } else {
    console.log(`   ⚠️  .zshrc not found`);
    testsFailed++;
  }

  // Health check summary
  const totalTests = testsPassed + testsFailed;
  const successRate = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;

  console.log(`\n📊 Health Check Summary:`);
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   📈 Success Rate: ${successRate}%`);

  if (testsFailed === 0) {
    console.log(`\n🎉 All checks passed! Your dev CLI is working correctly.`);
  } else {
    console.log(`\n⚠️  Some checks failed.`);
    console.log(`💡 Consider running the setup script: bash ~/.dev/hack/setup.sh`);
  }

  console.log(`\n💡 Run 'dev help' for usage information`);
}
