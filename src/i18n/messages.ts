import * as js from "./messages.js";

export type Messages = { [key: string]: string | Messages };

export function mergeMessages(base: Messages, overlay: Messages | undefined): Messages {
  return js.mergeMessages(base, overlay) as Messages;
}
