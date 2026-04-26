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

function randomFraction() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }

  return Math.random();
}

function randomIndex(length) {
  if (!length) {
    return 0;
  }

  return Math.floor(randomFraction() * length);
}

function pickRandom(values) {
  return values[randomIndex(values.length)] || "";
}

function shuffleList(values) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let timeoutReject;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutReject = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs + 250);
  });

  try {
    return await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeout);
    clearTimeout(timeoutReject);
  }
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

const CATEGORY_PATTERNS = [
  { category: "shirts", patterns: [/\bshirt\b/, /\bshirts\b/, /\blinen\b/, /\boxford\b(?!\s+shoe)/, /\bpolo\b/, /\btee\b/, /\bt[-\s]?shirt\b/] },
  { category: "pants", patterns: [/\bpant\b/, /\bpants\b/, /\bchino\b/, /\bchinos\b/, /\bjean\b/, /\bjeans\b/, /\btrouser\b/, /\btrousers\b/, /\bcargo\b/] },
  { category: "shoes", patterns: [/\bshoe\b/, /\bshoes\b/, /\bsneaker\b/, /\bsneakers\b/, /\bboot\b/, /\bboots\b/, /\bloafer\b/, /\bloafers\b/, /\boxford shoe\b/] },
  { category: "jackets", patterns: [/\bjacket\b/, /\bjackets\b/, /\bcoat\b/, /\bouterwear\b/, /\bovershirt\b/, /\bwindbreaker\b/, /\bbomber\b/] },
  { category: "accessories", patterns: [/\bwatch\b/, /\bwatches\b/, /\bbelt\b/, /\bbeanie\b/, /\bsunglasses\b/, /\baccessor(?:y|ies)\b/, /\bbag\b/] },
  { category: "basics", patterns: [/\bsweater\b/, /\bmerino\b/, /\bhoodie\b/, /\bhoodies\b/, /\bknit\b/, /\bknitwear\b/, /\bcardigan\b/, /\bcrewneck\b/] },
  { category: "activewear", patterns: [/\bactivewear\b/, /\bathletic\b/, /\bsporty\b/, /\brunning\b/, /\bgym\b/, /\btrack\b/] },
];

const STYLE_SIGNAL_PATTERNS = [
  { style: "smart-casual", patterns: [/smart casual/, /elevated casual/, /polished casual/] },
  { style: "office", patterns: [/office/, /work/, /business casual/, /commute/] },
  { style: "weekend", patterns: [/weekend/, /off duty/, /everyday/, /daily wear/] },
  { style: "date-night", patterns: [/date night/, /\bdate\b/, /dinner/, /wedding/, /night out/] },
  { style: "travel", patterns: [/travel/, /airport/, /vacation/, /getaway/] },
  { style: "minimal", patterns: [/minimal/, /minimalist/, /clean/, /quiet/, /simple/, /understated/] },
  { style: "rugged", patterns: [/rugged/, /workwear/, /outdoor/, /field/, /utilitarian/, /camp/] },
  { style: "casual", patterns: [/\bcasual\b/, /easy/, /relaxed/] },
];

const MATERIAL_SIGNAL_PATTERNS = [
  { label: "linen", patterns: [/linen/, /breathable/] },
  { label: "merino", patterns: [/merino/, /wool/] },
  { label: "denim", patterns: [/denim/, /jean/, /jeans/] },
  { label: "suede", patterns: [/suede/] },
  { label: "leather", patterns: [/leather/] },
  { label: "oxford", patterns: [/\boxford\b/] },
  { label: "polo", patterns: [/\bpolo\b/] },
  { label: "cargo", patterns: [/\bcargo\b/] },
  { label: "sweater", patterns: [/\bsweater\b/, /\bknit\b/, /\bcrewneck\b/] },
];

const SEASON_SIGNAL_PATTERNS = [
  { season: "winter", patterns: [/\bwinter\b/, /cold[-\s]?weather/, /\bsnow(?:y)?\b/, /\bfreez(?:e|ing)\b/] },
  { season: "summer", patterns: [/\bsummer\b/, /warm[-\s]?weather/, /hot[-\s]?weather/, /\bbeach\b/, /\bheat\b/, /\bhumid\b/] },
  { season: "fall", patterns: [/\bfall\b/, /\bautumn\b/, /cool[-\s]?weather/] },
  { season: "spring", patterns: [/\bspring\b/, /transitional/] },
];

const SEASONAL_CATEGORY_ORDER = {
  winter: ["jackets", "basics", "shoes", "pants", "shirts", "accessories"],
  summer: ["shirts", "pants", "shoes", "accessories", "jackets", "basics"],
  fall: ["jackets", "shirts", "pants", "shoes", "basics", "accessories"],
  spring: ["shirts", "jackets", "pants", "shoes", "accessories", "basics"],
};

