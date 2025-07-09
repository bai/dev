import { Context, type Effect } from "effect";

import type { NetworkError, UnknownError } from "./errors";

export interface HttpResponse {
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string>;
}

export interface Network {
  /**
   * Make an HTTP GET request
   */
  get(
    url: string,
    options?: { headers?: Record<string, string> },
  ): Effect.Effect<HttpResponse, NetworkError | UnknownError>;

  /**
   * Download a file to a destination
   */
  downloadFile(url: string, destinationPath: string): Effect.Effect<void, NetworkError | UnknownError>;

  /**
   * Check if a URL is reachable
   */
  checkConnectivity(url: string): Effect.Effect<boolean>;
}

export class NetworkTag extends Context.Tag("Network")<NetworkTag, Network>() {}
