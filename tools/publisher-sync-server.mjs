import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = process.env.PUBLISHER_SYNC_ROOT
  ? path.resolve(process.env.PUBLISHER_SYNC_ROOT)
  : path.resolve(__dirname, "..");
const port = Number.parseInt(process.env.PUBLISHER_SYNC_PORT || "8791", 10);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data, null, 2));
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, corsHeaders);
  response.end();
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (!text || text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, Math.max(maxLength - 1, 0));
  const cut = slice.lastIndexOf(" ");
  return `${slice.slice(0, cut > 0 ? cut : slice.length)}...`;
}

function uniqueList(values, limit) {
  const seen = new Set();
  const result = [];

  for (const value of Array.isArray(values) ? values : []) {
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

function normalizeTitleKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function countWords(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean).length;
}

function getLocalDateString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function buildHeroLabel(title) {
  const stopWords = new Set(["a", "an", "and", "for", "from", "how", "in", "of", "on", "or", "that", "the", "to", "with"]);
  const words = cleanText(title)
    .replace(/men'?s/gi, "")
    .split(" ")
    .filter((word) => word && !stopWords.has(word.toLowerCase()));

  return truncate(words.slice(0, 2).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "New Post", 24);
}

function buildExcerpt(article) {
  return truncate(article.dek || article.summary || article.conclusion, 150);
}

function buildDescription(article) {
  return truncate(`${article.summary} ${article.conclusion}`, 190);
}

function buildReadTime(article) {
  const totalWords =
    countWords(article.title) +
    countWords(article.dek) +
    countWords(article.summary) +
    countWords(article.conclusion) +
    countWords(article.affiliateNote) +
    (article.sections || []).reduce((sum, section) => {
      return sum + countWords(section.heading) + (section.paragraphs || []).reduce((inner, paragraph) => inner + countWords(paragraph), 0);
    }, 0);

  return `${Math.max(6, Math.round(totalWords / 200))} min read`;
}

function sanitizeCatalog(catalog) {
  return (Array.isArray(catalog) ? catalog : [])
    .map((product) => {
      const id = cleanText(product?.id);
      const name = cleanText(product?.name);
      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        url: cleanText(product?.url) || `./${id}.html`,
        image: cleanText(product?.image),
        description: truncate(product?.description, 220),
        category: cleanText(product?.category),
        categoryLabel: cleanText(product?.categoryLabel || product?.category || "Pick"),
        styles: uniqueList(product?.styles || [], 4),
        tags: uniqueList(product?.tags || [], 4),
        brand: cleanText(product?.brand),
        priceLabel: cleanText(product?.priceLabel || "Catalog pick"),
      };
    })
    .filter(Boolean);
}

function sanitizeArticles(articles) {
  return (Array.isArray(articles) ? articles : [])
    .map((article) => ({
      title: cleanText(article?.title),
      dek: truncate(article?.dek, 170),
      summary: truncate(article?.summary, 220),
      category: cleanText(article?.category || "Style Guides") || "Style Guides",
      tags: uniqueList(article?.tags || [], 5),
      sections: (Array.isArray(article?.sections) ? article.sections : [])
        .map((section) => ({
          heading: truncate(section?.heading, 90),
          paragraphs: uniqueList(section?.paragraphs || [], 4),
          productMentions: (Array.isArray(section?.productMentions) ? section.productMentions : [])
            .map((mention) => ({
              productId: cleanText(mention?.productId),
              rationale: truncate(mention?.rationale, 180),
            }))
            .filter((mention) => mention.productId && mention.rationale)
            .slice(0, 2),
        }))
        .filter((section) => section.heading && section.paragraphs.length)
        .slice(0, 6),
      conclusion: truncate(article?.conclusion, 260),
      affiliateNote: truncate(article?.affiliateNote, 140),
      productIds: uniqueList(article?.productIds || [], 4),
    }))
    .filter((article) => article.title && article.sections.length);
}

function buildMentionParagraph(mentions, products) {
  return (mentions || [])
    .map((mention) => {
      const product = products.find((item) => item.id === mention.productId);
      if (!product) {
        return "";
      }

      return `One product that fits this point well is the <a href="./${escapeHtml(product.id)}.html">${escapeHtml(product.name)}</a>. ${escapeHtml(
        cleanText(mention.rationale),
      )}`;
    })
    .filter(Boolean)
    .join(" ");
}

function buildSections(article, products) {
  const sections = (article.sections || []).map((section) => {
    const paragraphs = (section.paragraphs || []).map((paragraph) => escapeHtml(cleanText(paragraph)));
    const mentionParagraph = buildMentionParagraph(section.productMentions || [], products);

    return {
      heading: cleanText(section.heading),
      paragraphs: mentionParagraph ? [...paragraphs, mentionParagraph] : paragraphs,
    };
  });

  sections.push({
    heading: "Closing thought",
    paragraphs: [escapeHtml(cleanText(article.conclusion)), escapeHtml(cleanText(article.affiliateNote))].filter(Boolean),
  });

  return sections.filter((section) => section.heading && section.paragraphs.length);
}

function buildBaseSlug(title) {
  const raw = slugify(title).replace(/^blog-/, "");
  const trimmed = raw.slice(0, 56).replace(/-+$/g, "");
  return `blog-${trimmed || "generated-post"}`;
}

function reserveSlug(baseSlug, reservedSlugs) {
  let candidate = baseSlug;
  let counter = 2;

  while (reservedSlugs.has(candidate)) {
    candidate = `${baseSlug.slice(0, Math.max(1, 56 - String(counter).length))}-${counter}`;
    counter += 1;
  }

  reservedSlugs.add(candidate);
  return candidate;
}

function buildPostRecord(article, catalog, slug, dateString) {
  const products = (article.productIds || [])
    .map((id) => catalog.find((product) => product.id === id))
    .filter(Boolean);

  return {
    slug,
    title: cleanText(article.title),
    category: cleanText(article.category || "Style Guides") || "Style Guides",
    date: dateString,
    readTime: buildReadTime(article),
    excerpt: buildExcerpt(article),
    description: buildDescription(article),
    heroLabel: buildHeroLabel(article.title),
    tags: uniqueList(article.tags || [], 5),
    relatedPickSlugs: uniqueList(products.map((product) => product.id.replace(/^pick-/, "")), 4),
    sections: buildSections(article, products),
  };
}

function sortPosts(posts) {
  return [...posts].sort((left, right) => {
    const dateCompare = new Date(`${right.date}T00:00:00`) - new Date(`${left.date}T00:00:00`);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.title.localeCompare(right.title);
  });
}

function buildBlogCard(post) {
  return `
    <article class="card blog-card" data-blog-card data-category="${escapeHtml(post.category.toLowerCase().replace(/\s+/g, "-"))}" data-title="${escapeHtml(post.title.toLowerCase())}" data-tags="${escapeHtml((post.tags || []).join("|").toLowerCase())}">
      <div class="card-visual card-visual--article" aria-hidden="true">
        <span>${escapeHtml(post.heroLabel)}</span>
      </div>
      <div class="blog-card__body">
        <div class="blog-card__eyebrow">
          <span class="badge">${escapeHtml(post.category)}</span>
          <span>${escapeHtml(formatDate(post.date))}</span>
          <span>${escapeHtml(post.readTime)}</span>
        </div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.excerpt)}</p>
        <a class="text-link" href="./${escapeHtml(post.slug)}.html">Read Article -></a>
      </div>
    </article>
  `;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateBlogHtml(blogHtml, manifest) {
  const gridMarker = '<div class="card-grid card-grid--blog" data-blog-grid>';
  if (!blogHtml.includes(gridMarker)) {
    throw new Error("Could not find the blog grid inside blog.html.");
  }

  let nextHtml = blogHtml;
  for (const post of manifest) {
    const pattern = new RegExp(
      `<article class="card blog-card"[\\s\\S]*?<a class="text-link" href="\\./${escapeRegExp(post.slug)}\\.html">Read Article -><\\/a>[\\s\\S]*?<\\/article>\\s*`,
      "g",
    );
    nextHtml = nextHtml.replace(pattern, "");
  }

  const cards = sortPosts(manifest).map((post) => buildBlogCard(post)).join("");
  nextHtml = nextHtml.replace(gridMarker, `${gridMarker}${cards}`);

  const totalCards = (nextHtml.match(/data-blog-card/g) || []).length;
  nextHtml = nextHtml.replace(
    /<p data-blog-results-copy>[\s\S]*?<\/p>/,
    `<p data-blog-results-copy>Showing all ${totalCards} articles.</p>`,
  );

  return nextHtml;
}

function buildGeneratedArticleBody(post, catalog) {
  const relatedProducts = (post.relatedPickSlugs || [])
    .map((slug) => catalog.find((product) => product.id === `pick-${slug}`))
    .filter(Boolean);

  const sections = (post.sections || [])
    .map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}</section>`)
    .join("");

  return `
      <div class="reading-progress" aria-hidden="true"><span data-reading-progress></span></div>
      <main>
        <section class="page-hero page-hero--article">
          <div class="container article-hero">
            <nav class="breadcrumb" aria-label="Breadcrumb"><a href="./index.html">Home</a><span>/</span><a href="./blog.html">Blog</a><span>/</span><span>${escapeHtml(post.title)}</span></nav>
            <p class="eyebrow">${escapeHtml(post.category)}</p>
            <h1>${escapeHtml(post.title)}</h1>
            <div class="article-meta"><span>${escapeHtml(formatDate(post.date))}</span><span>${escapeHtml(post.readTime)}</span></div>
            <p class="hero-copy">${escapeHtml(post.excerpt)}</p>
            <p class="microcopy">Editorial note: related product links on PrimeGent may be affiliate links. Read the <a href="./affiliate-disclosure.html">affiliate disclosure</a>.</p>
          </div>
        </section>
        <section class="section section--tight">
          <div class="container article-grid article-grid--post">
            <article class="article-content card card--prose" data-article-content>${sections}</article>
            <aside class="sidebar">
              <div class="card sidebar-card"><h2>Quick context</h2><p>${escapeHtml(post.description)}</p></div>
              <div class="card sidebar-card"><h2>Tags</h2><div class="tag-row">${(post.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div></div>
              ${
                relatedProducts.length
                  ? `<div class="card sidebar-card"><h2>Related picks</h2><ul class="bullet-list">${relatedProducts
                      .map((product) => `<li><a href="./${escapeHtml(product.id)}.html">${escapeHtml(product.name)}</a></li>`)
                      .join("")}</ul></div>`
                  : ""
              }
            </aside>
          </div>
        </section>
      </main>
  `;
}

function buildGeneratedArticlePage(post, catalog) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(post.title)} | PrimeGent</title>
    <meta name="description" content="${escapeHtml(post.description)}">
    <meta name="robots" content="index,follow">
    <meta name="author" content="PrimeGent Editorial">
    <meta name="theme-color" content="#11100d">
    <link rel="canonical" href="https://primegent.pages.dev/${escapeHtml(post.slug)}.html">
    <link rel="icon" type="image/svg+xml" href="./static/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="./static/style.css">
    <meta property="og:site_name" content="PrimeGent">
    <meta property="og:title" content="${escapeHtml(post.title)} | PrimeGent">
    <meta property="og:description" content="${escapeHtml(post.description)}">
    <meta property="og:image" content="https://primegent.pages.dev/static/og-cover.svg">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://primegent.pages.dev/${escapeHtml(post.slug)}.html">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(post.title)} | PrimeGent">
    <meta name="twitter:description" content="${escapeHtml(post.description)}">
    <meta name="twitter:image" content="https://primegent.pages.dev/static/og-cover.svg">
  </head>
  <body data-page="blog" class="page-article">
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
          <a href="./privacy-policy.html" data-nav-link="privacy">Privacy</a>
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
            <a href="./privacy-policy.html" data-nav-link="privacy">Privacy</a>
          </nav>
        </div>
      </div>
    </header>
    ${buildGeneratedArticleBody(post, catalog)}
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
          <a href="./blog.html">Journal</a>
          <a href="./picks.html">Curated picks</a>
        </div>
        <div>
          <h2>Company</h2>
          <a href="./about.html">About us</a>
          <a href="./contact.html">Contact us</a>
        </div>
        <div>
          <h2>Legal</h2>
          <a href="./privacy-policy.html">Privacy policy</a>
          <a href="./affiliate-disclosure.html">Affiliate disclosure</a>
          <p class="footer-note">PrimeGent may earn commissions from qualifying purchases through affiliate links.</p>
        </div>
      </div>
      <div class="container footer-bottom">
        <p>&copy; ${new Date().getFullYear()} PrimeGent. Dress better. Every day.</p>
      </div>
    </footer>

    <button class="back-to-top" type="button" aria-label="Back to top" data-back-to-top>Top</button>
    <script src="./static/app.js" defer></script>
  </body>
</html>
`;
}

async function readJson(relativePath, fallbackValue) {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

async function writeText(relativePath, contents) {
  await writeFile(path.join(root, relativePath), contents, "utf8");
}

async function loadManifest() {
  const parsed = await readJson(path.join("blog", "generated-posts.json"), []);
  return (Array.isArray(parsed) ? parsed : []).map((post) => ({
    slug: cleanText(post?.slug),
    title: cleanText(post?.title),
    category: cleanText(post?.category) || "Style Guides",
    date: cleanText(post?.date) || "2026-01-01",
    readTime: cleanText(post?.readTime) || "8 min read",
    excerpt: truncate(post?.excerpt, 150),
    description: truncate(post?.description, 190),
    heroLabel: truncate(post?.heroLabel, 24),
    tags: uniqueList(post?.tags || [], 5),
    relatedPickSlugs: uniqueList(post?.relatedPickSlugs || [], 4),
    sections: (Array.isArray(post?.sections) ? post.sections : [])
      .map((section) => ({
        heading: cleanText(section?.heading),
        paragraphs: uniqueList(section?.paragraphs || [], 6),
      }))
      .filter((section) => section.heading && section.paragraphs.length),
  })).filter((post) => post.slug && post.title && post.sections.length);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseSiteSlugs(blogHtml) {
  return new Set(
    [...blogHtml.matchAll(/href="\.\/(blog-[a-z0-9-]+)\.html"/g)].map((match) => match[1]),
  );
}

async function publishArticles(input) {
  const catalog = sanitizeCatalog(input?.catalog);
  const articles = sanitizeArticles(input?.articles);

  if (!articles.length) {
    throw new Error("No generated articles were provided.");
  }

  const manifest = await loadManifest();
  const blogHtmlPath = path.join(root, "blog.html");
  const blogHtml = await readFile(blogHtmlPath, "utf8");

  const reservedSlugs = parseSiteSlugs(blogHtml);
  manifest.forEach((post) => reservedSlugs.add(post.slug));

  const titleToSlug = new Map(manifest.map((post) => [normalizeTitleKey(post.title), post.slug]));
  const dateString = getLocalDateString();
  const currentPosts = articles.map((article) => {
    const existingSlug = titleToSlug.get(normalizeTitleKey(article.title));
    const slug = existingSlug || reserveSlug(buildBaseSlug(article.title), reservedSlugs);
    return buildPostRecord(article, catalog, slug, dateString);
  });

  const manifestBySlug = new Map(manifest.map((post) => [post.slug, post]));
  currentPosts.forEach((post) => {
    manifestBySlug.set(post.slug, post);
  });
  const nextManifest = sortPosts([...manifestBySlug.values()]);

  await writeText(path.join("blog", "generated-posts.json"), `${JSON.stringify(nextManifest, null, 2)}\n`);
  for (const post of nextManifest) {
    await writeText(`${post.slug}.html`, buildGeneratedArticlePage(post, catalog));
  }

  const nextBlogHtml = updateBlogHtml(blogHtml, nextManifest);
  await writeText("blog.html", nextBlogHtml);

  return currentPosts.map((post) => ({
    title: post.title,
    slug: post.slug,
    path: `./${post.slug}.html`,
  }));
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendEmpty(response);
    return;
  }

  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, { ok: true, root, port });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/publish") {
      const rawBody = await readBody(request);
      const input = rawBody ? JSON.parse(rawBody) : {};
      const posts = await publishArticles(input);
      sendJson(response, 200, { ok: true, posts });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unexpected error." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PrimeGent publisher sync listening on http://127.0.0.1:${port}`);
});
