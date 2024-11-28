import { parseArgs } from "jsr:@std/cli/parse-args";

export type ParseArgsParam = Parameters<typeof parseArgs>[1];
export type ParseArgsReturn = ReturnType<typeof parseArgs>;
