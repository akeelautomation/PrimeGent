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

const publisherSyncBaseUrl = "http://127.0.0.1:8791";

async function isPublisherSyncOnline() {
  try {
    const response = await fetch(`${publisherSyncBaseUrl}/health`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
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
      const syncOnline = await isPublisherSyncOnline();
      status.textContent = syncOnline
        ? "Ready. Generate articles and the app will publish them straight into blog.html."
        : "Ready. Generate articles and the app will try to publish them into blog.html. If publish fails, start start-publisher.bat.";
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
          ? `Generated ${state.articles.length} articles in fallback mode using the live catalog. Publishing them into blog.html now.`
          : `Generated ${state.articles.length} articles from the live catalog. Publishing them into blog.html now.`;
      await publishArticles({ auto: true });
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

  const publishArticles = async ({ auto = false } = {}) => {
    if (!state.articles.length) {
      status.textContent = "Generate at least one article before publishing.";
      return false;
    }

    publishButton.disabled = true;
    if (!auto) {
      generateButton.disabled = true;
    }
    status.textContent = auto
      ? "Writing the generated articles into blog.html and saving the new post pages."
      : "Retrying publish into blog.html and saving the new post pages.";

    try {
      const response = await fetch(`${publisherSyncBaseUrl}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          articles: state.articles,
          catalog: state.catalog,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Publishing failed.");
      }

      const publishedPosts = Array.isArray(payload.posts) ? payload.posts : [];
      const publishedByTitle = new Map(
        publishedPosts.map((post) => [normalizePublisherText(post.title), post]),
      );

      state.articles = state.articles.map((article) => {
        const matchingPost = publishedByTitle.get(normalizePublisherText(article.title));
        return matchingPost
          ? {
              ...article,
              publishedSlug: matchingPost.slug,
              publishedPath: matchingPost.path || `./${matchingPost.slug}.html`,
            }
          : article;
      });
      renderPreview();
      status.textContent = `Published ${publishedPosts.length} article${publishedPosts.length === 1 ? "" : "s"} into blog.html. Reload file:///D:/Prime%20Gent/PrimeGent/blog.html and the new posts will be at the top.`;
      return true;
    } catch (error) {
      status.textContent = auto
        ? `${error.message || "Publishing failed."} The drafts were generated, but they were not written into blog.html. Start start-publisher.bat, then press Retry publish.`
        : error.message || "Publishing failed.";
      return false;
    } finally {
      publishButton.disabled = !state.articles.length;
      if (!auto) {
        generateButton.disabled = false;
      }
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
