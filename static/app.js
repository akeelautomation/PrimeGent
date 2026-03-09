const PICKS_PER_PAGE = 10;

function readPicksStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const page = Number.parseInt(params.get("page") || "1", 10);

  return {
    category: params.get("category") || "",
    price: params.get("price") || "",
    style: params.get("style") || "",
    brand: params.get("brand") || "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function updatePicksURL(state, totalPages) {
  const params = new URLSearchParams(window.location.search);

  ["category", "price", "style", "brand"].forEach((key) => {
    if (state[key]) {
      params.set(key, state[key]);
    } else {
      params.delete(key);
    }
  });

  if (state.page > 1 && totalPages > 1) {
    params.set("page", String(state.page));
  } else {
    params.delete("page");
  }

  const nextQuery = params.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

function syncFilterControls(filters) {
  const form = document.querySelector("[data-filter-form]");

  if (!form) {
    return;
  }

  ["category", "price", "style", "brand"].forEach((key) => {
    const input = form.elements.namedItem(key);
    if (input) {
      input.value = filters[key] || "";
    }
  });
}

function getPaginationItems(totalPages, currentPage) {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  if (currentPage <= 3) {
    [2, 3, 4].forEach((page) => pages.add(page));
  }

  if (currentPage >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  }

  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const items = [];

  sortedPages.forEach((page, index) => {
    const previous = sortedPages[index - 1];
    if (previous && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

function renderPicksPagination(totalItems, currentPage) {
  const pagination = document.querySelector("[data-picks-pagination]");

  if (!pagination) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / PICKS_PER_PAGE));

  if (totalItems <= PICKS_PER_PAGE) {
    pagination.innerHTML = "";
    pagination.classList.add("hidden");
    return;
  }

  const items = getPaginationItems(totalPages, currentPage);
  const buttons = [
    `<button class="pagination__button" type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Prev</button>`,
    ...items.map((item) => {
      if (item === "ellipsis") {
        return '<span class="pagination__ellipsis" aria-hidden="true">...</span>';
      }

      return `<button class="pagination__button${item === currentPage ? " is-active" : ""}" type="button" data-page="${item}" aria-current="${item === currentPage ? "page" : "false"}">${item}</button>`;
    }),
    `<button class="pagination__button" type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Next</button>`,
  ];

  pagination.innerHTML = buttons.join("");
  pagination.classList.remove("hidden");
}

function updatePicksResultsCopy(totalMatches, totalCards, currentPage) {
  const copy = document.querySelector("[data-results-copy]");

  if (!copy) {
    return;
  }

  if (!totalCards) {
    copy.textContent = "No picks available yet.";
    return;
  }

  if (!totalMatches) {
    copy.textContent = "No picks match the current filters.";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalMatches / PICKS_PER_PAGE));
  const start = (currentPage - 1) * PICKS_PER_PAGE + 1;
  const end = Math.min(start + PICKS_PER_PAGE - 1, totalMatches);
  copy.textContent =
    totalPages > 1
      ? `Showing ${start}-${end} of ${totalMatches} picks. Page ${currentPage} of ${totalPages}.`
      : `Showing ${totalMatches} of ${totalCards} picks.`;
}

function filterPicks(state) {
  const grid = document.querySelector("[data-picks-grid]");

  if (!grid) {
    return state;
  }

  const cards = Array.from(grid.querySelectorAll("[data-pick-card]"));
  const matchingCards = cards.filter((card) => {
    const categoryMatch = !state.category || card.dataset.category === state.category;
    const priceMatch = !state.price || card.dataset.price === state.price;
    const brandMatch = !state.brand || card.dataset.brand === state.brand;
    const styleMatch = !state.style || card.dataset.style.split("|").includes(state.style);
    return categoryMatch && priceMatch && brandMatch && styleMatch;
  });

  const totalPages = Math.max(1, Math.ceil(matchingCards.length / PICKS_PER_PAGE));
  const currentPage = Math.min(state.page || 1, totalPages);
  const pageStart = (currentPage - 1) * PICKS_PER_PAGE;
  const pageCards = matchingCards.slice(pageStart, pageStart + PICKS_PER_PAGE);

  cards.forEach((card) => card.classList.add("hidden"));
  pageCards.forEach((card) => card.classList.remove("hidden"));

  updatePicksURL({ ...state, page: currentPage }, totalPages);
  updatePicksResultsCopy(matchingCards.length, cards.length, currentPage);
  renderPicksPagination(matchingCards.length, currentPage);

  return { ...state, page: currentPage };
}

function scrollPicksIntoView() {
  const results = document.querySelector("[data-results-copy]");
  if (!results) {
    return;
  }

  const top = results.getBoundingClientRect().top + window.scrollY - 120;
  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

function searchBlog(query) {
  const grid = document.querySelector("[data-blog-grid]");

  if (!grid) {
    return;
  }

  const activeCategory = document.querySelector("[data-blog-tab].is-active")?.dataset.category || "";
  const normalizedQuery = query.trim().toLowerCase();
  const cards = Array.from(grid.querySelectorAll("[data-blog-card]"));
  const visible = cards.filter((card) => {
    const categoryMatch = !activeCategory || card.dataset.category === activeCategory;
    const haystack = `${card.dataset.title}|${card.dataset.tags}`;
    const queryMatch = !normalizedQuery || haystack.includes(normalizedQuery);
    const matches = categoryMatch && queryMatch;
    card.classList.toggle("hidden", !matches);
    return matches;
  });

  const resultsCopy = document.querySelector("[data-blog-results-copy]");
  if (resultsCopy) {
    resultsCopy.textContent =
      visible.length === cards.length
        ? `Showing all ${cards.length} articles.`
        : `Showing ${visible.length} of ${cards.length} articles.`;
  }
}

function initPicksPage() {
  const grid = document.querySelector("[data-picks-grid]");

  if (!grid) {
    return;
  }

  const form = document.querySelector("[data-filter-form]");
  const pagination = document.querySelector("[data-picks-pagination]");
  let state = readPicksStateFromURL();

  syncFilterControls(state);
  state = filterPicks(state);

  form?.addEventListener("change", () => {
    state = filterPicks({
      category: form.elements.category?.value || "",
      price: form.elements.price?.value || "",
      style: form.elements.style?.value || "",
      brand: form.elements.brand?.value || "",
      page: 1,
    });
  });

  document.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    form?.reset();
    state = filterPicks({
      category: "",
      price: "",
      style: "",
      brand: "",
      page: 1,
    });
  });

  pagination?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");

    if (!button || button.disabled) {
      return;
    }

    const page = Number.parseInt(button.dataset.page || "1", 10);
    if (!Number.isFinite(page) || page < 1 || page === state.page) {
      return;
    }

    state = filterPicks({ ...state, page });
    scrollPicksIntoView();
  });
}

