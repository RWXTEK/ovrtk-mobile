import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

export async function askScotty(messages: ChatMsg[]): Promise<string> {
  const call = httpsCallable(functions, "scottyChat");
  const res = await call({ messages });
  const data = res.data as { reply?: string };
  return data?.reply ?? "";
}
