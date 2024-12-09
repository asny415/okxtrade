import { parseArgs } from "jsr:@std/cli/parse-args";

export type ParseArgsParam = Parameters<typeof parseArgs>[1];
export type ParseArgsReturn = ReturnType<typeof parseArgs>;

export interface Command {
  options: ParseArgsParam;
  DOC: string;
  run(): void;
}

export interface Docable {
  doc?: Record<string, string>;
}
