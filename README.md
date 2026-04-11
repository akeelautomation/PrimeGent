# PrimeGent

PrimeGent is a fully static men's fashion website built with vanilla HTML, CSS, and JavaScript. It focuses on curated outfit combinations, affiliate-friendly product picks, and SEO-ready style guides. Live URL: `https://REPLACE_ME`.

## Local development

Open `index.html` directly in a browser for a quick check, or run:

```bash
wrangler pages dev .
```

The repository also includes a generator script for the individual content pages:

```bash
node scripts/generate-site.mjs
```

For the affiliate publisher, copy `.env.example` to `.env.local` for local-only values. Keep real secrets out of tracked files and use Cloudflare Pages secrets for `OPENROUTER_API_KEY` whenever possible.

## How to add a new pick

1. Open `scripts/generate-site.mjs`.
2. Add a new object to the `picks` array with slug, metadata, content sections, and related picks.
3. Re-run `node scripts/generate-site.mjs`.
4. Confirm the new item appears in `picks.html` and its `pick-[slug].html` page is generated.

## How to add a new blog post

1. Open `scripts/generate-site.mjs`.
2. Add a new object to the `blogPosts` array with title, meta, sections, and related pick slugs.
3. Re-run `node scripts/generate-site.mjs`.
4. Verify the new article appears on `blog.html` and the corresponding `blog-[slug].html` page exists.

## Amazon affiliate tag

The generated pick pages use placeholder Amazon URLs with `AFFILIATE_TAG`.

1. Copy `.env.example` to `.env.local` and update `AFFILIATE_TAG` there if you want a local reference.
2. Find and replace `AFFILIATE_TAG` across the generated HTML files and `scripts/generate-site.mjs`.
3. Re-run the generator if you changed the source data file.

## Secret safety

- `.env.local`, `.env.*`, and `.dev.vars.*` are ignored by git; keep real keys there, not in tracked files.
- The repo includes a pre-commit hook at `.githooks/pre-commit` that blocks obvious OpenRouter secrets before commit.
- Enable it once per clone with `git config core.hooksPath .githooks`.
- If a key was ever pushed to GitHub, rotate it in OpenRouter and remove the leaked commit from history before reusing the repo.

## Deployment

```bash
wrangler pages deploy .
```

The Cloudflare Pages config lives in `wrangler.toml`.

## Pinterest and SEO notes

- Every page includes a unique title, meta description, canonical URL, Open Graph tags, Twitter Card tags, and JSON-LD schema.
- The site links to `sitemap.xml` and includes a `google-site-verification` placeholder for Search Console.
- Pick pages are designed for affiliate traffic with product schema, clear calls to action, and share buttons.
- The picks grid supports deep-link filtering with URL params like `?category=shoes&style=minimal`, which is useful for Pinterest pins and internal blog links.
