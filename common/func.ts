import { Logger } from "jsr:@deno-library/logger";
import { ParseArgsParam } from "./type.ts";
export function getLog(_name: string) {
  return new Logger();
}

export function mergeOpts(a: ParseArgsParam, b: ParseArgsParam) {
  return {
    string: [...(a?.string || []), ...(b?.string || [])],
    boolean: [
      ...((a?.boolean as [string]) || []),
      ...((b?.boolean as [string]) || []),
    ],
    default: { ...a?.default, ...b?.default },
    alias: { ...a?.alias, ...b?.alias },
  };
}
