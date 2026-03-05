import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, "..", "..");
const CLI_ENTRYPOINT = path.join(REPO_ROOT, "src", "index.ts");

export interface CliRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface E2eFixture {
  readonly rootDir: string;
  readonly homeDir: string;
  readonly configHome: string;
  readonly dataHome: string;
  readonly cacheHome: string;
  readonly baseSearchPath: string;
  readonly fakeBinDir: string;
  readonly commandLogPath: string;
}

export interface FixtureOptions {
  readonly includeLocalConfig?: boolean;
  readonly seedDefaultRepositories?: boolean;
}

export interface CliRunOptions {
  readonly envOverrides?: Readonly<Record<string, string>>;
}

const writeExecutable = async (filePath: string, content: string): Promise<void> => {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
};

const createStubBinaries = async (fakeBinDir: string): Promise<void> => {
  await fs.mkdir(fakeBinDir, { recursive: true });

  await writeExecutable(
    path.join(fakeBinDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'git %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${1-}" == "--version" ]]; then
  echo "git version 2.60.1"
  exit 0
fi

if [[ "\${1-}" == "clone" ]]; then
  destination="\${3-}"
  mkdir -p "\${destination}/.git"
  echo "ref: refs/heads/main" > "\${destination}/.git/HEAD"
  exit 0
fi

if [[ "\${1-}" == "pull" ]]; then
  if [[ "\${DEV_E2E_GIT_PULL_FAIL:-}" == "1" ]]; then
    echo "simulated git pull failure" >&2
    exit 1
  fi
  echo "Already up to date."
  exit 0
fi

if [[ "\${1-}" == "rev-parse" && "\${2-}" == "--git-dir" ]]; then
  if [[ "\${DEV_E2E_GIT_REPO_MISSING:-}" == "1" ]]; then
    echo "fatal: not a git repository" >&2
    exit 128
  fi
  echo ".git"
  exit 0
fi

if [[ "\${1-}" == "rev-parse" && "\${2-}" == "HEAD" ]]; then
  echo "deadbeefcafebabe1234567890abcdef12345678"
  exit 0
fi

if [[ "\${1-}" == "remote" && "\${2-}" == "get-url" && "\${3-}" == "origin" ]]; then
  echo "https://github.com/acme/sample.git"
  exit 0
fi

if [[ "\${1-}" == "rev-parse" && "\${2-}" == "--abbrev-ref" && "\${3-}" == "HEAD" ]]; then
  echo "main"
  exit 0
fi

if [[ "\${1-}" == "config" && "\${2-}" == "--get" && "\${3-}" == "remote.origin.url" ]]; then
  echo "https://github.com/acme/sample.git"
  exit 0
fi

echo "unsupported git invocation: $*" >&2
exit 1
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "mise"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'mise %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${1-}" == "--version" ]]; then
  if [[ "\${DEV_E2E_MISE_MISSING:-}" == "1" ]]; then
    echo "mise: command not found" >&2
    exit 127
  fi
  echo "2026.2.0 macos-arm64 (2026-02-10)"
  exit 0
fi

if [[ "\${1-}" == "current" ]]; then
  printf 'bun 1.3.8\\nnode 22.3.0\\n'
  exit 0
fi

if [[ "\${1-}" == "install" ]]; then
  if [[ "\${DEV_E2E_MISE_INSTALL_FAIL:-}" == "1" ]]; then
    echo "simulated mise install failure" >&2
    exit 1
  fi
  echo "mise install ok"
  exit 0
fi

if [[ "\${1-}" == "tasks" && "\${2-}" == "--list" ]]; then
  if [[ "\${DEV_E2E_MISE_NO_TASKS:-}" == "1" ]]; then
    exit 0
  fi
  printf 'build\\nstart\\ntest\\n'
  exit 0
fi

if [[ "\${1-}" == "run" ]]; then
  if [[ "\${DEV_E2E_MISE_RUN_FAIL:-}" == "1" ]]; then
    echo "simulated mise run failure" >&2
    exit 1
  fi
  echo "mise run \${2-}"
  exit 0
fi

if [[ "\${1-}" == "which" && -n "\${2-}" ]]; then
  echo "/stub/bin/\${2-}"
  exit 0
fi

if [[ "\${1-}" == "version" && "\${2-}" == "--json" ]]; then
  echo '{"version":"2026.2.0","latest":"2026.2.0"}'
  exit 0
fi

if [[ "\${1-}" == "self-update" ]]; then
  echo "mise updated"
  exit 0
fi

echo "unsupported mise invocation: $*" >&2
exit 1
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "docker"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'docker %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${1-}" == "--version" ]]; then
  echo "Docker version 29.2.0, build deadbeef"
  exit 0
fi

if [[ "\${1-}" == "info" ]]; then
  if [[ "\${DEV_E2E_DOCKER_INFO_FAIL:-}" == "1" ]]; then
    echo "Cannot connect to the Docker daemon" >&2
    exit 1
  fi
  echo "Docker Engine - Community"
  exit 0
fi

if [[ "\${1-}" != "compose" ]]; then
  echo "unsupported docker invocation: $*" >&2
  exit 1
fi

shift
if [[ "\${1-}" == "version" ]]; then
  echo "Docker Compose version v2.35.0"
  exit 0
fi

if [[ "\${1-}" == "-f" ]]; then
  shift 2
fi

if [[ "\${1-}" == "up" || "\${1-}" == "down" || "\${1-}" == "stop" || "\${1-}" == "restart" || "\${1-}" == "logs" ]]; then
  if [[ "\${DEV_E2E_DOCKER_COMPOSE_FAIL:-}" == "1" ]]; then
    echo "simulated docker compose failure for \${1-}" >&2
    exit 1
  fi
  if [[ "\${1-}" == "logs" && "\${DEV_E2E_DOCKER_LOGS_FAIL:-}" == "1" ]]; then
    echo "simulated docker compose logs failure" >&2
    exit 1
  fi
  exit 0
fi

if [[ "\${1-}" == "ps" ]]; then
  echo '{"Name":"dev-postgres17","State":"running","Health":"healthy","Status":"Up 3 minutes"}'
  echo '{"Name":"dev-valkey","State":"running","Health":"healthy","Status":"Up 3 minutes"}'
  exit 0
fi

exit 0
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "bun"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'bun %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${1-}" == "--version" ]]; then
  echo "1.3.8"
  exit 0
fi

if [[ "\${1-}" == "install" ]]; then
  echo "bun install ok"
  exit 0
fi

if [[ "\${1-}" == "upgrade" ]]; then
  echo "bun upgrade ok"
  exit 0
fi

echo "unsupported bun invocation: $*" >&2
exit 1
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "fzf"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'fzf %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${1-}" == "--version" ]]; then
  echo "0.67.1 (stub)"
  exit 0
fi

IFS= read -r first_line || true
if [[ -n "\${first_line-}" ]]; then
  echo "\${first_line}"
fi
exit 0
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "gcloud"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'gcloud %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${1-}" == "version" ]]; then
  if [[ "\${DEV_E2E_GCLOUD_MISSING:-}" == "1" ]]; then
    echo "gcloud: command not found" >&2
    exit 127
  fi
  echo "Google Cloud SDK 552.1.0"
  exit 0
fi

echo "unsupported gcloud invocation: $*" >&2
exit 1
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "sh"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'sh %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

if [[ "\${DEV_E2E_SH_FAIL:-}" == "1" ]]; then
  echo "simulated sh failure" >&2
  exit 1
fi

exit 0
`,
  );

  await writeExecutable(
    path.join(fakeBinDir, "which"),
    `#!/usr/bin/env bash
set -euo pipefail

if [[ -n "\${DEV_E2E_LOG:-}" ]]; then
  printf 'which %s\\n' "$*" >> "\${DEV_E2E_LOG}"
fi

echo "/usr/bin/\${1-}"
`,
  );
};

export const createFixture = async (options: FixtureOptions = {}): Promise<E2eFixture> => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-e2e-"));
  const homeDir = path.join(rootDir, "home");
  const configHome = path.join(rootDir, "xdg-config");
  const dataHome = path.join(rootDir, "xdg-data");
  const cacheHome = path.join(rootDir, "xdg-cache");
  const baseSearchPath = path.join(rootDir, "workspace");
  const fakeBinDir = path.join(rootDir, "fake-bin");
  const commandLogPath = path.join(rootDir, "command.log");

  await fs.mkdir(homeDir, { recursive: true });
  await fs.mkdir(configHome, { recursive: true });
  await fs.mkdir(dataHome, { recursive: true });
  await fs.mkdir(cacheHome, { recursive: true });
  await fs.mkdir(baseSearchPath, { recursive: true });

  // Mimic the runtime expectation that migrations live under $HOME/.dev.
  const devDir = path.join(homeDir, ".dev");
  const migrationsSource = path.join(REPO_ROOT, "drizzle", "migrations");
  const migrationsDestination = path.join(devDir, "drizzle", "migrations");
  await fs.mkdir(path.dirname(migrationsDestination), { recursive: true });
  await fs.cp(migrationsSource, migrationsDestination, { recursive: true });

  const projectConfig = {
    configUrl: "http://127.0.0.1:1/config.json",
    defaultOrg: "acme",
    defaultProvider: "github",
    baseSearchPath,
    telemetry: { mode: "disabled" },
    miseGlobalConfig: {
      tools: {
        bun: "1.3.8",
      },
    },
    services: {
      postgres17: {},
      valkey: {},
    },
  };
  await fs.writeFile(path.join(devDir, "config.json"), JSON.stringify(projectConfig, null, 2), "utf8");

  if (options.includeLocalConfig !== false) {
    const localConfigPath = path.join(configHome, "dev", "config.json");
    await fs.mkdir(path.dirname(localConfigPath), { recursive: true });
    await fs.writeFile(localConfigPath, JSON.stringify(projectConfig, null, 2), "utf8");
  }

  if (options.seedDefaultRepositories !== false) {
    await fs.mkdir(path.join(baseSearchPath, "github.com", "acme", "alpha"), { recursive: true });
    await fs.mkdir(path.join(baseSearchPath, "github.com", "acme", "bravo"), { recursive: true });
  }

  await createStubBinaries(fakeBinDir);

  return {
    rootDir,
    homeDir,
    configHome,
    dataHome,
    cacheHome,
    baseSearchPath,
    fakeBinDir,
    commandLogPath,
  };
};

export const runCli = async (fixture: E2eFixture, args: readonly string[], options: CliRunOptions = {}): Promise<CliRunResult> => {
  const inheritedPath = process.env.PATH ? `:${process.env.PATH}` : "";
  const env = {
    ...process.env,
    HOME: fixture.homeDir,
    XDG_CONFIG_HOME: fixture.configHome,
    XDG_DATA_HOME: fixture.dataHome,
    XDG_CACHE_HOME: fixture.cacheHome,
    PATH: `${fixture.fakeBinDir}${inheritedPath}`,
    DEV_E2E_LOG: fixture.commandLogPath,
    NO_COLOR: "1",
    ...options.envOverrides,
  };

  const proc = Bun.spawn([process.execPath, CLI_ENTRYPOINT, ...args], {
    cwd: REPO_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);

  return {
    exitCode,
    stdout,
    stderr,
  };
};

export const readCommandLog = async (fixture: E2eFixture): Promise<string> => {
  try {
    return await fs.readFile(fixture.commandLogPath, "utf8");
  } catch {
    return "";
  }
};

export const readCdTargets = async (fixture: E2eFixture): Promise<string[]> => {
  const candidateDirectories = [
    path.join(fixture.dataHome, "dev"),
    path.join(fixture.homeDir, ".local", "share", "dev"),
    path.join(os.homedir(), ".local", "share", "dev"),
  ];

  const targets: string[] = [];

  for (const directoryPath of candidateDirectories) {
    const files = await fs.readdir(directoryPath).catch(() => [] as string[]);
    const targetFiles = files.filter((fileName) => fileName.startsWith("cd_target."));

    for (const targetFile of targetFiles) {
      const targetPath = await fs
        .readFile(path.join(directoryPath, targetFile), "utf8")
        .then((content) => content.trim())
        .catch(() => "");

      if (targetPath.length > 0) {
        targets.push(targetPath);
      }
    }
  }

  return targets;
};

export const withFixture = async (run: (fixture: E2eFixture) => Promise<void>, options: FixtureOptions = {}): Promise<void> => {
  const fixture = await createFixture(options);
  try {
    await run(fixture);
  } finally {
    await fs.rm(fixture.rootDir, { recursive: true, force: true });
  }
};