const PRODUCT_SEASON_SIGNALS = {
  winter: {
    positive: [
      /\bwinter\b/,
      /cold[-\s]?weather/,
      /\bfleece\b/,
      /\bflannel\b/,
      /\bwool\b/,
      /\bmerino\b/,
      /\bsweater\b/,
      /\bhood(?:ie|ed)\b/,
      /\bcardigan\b/,
      /mock[-\s]?neck/,
      /\bturtleneck\b/,
      /shawl[-\s]?collar/,
      /\bheavyweight\b/,
      /\bthick\b/,
      /\bwaterproof\b/,
      /\bboots?\b/,
      /\bcoat\b/,
      /\bcorduroy\b/,
      /\bduck\b/,
      /\bquilted\b/,
      /\bparka\b/,
      /autumn and winter/,
      /long[-\s]?sleeve/,
    ],
    negative: [
      /\blinen\b/,
      /\blightweight\b/,
      /\bbreathable\b/,
      /\bquick[-\s]?dry\b/,
      /\bcamp shirt\b/,
      /\bwindbreaker\b/,
      /mild weather/,
      /light layer/,
      /packs easily/,
    ],
    criticalNegative: [
      /short[-\s]?sleeve/,
      /\bsleeveless\b/,
      /\bbeach\b/,
      /\bsummer\b/,
      /warm[-\s]?weather/,
      /hot[-\s]?weather/,
      /\bconvertible\b/,
      /zip[-\s]?off/,
    ],
  },
  summer: {
    positive: [
      /\bsummer\b/,
      /warm[-\s]?weather/,
      /hot[-\s]?weather/,
      /\bbeach\b/,
      /\blinen\b/,
      /short[-\s]?sleeve/,
      /\bsleeveless\b/,
      /\bbreathable\b/,
      /\blightweight\b/,
      /\bquick[-\s]?dry\b/,
      /\bairy\b/,
      /\bcamp shirt\b/,
      /\bpolo\b/,
    ],
    negative: [/\bboots?\b/, /\bwaterproof\b/, /\bheavyweight\b/, /\bthick\b/],
    criticalNegative: [
      /\bwinter\b/,
      /cold[-\s]?weather/,
      /\bfleece\b/,
      /\bflannel\b/,
      /\bwool\b/,
      /\bmerino\b/,
      /\bsweater\b/,
      /\bhood(?:ie|ed)\b/,
      /mock[-\s]?neck/,
      /\bturtleneck\b/,
      /\bquilted\b/,
      /\bparka\b/,
    ],
  },
  fall: {
    positive: [
      /\bfall\b/,
      /\bautumn\b/,
      /\bflannel\b/,
      /\bovershirt\b/,
      /\bcorduroy\b/,
      /\btrucker\b/,
      /\bsuede\b/,
      /\bboots?\b/,
      /\bjacket\b/,
      /long[-\s]?sleeve/,
      /\bknit\b/,
    ],
    negative: [/\blightweight\b/, /\bquick[-\s]?dry\b/],
    criticalNegative: [/\bsummer\b/, /\bbeach\b/, /short[-\s]?sleeve/, /\bconvertible\b/, /zip[-\s]?off/],
  },
  spring: {
    positive: [/\bspring\b/, /\bovershirt\b/, /\boxford\b/, /\bchinos?\b/, /\bsneakers?\b/, /\blightweight jacket\b/],
    negative: [/\bwaterproof\b/, /\bboots?\b/],
    criticalNegative: [/\bwinter\b/, /\bparka\b/, /\bquilted\b/, /\bheavyweight fleece\b/, /snow[-\s]?boot/],
  },
};

const DEFAULT_CATEGORY_ORDER = ["shirts", "pants", "shoes", "jackets", "basics", "accessories"];

const GENERIC_SIGNAL_TOKENS = new Set([
  "actually",
  "article",
  "articles",
  "build",
  "clean",
  "current",
  "draft",
  "easy",
  "feel",
  "good",
  "guide",
  "guides",
  "how",
  "look",
  "looks",
  "make",
  "men",
  "mens",
  "modern",
  "not",
  "outfit",
  "outfits",
  "post",
  "posts",
  "real",
  "really",
  "repeatable",
  "style",
  "that",
  "the",
  "these",
  "this",
  "version",
  "wear",
  "what",
  "with",
  "without",
  "work",
  "works",
]);

function scoreProductTokens(product, tokens, weight = 1) {
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
      score += 8 * weight;
    }
    if (haystack.category.includes(token)) {
      score += 7 * weight;
    }
    if (haystack.styles.includes(token)) {
      score += 5 * weight;
    }
    if (haystack.tags.includes(token)) {
      score += 4 * weight;
    }
    if (haystack.description.includes(token)) {
      score += 2 * weight;
    }
    if (haystack.brand.includes(token)) {
      score += 1 * weight;
    }
  });

  (CATEGORY_ALIASES[product.category] || []).forEach((alias) => {
    if (tokens.includes(alias)) {
      score += 5 * weight;
    }
  });

  product.styles.forEach((style) => {
    if (tokens.includes(style)) {
      score += 4 * weight;
    }
  });

  product.tags.forEach((tag) => {
    tokenize(tag).forEach((token) => {
      if (tokens.includes(token)) {
        score += 3 * weight;
      }
    });
  });

  return score;
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function extractMatchedCategories(text) {
  return CATEGORY_PATTERNS.filter((entry) => matchesAnyPattern(text, entry.patterns)).map((entry) => entry.category);
}

