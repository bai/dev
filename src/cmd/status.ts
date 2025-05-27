import fs from "fs";
import path from "path";
import { spawnSync } from "bun";

import { count, desc } from "drizzle-orm";

import { baseSearchDir, devDbPath, devDir, homeDir } from "~/lib/constants";
import { getDevConfig } from "~/lib/dev-config";
import { db } from "~/drizzle";
import { runs } from "~/drizzle/schema";

/**
 * Helper function to format time ago
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

/**
 * Shows comprehensive status information about the dev environment
 * and validates CLI functionality
 */
export async function handleStatusCommand(): Promise<void> {
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

  // Display dev config values
  console.log(`\n⚙️  Dev Configuration:`);
  try {
    const config = getDevConfig();
    console.log(`   📋 Config URL: ${config.configUrl}`);
    console.log(`   🏢 Default Org: ${config.defaultOrg}`);
    console.log(`   🔗 Org Mappings:`);
    for (const [org, provider] of Object.entries(config.orgToProvider)) {
      console.log(`      ${org} → ${provider}`);
    }
    if (config.mise?.trusted_config_paths && config.mise.trusted_config_paths.length > 0) {
      console.log(`   🛡️  Mise Trusted Paths:`);
      for (const trustedPath of config.mise.trusted_config_paths) {
        console.log(`      ${trustedPath}`);
      }
    }
    testsPassed++;
  } catch (error) {
    console.log(`   ❌ Failed to load dev configuration`);
    testsFailed++;
  }

  // Check database status and stats
  console.log(`\n💾 Database Status:`);
  if (fs.existsSync(devDbPath)) {
    console.log(`   ✅ Database exists: ${devDbPath}`);
    try {
      const stats = fs.statSync(devDbPath);
      const sizeKB = Math.round(stats.size / 1024);
      console.log(`   📊 Size: ${sizeKB} KB`);

      // Get database stats
      const totalRuns = await db.select({ count: count() }).from(runs);
      console.log(`   📈 Total runs recorded: ${totalRuns[0]?.count || 0}`);

      // Get command usage stats
      const commandStats = await db
        .select({
          command: runs.command_name,
          count: count(),
        })
        .from(runs)
        .groupBy(runs.command_name)
        .orderBy(desc(count()));

      if (commandStats.length > 0) {
        console.log(`   🏆 Most used commands:`);
        commandStats.slice(0, 5).forEach((stat) => {
          console.log(`      ${stat.command}: ${stat.count} times`);
        });
      }

      // Get recent runs
      const recentRuns = await db
        .select({
          command: runs.command_name,
          started_at: runs.started_at,
        })
        .from(runs)
        .orderBy(desc(runs.started_at))
        .limit(3);

      if (recentRuns.length > 0) {
        console.log(`   🕐 Recent runs:`);
        recentRuns.forEach((run) => {
          const date = new Date(run.started_at);
          const timeAgo = getTimeAgo(date);
          console.log(`      ${run.command} - ${timeAgo}`);
        });
      }

      testsPassed++;
    } catch (error) {
      console.log(`   ⚠️  Database exists but cannot read stats`);
      testsFailed++;
    }
  } else {
    console.log(`   ❌ Database not found at: ${devDbPath}`);
    testsFailed++;
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
    console.log(`💡 Consider running the setup script: zsh ~/.dev/hack/setup.sh`);
  }

  console.log(`\n💡 Run 'dev help' for usage information`);
}
