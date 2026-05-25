const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");
const PUBLIC_DIR = path.join(__dirname, "public");
const AFFILIATE_PUBLIC_DIR = path.join(ROOT_DIR, "tools", "affiliate-admin", "public");
const TMP_DIR = path.join(ROOT_DIR, ".blog-generator-tmp");
const GENERATED_POSTS_PATH = path.join(ROOT_DIR, "blog", "generated-posts.json");
const GENERATOR_SCRIPT = path.join(ROOT_DIR, "tools", "generate-blog-from-image.js");
const STATIC_GENERATOR_SCRIPT = path.join(ROOT_DIR, "scripts", "generate-site.mjs");
const affiliateAdmin = require("../affiliate-admin/server.js");

loadEnvFile(ENV_PATH);

const PORT = Number(process.env.PORT || 3201);
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_KEYWORD_GUIDANCE_LENGTH = 2000;
const DEFAULT_GENERATOR_TIMEOUT_MS = 45 * 60 * 1000;
const GENERATOR_TIMEOUT_MS = readPositiveIntegerEnv("BLOG_GENERATOR_TIMEOUT_MS", DEFAULT_GENERATOR_TIMEOUT_MS);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

fs.mkdirSync(TMP_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/admin")) {
      sendFile(res, path.join(PUBLIC_DIR, "index.html"));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/admin/")) {
      sendPublicFile(res, PUBLIC_DIR, requestUrl.pathname.replace(/^\/admin\//, ""));
      return;
    }

    if (req.method === "GET" && (requestUrl.pathname === "/affiliate-admin" || requestUrl.pathname === "/affiliate-admin/")) {
      sendFile(res, path.join(AFFILIATE_PUBLIC_DIR, "index.html"));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/affiliate-admin/")) {
      sendPublicFile(res, AFFILIATE_PUBLIC_DIR, requestUrl.pathname.replace(/^\/affiliate-admin\//, ""));
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/site")) {
      sendSiteFile(res, requestUrl.pathname);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/admin-summary") {
      sendJson(res, 200, buildAdminSummary());
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/regenerate-site") {
      sendJson(res, 200, await runStaticGenerator());
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/posts") {
      sendJson(res, 200, { posts: readGeneratedPosts() });
      return;
    }

    if (requestUrl.pathname.startsWith("/api/posts/")) {
      const slug = decodeURIComponent(requestUrl.pathname.replace(/^\/api\/posts\//, ""));

      if (req.method === "PUT") {
        const payload = await readJsonBody(req);
        sendJson(res, 200, await updateGeneratedPost(slug, payload));
        return;
      }

      if (req.method === "DELETE") {
        sendJson(res, 200, await deleteGeneratedPost(slug));
        return;
      }
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/sections") {
      sendJson(res, 200, { sections: affiliateAdmin.getCategories() });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/analyze") {
      const payload = await readJsonBody(req);
      sendJson(res, 200, { analysis: await affiliateAdmin.analyzeAffiliateInput(payload) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/publish") {
      const payload = await readJsonBody(req);
      const analysis = await affiliateAdmin.analyzeAffiliateInput(payload);
      await affiliateAdmin.writeProductFiles(analysis);
      sendJson(res, 200, {
        ok: true,
        pageFile: analysis.pageFile,
        pagePath: path.join(ROOT_DIR, analysis.pageFile),
        picksPath: path.join(ROOT_DIR, "picks.html"),
        sitemapPath: path.join(ROOT_DIR, "sitemap.xml"),
        analysis,
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/generate-blog") {
      const upload = await readMultipartForm(req);
      const keywordGuidance = normalizeKeywordGuidance(upload.fields.keywords);
      const tempPath = path.join(TMP_DIR, `${Date.now()}-${sanitizeFilename(upload.image.filename)}`);
      fs.writeFileSync(tempPath, upload.image.buffer);

      try {
        sendJson(res, 200, await runGenerator(tempPath, res, keywordGuidance));
      } finally {
        fs.rmSync(tempPath, { force: true });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(PORT, () => {
  console.log(`PrimeGent admin dashboard running at http://localhost:${PORT}/admin`);
});

function sendPublicFile(res, baseDir, relativePath) {
  const requestedPath = path.normalize(decodeURIComponent(relativePath));
  const filePath = path.join(baseDir, requestedPath);

  if (!filePath.startsWith(baseDir)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  sendFile(res, filePath);
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(res, 404, { error: "File not found." });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function sendSiteFile(res, pathname) {
  const relativePath = decodeURIComponent(pathname.replace(/^\/site\/?/, "")) || "index.html";
  const normalizedPath = path.normalize(relativePath);
  const filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  sendFile(res, filePath);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const body = await readRequestBody(req, MAX_JSON_BYTES);
  if (!body.length) {
    return {};
  }

  try {
    return JSON.parse(body.toString("utf8"));
  } catch (_error) {
    throw new Error("Expected valid JSON request body.");
  }
}

async function readMultipartForm(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error("Expected multipart form upload.");
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readRequestBody(req);
  const parts = splitMultipart(body, boundary);
  const fields = {};
  let image = null;

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const rawHeaders = part.slice(0, headerEnd).toString("utf8");
    const content = trimMultipartContent(part.slice(headerEnd + 4));
    const disposition = rawHeaders.match(/content-disposition:[^\r\n]+/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const partContentType = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "";

    if (name === "image" && filename) {
      if (!partContentType.startsWith("image/")) {
        throw new Error("Please upload an image file.");
      }

      image = {
        filename,
        contentType: partContentType,
        buffer: content,
      };
      continue;
    }

    if (name && !filename) {
      fields[name] = content.toString("utf8");
    }
  }

  if (!image) {
    throw new Error("No image field found in upload.");
  }

  return { image, fields };
}

function splitMultipart(body, boundary) {
  const parts = [];
  let cursor = body.indexOf(boundary);

  while (cursor !== -1) {
    const partStart = cursor + boundary.length;
    const next = body.indexOf(boundary, partStart);
    if (next === -1) break;

    const part = body.slice(partStart, next);
    if (!part.includes(Buffer.from("Content-Disposition"))) {
      cursor = next;
      continue;
    }

    parts.push(trimMultipartContent(part));
    cursor = next;
  }

  return parts;
}

function trimMultipartContent(buffer) {
  let start = 0;
  let end = buffer.length;

  if (buffer.slice(0, 2).toString() === "\r\n") start = 2;
  if (buffer.slice(end - 2).toString() === "\r\n") end -= 2;
  if (buffer.slice(end - 2).toString() === "--") end -= 2;

  return buffer.slice(start, end);
}

function runGenerator(imagePath, res, keywordGuidance = "") {
  return new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = Date.now();
    const args = [GENERATOR_SCRIPT, imagePath];
    if (keywordGuidance) {
      args.push("--keywords", keywordGuidance);
    }

    const child = execFile(
      process.execPath,
      args,
      {
        cwd: ROOT_DIR,
        timeout: GENERATOR_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 4,
      },
      (error, stdout, stderr) => {
        settled = true;
        const combinedOutput = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);

        if (error) {
          if (error.killed && error.signal === "SIGTERM") {
            reject(
              new Error(
                [
                  `Blog generation timed out after ${Math.round(GENERATOR_TIMEOUT_MS / 60000)} minutes.`,
                  "The provider was still cooling down, retrying, or revising the article.",
                  "This item can be retried, or increase BLOG_GENERATOR_TIMEOUT_MS in .env.local for larger batches.",
                  combinedOutput,
                ]
                  .filter(Boolean)
                  .join("\n")
              )
            );
            return;
          }

          reject(new Error(combinedOutput || error.message));
          return;
        }

        const pageMatch = combinedOutput.match(/Done:\s+(blog-[^\s]+\.html)/);
        const uploadMatch = combinedOutput.match(/Uploaded image:\s+(https?:\/\/[^\s]+)/);
        const blogMatch = combinedOutput.match(/Generated blog:\s+(.+?)\s+\(([^)]+)\)\s+-\s+(\d+)\s+words/);

        resolve({
          ok: true,
          title: blogMatch?.[1] || "",
          slug: blogMatch?.[2] || "",
          wordCount: blogMatch?.[3] ? Number(blogMatch[3]) : null,
          pagePath: pageMatch?.[1] || "",
          pageUrl: pageMatch ? `/${pageMatch[1].replace(/\\/g, "/")}` : "",
          uploadedImageUrl: uploadMatch?.[1] || "",
          output: `${combinedOutput}\nElapsed: ${elapsedSeconds}s`,
        });
      }
    );

    res.on("close", () => {
      if (!settled) {
        child.kill();
        reject(new Error("Generation stopped by user."));
      }
    });
  });
}

function runStaticGenerator() {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [STATIC_GENERATOR_SCRIPT],
      {
        cwd: ROOT_DIR,
        timeout: GENERATOR_TIMEOUT_MS,
        maxBuffer: 1024 * 1024 * 4,
      },
      (error, stdout, stderr) => {
        const output = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
        if (error) {
          reject(new Error(output || error.message));
          return;
        }

        resolve({ ok: true, output });
      }
    );
  });
}

function buildAdminSummary() {
  const generatedPosts = readGeneratedPosts();
  const blogFiles = listHtmlFiles((file) => /^blog-.*\.html$/i.test(file));
  const pickFiles = listHtmlFiles((file) => /^pick-.*\.html$/i.test(file));
  const categoryCounts = countBy(generatedPosts, (post) => post.category || "Uncategorized");
  const policyPages = [
    { label: "About", path: "about.html" },
    { label: "Contact", path: "contact.html" },
    { label: "Privacy Policy", path: "privacy-policy.html" },
    { label: "Affiliate Disclosure", path: "affiliate-disclosure.html" },
  ].map((page) => ({
    ...page,
    exists: fs.existsSync(path.join(ROOT_DIR, page.path)),
  }));
  const seoAssets = [
    { title: "robots.txt", path: "robots.txt", required: true },
    { title: "sitemap.xml", path: "sitemap.xml", required: true },
    { title: "favicon.svg", path: "static/favicon.svg", required: true },
    { title: "ads.txt", path: "ads.txt", required: false },
  ].map((asset) => {
    const exists = fs.existsSync(path.join(ROOT_DIR, asset.path));
    return {
      state: exists ? "pass" : asset.required ? "fail" : "warn",
      title: asset.title,
      detail: exists
        ? `${asset.path} is present.`
        : asset.required
          ? `${asset.path} is missing.`
          : `${asset.path} can be added after AdSense gives you a real publisher ID.`,
    };
  });
  const schema = collectSchemaStats(blogFiles, pickFiles);
  const picks = collectPicksStats(pickFiles);
  const ads = collectAdStats();
  const environment = [
    envCheck("OPENROUTER_API_KEY", "OpenRouter API key"),
    envCheck("OPENROUTER_MODEL", "OpenRouter model"),
    envCheck("R2_BUCKET_NAME", "Cloudflare R2 bucket"),
    envCheck("R2_ENDPOINT", "Cloudflare R2 S3 endpoint"),
    envCheck("R2_ACCESS_KEY_ID", "Cloudflare R2 access key"),
    envCheck("R2_SECRET_ACCESS_KEY", "Cloudflare R2 secret key"),
    envCheck("R2_PUBLIC_BASE_URL", "Public R2 image base URL"),
    envCheck("SITE_URL", "Canonical production URL"),
  ];
  const readiness = [
    {
      state: generatedPosts.length >= 20 || blogFiles.length >= 20 ? "pass" : "warn",
      title: "Substantial article library",
      detail: `${blogFiles.length} public blog pages and ${generatedPosts.length} generated post records are present.`,
    },
    {
      state: picks.total >= 20 ? "pass" : picks.total ? "warn" : "fail",
      title: "Affiliate pick inventory",
      detail: `${picks.total} product pick pages are published.`,
    },
    {
      state: policyPages.every((page) => page.exists) ? "pass" : "fail",
      title: "Trust and policy pages",
      detail: `${policyPages.filter((page) => page.exists).length}/${policyPages.length} required trust pages exist.`,
    },
    {
      state: seoAssets.some((asset) => asset.state === "fail") ? "fail" : "pass",
      title: "Crawler assets",
      detail: "robots.txt, sitemap.xml, and the favicon should be present before review.",
    },
    {
      state: schema.blogCanonicalPages >= Math.max(1, Math.floor(blogFiles.length * 0.9)) ? "pass" : "warn",
      title: "Article metadata",
      detail: `${schema.blogCanonicalPages}/${blogFiles.length} blog pages include canonical links.`,
    },
    {
      state: ads.hasAdsenseScript ? "pass" : "warn",
      title: "AdSense script",
      detail: ads.hasAdsenseScript ? "AdSense script is present on at least one public page." : "No AdSense script was detected yet.",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    content: {
      generatedPosts: generatedPosts.length,
      blogPages: blogFiles.length,
      pickPages: pickFiles.length,
      categories: categoryCounts,
      recent: blogFiles.slice(0, 8),
    },
    policyPages,
    seoAssets,
    ads,
    schema,
    picks,
    environment,
    readiness,
  };
}

function readGeneratedPosts() {
  if (!fs.existsSync(GENERATED_POSTS_PATH)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(GENERATED_POSTS_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function writeGeneratedPosts(posts) {
  fs.mkdirSync(path.dirname(GENERATED_POSTS_PATH), { recursive: true });
  fs.writeFileSync(GENERATED_POSTS_PATH, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
}

async function updateGeneratedPost(slug, payload) {
  assertSafeSlug(slug);
  const posts = readGeneratedPosts();
  const index = posts.findIndex((post) => post.slug === slug);

  if (index === -1) {
    throw new Error(`Generated post not found: ${slug}`);
  }

  posts[index] = normalizePostPayload(payload, posts[index]);
  posts[index].slug = slug;
  writeGeneratedPosts(posts);
  const generation = await runStaticGenerator();

  return {
    ok: true,
    post: posts[index],
    output: generation.output,
  };
}

async function deleteGeneratedPost(slug) {
  assertSafeSlug(slug);
  const posts = readGeneratedPosts();
  const nextPosts = posts.filter((post) => post.slug !== slug);

  if (nextPosts.length === posts.length) {
    throw new Error(`Generated post not found: ${slug}`);
  }

  writeGeneratedPosts(nextPosts);
  fs.rmSync(path.join(ROOT_DIR, `${slug}.html`), { force: true });
  const generation = await runStaticGenerator();

  return {
    ok: true,
    slug,
    output: generation.output,
  };
}

function normalizePostPayload(payload, existingPost) {
  const post = {
    ...existingPost,
    ...payload,
  };

  post.title = cleanText(post.title, existingPost.title);
  post.category = cleanText(post.category, existingPost.category || "Style Guides");
  post.date = /^\d{4}-\d{2}-\d{2}$/.test(String(post.date || "")) ? post.date : existingPost.date;
  post.readTime = cleanText(post.readTime, existingPost.readTime || "8 min read");
  post.excerpt = cleanText(post.excerpt, existingPost.excerpt);
  post.description = cleanText(post.description, existingPost.description || post.excerpt);
  post.heroLabel = cleanText(post.heroLabel, existingPost.heroLabel || "Style Guide");
  post.image = cleanText(post.image, existingPost.image || "");
  post.imageAlt = cleanText(post.imageAlt, existingPost.imageAlt || post.title);
  post.tags = cleanList(post.tags, existingPost.tags).slice(0, 8);
  post.relatedPickSlugs = cleanList(post.relatedPickSlugs, existingPost.relatedPickSlugs).slice(0, 8);
  post.sections = normalizeSections(post.sections, existingPost.sections);

  return post;
}

function normalizeSections(value, fallback) {
  const source = Array.isArray(value) ? value : [];
  const sections = source
    .map((section) => ({
      heading: cleanText(section?.heading, ""),
      paragraphs: cleanList(section?.paragraphs, []),
    }))
    .filter((section) => section.heading && section.paragraphs.length);

  return sections.length ? sections : Array.isArray(fallback) ? fallback : [];
}

function cleanText(value, fallback = "") {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized || fallback || "";
}

function cleanList(value, fallback = []) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const cleaned = source.map((item) => String(item || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  return cleaned.length ? cleaned : Array.isArray(fallback) ? fallback : [];
}

function listHtmlFiles(predicate) {
  return fs
    .readdirSync(ROOT_DIR)
    .filter((file) => file.endsWith(".html") && predicate(file))
    .map((file) => {
      const filePath = path.join(ROOT_DIR, file);
      const html = fs.readFileSync(filePath, "utf8");
      const stat = fs.statSync(filePath);
      return {
        path: file,
        title: html.match(/<title>(.*?)<\/title>/i)?.[1]?.replace(/\s+\|\s+PrimeGent$/, "") || file,
        modified: stat.mtime.toISOString().slice(0, 10),
        mtime: stat.mtimeMs,
        html,
      };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map(({ html, mtime, ...file }) => file);
}

function countBy(items, getter) {
  const counts = new Map();
  items.forEach((item) => {
    const key = getter(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function collectSchemaStats(blogFiles, pickFiles) {
  const blogHtml = blogFiles.map((file) => fs.readFileSync(path.join(ROOT_DIR, file.path), "utf8"));
  const pickHtml = pickFiles.map((file) => fs.readFileSync(path.join(ROOT_DIR, file.path), "utf8"));

  return {
    blogPages: blogFiles.length,
    pickPages: pickFiles.length,
    blogCanonicalPages: blogHtml.filter((html) => /<link\s+rel="canonical"/i.test(html)).length,
    blogOpenGraphPages: blogHtml.filter((html) => /property="og:title"/i.test(html)).length,
    productJsonLdPages: pickHtml.filter((html) => /"@type":\s*"Product"/.test(html)).length,
  };
}

function collectPicksStats(pickFiles) {
  const picksHtmlPath = path.join(ROOT_DIR, "picks.html");
  const sitemapPath = path.join(ROOT_DIR, "sitemap.xml");
  const picksHtml = fs.existsSync(picksHtmlPath) ? fs.readFileSync(picksHtmlPath, "utf8") : "";
  const sitemapXml = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "";
  const cards = (picksHtml.match(/data-pick-card/g) || []).length;
  const sponsoredLinks = (picksHtml.match(/rel="[^"]*\bsponsored\b[^"]*"/g) || []).length;

  return {
    total: pickFiles.length,
    cards,
    checks: [
      {
        state: picksHtml ? "pass" : "fail",
        title: "Picks index",
        detail: picksHtml ? "picks.html exists." : "picks.html is missing.",
      },
      {
        state: cards >= 12 ? "pass" : cards ? "warn" : "fail",
        title: "Visible pick cards",
        detail: `${cards} product cards are currently visible on picks.html.`,
      },
      {
        state: sponsoredLinks ? "pass" : "warn",
        title: "Sponsored link attributes",
        detail: `${sponsoredLinks} sponsored link attributes were found on the picks page.`,
      },
      {
        state: /picks\.html/.test(sitemapXml) ? "pass" : "warn",
        title: "Sitemap entry",
        detail: /picks\.html/.test(sitemapXml) ? "picks.html is listed in sitemap.xml." : "Add picks.html to sitemap.xml.",
      },
    ],
  };
}

function collectAdStats() {
  const publicPages = ["index.html", "blog.html", "picks.html", "about.html"].filter((file) =>
    fs.existsSync(path.join(ROOT_DIR, file))
  );
  let totalSlots = 0;
  let hasAdsenseScript = false;

  publicPages.forEach((file) => {
    const html = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
    totalSlots += (html.match(/adsbygoogle|ad-slot/g) || []).length;
    hasAdsenseScript = hasAdsenseScript || /pagead2\.googlesyndication\.com/.test(html);
  });

  return { totalSlots, hasAdsenseScript };
}

function envCheck(name, title) {
  const exists = Boolean(process.env[name]);
  return {
    state: exists ? "pass" : "warn",
    title,
    detail: exists ? `${name} is configured.` : `${name} is not set in .env.local.`,
  };
}

function sanitizeFilename(value) {
  const parsed = path.parse(value);
  const name = parsed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ext = parsed.ext.toLowerCase() || ".jpg";
  return `${name || "primegent-blog-image"}${ext}`;
}

function normalizeKeywordGuidance(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_KEYWORD_GUIDANCE_LENGTH);
}

function assertSafeSlug(slug) {
  if (!/^blog-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid blog post slug.");
  }
}

function readPositiveIntegerEnv(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        return;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
}
