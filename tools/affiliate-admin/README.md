# PrimeGent Affiliate Product Publisher

Run the local publisher UI:

```bash
node tools/affiliate-admin/server.js
```

Then open `http://localhost:4311`.

What it does:

- Resolves an Amazon affiliate link and reads product data directly from Amazon
- Previews the generated PrimeGent pick page metadata
- Writes or updates a `pick-*.html` page in the site root
- Inserts or replaces the matching live card inside `picks.html`
- Adds the new page URL to `sitemap.xml`

Notes:

- If Amazon does not expose a live price, the page still publishes and simply omits price metadata
- The tool is designed for the current static PrimeGent site structure
- If `scripts/generate-site.mjs` is re-run later, manually published cards/pages may need to be re-applied
