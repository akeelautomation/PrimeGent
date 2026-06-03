const PICKS_PER_PAGE = 10;
const STYLE_MATCH_LANES = {
  evening: {
    title: "Evening Out",
    copy: "A sharper casual lane built around controlled fit, darker anchors, and one polished detail.",
    chips: ["Dinner-ready", "Clean layers", "Quiet polish"],
    picksUrl: "./picks.html?style=smart-casual",
    image: "./static/images/style-match-evening-out.png",
    imageAlt: "Evening Out outfit with dark knitwear, tailored trousers, and brown loafers",
    articles: [
      { title: "Casual Dinner Outfits for Men That Do Not Feel Overdressed", url: "./blog-dinner-outfits-men.html" },
      { title: "Smart Casual Summer Night Outfits for Men", url: "./blog-smart-casual-summer-night-men.html" },
      {
        title: "Casual Men Outfit Ideas for Weekends, Errands, and Easy Dinners",
        url: "./blog-casual-men-outfit-ideas-weekends-errands-dinners.html",
      },
      { title: "Loafer Outfits for Men", url: "./blog-loafer-outfits-men.html" },
    ],
  },
  travel: {
    title: "Travel Ready",
    copy: "A practical lane for movement, comfort, and layers that still look intentional after a long day.",
    chips: ["Easy layers", "Clean comfort", "Packable pieces"],
    picksUrl: "./picks.html?style=travel",
    image: "./static/images/style-match-travel-ready.png",
    imageAlt: "Travel Ready outfit with light layers, a travel jacket, trousers, and clean sneakers",
    articles: [
      { title: "Casual Travel Outfits for Men", url: "./blog-casual-travel-outfits-men.html" },
      { title: "Airport Outfits for Men", url: "./blog-airport-outfits-men.html" },
      { title: "Relaxed Weekend Outfits for Men That Still Look Sharp", url: "./blog-relaxed-weekend-outfits-men.html" },
      { title: "Rainy Day Style for Men Without Looking Overbuilt", url: "./blog-rainy-day-style-men.html" },
    ],
  },
  office: {
    title: "Office Casual",
    copy: "A work-ready lane that softens the dress code without losing structure, proportion, or capable polish.",
    chips: ["Workday shape", "Soft structure", "Refined basics"],
    picksUrl: "./picks.html?style=office",
    image: "./static/images/style-match-office-casual.png",
    imageAlt: "Office Casual outfit with a blazer, knit polo, chinos, and loafers",
    articles: [
      { title: "Casual Office Outfits for Men", url: "./blog-casual-office-outfits-men.html" },
      { title: "Casual Friday Outfits for Men", url: "./blog-casual-friday-outfits-men.html" },
      {
        title: "White Sneakers Business Casual Men",
        url: "./blog-white-sneakers-business-casual-men.html",
      },
      { title: "Fall Business Casual Men", url: "./blog-fall-business-casual-men.html" },
    ],
  },
  weekend: {
    title: "Weekend Uniform",
    copy: "A low-effort lane for relaxed plans, built from familiar pieces that still keep shape.",
    chips: ["Repeatable", "Relaxed shape", "Off-duty"],
    picksUrl: "./picks.html?style=weekend",
    image: "./static/images/style-match-weekend-uniform.png",
    imageAlt: "Weekend Uniform outfit with denim, a relaxed overshirt, and casual sneakers",
    articles: [
      { title: "Weekend Casual Outfits for Men", url: "./blog-weekend-casual-outfits-men.html" },
      { title: "A Spring Weekend Uniform for Men That Works Every Time", url: "./blog-spring-weekend-uniform-men.html" },
      { title: "Relaxed Weekend Outfits for Men That Still Look Sharp", url: "./blog-relaxed-weekend-outfits-men.html" },
      { title: "Casual Brunch Outfits for Men", url: "./blog-casual-brunch-outfits-men.html" },
    ],
  },
  warm: {
    title: "Warm Weather Smart Casual",
    copy: "A breathable lane that keeps summer outfits crisp through linen, lighter colors, and cleaner proportions.",
    chips: ["Breathable", "Summer polish", "Light texture"],
    picksUrl: "./picks.html?style=smart-casual",
    image: "./static/images/style-match-warm-weather.png",
    imageAlt: "Warm Weather Smart Casual outfit with linen, light trousers, and summer loafers",
    articles: [
      { title: "Linen Shirt Outfits for Men That Look Clean, Not Crumpled", url: "./blog-linen-shirt-outfits-men.html" },
      { title: "Linen Shirt Outfit Ideas for Men", url: "./blog-linen-shirt-outfit-ideas-for-men.html" },
      { title: "Summer Mens Outfits", url: "./blog-summer-mens-outfits.html" },
      {
        title: "Warm Weather Casual Outfits Men Linen Light Sneakers",
        url: "./blog-warm-weather-casual-outfits-men-linen-light-sneakers.html",
      },
    ],
  },
  smart: {
    title: "Smart Casual",
    copy: "A balanced lane for cleaner daily dressing when you want polish without looking formal.",
    chips: ["Balanced", "Versatile", "Clean basics"],
    picksUrl: "./picks.html?style=smart-casual",
    image: "./static/images/style-match-smart-casual.png",
    imageAlt: "Smart Casual outfit with a textured jacket, knitwear, chinos, and leather sneakers",
    articles: [
      { title: "Smart Casual Explained", url: "./blog-smart-casual-explained.html" },
      {
        title: "Smart Casual Outfit Formulas for Modern Men",
        url: "./blog-smart-casual-outfit-formulas-for-modern-men.html",
      },
      { title: "Mastering the Modern Smart Casual Look", url: "./blog-mastering-the-modern-smart-casual-look.html" },
      {
        title: "Smart Casual Sweater and Chinos Outfit",
        url: "./blog-smart-casual-sweater-and-chinos-outfit.html",
      },
    ],
  },
};

