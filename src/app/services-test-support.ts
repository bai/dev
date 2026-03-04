import { Effect } from "effect";

import type { DockerServices, ServiceName, ServiceStatus } from "../domain/docker-services-port";
import type { HealthCheckResult } from "../domain/health-check-port";

export class RecordingDockerServices implements DockerServices {
  public availabilityChecks = 0;
  public upCalls: Array<{ readonly services?: readonly ServiceName[]; readonly spanName: string }> = [];
  public downCalls: Array<{ readonly services?: readonly ServiceName[]; readonly spanName: string }> = [];
  public restartCalls: Array<{ readonly services?: readonly ServiceName[]; readonly spanName: string }> = [];
  public logsCalls: Array<{
    readonly service?: ServiceName;
    readonly options?: { follow?: boolean; tail?: number };
    readonly spanName: string;
  }> = [];
  public resetCalls: string[] = [];

  constructor(private readonly available: boolean) {}

  private currentSpanName(): Effect.Effect<string, never, never> {
    return Effect.currentSpan.pipe(
      Effect.map((span) => span.name),
      Effect.orElseSucceed(() => "missing-span"),
    );
  }

  up(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.upCalls.push({ services, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  down(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.downCalls.push({ services, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  restart(services?: readonly ServiceName[]): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.restartCalls.push({ services, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  status(): Effect.Effect<readonly ServiceStatus[], never, never> {
    return Effect.succeed([]);
  }

  logs(service?: ServiceName, options?: { follow?: boolean; tail?: number }): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.logsCalls.push({ service, options, spanName });
        }),
      ),
      Effect.asVoid,
    );
  }

  reset(): Effect.Effect<void, never, never> {
    return this.currentSpanName().pipe(
      Effect.tap((spanName) =>
        Effect.sync(() => {
          this.resetCalls.push(spanName);
        }),
      ),
      Effect.asVoid,
    );
  }

  isDockerAvailable(): Effect.Effect<boolean, never, never> {
    this.availabilityChecks += 1;
    return Effect.succeed(this.available);
  }

  performHealthCheck(): Effect.Effect<HealthCheckResult, never, never> {
    return Effect.succeed({
      toolName: "docker-services",
      status: this.available ? "ok" : "warning",
      checkedAt: new Date(),
    });
  }
}
