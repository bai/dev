import { describe, expect, it } from "vitest";
import { execSync } from "child_process";

describe("CLI Basic Functionality", () => {
  const runCli = (args: string): string => {
    try {
      return execSync(`bun src/index.ts ${args}`, { 
        encoding: "utf-8",
        timeout: 10000 
      });
    } catch (error: any) {
      throw new Error(`CLI command failed: ${error.message}`);
    }
  };

  it("should show help when no arguments provided", () => {
    const output = runCli("");
    expect(output).toContain("A CLI tool for quick directory navigation");
    expect(output).toContain("Usage: dev <command> [options]");
  });

  it("should show version information", () => {
    const output = runCli("version");
    expect(output).toContain("dev v2.0.0");
  });

  it("should show help for specific command", () => {
    const output = runCli("help");
    expect(output).toContain("Commands:");
    expect(output).toContain("cd");
    expect(output).toContain("clone");
    expect(output).toContain("up");
  });

  it("should generate bash completion", () => {
    const output = runCli("completion bash");
    expect(output).toContain("#!/bin/bash");
    expect(output).toContain("_dev_completion");
    expect(output).toContain("complete -F _dev_completion dev");
  });

  it("should generate zsh completion", () => {
    const output = runCli("completion zsh");
    expect(output).toContain("#compdef dev");
    expect(output).toContain("_dev()");
  });

  it("should generate fish completion", () => {
    const output = runCli("completion fish");
    expect(output).toContain("# Fish completion for dev");
    expect(output).toContain("complete -c dev");
  });
});