function extractStyleSignals(text) {
  return STYLE_SIGNAL_PATTERNS.filter((entry) => matchesAnyPattern(text, entry.patterns)).map((entry) => entry.style);
}

function extractMaterialSignals(text) {
  return MATERIAL_SIGNAL_PATTERNS.filter((entry) => matchesAnyPattern(text, entry.patterns)).map((entry) => entry.label);
}

function extractSeasonSignals(text) {
  return SEASON_SIGNAL_PATTERNS.filter((entry) => matchesAnyPattern(text, entry.patterns)).map((entry) => entry.season);
}

function buildSeasonCategoryOrder(seasons) {
  const ordered = [];

  seasons.forEach((season) => {
    (SEASONAL_CATEGORY_ORDER[season] || []).forEach((category) => ordered.push(category));
  });

  return uniqueList([...ordered, ...DEFAULT_CATEGORY_ORDER], DEFAULT_CATEGORY_ORDER.length);
}

function scoreSeasonFit(productText, seasons) {
  let score = 0;

  seasons.forEach((season) => {
    const config = PRODUCT_SEASON_SIGNALS[season];
    if (!config) {
      return;
    }

    config.positive.forEach((pattern) => {
      if (pattern.test(productText)) {
        score += 11;
      }
    });

    config.negative.forEach((pattern) => {
      if (pattern.test(productText)) {
        score -= 14;
      }
    });

    config.criticalNegative.forEach((pattern) => {
      if (pattern.test(productText)) {
        score -= 70;
      }
    });
  });

  return score;
}

function buildAngleContext(description) {
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
    { pattern: /travel|airport/, label: "Travel" },
    { pattern: /minimalist|minimal/, label: "Minimal" },
    { pattern: /rugged|workwear/, label: "Rugged" },
    { pattern: /\bcasual\b/, label: "Casual" },
  ];

  const styleMatch = styleLabels.find((item) => item.pattern.test(text));
  if (styleMatch) {
    parts.push(styleMatch.label);
  }

  return titleCase(parts.join(" ").trim() || "Men's Style");
}

function extractThemeAngles(description) {
  const text = cleanText(description).toLowerCase();
  const angles = [];

  const candidates = [
    { key: "outfits", label: "Outfits", patterns: [/outfit/, /what to wear/, /look/, /looks/] },
    { key: "shirts", label: "Shirts", patterns: [/\bshirt\b/, /\bshirts\b/, /\blinen\b/, /\boxford\b(?!\s+shoe)/, /\bpolo\b/, /\bpolo shirts?\b/, /\btee\b/, /\btees\b/] },
    { key: "shoes", label: "Shoes", patterns: [/\bshoe\b/, /\bshoes\b/, /\bsneaker\b/, /\bsneakers\b/, /\bloafer\b/, /\bloafers\b/, /\bboot\b/, /\bboots\b/] },
    { key: "pants", label: "Pants", patterns: [/\bpant\b/, /\bpants\b/, /\bchino\b/, /\bchinos\b/, /\bjean\b/, /\bjeans\b/, /\btrouser\b/, /\btrousers\b/, /\bcargo\b/] },
    { key: "jackets", label: "Jackets", patterns: [/\bjacket\b/, /\bjackets\b/, /\bovershirt\b/, /\bouterwear\b/, /\bcoat\b/, /\bcoats\b/] },
    { key: "basics", label: "Layers", patterns: [/\bsweater\b/, /\bhoodie\b/, /\bhoodies\b/, /\bknit\b/, /\bknitwear\b/, /\bcardigan\b/, /\blayer\b/, /\blayers\b/] },
    { key: "accessories", label: "Accessories", patterns: [/\bwatch\b/, /\bwatches\b/, /\bbelt\b/, /\bbelts\b/, /\bsunglasses\b/, /\baccessor/] },
    { key: "travel", label: "Travel Style", patterns: [/travel/, /airport/, /vacation/] },
    { key: "office", label: "Office Style", patterns: [/office/, /business casual/, /work/] },
    { key: "date-night", label: "Date Night Style", patterns: [/date night/, /\bdate\b/, /dinner/, /wedding/] },
    { key: "wardrobe", label: "Wardrobe Formulas", patterns: [/repeatable/, /formula/, /capsule/, /wardrobe/] },
  ];

  candidates.forEach((candidate) => {
    if (matchesAnyPattern(text, candidate.patterns)) {
      angles.push(candidate);
    }
  });

  const angleMap = new Map(angles.map((angle) => [angle.key, angle]));
  const addAngle = (key, label) => {
    if (!angleMap.has(key)) {
      angleMap.set(key, { key, label });
    }
  };

  if (!angleMap.size) {
    addAngle("outfits", "Outfits");
  }

  const seasons = extractSeasonSignals(text);
  if (angleMap.size <= 2) {
    if (seasons.includes("winter")) {
      addAngle("basics", "Layers");
      addAngle("jackets", "Jackets");
      addAngle("shoes", "Shoes");
    } else if (seasons.includes("summer")) {
      addAngle("shirts", "Shirts");
      addAngle("shoes", "Shoes");
      addAngle("travel", "Travel Style");
    } else {
      addAngle("shirts", "Shirts");
      addAngle("pants", "Pants");
      addAngle("shoes", "Shoes");
    }

    addAngle("wardrobe", "Wardrobe Formulas");
  }

  return [...angleMap.values()];
}