const lastStyleMatchArticleByLane = {};
const STYLE_MATCH_BEST_KEY = "primegentStyleMatchBest";
const STYLE_MATCH_CATEGORY_LABELS = {
  occasion: "occasion",
  sharpness: "sharpness",
  "first-reach": "key piece",
  fit: "fit",
  weather: "weather",
};
const STYLE_MATCH_SCORE_PROFILES = {
  evening: {
    occasion: { primary: ["evening-out"], acceptable: ["weekend", "workday"] },
    sharpness: { primary: ["polished"], acceptable: ["smart-casual"] },
    "first-reach": { primary: ["knitwear"], acceptable: ["light-layers", "denim"] },
    fit: { primary: ["clean-slim"], acceptable: ["relaxed-shaped"] },
    weather: { primary: ["cool", "mild"], acceptable: ["warm", "rainy"] },
  },
  travel: {
    occasion: { primary: ["travel"], acceptable: ["weekend"] },
    sharpness: { primary: ["relaxed", "smart-casual"], acceptable: ["polished"] },
    "first-reach": { primary: ["light-layers"], acceptable: ["denim", "knitwear"] },
    fit: { primary: ["relaxed-shaped"], acceptable: ["roomy-easy"] },
    weather: { primary: ["rainy", "cool"], acceptable: ["mild"] },
  },
  office: {
    occasion: { primary: ["workday"], acceptable: ["evening-out"] },
    sharpness: { primary: ["polished"], acceptable: ["smart-casual"] },
    "first-reach": { primary: ["knitwear"], acceptable: ["light-layers"] },
    fit: { primary: ["clean-slim"], acceptable: ["relaxed-shaped"] },
    weather: { primary: ["mild", "cool"], acceptable: ["rainy"] },
  },
  weekend: {
    occasion: { primary: ["weekend"], acceptable: ["travel"] },
    sharpness: { primary: ["relaxed"], acceptable: ["smart-casual"] },
    "first-reach": { primary: ["denim"], acceptable: ["light-layers", "knitwear"] },
    fit: { primary: ["roomy-easy", "relaxed-shaped"], acceptable: ["clean-slim"] },
    weather: { primary: ["mild", "cool"], acceptable: ["warm", "rainy"] },
  },
  warm: {
    occasion: { primary: ["weekend"], acceptable: ["travel", "evening-out"] },
    sharpness: { primary: ["smart-casual"], acceptable: ["polished", "relaxed"] },
    "first-reach": { primary: ["linen"], acceptable: ["light-layers"] },
    fit: { primary: ["clean-slim", "relaxed-shaped"], acceptable: ["roomy-easy"] },
    weather: { primary: ["warm"], acceptable: ["mild"] },
  },
  smart: {
    occasion: { primary: ["weekend", "workday"], acceptable: ["evening-out"] },
    sharpness: { primary: ["smart-casual"], acceptable: ["polished"] },
    "first-reach": { primary: ["knitwear", "light-layers"], acceptable: ["denim", "linen"] },
    fit: { primary: ["clean-slim", "relaxed-shaped"], acceptable: ["roomy-easy"] },
    weather: { primary: ["mild"], acceptable: ["cool", "warm"] },
  },
};

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

function getStyleMatchLaneKey(answers) {
  if (answers.occasion === "evening-out") {
    return "evening";
  }

  if (answers.occasion === "travel") {
    return "travel";
  }

  if (answers.occasion === "workday" || answers.sharpness === "polished") {
    return "office";
  }

  if (answers.weather === "warm" || answers["first-reach"] === "linen") {
    return "warm";
  }

  if (
    answers.sharpness === "relaxed" ||
    answers.fit === "roomy-easy" ||
    (answers.occasion === "weekend" && ["denim", "light-layers"].includes(answers["first-reach"]))
  ) {
    return "weekend";
  }

  return "smart";
}

