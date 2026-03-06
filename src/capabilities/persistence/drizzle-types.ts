import type { drizzle } from "drizzle-orm/bun-sqlite";

/**
 * Type alias for the Drizzle database instance
 * This helps avoid the complex generic types in the rest of the codebase
 */
export type DrizzleDatabase = ReturnType<typeof drizzle>;