function initBlogPage() {
  const grid = document.querySelector("[data-blog-grid]");

  if (!grid) {
    return;
  }

  const searchInput = document.querySelector("[data-blog-search]");
  const tabs = Array.from(document.querySelectorAll("[data-blog-tab]"));
  const params = new URLSearchParams(window.location.search);
  const tabFromUrl = params.get("category") || "";
  const queryFromUrl = params.get("q") || "";

  if (searchInput) {
    searchInput.value = queryFromUrl;
  }

  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.category === tabFromUrl || (!tabFromUrl && tab.dataset.category === ""));
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("is-active"));
      tab.classList.add("is-active");

      const nextParams = new URLSearchParams(window.location.search);
      if (tab.dataset.category) {
        nextParams.set("category", tab.dataset.category);
      } else {
        nextParams.delete("category");
      }

      if (searchInput?.value.trim()) {
        nextParams.set("q", searchInput.value.trim());
      } else {
        nextParams.delete("q");
      }

      const nextQuery = nextParams.toString();
      const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
      window.history.replaceState({}, "", nextUrl);
      searchBlog(searchInput?.value || "");
    });
  });

  searchBlog(queryFromUrl);

  searchInput?.addEventListener("input", () => {
    const nextParams = new URLSearchParams(window.location.search);
    if (searchInput.value.trim()) {
      nextParams.set("q", searchInput.value.trim());
    } else {
      nextParams.delete("q");
    }

    const activeCategory = document.querySelector("[data-blog-tab].is-active")?.dataset.category || "";
    if (activeCategory) {
      nextParams.set("category", activeCategory);
    } else {
      nextParams.delete("category");
    }

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
    searchBlog(searchInput.value);
  });
}

function initNavigation() {
  const pageId = document.body.dataset.page;
  document.querySelectorAll("[data-nav-link]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.navLink === pageId);
  });

  const toggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const closeTriggers = document.querySelectorAll("[data-menu-close]");

  if (!toggle || !mobileMenu) {
    return;
  }

  const closeMenu = () => {
    document.body.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  closeTriggers.forEach((trigger) => trigger.addEventListener("click", closeMenu));
  mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

function initShareButtons() {
  document.querySelectorAll("[data-share-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      const original = button.textContent;

      try {
        await navigator.clipboard.writeText(window.location.href);
        button.textContent = "Copied URL";
      } catch {
        button.textContent = "Copy failed";
      }

      window.setTimeout(() => {
        button.textContent = original;
      }, 1800);
    });
  });
}

function initBackToTop() {
  const button = document.querySelector("[data-back-to-top]");

  if (!button) {
    return;
  }

  const onScroll = () => {
    button.classList.toggle("is-visible", window.scrollY > 400);
  };

  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initReadingProgress() {
  const progress = document.querySelector("[data-reading-progress]");
  const article = document.querySelector("[data-article-content]");

  if (!progress || !article) {
    return;
  }

  const onScroll = () => {
    const rect = article.getBoundingClientRect();
    const articleTop = window.scrollY + rect.top;
    const articleHeight = article.offsetHeight - window.innerHeight;
    const distance = Math.max(window.scrollY - articleTop, 0);
    const ratio = articleHeight <= 0 ? 1 : Math.min(distance / articleHeight, 1);
    progress.style.width = `${ratio * 100}%`;
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) {
        return;
      }

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function initLazyImageFallback() {
  if ("loading" in HTMLImageElement.prototype) {
    return;
  }

  const images = Array.from(document.querySelectorAll("img[data-src]"));
  if (!images.length) {
    return;
  }

  const loadImage = (image) => {
    image.src = image.dataset.src;
    image.removeAttribute("data-src");
  };

  if (!("IntersectionObserver" in window)) {
    images.forEach(loadImage);
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      loadImage(entry.target);
      currentObserver.unobserve(entry.target);
    });
  });

  images.forEach((image) => observer.observe(image));
}

document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initPicksPage();
  initBlogPage();
  initShareButtons();
  initBackToTop();
  initReadingProgress();
  initSmoothScroll();
  initLazyImageFallback();
});
