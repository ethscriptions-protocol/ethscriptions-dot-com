import { endpoints } from "~~/lib/endpoints";

export const v2 = (path: string) => `${endpoints.apiV2}/${path.replace(/^\//, "")}`;

export const escUrl = (uri: string | null | undefined) => {
  if (!uri) return uri ?? undefined;
  if (!uri.startsWith("esc://")) return uri;
  const rest = uri.slice("esc://".length);
  // Bare hash form: "esc://0x<hash>" → /ethscriptions/<hash>/data
  // Path form: "esc://ethscriptions/<hash>/data" → /<rest>
  return /^0x[0-9a-fA-F]+$/.test(rest) ? v2(`ethscriptions/${rest}/data`) : v2(rest);
};
