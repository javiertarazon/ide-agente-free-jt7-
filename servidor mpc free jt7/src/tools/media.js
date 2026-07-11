import { z } from "zod";

const ytSchema = z.object({
  url: z.string().url()
});

const ytDownloadSchema = z.object({
  url: z.string().url(),
  hasRights: z.boolean().default(false),
  reason: z.string().optional().default("No especificado")
});

function extractYouTubeId(urlValue) {
  const url = new URL(urlValue);
  if (url.hostname.includes("youtu.be")) {
    return url.pathname.replace("/", "");
  }
  return url.searchParams.get("v") || "";
}

export async function youtubeInfo(input) {
  const args = ytSchema.parse(input);
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(args.url)}`;
  const response = await fetch(oembed);
  if (!response.ok) {
    return { ok: false, error: `No se pudo obtener oEmbed: ${response.status}` };
  }
  const data = await response.json();
  return {
    ok: true,
    videoId: extractYouTubeId(args.url),
    title: data.title,
    author: data.author_name,
    provider: data.provider_name,
    thumbnail: data.thumbnail_url
  };
}

export function youtubeDownloadRequest(input, policy) {
  const args = ytDownloadSchema.parse(input);

  if (!policy.allowYouTubeDownload) {
    return {
      ok: false,
      error: "Descarga de YouTube desactivada por politica.",
      nextStep: "Activa allowYouTubeDownload y confirma derechos de uso."
    };
  }

  if (!args.hasRights) {
    return {
      ok: false,
      error: "Debes confirmar derechos/permiso para descargar este contenido."
    };
  }

  return {
    ok: true,
    status: "approved-by-policy",
    message: "Solicitud aceptada. Integra un backend downloader solo en entornos autorizados.",
    url: args.url,
    reason: args.reason
  };
}
