const panels = document.querySelectorAll("[data-panel]");
const navItems = document.querySelectorAll("[data-panel-target]");
const serverState = document.querySelector("#serverState");
const refreshAuditButton = document.querySelector("#refreshAuditButton");
const regenerateButton = document.querySelector("#regenerateButton");
const actionLog = document.querySelector("#actionLog");

const postSelect = document.querySelector("#postSelect");
const postEditorForm = document.querySelector("#postEditorForm");
const deletePostButton = document.querySelector("#deletePostButton");
const openPostButton = document.querySelector("#openPostButton");
const postEditorStatus = document.querySelector("#postEditorStatus");

const form = document.querySelector("#uploadForm");
const imageInput = document.querySelector("#imageInput");
const keywordInput = document.querySelector("#keywordInput");
const dropzone = document.querySelector(".dropzone");
const previewWrap = document.querySelector("#previewWrap");
const statusEl = document.querySelector("#status");
const submitButton = document.querySelector("#submitButton");
const stopButton = document.querySelector("#stopButton");
const clearButton = document.querySelector("#clearButton");
const summary = document.querySelector("#summary");
const queueList = document.querySelector("#queueList");

const publisherIdInput = document.querySelector("#publisherId");
const adClientIdInput = document.querySelector("#adClientId");
const leaderboardSlotInput = document.querySelector("#leaderboardSlot");
const rectangleSlotInput = document.querySelector("#rectangleSlot");
const saveAdsenseSettingsButton = document.querySelector("#saveAdsenseSettings");
const copyAdsenseSnippetButton = document.querySelector("#copyAdsenseSnippet");
const copyAdsTxtButton = document.querySelector("#copyAdsTxt");
const adsenseSnippet = document.querySelector("#adsenseSnippet");

const BATCH_CONCURRENCY = 3;
const FAILED_ITEM_RETRY_DELAY_MS = 5000;
const MAX_ITEM_ATTEMPTS = 3;
const KEYWORD_GUIDANCE_STORAGE_KEY = "primeGent.keywordGuidance";
const ADSENSE_SETTINGS_KEY = "primeGent.adsenseSettings";

let queuedFiles = [];
let previewUrls = [];
let isProcessing = false;
let stopRequested = false;
let activeControllers = new Set();
let completed = 0;
let failed = 0;
let started = 0;
let editablePosts = [];
let selectedPostSlug = "";

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    const target = item.dataset.panelTarget;
    navItems.forEach((navItem) => navItem.classList.toggle("is-active", navItem === item));
    panels.forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === target));
  });
});

refreshAuditButton?.addEventListener("click", loadAudit);
regenerateButton?.addEventListener("click", regenerateStaticSite);
postSelect?.addEventListener("change", () => selectPost(postSelect.value));
postEditorForm?.addEventListener("submit", saveSelectedPost);
deletePostButton?.addEventListener("click", deleteSelectedPost);

keywordInput.value = localStorage.getItem(KEYWORD_GUIDANCE_STORAGE_KEY) || "";
keywordInput.addEventListener("input", () => {
  localStorage.setItem(KEYWORD_GUIDANCE_STORAGE_KEY, keywordInput.value);
});

const savedAdsenseSettings = JSON.parse(localStorage.getItem(ADSENSE_SETTINGS_KEY) || "{}");
publisherIdInput.value = savedAdsenseSettings.publisherId || "";
adClientIdInput.value = savedAdsenseSettings.adClientId || "";
leaderboardSlotInput.value = savedAdsenseSettings.leaderboardSlot || "";
rectangleSlotInput.value = savedAdsenseSettings.rectangleSlot || "";

[publisherIdInput, adClientIdInput, leaderboardSlotInput, rectangleSlotInput].forEach((input) => {
  input.addEventListener("input", renderAdsenseSnippet);
});

saveAdsenseSettingsButton.addEventListener("click", () => {
  localStorage.setItem(ADSENSE_SETTINGS_KEY, JSON.stringify(getAdsenseSettings()));
  flashButton(saveAdsenseSettingsButton, "Saved");
});

copyAdsenseSnippetButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(adsenseSnippet.textContent || "");
  flashButton(copyAdsenseSnippetButton, "Copied");
});

copyAdsTxtButton.addEventListener("click", async () => {
  const { publisherId } = getAdsenseSettings();
  const line = publisherId
    ? `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`
    : "Enter a real pub- publisher ID first.";
  await navigator.clipboard.writeText(line);
  flashButton(copyAdsTxtButton, "Copied");
});