function pickStyleMatchArticle(laneKey) {
  const lane = STYLE_MATCH_LANES[laneKey] || STYLE_MATCH_LANES.smart;
  const previousUrl = lastStyleMatchArticleByLane[laneKey];
  const articlePool =
    lane.articles.length > 1 && previousUrl
      ? lane.articles.filter((article) => article.url !== previousUrl)
      : lane.articles;
  const article = articlePool[Math.floor(Math.random() * articlePool.length)] || lane.articles[0];
  lastStyleMatchArticleByLane[laneKey] = article.url;
  return article;
}

function getStyleMatchTier(score) {
  if (score >= 90) return "Locked in";
  if (score >= 75) return "Strong match";
  if (score >= 60) return "One tweak away";
  return "Experimental fit";
}

function getStyleMatchBest() {
  try {
    const stored = Number.parseInt(window.sessionStorage.getItem(STYLE_MATCH_BEST_KEY) || "0", 10);
    return Number.isFinite(stored) ? stored : 0;
  } catch {
    return 0;
  }
}

function setStyleMatchBest(score) {
  try {
    window.sessionStorage.setItem(STYLE_MATCH_BEST_KEY, String(score));
  } catch {
    // Session storage is optional; the game should still work without it.
  }
}

function scoreStyleMatch(laneKey, answers) {
  const profile = STYLE_MATCH_SCORE_PROFILES[laneKey] || STYLE_MATCH_SCORE_PROFILES.smart;
  const breakdown = Object.keys(STYLE_MATCH_CATEGORY_LABELS).map((key) => {
    const rule = profile[key] || { primary: [], acceptable: [] };
    const answer = answers[key];
    const points = rule.primary.includes(answer) ? 20 : rule.acceptable.includes(answer) ? 14 : 8;

    return {
      key,
      label: STYLE_MATCH_CATEGORY_LABELS[key],
      points,
    };
  });
  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  const strongest = breakdown.reduce((best, item) => (item.points > best.points ? item : best), breakdown[0]);
  const weakest = breakdown.reduce((low, item) => (item.points < low.points ? item : low), breakdown[0]);

  return { total, breakdown, strongest, weakest };
}

