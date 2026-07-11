import { z } from "zod";
import { isDomainAllowed } from "../policy.js";

const schema = z.object({
  url: z.string().url(),
  maxChars: z.number().int().positive().optional().default(12000)
});

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scrapeText(input, policy) {
  const args = schema.parse(input);
  if (!isDomainAllowed(args.url, policy)) {
    return { ok: false, error: "Dominio no permitido por politica" };
  }

  const response = await fetch(args.url);
  const html = await response.text();
  const text = htmlToText(html);

  return {
    ok: true,
    status: response.status,
    url: args.url,
    text: text.slice(0, args.maxChars),
    truncated: text.length > args.maxChars
  };
}