imageInput.addEventListener("change", () => {
  setQueuedFiles(Array.from(imageInput.files || []));
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragging");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragging");

  const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
  setQueuedFiles(files);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!queuedFiles.length) {
    setStatus("Choose one or more images first.", "error");
    return;
  }

  isProcessing = true;
  stopRequested = false;
  completed = 0;
  failed = 0;
  started = 0;
  const keywordGuidance = getKeywordGuidance();
  const total = queuedFiles.length;
  const workerCount = Math.min(BATCH_CONCURRENCY, total);
  setLoading(true);
  updateBatchSummary(total, workerCount);
  summary.classList.remove("empty");

  let nextIndex = 0;
  const claimNextIndex = () => {
    if (stopRequested || nextIndex >= total) {
      return -1;
    }
    const index = nextIndex;
    nextIndex += 1;
    started += 1;
    updateBatchSummary(total, workerCount);
    return index;
  };

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!stopRequested) {
        const index = claimNextIndex();
        if (index === -1) {
          return;
        }
        await processQueueItem(index, total, workerCount, keywordGuidance);
      }
    })
  );

  isProcessing = false;
  activeControllers.clear();
  setLoading(false);
  setStatus(
    stopRequested ? `Batch stopped. ${completed} done, ${failed} failed.` : `Batch finished. ${completed} done, ${failed} failed.`,
    failed || stopRequested ? "error" : "success"
  );
  await loadAudit();
  await loadPosts();
});

stopButton.addEventListener("click", () => {
  if (!isProcessing) {
    return;
  }

  stopRequested = true;
  stopButton.disabled = true;
  setStatus("Stopping active requests.", "error");
  activeControllers.forEach((controller) => controller.abort());
});

clearButton.addEventListener("click", () => {
  if (isProcessing) {
    setStatus("Batch is running. Wait for it to finish before clearing.", "error");
    return;
  }

  imageInput.value = "";
  queuedFiles = [];
  renderQueue();
  summary.textContent = "Generated blog pages, word counts, R2 image URLs, and run logs will appear here.";
  summary.classList.add("empty");
  setStatus("", "");
});

renderAdsenseSnippet();
loadAudit();
loadPosts();

async function loadAudit() {
  refreshAuditButton.disabled = true;
  serverState.textContent = "Checking";

  try {
    const audit = await requestJson("/api/admin-summary");
    renderAudit(audit);
    serverState.textContent = "Online";
  } catch (error) {
    serverState.textContent = "Offline";
    renderError(error.message || "Unable to load admin summary.");
  } finally {
    refreshAuditButton.disabled = false;
  }
}

function renderAudit(audit) {
  setText("#blogPageCount", audit.content.blogPages);
  setText("#generatedPostCount", `${audit.content.generatedPosts} generated post records`);
  setText("#pickPageCount", audit.content.pickPages);
  setText("#pickCardCount", `${audit.picks.cards} cards on picks.html`);
  setText("#categoryCount", audit.content.categories.length);
  setText("#policyScore", `${audit.policyPages.filter((page) => page.exists).length}/${audit.policyPages.length}`);
  setText("#adSignalCount", audit.ads.totalSlots);
  setText("#adSignalStatus", audit.ads.hasAdsenseScript ? "AdSense script detected" : "No AdSense script detected");

  renderReadiness(audit.readiness);
  renderCategoryBars(audit.content.categories);
  renderRecentPosts(audit.content.recent);
  renderSeoAssets(audit.seoAssets);
  renderSchemaSummary(audit.schema);
  renderEnvironmentList(audit.environment);
  renderPicks(audit.picks);
}

async function loadPosts(preferredSlug = selectedPostSlug) {
  if (!postSelect) return;

  postSelect.disabled = true;
  postSelect.innerHTML = `<option value="">Loading posts...</option>`;

  try {
    const data = await requestJson("/api/posts");
    editablePosts = data.posts || [];
    postSelect.textContent = "";

    if (!editablePosts.length) {
      postSelect.innerHTML = `<option value="">No generated posts found</option>`;
      postEditorForm.hidden = true;
      return;
    }

    editablePosts.forEach((post) => {
      const option = document.createElement("option");
      option.value = post.slug;
      option.textContent = `${post.title} (${post.slug})`;
      postSelect.appendChild(option);
    });

    const nextSlug = editablePosts.some((post) => post.slug === preferredSlug) ? preferredSlug : editablePosts[0].slug;
    postSelect.value = nextSlug;
    selectPost(nextSlug);
  } catch (error) {
    postSelect.innerHTML = `<option value="">Post loading failed</option>`;
    setPostEditorStatus(error.message || "Unable to load generated posts.", "error");
  } finally {
    postSelect.disabled = false;
  }
}

