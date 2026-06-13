/* Mini-backend « question au prof » — Netlify Function (Node 18+).
   VERSION DE TEST : utilise l'API Google Gemini (palier GRATUIT).
   Le prompt et le format JSON sont identiques à la version Claude ;
   pour passer en production sur Claude, il suffira de remplacer le bloc d'appel API.

   Reçoit la conversation (liste `messages`), ajoute le prompt système,
   force une sortie JSON conforme au schéma, renvoie { reponse: [...] }.

   La clé vit ici, côté serveur — variable d'environnement GEMINI_API_KEY.
   Jamais dans le navigateur (règle CLAUDE.md).

   Réf : docs/QUESTION-PROF-V1.md */

const SYSTEM_PROMPT = require("./prompt-prof");

// Modèle Gemini (palier gratuit, rapide).
const MODEL = "gemini-2.0-flash";

// Schéma de sortie au format Gemini (types en MAJUSCULES).
const SCHEMA = {
  type: "OBJECT",
  properties: {
    reponse: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["texte", "tableau"] },
          contenu: { type: "STRING" },
          format: { type: "STRING", enum: ["paires", "grille"] },
          titre: { type: "STRING" },
          entetes: { type: "ARRAY", items: { type: "STRING" } },
          lignes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                fr: { type: "STRING" },
                en: { type: "STRING" },
                cat: {
                  type: "STRING",
                  enum: ["prono", "traduction", "construction", "contraction", "expression"],
                },
                cellules: { type: "ARRAY", items: { type: "STRING" } },
              },
            },
          },
        },
        required: ["type"],
      },
    },
  },
  required: ["reponse"],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...CORS },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Méthode non autorisée." });
  }

  // 1. Lire la conversation
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Corps de requête JSON invalide." });
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: "Champ `messages` manquant ou vide." });
  }

  // 2. Convertir au format Gemini : eleve→user, prof→model
  const contents = messages
    .filter((m) => m && typeof m.texte === "string" && m.texte.trim())
    .map((m) => ({
      role: m.role === "prof" ? "model" : "user",
      parts: [{ text: m.texte }],
    }));
  if (contents.length === 0) {
    return json(400, { error: "Aucun message exploitable." });
  }

  // 3. Clé API
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Clé API non configurée (GEMINI_API_KEY manquante)." });
  }

  // 4. Appel à Gemini — sortie JSON forcée par le schéma
  let resp;
  try {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 900,
            responseMimeType: "application/json",
            responseSchema: SCHEMA,
          },
        }),
      }
    );
  } catch (e) {
    return json(502, { error: "Impossible de joindre l'API.", detail: String(e) });
  }

  if (!resp.ok) {
    const detail = await resp.text();
    return json(502, { error: "Erreur de l'API Gemini.", detail });
  }

  // 5. Extraire et parser le JSON renvoyé
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return json(502, { error: "Réponse inattendue de l'API.", detail: JSON.stringify(data).slice(0, 500) });
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(502, { error: "Réponse non-JSON.", detail: text.slice(0, 500) });
  }

  return json(200, parsed);
};
