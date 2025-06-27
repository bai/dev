import { expect } from "vitest";

import { type CLIError } from "~/lib/errors";

export const expectCLIError = async <T extends CLIError>(
  run: () => Promise<unknown>,
  ErrorClass: new (...args: any[]) => T,
  props?: Partial<T>,
) => {
  try {
    await run();
    throw new Error("Expected error not thrown");
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorClass);
    if (props) {
      Object.entries(props).forEach(([k, v]) => expect((e as any)[k]).toEqual(v));
    }
  }
};
