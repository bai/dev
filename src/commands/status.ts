import fs from "fs";
import path from "path";

import { count, desc } from "drizzle-orm";

import { baseSearchDir, devDbPath, devDir, homeDir } from "~/lib/constants";
import type { DevCommand } from "~/lib/core/command-types";
import { spawnCommand } from "~/lib/core/command-utils";
import { getDevConfig } from "~/lib/dev-config";
import { checkMiseVersion, miseMinVersion } from "~/lib/tools/mise";
import { db } from "~/drizzle";
import { runs } from "~/drizzle/schema";

export const statusCommand: DevCommand = {
  name: "status",
  description: "Shows comprehensive status information and validates CLI functionality",
  help: `
The status command performs a comprehensive health check of your dev environment:

- Validates directory structure and permissions
- Checks git repository status
- Verifies required tools installation
- Shows database statistics and usage
- Validates dev CLI configuration
- Checks shell integration

Examples:
  dev status              # Full health check
  `,

  async exec(context) {
    const { logger } = context;

    logger.info("🔍 Dev Environment Status & Health Check");
    logger.info("");

    let testsPassed = 0;
    let testsFailed = 0;

    // Check base search directory
    logger.info(`📁 Base search directory: ${baseSearchDir}`);
    if (fs.existsSync(baseSearchDir)) {
      try {
        const dirs = fs
          .readdirSync(baseSearchDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory()).length;
        logger.info(`   ✅ Exists (${dirs} provider directories found)`);
        testsPassed++;
      } catch (error) {
        logger.info(`   ⚠️  Exists but cannot read contents`);
        testsFailed++;
      }
    } else {
      logger.info(`   ❌ Does not exist`);
      testsFailed++;
    }

    // Check current directory
    const cwd = process.cwd();
    logger.info(`\n📍 Current directory: ${cwd}`);

    // Check if we're in a git repository
    const gitDir = path.join(cwd, ".git");
    if (fs.existsSync(gitDir)) {
      logger.info(`   ✅ Git repository detected`);

      // Try to get git status
      try {
        const gitStatus = spawnCommand(["git", "status", "--porcelain"], { silent: true });

        if (gitStatus.exitCode === 0 && gitStatus.stdout) {
          const changes = gitStatus.stdout
            .toString()
            .trim()
            .split("\n")
            .filter((line) => line.length > 0);
          if (changes.length > 0) {
            logger.info(`   📝 ${changes.length} uncommitted changes`);
          } else {
            logger.info(`   ✨ Working directory clean`);
          }
        }
      } catch (error) {
        logger.info(`   ⚠️  Could not check git status`);
      }
    } else {
      logger.info(`   ℹ️  Not a git repository`);
    }

    // Check for mise configuration
    const miseConfig = path.join(cwd, ".config", "mise", "config.toml");
    if (fs.existsSync(miseConfig)) {
      logger.info(`   ✅ Mise configuration found`);
    } else {
      logger.info(`   ℹ️  No mise configuration`);
    }

    // Display dev config values
    logger.info(`\n⚙️  Dev Configuration:`);
    try {
      const config = getDevConfig();
      logger.info(`   📋 Config URL: ${config.configUrl}`);
      logger.info(`   🏢 Default Org: ${config.defaultOrg}`);
      logger.info(`   🔗 Org Mappings:`);
      for (const [org, provider] of Object.entries(config.orgToProvider)) {
        logger.info(`      ${org} → ${provider}`);
      }
      if (config.mise?.settings?.trusted_config_paths && config.mise.settings.trusted_config_paths.length > 0) {
        logger.info(`   🛡️  Mise Trusted Paths:`);
        for (const trustedPath of config.mise.settings.trusted_config_paths) {
          logger.info(`      ${trustedPath}`);
        }
      }
      testsPassed++;
    } catch (error) {
      logger.info(`   ❌ Failed to load dev configuration`);
      testsFailed++;
    }

    // Check database status and stats
    logger.info(`\n💾 Database Status:`);
    if (fs.existsSync(devDbPath)) {
      logger.info(`   ✅ Database exists: ${devDbPath}`);
      try {
        const stats = fs.statSync(devDbPath);
        const sizeKB = Math.round(stats.size / 1024);
        logger.info(`   📊 Size: ${sizeKB} KB`);

        // Get database stats
        const totalRuns = await db.select({ count: count() }).from(runs);
        logger.info(`   📈 Total runs recorded: ${totalRuns[0]?.count || 0}`);

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
          logger.info(`   🏆 Most used commands:`);
          commandStats.slice(0, 5).forEach((stat) => {
            logger.info(`      ${stat.command}: ${stat.count} times`);
          });
        }

        testsPassed++;
      } catch (error) {
        logger.info(`   ⚠️  Database exists but cannot read stats`);
        testsFailed++;
      }
    } else {
      logger.info(`   ❌ Database not found at: ${devDbPath}`);
      testsFailed++;
    }

    // Check required tools
    logger.info(`\n🛠️  Required tools:`);
    const tools = [
      { name: "git", required: true },
      { name: "fzf", required: true },
      { name: "mise", required: true },
      { name: "gcloud", required: false },
    ];

    for (const tool of tools) {
      try {
        const result = spawnCommand(["which", tool.name], { silent: true });

        if (result.exitCode === 0) {
          const toolPath = result.stdout?.toString().trim();

          if (tool.name === "mise") {
            // Special handling for mise to show version information
            const { isValid, currentVersion } = checkMiseVersion();

            if (currentVersion) {
              const versionStatus = isValid ? "✅" : "⚠️ ";
              const versionNote = isValid
                ? ` (v${currentVersion})`
                : ` (v${currentVersion} - requires v${miseMinVersion}+)`;
              logger.info(`   ${versionStatus} ${tool.name}: ${toolPath}${versionNote}`);

              if (!isValid) {
                logger.info(`   💡 Run 'dev upgrade' to update mise to the required version`);
              }
            } else {
              logger.info(`   ⚠️  ${tool.name}: ${toolPath} (version check failed)`);
            }

            if (tool.required && isValid) testsPassed++;
            else if (tool.required) testsFailed++;
          } else {
            logger.info(`   ✅ ${tool.name}: ${toolPath}`);
            if (tool.required) testsPassed++;
          }
        } else {
          const status = tool.required ? "❌" : "⚠️ ";
          const note = tool.required ? " (required)" : " (optional)";
          logger.info(`   ${status} ${tool.name}: not found${note}`);
          if (tool.required) testsFailed++;
        }
      } catch (error) {
        const status = tool.required ? "❌" : "⚠️ ";
        logger.info(`   ${status} ${tool.name}: check failed`);
        if (tool.required) testsFailed++;
      }
    }

    // Check dev CLI installation and configuration
    logger.info(`\n🚀 Dev CLI:`);
    if (fs.existsSync(devDir)) {
      logger.info(`   ✅ Installed at: ${devDir}`);
      testsPassed++;

      // Check if it's a git repository to show version info
      const devGitDir = path.join(devDir, ".git");
      if (fs.existsSync(devGitDir)) {
        try {
          const gitLog = spawnCommand(["git", "log", "-1", "--format=%h %s"], {
            cwd: devDir,
            silent: true,
          });

          if (gitLog.exitCode === 0 && gitLog.stdout) {
            const lastCommit = gitLog.stdout.toString().trim();
            logger.info(`   📝 Latest commit: ${lastCommit}`);
          }
        } catch (error) {
          logger.info(`   ⚠️  Could not check version info`);
        }
      }
    } else {
      logger.info(`   ❌ Not found at expected location`);
      testsFailed++;
    }

    // Check shell integration
    logger.info(`\n🐚 Shell integration:`);
    const zshrcPath = path.join(homeDir, ".zshrc");
    if (fs.existsSync(zshrcPath)) {
      const zshrcContent = fs.readFileSync(zshrcPath, "utf-8");
      if (zshrcContent.includes("source $HOME/.dev/hack/zshrc.sh")) {
        logger.info(`   ✅ Shell integration configured`);
        testsPassed++;
      } else {
        logger.info(`   ⚠️  Shell integration not found in .zshrc`);
        logger.info(`   💡 Run the setup script to configure shell integration`);
        testsFailed++;
      }
    } else {
      logger.info(`   ⚠️  .zshrc not found`);
      testsFailed++;
    }

    // Health check summary
    logger.info(`\n📊 Health Check Summary:`);
    logger.info(`   ✅ Passed: ${testsPassed}`);
    logger.info(`   ❌ Failed: ${testsFailed}`);

    if (testsFailed === 0) {
      logger.success(`\n🎉 All checks passed! Your dev CLI is working correctly.`);
    } else {
      logger.warn(`\n⚠️  Some checks failed.`);
      logger.info(`💡 Consider running the setup script: zsh ~/.dev/hack/setup.sh`);
    }

    logger.info(`\n💡 Run 'dev help' for usage information`);
  },
};
