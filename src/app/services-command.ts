import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag, type RegisteredCommand } from "../domain/command-registry-port";
import {
  handleDown,
  handleLogs,
  handleReset,
  handleRestart,
  handleUp,
  type LogsHandlerConfig,
  type ServicesHandlerConfig,
} from "./services-service";

const serviceArg = Args.text({ name: "service" }).pipe(Args.repeated);

const followOption = Options.boolean("follow").pipe(Options.withAlias("f"), Options.withDefault(false));
const tailOption = Options.integer("tail").pipe(Options.withAlias("n"), Options.optional);

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

const upHandler = (config: ServicesHandlerConfig) => handleUp(config).pipe(Effect.withSpan("services.up"));

const upCommand = Command.make("up", { services: serviceArg }, upHandler);
const startCommand = Command.make("start", { services: serviceArg }, upHandler);

const downHandler = (config: ServicesHandlerConfig) => handleDown(config).pipe(Effect.withSpan("services.down"));

const downCommand = Command.make("down", { services: serviceArg }, downHandler);
const stopCommand = Command.make("stop", { services: serviceArg }, downHandler);

const restartHandler = (config: ServicesHandlerConfig) =>
  handleRestart(config).pipe(Effect.withSpan("services.restart"));

const restartCommand = Command.make("restart", { services: serviceArg }, restartHandler);

const logsHandler = (config: LogsHandlerConfig) => handleLogs(config).pipe(Effect.withSpan("services.logs"));

const logsCommand = Command.make("logs", { service: serviceArg, follow: followOption, tail: tailOption }, logsHandler);

const resetHandler = () => handleReset().pipe(Effect.withSpan("services.reset"));

const resetCommand = Command.make("reset", {}, resetHandler);

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