function selectPost(slug) {
  const post = editablePosts.find((item) => item.slug === slug);
  selectedPostSlug = slug;

  if (!post) {
    postEditorForm.hidden = true;
    return;
  }

  postEditorForm.hidden = false;
  setValue("#editTitle", post.title);
  setValue("#editCategory", post.category);
  setValue("#editDate", post.date);
  setValue("#editReadTime", post.readTime);
  setValue("#editExcerpt", post.excerpt);
  setValue("#editDescription", post.description);
  setValue("#editHeroLabel", post.heroLabel);
  setValue("#editImage", post.image);
  setValue("#editImageAlt", post.imageAlt);
  setValue("#editTags", (post.tags || []).join("\n"));
  setValue("#editRelated", (post.relatedPickSlugs || []).join("\n"));
  setValue("#editSections", JSON.stringify(post.sections || [], null, 2));
  openPostButton.href = `/site/${post.slug}.html`;
  setPostEditorStatus("", "");
}

async function saveSelectedPost(event) {
  event.preventDefault();
  if (!selectedPostSlug) return;

  setPostEditorLoading(true);
  setPostEditorStatus("Saving post and regenerating the static site...", "loading");

  try {
    const payload = readPostEditorForm();
    const data = await requestJson(`/api/posts/${encodeURIComponent(selectedPostSlug)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setPostEditorStatus("Post saved. Static site regenerated.", "success");
    await loadAudit();
    await loadPosts(data.post.slug);
  } catch (error) {
    setPostEditorStatus(error.message || "Post save failed.", "error");
  } finally {
    setPostEditorLoading(false);
  }
}

async function deleteSelectedPost() {
  if (!selectedPostSlug) return;

  const post = editablePosts.find((item) => item.slug === selectedPostSlug);
  const confirmed = window.confirm(`Delete "${post?.title || selectedPostSlug}"? This removes it from generated-posts.json and regenerates the site.`);
  if (!confirmed) return;

  setPostEditorLoading(true);
  setPostEditorStatus("Deleting post and regenerating the static site...", "loading");

  try {
    await requestJson(`/api/posts/${encodeURIComponent(selectedPostSlug)}`, { method: "DELETE" });
    selectedPostSlug = "";
    setPostEditorStatus("Post deleted. Static site regenerated.", "success");
    await loadAudit();
    await loadPosts();
  } catch (error) {
    setPostEditorStatus(error.message || "Post delete failed.", "error");
  } finally {
    setPostEditorLoading(false);
  }
}

function readPostEditorForm() {
  let sections;
  try {
    sections = JSON.parse(getValue("#editSections") || "[]");
  } catch (_error) {
    throw new Error("Sections JSON is invalid.");
  }

  if (!Array.isArray(sections)) {
    throw new Error("Sections JSON must be an array.");
  }

  return {
    title: getValue("#editTitle"),
    category: getValue("#editCategory"),
    date: getValue("#editDate"),
    readTime: getValue("#editReadTime"),
    excerpt: getValue("#editExcerpt"),
    description: getValue("#editDescription"),
    heroLabel: getValue("#editHeroLabel"),
    image: getValue("#editImage"),
    imageAlt: getValue("#editImageAlt"),
    tags: getLines("#editTags"),
    relatedPickSlugs: getLines("#editRelated"),
    sections,
  };
}

async function regenerateStaticSite() {
  regenerateButton.disabled = true;
  actionLog.hidden = false;
  actionLog.textContent = "Regenerating site files...";

  try {
    const data = await requestJson("/api/regenerate-site", { method: "POST" });
    actionLog.textContent = data.output || "Static site regenerated.";
    await loadAudit();
    await loadPosts();
  } catch (error) {
    actionLog.textContent = error.message || "Regeneration failed.";
  } finally {
    regenerateButton.disabled = false;
  }
}

async function processQueueItem(index, total, workerCount, keywordGuidance) {
  const file = queuedFiles[index];
  const row = queueList.querySelector(`[data-index="${index}"]`);

  updateQueueRow(row, {
    state: "loading",
    status: `Processing ${index + 1} of ${total}...`,
  });
  setStatus(`Running ${activeControllers.size + 1}/${workerCount}: ${file.name}`, "loading");

  try {
    const result = await generateBlogWithRetry(file, row, index, total, keywordGuidance);
    if (stopRequested) {
      updateQueueRow(row, {
        state: "error",
        status: "Stopped",
        error: "Stopped by user.",
      });
      return;
    }

    completed += 1;
    updateQueueRow(row, {
      state: "success",
      status: `${result.wordCount || "1100-1200"} words`,
      result,
    });
  } catch (error) {
    if (isAbortError(error)) {
      updateQueueRow(row, {
        state: "error",
        status: "Stopped",
        error: "Stopped by user.",
      });
      stopRequested = true;
      return;
    }

    failed += 1;
    updateQueueRow(row, {
      state: "error",
      status: "Failed",
      error: error.message || "Blog generation failed.",
    });
  } finally {
    updateBatchSummary(total, workerCount);
  }
}

function updateBatchSummary(total, workerCount) {
  const running = activeControllers.size;
  const remaining = Math.max(0, total - completed - failed - running);
  summary.textContent = `Started ${started} of ${total}. Running ${running}/${workerCount}. Completed ${completed}. Failed ${failed}. Remaining ${remaining}.`;
}

function renderQueue() {
  revokePreviewUrls();
  queueList.textContent = "";

  if (!queuedFiles.length) {
    previewWrap.hidden = true;
    queueList.hidden = true;
    return;
  }

  previewWrap.hidden = false;
  queueList.hidden = false;

  queuedFiles.forEach((file, index) => {
    const previewUrl = URL.createObjectURL(file);
    previewUrls.push(previewUrl);

    const preview = document.createElement("div");
    const previewImage = document.createElement("img");
    const previewName = document.createElement("span");
    previewImage.src = previewUrl;
    previewImage.alt = file.name;
    previewName.textContent = file.name;
    preview.append(previewImage, previewName);
    previewWrap.appendChild(preview);

    queueList.appendChild(createQueueRow({ file, index, previewUrl }));
  });

  summary.textContent = `${queuedFiles.length} image${queuedFiles.length === 1 ? "" : "s"} queued.`;
  summary.classList.remove("empty");
}

function setQueuedFiles(files) {
  if (isProcessing) {
    setStatus("Batch is running. Wait for it to finish before changing the queue.", "error");
    return;
  }

  queuedFiles = files;
  renderQueue();
}

function createQueueRow({ file, index, previewUrl }) {
  const row = document.createElement("article");
  row.className = "queue-row";
  row.dataset.index = String(index);
  row.dataset.state = "queued";

  row.innerHTML = `
    <img class="queue-thumb" src="${previewUrl}" alt="">
    <div class="queue-main">
      <div class="queue-topline">
        <h3>${escapeHtml(file.name)}</h3>
        <span class="queue-state">Queued</span>
      </div>
      <p class="queue-meta">${formatBytes(file.size)}</p>
      <div class="queue-links" hidden></div>
      <pre class="queue-log" hidden></pre>
    </div>
  `;

  return row;
}

async function generateBlog(file, keywordGuidance = "") {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("keywords", keywordGuidance);
  const controller = new AbortController();
  activeControllers.add(controller);

  try {
    const response = await fetch("/api/generate-blog", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Blog generation failed.");
    }

    return data;
  } finally {
    activeControllers.delete(controller);
  }
}

async function generateBlogWithRetry(file, row, index, total, keywordGuidance = "") {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ITEM_ATTEMPTS; attempt += 1) {
    if (stopRequested) {
      throw new DOMException("Stopped by user.", "AbortError");
    }

    try {
      updateQueueRow(row, {
        state: "loading",
        status: `Processing ${index + 1} of ${total} - attempt ${attempt}/${MAX_ITEM_ATTEMPTS}`,
      });
      return await generateBlog(file, keywordGuidance);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error;

      if (attempt < MAX_ITEM_ATTEMPTS) {
        updateQueueRow(row, {
          state: "loading",
          status: `Retrying in ${Math.round(FAILED_ITEM_RETRY_DELAY_MS / 1000)}s`,
        });
        await sleepWithStop(FAILED_ITEM_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

function updateQueueRow(row, { state, status, result, error }) {
  if (!row) return;

  row.dataset.state = state;
  row.querySelector(".queue-state").textContent = status;

  const links = row.querySelector(".queue-links");
  const log = row.querySelector(".queue-log");

  if (result) {
    links.hidden = false;
    links.innerHTML = `
      <a href="${escapeHtml(toSitePreviewUrl(result.pageUrl) || "#")}" target="_blank" rel="noreferrer">${escapeHtml(
        result.title || result.pagePath || "Blog page"
      )}</a>
      <a href="/site/blog.html" target="_blank" rel="noreferrer">Blog Index</a>
      <a href="${escapeHtml(result.uploadedImageUrl || "#")}" target="_blank" rel="noreferrer">R2 image</a>
      <button class="copy copy-row-log" type="button">Copy Log</button>
    `;
    log.hidden = false;
    log.textContent = result.output || "";
    links.querySelector(".copy-row-log").addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(log.textContent || "");
      flashButton(event.currentTarget, "Copied");
    });
  }

  if (error) {
    links.hidden = false;
    links.innerHTML = '<button class="copy retry-row" type="button">Retry</button>';
    links.querySelector(".retry-row").addEventListener("click", () => retryRow(row));
    log.hidden = false;
    log.textContent = error;
  }
}

async function retryRow(row) {
  if (isProcessing) {
    setStatus("Batch is running. Wait for it to finish before retrying a failed item.", "error");
    return;
  }

  const index = Number(row?.dataset.index);
  const file = queuedFiles[index];
  if (!file) {
    setStatus("Could not find the original file for this row.", "error");
    return;
  }

  isProcessing = true;
  stopRequested = false;
  setLoading(true);
  setStatus(`Retrying: ${file.name}`, "loading");

  try {
    const result = await generateBlogWithRetry(file, row, index, queuedFiles.length, getKeywordGuidance());
    updateQueueRow(row, {
      state: "success",
      status: `${result.wordCount || "1100-1200"} words`,
      result,
    });
    setStatus("Retry finished.", "success");
    await loadAudit();
    await loadPosts();
  } catch (error) {
    updateQueueRow(row, {
      state: "error",
      status: isAbortError(error) ? "Stopped" : "Failed",
      error: isAbortError(error) ? "Stopped by user." : error.message || "Blog generation failed.",
    });
    setStatus(isAbortError(error) ? "Retry stopped." : "Retry failed.", "error");
  } finally {
    isProcessing = false;
    activeControllers.clear();
    setLoading(false);
  }
}

function renderReadiness(items) {
  const list = document.querySelector("#readinessList");
  const badge = document.querySelector("#readinessBadge");
  list.textContent = "";
  items.forEach((item) => list.appendChild(createCheckItem(item)));

  const failures = items.filter((item) => item.state === "fail").length;
  const warnings = items.filter((item) => item.state === "warn").length;
  badge.className = `badge ${failures ? "warn" : "good"}`;
  badge.textContent = failures ? `${failures} blockers` : warnings ? `${warnings} warnings` : "Ready for review";
}

function renderCategoryBars(categories) {
  const list = document.querySelector("#categoryBars");
  list.textContent = "";

  if (!categories.length) {
    list.appendChild(createTextItem("No generated categories found.", "Generate or publish posts to populate this chart."));
    return;
  }

  const max = Math.max(...categories.map((category) => category.count), 1);
  categories.forEach((category) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-top">
        <span>${escapeHtml(category.name)}</span>
        <span>${category.count}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width: ${(category.count / max) * 100}%"></div></div>
    `;
    list.appendChild(row);
  });
}

