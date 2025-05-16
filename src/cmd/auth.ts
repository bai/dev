import { spawn } from "child_process";

function printAuthHelp(): void {
  console.log(`
Usage: dev auth <command>

Commands:
  github              Authenticate with GitHub.
  gitlab              Authenticate with GitLab.
  gcloud login        Authenticate with Google Cloud (user account).
  gcloud app-login    Authenticate with Google Cloud (application default credentials).
`);
}

function handleGithubAuth(): void {
  console.log("Attempting GitHub authentication...");
  console.log(
    "Please run 'gh auth login' to authenticate with GitHub if prompted or if this step fails."
  );
  console.log(
    "If 'gh' is not installed, please install it first: https://cli.github.com/"
  );
  // We can't directly invoke interactive prompts well, so we guide the user.
  // If gh auth status could be used non-interactively, that would be an option.
}

function handleGitlabAuth(): void {
  console.log("Attempting GitLab authentication...");
  console.log(
    "Please run 'glab auth login' to authenticate with GitLab if prompted or if this step fails."
  );
  console.log(
    "If 'glab' is not installed, please install it first: https://glab.readthedocs.io/en/latest/installation.html"
  );
  // Similar to GitHub, direct interactive auth is tricky.
}

async function executeCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: "inherit" });

    process.on("close", (code) => {
      if (code === 0) {
        console.log(`'${command} ${args.join(" ")}' executed successfully.`);
        resolve();
      } else {
        console.error(
          `Error: '${command} ${args.join(" ")}' exited with code ${code}.`
        );
        // Resolve instead of reject to allow subsequent auth attempts
        resolve();
      }
    });

    process.on("error", (err) => {
      console.error(
        `Failed to start '${command} ${args.join(" ")}':`,
        err.message
      );
      if ((err as any).code === "ENOENT") {
        console.error(
          `Error: The command '${command}' was not found. Please ensure it is installed and in your PATH.`
        );
      }
      // Resolve instead of reject to allow subsequent auth attempts
      resolve();
    });
  });
}

async function handleGcloudLogin(): Promise<void> {
  console.log("Attempting Google Cloud user authentication...");
  try {
    await executeCommand("gcloud", ["auth", "login", "--quiet"]);
  } catch (error) {
    // Error is already logged by executeCommand
    console.log(
      "If 'gcloud' is not installed, please install it first: https://cloud.google.com/sdk/docs/install"
    );
  }
}

async function handleGcloudAppLogin(): Promise<void> {
  console.log("Attempting Google Cloud application-default authentication...");
  try {
    await executeCommand("gcloud", [
      "auth",
      "application-default",
      "login",
      "--quiet",
    ]);
  } catch (error) {
    // Error is already logged by executeCommand
    console.log(
      "If 'gcloud' is not installed, please install it first: https://cloud.google.com/sdk/docs/install"
    );
  }
}

export async function handleAuthCommand(args: string[] = []): Promise<void> {
  if (args.length === 0) {
    // No specific service specified, attempt all authentications
    console.log("Starting authentication process for all services...");

    handleGithubAuth();
    // Add a small delay or user prompt if these were interactive, but they are guides.
    console.log("--- Next: GitLab ---");
    handleGitlabAuth();

    console.log("--- Next: Google Cloud User Login ---");
    await handleGcloudLogin();

    console.log("--- Next: Google Cloud Application-Default Login ---");
    await handleGcloudAppLogin();

    console.log(
      "All authentication processes attempted. Please check the output for status of each."
    );
    return;
  }

  // Handle specific service authentication
  const service = args[0].toLowerCase();

  switch (service) {
    case "github":
      handleGithubAuth();
      break;
    case "gitlab":
      handleGitlabAuth();
      break;
    case "gcloud":
      if (args.length > 1 && args[1].toLowerCase() === "app-login") {
        await handleGcloudAppLogin();
      } else if (args.length > 1 && args[1].toLowerCase() === "login") {
        await handleGcloudLogin();
      } else {
        console.log("Starting Google Cloud authentication...");
        await handleGcloudLogin();
        console.log("--- Next: Google Cloud Application-Default Login ---");
        await handleGcloudAppLogin();
      }
      break;
    default:
      printAuthHelp();
      break;
  }
}