function initStyleMatchGame() {
  const game = document.querySelector("[data-style-match]");

  if (!game) {
    return;
  }

  const questions = Array.from(game.querySelectorAll("[data-style-match-question]"));
  const progressLabel = game.querySelector("[data-style-match-progress-label]");
  const progressBar = game.querySelector("[data-style-match-progress-bar]");
  const feedback = game.querySelector("[data-style-match-feedback]");
  const backButton = game.querySelector("[data-style-match-back]");
  const emptyState = game.querySelector("[data-style-match-empty]");
  const readyState = game.querySelector("[data-style-match-ready]");
  const title = game.querySelector("[data-style-match-title]");
  const copy = game.querySelector("[data-style-match-copy]");
  const chips = game.querySelector("[data-style-match-chips]");
  const resultImage = game.querySelector("[data-style-match-image]");
  const scoreValue = game.querySelector("[data-style-match-score]");
  const scoreBar = game.querySelector("[data-style-match-score-bar]");
  const tier = game.querySelector("[data-style-match-tier]");
  const bestScore = game.querySelector("[data-style-match-best]");
  const coach = game.querySelector("[data-style-match-coach]");
  const articleTitle = game.querySelector("[data-style-match-article-title]");
  const articleLink = game.querySelector("[data-style-match-article]");
  const picksLink = game.querySelector("[data-style-match-picks]");
  const resetButton = game.querySelector("[data-style-match-reset]");
  const answers = {};
  let currentStep = 0;
  let advanceTimer;
  let scoreAnimationFrame;

  const answeredCount = () => Object.keys(answers).length;

  const setScoreDisplay = (score) => {
    if (scoreValue) scoreValue.textContent = String(score);
    if (scoreBar) scoreBar.style.width = `${score}%`;
  };

  const animateScore = (targetScore) => {
    window.cancelAnimationFrame(scoreAnimationFrame);
    const start = window.performance.now();
    const duration = 700;

    const tick = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const current = Math.round(targetScore * eased);

      setScoreDisplay(current);

      if (progress < 1) {
        scoreAnimationFrame = window.requestAnimationFrame(tick);
      }
    };

    setScoreDisplay(0);
    scoreAnimationFrame = window.requestAnimationFrame(tick);
  };

  const setFeedback = (message, isActive = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-active", isActive);
  };

  const renderStep = (message = "Make your next move.") => {
    const total = questions.length || 1;
    const progress = Math.max(answeredCount(), currentStep) / total;

    questions.forEach((question, index) => {
      const isActive = index === currentStep;
      const key = question.dataset.question;

      question.hidden = !isActive;
      question.classList.toggle("is-active", isActive);
      question.querySelectorAll("[data-style-choice]").forEach((choice) => {
        const selected = answers[key] === choice.dataset.styleChoice;
        choice.classList.toggle("is-selected", selected);
        choice.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    });

    if (progressLabel) progressLabel.textContent = `${Math.min(currentStep + 1, total)}/${total}`;
    if (progressBar) progressBar.style.width = `${Math.round(progress * 100)}%`;
    if (backButton) backButton.disabled = currentStep === 0;
    setFeedback(message, false);
    emptyState?.classList.remove("hidden");
    readyState?.classList.add("hidden");
  };

  const renderResult = () => {
    if (Object.keys(answers).length !== questions.length) {
      renderStep("Finish the five moves to lock your score.");
      return;
    }

    const laneKey = getStyleMatchLaneKey(answers);
    const lane = STYLE_MATCH_LANES[laneKey] || STYLE_MATCH_LANES.smart;
    const article = pickStyleMatchArticle(laneKey);
    const scored = scoreStyleMatch(laneKey, answers);
    const previousBest = getStyleMatchBest();
    const nextBest = Math.max(previousBest, scored.total);

    if (nextBest !== previousBest) {
      setStyleMatchBest(nextBest);
    }

    if (title) title.textContent = lane.title;
    if (copy) copy.textContent = lane.copy;
    if (chips) {
      chips.innerHTML = lane.chips.map((chip) => `<span class="tag">${chip}</span>`).join("");
    }
    if (resultImage) {
      resultImage.src = lane.image;
      resultImage.alt = lane.imageAlt || `${lane.title} outfit recommendation`;
    }
    if (articleTitle) articleTitle.textContent = article.title;
    if (articleLink) articleLink.href = article.url;
    if (picksLink) picksLink.href = lane.picksUrl;
    if (tier) tier.textContent = getStyleMatchTier(scored.total);
    if (bestScore) bestScore.textContent = String(nextBest);
    if (coach) {
      const weakNote =
        scored.weakest.points === 20 ? "no weak category" : scored.weakest.label;
      coach.textContent = `Strongest category: ${scored.strongest.label}. Biggest tweak: ${weakNote}.`;
    }
    if (progressLabel) progressLabel.textContent = `${questions.length}/${questions.length}`;
    if (progressBar) progressBar.style.width = "100%";
    animateScore(scored.total);

    emptyState?.classList.add("hidden");
    readyState?.classList.remove("hidden");
    setFeedback("Score locked. Try again to beat it.", true);
  };

  questions.forEach((question) => {
    const key = question.dataset.question;
    const choices = Array.from(question.querySelectorAll("[data-style-choice]"));

    choices.forEach((choice) => {
      choice.addEventListener("click", () => {
        window.clearTimeout(advanceTimer);
        choices.forEach((item) => {
          item.classList.remove("is-selected");
          item.setAttribute("aria-pressed", "false");
        });

        choice.classList.add("is-selected");
        choice.setAttribute("aria-pressed", "true");
        answers[key] = choice.dataset.styleChoice;
        setFeedback(choice.dataset.styleFeedback || "Good move.", true);

        if (answeredCount() === questions.length && currentStep === questions.length - 1) {
          advanceTimer = window.setTimeout(renderResult, 280);
          return;
        }

        if (currentStep < questions.length - 1) {
          advanceTimer = window.setTimeout(() => {
            currentStep += 1;
            renderStep("Make your next move.");
          }, 280);
        }
      });
    });
  });

  backButton?.addEventListener("click", () => {
    window.clearTimeout(advanceTimer);

    if (currentStep > 0) {
      currentStep -= 1;
      renderStep("Change the previous move.");
    }
  });

  resetButton?.addEventListener("click", () => {
    window.clearTimeout(advanceTimer);
    window.cancelAnimationFrame(scoreAnimationFrame);
    Object.keys(answers).forEach((key) => delete answers[key]);
    game.querySelectorAll("[data-style-choice]").forEach((choice) => {
      choice.classList.remove("is-selected");
      choice.setAttribute("aria-pressed", "false");
    });
    currentStep = 0;
    setScoreDisplay(0);
    renderStep("Make your first move.");
  });

  if (bestScore) bestScore.textContent = String(getStyleMatchBest());
  setScoreDisplay(0);
  renderStep("Make your first move.");
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
  initStyleMatchGame();
  initShareButtons();
  initBackToTop();
  initReadingProgress();
  initSmoothScroll();
  initLazyImageFallback();
});