function renderRecentPosts(posts) {
  const list = document.querySelector("#recentPosts");
  list.textContent = "";

  if (!posts.length) {
    list.appendChild(createTextItem("No blog files found.", "Generate a post or regenerate the site."));
    return;
  }

  posts.forEach((post) => {
    const item = document.createElement("a");
    item.className = "file-item";
    item.href = `/site/${post.path}`;
    item.target = "_blank";
    item.rel = "noreferrer";
    item.innerHTML = `<strong>${escapeHtml(post.title || post.path)}</strong><small>${escapeHtml(post.path)} - ${escapeHtml(post.modified)}</small>`;
    list.appendChild(item);
  });
}

function renderSeoAssets(items) {
  const list = document.querySelector("#seoAssets");
  list.textContent = "";
  items.forEach((item) => list.appendChild(createCheckItem(item)));
}

function renderSchemaSummary(schema) {
  const list = document.querySelector("#schemaSummary");
  list.textContent = "";
  [
    { title: "Blog canonical pages", detail: `${schema.blogCanonicalPages} of ${schema.blogPages} blog pages include canonical links.` },
    { title: "Blog Open Graph pages", detail: `${schema.blogOpenGraphPages} of ${schema.blogPages} blog pages include share metadata.` },
    { title: "Product JSON-LD pages", detail: `${schema.productJsonLdPages} of ${schema.pickPages} product pages include product schema.` },
  ].forEach((row) => {
    const item = document.createElement("div");
    item.className = "schema-row";
    item.innerHTML = `<strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.detail)}</small>`;
    list.appendChild(item);
  });
}

