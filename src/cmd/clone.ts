import { spawnSync } from "bun";
import {
  baseSearchDir,
  handleCommandError,
  defaultOrg,
  defaultGitHubUrl,
  defaultGitLabUrl,
  orgToProvider
} from "~/utils";
import path from "path";
import fs from "fs";

/**
 * Handles the clone command implementation.
 *
 * @param args Command arguments (excluding the 'clone' part)
 */
export function handleCloneCommand(args: string[]): void {
  if (args.length === 0) {
    console.error("Error: Repository argument is required for 'clone' command.");
    process.exit(1);
  } else if (args.length === 1 || (args.length === 2 && (args[0] === "--github" || args[0] === "--gitlab"))) {
    // Determine if we're using explicit provider flag
    let useGitLab = false;
    let repoArg: string;
    let explicitOrg: string | null = null;
    
    if (args.length === 2) {
      useGitLab = args[0] === "--gitlab";
      repoArg = args[1];
    } else {
      repoArg = args[0];
      
      // Check if repo arg contains org/repo format
      if (repoArg.includes('/') && !repoArg.startsWith("http") && !repoArg.includes("@")) {
        const parts = repoArg.split('/');
        if (parts.length === 2) {
          explicitOrg = parts[0];
          repoArg = parts[1];
          
          // Check if the org has a provider mapping
          if (explicitOrg in orgToProvider) {
            useGitLab = orgToProvider[explicitOrg] === 'gitlab';
          }
        }
      } else {
        // Use default org's provider mapping
        useGitLab = orgToProvider[defaultOrg] === 'gitlab';
      }
    }
    
    // Check if the argument is a full URL
    if (repoArg.startsWith("http://") || repoArg.startsWith("https://") || repoArg.includes("@")) {
      // Handle full URL case
      const repoPath = parseRepoUrlToPath(repoArg);
      if (repoPath) {
        cloneRepository(repoArg, repoPath);
      }
    } else {
      // Handle shorthand format
      const org = explicitOrg || defaultOrg;
      const provider = useGitLab ? "gitlab.com" : "github.com";
      const repoPath = path.join(baseSearchDir, provider, org, repoArg);
      
      const repoUrl = useGitLab
        ? `https://gitlab.com/${org}/${repoArg}`
        : `https://github.com/${org}/${repoArg}`;
        
      cloneRepository(repoUrl, repoPath);
    }
  } else if (args.length === 3 && (args[0] === "--org" || args[0] === "-o")) {
    // Handle --org flag
    const customOrg = args[1];
    const repoArg = args[2];
    
    // Check if the org has a provider mapping
    const useGitLab = orgToProvider[customOrg] === 'gitlab';
    const provider = useGitLab ? "gitlab.com" : "github.com";
    
    if (repoArg.startsWith("http://") || repoArg.startsWith("https://") || repoArg.includes("@")) {
      // Handle full URL case
      const repoPath = parseRepoUrlToPath(repoArg);
      if (repoPath) {
        cloneRepository(repoArg, repoPath);
      }
    } else {
      // Handle shorthand format with custom org
      const repoPath = path.join(baseSearchDir, provider, customOrg, repoArg);
      const repoUrl = useGitLab
        ? `https://gitlab.com/${customOrg}/${repoArg}`
        : `https://github.com/${customOrg}/${repoArg}`;
        
      cloneRepository(repoUrl, repoPath);
    }
  } else {
    console.error("Error: Invalid arguments for 'clone' command.");
    console.error("Usage: dev clone [--github|--gitlab] <repository>");
    console.error("       dev clone [--org|-o] <organization> <repository>");
    console.error("       dev clone <organization/repository>");
    process.exit(1);
  }
}

/**
 * Parses repository URL to determine the local filesystem path.
 * 
 * @param repoUrl The repository URL (HTTPS or SSH format)
 * @returns The local filesystem path or null if parsing failed
 */
function parseRepoUrlToPath(repoUrl: string): string | null {
  try {
    let orgName: string;
    let repoName: string;
    
    // Handle SSH URL format (git@github.com:foo/repo.git)
    if (repoUrl.includes("@")) {
      const sshMatch = repoUrl.match(/@([^:]+):([^\/]+)\/([^.]+)/);
      if (sshMatch) {
        const domain = sshMatch[1]; // github.com
        orgName = sshMatch[2];      // foo
        repoName = sshMatch[3];     // repo
        return path.join(baseSearchDir, domain, orgName, repoName);
      }
    } 
    // Handle HTTPS URL format (https://github.com/foo/repo)
    else {
      // Try to extract the path from URL
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      if (pathParts.length >= 2) {
        orgName = pathParts[0];
        // Remove .git suffix if present
        repoName = pathParts[1].replace(/\.git$/, '');
        return path.join(baseSearchDir, url.hostname, orgName, repoName);
      }
    }
    
    console.error(`Error: Could not parse repository URL: ${repoUrl}`);
    process.exit(1);
  } catch (error: any) {
    console.error(`Error parsing repository URL: ${error.message}`);
    process.exit(1);
  }
  
  return null;
}

/**
 * Clones a repository to the specified path.
 * 
 * @param repoUrl The repository URL to clone from
 * @param targetPath The local path to clone to
 */
function cloneRepository(repoUrl: string, targetPath: string): void {
  // Check if directory already exists
  if (fs.existsSync(targetPath)) {
    console.error(`Error: Directory already exists: ${targetPath}`);
    process.exit(1);
  }
  
  // Ensure parent directory exists
  const parentDir = path.dirname(targetPath);
  if (!fs.existsSync(parentDir)) {
    try {
      fs.mkdirSync(parentDir, { recursive: true });
    } catch (error: any) {
      console.error(`Error creating directory ${parentDir}: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Clone the repository
  try {
    console.log(`Cloning ${repoUrl} into ${targetPath}...`);
    
    const proc = spawnSync(["git", "clone", repoUrl, targetPath], {
      stdio: ["inherit", "inherit", "inherit"] as any, // Inherit all IO to show progress
    });
    
    if (proc.exitCode !== 0) {
      console.error(`Error cloning repository: git exited with code ${proc.exitCode}`);
      process.exit(proc.exitCode || 1);
    }
    
    console.log(`Successfully cloned ${repoUrl} to ${targetPath}`);
  } catch (error: any) {
    handleCommandError(error, "git clone", "git");
  }
}