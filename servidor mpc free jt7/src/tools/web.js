import { z } from "zod";
import { isDomainAllowed } from "../policy.js";

export const webFetchSchema = z.object({
  url: z.string().url(),
  method: z.string().optional().default("GET"),
  headers: z.record(z.string()).optional(),
  body: z.string().optional()
});

export async function webFetch(input, policy) {
  const args = webFetchSchema.parse(input);
  if (!isDomainAllowed(args.url, policy)) {
    return { ok: false, error: "Dominio no permitido por politica" };
  }

  const response = await fetch(args.url, {
    method: args.method,
    headers: args.headers,
    body: args.body
  });

  const text = await response.text();
  const max = Number(policy.maxFetchBytes || 2500000);
  const clipped = text.slice(0, max);

  return {
    ok: true,
    status: response.status,
    url: args.url,
    body: clipped,
    truncated: text.length > clipped.length
  };
}