function renderEnvironmentList(items) {
  const list = document.querySelector("#environmentList");
  list.textContent = "";
  items.forEach((item) => list.appendChild(createCheckItem(item)));
}

function renderPicks(picks) {
  const list = document.querySelector("#picksChecklist");
  const badge = document.querySelector("#picksBadge");
  if (!list || !badge) return;

  list.textContent = "";
  picks.checks.forEach((item) => list.appendChild(createCheckItem(item)));

  const failures = picks.checks.filter((item) => item.state === "fail").length;
  const warnings = picks.checks.filter((item) => item.state === "warn").length;
  badge.className = `badge ${failures ? "warn" : "good"}`;
  badge.textContent = failures ? `${failures} blockers` : warnings ? `${warnings} warnings` : "Ready";
}

function createCheckItem(item) {
  const element = document.createElement("div");
  element.className = "check-item";
  element.dataset.state = item.state;
  element.innerHTML = `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small>`;
  return element;
}

function createTextItem(title, detail) {
  const element = document.createElement("div");
  element.className = "file-item";
  element.innerHTML = `<strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small>`;
  return element;
}

function renderError(message) {
  const list = document.querySelector("#readinessList");
  list.textContent = "";
  list.appendChild(createCheckItem({ state: "fail", title: "Audit failed", detail: message }));
}

