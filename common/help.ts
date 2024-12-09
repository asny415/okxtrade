import { common_options } from "./args.ts";
import { Command, Docable } from "./type.ts";

function help_global(commands: Record<string, Command>) {
  const doc = Object.keys(commands)
    .map((cmd) => `    ${cmd}\t: ${commands[cmd].DOC}`)
    .join("\n");
  console.log(`deno run main.ts command [...options]\n${doc}`);
}

function help_single(commands: Record<string, Command>, cmd: string) {
  const command = `${cmd} : ${commands[cmd].DOC}`;
  const strings = [];
  {
    const aliases = commands[cmd].options?.alias || {};
    for (const str of (commands[cmd].options?.string || []) as string[]) {
      const alias = Object.keys(aliases).filter((s) => aliases[s] == str)[0];
      const def = (commands[cmd].options?.default || {})[str];
      const doc = ((commands[cmd].options as Docable)?.doc || {})[str];
      strings.push(
        `   --${str}${alias ? ` -${alias}` : ""}\t: ${doc}${
          def ? ` default:${def}` : ""
        }`
      );
    }
  }
  const booleans = [];
  {
    const aliases = commands[cmd].options?.alias || {};
    for (const str of (commands[cmd].options?.boolean || []) as string[]) {
      const alias = Object.keys(aliases).filter((s) => aliases[s] == str)[0];
      const doc = ((commands[cmd].options as Docable)?.doc || {})[str];
      booleans.push(`   --${str}${alias ? ` -${alias}` : ""}\t: ${doc}`);
    }
  }

  const common_strings = [];
  {
    const aliases = common_options?.alias || {};
    for (const str of (common_options?.string || []) as string[]) {
      const alias = Object.keys(aliases).filter((s) => aliases[s] == str)[0];
      const def = (common_options?.default || {})[str];
      const doc = ((common_options as Docable)?.doc || {})[str];
      common_strings.push(
        `   --${str}${alias ? ` -${alias}` : ""}\t: ${doc}${
          def ? ` default:${def}` : ""
        }`
      );
    }
  }

  const common_booleans = [];
  {
    const aliases = common_options?.alias || {};
    for (const str of (common_options?.boolean || []) as string[]) {
      const alias = Object.keys(aliases).filter((s) => aliases[s] == str)[0];
      const doc = ((common_options as Docable)?.doc || {})[str];
      common_booleans.push(`   --${str}${alias ? ` -${alias}` : ""}\t: ${doc}`);
    }
  }

  console.log(
    `${command}\n${strings.join("\n")}\n${booleans.join(
      "\n"
    )}\ncommon options:\n${common_strings.join("\n")}\n${common_booleans.join(
      "\n"
    )}`
  );
}

export function help(commands: Record<string, Command>, cmd = "") {
  if (!cmd) {
    help_global(commands);
  } else {
    help_single(commands, cmd);
  }
}
