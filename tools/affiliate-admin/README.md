# PrimeGent Affiliate Product Publisher

Run the local publisher UI:

```bash
node tools/affiliate-admin/server.js
```

Then open `http://localhost:4311`.

Required setup:

- Deploy the Pages Function at `functions/api/editorial.js`
- In Cloudflare Pages, set `OPENROUTER_API_KEY` as a secret under `Settings > Variables and Secrets`
- Optional: set `OPENROUTER_MODEL` in Cloudflare if you want a model other than `nvidia/nemotron-3-super-120b-a12b:free`
- Optional local override: set `EDITORIAL_API_URL` in `D:\Prime Gent\PrimeGent\.env` if your deployed Pages URL is not `https://primegent.pages.dev`

What it does:

- Resolves an Amazon affiliate link and reads product data directly from Amazon
- Uses OpenRouter to generate fresh editorial copy for who it's best for, who should skip it, where it works best, pros, and cons
- Previews the generated PrimeGent pick page metadata
- Writes or updates a `pick-*.html` page in the site root
- Inserts or replaces the matching live card inside `picks.html`
- Adds the new page URL to `sitemap.xml`

Notes:

- The local affiliate admin server does not need the OpenRouter key if it can reach the deployed Cloudflare `/api/editorial` endpoint
- If Amazon does not expose a live price, the page still publishes and simply omits price metadata
- The tool is designed for the current static PrimeGent site structure
- If `scripts/generate-site.mjs` is re-run later, manually published cards/pages may need to be re-applied
