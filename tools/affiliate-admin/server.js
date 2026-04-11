const http = require("http");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");

const ROOT_DIR = path.resolve(__dirname, "..", "..");

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) {
    return;
  }

  const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value.replace(/\\n/g, "\n");
    }
  }
}

loadEnvFile(path.join(ROOT_DIR, ".env.local"));
loadEnvFile(path.join(ROOT_DIR, ".env"));

const PUBLIC_DIR = path.join(__dirname, "public");
const PICKS_PATH = path.join(ROOT_DIR, "picks.html");
const SITEMAP_PATH = path.join(ROOT_DIR, "sitemap.xml");
const SITE_URL = "https://primegent.pages.dev";
const PORT = Number(process.env.PORT || 4311);
const EDITORIAL_API_URL = process.env.EDITORIAL_API_URL || `${SITE_URL}/api/editorial`;
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
const OPENROUTER_REFERER = process.env.OPENROUTER_HTTP_REFERER || SITE_URL;
const OPENROUTER_TITLE = "PrimeGent Affiliate Admin";

const AMAZON_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "accept-language": "en-US,en;q=0.9",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

const CATEGORY_DEFS = [
  {
    id: "shirts",
    label: "Shirts",
    tone: "shirts",
    keywords: ["shirt", "tee", "t-shirt", "polo", "henley", "oxford", "linen", "flannel"],
    styles: ["smart-casual", "office", "weekend"],
  },
  {
    id: "pants",
    label: "Pants",
    tone: "pants",
    keywords: ["pant", "pants", "jean", "jeans", "chino", "trouser", "jogger", "cargo"],
    styles: ["casual", "smart-casual", "weekend"],
  },
  {
    id: "shoes",
    label: "Shoes",
    tone: "shoes",
    keywords: ["sneaker", "boot", "loafer", "oxford", "shoe", "trainer", "derby", "moc"],
    styles: ["smart-casual", "weekend", "date-night"],
  },
  {
    id: "jackets",
    label: "Jackets",
    tone: "jackets",
    keywords: ["jacket", "coat", "overshirt", "shacket", "bomber", "fleece", "hoodie", "blazer"],
    styles: ["casual", "travel", "rugged"],
  },
  {
    id: "accessories",
    label: "Accessories",
    tone: "accessories",
    keywords: [
      "watch",
      "sunglasses",
      "glasses",
      "eyeglasses",
      "eyewear",
      "frames",
      "belt",
      "beanie",
      "hat",
      "wallet",
      "bag",
      "cap",
    ],
    styles: ["casual", "minimal", "weekend"],
  },
  {
    id: "basics",
    label: "Basics",
    tone: "basics",
    keywords: ["sweater", "crew", "cardigan", "base layer", "thermal", "knit", "pullover"],
    styles: ["minimal", "office", "smart-casual"],
  },
  {
    id: "activewear",
    label: "Activewear",
    tone: "activewear",
    keywords: ["track", "track suit", "tracksuit", "running", "gym", "performance", "training", "athletic"],
    styles: ["sporty", "casual", "travel"],
  },
];

const BRAND_TIERS = {
  premium: [
    "allen edmonds",
    "banana republic",
    "boss",
    "madewell",
    "patagonia",
    "ray-ban",
    "roark",
    "thursday",
    "veja",
  ],
  value: ["amazon essentials", "dockers", "fossil", "muji", "timex", "uniqlo"],
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/<\/script/gi, "<\\/script");
}

