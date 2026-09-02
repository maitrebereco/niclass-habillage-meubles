const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

export const config = {
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowSize: 3600,
    windowLimit: 5
  }
};

export default async function (request) {
  if (request.method !== "POST") {
    return json({ error: "Utilisez le formulaire du site." }, 405);
  }

  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) {
    return json({ error: "Veuillez utiliser le formulaire du site." }, 403);
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "Format de demande invalide." }, 415);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > 12000) {
      return json({ error: "Description trop longue." }, 413);
    }
    body = JSON.parse(text);
  } catch {
    return json({ error: "Demande invalide." }, 400);
  }

  const prompt =
    typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (prompt.length < 5 || prompt.length > 1500) {
    return json({
      error: "Décrivez votre projet en 5 à 1 500 caractères."
    }, 400);
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return json({
      error: "La visualisation IA n’est pas encore configurée."
    }, 503);
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt:
            "Crée une visualisation photoréaliste illustrative " +
            "d’un projet de rénovation de mobilier ou d’intérieur. " +
            "Sans texte, sans logo et sans mesures inventées. " +
            "Description du projet : " + prompt,
          n: 1,
          size: "1024x1024",
          quality: "low",
          output_format: "jpeg"
        }),
        signal: AbortSignal.timeout(55000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Image API:", response.status, data?.error?.code);

      const error =
        response.status === 429
          ? "Service momentanément indisponible ou quota IA atteint."
          : response.status === 401 || response.status === 403
            ? "L’accès au service IA doit être vérifié par Niclass."
            : "La génération a échoué. Veuillez réessayer plus tard.";

      return json({ error }, 502);
    }

    const image = data?.data?.[0]?.b64_json;
    if (typeof image !== "string" || !image.length) {
      return json({ error: "Aucune image reçue." }, 502);
    }

    return json({
      imageUrl: "data:image/jpeg;base64," + image
    });
  } catch (error) {
    return json({
      error: error.name === "TimeoutError"
        ? "La génération a pris trop de temps. Réessayez plus tard."
        : "Connexion au service IA impossible."
    }, 503);
  }
}