const TITLE_SUBJECT_SUFFIXES = {
  outfits: ["Outfits", "Looks", "Style", "Outfit Formulas", "Uniforms"],
  shirts: ["Shirts", "Button-Downs", "Shirt Rotation", "Layering Shirts"],
  shoes: ["Shoes", "Footwear", "Boot and Sneaker Rotation", "Shoe Rotation"],
  pants: ["Pants", "Trouser Rotation", "Everyday Bottoms", "Off-Duty Trousers"],
  jackets: ["Jackets", "Outer Layers", "Jacket Rotation", "Layering Pieces"],
  basics: ["Layers", "Knitwear", "Sweaters and Hoodies", "Core Layers"],
  accessories: ["Accessories", "Finishing Pieces", "Small Details", "Extras That Matter"],
  wardrobe: ["Wardrobe", "Closet Formula", "Style Rules", "Core Rotation"],
  office: ["Office Style", "Work Outfits", "Business-Casual Fits", "Commuter Wardrobe"],
  travel: ["Travel Style", "Airport Outfits", "Travel Uniform", "Weekend Packing List"],
  "date-night": ["Date-Night Style", "Dinner Outfits", "Going-Out Looks", "Night-Out Rotation"],
};

const TITLE_DIRECT_ENDINGS = {
  common: [
    "That Feel More Intentional",
    "That Actually Work in Real Life",
    "That Make Casual Style Look Sharper",
    "That Do More Than One Good Outfit",
    "That Feel Easier to Reach For",
    "That Stop the Outfit From Looking Flat",
  ],
  winter: [
    "That Stay Warm Without Looking Bulky",
    "That Keep Cold-Weather Style Clean",
    "That Work When the Temperature Drops",
    "That Make Layering Feel More Controlled",
  ],
  summer: [
    "That Stay Light Without Looking Thin",
    "That Handle Heat Without Looking Sloppy",
    "That Keep Warm-Weather Style Crisp",
    "That Work When the Day Gets Hot",
  ],
  fall: [
    "That Make Transitional Dressing Easier",
    "That Add Texture Without Extra Noise",
    "That Make Cool-Weather Style Feel Richer",
  ],
  spring: [
    "That Make Transitional Outfits Feel Lighter",
    "That Clean Up Spring Layers Fast",
    "That Work When the Weather Keeps Shifting",
  ],
};

const ANGLE_DIRECT_ENDINGS = {
  outfits: ["That Are Worth Repeating All Season", "That Look Styled Without Looking Busy"],
  shirts: ["That Look Better Than the Standard Basics", "That Pull More Weight Than You Expect"],
  shoes: ["That Finish the Outfit Instead of Dragging It Down", "That Make the Rest of the Look Easier"],
  pants: ["That Keep the Whole Outfit Steadier", "That Make the Rest of the Wardrobe Simpler"],
  jackets: ["That Give the Outfit Some Shape", "That Do the Heavy Lifting on Flat Days"],
  basics: ["That Make Simple Layers Look Better", "That Keep the Foundation Strong"],
  accessories: ["That Quietly Finish the Whole Look", "That Earn Their Place Fast"],
  wardrobe: ["That Make Getting Dressed Less Random", "That Keep the Closet Working Harder"],
  office: ["That Look Intentional, Not Corporate", "That Clean Up Workwear Without Stiffness"],
  travel: ["That Stay Comfortable Without Losing Shape", "That Make Packing More Predictable"],
  "date-night": ["That Feel Relaxed but Pulled Together", "That Set the Tone Without Looking Overdone"],
};

const TITLE_GUIDE_ENDINGS = {
  common: [
    "for Easier Everyday Dressing",
    "Without Defaulting to the Same Old Outfit",
    "for a Cleaner Wardrobe",
    "When You Want Repeatable Style",
    "for Real Days, Not Mood Boards",
  ],
  winter: ["for Cold Mornings and Long Days", "When Every Layer Has to Earn Its Place"],
  summer: ["for Hot Days and Late Nights", "When Breathability Actually Matters"],
  fall: ["for the First Weeks of Real Layers", "When Texture Starts Doing the Work"],
  spring: ["for Unpredictable Weather", "When the Temperature Keeps Moving"],
};

const ANGLE_GUIDE_ENDINGS = {
  outfits: ["Without Making Every Look Feel the Same", "When You Need the Outfit to Work Fast"],
  shirts: ["Without Falling Back on Stiff Dress Shirts", "When the Top Half Needs More Range"],
  shoes: ["Without Guessing at the Last Step", "When the Outfit Dies at the Bottom"],
  pants: ["Without Leaning on Boring Defaults", "When Proportion Matters More Than Trend"],
  jackets: ["Without Overlayering", "When One Layer Has to Change the Whole Outfit"],
  basics: ["Without Looking Like You Gave Up", "When Simple Pieces Need Better Shape"],
  accessories: ["Without Making the Outfit Feel Too Busy", "When the Finishing Details Actually Matter"],
  wardrobe: ["Without Buying a Bunch of Random Pieces", "When the Closet Needs Better Logic"],
  office: ["Without Falling Into Corporate Uniform Energy", "When the Dress Code Is Loose but Still Real"],
  travel: ["Without Packing Like Every Trip Is the Same", "When Comfort Has to Still Look Intentional"],
  "date-night": ["Without Looking Like You Tried Too Hard", "When the Night Needs a Better First Read"],
};

