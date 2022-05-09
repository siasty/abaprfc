import { ExtensionContext, commands } from "vscode";
import { abapcmds } from "./abapcomands";
export { RfcCommands } from "./commands";

export const registerCommands = (context: ExtensionContext) => {
  for (const cmd of abapcmds)
    {
        context.subscriptions.push( commands.registerCommand(cmd.name, cmd.func.bind(cmd.target)));
    }
};