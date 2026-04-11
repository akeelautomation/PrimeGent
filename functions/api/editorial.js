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
- Do not start any field with the product title or brand name.
- Refer to the item generically, like "this shirt", "these shoes", "this jacket", or "this piece".

Product data:
${JSON.stringify(
  {
    shortTitle,
    fullTitle,
    brand,
    category: categoryLabel,
    styles,
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
    const editorial = parseJsonObject(extractAssistantContent(payload));
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