const TITLE_COLON_ENDINGS = {
  common: [
    "the cleaner way to get dressed right now",
    "what makes them feel current again",
    "the small shift that changes the whole outfit",
    "why they work better than the obvious default",
  ],
  winter: [
    "the pieces that keep cold-weather dressing sharp",
    "how to stay warm without getting bulky",
  ],
  summer: [
    "the easy way to stay sharp in the heat",
    "how to keep the outfit light without going flat",
  ],
};

const ANGLE_COLON_ENDINGS = {
  outfits: ["the formulas worth repeating this season", "how to make them feel less predictable"],
  shirts: ["the versions that give outfits more lift", "how to make the top half work harder"],
  shoes: ["the pairs that stop the look from falling apart", "what separates clean footwear from filler"],
  pants: ["the cuts that make the rest of the wardrobe easier", "where most casual outfits go wrong"],
  jackets: ["the layers that create shape fast", "what gives simple outfits real structure"],
  basics: ["the pieces that stop simple outfits from feeling dead", "how better layers fix weak outfits"],
  accessories: ["the details that make an outfit feel finished", "what is worth adding and what is not"],
  wardrobe: ["the rules that make style feel easier", "how to stop the closet from feeling random"],
  office: ["what modern workwear should actually look like", "how to look sharp without looking formal"],
  travel: ["the formula for looking composed in transit", "what actually earns a place in the bag"],
  "date-night": ["what makes going-out style feel natural", "how to look better without looking rehearsed"],
};

const TITLE_SCENARIOS = {
  common: ["busy weekdays", "weekend plans", "days when you want to look more awake", "normal life, not special occasions"],
  winter: ["cold mornings", "weekend errands in the cold", "office days with actual weather", "nights out when the temperature drops"],
  summer: ["hot afternoons", "humid weekends", "travel days in the heat", "late dinners after warm days"],
  fall: ["cool mornings", "weekends with changing weather", "the first real layer days"],
  spring: ["mixed-weather weeks", "days that start cold and end warm", "rainy commutes and mild afternoons"],
};

function extendContextWithSuffix(context, suffix) {
  const normalizedContext = cleanText(context).toLowerCase();
  const contextWords = new Set(normalizedContext.split(/\s+/).filter(Boolean));
  const remainder = cleanText(suffix)
    .split(/\s+/)
    .filter((word) => word && !contextWords.has(word.toLowerCase()));

  return remainder.length ? `${cleanText(context)} ${remainder.join(" ")}` : cleanText(context);
}