function renderAdsenseSnippet() {
  const { adClientId, leaderboardSlot, rectangleSlot } = getAdsenseSettings();
  const client = adClientId || "ca-pub-0000000000000000";
  const leaderboard = leaderboardSlot || "LEADERBOARD_SLOT_ID";
  const rectangle = rectangleSlot || "RECTANGLE_SLOT_ID";

  adsenseSnippet.textContent = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}" crossorigin="anonymous"></script>

<!-- Leaderboard -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="${client}"
     data-ad-slot="${leaderboard}"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>

<!-- In-content rectangle -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="${client}"
     data-ad-slot="${rectangle}"
     data-ad-format="rectangle"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>`;
}

function getAdsenseSettings() {
  return {
    publisherId: publisherIdInput.value.trim(),
    adClientId: adClientIdInput.value.trim(),
    leaderboardSlot: leaderboardSlotInput.value.trim(),
    rectangleSlot: rectangleSlotInput.value.trim(),
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function setStatus(message, state) {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function setPostEditorStatus(message, state) {
  postEditorStatus.textContent = message;
  postEditorStatus.dataset.state = state;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  clearButton.disabled = isLoading;
  keywordInput.disabled = isLoading;
  stopButton.disabled = !isLoading;
  submitButton.textContent = isLoading ? "Batch Running..." : "Start Batch";
}

function setPostEditorLoading(isLoading) {
  postSelect.disabled = isLoading;
  postEditorForm.querySelectorAll("input, textarea, button").forEach((element) => {
    element.disabled = isLoading;
  });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = String(value);
  }
}

function setValue(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.value = value || "";
  }
}

function getValue(selector) {
  return document.querySelector(selector)?.value.trim() || "";
}

function getLines(selector) {
  return getValue(selector)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getKeywordGuidance() {
  return String(keywordInput.value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 2000);
}

function sleepWithStop(ms) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (stopRequested || Date.now() - startedAt >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function toSitePreviewUrl(value) {
  if (!value) {
    return "";
  }

  return `/site/${String(value).replace(/^\/+/, "")}`;
}

function revokePreviewUrls() {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
  previewWrap.textContent = "";
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = original;
  }, 900);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
