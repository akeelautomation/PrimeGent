const els = {
  form: document.querySelector("#productForm"),
  sectionId: document.querySelector("#sectionId"),
  publishBtn: document.querySelector("#publishBtn"),
  status: document.querySelector("#status"),
  emptyState: document.querySelector("#emptyState"),
  preview: document.querySelector("#preview"),
  previewImage: document.querySelector("#previewImage"),
  previewTitle: document.querySelector("#previewTitle"),
  previewSection: document.querySelector("#previewSection"),
  previewAsin: document.querySelector("#previewAsin"),
  previewPrice: document.querySelector("#previewPrice"),
  previewFile: document.querySelector("#previewFile"),
  previewUrl: document.querySelector("#previewUrl"),
  previewImageCount: document.querySelector("#previewImageCount"),
  previewMetaDescription: document.querySelector("#previewMetaDescription"),
  previewOgTitle: document.querySelector("#previewOgTitle"),
  previewBestFor: document.querySelector("#previewBestFor"),
  previewSkipFor: document.querySelector("#previewSkipFor"),
  previewWorksBest: document.querySelector("#previewWorksBest"),
  previewPros: document.querySelector("#previewPros"),
  previewCons: document.querySelector("#previewCons"),
  previewBullets: document.querySelector("#previewBullets"),
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function formPayload() {
  const data = new FormData(els.form);
  const imageUrls = String(data.get("imageUrls") || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    affiliateUrl: data.get("affiliateUrl")?.trim(),
    imageUrl: imageUrls[0] || "",
    imageUrls,
    sectionId: data.get("sectionId")?.trim(),
    shortTitle: data.get("shortTitle")?.trim(),
    cardCopy: data.get("cardCopy")?.trim(),
    pageSummary: data.get("pageSummary")?.trim(),
    styleTags: data.get("styleTags")?.trim(),
    brandTier: data.get("brandTier")?.trim(),
    price: data.get("price")?.trim(),
    material: data.get("material")?.trim(),
    fit: data.get("fit")?.trim(),
    care: data.get("care")?.trim(),
    altText: data.get("altText")?.trim(),
  };
}

function setStatus(message, tone = "") {
  els.status.textContent = message;
  els.status.className = `status ${tone}`.trim();
}

function renderList(listEl, items) {
  listEl.replaceChildren(
    ...(items || []).map((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      return item;
    }),
  );
}

function renderAnalysis(analysis) {
  els.emptyState.hidden = true;
  els.preview.hidden = false;

  els.previewImage.src = analysis.imageUrl;
  els.previewImage.alt = analysis.altText;
  els.previewTitle.textContent = analysis.shortTitle;
  els.previewSection.textContent = `Category: ${analysis.categoryLabel}`;
  els.previewAsin.textContent = `ASIN: ${analysis.asin}`;
  if (analysis.price) {
    const sourceLabel = analysis.priceSource === "manual" ? "manual override" : "Amazon";
    els.previewPrice.textContent = `Price found: $${analysis.price} (${sourceLabel})`;
  } else {
    els.previewPrice.textContent =
      "Price not found. The page can still publish and will omit price metadata.";
  }
  els.previewFile.textContent = analysis.pageFile;
  els.previewUrl.textContent = analysis.productUrl;
  els.previewImageCount.textContent = `${analysis.imageUrls.length} image${analysis.imageUrls.length === 1 ? "" : "s"}`;
  els.previewMetaDescription.textContent = analysis.metaDescription;
  els.previewOgTitle.textContent = analysis.ogTitle;
  els.previewBestFor.textContent = analysis.editorial.bestFor;
  els.previewSkipFor.textContent = analysis.editorial.skipFor;
  els.previewWorksBest.textContent = analysis.editorial.worksBest;
  renderList(els.previewPros, analysis.editorial.pros);
  renderList(els.previewCons, analysis.editorial.cons);
  renderList(els.previewBullets, analysis.bullets);
}

async function loadSections() {
  const { sections } = await requestJson("/api/sections", { method: "GET", headers: {} });
  els.sectionId.replaceChildren(
    (() => {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Auto-detect from product";
      return option;
    })(),
    ...sections.map((section) => {
      const option = document.createElement("option");
      option.value = section.id;
      option.textContent = section.label;
      return option;
    }),
  );
}

async function analyze() {
  setStatus("Analyzing Amazon product and generating AI editorial preview...");
  const { analysis } = await requestJson("/api/analyze", {
    method: "POST",
    body: JSON.stringify(formPayload()),
  });
  renderAnalysis(analysis);
  setStatus("Preview ready.", "status--ok");
}

async function publish() {
  setStatus("Writing AI-backed product page, updating picks.html, and syncing sitemap.xml...");
  const { analysis, pagePath, picksPath, sitemapPath } = await requestJson("/api/publish", {
    method: "POST",
    body: JSON.stringify(formPayload()),
  });
  renderAnalysis(analysis);
  setStatus(`Published ${analysis.pageFile}. Updated ${picksPath}, ${pagePath}, and ${sitemapPath}.`, "status--ok");
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await analyze();
  } catch (error) {
    setStatus(error.message, "status--error");
  }
});

els.publishBtn.addEventListener("click", async () => {
  try {
    await publish();
  } catch (error) {
    setStatus(error.message, "status--error");
  }
});

loadSections().catch((error) => {
  setStatus(error.message, "status--error");
});