function buildContextVariants(context, description) {
  const text = cleanText(description).toLowerCase();
  const base = cleanText(context);
  const variants = [base];
  const withoutMens = base.replace(/^men'?s\s+/i, "").trim();

  if (withoutMens) {
    variants.push(withoutMens);
  }

  if (/\bwinter\b/.test(text)) {
    variants.push(base.replace(/\bwinter\b/i, "Cold-Weather"));
    if (withoutMens) {
      variants.push(withoutMens.replace(/\bwinter\b/i, "Cold-Weather"));
    }
  }

  if (/\bsummer\b/.test(text)) {
    variants.push(base.replace(/\bsummer\b/i, "Warm-Weather"));
    if (withoutMens) {
      variants.push(withoutMens.replace(/\bsummer\b/i, "Warm-Weather"));
    }
  }

  if (/\bcasual\b/.test(text) && !/\bcasual\b/i.test(base)) {
    variants.push(`${withoutMens || base} Casual`);
  }

  return uniqueList(variants.map((value) => titleCase(value)).filter(Boolean), 6);
}

function buildAngleTitleCandidates(context, angle, description) {
  const text = cleanText(description).toLowerCase();
  const seasons = extractSeasonSignals(text);
  const subjectSuffixes = TITLE_SUBJECT_SUFFIXES[angle.key] || TITLE_SUBJECT_SUFFIXES.outfits;
  const contexts = shuffleList(buildContextVariants(context, description));
  const subjects = uniqueList(
    contexts.flatMap((variant) => subjectSuffixes.map((suffix) => extendContextWithSuffix(variant, suffix))),
    24,
  );

  const directEndings = uniqueList(
    [
      ...ANGLE_DIRECT_ENDINGS[angle.key] || [],
      ...seasons.flatMap((season) => TITLE_DIRECT_ENDINGS[season] || []),
      ...TITLE_DIRECT_ENDINGS.common,
    ],
    18,
  );

  const guideEndings = uniqueList(
    [
      ...ANGLE_GUIDE_ENDINGS[angle.key] || [],
      ...seasons.flatMap((season) => TITLE_GUIDE_ENDINGS[season] || []),
      ...TITLE_GUIDE_ENDINGS.common,
    ],
    18,
  );

  const colonEndings = uniqueList(
    [
      ...ANGLE_COLON_ENDINGS[angle.key] || [],
      ...seasons.flatMap((season) => TITLE_COLON_ENDINGS[season] || []),
      ...TITLE_COLON_ENDINGS.common,
    ],
    18,
  );

  const scenarios = uniqueList(
    [...seasons.flatMap((season) => TITLE_SCENARIOS[season] || []), ...TITLE_SCENARIOS.common],
    12,
  );

  const candidates = [];

  subjects.forEach((subject) => {
    directEndings.forEach((ending) => candidates.push(truncate(`${subject} ${ending}`, 96)));
    guideEndings.forEach((ending) => candidates.push(truncate(`How to Build ${subject} ${ending}`, 96)));
    colonEndings.forEach((ending) => candidates.push(truncate(`${subject}: ${titleCase(ending)}`, 96)));
    scenarios.forEach((scenario) => candidates.push(truncate(`What to Wear for ${titleCase(scenario)}: ${subject}`, 96)));
    candidates.push(truncate(`What Makes ${subject} Work Better Than the Usual Default`, 96));
    candidates.push(truncate(`A Smarter Take on ${subject}`, 96));
  });

  return uniqueList(shuffleList(candidates), 160);
}

function buildArticleProfile(title, description) {
  const titleText = cleanText(title).toLowerCase();
  const descriptionText = cleanText(description).toLowerCase();
  const combinedText = `${titleText} ${descriptionText}`.trim();

  const categoriesFromTitle = extractMatchedCategories(titleText);
  const categoriesFromDescription = extractMatchedCategories(descriptionText);
  const styles = uniqueList([...extractStyleSignals(titleText), ...extractStyleSignals(descriptionText)], 6);
  const materials = uniqueList([...extractMaterialSignals(titleText), ...extractMaterialSignals(descriptionText)], 6);
  const seasons = uniqueList([...extractSeasonSignals(titleText), ...extractSeasonSignals(descriptionText)], 4);
  const titleTokens = tokenize(titleText).filter((token) => !GENERIC_SIGNAL_TOKENS.has(token));
  const descriptionTokens = tokenize(descriptionText).filter((token) => !GENERIC_SIGNAL_TOKENS.has(token));
  const seasonCategoryOrder = buildSeasonCategoryOrder(seasons);

  const preferredCategories = uniqueList(
    [...categoriesFromTitle, ...categoriesFromDescription, ...seasonCategoryOrder, ...DEFAULT_CATEGORY_ORDER],
    seasonCategoryOrder.length,
  );

  return {
    titleText,
    descriptionText,
    combinedText,
    titleTokens,
    descriptionTokens,
    preferredCategories,
    styles,
    materials,
    seasons,
  };
}

function scoreProductForProfile(product, profile, selectedProducts, usedProductCounts) {
  const productText = `${product.name} ${product.description} ${product.category} ${product.categoryLabel} ${product.styles.join(" ")} ${product.tags.join(" ")}`.toLowerCase();

  let score = 0;
  score += scoreProductTokens(product, profile.titleTokens, 2.6);
  score += scoreProductTokens(product, profile.descriptionTokens, 0.8);

  profile.preferredCategories.forEach((category, index) => {
    if (product.category === category) {
      score += Math.max(18 - index * 4, 4);
    }
  });

  profile.styles.forEach((style) => {
    if (product.styles.includes(style)) {
      score += 8;
    }
  });

  profile.materials.forEach((material) => {
    if (productText.includes(material)) {
      score += 6;
    }
  });

  score += scoreSeasonFit(productText, profile.seasons);

  const sameCategoryCount = selectedProducts.filter((item) => item.category === product.category).length;
  if (sameCategoryCount) {
    const isPrimaryCategory = profile.preferredCategories[0] === product.category;
    score -= isPrimaryCategory ? 3 + sameCategoryCount * 4 : 10 + sameCategoryCount * 6;
  }

  const reusePenalty = profile.seasons.length ? 18 : 30;
  score -= (usedProductCounts.get(product.id) || 0) * reusePenalty;
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
  const context = buildAngleContext(description);
  const primaryAngle = extractThemeAngles(description)[0];
  if (primaryAngle?.label) {
    return truncate(`${context} ${primaryAngle.label}`, 70);
  }

  const text = cleanText(description).toLowerCase();
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
  const titles = uniqueList(customTitles || [], articleCount);
  const context = buildAngleContext(description);
  const themeAngles = shuffleList(extractThemeAngles(description));
  const seen = new Set(titles.map((title) => title.toLowerCase()));

  const pushTitle = (value) => {
    const cleaned = cleanText(value);
    if (!cleaned || seen.has(cleaned.toLowerCase())) {
      return false;
    }

    seen.add(cleaned.toLowerCase());
    titles.push(cleaned);
    return true;
  };

  const candidatePools = new Map(
    themeAngles.map((angle) => [angle.key, buildAngleTitleCandidates(context, angle, description)]),
  );

  const takeNextCandidate = (angle) => {
    const pool = candidatePools.get(angle.key) || [];

    while (pool.length) {
      const candidate = pool.shift();
      if (candidate && !seen.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    return "";
  };

  let cycleIndex = 0;
  while (titles.length < articleCount && themeAngles.length) {
    const angle = themeAngles[cycleIndex % themeAngles.length];
    const candidate = takeNextCandidate(angle);

    if (!candidate) {
      cycleIndex += 1;
      if (cycleIndex > themeAngles.length * 4) {
        break;
      }
      continue;
    }

    pushTitle(candidate);
    cycleIndex += 1;
  }

  const fallbackPool = uniqueList(
    shuffleList(
      themeAngles.flatMap((angle) => buildAngleTitleCandidates(buildThemePhrase(description), angle, description)),
    ),
    120,
  );

  fallbackPool.forEach((candidate) => {
    if (titles.length < articleCount) {
      pushTitle(candidate);
    }
  });

  while (titles.length < articleCount) {
    const fallback = truncate(`${buildThemePhrase(description)} ${pickRandom(["Guide", "Ideas", "Formula", "Edit", "Playbook"])}`, 96);
    if (!pushTitle(fallback)) {
      pushTitle(truncate(`${buildThemePhrase(description)} ${Date.now().toString().slice(-4)} ${titles.length + 1}`, 96));
    }
  }

  return titles.slice(0, articleCount);
}

const TITLE_STYLE_HINTS = [
  "search-friendly and direct",
  "editorial and conversational",
  "practical how-to",
  "clean and understated",
  "magazine-style but grounded",
  "specific and modern",
  "plainspoken and useful",
  "sharp and compact",
];

function buildVarietyToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }

  return `${Date.now().toString(36)}${Math.floor(randomFraction() * 1679616)
    .toString(36)
    .padStart(4, "0")}`.slice(-8);
}

function buildTitleStyleHint() {
  return pickRandom(TITLE_STYLE_HINTS);
}

function matchProducts(catalog, title, description, limit, usedProductCounts = new Map()) {
  const profile = buildArticleProfile(title, description);
  const selectedProducts = [];

  while (selectedProducts.length < limit) {
    const candidate = catalog
      .filter((product) => !selectedProducts.some((item) => item.id === product.id))
      .map((product) => ({
        ...product,
        score: scoreProductForProfile(product, profile, selectedProducts, usedProductCounts),
      }))
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))[0];

    if (!candidate) {
      break;
    }

    selectedProducts.push(candidate);
  }

  return selectedProducts.map(({ score, ...product }) => product);
}

