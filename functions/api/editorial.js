function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  const short = value.slice(0, maxLength - 1);
  const lastSpace = short.lastIndexOf(" ");
  return `${short.slice(0, Math.max(lastSpace, 0))}...`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelize(value) {
  return String(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const EDITORIAL_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "men",
  "mens",
  "women",
  "womens",
  "shirt",
  "shirts",
  "pants",
  "shoes",
  "jacket",
  "jackets",
  "piece",
  "item",
]);

function stripMarkdownFences(value) {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseJsonObject(value) {
  const candidate = stripMarkdownFences(value);
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("The model response did not contain a JSON object.");
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function editorialReference(categoryLabel) {
  const normalized = cleanText(categoryLabel).toLowerCase();
  const labels = {
    shirts: "this shirt",
    pants: "these pants",
    shoes: "these shoes",
    jackets: "this jacket",
    accessories: "this accessory",
    basics: "this piece",
    activewear: "this activewear piece",
  };

  return labels[normalized] || "this item";
}

function significantEditorialWords(value) {
  return cleanText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word) => !EDITORIAL_STOP_WORDS.has(word));
}

function buildForbiddenEditorialPhrases(context) {
  const sources = [
    context.fullTitle,
    context.shortTitle,
    context.brand && context.shortTitle ? `${context.brand} ${context.shortTitle}` : "",
    ...(Array.isArray(context.bullets) ? context.bullets : []),
  ];

  const phrases = new Set();

  for (const source of sources) {
    const words = cleanText(source).toLowerCase().split(/\s+/).filter(Boolean);
    const maxSize = Math.min(5, words.length);

    for (let size = maxSize; size >= 3; size -= 1) {
      for (let index = 0; index <= words.length - size; index += 1) {
        const slice = words.slice(index, index + size);
        const significant = slice.filter((word) => word.length >= 3 && !EDITORIAL_STOP_WORDS.has(word));
        if (significant.length < 2) {
          continue;
        }
        phrases.add(slice.join(" "));
      }
    }
  }

  return [...phrases].sort((a, b) => b.length - a.length);
}

function stripTitleEcho(value, context) {
  let text = cleanText(String(value ?? "").replace(/^[-*]\s+/, "").replace(/^[A-Za-z ]+:\s+/, ""));
  const reference = editorialReference(context.categoryLabel);
  const forbiddenPhrases = buildForbiddenEditorialPhrases(context);
  const directPhrases = [
    context.fullTitle,
    context.shortTitle,
    context.brand && context.shortTitle ? `${context.brand} ${context.shortTitle}` : "",
    context.brand,
  ]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item) => item.length >= 5)
    .sort((a, b) => b.length - a.length);

  for (const phrase of directPhrases) {
    text = text.replace(new RegExp(escapeRegExp(phrase), "gi"), reference);
  }

  for (const phrase of forbiddenPhrases) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), reference);
  }

  text = text
    .replace(new RegExp(`^(?:the\\s+)?${escapeRegExp(reference)}\\s*(?:is|works|fits|suits)?\\s*-?\\s*`, "i"), (match) => {
      if (/\bis\b/i.test(match)) {
        return `${reference.charAt(0).toUpperCase() + reference.slice(1)} is `;
      }
      return `${reference.charAt(0).toUpperCase() + reference.slice(1)} `;
    })
    .replace(new RegExp(`(?:${escapeRegExp(reference)}\\s+){2,}`, "gi"), `${reference} `)
    .replace(/\bthe this\b/gi, "this")
    .replace(/\bthe these\b/gi, "these")
    .replace(/\bthis item piece\b/gi, "this piece")
    .replace(/\b(this (?:shirt|jacket|piece|accessory|item)|these (?:pants|shoes|pieces))\s+(?:with|for|in)\s+\1\b/gi, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function containsForbiddenEditorialPhrase(value, context) {
  const normalized = cleanText(value).toLowerCase();
  return buildForbiddenEditorialPhrases(context).some((phrase) => normalized.includes(phrase));
}

function hasHeavySourceOverlap(value, context) {
  const words = significantEditorialWords(value);
  if (words.length < 4) {
    return false;
  }

  const sourceWords = new Set([
    ...significantEditorialWords(context.fullTitle),
    ...significantEditorialWords(context.shortTitle),
    ...(Array.isArray(context.bullets) ? context.bullets.flatMap((bullet) => significantEditorialWords(bullet)) : []),
  ]);

  const overlap = words.filter((word) => sourceWords.has(word)).length;
  return overlap / words.length >= 0.75;
}

function materialHint(material) {
  const normalized = cleanText(material).toLowerCase();
  if (!normalized || normalized.includes("see amazon")) {
    return "grounded materials";
  }

  return normalized;
}

function fitHint(fit) {
  const normalized = cleanText(fit).toLowerCase();
  if (!normalized || normalized.includes("check amazon")) {
    return "a practical fit";
  }

  return normalized;
}

function styleHint(styles) {
  const labels = (Array.isArray(styles) ? styles : [])
    .map((style) => labelize(style).toLowerCase())
    .filter(Boolean);

  return labels.slice(0, 2).join(" and ") || "everyday";
}

function buildFallbackEditorial(context) {
  const reference = editorialReference(context.categoryLabel);
  const referenceLead = reference.charAt(0).toUpperCase() + reference.slice(1);
  const styles = styleHint(context.styles);
  const fit = fitHint(context.fit);
  const material = materialHint(context.material);

  return {
    bestFor: `${referenceLead} suits men who want a dependable ${styles} option with ${fit}. It makes more sense in a repeatable wardrobe than in a trend-driven one.`,
    skipFor: `Skip ${reference} if you want a louder statement piece or exaggerated proportions. It is a steadier buy than an expressive one.`,
    worksBest: `${referenceLead} works best with clean basics, simple layers, and outfits that stay controlled. It earns its keep in low-friction daily styling.`,
    pros: [
      `Easy to work into repeat ${styles} outfits`,
      `${referenceLead} leans practical instead of flashy`,
      `${material.charAt(0).toUpperCase() + material.slice(1)} keep the feel grounded`,
    ],
    cons: [
      `May feel too safe if your wardrobe leans trend-heavy`,
      `Less appealing if you want standout detailing`,
    ],
  };
}

function normalizeEditorialText(value, maxLength, context, fallback) {
  const cleaned = truncate(stripTitleEcho(value, context), maxLength);
  if (!cleaned || containsForbiddenEditorialPhrase(cleaned, context) || hasHeavySourceOverlap(cleaned, context)) {
    return truncate(fallback, maxLength);
  }

  return cleaned;
}

function normalizeEditorialList(values, minimum, maximum, maxItemLength, context, fallbackValues) {
  const normalized = [];

  for (const value of Array.isArray(values) ? values : []) {
    const item = normalizeEditorialText(value, maxItemLength, context, "");
    if (!item || normalized.includes(item)) {
      continue;
    }
    normalized.push(item);
    if (normalized.length >= maximum) {
      break;
    }
  }

  if (normalized.length < minimum) {
    return fallbackValues.slice(0, maximum);
  }

  return normalized;
}

function extractAssistantContent(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;

  if (Array.isArray(content)) {
    const joined = content.map((part) => part?.text || part?.content || "").join("").trim();
    if (joined) {
      return joined;
    }
  } else if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim()) {
    return message.reasoning_content;
  }

  return "";
}

