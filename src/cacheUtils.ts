import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const CACHE_DIR = path.join(os.homedir(), ".dev", ".cache");
const CACHE_FILE_NAME = "directories-cache.json";
export const DIRECTORIES_CACHE_PATH = path.join(CACHE_DIR, CACHE_FILE_NAME);

// Maximum number of entries to keep in the cache.
const MAX_CACHE_SIZE = 100;

export interface CacheEntry {
  path: string;
  count: number;
  lastAccessed: number; // Unix timestamp (milliseconds)
}

export type CacheData = CacheEntry[];

/**
 * Ensures that the cache directory exists.
 * Creates it if it doesn't.
 */
export async function ensureCacheDirExists(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error: any) {
    // Ignore EEXIST error, rethrow others
    if (error.code !== "EEXIST") {
      console.error(`Failed to create cache directory at ${CACHE_DIR}:`, error);
      throw error;
    }
  }
}

/**
 * Reads the directory cache file.
 * Returns an empty array if the file doesn't exist or is invalid.
 */
export async function readDirectoryCache(): Promise<CacheData> {
  try {
    await ensureCacheDirExists(); // Ensure directory exists before trying to read
    const fileContent = await fs.readFile(DIRECTORIES_CACHE_PATH, "utf-8");
    const data = JSON.parse(fileContent) as CacheData;
    // Basic validation of the parsed data
    if (
      Array.isArray(data) &&
      data.every(
        (entry) =>
          typeof entry.path === "string" &&
          typeof entry.count === "number" &&
          typeof entry.lastAccessed === "number"
      )
    ) {
      return data;
    }
    console.warn("Cache file content is invalid. Returning empty cache.");
    return [];
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File not found, which is fine for the first run
      return [];
    }
    console.error("Failed to read directory cache:", error);
    return []; // Return empty cache on other errors too, to avoid breaking functionality
  }
}

/**
 * Writes data to the directory cache file.
 */
export async function writeDirectoryCache(data: CacheData): Promise<void> {
  try {
    await ensureCacheDirExists();
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(DIRECTORIES_CACHE_PATH, jsonData, "utf-8");
  } catch (error) {
    console.error("Failed to write directory cache:", error);
    // Depending on requirements, might want to rethrow or handle more gracefully
  }
}

/**
 * Updates a directory's access count and timestamp in the cache.
 * Adds the directory if it's not already present.
 * Sorts the cache by count and then by lastAccessed.
 * Ensures the cache does not exceed MAX_CACHE_SIZE.
 * @param absPath The absolute path of the directory to update.
 */
export async function updateDirectoryInCache(absPath: string): Promise<void> {
  if (!path.isAbsolute(absPath)) {
    console.warn(
      `updateDirectoryInCache expects an absolute path, received: ${absPath}`
    );
    // Optionally, try to resolve it, or just return
    // For now, we'll proceed, but this indicates a potential issue in the calling code.
  }

  let cache = await readDirectoryCache();
  const now = Date.now();
  const existingEntryIndex = cache.findIndex((entry) => entry.path === absPath);

  if (existingEntryIndex !== -1) {
    const entry = cache[existingEntryIndex];
    // Ensure entry is not undefined, though findIndex !== -1 should guarantee this.
    if (entry) {
      entry.count++;
      entry.lastAccessed = now;
    } else {
      // This case should ideally not be reached if findIndex logic is correct.
      // Log an error or handle appropriately if it occurs.
      console.error(
        "Internal error: Entry not found in cache despite valid index.",
        {
          absPath,
          existingEntryIndex,
          cacheSnapshot: JSON.parse(JSON.stringify(cache)), // Deep copy for logging
        }
      );
      // As a fallback, treat as a new entry if something went wrong.
      cache.push({ path: absPath, count: 1, lastAccessed: now });
    }
  } else {
    cache.push({ path: absPath, count: 1, lastAccessed: now });
  }

  // Sort cache: higher count first, then more recent first
  cache.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastAccessed - a.lastAccessed;
  });

  // Limit cache size
  if (cache.length > MAX_CACHE_SIZE) {
    cache = cache.slice(0, MAX_CACHE_SIZE);
  }

  await writeDirectoryCache(cache);
}

/**
 * Finds a matching directory in the cache based on a search term.
 * The search term is matched against the base name of the cached paths.
 * Returns the path of the best match (most frequent/recent) or null.
 * @param searchTerm The term to search for (e.g., a folder name).
 */
export async function findMatchingDirectoryInCache(
  searchTerm: string
): Promise<string | null> {
  const cache = await readDirectoryCache(); // Cache is already sorted by frecency
  if (cache.length === 0) {
    return null;
  }

  const lowerSearchTerm = searchTerm.toLowerCase();

  // Iterate through the sorted cache and return the first match
  for (const entry of cache) {
    const baseName = path.basename(entry.path).toLowerCase();
    if (baseName.includes(lowerSearchTerm)) {
      // Verify if the directory still exists before returning
      try {
        const stats = await fs.stat(entry.path);
        if (stats.isDirectory()) {
          return entry.path;
        }
      } catch (e: unknown) {
        let isEnoent = false;
        if (typeof e === "object" && e !== null && "code" in e) {
          // At this point, TypeScript knows that 'e' is an object and has a 'code' property.
          // We can safely cast and check its value.
          if ((e as { code: unknown }).code === "ENOENT") {
            isEnoent = true;
          }
        }

        if (isEnoent) {
          // Directory might have been deleted, ignore and continue search
          // Optionally, we could remove this entry from cache here, but that would require a write.
          // For simplicity, we'll let it be pruned on next update if MAX_CACHE_SIZE is hit,
          // or simply not be selected again.
        } else {
          // Log other errors if they are not ENOENT
          console.warn(`Error accessing cached path ${entry.path}:`, e);
        }
      }
    }
  }

  return null; // No suitable match found
}