function buildBriefs(catalog, titles, description, lockedTitles = []) {
  const usedProductCounts = new Map();

  return titles.map((title, index) => {
    const lockedTitle = cleanText(lockedTitles[index]);
    const effectiveTitle = lockedTitle || title;
    const products = matchProducts(catalog, effectiveTitle, description, 4, usedProductCounts);
    products.forEach((product) => {
      usedProductCounts.set(product.id, (usedProductCounts.get(product.id) || 0) + 1);
    });

    return {
      title: effectiveTitle,
      planningTitle: effectiveTitle,
      lockedTitle,
      titleStyleHint: buildTitleStyleHint(),
      varietyToken: buildVarietyToken(),
      description,
      products,
    };
  });
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
        "You write concise men's style blog drafts for PrimeGent. Respond with valid JSON only. No markdown fences. Do not invent products, brands, links, prices, or availability. The prose paragraphs must stay editorial and generic; do not mention exact product names or brands in the article body. Concrete product promotion must happen only through the product_mentions array using the provided product_id values. When a title is not locked, you must create a fresh, natural title that fits the requested description and feels non-formulaic.",
    },
    {
      role: "user",
      content: `Return a JSON object with exactly this shape:
{
  "articles": [
    {
      "title": "...",
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
- "title" is required and must be at most 96 characters.
- If a brief includes a non-empty "locked_title", return that exact text as the title.
- If "locked_title" is empty, create a fresh original title that fits the description, focus, and matched products.
- Generated titles must feel natural, specific, and different from each other in both wording and structure.
- Avoid recycling stock patterns like repeating the same opener or ending across the batch.
- Use "title_style_hint" and "variety_token" only as hidden cues to vary the title. Do not mention them in the title or article body.
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
    locked_title: brief.lockedTitle,
    focus_title: brief.planningTitle,
    title_style_hint: brief.titleStyleHint,
    variety_token: brief.varietyToken,
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

function buildTitleMessages(briefs) {
  return [
    {
      role: "system",
      content:
        "You write titles for men's style blog articles for PrimeGent. Respond with valid JSON only. No markdown fences. When a title is not locked, choose a fresh, natural title that fits the request and does not sound templated or repetitive.",
    },
    {
      role: "user",
      content: `Return a JSON object with exactly this shape:
{
  "titles": ["...", "..."]
}

Rules:
- Return exactly ${briefs.length} titles in the same order as the input briefs.
- Every title must be at most 96 characters.
- If a brief includes a non-empty "locked_title", return that exact text.
- If "locked_title" is empty, create one fresh original title that fits the description, focus, and matched products.
- Keep the titles varied. Do not reuse the same opener, structure, or ending across the batch.
- Use "title_style_hint" and "variety_token" only as hidden cues to vary phrasing. Do not mention them.
- Avoid clickbait, all-caps, brackets, numbering, and obvious template phrases.

Input briefs:
${JSON.stringify(
  briefs.map((brief) => ({
    locked_title: brief.lockedTitle,
    focus_title: brief.planningTitle,
    title_style_hint: brief.titleStyleHint,
    variety_token: brief.varietyToken,
    description: brief.description,
    products: brief.products.map((product) => ({
      category: product.categoryLabel,
      name: product.name,
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

function ensureUniqueTitles(titles, fallbackTitles) {
  const seen = new Set();

  return titles.map((title, index) => {
    const fallbackTitle = truncate(cleanText(fallbackTitles[index]), 96);
    let candidate = truncate(cleanText(title), 96) || fallbackTitle;
    let suffix = 2;

    while (candidate && seen.has(candidate.toLowerCase())) {
      if (fallbackTitle && !seen.has(fallbackTitle.toLowerCase())) {
        candidate = fallbackTitle;
        break;
      }

      candidate = truncate(`${fallbackTitle || candidate} ${suffix}`, 96);
      suffix += 1;
    }

    if (candidate) {
      seen.add(candidate.toLowerCase());
    }

    return candidate || fallbackTitle || `Article ${index + 1}`;
  });
}

function ensureUniqueArticleTitles(articles, fallbackArticles) {
  const uniqueTitles = ensureUniqueTitles(
    articles.map((article) => article.title),
    fallbackArticles.map((article) => article.title),
  );

  return articles.map((article, index) => ({
    ...article,
    title: uniqueTitles[index],
  }));
}

function normalizeArticle(aiArticle, brief, fallbackArticle) {
  const validIds = new Set(brief.products.map((product) => product.id));
  const sections = (Array.isArray(aiArticle?.sections) ? aiArticle.sections : [])
    .slice(0, fallbackArticle.sections.length)
    .map((section, index) => normalizeSection(section, validIds, fallbackArticle.sections[index] || fallbackArticle.sections[0]))
    .filter(Boolean);
  const lockedTitle = truncate(cleanText(brief.lockedTitle), 96);
  const aiTitle = truncate(cleanText(aiArticle?.title), 96);

  return {
    title: lockedTitle || aiTitle || fallbackArticle.title,
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

  return ensureUniqueArticleTitles(
    briefs.map((brief, index) => normalizeArticle(articles[index], brief, fallbackArticles[index])),
    fallbackArticles,
  );
}

function normalizeTitleArrayResponse(rawText, briefs) {
  if (!rawText) {
    return null;
  }

  const parsed = parseJsonObject(rawText);
  const titles = Array.isArray(parsed?.titles) ? parsed.titles : [];

  if (titles.length !== briefs.length) {
    return null;
  }

  return ensureUniqueTitles(
    briefs.map((brief, index) => brief.lockedTitle || titles[index] || brief.title),
    briefs.map((brief) => brief.title),
  );
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

  const planningTitles = buildAutoTitles(description, articleCount, []);
  const baseBriefs = buildBriefs(catalog, planningTitles, description, customTitles);
  const apiKey = env.OPENROUTER_API_KEY;

  if (!apiKey) {
    const fallbackArticles = baseBriefs.map((brief) => buildFallbackArticle(brief));
    return json({ articles: fallbackArticles, source: "fallback", titleSource: "fallback" });
  }

  let briefs = baseBriefs;
  let titleSource = "fallback";

  try {
    const titleResponse = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "HTTP-Referer": new URL(request.url).origin,
          "X-Title": "PrimeGent Affiliate Publisher",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
          temperature: 1,
          max_tokens: 500,
          response_format: { type: "json_object" },
          messages: buildTitleMessages(baseBriefs),
        }),
      },
      15000,
    );

    if (titleResponse.ok) {
      const titlePayload = await titleResponse.json();
      const generatedTitles = normalizeTitleArrayResponse(extractAssistantContent(titlePayload), baseBriefs);

      if (generatedTitles) {
        briefs = baseBriefs.map((brief, index) => {
          const resolvedTitle = generatedTitles[index];
          return {
            ...brief,
            title: resolvedTitle,
            planningTitle: resolvedTitle,
            lockedTitle: resolvedTitle,
          };
        });
        titleSource = "ai";
      }
    }

    const fallbackArticles = briefs.map((brief) => buildFallbackArticle(brief));
    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "HTTP-Referer": new URL(request.url).origin,
          "X-Title": "PrimeGent Affiliate Publisher",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
          temperature: 0.85,
          max_tokens: 3200,
          response_format: { type: "json_object" },
          messages: buildPublisherMessages(briefs),
        }),
      },
      35000,
    );

    if (!response.ok) {
      return json({ articles: fallbackArticles, source: "fallback", titleSource });
    }

    const payload = await response.json();
    const articles = normalizeArticleArrayResponse(extractAssistantContent(payload), briefs, fallbackArticles);
    return json({
      articles,
      source: articles.some((article) => article.source === "ai") ? "ai" : "fallback",
      titleSource,
    });
  } catch {
    const fallbackArticles = briefs.map((brief) => buildFallbackArticle(brief));
    return json({ articles: fallbackArticles, source: "fallback", titleSource });
  }
}
