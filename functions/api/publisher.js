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

  const short = value.slice(0, Math.max(maxLength - 1, 0));
  const cut = short.lastIndexOf(" ");
  return `${short.slice(0, cut > 0 ? cut : short.length)}...`;
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

function tokenize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function uniqueList(values, limit) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    const normalized = cleaned.toLowerCase();
    if (!cleaned || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(cleaned);

    if (limit && result.length >= limit) {
      break;
    }
  }

  return result;
}

function titleCase(value) {
  const lower = cleanText(value).toLowerCase();
  if (!lower) {
    return "";
  }

  const minorWords = new Set(["a", "an", "and", "as", "at", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
  return lower
    .split(" ")
    .map((part, index) => {
      if (!part) {
        return "";
      }

      if (index > 0 && minorWords.has(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function extractAssistantContent(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;

  if (Array.isArray(content)) {
    const joined = content.map((part) => part?.text || part?.content || "").join("").trim();
    if (joined) {
      return joined;
    }
  }

  if (typeof content === "string" && content.trim()) {
    return content;
  }

  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim()) {
    return message.reasoning_content;
  }

  return "";
}

function sanitizeCatalog(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .map((product) => {
      const id = cleanText(product?.id);
      const name = cleanText(product?.name);
      const url = cleanText(product?.url);

      if (!id || !name || !url) {
        return null;
      }

      return {
        id,
        name,
        url,
        image: cleanText(product?.image),
        description: truncate(cleanText(product?.description), 220),
        category: cleanText(product?.category),
        categoryLabel: cleanText(product?.categoryLabel || product?.category || "Pick"),
        styles: uniqueList(product?.styles || [], 4),
        tags: uniqueList(product?.tags || [], 4),
        brand: cleanText(product?.brand),
        priceLabel: cleanText(product?.priceLabel || "Catalog pick"),
      };
    })
    .filter(Boolean)
    .slice(0, 180);
}

const CATEGORY_ALIASES = {
  shirts: ["shirt", "shirts", "linen", "button", "oxford", "polo", "flannel", "tee"],
  pants: ["pant", "pants", "chino", "chinos", "jean", "jeans", "trouser", "trousers", "cargo"],
  shoes: ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "loafer", "loafers", "oxford"],
  jackets: ["jacket", "jackets", "coat", "outerwear", "overshirt", "windbreaker", "layer", "layers"],
  accessories: ["watch", "watches", "belt", "beanie", "sunglasses", "accessory", "accessories"],
  basics: ["sweater", "hoodie", "hoodies", "knit", "knitwear", "basic", "basics", "cardigan"],
  activewear: ["track", "activewear", "athletic", "sporty", "trainer", "running", "gym"],
};

function scoreProduct(product, queryText) {
  const tokens = tokenize(queryText);
  if (!tokens.length) {
    return 1;
  }

  const haystack = {
    name: tokenize(product.name),
    description: tokenize(product.description),
    category: tokenize(`${product.category} ${product.categoryLabel}`),
    styles: tokenize(product.styles.join(" ")),
    tags: tokenize(product.tags.join(" ")),
    brand: tokenize(product.brand),
  };

  let score = 0;

  tokens.forEach((token) => {
    if (haystack.name.includes(token)) {
      score += 8;
    }
    if (haystack.category.includes(token)) {
      score += 7;
    }
    if (haystack.styles.includes(token)) {
      score += 5;
    }
    if (haystack.tags.includes(token)) {
      score += 4;
    }
    if (haystack.description.includes(token)) {
      score += 2;
    }
    if (haystack.brand.includes(token)) {
      score += 1;
    }
  });

  (CATEGORY_ALIASES[product.category] || []).forEach((alias) => {
    if (tokens.includes(alias)) {
      score += 5;
    }
  });

  product.styles.forEach((style) => {
    if (tokens.includes(style)) {
      score += 4;
    }
  });

  product.tags.forEach((tag) => {
    tokenize(tag).forEach((token) => {
      if (tokens.includes(token)) {
        score += 3;
      }
    });
  });

  return score;
}

function chooseCategory(title, description) {
  const combined = `${cleanText(title)} ${cleanText(description)}`.toLowerCase();

  if (/(outfit|what to wear|weekend|date night|airport|wedding|office|business casual)/.test(combined)) {
    return "Outfit Ideas";
  }

  if (/(guide|how to|why|rule|explained|vs|difference)/.test(combined)) {
    return "Style Guides";
  }

  if (/(buy|best|worth|watch|shoe|boots|sneaker|pick)/.test(combined)) {
    return "Buying Guides";
  }

  return "Style Guides";
}

function buildThemePhrase(description) {
  const text = cleanText(description).toLowerCase();
  const parts = [];

  if (/\bmen'?s\b|\bmens\b|\bmale\b/.test(text)) {
    parts.push("Men's");
  }

  const season = ["spring", "summer", "fall", "winter"].find((item) => text.includes(item));
  if (season) {
    parts.push(titleCase(season));
  }

  const styleLabels = [
    { pattern: /smart casual/, label: "Smart Casual" },
    { pattern: /business casual/, label: "Business Casual" },
    { pattern: /date night/, label: "Date Night" },
    { pattern: /weekend/, label: "Weekend" },
    { pattern: /travel/, label: "Travel" },
    { pattern: /minimalist|minimal/, label: "Minimal" },
  ];
  const styleMatch = styleLabels.find((item) => item.pattern.test(text));
  if (styleMatch) {
    parts.push(styleMatch.label);
  }

  const topicLabels = [
    { pattern: /outfit|what to wear|wardrobe/, label: "Outfits" },
    { pattern: /shirt|linen|oxford|polo|tee/, label: "Shirts" },
    { pattern: /shoe|sneaker|boot|loafer|oxford shoe/, label: "Shoes" },
    { pattern: /pant|trouser|jean|chino|cargo/, label: "Pants" },
    { pattern: /jacket|overshirt|outerwear|coat/, label: "Jackets" },
    { pattern: /watch|accessor|belt|sunglasses/, label: "Accessories" },
  ];
  const topicMatch = topicLabels.find((item) => item.pattern.test(text));
  if (topicMatch) {
    parts.push(topicMatch.label);
  }

  if (parts.length) {
    return truncate(parts.join(" "), 70);
  }

  const focusedMatch = text.match(/\b(?:focused on|about|around|covering)\s+(.+)$/i);
  if (focusedMatch?.[1]) {
    return truncate(titleCase(focusedMatch[1]), 70);
  }

  const base = cleanText(description)
    .replace(/^(create|write|make|generate)\s+/i, "")
    .replace(/^(me\s+)?(a|an|some)\s+/i, "")
    .replace(/^(articles?|blog posts?|posts?)\s+(about|on)\s+/i, "")
    .replace(/^(for\s+me\s+)?/i, "");

  return truncate(titleCase(base || "Men's Style Ideas"), 70);
}

function buildAutoTitles(description, articleCount, customTitles) {
  const phrase = buildThemePhrase(description);
  const titlePhrase = titleCase(phrase);
  const titles = uniqueList(customTitles || [], articleCount);
  const templates = [
    `${titlePhrase} That Feel Current, Not Forced`,
    `How to Wear ${titlePhrase} Without Looking Overdone`,
    `${titlePhrase}: The Clean, Repeatable Version`,
    `The Easiest Way to Build ${titlePhrase}`,
    `${titlePhrase} That Actually Work in Real Life`,
    `A Cleaner Approach to ${titlePhrase}`,
    `What ${titlePhrase} Should Look Like Now`,
    `${titlePhrase} That Feel Easy, Not Lazy`,
  ];

  templates.forEach((title) => {
    if (titles.length < articleCount) {
      titles.push(title);
    }
  });

  while (titles.length < articleCount) {
    titles.push(`${titlePhrase}: Article ${titles.length + 1}`);
  }

  return uniqueList(titles, articleCount).slice(0, articleCount);
}

function matchProducts(catalog, title, description, limit) {
  return catalog
    .map((product) => ({ ...product, score: scoreProduct(product, `${title} ${description}`) }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, limit)
    .map(({ score, ...product }) => product);
}

function buildTags(title, products) {
  const candidateTags = [cleanText(title)];

  products.forEach((product) => {
    candidateTags.push(product.categoryLabel);
    product.tags.slice(0, 2).forEach((tag) => candidateTags.push(tag));
    product.styles.slice(0, 2).forEach((style) => candidateTags.push(style.replace(/-/g, " ")));
  });

  tokenize(title)
    .slice(0, 2)
    .forEach((word) => candidateTags.push(word));

  return uniqueList(candidateTags, 5);
}

function buildFallbackArticle(brief) {
  const category = chooseCategory(brief.title, brief.description);
  const tags = buildTags(brief.title, brief.products);
  const products = brief.products;
  const lead = products[0];
  const second = products[1] || lead;
  const third = products[2] || second;
  const fourth = products[3] || third;
  const themeLabel = cleanText(brief.title).toLowerCase() || cleanText(brief.description).toLowerCase() || "everyday style";

  return {
    title: brief.title,
    dek: truncate(
      `A blog-ready draft for ${themeLabel} that stays editorial-first and only promotes matched catalog products.`,
      170,
    ),
    summary: truncate(
      `This draft uses ${products.length} matched picks from the live PrimeGent catalog and keeps the outfit logic ahead of the affiliate placement.`,
      220,
    ),
    category,
    tags,
    sections: [
      {
        heading: "Start with the outfit logic",
        paragraphs: [
          `A strong article about ${themeLabel} should explain the shape of the outfit before it reaches for product links. The best version gives the reader a usable framework: cleaner proportions, tighter color control, and a small number of pieces that repeat well.`,
          `That keeps the article practical and controlled. The product mentions work best when they support the editorial point instead of replacing it.`,
        ],
        productMentions: [
          {
            productId: lead.id,
            rationale: "This pick works as an anchor because it fits the brief without forcing the whole outfit into one louder direction.",
          },
        ],
      },
      {
        heading: "Use one strong piece to set the tone",
        paragraphs: [
          "Readers usually need help deciding which piece should lead. The answer is rarely to stack statement items. It is better to let one clean item set the tone, then let the rest of the outfit support it.",
          "That is why the strongest affiliate placements are the ones that clarify the formula. When the recommendation explains the role of a piece, the link feels earned instead of inserted.",
        ],
        productMentions: uniqueList([lead?.id, second?.id], 2).map((productId, index) => ({
          productId,
          rationale:
            index === 0
              ? "This is the easiest lead item for readers who want the main idea to feel immediate and repeatable."
              : "This supporting pick keeps the look grounded so the article can suggest a fuller outfit without drifting into guesswork.",
        })),
      },
      {
        heading: "Keep the wardrobe disciplined",
        paragraphs: [
          "The fastest way to make a themed outfit article fall apart is to recommend pieces that all compete for attention. Better affiliate content narrows the palette, respects proportion, and keeps texture working in one direction.",
          "That matters because readers are not buying isolated products. They are buying confidence that the pieces can live together inside a repeatable wardrobe.",
        ],
        productMentions: uniqueList([third?.id, fourth?.id], 2).map((productId, index) => ({
          productId,
          rationale:
            index === 0
              ? "This option reinforces the article's wardrobe logic by adding range without breaking the cleaner silhouette."
              : "This pick helps the outfit feel finished while still staying inside the same style lane.",
        })),
      },
      {
        heading: "Make the advice feel useful in real life",
        paragraphs: [
          "The article should speak to real situations: casual offices, weekends, dinners, travel days, or warm-weather errands. When the use case is concrete, the affiliate recommendation feels more like guidance and less like placement.",
          "That practical framing gives the article room to promote products naturally. The products are there because they solve the styling problem the section is describing.",
        ],
        productMentions: uniqueList(products.map((product) => product.id), 2).map((productId) => ({
          productId,
          rationale: "This pick earns its slot because it maps cleanly to the situation the section is describing.",
        })),
      },
    ],
    conclusion:
      "The strongest affiliate article does not chase volume with random links. It sharpens the reader's decision, then places the right products where the recommendation already makes sense.",
    affiliateNote:
      "Editorial note: related product links in this draft should be disclosed as affiliate links when published.",
    productIds: products.map((product) => product.id),
    source: "fallback",
  };
}

function buildPublisherMessages(briefs) {
  return [
    {
      role: "system",
      content:
        "You write concise men's style blog drafts for PrimeGent. Respond with valid JSON only. No markdown fences. Do not invent products, brands, links, prices, or availability. The prose paragraphs must stay editorial and generic; do not mention exact product names or brands in the article body. Concrete product promotion must happen only through the product_mentions array using the provided product_id values.",
    },
    {
      role: "user",
      content: `Return a JSON object with exactly this shape:
{
  "articles": [
    {
      "dek": "...",
      "summary": "...",
      "category": "...",
      "tags": ["..."],
      "sections": [
        {
          "heading": "...",
          "paragraphs": ["...", "..."],
          "product_mentions": [
            { "product_id": "...", "rationale": "..." }
          ]
        }
      ],
      "conclusion": "...",
      "affiliate_note": "..."
    }
  ]
}

Rules:
- Return exactly ${briefs.length} articles in the same order as the input briefs.
- Do not rewrite or return the titles; titles are handled separately.
- "dek" must be 1 sentence, max 170 characters.
- "summary" must be 1-2 sentences, max 220 characters.
- "category" must be one of: "Style Guides", "Wardrobe Basics", "Outfit Ideas", "Buying Guides".
- "tags" must contain 3 to 5 short strings.
- Each article "sections" array must contain 4 or 5 objects.
- Each section object must have exactly these keys: "heading", "paragraphs", "product_mentions".
- "paragraphs" must contain 2 short paragraphs.
- "product_mentions" must contain 1 or 2 objects.
- Every "product_id" must match one of the brief's provided products exactly.
- Use the product_mentions to place products naturally. Do not create product names inside the editorial paragraphs.
- Do not mention Amazon, affiliate tags, prices, discounts, reviews, ratings, shipping, or stock status.
- Keep the tone practical, editorial-first, and non-hype.
- "conclusion" must be 1 short paragraph.
- "affiliate_note" must be a short disclosure-friendly sentence.

Input briefs:
${JSON.stringify(
  briefs.map((brief) => ({
    title: brief.title,
    description: brief.description,
    products: brief.products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.categoryLabel,
      description: product.description,
      styles: product.styles,
      tags: product.tags,
    })),
  })),
  null,
  2,
)}`,
    },
  ];
}

function normalizeSection(section, validIds, fallbackSection) {
  const paragraphs = uniqueList(section?.paragraphs || [], 2).slice(0, 2);
  const mentions = (Array.isArray(section?.product_mentions) ? section.product_mentions : [])
    .map((mention) => ({
      productId: cleanText(mention?.product_id),
      rationale: truncate(cleanText(mention?.rationale), 180),
    }))
    .filter((mention) => mention.productId && validIds.has(mention.productId) && mention.rationale)
    .slice(0, 2);

  if (paragraphs.length < 2 || !mentions.length) {
    return fallbackSection;
  }

  return {
    heading: truncate(cleanText(section?.heading), 70) || fallbackSection.heading,
    paragraphs,
    productMentions: mentions,
  };
}

function normalizeArticle(aiArticle, brief, fallbackArticle) {
  const validIds = new Set(brief.products.map((product) => product.id));
  const sections = (Array.isArray(aiArticle?.sections) ? aiArticle.sections : [])
    .slice(0, fallbackArticle.sections.length)
    .map((section, index) => normalizeSection(section, validIds, fallbackArticle.sections[index] || fallbackArticle.sections[0]))
    .filter(Boolean);

  return {
    title: brief.title,
    dek: truncate(cleanText(aiArticle?.dek), 170) || fallbackArticle.dek,
    summary: truncate(cleanText(aiArticle?.summary), 220) || fallbackArticle.summary,
    category: ["Style Guides", "Wardrobe Basics", "Outfit Ideas", "Buying Guides"].includes(cleanText(aiArticle?.category))
      ? cleanText(aiArticle.category)
      : fallbackArticle.category,
    tags: uniqueList(Array.isArray(aiArticle?.tags) ? aiArticle.tags : fallbackArticle.tags, 5).slice(0, 5),
    sections: sections.length >= 4 ? sections : fallbackArticle.sections,
    conclusion: truncate(cleanText(aiArticle?.conclusion), 260) || fallbackArticle.conclusion,
    affiliateNote: truncate(cleanText(aiArticle?.affiliate_note), 140) || fallbackArticle.affiliateNote,
    productIds: brief.products.map((product) => product.id),
    source: "ai",
  };
}

function normalizeArticleArrayResponse(rawText, briefs, fallbackArticles) {
  if (!rawText) {
    return fallbackArticles;
  }

  const parsed = parseJsonObject(rawText);
  const articles = Array.isArray(parsed?.articles) ? parsed.articles : [];

  if (articles.length !== briefs.length) {
    return fallbackArticles;
  }

  return briefs.map((brief, index) => normalizeArticle(articles[index], brief, fallbackArticles[index]));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON request body." }, 400);
  }

  const description = truncate(cleanText(input?.description), 520);
  const parsedCount = Number.parseInt(String(input?.articleCount ?? "1"), 10);
  const articleCount = Number.isFinite(parsedCount) ? Math.min(Math.max(parsedCount, 1), 6) : 1;
  const customTitles = uniqueList(splitLines(input?.customTitles), articleCount);
  const catalog = sanitizeCatalog(input?.catalog);

  if (!description) {
    return json({ error: "A description is required." }, 400);
  }

  if (!catalog.length) {
    return json({ error: "A valid product catalog is required." }, 400);
  }

  const titles = buildAutoTitles(description, articleCount, customTitles);
  const briefs = titles.map((title) => ({
    title,
    description,
    products: matchProducts(catalog, title, description, 4),
  }));
  const fallbackArticles = briefs.map((brief) => buildFallbackArticle(brief));
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return json({ articles: fallbackArticles, source: "fallback" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": new URL(request.url).origin,
        "X-Title": "PrimeGent Affiliate Publisher",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
        temperature: 0.4,
        max_tokens: 3200,
        response_format: { type: "json_object" },
        messages: buildPublisherMessages(briefs),
      }),
    });

    if (!response.ok) {
      return json({ articles: fallbackArticles, source: "fallback" });
    }

    const payload = await response.json();
    const articles = normalizeArticleArrayResponse(extractAssistantContent(payload), briefs, fallbackArticles);
    return json({ articles, source: articles.some((article) => article.source === "ai") ? "ai" : "fallback" });
  } catch {
    return json({ articles: fallbackArticles, source: "fallback" });
  } finally {
    clearTimeout(timeout);
  }
}