function toAsciiText(value) {
  return String(value ?? "")
    .replace(/[â€™â€˜]/g, "'")
    .replace(/[â€œâ€]/g, '"')
    .replace(/[â€“â€”]/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function decodeHtml(value) {
  if (!value) {
    return "";
  }

  const named = {
    amp: "&",
    quot: '"',
    apos: "'",
    nbsp: " ",
    lt: "<",
    gt: ">",
    mdash: "-",
    ndash: "-",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    trade: "TM",
    reg: "(R)",
    copy: "(C)",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, token) => {
    if (token[0] === "#") {
      const isHex = token[1]?.toLowerCase() === "x";
      const codePoint = parseInt(token.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    return Object.prototype.hasOwnProperty.call(named, token) ? named[token] : _;
  });
}

function stripTags(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}

function cleanText(value) {
  return toAsciiText(decodeHtml(stripTags(value || "")))
    .replace(/[\u3010\u3011]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function labelize(value) {
  return String(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  const short = value.slice(0, maxLength - 1);
  const lastSpace = short.lastIndexOf(" ");
  return `${short.slice(0, Math.max(lastSpace, 0))}...`;
}

function normalizeProductAvailabilityContent(availability) {
  return availability === "InStock" ? "instock" : "oos";
}

function normalizeMoneyValue(value) {
  const match = String(value ?? "").match(/([0-9][0-9,]*)(?:\.([0-9]{1,2}))?/);
  if (!match) {
    return "";
  }

  const dollars = match[1].replace(/,/g, "");
  const cents = (match[2] || "00").padEnd(2, "0").slice(0, 2);
  return `${dollars}.${cents}`;
}

function extractMoney(html) {
  const scopedAnchors = [
    'id="corePriceDisplay_desktop_feature_div"',
    'id="corePrice_feature_div"',
    'id="apex_desktop"',
    'id="desktop_buybox"',
    'id="corePrice_mobile_feature_div"',
  ];

  const scopedPatterns = [
    /class="[^"]*\b(?:priceToPay|apex-price-to-pay-value|apex-pricetopay-value)\b[^"]*"[\s\S]*?<span class="a-offscreen">\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /class="[^"]*\b(?:priceToPay|apex-price-to-pay-value|apex-pricetopay-value)\b[^"]*"[\s\S]*?<span class="a-price-whole">([0-9][0-9,]*)<span class="a-price-decimal">\.<\/span><\/span>\s*<span class="a-price-fraction">([0-9]{2})/i,
    /<span id="apex-pricetopay-accessibility-label"[^>]*>\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /<span class="a-offscreen">\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const anchor of scopedAnchors) {
    const index = html.indexOf(anchor);
    if (index < 0) {
      continue;
    }

    const slice = html.slice(index, index + 20000);
    for (const pattern of scopedPatterns) {
      const match = slice.match(pattern);
      if (!match) {
        continue;
      }

      const value = match[2] ? `${match[1]}.${match[2]}` : match[1];
      const normalized = normalizeMoneyValue(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  const fallbackPatterns = [
    /"priceAmount"\s*:\s*"?([0-9][0-9,]*(?:\.[0-9]{1,2})?)"?/i,
    /"priceToPay"\s*:\s*{[\s\S]*?"price"\s*:\s*"?\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"?/i,
    /"priceToPay"\s*:\s*{[\s\S]*?"value"\s*:\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /data-a-price="\{&quot;amount&quot;:([0-9][0-9,]*(?:\.[0-9]{1,2})?)&quot;/i,
    /data-a-price="\{\"amount\":([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /<span class="a-price[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /"displayPrice"\s*:\s*"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"/i,
    /"buyingPrice"\s*:\s*"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"/i,
    /id="priceblock_(?:our|deal|sale|pospromoprice)"[^>]*>\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of fallbackPatterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    const normalized = normalizeMoneyValue(match[1]);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function extractAvailability(html) {
  if (/id="outOfStockBuyBox_feature_div"/i.test(html) || /currently unavailable/i.test(html) || /out of stock/i.test(html)) {
    return "OutOfStock";
  }

  const match =
    html.match(/<div id="availability"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i) ||
    html.match(/<div id="availabilityInsideBuyBox_feature_div"[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);

  const text = cleanText(match?.[1] || "").toLowerCase();
  return text.includes("currently unavailable") || text.includes("out of stock") ? "OutOfStock" : "InStock";
}

function extractImageSize(url) {
  const square = url.match(/_SL(\d+)_/i);
  if (square) {
    return { width: square[1], height: square[1] };
  }

  const dimension = url.match(/_SX(\d+)_.*?_SY(\d+)_/i);
  if (dimension) {
    return { width: dimension[1], height: dimension[2] };
  }

  return { width: "", height: "" };
}

function normalizeImageUrls(input) {
  const values = Array.isArray(input) ? input : [input];
  const cleaned = [];

  for (const value of values) {
    for (const part of String(value ?? "").split(/\r?\n/)) {
      const url = part.trim();
      if (!url || cleaned.includes(url)) {
        continue;
      }

      cleaned.push(url);
    }
  }

  return cleaned;
}

function extractAmazonPathInfo(urlString) {
  const url = new URL(urlString);
  const parts = url.pathname.split("/").filter(Boolean);
  const dpIndex = parts.findIndex((part) => part.toLowerCase() === "dp");
  const gpIndex = parts.findIndex((part) => part.toLowerCase() === "product");
  const asin = dpIndex >= 0 ? parts[dpIndex + 1] : gpIndex >= 1 ? parts[gpIndex + 1] : "";
  const slugParts = dpIndex > 0 ? parts.slice(0, dpIndex) : [];

  return {
    asin: cleanText(asin).toUpperCase(),
    slugHint: slugParts.join(" "),
    canonicalUrl: `https://${url.hostname}/dp/${cleanText(asin).toUpperCase()}`,
  };
}

function extractMatch(html, regex) {
  const match = html.match(regex);
  return match ? cleanText(match[1]) : "";
}

function normalizeBulletCopy(value) {
  return cleanText(value)
    .replace(/^[,.;:\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBullets(html) {
  const sectionMatch = html.match(/<div id="feature-bullets"[\s\S]*?<ul[\s\S]*?<\/ul>/i);
  if (!sectionMatch) {
    return [];
  }

  return Array.from(sectionMatch[0].matchAll(/<li[^>]*>\s*<span class="a-list-item">([\s\S]*?)<\/span>\s*<\/li>/gi))
    .map((match) => normalizeBulletCopy(match[1]))
    .filter(Boolean)
    .filter((bullet) => bullet.length > 25)
    .slice(0, 4);
}

function titleFromAmazonTitle(fullTitle, brand) {
  const primary = cleanText(fullTitle).split(",")[0] || cleanText(fullTitle);
  const normalized = primary.replace(/\s+/g, " ").trim();

  if (!brand) {
    return normalized;
  }

  const brandPattern = new RegExp(`^${escapeRegExp(brand)}\\s+`, "i");
  const withoutBrand = normalized.replace(brandPattern, "").trim();
  return withoutBrand ? `${brand} ${withoutBrand}` : normalized;
}

function normalizeBrand(rawBrand, fullTitle) {
  const cleaned = cleanText(rawBrand)
    .replace(/^Visit the\s+/i, "")
    .replace(/\s+Store$/i, "")
    .replace(/^Brand:\s*/i, "")
    .trim();

  if (cleaned) {
    return cleaned;
  }

  return cleanText(fullTitle).split(/\s+/).slice(0, 2).join(" ");
}

function deriveCardCopy(bullets, shortTitle) {
  const candidate = bullets.find(Boolean);
  if (candidate) {
    return truncate(candidate, 165);
  }

  return `A practical ${shortTitle.toLowerCase()} pick that sharpens everyday outfits without overcomplicating the wardrobe.`;
}

function deriveSummary(bullets, shortTitle) {
  const candidate = bullets.find(Boolean);
  if (candidate) {
    return truncate(candidate, 170);
  }

  return `${shortTitle} with affiliate-ready product details, clean metadata, and a PrimeGent styling angle.`;
}

function deriveMetaDescription(shortTitle, summary) {
  return truncate(`Affiliate pick: ${shortTitle}. ${summary}`, 158);
}

function getCategories() {
  return CATEGORY_DEFS.map(({ id, label }) => ({ id, label }));
}

function inferCategoryId(productText) {
  const haystack = productText.toLowerCase();

  const scored = CATEGORY_DEFS.map((category) => {
    let score = 0;
    let matched = 0;

    for (const keyword of category.keywords) {
      if (haystack.includes(keyword)) {
        score += keyword.length >= 6 ? 2 : 1;
        matched += 1;
      }
    }

    return { id: category.id, score, matched };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.matched !== a.matched) {
      return b.matched - a.matched;
    }
    return 0;
  });

  return scored[0].score > 0 ? scored[0].id : "basics";
}

function inferStyles(categoryId, fullTitle, bullets, styleTags) {
  const explicit = String(styleTags || "")
    .split(/[,\n]/)
    .map((item) => slugify(item))
    .filter(Boolean);

  if (explicit.length) {
    return [...new Set(explicit)].slice(0, 4);
  }

  const category = CATEGORY_DEFS.find((item) => item.id === categoryId) || CATEGORY_DEFS[0];
  const styles = [...category.styles];
  const haystack = `${fullTitle} ${bullets.join(" ")}`.toLowerCase();

  if (haystack.includes("minimal")) {
    styles.unshift("minimal");
  }
  if (haystack.includes("travel")) {
    styles.unshift("travel");
  }
  if (haystack.includes("running") || haystack.includes("training")) {
    styles.unshift("sporty");
  }
  if (haystack.includes("leather") || haystack.includes("suede")) {
    styles.unshift("smart-casual");
  }

  return [...new Set(styles)].slice(0, 4);
}

function inferBrandTier(brand, override) {
  if (override && ["value", "mainstream", "premium"].includes(override)) {
    return override;
  }

  const normalized = cleanText(brand).toLowerCase();
  if (BRAND_TIERS.premium.some((entry) => normalized.includes(entry))) {
    return "premium";
  }
  if (BRAND_TIERS.value.some((entry) => normalized.includes(entry))) {
    return "value";
  }

  return "mainstream";
}

function derivePriceBucket(price) {
  const numeric = Number(price);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "50-100";
  }
  if (numeric < 50) {
    return "under-50";
  }
  if (numeric < 100) {
    return "50-100";
  }
  if (numeric < 150) {
    return "100-150";
  }
  return "150-plus";
}

function deriveVisual(shortTitle, categoryId) {
  const words = cleanText(shortTitle)
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter((word) => !["men", "mens", "women", "womens", "amazon"].includes(word.toLowerCase()));

  if (words.length) {
    return words.slice(-1)[0];
  }

  return labelize(categoryId);
}

function deriveMaterial(shortTitle, bullets, override) {
  if (override?.trim()) {
    return override.trim();
  }

  const haystack = `${shortTitle} ${bullets.join(" ")}`.toLowerCase();
  const materials = [
    "cotton",
    "merino wool",
    "wool",
    "linen",
    "leather",
    "suede",
    "denim",
    "canvas",
    "polyester",
    "nylon",
    "fleece",
    "rubber",
    "mesh",
    "stainless steel",
  ];

  for (const material of materials) {
    if (haystack.includes(material)) {
      return labelize(material.replace(/\s+/g, "-"));
    }
  }

  return "See Amazon listing for full material details";
}

function deriveFit(shortTitle, bullets, override) {
  if (override?.trim()) {
    return override.trim();
  }

  const haystack = `${shortTitle} ${bullets.join(" ")}`.toLowerCase();
  const fits = [
    ["slim", "Slim fit"],
    ["regular", "Regular fit"],
    ["straight", "Straight fit"],
    ["relaxed", "Relaxed fit"],
    ["tapered", "Tapered fit"],
    ["athletic", "Athletic fit"],
  ];

  for (const [keyword, label] of fits) {
    if (haystack.includes(keyword)) {
      return label;
    }
  }

  return "Check Amazon sizing notes before ordering";
}

function deriveCare(shortTitle, bullets, override) {
  if (override?.trim()) {
    return override.trim();
  }

  const haystack = `${shortTitle} ${bullets.join(" ")}`.toLowerCase();
  if (haystack.includes("leather") || haystack.includes("suede")) {
    return "Brush and spot clean to keep the finish looking sharp";
  }
  if (haystack.includes("wool") || haystack.includes("merino")) {
    return "Use a gentle wool wash cycle or hand wash, then dry flat";
  }
  if (haystack.includes("sneaker") || haystack.includes("shoe") || haystack.includes("boot")) {
    return "Wipe down after wear and rotate pairs to preserve the shape";
  }

  return "Follow the retailer care label and wash gently to preserve fit";
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

function stripTitleEcho(value, { shortTitle, fullTitle, brand, categoryLabel }) {
  let text = cleanText(String(value ?? "").replace(/^[-*]\s+/, "").replace(/^[A-Za-z ]+:\s+/, ""));
  const reference = editorialReference(categoryLabel);
  const candidates = [
    fullTitle,
    shortTitle,
    brand && shortTitle ? `${brand} ${shortTitle}` : "",
    brand,
  ]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item) => item.length >= 5)
    .sort((a, b) => b.length - a.length);

  for (const phrase of candidates) {
    text = text.replace(new RegExp(escapeRegExp(phrase), "gi"), reference);
  }

  text = text
    .replace(new RegExp(`^(?:the\\s+)?${escapeRegExp(reference)}\\s*(?:is|works|fits|suits)?\\s*-?\\s*`, "i"), (match) => {
      if (/\bis\b/i.test(match)) {
        return `${reference.charAt(0).toUpperCase() + reference.slice(1)} is `;
      }
      return `${reference.charAt(0).toUpperCase() + reference.slice(1)} `;
    })
    .replace(/\bthe this\b/gi, "this")
    .replace(/\bthe these\b/gi, "these")
    .replace(/\bthis item piece\b/gi, "this piece")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function normalizeEditorialText(value, maxLength, context) {
  return truncate(stripTitleEcho(value, context), maxLength);
}

function normalizeEditorialList(values, minimum, maximum, maxItemLength, context) {
  const normalized = [];

  for (const value of Array.isArray(values) ? values : []) {
    const item = normalizeEditorialText(value, maxItemLength, context);
    if (!item || normalized.includes(item)) {
      continue;
    }
    normalized.push(item);
    if (normalized.length >= maximum) {
      break;
    }
  }

  if (normalized.length < minimum) {
    throw new Error("The model did not return enough list items.");
  }

  return normalized;
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
    styles: styles.map(labelize),
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

function parseEditorialResponse(rawText, context) {
  if (!rawText) {
    throw new Error("The model returned an empty editorial response.");
  }

  const parsed = parseJsonObject(rawText);
  const editorial = {
    bestFor: normalizeEditorialText(parsed.best_for || parsed.bestFor, 240, context),
    skipFor: normalizeEditorialText(parsed.skip_for || parsed.skipFor, 240, context),
    worksBest: normalizeEditorialText(parsed.works_best || parsed.worksBest, 240, context),
    pros: normalizeEditorialList(parsed.pros, 2, 3, 120, context),
    cons: normalizeEditorialList(parsed.cons, 1, 2, 120, context),
  };

  if (!editorial.bestFor || !editorial.skipFor || !editorial.worksBest) {
    throw new Error("The model omitted one or more required editorial fields.");
  }

  return editorial;
}

async function generateEditorialViaOpenRouter(input) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required when EDITORIAL_PROVIDER=openrouter. Add it to .env before previewing or publishing.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "HTTP-Referer": OPENROUTER_REFERER,
        "X-Title": OPENROUTER_TITLE,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0,
        max_tokens: 450,
        response_format: { type: "json_object" },
        messages: buildEditorialMessages(input),
      }),
    });

    if (!response.ok) {
      const rawError = await response.text();
      const details = truncate(cleanText(rawError), 220);
      if (response.status === 401) {
        throw new Error(
          "OpenRouter rejected the API key. Generate a fresh OpenRouter API key, update .env, restart the affiliate admin server, and try again.",
        );
      }
      throw new Error(`OpenRouter returned ${response.status}${details ? `: ${details}` : ""}`);
    }

    const payload = await response.json();
    return parseEditorialResponse(extractAssistantContent(payload), input);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("OpenRouter timed out while generating affiliate editorial copy.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateEditorialViaProxy(input) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(EDITORIAL_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...input, model: OPENROUTER_MODEL }),
    });

    if (!response.ok) {
      const details = truncate(cleanText(await response.text()), 220);
      if (response.status === 404) {
        throw new Error(`Cloudflare editorial endpoint was not found at ${EDITORIAL_API_URL}. Deploy Pages Functions first, then try again.`);
      }
      throw new Error(`Cloudflare editorial endpoint returned ${response.status}${details ? `: ${details}` : ""}`);
    }

    const payload = await response.json();
    return parseEditorialResponse(JSON.stringify(payload?.editorial || payload), input);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Cloudflare editorial endpoint timed out while generating affiliate editorial copy.");
    }
    if (String(error?.message || "").includes("fetch failed") || String(error?.message || "").includes("ECONNREFUSED")) {
      throw new Error(`Could not reach the Cloudflare editorial endpoint at ${EDITORIAL_API_URL}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateEditorialCopy(input) {
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    return generateEditorialViaOpenRouter(input);
  }

  return generateEditorialViaProxy(input);
}

function deriveEditorialCardCopy(editorial, shortTitle) {
  const summary = `${editorial.bestFor} ${editorial.pros[0] ? `Top upside: ${editorial.pros[0]}.` : ""}`.trim();
  return truncate(summary, 165) || `A practical ${shortTitle.toLowerCase()} pick that sharpens everyday outfits without overcomplicating the wardrobe.`;
}

function deriveEditorialSummary(editorial, shortTitle) {
  const summary = `${editorial.bestFor} ${editorial.worksBest}`.trim();
  return truncate(summary, 170) || `${shortTitle} with affiliate-ready product details, clean metadata, and a PrimeGent styling angle.`;
}

function buildWhoCopy(categoryId, styles) {
  const joinedStyles = styles.map(labelize).join(", ").toLowerCase();

  const defaults = {
    shirts: {
      bodyType: "Works especially well for men who want a cleaner upper-body line without looking overdressed.",
      occasion: "Office days, relaxed dinners, weekend plans, and easy smart-casual outfits.",
      styleNote: `Pairs best with chinos, dark denim, and simple layers in ${joinedStyles || "versatile"} wardrobes.`,
    },
    pants: {
      bodyType: "Best for men who want a dependable lower half that keeps proportions clean through the leg.",
      occasion: "Daily wear, travel, casual offices, and repeatable weekend uniforms.",
      styleNote: `Use it to anchor knitwear, overshirts, and sneakers inside ${joinedStyles || "easy"} outfit formulas.`,
    },
    shoes: {
      bodyType: "Useful for most builds because the right shoe sharpens the entire silhouette immediately.",
      occasion: "Date nights, weekends, casual office settings, and outfits that need a stronger finish.",
      styleNote: `Keep trousers and denim clean at the hem so the shoe carries the look with ${joinedStyles || "balanced"} energy.`,
    },
    jackets: {
      bodyType: "Ideal for men who need structure on top without reaching for heavy tailoring.",
      occasion: "Travel, layering seasons, casual workdays, and off-duty looks with more presence.",
      styleNote: `Works best over restrained basics so the outer layer drives the ${joinedStyles || "casual"} feel.`,
    },
    accessories: {
      bodyType: "Easy to add across body types because the value is in finish rather than fit.",
      occasion: "Daily wear, gifting, travel, and polishing otherwise simple outfits.",
      styleNote: `Use it as a finishing detail rather than the loudest part of the outfit to keep the ${joinedStyles || "minimal"} effect.`,
    },
    basics: {
      bodyType: "Great for men building a repeatable foundation before chasing trend pieces.",
      occasion: "Office layering, weekends, transitional weather, and low-friction everyday dressing.",
      styleNote: `Neutral colors usually get the most mileage in ${joinedStyles || "clean"} wardrobes.`,
    },
    activewear: {
      bodyType: "Works for most builds when comfort matters but you still want the outfit to read intentional.",
      occasion: "Travel days, gym-adjacent errands, sporty weekends, and relaxed off-duty looks.",
      styleNote: "Keep the rest of the outfit simple so the athletic element stays crisp instead of chaotic.",
    },
  };

  return defaults[categoryId] || defaults.basics;
}

function buildOutfitNotes(categoryId, shortTitle, styles) {
  const primary = labelize(styles[0] || "casual").toLowerCase();
  const secondary = labelize(styles[1] || "weekend").toLowerCase();

  const presets = {
    shirts: [
      {
        title: "Easy Office Layer",
        description: `Wear ${shortTitle} with trim chinos and simple leather shoes when you want the top half to do most of the work.`,
      },
      {
        title: "Weekend Upgrade",
        description: `Use it with dark denim and clean sneakers for a ${primary} look that feels sharper than a standard tee.`,
      },
      {
        title: "Layered Evening Option",
        description: `Add a lightweight jacket or knit over it when you want more depth without losing the easy ${secondary} feel.`,
      },
    ],
    pants: [
      {
        title: "Reliable Daily Uniform",
        description: `Pair ${shortTitle} with an oxford shirt or knit and clean sneakers for a low-friction outfit you can repeat often.`,
      },
      {
        title: "Smart-Casual Pivot",
        description: `Use it under a cleaner shirt-and-jacket combination when you want the pants to keep the silhouette tidy.`,
      },
      {
        title: "Travel Setup",
        description: `Combine it with a tee, light layer, and comfortable footwear for a ${secondary} look that still feels intentional.`,
      },
    ],
    shoes: [
      {
        title: "Foundation Piece",
        description: `Let ${shortTitle} sharpen denim or chinos while the rest of the outfit stays neutral and quiet.`,
      },
      {
        title: "Evening Upgrade",
        description: `Use it to push a simple sweater-and-pants combination into a more ${primary} direction.`,
      },
      {
        title: "Weekend Rotation",
        description: `Pair it with straight denim and a clean overshirt for a dependable ${secondary} formula.`,
      },
    ],
    jackets: [
      {
        title: "Top-Layer Focus",
        description: `Throw ${shortTitle} over a tee or knit so the jacket becomes the most deliberate part of the outfit.`,
      },
      {
        title: "Travel Layer",
        description: `Use it with comfortable pants and clean sneakers when you want practical layering that still looks composed.`,
      },
      {
        title: "Cold-Weather Casual",
        description: `Pair it with darker trousers and understated footwear for a ${primary} outfit with more texture.`,
      },
    ],
    accessories: [
      {
        title: "Quiet Finish",
        description: `Use ${shortTitle} as the final detail on an otherwise simple outfit so it adds polish without noise.`,
      },
      {
        title: "Repeatable Daily Wear",
        description: `It works best when the rest of the wardrobe is restrained and the accessory supports the ${primary} mood.`,
      },
      {
        title: "Travel and Weekend Use",
        description: `Keep it in rotation with neutral basics, denim, and simple outerwear for easy ${secondary} styling.`,
      },
    ],
    basics: [
      {
        title: "Daily Foundation",
        description: `Start with ${shortTitle}, then build around it with chinos, denim, or a light outer layer.`,
      },
      {
        title: "Layering Move",
        description: `Use it beneath jackets or overshirts when you want the outfit to stay clean and ${primary}.`,
      },
      {
        title: "Weekend Formula",
        description: `Pair it with easy trousers and understated shoes for a dependable ${secondary} setup.`,
      },
    ],
    activewear: [
      {
        title: "Off-Duty Uniform",
        description: `Wear ${shortTitle} with minimal extras so the athletic silhouette stays crisp instead of cluttered.`,
      },
      {
        title: "Travel Comfort",
        description: `Use it for flights, long drives, or errands when you need comfort but still want a cleaner ${primary} look.`,
      },
      {
        title: "Sporty Casual Mix",
        description: `Pair it with simple outerwear and neutral footwear to keep the ${secondary} styling grounded.`,
      },
    ],
  };

  return presets[categoryId] || presets.basics;
}

function renderTags(items) {
  return items.map((item) => `<span class="tag">${escapeHtml(labelize(item))}</span>`).join("");
}

function renderHeader() {
  return `
    <header class="site-header">
      <div class="container nav-shell">
        <a class="brand" href="./index.html" aria-label="PrimeGent home">
          <span class="brand-mark">PG</span>
          <span>PrimeGent</span>
        </a>
        <nav class="desktop-nav" aria-label="Primary">
          <a href="./index.html" data-nav-link="home">Home</a>
          <a href="./picks.html" data-nav-link="picks">Outfits</a>
          <a href="./blog.html" data-nav-link="blog">Journal</a>
          <a href="./privacy.html" data-nav-link="privacy">Privacy</a>
        </nav>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle>
          <span></span>
          <span></span>
          <span></span>
          <span class="sr-only">Toggle menu</span>
        </button>
      </div>
      <div class="mobile-menu" id="mobile-menu" data-mobile-menu>
        <div class="mobile-menu__backdrop" data-menu-close></div>
        <div class="mobile-menu__panel" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <div class="mobile-menu__head">
            <span class="brand brand--small">
              <span class="brand-mark">PG</span>
              <span>PrimeGent</span>
            </span>
            <button class="menu-close" type="button" aria-label="Close menu" data-menu-close>Close</button>
          </div>
          <nav class="mobile-nav" aria-label="Mobile primary">
            <a href="./index.html" data-nav-link="home">Home</a>
            <a href="./picks.html" data-nav-link="picks">Outfits</a>
            <a href="./blog.html" data-nav-link="blog">Journal</a>
            <a href="./privacy.html" data-nav-link="privacy">Privacy</a>
          </nav>
        </div>
      </div>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <a class="brand brand--small" href="./index.html">
            <span class="brand-mark">PG</span>
            <span>PrimeGent</span>
          </a>
          <p class="footer-copy">Curated men's outfit ideas, better basics, and practical picks that earn their place.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <a href="./picks.html">Curated picks</a>
          <a href="./blog.html">Style guides</a>
        </div>
        <div>
          <h2>Trust</h2>
          <a href="./privacy.html">Privacy policy</a>
          <p class="footer-note">PrimeGent may earn commissions from qualifying purchases through affiliate links.</p>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>&copy; ${new Date().getFullYear()} PrimeGent. Dress better. Every day.</p>
      </div>
    </footer>
  `;
}

function renderOgImageTags(data) {
  const tags = [];

  data.imageUrls.forEach((imageUrl, index) => {
    tags.push(`    <meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
    if (index === 0) {
      tags.push(`    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />`);
      tags.push(`    <meta property="og:image:alt" content="${escapeHtml(data.altText)}" />`);
      if (data.imageWidth && data.imageHeight) {
        tags.push(`    <meta property="og:image:width" content="${escapeHtml(data.imageWidth)}" />`);
        tags.push(`    <meta property="og:image:height" content="${escapeHtml(data.imageHeight)}" />`);
      }
    }
  });

  return tags.join("\n");
}

function renderGalleryMarkup(data) {
  const thumbButtons = data.imageUrls
    .map(
      (imageUrl, index) => `              <button
                class="pick-gallery__thumb${index === 0 ? " is-active" : ""}"
                type="button"
                data-gallery-thumb
                data-image="${escapeHtml(imageUrl)}"
                aria-label="Show product image ${index + 1}"
                aria-pressed="${index === 0 ? "true" : "false"}"
              >
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${data.shortTitle} image ${index + 1}`)}" loading="lazy" decoding="async" />
              </button>`,
    )
    .join("\n");

  const media = `
              <div class="pick-gallery">
                <img
                  class="product-image product-image--affiliate"
                  src="${escapeHtml(data.imageUrl)}"
                  alt="${escapeHtml(data.altText)}"
                  loading="eager"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  data-gallery-main
                />${data.imageUrls.length > 1 ? `
                <div class="pick-gallery__thumbs" aria-label="More product images">
${thumbButtons}
                </div>` : ""}
              </div>`;

  const script =
    data.imageUrls.length > 1
      ? `
        <script>
          document.addEventListener("DOMContentLoaded", function () {
            var mainImage = document.querySelector("[data-gallery-main]");
            var thumbs = Array.prototype.slice.call(document.querySelectorAll("[data-gallery-thumb]"));
            if (!mainImage || !thumbs.length) {
              return;
            }

            thumbs.forEach(function (thumb) {
              thumb.addEventListener("click", function () {
                var imageUrl = thumb.getAttribute("data-image");
                if (!imageUrl) {
                  return;
                }

                mainImage.src = imageUrl;
                thumbs.forEach(function (item) {
                  item.classList.remove("is-active");
                  item.setAttribute("aria-pressed", "false");
                });
                thumb.classList.add("is-active");
                thumb.setAttribute("aria-pressed", "true");
              });
            });
          });
        </script>`
      : "";

  return { media, script };
}

function renderPickPage(data) {
  const gallery = renderGalleryMarkup(data);
  const pageTitle = `${data.shortTitle} | PrimeGent`;
  const productJson = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: data.fullTitle,
    description: data.metaDescription,
    brand: { "@type": "Brand", name: data.brand },
    category: labelize(data.categoryId),
    image: data.imageUrls,
    sku: data.asin,
    url: data.productUrl,
    offers: {
      "@type": "Offer",
      url: data.affiliateUrl,
      itemCondition: "https://schema.org/NewCondition",
      availability: `https://schema.org/${data.availability}`,
    },
  };

  if (data.price) {
    productJson.offers.priceCurrency = "USD";
    productJson.offers.price = data.price;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(data.metaDescription)}">
    <meta name="robots" content="index,follow">
    <meta name="author" content="PrimeGent Editorial">
    <meta name="theme-color" content="#11100d">
    <meta name="pinterest-rich-pin" content="true">
    <meta name="p:domain_verify" content="f9546a6294ecb3866f4ae528723c3661">
    <meta name="google-site-verification" content="REPLACE_ME">
    <link rel="canonical" href="${escapeHtml(data.productUrl)}">
    <link rel="sitemap" type="application/xml" title="Sitemap" href="${SITE_URL}/sitemap.xml">
    <link rel="icon" type="image/svg+xml" href="./static/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="./static/style.css">
    <meta property="og:site_name" content="PrimeGent">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(data.metaDescription)}">
${renderOgImageTags(data)}
    <meta property="og:type" content="product">
    <meta property="og:url" content="${escapeHtml(data.productUrl)}">
    ${data.price ? `<meta property="product:price:amount" content="${escapeHtml(data.price)}">
    <meta property="product:price:currency" content="USD">` : ""}
    <meta property="product:brand" content="${escapeHtml(data.brand)}">
    <meta property="product:condition" content="new">
    <meta property="product:availability" content="${normalizeProductAvailabilityContent(data.availability)}">
    <meta property="product:retailer_item_id" content="${escapeHtml(data.asin)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}">
    <meta name="twitter:description" content="${escapeHtml(data.metaDescription)}">
    <meta name="twitter:image" content="${escapeHtml(data.imageUrl)}">
    <meta name="twitter:image:alt" content="${escapeHtml(data.altText)}">
    <script type="application/ld+json">${safeJson(productJson)}</script>
  </head>
  <body data-page="picks">
    ${renderHeader()}
    <main>
      <section class="page-hero page-hero--product">
        <div class="container product-hero">
          <div>
            <nav class="breadcrumb" aria-label="Breadcrumb"><a href="./index.html">Home</a><span>/</span><a href="./picks.html">Picks</a><span>/</span><span>${escapeHtml(data.shortTitle)}</span></nav>
            <p class="eyebrow">${escapeHtml(data.categoryLabel)} pick</p>
            <h1>${escapeHtml(data.shortTitle)}</h1>
            <p>${escapeHtml(data.pageSummary)}</p>
            <div class="product-hero__meta"><span class="badge">Check Latest Price on Amazon</span><span class="badge badge--muted">${escapeHtml(labelize(data.brandTier))}</span><span class="badge badge--muted">ASIN ${escapeHtml(data.asin)}</span></div>
            <div class="tag-row">${renderTags(data.styles)}</div>
            <div class="hero-actions"><a class="btn btn-primary" href="${escapeHtml(data.affiliateUrl)}" target="_blank" rel="noopener noreferrer sponsored nofollow">Check Latest Price on Amazon -></a><button class="btn btn-ghost" type="button" data-share-url>Share</button></div>
            <p class="microcopy">Affiliate note: this page links to Amazon via PrimeGent's affiliate URL.</p>
          </div>
          <div class="card product-aside product-aside--gallery">${gallery.media}</div>
        </div>
      </section>
      <section class="section section--tight">
        <div class="container article-grid">
          <article class="article-content">
            <section class="card card--prose"><h2>Who It's Best For</h2><p>${escapeHtml(data.editorial.bestFor)}</p><h2>Who Should Skip It</h2><p>${escapeHtml(data.editorial.skipFor)}</p><h2>Where It Works Best</h2><p>${escapeHtml(data.editorial.worksBest)}</p></section>
            <section class="card card--prose"><h2>Pros</h2><ul class="bullet-list">${data.editorial.pros.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h2>Cons</h2><ul class="bullet-list">${data.editorial.cons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
            <section class="card card--prose"><h2>Specs at a Glance</h2><div class="spec-grid"><div><span>Brand</span><strong>${escapeHtml(data.brand)}</strong></div><div><span>Category</span><strong>${escapeHtml(data.categoryLabel)}</strong></div><div><span>Material</span><strong>${escapeHtml(data.material)}</strong></div><div><span>Fit</span><strong>${escapeHtml(data.fit)}</strong></div><div><span>Care</span><strong>${escapeHtml(data.care)}</strong></div><div><span>Retailer</span><strong>Check Latest Price on Amazon</strong></div></div></section>
          </article>
          <aside class="sidebar"><div class="card sidebar-card"><h2>Quick take</h2><p>${escapeHtml(data.cardCopy)}</p></div></aside>
        </div>
      </section>
    </main>
    ${renderFooter()}
    <button class="back-to-top" type="button" aria-label="Back to top" data-back-to-top>Top</button>
    <script src="./static/app.js" defer></script>${gallery.script}
  </body>
</html>
`;
}

function renderProductCard(data) {
  return `    <article class="card pick-card pick-card--affiliate" data-pick-card data-asin="${escapeHtml(data.asin)}" data-category="${escapeHtml(data.categoryId)}" data-price="${escapeHtml(data.priceBucket)}" data-brand="${escapeHtml(data.brandTier)}" data-style="${escapeHtml(data.styles.join("|"))}" data-name="${escapeHtml(data.shortTitle.toLowerCase())}">
      <a class="pick-card__media" href="./${escapeHtml(data.pageFile)}" aria-label="View ${escapeHtml(data.shortTitle)} details">
        <img class="pick-card__image" src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.altText)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='./static/og-cover.svg'">
      </a>
      <div class="pick-card__body">
        <div class="pick-card__meta">
          <span class="badge">${escapeHtml(data.categoryLabel)}</span>
          <span class="price-chip">Check Latest Price on Amazon</span>
        </div>
        <h3>${escapeHtml(data.shortTitle)}</h3>
        <p>${escapeHtml(data.cardCopy)}</p>
        <div class="tag-row">${renderTags(data.styles)}</div>
        <a class="text-link" href="./${escapeHtml(data.pageFile)}">View Pick -></a>
      </div>
    </article>`;
}

function replaceOrInsertCard(picksHtml, cardHtml, pageFile, affiliateUrl, asin) {
  const withoutExistingCard = picksHtml.replace(/<article class="card pick-card[\s\S]*?<\/article>\s*/gi, (block) => {
    return block.includes(`data-asin="${asin}"`) || block.includes(`./${pageFile}`) || block.includes(affiliateUrl) ? "" : block;
  });

  const gridMarker = '<div class="card-grid card-grid--picks" data-picks-grid>';
  const gridIndex = withoutExistingCard.indexOf(gridMarker);

  if (gridIndex < 0) {
    throw new Error("Could not find the live picks grid inside picks.html");
  }

  const insertIndex = gridIndex + gridMarker.length;
  return `${withoutExistingCard.slice(0, insertIndex)}\n${cardHtml}\n${withoutExistingCard.slice(insertIndex)}`;
}

async function updateSitemap(pageFile) {
  const urlEntry = `<url><loc>${SITE_URL}/${pageFile}</loc></url>`;
  const sitemap = await fs.readFile(SITEMAP_PATH, "utf8");

  if (sitemap.includes(`${SITE_URL}/${pageFile}`)) {
    return;
  }

  const updated = sitemap.replace("</urlset>", `${urlEntry}</urlset>`);
  await fs.writeFile(SITEMAP_PATH, updated, "utf8");
}

async function findExistingPickFile({ asin, affiliateUrl, pageFile }) {
  const entries = await fs.readdir(ROOT_DIR);
  const pickFiles = entries.filter((entry) => /^pick-.*\.html$/i.test(entry));

  for (const file of pickFiles) {
    const content = await fs.readFile(path.join(ROOT_DIR, file), "utf8");
    if (content.includes(asin) || content.includes(affiliateUrl) || file === pageFile) {
      return file;
    }
  }

  return pageFile;
}

async function resolveAffiliateUrl(affiliateUrl) {
  const response = await fetch(affiliateUrl, {
    method: "GET",
    redirect: "manual",
    headers: AMAZON_HEADERS,
  });

  const location = response.headers.get("location") || response.url || affiliateUrl;
  return new URL(location, affiliateUrl).toString();
}

async function fetchAmazonHtml(canonicalUrl) {
  const response = await fetch(canonicalUrl, { headers: AMAZON_HEADERS });

  if (!response.ok) {
    throw new Error(`Amazon returned ${response.status} for ${canonicalUrl}`);
  }

  return response.text();
}

async function createAnalysis(input, amazonData) {
  const imageUrls = normalizeImageUrls(input.imageUrls?.length ? input.imageUrls : input.imageUrl);
  if (!imageUrls.length) {
    throw new Error("At least one image URL is required.");
  }

  const manualPrice = normalizeMoneyValue(input.price);
  const resolvedPrice = manualPrice || amazonData.price;
  const priceSource = manualPrice ? "manual" : amazonData.price ? "amazon" : "missing";
  const shortTitle = input.shortTitle?.trim() || titleFromAmazonTitle(amazonData.fullTitle, amazonData.brand);
  const categoryId = input.sectionId || inferCategoryId(`${shortTitle} ${amazonData.slugHint} ${amazonData.bullets.join(" ")}`);
  const category = CATEGORY_DEFS.find((item) => item.id === categoryId) || CATEGORY_DEFS[0];
  const styles = inferStyles(categoryId, shortTitle, amazonData.bullets, input.styleTags);
  const pageSlug = slugify(shortTitle) || slugify(amazonData.slugHint) || amazonData.asin.toLowerCase();
  const pageFile = `pick-${pageSlug}.html`;
  const primaryImageUrl = imageUrls[0];
  const imageSize = extractImageSize(primaryImageUrl);
  const brandTier = inferBrandTier(amazonData.brand, input.brandTier);
  const productUrl = `${SITE_URL}/${pageFile}`;
  const material = deriveMaterial(shortTitle, amazonData.bullets, input.material);
  const fit = deriveFit(shortTitle, amazonData.bullets, input.fit);
  const care = deriveCare(shortTitle, amazonData.bullets, input.care);
  const editorial = await generateEditorialCopy({
    shortTitle,
    fullTitle: amazonData.fullTitle,
    brand: amazonData.brand,
    categoryLabel: category.label,
    styles,
    bullets: amazonData.bullets,
    material,
    fit,
    care,
  });
  const cardCopy = input.cardCopy?.trim() || deriveEditorialCardCopy(editorial, shortTitle);
  const pageSummary = input.pageSummary?.trim() || deriveEditorialSummary(editorial, shortTitle);

  return {
    affiliateUrl: input.affiliateUrl,
    asin: amazonData.asin,
    fullTitle: amazonData.fullTitle,
    brand: amazonData.brand,
    brandTier,
    imageUrl: primaryImageUrl,
    imageUrls,
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
    categoryId,
    categoryLabel: category.label,
    categoryTone: category.tone,
    shortTitle,
    cardCopy,
    pageSummary,
    editorial,
    bullets: amazonData.bullets,
    price: resolvedPrice,
    priceBucket: derivePriceBucket(resolvedPrice),
    priceSource,
    availability: amazonData.availability,
    pageFile,
    productUrl,
    metaDescription: deriveMetaDescription(shortTitle, pageSummary),
    ogTitle: `${shortTitle} | PrimeGent`,
    altText: input.altText?.trim() || `${shortTitle} product photo`,
    styles,
    visual: deriveVisual(shortTitle, categoryId),
    material,
    fit,
    care,
    who: buildWhoCopy(categoryId, styles),
    outfits: buildOutfitNotes(categoryId, shortTitle, styles),
  };
}

async function writeProductFiles(data) {
  await fs.writeFile(path.join(ROOT_DIR, data.pageFile), renderPickPage(data), "utf8");

  const picksHtml = await fs.readFile(PICKS_PATH, "utf8");
  const updatedPicksHtml = replaceOrInsertCard(
    picksHtml,
    renderProductCard(data),
    data.pageFile,
    data.affiliateUrl,
    data.asin,
  );

  await fs.writeFile(PICKS_PATH, updatedPicksHtml, "utf8");
  await updateSitemap(data.pageFile);
}

async function analyzeAffiliateInput(input) {
  if (!input?.affiliateUrl || !normalizeImageUrls(input.imageUrls?.length ? input.imageUrls : input.imageUrl).length) {
    throw new Error("Affiliate URL and at least one image URL are required.");
  }

  const resolvedUrl = await resolveAffiliateUrl(input.affiliateUrl);
  const pathInfo = extractAmazonPathInfo(resolvedUrl);

  if (!pathInfo.asin) {
    throw new Error("Could not extract an ASIN from the affiliate link.");
  }

  const html = await fetchAmazonHtml(pathInfo.canonicalUrl);
  const fullTitle = extractMatch(html, /<span id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  const rawBrand = extractMatch(html, /<a id="bylineInfo"[^>]*>([\s\S]*?)<\/a>/i);
  const bullets = extractBullets(html);

  if (!fullTitle) {
    throw new Error("Could not read the Amazon product title.");
  }

  const analysis = await createAnalysis(input, {
    asin: pathInfo.asin,
    slugHint: pathInfo.slugHint,
    fullTitle,
    brand: normalizeBrand(rawBrand, fullTitle),
    bullets,
    price: extractMoney(html),
    availability: extractAvailability(html),
  });

  const pageFile = await findExistingPickFile(analysis);
  return {
    ...analysis,
    pageFile,
    productUrl: `${SITE_URL}/${pageFile}`,
  };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";

    res.writeHead(200, { "content-type": contentType });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === "GET" && requestUrl.pathname === "/api/sections") {
        json(res, 200, { sections: getCategories() });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/analyze") {
        json(res, 200, { analysis: await analyzeAffiliateInput(await readRequestBody(req)) });
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/api/publish") {
        const analysis = await analyzeAffiliateInput(await readRequestBody(req));
        await writeProductFiles(analysis);
        json(res, 200, {
          ok: true,
          pageFile: analysis.pageFile,
          pagePath: path.join(ROOT_DIR, analysis.pageFile),
          picksPath: PICKS_PATH,
          sitemapPath: SITEMAP_PATH,
          analysis,
        });
        return;
      }

      await serveStatic(req, res);
    } catch (error) {
      json(res, 500, { error: error.message || "Unexpected error" });
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`PrimeGent affiliate admin running at http://localhost:${PORT}`);
  });
}

module.exports = {
  PORT,
  SITE_URL,
  analyzeAffiliateInput,
  createServer,
  getCategories,
  renderPickPage,
  writeProductFiles,
};
