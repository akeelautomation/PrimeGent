function normalizePublisherText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanPublisherText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncatePublisherText(value, maxLength) {
  const text = cleanPublisherText(value);
  if (!text || text.length <= maxLength) {
    return text;
  }

  const slice = text.slice(0, Math.max(maxLength - 1, 0));
  const cut = slice.lastIndexOf(" ");
  return `${slice.slice(0, cut > 0 ? cut : slice.length)}...`;
}

function escapePublisherHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitPublisherLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniquePublisherList(values, limit) {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    const cleaned = cleanPublisherText(value);
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

function stripPublisherHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCasePublisher(value) {
  return cleanPublisherText(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugifyPublisherValue(value) {
  return cleanPublisherText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function countPublisherWords(value) {
  return stripPublisherHtml(value)
    .split(/\s+/)
    .filter(Boolean).length;
}

function getPublisherLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatPublisherDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function buildPublisherMentionCard(product, rationale) {
  return `
    <article class="card publisher-callout">
      <a class="publisher-callout__media" href="${escapePublisherHtml(product.url)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapePublisherHtml(product.image || "./static/og-cover.svg")}" alt="${escapePublisherHtml(product.name)}" loading="lazy" decoding="async">
      </a>
      <div class="publisher-callout__body">
        <div class="pick-card__meta">
          <span class="badge">${escapePublisherHtml(product.categoryLabel)}</span>
          <span class="price-chip">${escapePublisherHtml(product.priceLabel || "Catalog pick")}</span>
        </div>
        <h3>${escapePublisherHtml(product.name)}</h3>
        <p>${escapePublisherHtml(rationale)}</p>
        <a class="text-link" href="${escapePublisherHtml(product.url)}" target="_blank" rel="noopener noreferrer">Open Pick -></a>
      </div>
    </article>
  `;
}

function buildPublisherArticleMarkup(article, products, index) {
  const tags = (article.tags || []).map((tag) => `<span class="tag">${escapePublisherHtml(tag)}</span>`).join("");
  const sections = (article.sections || [])
    .map((section) => {
      const paragraphs = (section.paragraphs || [])
        .map((paragraph) => `<p>${escapePublisherHtml(paragraph)}</p>`)
        .join("");
      const mentions = (section.productMentions || [])
        .map((mention) => {
          const product = products.find((item) => item.id === mention.productId);
          if (!product) {
            return "";
          }

          return buildPublisherMentionCard(product, mention.rationale);
        })
        .filter(Boolean)
        .join("");

      return `
        <section>
          <h2>${escapePublisherHtml(section.heading)}</h2>
          ${paragraphs}
          ${mentions ? `<div class="publisher-callout-grid">${mentions}</div>` : ""}
        </section>
      `;
    })
    .join("");

  return `
    <article class="publisher-article">
      <div class="publisher-article__header">
        <div>
          <p class="eyebrow">Article ${index + 1}</p>
          <h2>${escapePublisherHtml(article.title)}</h2>
          <div class="article-meta">
            <span>${escapePublisherHtml(article.category || "Generated Draft")}</span>
            <span>${escapePublisherHtml(article.source === "fallback" ? "Template mode" : "AI-assisted")}</span>
            <span>${escapePublisherHtml(`${products.length} matched picks`)}</span>
            ${article.publishedSlug ? `<span>${escapePublisherHtml("Published")}</span>` : ""}
          </div>
        </div>
        <div class="publisher-article__actions">
          ${article.publishedPath ? `<a class="btn btn-ghost" href="${escapePublisherHtml(article.publishedPath)}" target="_blank" rel="noopener noreferrer">Open published</a>` : ""}
          <button class="btn btn-ghost" type="button" data-publisher-copy-article-text="${index}">Copy text</button>
          <button class="btn btn-ghost" type="button" data-publisher-copy-article-html="${index}">Copy HTML</button>
        </div>
      </div>

      <div class="publisher-article__intro">
        <p class="hero-copy">${escapePublisherHtml(article.dek)}</p>
        <p>${escapePublisherHtml(article.summary)}</p>
      </div>

      <div class="publisher-article__body">
        <div class="publisher-article__content card--prose">
          ${sections}
          <section>
            <h2>Closing thought</h2>
            <p>${escapePublisherHtml(article.conclusion)}</p>
          </section>
        </div>

        <aside class="publisher-article__aside">
          <div class="publisher-sideblock">
            <h2>Tags</h2>
            <div class="tag-row">${tags}</div>
          </div>
          <div class="publisher-sideblock">
            <h2>Matched picks</h2>
            <ul class="bullet-list">
              ${products.map((product) => `<li>${escapePublisherHtml(product.name)}</li>`).join("")}
            </ul>
          </div>
          <div class="publisher-sideblock">
            <h2>Disclosure</h2>
            <p>${escapePublisherHtml(article.affiliateNote)}</p>
          </div>
        </aside>
      </div>
    </article>
  `;
}

function buildPublisherPreviewMarkup(articles, catalog) {
  return `
    <div class="publisher-output-list">
      ${articles
        .map((article, index) => {
          const products = (article.productIds || [])
            .map((id) => catalog.find((product) => product.id === id))
            .filter(Boolean);
          return buildPublisherArticleMarkup(article, products, index);
        })
        .join("")}
    </div>
  `;
}

function buildPublisherArticleText(article, products) {
  const lines = [article.title, "", article.dek, "", article.summary, ""];

  (article.sections || []).forEach((section) => {
    lines.push(section.heading);
    lines.push("");
    (section.paragraphs || []).forEach((paragraph) => {
      lines.push(paragraph);
      lines.push("");
    });

    (section.productMentions || []).forEach((mention) => {
      const product = products.find((item) => item.id === mention.productId);
      if (!product) {
        return;
      }

      lines.push(`Pick: ${product.name}`);
      lines.push(mention.rationale);
      lines.push(product.url);
      lines.push("");
    });
  });

  lines.push("Closing thought");
  lines.push("");
  lines.push(article.conclusion);
  lines.push("");
  lines.push(article.affiliateNote);
  return lines.join("\n").trim();
}

function buildPublisherArticleHtml(article, products) {
  const sections = (article.sections || [])
    .map((section) => {
      const paragraphs = (section.paragraphs || [])
        .map((paragraph) => `    <p>${escapePublisherHtml(paragraph)}</p>`)
        .join("\n");

      const mentions = (section.productMentions || [])
        .map((mention) => {
          const product = products.find((item) => item.id === mention.productId);
          if (!product) {
            return "";
          }

          return `    <div class="style-note">
      <h3>${escapePublisherHtml(product.name)}</h3>
      <p>${escapePublisherHtml(mention.rationale)}</p>
      <p><a href="${escapePublisherHtml(product.url)}">Open pick</a></p>
    </div>`;
        })
        .filter(Boolean)
        .join("\n");

      return `<section>
  <h2>${escapePublisherHtml(section.heading)}</h2>
${paragraphs}
${mentions}
</section>`;
    })
    .join("\n\n");

  return `<article class="article-content card card--prose">
<section>
  <h1>${escapePublisherHtml(article.title)}</h1>
  <p>${escapePublisherHtml(article.dek)}</p>
  <p>${escapePublisherHtml(article.summary)}</p>
</section>

${sections}

<section>
  <h2>Closing thought</h2>
  <p>${escapePublisherHtml(article.conclusion)}</p>
  <p>${escapePublisherHtml(article.affiliateNote)}</p>
</section>
</article>`;
}

function buildPublisherTextBundle(articles, catalog) {
  return articles
    .map((article, index) => {
      const products = (article.productIds || [])
        .map((id) => catalog.find((product) => product.id === id))
        .filter(Boolean);
      return `Article ${index + 1}\n\n${buildPublisherArticleText(article, products)}`;
    })
    .join("\n\n--------------------\n\n");
}

function buildPublisherHtmlBundle(articles, catalog) {
  return articles
    .map((article) => {
      const products = (article.productIds || [])
        .map((id) => catalog.find((product) => product.id === id))
        .filter(Boolean);
      return buildPublisherArticleHtml(article, products);
    })
    .join("\n\n");
}

function buildPublisherHeroLabel(title) {
  const stopWords = new Set(["a", "an", "and", "for", "from", "how", "in", "of", "on", "or", "that", "the", "to", "with"]);
  const words = cleanPublisherText(title)
    .replace(/men'?s/gi, "")
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word && !stopWords.has(word.toLowerCase()));

  return titleCasePublisher(words.slice(0, 2).join(" ") || "New Post");
}

function buildPublisherExcerpt(article) {
  return truncatePublisherText(article.dek || article.summary || article.conclusion, 150);
}

function buildPublisherDescription(article) {
  return truncatePublisherText(`${article.summary} ${article.conclusion}`, 190);
}

function buildPublisherReadTime(article) {
  const totalWords =
    countPublisherWords(article.title) +
    countPublisherWords(article.dek) +
    countPublisherWords(article.summary) +
    countPublisherWords(article.conclusion) +
    countPublisherWords(article.affiliateNote) +
    (article.sections || []).reduce((sum, section) => {
      return sum + countPublisherWords(section.heading) + (section.paragraphs || []).reduce((inner, paragraph) => inner + countPublisherWords(paragraph), 0);
    }, 0);

  return `${Math.max(6, Math.round(totalWords / 200))} min read`;
}

function buildPublisherMentionParagraph(mentions, products) {
  const sentences = (mentions || [])
    .map((mention) => {
      const product = products.find((item) => item.id === mention.productId);
      if (!product) {
        return "";
      }

      return `One product that fits this point well is the <a href="./${escapePublisherHtml(product.id)}.html">${escapePublisherHtml(
        product.name,
      )}</a>. ${escapePublisherHtml(cleanPublisherText(mention.rationale))}`;
    })
    .filter(Boolean);

  return sentences.join(" ");
}

function buildPublishedSections(article, products) {
  const sections = (article.sections || []).map((section) => {
    const paragraphs = (section.paragraphs || []).map((paragraph) => escapePublisherHtml(cleanPublisherText(paragraph)));
    const mentionParagraph = buildPublisherMentionParagraph(section.productMentions || [], products);

    return {
      heading: cleanPublisherText(section.heading),
      paragraphs: mentionParagraph ? [...paragraphs, mentionParagraph] : paragraphs,
    };
  });

  sections.push({
    heading: "Closing thought",
    paragraphs: [
      escapePublisherHtml(cleanPublisherText(article.conclusion)),
      escapePublisherHtml(cleanPublisherText(article.affiliateNote)),
    ],
  });

  return sections;
}

function buildPublisherBaseSlug(title) {
  const raw = slugifyPublisherValue(title).replace(/^blog-/, "");
  const trimmed = raw.slice(0, 56).replace(/-+$/g, "");
  return `blog-${trimmed || "generated-post"}`;
}

function reservePublisherSlug(baseSlug, reservedSlugs) {
  let candidate = baseSlug;
  let counter = 2;

  while (reservedSlugs.has(candidate)) {
    candidate = `${baseSlug.slice(0, Math.max(1, 56 - String(counter).length))}-${counter}`;
    counter += 1;
  }

  reservedSlugs.add(candidate);
  return candidate;
}

function buildPublishedPostRecord(article, catalog, slug, dateString) {
  const products = (article.productIds || [])
    .map((id) => catalog.find((product) => product.id === id))
    .filter(Boolean);
  const relatedPickSlugs = uniquePublisherList(
    products.map((product) => product.id.replace(/^pick-/, "")),
    4,
  );

  return {
    slug,
    title: cleanPublisherText(article.title),
    category: cleanPublisherText(article.category || "Style Guides"),
    date: dateString,
    readTime: buildPublisherReadTime(article),
    excerpt: buildPublisherExcerpt(article),
    description: buildPublisherDescription(article),
    heroLabel: truncatePublisherText(buildPublisherHeroLabel(article.title), 24),
    tags: uniquePublisherList(article.tags || [], 5),
    relatedPickSlugs,
    sections: buildPublishedSections(article, products),
  };
}

function sortPublishedPosts(posts) {
  return [...posts].sort((left, right) => {
    const dateCompare = new Date(`${right.date}T00:00:00`) - new Date(`${left.date}T00:00:00`);
    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.title.localeCompare(right.title);
  });
}

function buildPublishedCardMarkup(post) {
  return `
    <article class="card blog-card" data-blog-card data-category="${escapePublisherHtml(
      post.category.toLowerCase().replace(/\s+/g, "-"),
    )}" data-title="${escapePublisherHtml(post.title.toLowerCase())}" data-tags="${escapePublisherHtml(
      (post.tags || []).join("|").toLowerCase(),
    )}">
      <div class="card-visual card-visual--article" aria-hidden="true">
        <span>${escapePublisherHtml(post.heroLabel)}</span>
      </div>
      <div class="blog-card__body">
        <div class="blog-card__eyebrow">
          <span class="badge">${escapePublisherHtml(post.category)}</span>
          <span>${escapePublisherHtml(formatPublisherDate(post.date))}</span>
          <span>${escapePublisherHtml(post.readTime)}</span>
        </div>
        <h3>${escapePublisherHtml(post.title)}</h3>
        <p>${escapePublisherHtml(post.excerpt)}</p>
        <a class="text-link" href="./${escapePublisherHtml(post.slug)}.html">Read Article -></a>
      </div>
    </article>
  `;
}

function buildPublishedArticleBody(post, catalog) {
  const relatedProducts = (post.relatedPickSlugs || [])
    .map((slug) => catalog.find((product) => product.id === `pick-${slug}`))
    .filter(Boolean);

  const sections = (post.sections || [])
    .map((section) => {
      const paragraphs = (section.paragraphs || []).map((paragraph) => `<p>${paragraph}</p>`).join("");
      return `<section><h2>${escapePublisherHtml(section.heading)}</h2>${paragraphs}</section>`;
    })
    .join("");

  const tagMarkup = (post.tags || []).map((tag) => `<span class="tag">${escapePublisherHtml(tag)}</span>`).join("");
  const pickMarkup = relatedProducts.length
    ? `<div class="card sidebar-card"><h2>Related picks</h2><ul class="bullet-list">${relatedProducts
        .map((product) => `<li><a href="./${escapePublisherHtml(product.id)}.html">${escapePublisherHtml(product.name)}</a></li>`)
        .join("")}</ul></div>`
    : "";

  return `
      <div class="reading-progress" aria-hidden="true"><span data-reading-progress></span></div>
      <main>
        <section class="page-hero page-hero--article">
          <div class="container article-hero">
            <nav class="breadcrumb" aria-label="Breadcrumb"><a href="./index.html">Home</a><span>/</span><a href="./blog.html">Blog</a><span>/</span><span>${escapePublisherHtml(post.title)}</span></nav>
            <p class="eyebrow">${escapePublisherHtml(post.category)}</p>
            <h1>${escapePublisherHtml(post.title)}</h1>
            <div class="article-meta"><span>${escapePublisherHtml(formatPublisherDate(post.date))}</span><span>${escapePublisherHtml(post.readTime)}</span></div>
            <p class="hero-copy">${escapePublisherHtml(post.excerpt)}</p>
            <p class="microcopy">Editorial note: related product links on PrimeGent may be affiliate links. Read the <a href="./affiliate-disclosure.html">affiliate disclosure</a>.</p>
          </div>
        </section>
        <section class="section section--tight">
          <div class="container article-grid article-grid--post">
            <article class="article-content card card--prose" data-article-content>${sections}</article>
            <aside class="sidebar">
              <div class="card sidebar-card"><h2>Quick context</h2><p>${escapePublisherHtml(post.description)}</p></div>
              <div class="card sidebar-card"><h2>Tags</h2><div class="tag-row">${tagMarkup}</div></div>
              ${pickMarkup}
            </aside>
          </div>
        </section>
      </main>
  `;
}

function buildPublishedPageHtml(post, catalog) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapePublisherHtml(post.title)} | PrimeGent</title>
    <meta name="description" content="${escapePublisherHtml(post.description)}">
    <meta name="robots" content="index,follow">
    <meta name="author" content="PrimeGent Editorial">
    <meta name="theme-color" content="#11100d">
    <link rel="canonical" href="https://primegent.pages.dev/${escapePublisherHtml(post.slug)}.html">
    <link rel="icon" type="image/svg+xml" href="./static/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="./static/style.css">
    <meta property="og:site_name" content="PrimeGent">
    <meta property="og:title" content="${escapePublisherHtml(post.title)} | PrimeGent">
    <meta property="og:description" content="${escapePublisherHtml(post.description)}">
    <meta property="og:image" content="https://primegent.pages.dev/static/og-cover.svg">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://primegent.pages.dev/${escapePublisherHtml(post.slug)}.html">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapePublisherHtml(post.title)} | PrimeGent">
    <meta name="twitter:description" content="${escapePublisherHtml(post.description)}">
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
    ${buildPublishedArticleBody(post, catalog)}
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

async function copyPublisherValue(value, button, originalLabel) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }

  window.setTimeout(() => {
    button.textContent = originalLabel;
  }, 1800);
}

async function loadPublisherCatalog() {
  const response = await fetch("./picks.html", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load picks.html (${response.status}).`);
  }

  const html = await response.text();
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const cards = Array.from(documentNode.querySelectorAll("[data-pick-card]"));

  return cards
    .map((card) => {
      const link = card.querySelector('a[href*="pick-"]');
      const image = card.querySelector("img");
      const description = card.querySelector(".pick-card__body p");
      const badge = card.querySelector(".badge");
      const priceLabel = card.querySelector(".price-chip");
      const tagElements = Array.from(card.querySelectorAll(".tag"));
      const rawUrl = link?.getAttribute("href") || "";
      const url = rawUrl.startsWith("./") ? rawUrl : `./${rawUrl}`;
      const id = url.replace(/^\.\//, "").replace(/\.html$/i, "");
      const name = (card.querySelector("h3")?.textContent || card.dataset.name || "").trim();

      if (!id || !name) {
        return null;
      }

      return {
        id,
        name,
        url,
        image: image?.getAttribute("src") || "",
        description: (description?.textContent || "").trim(),
        category: (card.dataset.category || "").trim(),
        categoryLabel: (badge?.textContent || card.dataset.category || "Pick").trim(),
        styles: (card.dataset.style || "")
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean),
        tags: tagElements.map((tag) => tag.textContent.trim()).filter(Boolean),
        brand: (card.dataset.brand || "").trim(),
        priceLabel: (priceLabel?.textContent || "").trim(),
      };
    })
    .filter(Boolean);
}

async function getPublisherFileHandle(rootHandle, relativePath, create = false) {
  const segments = relativePath.split("/").filter(Boolean);
  let currentHandle = rootHandle;

  for (const segment of segments.slice(0, -1)) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create });
  }

  return currentHandle.getFileHandle(segments[segments.length - 1], { create });
}

async function readPublisherFile(rootHandle, relativePath) {
  const fileHandle = await getPublisherFileHandle(rootHandle, relativePath, false);
  const file = await fileHandle.getFile();
  return file.text();
}

async function writePublisherFile(rootHandle, relativePath, contents) {
  const fileHandle = await getPublisherFileHandle(rootHandle, relativePath, true);
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function ensurePublisherSiteHandle(state) {
  if (!("showDirectoryPicker" in window)) {
    throw new Error("This browser cannot write local files. Open the app in a Chromium-based browser to publish.");
  }

  if (state.siteHandle) {
    return state.siteHandle;
  }

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });

  try {
    await handle.getFileHandle("blog.html");
    await handle.getFileHandle("picks.html");
  } catch {
    throw new Error("Choose the PrimeGent project folder that contains blog.html and picks.html.");
  }

  state.siteHandle = handle;
  return handle;
}

function parsePublisherSiteSlugs(blogHtml) {
  const documentNode = new DOMParser().parseFromString(blogHtml, "text/html");
  const links = Array.from(documentNode.querySelectorAll("[data-blog-grid] a[href$='.html']"));
  return new Set(
    links
      .map((link) => (link.getAttribute("href") || "").replace(/^\.\//, "").replace(/\.html$/i, ""))
      .filter((slug) => slug.startsWith("blog-")),
  );
}

function updatePublisherBlogIndex(blogHtml, generatedPosts) {
  const documentNode = new DOMParser().parseFromString(blogHtml, "text/html");
  const grid = documentNode.querySelector("[data-blog-grid]");
  if (!grid) {
    throw new Error("Could not find the blog grid inside blog.html.");
  }

  const generatedSlugs = new Set(generatedPosts.map((post) => post.slug));
  Array.from(grid.querySelectorAll("[data-blog-card]")).forEach((card) => {
    const href = card.querySelector("a[href$='.html']")?.getAttribute("href") || "";
    const slug = href.replace(/^\.\//, "").replace(/\.html$/i, "");
    if (generatedSlugs.has(slug)) {
      card.remove();
    }
  });

  sortPublishedPosts(generatedPosts)
    .reverse()
    .forEach((post) => {
      grid.insertAdjacentHTML("afterbegin", buildPublishedCardMarkup(post));
    });

  const totalCards = grid.querySelectorAll("[data-blog-card]").length;
  const resultsCopy = documentNode.querySelector("[data-blog-results-copy]");
  if (resultsCopy) {
    resultsCopy.textContent = `Showing all ${totalCards} articles.`;
  }

  return `<!DOCTYPE html>\n${documentNode.documentElement.outerHTML}\n`;
}

function normalizePublisherManifest(manifest) {
  return Array.isArray(manifest)
    ? manifest
        .map((post) => ({
          slug: cleanPublisherText(post?.slug),
          title: cleanPublisherText(post?.title),
          category: cleanPublisherText(post?.category),
          date: cleanPublisherText(post?.date),
          readTime: cleanPublisherText(post?.readTime),
          excerpt: cleanPublisherText(post?.excerpt),
          description: cleanPublisherText(post?.description),
          heroLabel: cleanPublisherText(post?.heroLabel),
          tags: uniquePublisherList(post?.tags || [], 5),
          relatedPickSlugs: uniquePublisherList(post?.relatedPickSlugs || [], 4),
          sections: Array.isArray(post?.sections)
            ? post.sections
                .map((section) => ({
                  heading: cleanPublisherText(section?.heading),
                  paragraphs: uniquePublisherList(section?.paragraphs || [], 6),
                }))
                .filter((section) => section.heading && section.paragraphs.length)
            : [],
        }))
        .filter((post) => post.slug && post.title && post.sections.length)
    : [];
}

function initPublisherPage() {
  const root = document.querySelector("[data-publisher-page]");
  if (!root) {
    return;
  }

  const form = document.querySelector("[data-publisher-form]");
  const status = document.querySelector("[data-publisher-status]");
  const catalogSource = document.querySelector("[data-publisher-catalog-source]");
  const previewShell = document.querySelector("[data-publisher-preview-shell]");
  const outputActions = document.querySelector("[data-publisher-output-actions]");
  const copyTextButton = document.querySelector("[data-publisher-copy-text]");
  const copyHtmlButton = document.querySelector("[data-publisher-copy-html]");
  const publishButton = document.querySelector("[data-publisher-publish-all]");
  const generateButton = document.querySelector("[data-publisher-generate]");

  const state = {
    catalog: [],
    articles: [],
    siteHandle: null,
  };

  const renderPreview = () => {
    if (!state.articles.length) {
      previewShell.innerHTML = `
        <div class="publisher-empty">
          <h3>No articles yet</h3>
          <p>Describe what you want, choose the number of articles, and generate the batch.</p>
        </div>
      `;
      outputActions.classList.add("hidden");
      return;
    }

    previewShell.innerHTML = buildPublisherPreviewMarkup(state.articles, state.catalog);
    outputActions.classList.remove("hidden");
  };

  const loadCatalog = async () => {
    status.textContent = "Loading the live catalog from picks.html.";
    catalogSource.textContent = "Loading picks.html...";

    try {
      state.catalog = await loadPublisherCatalog();
      catalogSource.textContent = `${state.catalog.length} products parsed from picks.html`;
      status.textContent = "Ready. Describe the article batch, generate drafts, then publish them to the blog when one is worth keeping.";
    } catch (error) {
      status.textContent = error.message.includes("fetch")
        ? "Could not load picks.html. Run the site through a local server instead of opening the file directly."
        : error.message;
      catalogSource.textContent = "Catalog unavailable";
    }
  };

  const generateArticles = async () => {
    const description = (form.elements.description?.value || "").trim();
    const articleCount = Number.parseInt(form.elements.articleCount?.value || "2", 10);
    const customTitles = splitPublisherLines(form.elements.customTitles?.value || "");

    if (!description) {
      status.textContent = "Add a description before generating articles.";
      form.elements.description?.focus();
      return;
    }

    if (!state.catalog.length) {
      status.textContent = "The product catalog is not loaded yet.";
      return;
    }

    generateButton.disabled = true;
    if (publishButton) {
      publishButton.disabled = true;
    }
    state.articles = [];
    renderPreview();
    status.textContent = "Generating article batch and matching products from the live catalog.";

    try {
      const response = await fetch("./api/publisher", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          articleCount,
          customTitles,
          catalog: state.catalog,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Article generation failed.");
      }

      state.articles = Array.isArray(payload.articles) ? payload.articles : [];
      renderPreview();
      status.textContent =
        payload.source === "fallback"
          ? `Generated ${state.articles.length} articles in fallback mode using the live catalog. Publish will add them to blog.html and write the article files.`
          : `Generated ${state.articles.length} articles from the live catalog. Publish will add them to blog.html and write the article files.`;
    } catch (error) {
      state.articles = [];
      renderPreview();
      status.textContent = error.message || "Article generation failed.";
    } finally {
      generateButton.disabled = false;
      if (publishButton) {
        publishButton.disabled = !state.articles.length;
      }
    }
  };

  const publishArticles = async () => {
    if (!state.articles.length) {
      status.textContent = "Generate at least one article before publishing.";
      return;
    }

    if (!publishButton) {
      return;
    }

    publishButton.disabled = true;
    generateButton.disabled = true;
    status.textContent = "Choose the PrimeGent project folder so the app can update blog.html and write the article pages.";

    try {
      const rootHandle = await ensurePublisherSiteHandle(state);
      const blogHtml = await readPublisherFile(rootHandle, "blog.html");
      const existingSiteSlugs = parsePublisherSiteSlugs(blogHtml);

      let manifest = [];
      try {
        manifest = normalizePublisherManifest(JSON.parse(await readPublisherFile(rootHandle, "blog/generated-posts.json")));
      } catch {
        manifest = [];
      }

      const reservedSlugs = new Set(existingSiteSlugs);
      manifest.forEach((post) => reservedSlugs.add(post.slug));

      const generatedByTitle = new Map(
        manifest.map((post) => [normalizePublisherText(post.title), post.slug]),
      );
      const dateString = getPublisherLocalDate();
      const publishedPosts = state.articles.map((article) => {
        const titleKey = normalizePublisherText(article.title);
        const existingSlug = generatedByTitle.get(titleKey);
        const slug = existingSlug || reservePublisherSlug(buildPublisherBaseSlug(article.title), reservedSlugs);
        return buildPublishedPostRecord(article, state.catalog, slug, dateString);
      });

      const manifestBySlug = new Map(manifest.map((post) => [post.slug, post]));
      publishedPosts.forEach((post) => {
        manifestBySlug.set(post.slug, post);
      });
      manifest = sortPublishedPosts([...manifestBySlug.values()]);

      await writePublisherFile(rootHandle, "blog/generated-posts.json", `${JSON.stringify(manifest, null, 2)}\n`);

      for (const post of manifest) {
        await writePublisherFile(rootHandle, `${post.slug}.html`, buildPublishedPageHtml(post, state.catalog));
      }

      const updatedBlogHtml = updatePublisherBlogIndex(blogHtml, manifest);
      await writePublisherFile(rootHandle, "blog.html", updatedBlogHtml);

      state.articles = state.articles.map((article) => {
        const matchingPost = publishedPosts.find((post) => normalizePublisherText(post.title) === normalizePublisherText(article.title));
        return matchingPost
          ? {
              ...article,
              publishedSlug: matchingPost.slug,
              publishedPath: `./${matchingPost.slug}.html`,
            }
          : article;
      });
      renderPreview();
      status.textContent = `Published ${publishedPosts.length} article${publishedPosts.length === 1 ? "" : "s"} to blog.html. Reload file:///D:/Prime%20Gent/PrimeGent/blog.html to see them at the top.`;
    } catch (error) {
      status.textContent = error.message || "Publishing failed.";
    } finally {
      publishButton.disabled = !state.articles.length;
      generateButton.disabled = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    generateArticles();
  });

  publishButton?.addEventListener("click", () => {
    publishArticles();
  });

  copyTextButton?.addEventListener("click", () => {
    if (!state.articles.length) {
      return;
    }

    copyPublisherValue(buildPublisherTextBundle(state.articles, state.catalog), copyTextButton, "Copy all text");
  });

  copyHtmlButton?.addEventListener("click", () => {
    if (!state.articles.length) {
      return;
    }

    copyPublisherValue(buildPublisherHtmlBundle(state.articles, state.catalog), copyHtmlButton, "Copy all HTML");
  });

  previewShell.addEventListener("click", (event) => {
    const copyTextTarget = event.target.closest("[data-publisher-copy-article-text]");
    if (copyTextTarget) {
      const articleIndex = Number.parseInt(copyTextTarget.dataset.publisherCopyArticleText || "", 10);
      const article = state.articles[articleIndex];
      if (article) {
        const products = (article.productIds || [])
          .map((id) => state.catalog.find((product) => product.id === id))
          .filter(Boolean);
        copyPublisherValue(buildPublisherArticleText(article, products), copyTextTarget, "Copy text");
      }
      return;
    }

    const copyHtmlTarget = event.target.closest("[data-publisher-copy-article-html]");
    if (copyHtmlTarget) {
      const articleIndex = Number.parseInt(copyHtmlTarget.dataset.publisherCopyArticleHtml || "", 10);
      const article = state.articles[articleIndex];
      if (article) {
        const products = (article.productIds || [])
          .map((id) => state.catalog.find((product) => product.id === id))
          .filter(Boolean);
        copyPublisherValue(buildPublisherArticleHtml(article, products), copyHtmlTarget, "Copy HTML");
      }
    }
  });

  renderPreview();
  loadCatalog();
}

document.addEventListener("DOMContentLoaded", initPublisherPage);
