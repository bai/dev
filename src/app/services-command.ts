import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag, type RegisteredCommand } from "../domain/command-registry-port";
import { DockerServicesTag, type ServiceName } from "../domain/docker-services-port";

const serviceArg = Args.text({ name: "service" }).pipe(Args.repeated);

const followOption = Options.boolean("follow").pipe(Options.withAlias("f"), Options.withDefault(false));
const tailOption = Options.integer("tail").pipe(Options.withAlias("n"), Options.optional);

const validateServiceNames = (services: readonly string[]): Effect.Effect<readonly ServiceName[], never, never> =>
  Effect.gen(function* () {
    const validNames: ServiceName[] = ["postgres17", "postgres18", "valkey"];
    const result: ServiceName[] = [];

    for (const s of services) {
      if (validNames.includes(s as ServiceName)) {
        result.push(s as ServiceName);
      } else {
        yield* Effect.logWarning(`Unknown service: ${s}. Valid services: ${validNames.join(", ")}`);
      }
    }

    return result;
  });

export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Manage shared development services (PostgreSQL, Valkey) via Docker Compose\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev services <subcommand> [services...]\n");

    yield* Effect.logInfo("SUBCOMMANDS");
    yield* Effect.logInfo("  up|start [services...]   Start all or specific services");
    yield* Effect.logInfo("  down|stop [services...]  Stop all or specific services");
    yield* Effect.logInfo("  restart [services...]    Restart all or specific services");
    yield* Effect.logInfo("  logs [service] [-f]      View logs (--follow, --tail)");
    yield* Effect.logInfo("  reset                    Reset to pristine state (removes data)\n");

    yield* Effect.logInfo("SERVICES");
    yield* Effect.logInfo("  postgres17               PostgreSQL 17 (port 55432)");
    yield* Effect.logInfo("  postgres18               PostgreSQL 18 (port 55433)");
    yield* Effect.logInfo("  valkey                   Valkey/Redis (port 56379)\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev services up                    # Start all services");
    yield* Effect.logInfo("  dev services up postgres17         # Start only PostgreSQL 17");
    yield* Effect.logInfo("  dev services down                  # Stop all services");
    yield* Effect.logInfo("  dev services logs valkey -f        # Follow valkey logs");
    yield* Effect.logInfo("  dev services reset                 # Reset all services and data\n");
  });

const upHandler = ({ services }: { readonly services: readonly string[] }) =>
  Effect.gen(function* () {
    const dockerServices = yield* DockerServicesTag;

    const isAvailable = yield* dockerServices.isDockerAvailable();
    if (!isAvailable) {
      yield* Effect.logError("Docker is not available. Please ensure Docker is installed and running.");
      return;
    }

    const validServices = yield* validateServiceNames(services);
    const servicesToStart = validServices.length > 0 ? validServices : undefined;

    yield* dockerServices.up(servicesToStart);
  }).pipe(Effect.withSpan("services.up"));

const upCommand = Command.make("up", { services: serviceArg }, upHandler);
const startCommand = Command.make("start", { services: serviceArg }, upHandler);

const downHandler = ({ services }: { readonly services: readonly string[] }) =>
  Effect.gen(function* () {
    const dockerServices = yield* DockerServicesTag;

    const isAvailable = yield* dockerServices.isDockerAvailable();
    if (!isAvailable) {
      yield* Effect.logError("Docker is not available. Please ensure Docker is installed and running.");
      return;
    }

    const validServices = yield* validateServiceNames(services);
    const servicesToStop = validServices.length > 0 ? validServices : undefined;

    yield* dockerServices.down(servicesToStop);
  }).pipe(Effect.withSpan("services.down"));

const downCommand = Command.make("down", { services: serviceArg }, downHandler);
const stopCommand = Command.make("stop", { services: serviceArg }, downHandler);

const restartCommand = Command.make("restart", { services: serviceArg }, ({ services }) =>
  Effect.gen(function* () {
    const dockerServices = yield* DockerServicesTag;

    const isAvailable = yield* dockerServices.isDockerAvailable();
    if (!isAvailable) {
      yield* Effect.logError("Docker is not available. Please ensure Docker is installed and running.");
      return;
    }

    const validServices = yield* validateServiceNames(services);
    const servicesToRestart = validServices.length > 0 ? validServices : undefined;

    yield* dockerServices.restart(servicesToRestart);
  }).pipe(Effect.withSpan("services.restart")),
);

const logsCommand = Command.make("logs", { service: serviceArg, follow: followOption, tail: tailOption }, (config) =>
  Effect.gen(function* () {
    const dockerServices = yield* DockerServicesTag;

    const isAvailable = yield* dockerServices.isDockerAvailable();
    if (!isAvailable) {
      yield* Effect.logError("Docker is not available. Please ensure Docker is installed and running.");
      return;
    }

    const validServices = yield* validateServiceNames(config.service);
    const serviceName = validServices.length > 0 ? validServices[0] : undefined;

    const tailValue = config.tail._tag === "Some" ? config.tail.value : undefined;

    yield* dockerServices.logs(serviceName, {
      follow: config.follow,
      tail: tailValue,
    });
  }).pipe(Effect.withSpan("services.logs")),
);

const resetCommand = Command.make("reset", {}, () =>
  Effect.gen(function* () {
    const dockerServices = yield* DockerServicesTag;

    const isAvailable = yield* dockerServices.isDockerAvailable();
    if (!isAvailable) {
      yield* Effect.logError("Docker is not available. Please ensure Docker is installed and running.");
      return;
    }

    yield* dockerServices.reset();
  }).pipe(Effect.withSpan("services.reset")),
);

export const servicesCommand = Command.make("services", {}, () =>
  Effect.gen(function* () {
    yield* displayHelp();
  }),
).pipe(
  Command.withSubcommands([
    upCommand,
    startCommand,
    downCommand,
    stopCommand,
    restartCommand,
    logsCommand,
    resetCommand,
  ]),
);

export const registerServicesCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "services",
    command: servicesCommand as RegisteredCommand,
    displayHelp,
  });
});