function buildEditorialMessages({ shortTitle, fullTitle, brand, categoryLabel, styles, bullets, material, fit, care }) {
  return [
    {
      role: "system",
      content:
        "You write concise menswear affiliate editorial copy for PrimeGent. Respond with valid JSON only. Never use markdown fences. Use the source bullets only as research input and do not copy their phrasing verbatim. Do not mention Amazon, affiliate links, reviews, ratings, shipping, or prices.",
    },
    {
      role: "user",
      content: `Return a JSON object with exactly these keys: "best_for", "skip_for", "works_best", "pros", "cons".

Rules:
- Write fresh editorial copy in plain English.
- "best_for", "skip_for", and "works_best" must each be 1-2 sentences.
- "pros" must contain 2 or 3 concise strings.
- "cons" must contain 1 or 2 concise strings.
- Keep the tone practical, specific, and non-hype.
- Never repeat, quote, or paraphrase the exact product title.
- Do not reuse any 3-word phrase from the title or source bullets.
- Do not start any field with the product title or brand name.
- Refer to the item generically, like "this shirt", "these shoes", "this jacket", or "this piece".
- Rewrite the source information into original editorial language, not catalog copy.

Product data:
${JSON.stringify(
  {
    shortTitle,
    fullTitle,
    brand,
    category: categoryLabel,
    styles: (Array.isArray(styles) ? styles : []).map(labelize),
    material,
    fit,
    care,
    amazonBullets: bullets,
  },
  null,
  2,
)}`,
    },
  ];
}

function parseEditorialResponse(rawText, context) {
  if (!rawText) {
    throw new Error("The model returned an empty editorial response.");
  }

  const parsed = parseJsonObject(rawText);
  const fallback = buildFallbackEditorial(context);
  const editorial = {
    bestFor: normalizeEditorialText(parsed.best_for || parsed.bestFor, 240, context, fallback.bestFor),
    skipFor: normalizeEditorialText(parsed.skip_for || parsed.skipFor, 240, context, fallback.skipFor),
    worksBest: normalizeEditorialText(parsed.works_best || parsed.worksBest, 240, context, fallback.worksBest),
    pros: normalizeEditorialList(parsed.pros, 2, 3, 120, context, fallback.pros),
    cons: normalizeEditorialList(parsed.cons, 1, 2, 120, context, fallback.cons),
  };

  if (!editorial.bestFor || !editorial.skipFor || !editorial.worksBest) {
    throw new Error("The model omitted one or more required editorial fields.");
  }

  return editorial;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return json({ error: "Missing OPENROUTER_API_KEY secret in Cloudflare Pages." }, 500);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON request body." }, 400);
  }

  if (!input?.shortTitle || !input?.fullTitle || !Array.isArray(input?.bullets)) {
    return json({ error: "Missing required editorial input." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": new URL(request.url).origin,
        "X-Title": "PrimeGent Editorial Proxy",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || input.model || "nvidia/nemotron-3-super-120b-a12b:free",
        temperature: 0,
        max_tokens: 450,
        response_format: { type: "json_object" },
        messages: buildEditorialMessages(input),
      }),
    });

    if (!response.ok) {
      const details = cleanText(await response.text());
      return json({ error: `OpenRouter returned ${response.status}${details ? `: ${details}` : ""}` }, response.status);
    }

    const payload = await response.json();
    const editorial = parseEditorialResponse(extractAssistantContent(payload), input);
    return json({ editorial });
  } catch (error) {
    if (error?.name === "AbortError") {
      return json({ error: "OpenRouter timed out while generating editorial copy." }, 504);
    }

    return json({ error: cleanText(error?.message || "Editorial generation failed.") }, 500);
  } finally {
    clearTimeout(timeout);
  }
}
