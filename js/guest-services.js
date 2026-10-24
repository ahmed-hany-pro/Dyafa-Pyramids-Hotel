// ==========================================
// HOTEL SERVICES APP - JAVASCRIPT
// ==========================================

// ==========================================
// CONFIGURATION
// ==========================================

const EMAIL_CONFIG = {
  // Paste your Google Apps Script Web App URL here (see google-apps-script/Code.gs)
  scriptUrl:
    "https://script.google.com/macros/s/AKfycbza5etEgjfpLhZsLCGVKTCPFg3KNQZEjE-OFJz170afPq0TcbThaDiooageuz5L2mG9LQ/exec",
  user: "ahhasa842@gmail.com",
  // Orders are delivered to ahhasa842@gmail.com (set in Code.gs -> NOTIFY_EMAIL)
  recipients: {
    food: "ahhasa842@gmail.com",
    tour: "ahhasa842@gmail.com",
    laundry: "ahhasa842@gmail.com",
    housekeeping: "ahhasa842@gmail.com",
  },
};

// Food menu prices are shown in "$" but Reception bills are in EGP.
// Set this to today's rate (e.g. 50) to convert food orders automatically; 1 = no conversion.
const FOOD_USD_TO_EGP = 1;

const GOOGLE_SHEETS_CONFIG = {
  webAppUrl:
    "https://script.google.com/macros/s/AKfycbza5etEgjfpLhZsLCGVKTCPFg3KNQZEjE-OFJz170afPq0TcbThaDiooageuz5L2mG9LQ/exec",
  enableLogging: true,
};

// ==========================================
// THEME (LIGHT / DARK)
// ==========================================
function initializeTheme() {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");

  // Load saved theme, else follow system preference
  const saved = localStorage.getItem("theme");
  const prefersLight =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches;

  const initialTheme = saved || (prefersLight ? "light" : "dark");
  setTheme(initialTheme);

  if (btn) {
    btn.addEventListener("click", () => {
      const current =
        root.getAttribute("data-theme") === "light" ? "light" : "dark";
      const next = current === "light" ? "dark" : "light";
      setTheme(next);
      localStorage.setItem("theme", next);
    });
  }

  function setTheme(theme) {
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      // Default theme is dark (your CSS uses :root for dark)
      root.removeAttribute("data-theme");
    }
    updateThemeIcon();
  }

  function updateThemeIcon() {
    if (!btn) return;
    const isLight = root.getAttribute("data-theme") === "light";
    btn.innerHTML = isLight
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';
  }
}

// ==========================================
// GLOBAL STATE
// ==========================================

let cart = [];
let currentTab = "food";
let menuLayout = localStorage.getItem("menuLayout") || "grid";
let pendingEmailData = null;

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  initializeTheme();
  initializeSplashScreen();
  initializeTabs();
  initializeMenu();
  initializeForms();
  initializeCheckboxes();
  initializeLaundry();
  initializeSearch();
  updateCartDisplay();
  setMinimumDates();
});

// ==========================================
// SPLASH SCREEN
// ==========================================

function initializeSplashScreen() {
  const splashScreen = document.getElementById("splashScreen");
  if (!splashScreen) return;

  let hidden = false;
  const stopDust = startSplashDust(splashScreen);
  const hide = () => {
    if (hidden) return;
    hidden = true;
    setTimeout(stopDust, 900);
    splashScreen.classList.add("fade-out");
    setTimeout(() => {
      splashScreen.style.display = "none";
    }, 900);
  };

  const timer = setTimeout(hide, 3200);

  // tap / click / Escape to skip
  splashScreen.addEventListener("click", () => {
    clearTimeout(timer);
    hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearTimeout(timer);
      hide();
    }
  });
}

// Floating gold dust behind the splash (cheap canvas, stops when splash closes)
function startSplashDust(splash) {
  const canvas = splash.querySelector(".splash-dust");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return () => {};
  const ctx = canvas.getContext("2d");
  let w = 0,
    h = 0,
    raf = 0,
    running = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const light = document.documentElement.getAttribute("data-theme") === "light";
  const rgb = light ? "184,145,42" : "246,224,138";

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const count = w < 600 ? 35 : 70;
  const mk = (initial) => ({
    x: Math.random() * w,
    y: initial ? Math.random() * h : h + 10,
    r: Math.random() * 1.8 + 0.4,
    vy: Math.random() * 0.35 + 0.12,
    vx: (Math.random() - 0.5) * 0.15,
    a: Math.random() * 0.6 + 0.2,
    t: Math.random() * Math.PI * 2,
  });
  const dots = Array.from({ length: count }, () => mk(true));

  const frame = () => {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.y -= d.vy;
      d.x += d.vx + Math.sin((d.t += 0.01)) * 0.15;
      if (d.y < -10) Object.assign(d, mk(false));
      const fade = Math.min(1, (h - d.y) / 120, d.y / 120);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${rgb},${(d.a * Math.max(fade, 0)).toFixed(3)})`;
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  frame();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}

// ==========================================
// TAB NAVIGATION
// ==========================================

function initializeTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab");
      switchTab(targetTab);
    });
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.remove("active");
  });
  document.getElementById(tabName).classList.add("active");

  currentTab = tabName;
}

// ==========================================
// MENU FUNCTIONALITY
// ==========================================

function initializeMenu() {
  enhanceMenuWithImages();
  attachMenuImageListeners();
  addCategoryHeaders(); // Add headers to categories
  setupCategoryButtons();
  setupLayoutButtons();
  setupAddButtons();
  applyMenuLayout();
  runAdjustHeightsDeferred();

  // ADD THIS LINE:
  applyMenuVisibilitySettings();
}

// Add category headers to each menu-category section
function addCategoryHeaders() {
  const categories = document.querySelectorAll(".menu-category");

  categories.forEach((category) => {
    const categoryName = category.getAttribute("data-category");

    // Skip if header already exists
    if (category.querySelector(".category-header")) {
      return;
    }

    // Create header element
    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `<h3>${categoryName}</h3>`;

    // Insert at the beginning of the category
    category.insertBefore(header, category.firstChild);
  });
}

function enhanceMenuWithImages() {
  const menuItems = document.querySelectorAll(".menu-item");

  menuItems.forEach((item) => {
    const categoryWrapper = item.closest(".menu-category");
    const category = categoryWrapper?.getAttribute("data-category") || "";
    const nameElement = item.querySelector(".item-info h4");
    const itemName = nameElement?.textContent.trim() || "";

    const inlineImg = item.querySelector("img[data-item-image], img.item-src");
    const desiredSrc = getImageUrl(item, itemName, category);

    let imageDiv = item.querySelector(".item-image");
    if (!imageDiv) {
      imageDiv = document.createElement("div");
      imageDiv.className = "item-image";
      item.prepend(imageDiv);
    }

    if (inlineImg && !imageDiv.contains(inlineImg)) {
      imageDiv.querySelectorAll("img").forEach((n) => n.remove());
      imageDiv.appendChild(inlineImg);
    }

    let primaryImg = imageDiv.querySelector("img");
    if (!primaryImg) {
      primaryImg = document.createElement("img");
      imageDiv.appendChild(primaryImg);
    }

    if (desiredSrc) {
      primaryImg.src = desiredSrc;
      primaryImg.alt = itemName || category || "Menu item";
      primaryImg.loading = "lazy";
    } else if (!primaryImg.src) {
      primaryImg.remove();
    }

    item.querySelectorAll(":scope > img").forEach((stray) => {
      if (!imageDiv.contains(stray)) {
        imageDiv.appendChild(stray);
      }
    });

    const imgsInside = imageDiv.querySelectorAll("img");
    if (imgsInside.length > 1) {
      imgsInside.forEach((imgEl, idx) => {
        if (idx > 0) imgEl.remove();
      });
    }

    if (!item.querySelector(".item-body")) {
      const bodyDiv = document.createElement("div");
      bodyDiv.className = "item-body";

      const footerDiv = document.createElement("div");
      footerDiv.className = "item-footer";

      const info = item.querySelector(".item-info");
      const price = item.querySelector(".item-price");
      const addBtn = item.querySelector(".add-btn");

      if (info) {
        const title = info.querySelector("h4");
        if (title) {
          title.classList.add("item-title");
          const subtitle = document.createElement("div");
          subtitle.className = "item-subtitle";
          subtitle.textContent = category || "";
          title.insertAdjacentElement("afterend", subtitle);
        }
        bodyDiv.appendChild(info);
      }
      if (price) footerDiv.appendChild(price);
      if (addBtn) footerDiv.appendChild(addBtn);

      item.appendChild(bodyDiv);
      item.appendChild(footerDiv);
    }
  });
}

function getImageUrl(item, itemName, category) {
  if (item.dataset?.image) return item.dataset.image.trim();

  const inlineImg = item.querySelector("img[data-item-image], img.item-src");
  if (inlineImg?.src) return inlineImg.src;

  return null;
}

function setupCategoryButtons() {
  const categoryButtons = document.querySelectorAll(".category-btn");

  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.getAttribute("data-category");
      switchCategory(category);
    });
  });

  // Default to "All" category to show all items
  switchCategory("All");
}

function switchCategory(category) {
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(`[data-category="${category}"]`)
    .classList.add("active");

  // Handle "All" category - show all menu items from all categories
  if (category === "All") {
    document.querySelectorAll(".menu-category").forEach((panel) => {
      panel.classList.add("active");
      panel.style.display = ""; // Make sure it's visible
    });
    applyMenuLayout();
    runAdjustHeightsDeferred();
    return;
  }

  // For specific categories, hide all others and show only the selected one
  document.querySelectorAll(".menu-category").forEach((panel) => {
    panel.classList.remove("active");
  });

  const activePanel = document.querySelector(
    `.menu-category[data-category="${category}"]`,
  );

  if (activePanel) {
    activePanel.classList.add("active");
    applyMenuLayout();
    // Reset scroll position only when category changes
    activePanel.scrollTo({ left: 0, behavior: "smooth" });
    runAdjustHeightsDeferred();
  }
}

function setupLayoutButtons() {
  document.addEventListener("click", (e) => {
    const layoutBtn = e.target.closest(".layout-btn");
    if (layoutBtn) {
      menuLayout = layoutBtn.dataset.layout || "grid";
      localStorage.setItem("menuLayout", menuLayout);

      // Check if search is active
      const searchInput = document.getElementById("menuSearch");
      const isSearchActive = searchInput && searchInput.value.trim() !== "";

      if (isSearchActive) {
        // Re-trigger search to apply new layout
        handleSearch({ target: searchInput });
      } else {
        applyMenuLayout(false);
        // Reset scroll when switching TO carousel layout and NOT searching
        const activePanel = getActivePanel();
        if (activePanel && menuLayout === "carousel") {
          activePanel.scrollTo({ left: 0, behavior: "smooth" });
        }
      }
      runAdjustHeightsDeferred();
    }

    const prev = e.target.closest(".scroller-prev");
    const next = e.target.closest(".scroller-next");
    if (prev || next) {
      const active = getActivePanel();
      if (!active) return;
      const amount = Math.max(180, active.clientWidth - 40);
      if (prev) active.scrollBy({ left: -amount, behavior: "smooth" });
      if (next) active.scrollBy({ left: amount, behavior: "smooth" });
    }
  });
}

function getActivePanel() {
  return document.querySelector(".menu-category.active");
}

function getActivePanels() {
  return document.querySelectorAll(".menu-category.active");
}

function isAllCategoryActive() {
  const allBtn = document.querySelector('.category-btn[data-category="All"]');
  return allBtn && allBtn.classList.contains("active");
}

function applyMenuLayout(isSearchActive = false) {
  const panels = document.querySelectorAll(".menu-category");

  panels.forEach((panel) => {
    panel.classList.remove("horizontal");
    panel.style.display = "";
  });

  document.querySelectorAll(".layout-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layout === menuLayout);
  });

  const isAllActive = isAllCategoryActive();
  const activePanels = isAllActive ? getActivePanels() : [getActivePanel()];

  // Remove any existing combined carousel container
  const existingCombined = document.querySelector(
    ".combined-carousel-container",
  );
  if (existingCombined) {
    existingCombined.remove();
  }

  if (menuLayout === "carousel") {
    // Special handling for "All" category in carousel - combine into one row
    if (isAllActive && !isSearchActive) {
      createCombinedCarousel();
      // Hide individual category panels
      panels.forEach((panel) => {
        panel.style.display = "none";
      });
    } else {
      // Normal carousel behavior
      panels.forEach((panel) => {
        // Always hide category header in carousel mode
        const header = panel.querySelector(".category-header");
        if (header) header.style.display = "none";

        // During search, show all categories with visible items
        if (isSearchActive) {
          const hasVisibleItems = Array.from(
            panel.querySelectorAll(".menu-item"),
          ).some((item) => !item.classList.contains("hidden"));

          if (hasVisibleItems) {
            panel.style.display = "flex";
            panel.classList.add("horizontal");
          } else {
            panel.style.display = "none";
          }
        } else {
          // Normal behavior: only show single active category
          if (activePanels.includes(panel)) {
            panel.style.display = "flex";
            panel.classList.add("horizontal");
          } else {
            panel.style.display = "none";
          }
        }
      });
    }
  } else {
    // Grid layout - show category headers
    panels.forEach((panel) => {
      const header = panel.querySelector(".category-header");
      if (header) {
        header.style.display = isAllActive || isSearchActive ? "block" : "none";
      }

      // During search, show all categories with visible items
      if (isSearchActive) {
        const hasVisibleItems = Array.from(
          panel.querySelectorAll(".menu-item"),
        ).some((item) => !item.classList.contains("hidden"));

        if (hasVisibleItems) {
          panel.style.display = "";
        } else {
          panel.style.display = "none";
        }
      } else if (isAllActive) {
        // "All" category: show all active panels in grid
        if (panel.classList.contains("active")) {
          panel.style.display = "";
        } else {
          panel.style.display = "none";
        }
      } else {
        // Normal behavior: show only active panel, hide header
        if (activePanels.includes(panel)) {
          panel.style.display = "";
        } else {
          panel.style.display = "none";
        }
      }
    });
  }
}

// Create a combined carousel container with all items from all categories
function createCombinedCarousel() {
  const menuItemsContainer = document.querySelector(".menu-items");
  if (!menuItemsContainer) return;

  // Create combined container
  const combinedContainer = document.createElement("div");
  combinedContainer.className =
    "combined-carousel-container menu-category horizontal active";

  // Get all active categories
  const activeCategories = document.querySelectorAll(".menu-category.active");

  // Collect all menu items from all active categories
  activeCategories.forEach((category) => {
    const items = category.querySelectorAll(".menu-item");
    items.forEach((item) => {
      // Clone the item to avoid moving the original
      const clonedItem = item.cloneNode(true);

      // Re-attach event listeners for add buttons
      const addBtn = clonedItem.querySelector(".add-btn");
      if (addBtn) {
        const name = addBtn.getAttribute("data-name");
        const price = parseFloat(addBtn.getAttribute("data-price"));
        addBtn.addEventListener("click", () => {
          addToCart(name, price);
        });
      }

      combinedContainer.appendChild(clonedItem);
    });
  });

  // Insert the combined container at the beginning of menu-items
  menuItemsContainer.insertBefore(
    combinedContainer,
    menuItemsContainer.firstChild,
  );
}

function setupAddButtons() {
  const addButtons = document.querySelectorAll(".add-btn");

  addButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.getAttribute("data-name");
      const price = parseFloat(button.getAttribute("data-price"));
      addToCart(name, price);
    });
  });
}

// ==========================================
// CART FUNCTIONALITY
// ==========================================

function addToCart(name, price) {
  const existingItem = cart.find((item) => item.name === name);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ name, price, quantity: 1 });
  }

  updateCartDisplay();
  showSuccessMessage(`${name} added to cart!`);
}

function removeFromCart(name) {
  cart = cart.filter((item) => item.name !== name);
  updateCartDisplay();
}

function updateQuantity(name, change) {
  const item = cart.find((item) => item.name === name);
  if (item) {
    item.quantity += change;
    if (item.quantity <= 0) {
      removeFromCart(name);
    } else {
      updateCartDisplay();
    }
  }
}

function updateCartDisplay() {
  const cartItems = document.getElementById("cartItems");
  const totalPrice = document.getElementById("totalPrice");
  const placeOrderBtn = document.getElementById("placeOrderBtn");

  // Update floating button badge
  const floatingBadge = document.getElementById("floatingOrderBadge");
  if (floatingBadge) {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems > 0) {
      floatingBadge.textContent = totalItems;
      floatingBadge.style.display = "flex";
    } else {
      floatingBadge.style.display = "none";
    }
  }

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
    totalPrice.textContent = "0.00";
    placeOrderBtn.disabled = true;
    return;
  }

  let cartHTML = "";
  let total = 0;

  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;

    cartHTML += `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${itemTotal.toFixed(2)} $</div>
        </div>
        <div class="cart-item-controls">
          <button class="quantity-btn" onclick="updateQuantity('${
            item.name
          }', -1)">-</button>
          <span class="quantity">${item.quantity}</span>
          <button class="quantity-btn" onclick="updateQuantity('${
            item.name
          }', 1)">+</button>
        </div>
      </div>
    `;
  });

  cartItems.innerHTML = cartHTML;
  totalPrice.textContent = total.toFixed(2);
  placeOrderBtn.disabled = false;
}

// ==========================================
// FORMS
// ==========================================

function initializeForms() {
  document
    .getElementById("placeOrderBtn")
    .addEventListener("click", handleFoodOrder);

  const tourFormEl = document.getElementById("tourForm");
  if (tourFormEl) tourFormEl.addEventListener("submit", handleTourForm);

  document
    .getElementById("laundryForm")
    .addEventListener("submit", handleLaundryForm);

  document
    .getElementById("housekeepingForm")
    .addEventListener("submit", handleHousekeepingForm);
}

function initializeCheckboxes() {
  const immediateServiceCheckbox = document.getElementById("immediateService");
  const dateTimeFields = document.getElementById("dateTimeFields");
  const timeField = document.getElementById("timeField");
  const cleaningDate = document.getElementById("cleaningDate");
  const cleaningTime = document.getElementById("cleaningTime");

  if (immediateServiceCheckbox) {
    immediateServiceCheckbox.addEventListener("change", function () {
      if (this.checked) {
        dateTimeFields.style.display = "none";
        timeField.style.display = "none";
        cleaningDate.removeAttribute("required");
        cleaningTime.removeAttribute("required");
      } else {
        dateTimeFields.style.display = "block";
        timeField.style.display = "block";
        cleaningDate.setAttribute("required", "required");
        cleaningTime.setAttribute("required", "required");
      }
    });
  }

  const needGuideCheckbox = document.getElementById("tourNeedGuide");
  const languageGroup = document.getElementById("tourGuideLanguageGroup");

  if (needGuideCheckbox && languageGroup) {
    needGuideCheckbox.addEventListener("change", () => {
      languageGroup.style.display = needGuideCheckbox.checked
        ? "block"
        : "none";
      if (!needGuideCheckbox.checked) {
        document.getElementById("tourGuideLanguage").value = "";
      }
    });
  }
}

// ==========================================
// LAUNDRY
// ==========================================

const LAUNDRY_ITEMS = [
  {
    name: "Shirt / Blouse",
    services: {
      laundry: 20,
      dryCleaning: 40,
      pressing: 15,
    },
  },
  {
    name: "T-Shirt",
    services: {
      laundry: 20,
      dryCleaning: 40,
      pressing: 15,
    },
  },
  {
    name: "Pullover",
    services: {
      laundry: 25,
      dryCleaning: 50,
      pressing: 20,
    },
  },
  {
    name: "Trousers / Shirt",
    services: {
      laundry: 25,
      dryCleaning: 50,
      pressing: 20,
    },
  },
  {
    name: "Shorts",
    services: {
      laundry: 20,
      pressing: 15,
    },
  },
  {
    name: "Jacket",
    services: {
      laundry: 30,
      dryCleaning: 50,
      pressing: 20,
    },
  },
  {
    name: "Galabeya",
    services: {
      laundry: 50,
      dryCleaning: 70,
      pressing: 25,
    },
  },
  {
    name: "Dress",
    services: {
      laundry: 55,
      dryCleaning: 85,
      pressing: 30,
    },
  },
  {
    name: "Pyjama / Nightgown",
    services: {
      laundry: 30,
      pressing: 15,
    },
  },
  {
    name: "Knickers / Panties",
    services: {
      laundry: 15,
    },
  },
  {
    name: "Undershirt / Brassieres",
    services: {
      laundry: 15,
    },
  },
  {
    name: "Underwear / Stockings",
    services: {
      laundry: 15,
    },
  },
  {
    name: "Handkerchief / Socks",
    services: {
      laundry: 15,
    },
  },
  {
    name: "Training Suit",
    services: {
      laundry: 30,
      pressing: 20,
    },
  },
  {
    name: "Evening Dress",
    services: {
      dryCleaning: 90,
      pressing: 50,
    },
  },
  {
    name: "Pleated Skirt",
    services: {
      laundry: 60,
      dryCleaning: 70,
      pressing: 40,
    },
  },
  {
    name: "Coat",
    services: {
      dryCleaning: 70,
      pressing: 40,
    },
  },
  {
    name: "Neck Tie / Scarf",
    services: {
      laundry: 20,
      dryCleaning: 25,
      pressing: 20,
    },
  },
  {
    name: "Suit 2 Pieces",
    services: {
      dryCleaning: 100,
      pressing: 40,
    },
  },
  {
    name: "Suit 3 Pieces",
    services: {
      dryCleaning: 120,
      pressing: 50,
    },
  },
];

function initializeLaundry() {
  // The laundry table is already in HTML - just wire up events and totals
  attachLaundryEvents();
  updateLaundryGrandTotal();
}

function renderLaundryItems() {
  // No-op: table rows are hardcoded in HTML
}

function attachLaundryEvents() {
  const laundrySection = document.getElementById("laundry");
  if (!laundrySection) return;

  laundrySection.addEventListener("input", (e) => {
    if (e.target.classList.contains("laundry-qty-input")) {
      updateLaundryRowTotalFromHTML(e.target.closest(".laundry-row"));
      updateLaundryGrandTotal();
    }
  });

  laundrySection.addEventListener("change", (e) => {
    if (e.target.classList.contains("laundry-service-checkbox")) {
      // Toggle pill-active class on parent label
      const pill = e.target.closest(".laundry-pill");
      if (pill) {
        pill.classList.toggle("pill-active", e.target.checked);
      }
      updateLaundryRowTotalFromHTML(e.target.closest(".laundry-row"));
      updateLaundryGrandTotal();
    }
  });

  // +/- stepper buttons
  laundrySection.addEventListener("click", (e) => {
    const btn = e.target.closest(".qty-dec, .qty-inc");
    if (!btn) return;
    const row = btn.closest(".laundry-row");
    const input = row && row.querySelector(".laundry-qty-input");
    if (!input) return;
    let val = parseInt(input.value, 10) || 0;
    if (btn.classList.contains("qty-inc")) val = Math.max(0, val + 1);
    if (btn.classList.contains("qty-dec")) val = Math.max(0, val - 1);
    input.value = val;
    updateLaundryRowTotalFromHTML(row);
    updateLaundryGrandTotal();
  });
}

// Works directly with the HTML table rows
function updateLaundryRowTotalFromHTML(row) {
  if (!row) return;
  const qtyInput = row.querySelector(".laundry-qty-input");
  const totalCell = row.querySelector(".laundry-row-total");
  if (!qtyInput || !totalCell) return;

  const qty = parseInt(qtyInput.value, 10) || 0;
  let rowTotal = 0;

  row.querySelectorAll(".laundry-service-checkbox:checked").forEach((cb) => {
    const price = parseFloat(cb.getAttribute("data-price")) || 0;
    rowTotal += price * qty;
  });

  totalCell.textContent = rowTotal.toFixed(2);

  // Highlight row if something is selected
  if (
    qty > 0 &&
    row.querySelectorAll(".laundry-service-checkbox:checked").length > 0
  ) {
    row.classList.add("has-selection");
  } else {
    row.classList.remove("has-selection");
  }
}

// Legacy index-based version (kept for compatibility but unused)
function updateLaundryRowTotal(index) {
  const row = document.querySelectorAll(".laundry-row")[index];
  updateLaundryRowTotalFromHTML(row);
}

function updateLaundryGrandTotal() {
  const grandTotalElement = document.getElementById("laundryGrandTotal");
  const selectedCountEl = document.getElementById("laundrySelectedCount");
  if (!grandTotalElement) return;

  let total = 0;
  let selectedCount = 0;

  document.querySelectorAll(".laundry-row").forEach((row) => {
    const qtyInput = row.querySelector(".laundry-qty-input");
    const qty = parseInt(qtyInput?.value || "0", 10) || 0;
    const checkedBoxes = row.querySelectorAll(
      ".laundry-service-checkbox:checked",
    );

    checkedBoxes.forEach((cb) => {
      const price = parseFloat(cb.getAttribute("data-price")) || 0;
      total += price * qty;
    });

    if (checkedBoxes.length > 0 && qty > 0) {
      selectedCount += qty;
    }
  });

  grandTotalElement.textContent = total.toFixed(2);
  if (selectedCountEl) selectedCountEl.textContent = selectedCount;
}

function getSelectedLaundryItems() {
  const selectedItems = [];

  document.querySelectorAll(".laundry-row").forEach((row) => {
    const itemName =
      row.getAttribute("data-item") ||
      row.querySelector("td")?.textContent.trim() ||
      "";
    const qtyInput = row.querySelector(".laundry-qty-input");
    const qty = parseInt(qtyInput?.value || "0", 10) || 0;
    if (qty <= 0) return;

    const selectedServices = [];
    let rowTotal = 0;

    row.querySelectorAll(".laundry-service-checkbox:checked").forEach((cb) => {
      const service = cb.getAttribute("data-service");
      const price = parseFloat(cb.getAttribute("data-price")) || 0;
      rowTotal += price * qty;
      selectedServices.push({ service, price });
    });

    if (selectedServices.length > 0) {
      selectedItems.push({
        name: itemName,
        quantity: qty,
        services: selectedServices,
        total: rowTotal,
      });
    }
  });

  return selectedItems;
}

function formatLaundryServiceName(serviceKey) {
  switch (serviceKey) {
    case "laundry":
      return "Laundry";
    case "dryCleaning":
      return "Dry Cleaning";
    case "pressing":
      return "Pressing";
    default:
      return serviceKey;
  }
}

function generateLaundryMessage(formData, selectedItems, totalAmount) {
  let itemsText = "";

  selectedItems.forEach((item) => {
    itemsText += `\n${item.name} | Quantity: ${item.quantity}\n`;

    item.services.forEach((service) => {
      itemsText += `- ${formatLaundryServiceName(service.service)}: ${service.price.toFixed(2)} $ x ${item.quantity}\n`;
    });

    itemsText += `Item Total: ${item.total.toFixed(2)} $\n`;
  });

  return `
Laundry Request
-----------------------------
Guest Name: ${formData.get("laundryCustomerName")}
Room Number: ${formData.get("laundryRoomNumber")}
Special Requests: ${formData.get("laundrySpecialRequests") || "None"}

Selected Items:
${itemsText}

Grand Total: ${totalAmount.toFixed(2)} $
-----------------------------
`.trim();
}

function generateLaundryConfirmationContent(
  formData,
  selectedItems,
  totalAmount,
) {
  let itemsHtml = "";

  selectedItems.forEach((item) => {
    const servicesHtml = item.services
      .map(
        (service) =>
          `<div class="order-item">
            <span>${formatLaundryServiceName(service.service)}</span>
            <span>${(service.price * item.quantity).toFixed(2)} $</span>
          </div>`,
      )
      .join("");

    itemsHtml += `
      <div class="laundry-confirm-item">
        <div class="laundry-confirm-item-header">
          <strong>${item.name}</strong>
          <span class="laundry-confirm-qty">x${item.quantity}</span>
        </div>
        ${servicesHtml}
        <div class="order-item laundry-confirm-subtotal">
          <span>Item Total</span>
          <span>${item.total.toFixed(2)} $</span>
        </div>
      </div>
    `;
  });

  const specialRequests = formData.get("laundrySpecialRequests");

  return `
    <div class="confirmation-content">
      <div class="room-number">
        <i class="fas fa-user"></i> Your Name: ${formData.get("laundryCustomerName")}
      </div>
      <div class="room-number">
        <i class="fas fa-door-open"></i> Room Number: ${formData.get("laundryRoomNumber")}
      </div>
      ${specialRequests ? `<div class="room-number"><i class="fas fa-sticky-note"></i> Special Requests: ${specialRequests}</div>` : ""}
      <h4><i class="fas fa-tshirt"></i> Laundry Order Details</h4>
      <div class="order-items">
        ${itemsHtml}
        <div class="total">Total: ${totalAmount.toFixed(2)} $</div>
      </div>
    </div>
  `;
}

// ── Room check: a guest can only send requests for the room they are registered in (the room shown in "Welcome, … · Room 201") ──
function normRoom(v) {
  return String(v == null ? "" : v)
    .replace(/[\u0660-\u0669]/g, (d) => d.charCodeAt(0) - 0x660) // Arabic-Indic digits -> 0-9
    .replace(/[\u06f0-\u06f9]/g, (d) => d.charCodeAt(0) - 0x6f0)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function validateGuestRoom(entered, fieldId) {
  const g = window.DyafaGuest ? window.DyafaGuest.get() : null;
  if (!g || normRoom(entered) === normRoom(g.roomNumber)) return true;
  const el = fieldId ? document.getElementById(fieldId) : null;
  if (el) {
    el.style.borderColor = "#dc3545";
    el.style.boxShadow = "0 0 0 .2rem rgba(220,53,69,.25)";
    el.focus();
    el.addEventListener("input", function reset() {
      el.style.borderColor = "";
      el.style.boxShadow = "";
      el.removeEventListener("input", reset);
    });
  }
  showErrorMessage(
    "Wrong room number. You are registered in Room " +
      g.roomNumber +
      " — please enter your own room number.",
  );
  return false;
}

function handleLaundryForm(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const customerName = formData.get("laundryCustomerName");
  const roomNumber = formData.get("laundryRoomNumber");

  if (!customerName?.trim() || !roomNumber?.trim()) {
    showErrorMessage("Please fill in all required fields!");
    return;
  }
  if (!validateGuestRoom(roomNumber, "laundryRoomNumber")) return;

  const selectedItems = getSelectedLaundryItems();

  if (selectedItems.length === 0) {
    showErrorMessage("Please select at least one laundry item and service!");
    return;
  }

  let totalAmount = 0;
  selectedItems.forEach((item) => {
    totalAmount += item.total;
  });

  const laundryDetails = generateLaundryMessage(
    formData,
    selectedItems,
    totalAmount,
  );
  const confirmationContent = generateLaundryConfirmationContent(
    formData,
    selectedItems,
    totalAmount,
  );

  const orderData = {
    type: "Laundry",
    customerName: formData.get("laundryCustomerName"),
    roomNumber: formData.get("laundryRoomNumber"),
    pickupDate: "",
    pickupTime: "",
    specialRequests: formData.get("laundrySpecialRequests") || "",
    items: selectedItems
      .map((item) => {
        const services = item.services
          .map((service) => formatLaundryServiceName(service.service))
          .join(", ");
        return `${item.name} x${item.quantity} (${services})`;
      })
      .join(" | "),
    total: totalAmount.toFixed(2),
    orderDate: new Date().toISOString().split("T")[0],
    orderTime: new Date().toLocaleTimeString(),
  };

  const emailData = {
    message: laundryDetails,
    recipient: EMAIL_CONFIG.recipients.laundry,
    subject: `Room ${roomNumber} - Laundry Request`,
    roomNumber,
    orderData,
  };

  showConfirmationModal(confirmationContent, emailData);
}

function handleFoodOrder(e) {
  e.preventDefault();

  if (cart.length === 0) {
    showErrorMessage("Your cart is empty!");
    return;
  }

  const customerName = document.getElementById("customerName").value.trim();
  const roomNumber = document.getElementById("roomNumber").value.trim();

  if (!customerName) {
    showErrorMessage("Please enter your name!");
    return;
  }

  if (!roomNumber) {
    showErrorMessage("Please enter your room number!");
    return;
  }

  if (!validateGuestRoom(roomNumber, "roomNumber")) return;

  const orderDetails = generateFoodOrderMessage(customerName, roomNumber);
  const confirmationContent = generateFoodConfirmationContent(
    customerName,
    roomNumber,
  );

  let orderTotal = 0;
  let orderItems = [];
  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    orderTotal += itemTotal;
    orderItems.push(`${item.name} x${item.quantity}`);
  });

  const orderData = {
    type: "Food Order",
    customerName,
    roomNumber,
    items: orderItems.join(", "),
    total: orderTotal.toFixed(2),
    orderDate: new Date().toISOString().split("T")[0],
    orderTime: new Date().toLocaleTimeString(),
  };

  const emailData = {
    message: orderDetails,
    recipient: EMAIL_CONFIG.recipients.food,
    subject: `Room ${roomNumber} - Food Order Request`,
    roomNumber,
    orderData,
  };

  showConfirmationModal(confirmationContent, emailData);
}

function handleTourForm(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const customerName = formData.get("tourCustomerName");
  const roomNumber = formData.get("tourRoomNumber");

  if (!customerName?.trim() || !roomNumber?.trim()) {
    showErrorMessage("Please fill in all required fields!");
    return;
  }
  if (!validateGuestRoom(roomNumber, "tourRoomNumber")) return;

  const tourDetails = generateTourMessage(formData);
  const confirmationContent = generateTourConfirmationContent(formData);

  const orderData = {
    type: "Tour Organization",
    customerName: formData.get("tourCustomerName"),
    roomNumber: formData.get("tourRoomNumber"),
    destination: formData.get("tourDestination"),
    date: formData.get("tourDate"),
    time: formData.get("tourTime"),
    duration: formData.get("tourDuration"),
    participants: formData.get("tourParticipants"),
    needGuide: formData.get("tourNeedGuide") ? true : false,
    guideLanguage: formData.get("tourGuideLanguage") || "",
    specialRequests: formData.get("tourSpecialRequests") || "",
    orderDate: new Date().toISOString().split("T")[0],
    orderTime: new Date().toLocaleTimeString(),
  };

  const emailData = {
    message: tourDetails,
    recipient: EMAIL_CONFIG.recipients.tour,
    subject: `Room ${roomNumber} - Tour Organization Request`,
    roomNumber,
    orderData,
  };

  showConfirmationModal(confirmationContent, emailData);
}

function handleHousekeepingForm(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const customerName = formData.get("housekeepingCustomerName");
  const roomNumber = formData.get("housekeepingRoomNumber");

  if (!customerName?.trim() || !roomNumber?.trim()) {
    showErrorMessage("Please fill in all required fields!");
    return;
  }
  if (!validateGuestRoom(roomNumber, "housekeepingRoomNumber")) return;

  const housekeepingDetails = generateHousekeepingMessage(formData);
  const confirmationContent = generateHousekeepingConfirmationContent(formData);

  const emailData = {
    message: housekeepingDetails,
    recipient: EMAIL_CONFIG.recipients.housekeeping,
    subject: `Room ${roomNumber} - Housekeeping Request`,
    roomNumber,
    orderData: {
      type: "Housekeeping",
      total: "0",
      specialRequests: document.getElementById("immediateService")?.checked
        ? "Immediate service" +
          (formData.get("housekeepingSpecialRequests")
            ? " - " + formData.get("housekeepingSpecialRequests")
            : "")
        : "Cleaning " +
          (formData.get("cleaningDate") || "") +
          " " +
          (formData.get("cleaningTime") || ""),
    },
  };

  showConfirmationModal(confirmationContent, emailData);
}

// ==========================================
// MESSAGE GENERATION
// ==========================================

function generateFoodOrderMessage(customerName, roomNumber) {
  let message = "🍽️ FOOD ORDER REQUEST\n\n";
  message += `👤 Guest Name: ${customerName}\n`;
  message += `🏨 Room Number: ${roomNumber}\n\n`;
  message += "📋 Order Details:\n";

  let total = 0;
  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    message += ` x${item.quantity} ${item.name} -> ${itemTotal.toFixed(2)} $\n`;
  });

  message += `\n💰 Total: ${total.toFixed(2)} $\n`;
  message += `\n📅 Order Date: ${new Date().toLocaleDateString()}\n`;
  message += `🕐 Order Time: ${new Date().toLocaleTimeString()}\n`;

  return message;
}

function generateTourMessage(formData) {
  let message = "🗺️ TOUR ORGANIZATION REQUEST\n\n";
  message += `👤 Guest Name: ${formData.get("tourCustomerName")}\n`;
  message += `🏨 Room Number: ${formData.get("tourRoomNumber")}\n\n`;
  message += `📍 Destination: ${formData.get("tourDestination")}\n`;
  message += `📅 Date: ${formData.get("tourDate")}\n`;
  message += `🕐 Time: ${formData.get("tourTime")}\n`;
  message += `⏱️ Duration: ${formData.get("tourDuration")}\n`;
  message += `👥 Participants: ${formData.get("tourParticipants")}\n`;

  if (formData.get("tourNeedGuide")) {
    message += "🧭 Tour Guide: Required\n";
    if (formData.get("tourGuideLanguage")) {
      message += `🗣️ Guide Language: ${formData.get("tourGuideLanguage")}\n`;
    }
  } else {
    message += "🧭 Tour Guide: Not required\n";
  }

  if (formData.get("tourSpecialRequests")) {
    message += `📝 Special Requests: ${formData.get("tourSpecialRequests")}\n`;
  }

  message += `\n📅 Request Date: ${new Date().toLocaleDateString()}\n`;
  message += `🕐 Request Time: ${new Date().toLocaleTimeString()}\n`;

  return message;
}

function generateTransportMessage(formData) {
  let message = "🚗 TRANSPORTATION REQUEST\n\n";
  message += `👤 Guest Name: ${formData.get("transportCustomerName")}\n`;
  message += `🏨 Room Number: ${formData.get("transportRoomNumber")}\n\n`;
  message += `🚙 Transport Type: ${formData.get("transportType")}\n`;
  message += `📍 Pickup Location: ${formData.get("pickupLocation")}\n`;
  message += `🎯 Destination: ${formData.get("destination")}\n`;
  message += `📅 Date: ${formData.get("transportDate")}\n`;
  message += `🕐 Time: ${formData.get("transportTime")}\n`;
  message += `👥 Passengers: ${formData.get("passengers")}\n`;

  if (formData.get("transportSpecialRequests")) {
    message += `📝 Special Requests: ${formData.get(
      "transportSpecialRequests",
    )}\n`;
  }

  message += `\n📅 Request Date: ${new Date().toLocaleDateString()}\n`;
  message += `🕐 Request Time: ${new Date().toLocaleTimeString()}\n`;

  return message;
}

function generateHousekeepingMessage(formData) {
  let message = "🏠 HOUSEKEEPING REQUEST\n\n";
  message += `👤 Guest Name: ${formData.get("housekeepingCustomerName")}\n`;
  message += `🏨 Room Number: ${formData.get("housekeepingRoomNumber")}\n\n`;

  const immediateService = document.getElementById("immediateService").checked;
  if (immediateService) {
    message += "⚡ SERVICE TYPE: IMMEDIATE SERVICE REQUESTED\n";
    message += "🕐 Requested Time: ASAP\n";
  } else {
    message += `📅 Preferred Date: ${formData.get("cleaningDate")}\n`;
    message += `🕐 Preferred Time: ${formData.get("cleaningTime")}\n`;
  }

  if (formData.get("housekeepingSpecialRequests")) {
    message += `📝 Special Requests: ${formData.get(
      "housekeepingSpecialRequests",
    )}\n`;
  }

  message += `\n📅 Request Date: ${new Date().toLocaleDateString()}\n`;
  message += `🕐 Request Time: ${new Date().toLocaleTimeString()}\n`;

  return message;
}

// ==========================================
// CONFIRMATION CONTENT
// ==========================================

function generateFoodConfirmationContent(customerName, roomNumber) {
  let total = 0;
  let itemsHtml = "";

  cart.forEach((item) => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    itemsHtml += `
      <div class="order-item">
        <span>${item.name} x${item.quantity}</span>
        <span>${itemTotal.toFixed(2)} $</span>
      </div>
    `;
  });

  return `
    <div class="confirmation-content">
      <div class="room-number">
        <i class="fas fa-user"></i> Your Name: ${customerName}
      </div>
      <div class="room-number">
        <i class="fas fa-door-open"></i> Room Number: ${roomNumber}
      </div>
      <h4><i class="fas fa-utensils"></i> Food Order Details</h4>
      <div class="order-items">
        ${itemsHtml}
        <div class="total">Total: ${total.toFixed(2)} $</div>
      </div>
      <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Order Time:</strong> ${new Date().toLocaleTimeString()}</p>
    </div>
  `;
}

function generateTourConfirmationContent(formData) {
  return `
    <div class="confirmation-content">
      <div class="room-number">
        <i class="fas fa-user"></i> Your Name: ${formData.get(
          "tourCustomerName",
        )}
      </div>
      <div class="room-number">
        <i class="fas fa-door-open"></i> Room Number: ${formData.get(
          "tourRoomNumber",
        )}
      </div>
      <h4><i class="fas fa-map-marked-alt"></i> Tour Request Details</h4>
      <p><strong>Destination:</strong> ${formData.get("tourDestination")}</p>
      <p><strong>Date:</strong> ${formData.get("tourDate")}</p>
      <p><strong>Time:</strong> ${formData.get("tourTime")}</p>
      <p><strong>Duration:</strong> ${formData.get("tourDuration")}</p>
      <p><strong>Participants:</strong> ${formData.get("tourParticipants")}</p>
      <p><strong>Tour Guide:</strong> ${
        formData.get("tourNeedGuide") ? "Required" : "Not required"
      }</p>
      ${
        formData.get("tourNeedGuide") && formData.get("tourGuideLanguage")
          ? `<p><strong>Guide Language:</strong> ${formData.get(
              "tourGuideLanguage",
            )}</p>`
          : ""
      }
      ${
        formData.get("tourSpecialRequests")
          ? `<p><strong>Special Requests:</strong> ${formData.get(
              "tourSpecialRequests",
            )}</p>`
          : ""
      }
      <p><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
    </div>
  `;
}

function generateTransportConfirmationContent(formData) {
  return `
    <div class="confirmation-content">
      <div class="room-number">
        <i class="fas fa-user"></i> Your Name: ${formData.get(
          "transportCustomerName",
        )}
      </div>
      <div class="room-number">
        <i class="fas fa-door-open"></i> Room Number: ${formData.get(
          "transportRoomNumber",
        )}
      </div>
      <h4><i class="fas fa-car"></i> Transportation Request Details</h4>
      <p><strong>Transport Type:</strong> ${formData.get("transportType")}</p>
      <p><strong>Pickup Location:</strong> ${formData.get("pickupLocation")}</p>
      <p><strong>Destination:</strong> ${formData.get("destination")}</p>
      <p><strong>Date:</strong> ${formData.get("transportDate")}</p>
      <p><strong>Time:</strong> ${formData.get("transportTime")}</p>
      <p><strong>Passengers:</strong> ${formData.get("passengers")}</p>
      ${
        formData.get("transportSpecialRequests")
          ? `<p><strong>Special Requests:</strong> ${formData.get(
              "transportSpecialRequests",
            )}</p>`
          : ""
      }
      <p><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
    </div>
  `;
}

function generateHousekeepingConfirmationContent(formData) {
  const immediateService = document.getElementById("immediateService").checked;

  let serviceDetails = "";
  if (immediateService) {
    serviceDetails = `
      <p><strong>Service Type:</strong> <span style="color: #43a1c7; font-weight: 600;">⚡ IMMEDIATE SERVICE</span></p>
      <p><strong>Requested Time:</strong> ASAP (As Soon As Possible)</p>
    `;
  } else {
    serviceDetails = `
      <p><strong>Preferred Date:</strong> ${formData.get("cleaningDate")}</p>
      <p><strong>Preferred Time:</strong> ${formData.get("cleaningTime")}</p>
    `;
  }

  return `
    <div class="confirmation-content">
      <div class="room-number">
        <i class="fas fa-user"></i> Your Name: ${formData.get(
          "housekeepingCustomerName",
        )}
      </div>
      <div class="room-number">
        <i class="fas fa-door-open"></i> Room Number: ${formData.get(
          "housekeepingRoomNumber",
        )}
      </div>
      <h4><i class="fas fa-home"></i> Housekeeping Request Details</h4>
      ${serviceDetails}
      ${
        formData.get("housekeepingSpecialRequests")
          ? `<p><strong>Special Requests:</strong> ${formData.get(
              "housekeepingSpecialRequests",
            )}</p>`
          : ""
      }
      <p><strong>Request Date:</strong> ${new Date().toLocaleDateString()}</p>
    </div>
  `;
}

// ==========================================
// MODAL FUNCTIONS
// ==========================================

function showConfirmationModal(content, emailData) {
  pendingEmailData = emailData;
  document.getElementById("confirmationContent").innerHTML = content;
  document.getElementById("confirmationModal").style.display = "block";

  const confirmBtn = document.getElementById("confirmSendBtn");
  confirmBtn.onclick = function () {
    sendEmail(
      emailData.message,
      emailData.recipient,
      emailData.subject,
      emailData.roomNumber,
      emailData.orderData,
    );
    closeConfirmationModal();
  };
}

function closeConfirmationModal() {
  document.getElementById("confirmationModal").style.display = "none";
  pendingEmailData = null;
}

window.onclick = function (event) {
  const modal = document.getElementById("confirmationModal");
  if (event.target === modal) {
    closeConfirmationModal();
  }
};

// ==========================================
// EMAIL & GOOGLE SHEETS
// ==========================================

function saveToGoogleSheets(orderData) {
  if (!GOOGLE_SHEETS_CONFIG.enableLogging) return;

  if (
    !GOOGLE_SHEETS_CONFIG.webAppUrl ||
    GOOGLE_SHEETS_CONFIG.webAppUrl.includes("YOUR_GOOGLE_APPS_SCRIPT")
  ) {
    console.log("Google Sheets URL not configured. Skipping data save.");
    return;
  }

  fetch(GOOGLE_SHEETS_CONFIG.webAppUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData),
  })
    .then(() => console.log(orderData.type + " saved to Google Sheets"))
    .catch((error) => console.error("Error saving to Google Sheets:", error));
}

// Sends the order to the Google Apps Script, which emails ahhasa842@gmail.com
// and logs the order in the Google Sheet.
function postOrderToScript(payload) {
  const url = EMAIL_CONFIG.scriptUrl;
  if (!url || url.includes("PASTE_YOUR")) {
    return Promise.reject(new Error("Apps Script URL is not configured"));
  }
  return fetch(url, {
    method: "POST",
    mode: "no-cors", // Apps Script does not send CORS headers; request still arrives
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

// Sends the order to Reception through Supabase (it appears in the guest's Bills & Charges there). Resolves true when saved.
function recordOrderForReception(orderData, subject, message) {
  const S = window.DyafaStore;
  const req = S && S.session();
  if (!req || req.status !== "approved" || !req.bookingId)
    return Promise.resolve(false);
  const o = orderData || {};
  const type =
    o.type ||
    (/housekeeping/i.test(subject) ? "Housekeeping" : "Service request");
  let desc;
  if (type === "Food Order") desc = "Food order: " + (o.items || "");
  else if (type === "Laundry") desc = "Laundry: " + (o.items || "");
  else if (type === "Tour Organization")
    desc =
      "Tour: " +
      (o.destination || "") +
      " on " +
      (o.date || "") +
      " " +
      (o.time || "") +
      " (" +
      (o.participants || "?") +
      " guests)";
  else if (type === "Transport")
    desc =
      "Transport: " +
      (o.transportType || "") +
      " on " +
      (o.date || "") +
      " " +
      (o.time || "");
  else desc = type + (o.specialRequests ? ": " + o.specialRequests : "");
  return S.addOrder({
    type: type,
    desc: desc,
    amount:
      Math.round(
        (parseFloat(o.total) || 0) *
          (type === "Food Order" ? FOOD_USD_TO_EGP : 1) *
          100,
      ) / 100,
    details: message,
  });
}

function sendEmail(message, recipient, subject, roomNumber, orderData = null) {
  showInfoMessage("Sending your request...");
  const recordedPromise = recordOrderForReception(orderData, subject, message);

  const guest = window.DyafaGuest ? window.DyafaGuest.get() : null;
  const fullMessage =
    (window.DyafaGuest ? window.DyafaGuest.summary() : "") + message;
  const finishOk = function () {
    showSuccessMessage("Your request sent successfully!");

    if (currentTab === "food") {
      cart = [];
      updateCartDisplay();
      document.getElementById("customerName").value = "";
      document.getElementById("roomNumber").value = "";
    } else {
      document
        .querySelectorAll(".service-form")
        .forEach((form) => form.reset());
    }
  };
  postOrderToScript({ subject, message: fullMessage, roomNumber, guest })
    .then(finishOk)
    .catch(function (error) {
      console.error("Error sending request:", error);
      // the e-mail script failed – the request may still have reached Reception through Supabase
      recordedPromise.then(function (recorded) {
        if (recorded) {
          showSuccessMessage("Your request was sent to reception!");
          return;
        }
        showErrorMessage("Failed to send request. Please try again.");
      });
    });
}

// ==========================================
// NOTIFICATIONS
// ==========================================

function showNotification(message, type = "info", duration = 4000) {
  const container = document.getElementById("notificationContainer");
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  let icon = "fas fa-info-circle";
  if (type === "success") icon = "fas fa-check-circle";
  if (type === "error") icon = "fas fa-exclamation-circle";

  notification.innerHTML = `
    <i class="notification-icon ${icon}"></i>
    <span class="notification-message">${message}</span>
    <button class="notification-close" onclick="removeNotification(this)">
      <i class="fas fa-times"></i>
    </button>
  `;

  container.appendChild(notification);

  if (duration > 0) {
    setTimeout(() => {
      removeNotification(notification.querySelector(".notification-close"));
    }, duration);
  }

  return notification;
}

function removeNotification(closeBtn) {
  const notification = closeBtn.closest(".notification");
  if (notification) {
    notification.classList.add("removing");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }
}

function showSuccessMessage(text) {
  showNotification(text, "success", 3000);
}

function showErrorMessage(text) {
  showNotification(text, "error", 5000);
}

function showInfoMessage(text) {
  showNotification(text, "info", 4000);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function setMinimumDates() {
  const today = new Date().toISOString().split("T")[0];
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.min = today;
  });
}

// ==========================================
// SEARCH FUNCTIONALITY
// ==========================================

function initializeSearch() {
  const searchInput = document.getElementById("menuSearch");
  const clearBtn = document.getElementById("clearSearch");

  if (!searchInput || !clearBtn) return;

  searchInput.addEventListener("input", handleSearch);
  clearBtn.addEventListener("click", clearSearch);

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearSearch();
    }
  });
}

// Replace existing handleSearch and clearSearch with this version

function handleSearch(e) {
  const rawVal = e?.target?.value ?? "";
  const searchTerm = String(rawVal).toLowerCase().trim();
  const clearBtn = document.getElementById("clearSearch");
  const allItems = Array.from(
    document.querySelectorAll(
      ".menu-category:not([data-category='SearchResults']) .menu-item",
    ),
  );
  const allCategories = Array.from(
    document.querySelectorAll(
      ".menu-category:not([data-category='SearchResults'])",
    ),
  );
  const categoryButtons = document.querySelectorAll(".category-btn");
  const categoryButtonsContainer = document.querySelector(".menu-categories");

  if (clearBtn) clearBtn.style.display = searchTerm ? "flex" : "none";

  if (!searchTerm) {
    const existingSearchPanel = document.querySelector(
      '.menu-category[data-category="SearchResults"]',
    );
    if (existingSearchPanel) existingSearchPanel.remove();

    allItems.forEach((item) => {
      // CHECK: Don't show admin-hidden items
      if (!item.classList.contains("admin-hidden")) {
        item.style.display = "";
      }
    });

    restoreCategoryButtonsOrder();
    applyMenuLayout();
    runAdjustHeightsDeferred();
    return;
  }

  let hasResultsGlobal = false;
  const categoryResults = new Map();
  const categoryMatchCounts = new Map();

  allItems.forEach((item) => {
    // SKIP admin-hidden items
    if (item.classList.contains("admin-hidden")) {
      item.style.display = "none";
      return;
    }

    const itemName =
      item.querySelector(".item-info h4")?.textContent.toLowerCase() || "";
    const itemDesc =
      item.querySelector(".item-info p")?.textContent.toLowerCase() || "";
    const categoryElement = item.closest(".menu-category");
    const categoryName = categoryElement?.getAttribute("data-category") || "";

    const matches =
      itemName.includes(searchTerm) ||
      itemDesc.includes(searchTerm) ||
      categoryName.toLowerCase().includes(searchTerm);

    if (matches) {
      hasResultsGlobal = true;
      item.style.display = "";

      if (!categoryResults.has(categoryName)) {
        categoryResults.set(categoryName, true);
        categoryMatchCounts.set(categoryName, 0);
      }
      categoryMatchCounts.set(
        categoryName,
        categoryMatchCounts.get(categoryName) + 1,
      );
    } else {
      item.style.display = "none";
    }
  });

  allCategories.forEach((category) => {
    const categoryName = category.getAttribute("data-category");
    const hasResults = categoryResults.has(categoryName);

    if (hasResults) {
      category.style.display = "";
    } else {
      category.style.display = "none";
    }
  });

  const firstCategoryWithResults = reorderCategoryButtons(
    categoryResults,
    categoryMatchCounts,
  );

  categoryButtons.forEach((btn) => {
    const categoryName = btn.getAttribute("data-category");
    const hasResults = categoryResults.has(categoryName);

    if (hasResults) {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    } else {
      btn.style.opacity = "0.3";
      btn.style.pointerEvents = "none";
    }
  });

  if (firstCategoryWithResults) {
    switchCategory(firstCategoryWithResults);
  }

  applyMenuLayout();

  if (!hasResultsGlobal) {
    const activePanel = getActivePanel();
    if (activePanel) {
      const noResultsMsg = document.createElement("div");
      noResultsMsg.className = "no-results-message";
      noResultsMsg.style.cssText =
        "grid-column: 1/-1; text-align: center; padding: 40px; color: #6c757d; font-size: 1.1rem;";
      noResultsMsg.innerHTML =
        '<i class="fas fa-search" style="font-size: 3rem; margin-bottom: 20px; opacity: 0.3; display: block;"></i>No items found matching your search';

      const existing = activePanel.querySelector(".no-results-message");
      if (existing) existing.remove();

      activePanel.appendChild(noResultsMsg);
    }
  } else {
    document
      .querySelectorAll(".no-results-message")
      .forEach((msg) => msg.remove());
  }

  runAdjustHeightsDeferred();
}

// Store original button order
let originalCategoryButtonsOrder = null;

function reorderCategoryButtons(categoryResults, categoryMatchCounts) {
  const categoryButtonsContainer = document.querySelector(".menu-categories");
  if (!categoryButtonsContainer) return null;

  const allButtons = Array.from(
    categoryButtonsContainer.querySelectorAll(".category-btn"),
  );

  // Store original order if not already stored
  if (!originalCategoryButtonsOrder) {
    originalCategoryButtonsOrder = allButtons.map((btn) => ({
      element: btn,
      category: btn.getAttribute("data-category"),
    }));
  }

  // Sort buttons: categories with results first (by match count), then rest
  const sortedButtons = allButtons.sort((a, b) => {
    const catA = a.getAttribute("data-category");
    const catB = b.getAttribute("data-category");

    const hasResultsA = categoryResults.has(catA);
    const hasResultsB = categoryResults.has(catB);

    // If both have results or both don't, sort by match count (descending)
    if (hasResultsA && hasResultsB) {
      return (
        (categoryMatchCounts.get(catB) || 0) -
        (categoryMatchCounts.get(catA) || 0)
      );
    }

    // Categories with results come first
    if (hasResultsA && !hasResultsB) return -1;
    if (!hasResultsA && hasResultsB) return 1;

    // Keep original order for categories without results
    return 0;
  });

  // Clear and re-append in new order
  categoryButtonsContainer.innerHTML = "";
  sortedButtons.forEach((btn) => categoryButtonsContainer.appendChild(btn));

  // Return the first category with results
  const firstCategoryWithResults = sortedButtons.find((btn) =>
    categoryResults.has(btn.getAttribute("data-category")),
  );

  return firstCategoryWithResults
    ? firstCategoryWithResults.getAttribute("data-category")
    : null;
}

function restoreCategoryButtonsOrder() {
  if (!originalCategoryButtonsOrder) return;

  const categoryButtonsContainer = document.querySelector(".menu-categories");
  if (!categoryButtonsContainer) return;

  // Clear container
  categoryButtonsContainer.innerHTML = "";

  // Restore original order
  originalCategoryButtonsOrder.forEach((item) => {
    categoryButtonsContainer.appendChild(item.element);
    // Reset styles
    item.element.style.opacity = "1";
    item.element.style.pointerEvents = "auto";
  });
}

function clearSearch() {
  const searchInput = document.getElementById("menuSearch");
  const clearBtn = document.getElementById("clearSearch");

  if (searchInput) searchInput.value = "";
  if (clearBtn) clearBtn.style.display = "none";

  const searchPanel = document.querySelector(
    '.menu-category[data-category="SearchResults"]',
  );
  if (searchPanel) searchPanel.remove();

  document
    .querySelectorAll(".no-results-message")
    .forEach((msg) => msg.remove());

  document.querySelectorAll(".menu-item").forEach((item) => {
    // Don't show admin-hidden items
    if (!item.classList.contains("admin-hidden")) {
      item.style.display = "";
    }
    item.classList.remove("hidden", "highlight");
  });

  document.querySelectorAll(".menu-category").forEach((cat) => {
    cat.style.display = "";
    cat.classList.remove("horizontal");
  });

  restoreCategoryButtonsOrder();

  // Default back to "All" category to show all items
  switchCategory("All");

  applyMenuLayout();
  runAdjustHeightsDeferred();

  if (searchInput) searchInput.focus();
}

// ==========================================
// IMAGE LOADING & HEIGHT ADJUSTMENT
// ==========================================

function waitForImagesInContainer(container, timeoutMs = 1200) {
  const imgs = Array.from(container.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();

  const promises = imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const onFinish = () => {
        img.removeEventListener("load", onFinish);
        img.removeEventListener("error", onFinish);
        resolve();
      };
      img.addEventListener("load", onFinish);
      img.addEventListener("error", onFinish);
    });
  });

  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([Promise.all(promises), timeout]);
}

async function adjustCarouselCardHeights() {
  if (menuLayout !== "carousel") {
    document.querySelectorAll(".menu-category .menu-item").forEach((it) => {
      it.style.height = "";
    });
    return;
  }

  const activePanel = document.querySelector(".menu-category.active");
  if (!activePanel) return;

  activePanel.style.display = "flex";
  await waitForImagesInContainer(activePanel, 1400);

  const items = Array.from(activePanel.querySelectorAll(".menu-item"));
  if (items.length === 0) return;

  items.forEach((item) => {
    item.style.height = "auto";
  });

  let maxHeight = 0;
  items.forEach((item) => {
    const h = item.scrollHeight;
    if (h > maxHeight) maxHeight = h;
  });

  const maxAllowed = Math.max(500, Math.round(window.innerHeight * 0.85));
  if (maxHeight > maxAllowed) maxHeight = maxAllowed;

  items.forEach((item) => {
    item.style.height = maxHeight + "px";
  });
}

function runAdjustHeightsDeferred() {
  clearTimeout(window.__adjustCarouselTimeout);
  window.__adjustCarouselTimeout = setTimeout(() => {
    adjustCarouselCardHeights().catch((err) => {
      console.warn("adjustCarouselCardHeights error:", err);
    });
  }, 70);
}

function attachMenuImageListeners() {
  document.querySelectorAll(".menu-items img").forEach((img) => {
    img.addEventListener("load", runAdjustHeightsDeferred, { passive: true });
    img.addEventListener("error", runAdjustHeightsDeferred, { passive: true });
  });
}

function applyMenuVisibilitySettings() {
  const menuVisibility = JSON.parse(
    localStorage.getItem("menuVisibility") || "{}",
  );

  // Get all menu items
  const menuItems = document.querySelectorAll(".menu-item");

  menuItems.forEach((item) => {
    // Get category and item name
    const categoryWrapper = item.closest(".menu-category");
    const category = categoryWrapper?.getAttribute("data-category") || "";
    const nameElement = item.querySelector(".item-info h4");
    const itemName = nameElement?.textContent.trim() || "";

    // Create the key
    const key = `${category}-${itemName}`;

    // Check visibility setting
    const isVisible = menuVisibility[key] !== false;

    // Hide or show the item
    if (!isVisible) {
      item.style.display = "none";
      item.classList.add("admin-hidden");
    } else {
      // Make sure it's visible (unless hidden by search)
      if (!item.classList.contains("hidden")) {
        item.style.display = "";
      }
      item.classList.remove("admin-hidden");
    }
  });

  // Hide empty categories
  document.querySelectorAll(".menu-category").forEach((category) => {
    const visibleItems = Array.from(
      category.querySelectorAll(".menu-item"),
    ).filter(
      (item) =>
        !item.classList.contains("admin-hidden") &&
        item.style.display !== "none",
    );

    if (visibleItems.length === 0) {
      category.classList.add("empty-category");
    } else {
      category.classList.remove("empty-category");
    }
  });

  // Update category buttons to show/hide empty categories
  document.querySelectorAll(".category-btn").forEach((btn) => {
    const categoryName = btn.getAttribute("data-category");
    const categoryPanel = document.querySelector(
      `.menu-category[data-category="${categoryName}"]`,
    );

    if (categoryPanel && categoryPanel.classList.contains("empty-category")) {
      btn.style.opacity = "0.3";
      btn.style.pointerEvents = "none";
    } else {
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    }
  });
}

// ==========================================
// EVENT LISTENERS
// ==========================================
window.addEventListener("storage", (e) => {
  if (e.key === "menuVisibility") {
    applyMenuVisibilitySettings();
  }
});

// Hidden menu items are stored in Supabase (table site_settings, key "menu_visibility") so every guest sees the same menu.
// Example value:  {"burgers-Classic Burger": false}
function loadMenuVisibilityFromServer() {
  if (!window.DyafaStore || !window.DyafaStore.enabled) return;
  window.DyafaStore.getSetting("menu_visibility").then(function (v) {
    if (!v || typeof v !== "object") return;
    try {
      localStorage.setItem("menuVisibility", JSON.stringify(v));
    } catch (e) {}
    applyMenuVisibilitySettings();
  });
}
document.addEventListener("DOMContentLoaded", loadMenuVisibilityFromServer);
window.addEventListener("focus", loadMenuVisibilityFromServer);

window.addEventListener("resize", runAdjustHeightsDeferred);
window.addEventListener("orientationchange", runAdjustHeightsDeferred);

// Make functions globally accessible for inline event handlers
window.updateQuantity = updateQuantity;
window.closeConfirmationModal = closeConfirmationModal;
window.removeNotification = removeNotification;

// ==========================================
// TOUR SECTION FUNCTIONALITY
// ==========================================

// Tour Data
const toursData = [
  {
    id: "giza-pyramids",
    name: "Giza Pyramids",
    category: "historical",
    duration: "Half Day",
    description:
      "One of the seven wonders of the Ancient time and the only service one. There you will see the most famous three Pyramids and other 6 small Pyramids for the queens.",
    highlights: [
      "The Great Pyramid of Khufu",
      "Pyramid of Khafre and Menkaure",
      "6 small Pyramids of the Queens",
      "Stunning views of the desert landscape",
    ],
    inclusions: [
      "Private tour guide",
      "Hotel pickup and drop-off",
      "Entry fees to the pyramids",
      "Bottled water",
    ],
    images: [
      "images/tours/giza-1.jpg",
      "images/tours/giza-2.jpg",
      "images/tours/giza-3.jpg",
      "images/tours/giza-4.jpg",
      "images/tours/giza-5.jpg",
    ],
  },
  {
    id: "saqqara",
    name: "Saqqara",
    category: "historical",
    duration: "Half Day",
    description:
      "It was used as a necropolis from the 3rd dynasty till the Coptic period. There you will see the complex of King Djoser and several tombs and Pyramids for kings and high officials and relatives.",
    highlights: [
      "Step Pyramid of Djoser - the oldest pyramid",
      "Ancient necropolis exploration",
      "Tombs of high officials",
      "Beautiful hieroglyphic inscriptions",
    ],
    inclusions: [
      "Private Egyptologist guide",
      "Hotel transfers",
      "Entry tickets",
      "Refreshments",
    ],
    images: [
      "images/tours/Saqqara-1.jpg",
      "images/tours/Saqqara-2.jpg",
      "images/tours/Saqqara-3.jpg",
      "images/tours/Saqqara-4.jpg",
      "images/tours/Saqqara-5.jpg",
    ],
  },
  {
    id: "memphis",
    name: "Memphis",
    category: "historical",
    duration: "3-4 Hours",
    description:
      "There you will see the temple of the god Ptah and a number of the most important statue for Queen Hatshepsut and a very huge statue of King Ramses.",
    highlights: [
      "Temple of god Ptah",
      "Colossal statue of Ramses II",
      "Ancient capital of Egypt",
      "Museum artifacts",
    ],
    inclusions: [
      "Expert guide",
      "Transportation",
      "Site entrance fees",
      "Cold drinks",
    ],
    images: [
      "images/tours/Memphis-1.jpg",
      "images/tours/Memphis-2.jpg",
      "images/tours/Memphis-3.jpg",
      "images/tours/Memphis-4.jpg",
      "images/tours/Memphis-5.jpg",
    ],
  },
  {
    id: "dahshour",
    name: "Dahshour",
    category: "historical",
    duration: "Half Day",
    description:
      "There you will see the two pyramids of King Sneferu: The Red Pyramid and Bent Pyramid.",
    highlights: [
      "The Red Pyramid - accessible interior",
      "The Bent Pyramid - unique architecture",
      "Less crowded than Giza",
      "Amazing photo opportunities",
    ],
    inclusions: [
      "Private vehicle",
      "Tour guide",
      "Entrance fees",
      "Water and snacks",
    ],
    images: [
      "images/tours/Dahshour-1.jpg",
      "images/tours/Dahshour-2.jpg",
      "images/tours/Dahshour-3.jpg",
      "images/tours/Dahshour-4.jpg",
      "images/tours/Dahshour-5.jpg",
    ],
  },
  {
    id: "egyptian-museum",
    name: "Egyptian Museum",
    category: "cultural",
    duration: "3-4 Hours",
    description:
      "The oldest archaeological museum in the middle east and houses more than 100,000 pieces.",
    highlights: [
      "Treasures of Tutankhamun",
      "Royal mummies",
      "Over 100,000 artifacts",
      "Ancient Egyptian history",
    ],
    inclusions: [
      "Museum entry ticket",
      "Egyptologist guide",
      "Hotel pickup and drop-off",
      "Free time for photos",
    ],
    images: [
      "images/tours/museum-1.jpg",
      "images/tours/museum-2.jpg",
      "images/tours/museum-3.jpg",
      "images/tours/museum-4.jpg",
      "images/tours/museum-5.jpg",
    ],
  },
  {
    id: "civilization-museum",
    name: "National Museum of Egyptian Civilization",
    category: "cultural",
    duration: "3-4 Hours",
    description: "Display collection of 50,000 pieces and 22 royal mummies.",
    highlights: [
      "22 royal mummies in new Royal Mummies Hall",
      "50,000 artifacts",
      "Modern museum facilities",
      "Journey through Egyptian civilization",
    ],
    inclusions: [
      "Museum entrance",
      "Professional guide",
      "Transfers",
      "Beverages",
    ],
    images: [
      "images/tours/civilization-1.jpg",
      "images/tours/civilization-2.jpg",
      "images/tours/civilization-3.jpg",
      "images/tours/civilization-4.jpg",
      "images/tours/civilization-5.jpg",
    ],
  },
  {
    id: "old-cairo",
    name: "Old Cairo",
    category: "cultural",
    duration: "Half Day",
    description:
      "This place contains the three different religions passed on in Egypt so there you will see the Hanging Church, the Jewish Temple of Ibn Ezra, and the Mosque of Amr Ibn Al Aas.",
    highlights: [
      "The Hanging Church (Coptic)",
      "Ben Ezra Synagogue (Jewish)",
      "Mosque of Amr Ibn Al Aas (Islamic)",
      "Three religions in one place",
    ],
    inclusions: [
      "Religious sites visits",
      "Cultural guide",
      "Transportation",
      "Entry fees",
    ],
    images: [
      "images/tours/old-cairo-1.jpg",
      "images/tours/old-cairo-2.jpg",
      "images/tours/old-cairo-3.jpg",
      "images/tours/old-cairo-4.jpg",
      "images/tours/old-cairo-5.jpg",
    ],
  },
  {
    id: "citadel",
    name: "Citadel of Salah El Din",
    category: "historical",
    duration: "3-4 Hours",
    description:
      "The citadel of Salah El Din and the mosque of Mohamed Ali. This mosque along with the citadel is one of the landmarks and tourist attractions of Cairo.",
    highlights: [
      "Mohamed Ali Mosque (Alabaster Mosque)",
      "Panoramic views of Cairo",
      "Medieval fortification",
      "Islamic architecture masterpiece",
    ],
    inclusions: [
      "Citadel entrance",
      "Mosque visit",
      "Guide service",
      "Hotel transfers",
    ],
    images: [
      "images/tours/citadel-1.jpg",
      "images/tours/citadel-2.jpg",
      "images/tours/citadel-3.jpg",
      "images/tours/citadel-4.jpg",
      "images/tours/citadel-5.jpg",
    ],
  },
  {
    id: "khan-el-khalili",
    name: "Khan El Khalili",
    category: "cultural",
    duration: "2-3 Hours",
    description:
      "The oldest street and market. It was a souk or market since the 14th century. And also one of Cairo's main attractions for tourists it looks like an open museum.",
    highlights: [
      "14th century bazaar",
      "Traditional crafts and souvenirs",
      "Historic architecture",
      "Local culture experience",
    ],
    inclusions: [
      "Guided market tour",
      "Shopping tips",
      "Transportation",
      "Traditional tea at a historic café (optional)",
    ],
    images: [
      "images/tours/khan-1.jpg",
      "images/tours/khan-2.jpg",
      "images/tours/khan-3.jpg",
      "images/tours/khan-4.jpg",
      "images/tours/khan-5.jpg",
    ],
  },
  /* {
    id: 'nile-cruise',
    name: 'Cairo Nile Dinner Cruise',
    category: 'relaxation',
    duration: '2 Hours',
    description: '2 Hour Nile River Night Dinner Cruise Cairo. Tuck into a delicious open buffet on board, and be entertained by dancing show, and a traditional show. Including the pickup and the drop-off.',
    highlights: [
      'Scenic Nile River cruise',
      'Open buffet dinner',
      'Traditional belly dance show',
      'Tanoura folklore show',
      'Live music'
    ],
    inclusions: [
      'Cruise ticket',
      'Open buffet dinner',
      'Entertainment shows',
      'Hotel pickup and drop-off',
      'All transfers'
    ],
    images: ['images/tours/nile-cruise-1.jpg', 'images/tours/nile-cruise-2.jpg', 'images/tours/nile-cruise-3.jpg',"images/tours/nile-cruise-4.jpg","images/tours/nile-cruise-5.jpg"]
  },*/
  {
    id: "felucca",
    name: "Felucca Ride",
    category: "relaxation",
    duration: "1-2 Hours",
    description:
      "It's like a sailboat sailing at the time of the sunset. Including the pick up from the hotel and drop off.",
    highlights: [
      "Traditional sailboat experience",
      "Sunset on the Nile",
      "Peaceful and relaxing",
      "Photo opportunities",
    ],
    inclusions: [
      "Felucca ride",
      "Hotel transfers",
      "Refreshments",
      "Sunset timing",
    ],
    images: [
      "images/tours/felucca-1.jpg",
      "images/tours/felucca-2.jpg",
      "images/tours/felucca-3.jpg",
      "images/tours/felucca-4.jpg",
      "images/tours/felucca-5.jpg",
    ],
  },
  {
    id: "ain-el-sokhna",
    name: "Ain El Sokhna Beach",
    category: "relaxation",
    duration: "8 Hours",
    description:
      "Red Sea El Ain Elsokhna day tour. Relax a day away from the hustles of the city on the beach in El Ain Elsokhna swim, enjoy a sunny day and the views of the red sea mountains, have fun, and learn more about the red sea.",
    highlights: [
      "Beautiful Red Sea beach",
      "Swimming and water activities",
      "Day use at hotel resort",
      "Red Sea mountain views",
      "Relaxation away from city",
    ],
    inclusions: [
      "Day use at beach hotel",
      "Lunch",
      "Hotel pickup and drop-off",
      "All transfers",
      "Beach access",
    ],
    images: [
      "images/tours/sokhna-1.jpg",
      "images/tours/sokhna-2.jpg",
      "images/tours/sokhna-3.jpg",
      "images/tours/sokhna-4.jpg",
      "images/tours/sokhna-5.jpg",
    ],
  },
  {
    id: "alexandria",
    name: "Alexandria Day Trip",
    category: "historical",
    duration: "12 Hours (7 AM - 7 PM)",
    description:
      "Alexandria's second-largest city in Egypt. A private car will pick you up from the hotel with a private tour guide.",
    highlights: [
      "Qaitbay Citadel",
      "Bibliotheca Alexandrina (Library of Alexandria)",
      "Catacombs of Kom El Shoqafa",
      "Pompey's Pillar",
      "Seafood lunch at Fish Market restaurant",
    ],
    inclusions: [
      "Private car and driver",
      "Private tour guide",
      "All entrance fees",
      "Seafood lunch",
      "Hotel pickup and drop-off",
    ],
    images: [
      "images/tours/alexandria-1.jpg",
      "images/tours/alexandria-2.jpg",
      "images/tours/alexandria-3.jpg",
      "images/tours/alexandria-4.jpg",
      "images/tours/alexandria-5.jpg",
    ],
  },
  {
    id: "fayoum",
    name: "El Fayoum Oasis",
    category: "adventure",
    duration: "12 Hours",
    description:
      "Day tour Fayoum Oasis. All visits are in Wadi Hitan (Valley of Whales) located in the protected area of Wadi el Rayan. It was designated by UNESCO as a World Heritage site in recognition of the 40 million-year-old whale skeletons found there.",
    highlights: [
      "Wadi Hitan (Valley of Whales) - UNESCO World Heritage",
      "40 million-year-old whale fossils",
      "Wadi Rayan waterfalls",
      "Mudawara Mountain",
      "4x4 desert adventure",
    ],
    inclusions: [
      "4x4 car transportation",
      "Private tour guide",
      "Egyptian meal",
      "All entrance fees",
      "Hotel transfers",
    ],
    images: [
      "images/tours/fayoum-1.jpg",
      "images/tours/fayoum-2.jpg",
      "images/tours/fayoum-3.jpg",
      "images/tours/fayoum-4.jpg",
      "images/tours/fayoum-5.jpg",
    ],
  },
  {
    id: "luxor-east",
    name: "Luxor East Bank",
    category: "historical",
    duration: "Half Day",
    description:
      "Arrive at Luxor you will find our representative waiting for you to take you to your hotel then you will find a private tour guide and a private car waiting for you to start with the first day in Luxor to see the east bank of Luxor.",
    highlights: [
      "Luxor Temple - one of the most incredible temples",
      "Karnak Temples - greatest example of worship in history",
      "Obelisk of Ramses I",
      "Private Egyptologist guide",
    ],
    inclusions: [
      "Private car",
      "Private English Egyptologist guide",
      "Hotel transfers in Luxor",
      "Entrance fees",
    ],
    images: [
      "images/tours/luxor-east-1.jpg",
      "images/tours/luxor-east-2.jpg",
      "images/tours/luxor-east-3.jpg",
      "images/tours/luxor-east-4.jpg",
      "images/tours/luxor-east-5.jpg",
    ],
  },
  {
    id: "luxor-west",
    name: "Luxor West Bank",
    category: "historical",
    duration: "Half Day",
    description:
      "The private car and private guide will pick you up from your hotel to Luxor West Bank.",
    highlights: [
      "Valley of the Kings - tombs of Ramses and Tutankhamun",
      "Hatshepsut Temple",
      "Valley of the Queens",
      "Ancient royal burial sites",
    ],
    inclusions: [
      "Private car and guide",
      "All entrance tickets",
      "Hotel pickup and drop-off",
      "Water",
    ],
    images: [
      "images/tours/luxor-west-1.jpg",
      "images/tours/luxor-west-2.jpg",
      "images/tours/luxor-west-3.jpg",
      "images/tours/luxor-west-4.jpg",
      "images/tours/luxor-west-5.jpg",
    ],
  },
  {
    id: "aswan",
    name: "Aswan Day Tour",
    category: "historical",
    duration: "Full Day",
    description:
      "Our representative will pick you up from your hotel in Aswan to enjoy a day tour in the amazing city of Aswan.",
    highlights: [
      "Aswan High Dam",
      "Unfinished Obelisk - ancient cutting techniques",
      "Philae Temple - dedicated to Goddess Isis",
      "Scenic Nile views",
    ],
    inclusions: [
      "Hotel pickup and drop-off in Aswan",
      "All entrance fees",
      "Egyptologist guide",
      "Transportation",
    ],
    images: [
      "images/tours/aswan-1.jpg",
      "images/tours/aswan-2.jpg",
      "images/tours/aswan-3.jpg",
      "images/tours/aswan-4.jpg",
      "images/tours/aswan-5.jpg",
    ],
  },
  {
    id: "abu-simbel",
    name: "Abu Simbel Day Trip",
    category: "historical",
    duration: "Full Day",
    description:
      "Enjoy your Abu Simbel day trip from Aswan. The main attraction is the great sun temple of Ramses II and the temple of Queen Nefertari.",
    highlights: [
      "Great Sun Temple of Ramses II",
      "Temple of Queen Nefertari",
      "Four colossal statues of Ramses II",
      "UNESCO World Heritage Site",
      "Ancient Nubian monuments",
    ],
    inclusions: [
      "Private air-conditioned car",
      "Hotel pickup and drop-off in Aswan",
      "Professional guide",
      "Entrance fees",
      "Time for photos",
    ],
    images: [
      "images/tours/abu-simbel-1.jpg",
      "images/tours/abu-simbel-2.jpg",
      "images/tours/abu-simbel-3.jpg",
      "images/tours/abu-simbel-4.jpg",
      "images/tours/abu-simbel-5.jpg",
    ],
  },
  {
    id: "white-desert",
    name: "Bahariya Oasis & White Desert",
    category: "adventure",
    duration: "2 Days / 1 Night",
    description:
      "Bahariya Oasis – White desert, Black desert – El Hez – the Crystal mountain – Valley of Agabat – El Sharkia – El Mazraq – camping. Return to Bahariya, breakfast in hotel, transfer back to Cairo and end the tour.",
    highlights: [
      "White Desert - surreal rock formations",
      "Black Desert volcanic landscape",
      "Crystal Mountain",
      "Valley of Agabat",
      "Desert camping under stars",
      "Sunrise in the desert",
    ],
    inclusions: [
      "4x4 Toyota Land Cruiser",
      "Single and double dome-shaped tents",
      "Camping equipment",
      "2 bottles of mineral water per day + 1 soft drink",
      "All meals",
      "Professional guide",
    ],
    images: [
      "images/tours/white-desert-1.jpg",
      "images/tours/white-desert-2.jpg",
      "images/tours/white-desert-3.jpg",
      "images/tours/white-desert-4.jpg",
      "images/tours/white-desert-5.jpg",
    ],
  },
  {
    id: "quad-bike",
    name: "Quad Bike Desert Safari",
    category: "adventure",
    duration: "1 Hour",
    description:
      "Adventure safari of Quad biking to discover the beauty of the desert at sunrise or sunset. Available every day.",
    highlights: [
      "Quad bike adventure",
      "Desert exploration",
      "Sunrise or sunset timing",
      "Thrilling experience",
      "Desert landscapes",
    ],
    inclusions: [
      "Quad bike rental",
      "Safety equipment",
      "Hotel pickup and drop-off",
      "Professional instruction",
      "1 hour desert ride",
    ],
    images: [
      "images/tours/quad-1.jpg",
      "images/tours/quad-2.jpg",
      "images/tours/quad-3.jpg",
      "images/tours/quad-4.jpg",
      "images/tours/quad-5.jpg",
    ],
  },
];

// Global tour state
let currentTourFilter = "all";
let currentTourImages = [];
let currentImageIndex = 0;
let selectedTour = null;

// Initialize Tour Section
function initializeTours() {
  renderTours(toursData);

  // Search functionality
  const searchInput = document.getElementById("tourSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const filteredTours = toursData.filter(
        (tour) =>
          tour.name.toLowerCase().includes(searchTerm) ||
          tour.description.toLowerCase().includes(searchTerm) ||
          tour.category.toLowerCase().includes(searchTerm),
      );
      renderTours(
        currentTourFilter === "all"
          ? filteredTours
          : filteredTours.filter((t) => t.category === currentTourFilter),
      );
    });
  }

  // Filter functionality
  const filterButtons = document.querySelectorAll(".tour-filter-btn");
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const filter = btn.getAttribute("data-filter");
      currentTourFilter = filter;

      if (filter === "all") {
        renderTours(toursData);
      } else {
        const filtered = toursData.filter((tour) => tour.category === filter);
        renderTours(filtered);
      }

      // Clear search when changing filter
      if (searchInput) searchInput.value = "";
    });
  });

  // Tour guide checkbox
  const guideCheckbox = document.getElementById("tourNeedGuide");
  const languageGroup = document.getElementById("tourGuideLanguageGroup");

  if (guideCheckbox && languageGroup) {
    guideCheckbox.addEventListener("change", () => {
      languageGroup.style.display = guideCheckbox.checked ? "block" : "none";
    });
  }

  // Booking form submission
  const bookingForm = document.getElementById("tourBookingForm");
  if (bookingForm) {
    bookingForm.addEventListener("submit", handleTourBooking);
  }
}

// Render tours grid
function renderTours(tours) {
  const grid = document.getElementById("toursGrid");
  if (!grid) return;

  if (tours.length === 0) {
    grid.innerHTML =
      '<div class="no-tours-message"><i class="fas fa-search"></i><p>No tours found matching your criteria</p></div>';
    return;
  }

  grid.innerHTML = tours
    .map(
      (tour) => `
    <div class="tour-card" onclick="openTourDetail('${tour.id}')">
      <img src="${tour.images[0]}" alt="${tour.name}" class="tour-card-image" onerror="this.src='https://via.placeholder.com/400x300/1c1c24/d4af37?text=${encodeURIComponent(tour.name)}'">
      <div class="tour-card-content">
        <div class="tour-card-header">
          <h3 class="tour-card-title">${tour.name}</h3>
          <span class="tour-card-category">${tour.category}</span>
        </div>
        <p class="tour-card-description">${tour.description}</p>
        <div class="tour-card-meta">
          <span class="tour-duration">
            <i class="fas fa-clock"></i> ${tour.duration}
          </span>
          <span class="tour-card-cta">
            View Details <i class="fas fa-arrow-right"></i>
          </span>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// Open tour detail modal
function openTourDetail(tourId) {
  const tour = toursData.find((t) => t.id === tourId);
  if (!tour) return;

  selectedTour = tour;
  currentTourImages = tour.images;
  currentImageIndex = 0;

  // Init counter
  const curr = document.getElementById("galleryCurrentIndex");
  const total = document.getElementById("galleryTotalCount");
  if (curr) curr.textContent = "01";
  if (total) total.textContent = String(tour.images.length).padStart(2, "0");
  const bar = document.getElementById("galleryProgressBar");
  if (bar) bar.style.transform = `scaleX(${1 / tour.images.length})`;

  // Build dot indicators
  const dotsContainer = document.getElementById("galleryDots");
  if (dotsContainer) {
    dotsContainer.innerHTML = "";
    tour.images.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.className = "gallery-dot" + (i === 0 ? " active" : "");
      dot.setAttribute("aria-label", `Go to image ${i + 1}`);
      dot.onclick = () => {
        currentImageIndex = i;
        updateTourImage();
      };
      dotsContainer.appendChild(dot);
    });
  }

  const modal = document.getElementById("tourDetailModal");
  const mainImage = document.getElementById("tourMainImage");
  const title = document.getElementById("tourDetailTitle");
  const duration = document.getElementById("tourDetailDuration");
  const category = document.getElementById("tourDetailCategory");
  const description = document.getElementById("tourDetailDescription");
  const highlights = document.getElementById("tourHighlights");
  const inclusions = document.getElementById("tourInclusions");
  const thumbnails = document.getElementById("tourThumbnails");

  // Set content
  mainImage.src = tour.images[0];
  mainImage.onerror = function () {
    this.src = `https://via.placeholder.com/800x450/1c1c24/d4af37?text=${encodeURIComponent(tour.name)}`;
  };
  title.textContent = tour.name;
  duration.textContent = tour.duration;
  category.textContent = tour.category;
  description.textContent = tour.description;

  // Highlights
  highlights.innerHTML = `
    <h3><i class="fas fa-star"></i> Highlights</h3>
    <ul>${tour.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
  `;

  // Inclusions
  inclusions.innerHTML = `
    <h3><i class="fas fa-check-circle"></i> What's Included</h3>
    <ul>${tour.inclusions.map((i) => `<li>${i}</li>`).join("")}</ul>
  `;

  // Thumbnails
  thumbnails.innerHTML = tour.images
    .map(
      (img, index) => `
    <img src="${img}" 
         alt="${tour.name} ${index + 1}" 
         class="tour-thumbnail ${index === 0 ? "active" : ""}" 
         onclick="selectTourImage(${index})"
         onerror="this.src='https://via.placeholder.com/150x100/1c1c24/d4af37?text=Image+${index + 1}'">
  `,
    )
    .join("");

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// Close tour detail modal
function closeTourDetail() {
  const modal = document.getElementById("tourDetailModal");
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

// Navigate tour images
function prevTourImage() {
  currentImageIndex =
    (currentImageIndex - 1 + currentTourImages.length) %
    currentTourImages.length;
  updateTourImage();
}

function nextTourImage() {
  currentImageIndex = (currentImageIndex + 1) % currentTourImages.length;
  updateTourImage();
}

function selectTourImage(index) {
  currentImageIndex = index;
  updateTourImage();
}

function updateTourImage() {
  const mainImage = document.getElementById("tourMainImage");

  // Crossfade transition
  mainImage.style.opacity = "0";
  mainImage.style.transform = "scale(1.02)";
  setTimeout(() => {
    mainImage.src = currentTourImages[currentImageIndex];
    mainImage.onload = () => {
      mainImage.style.opacity = "1";
      mainImage.style.transform = "scale(1)";
    };
    // fallback if already cached
    if (mainImage.complete) {
      mainImage.style.opacity = "1";
      mainImage.style.transform = "scale(1)";
    }
  }, 180);

  // Update counter
  const curr = document.getElementById("galleryCurrentIndex");
  const total = document.getElementById("galleryTotalCount");
  if (curr) curr.textContent = String(currentImageIndex + 1).padStart(2, "0");
  if (total)
    total.textContent = String(currentTourImages.length).padStart(2, "0");

  // Update progress bar
  const bar = document.getElementById("galleryProgressBar");
  if (bar)
    bar.style.transform = `scaleX(${(currentImageIndex + 1) / currentTourImages.length})`;

  // Update dots
  document.querySelectorAll(".gallery-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === currentImageIndex);
  });

  // Update thumbnail active state
  document.querySelectorAll(".tour-thumbnail").forEach((thumb, index) => {
    thumb.classList.toggle("active", index === currentImageIndex);
  });
}

// Show booking modal
function showTourBooking() {
  if (!selectedTour) return;

  closeTourDetail();

  const modal = document.getElementById("tourBookingModal");
  const tourName = document.getElementById("selectedTourName");
  const tourIdInput = document.getElementById("selectedTourId");

  tourName.textContent = selectedTour.name;
  tourIdInput.value = selectedTour.id;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

// Close booking modal
function closeTourBooking() {
  const modal = document.getElementById("tourBookingModal");
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

// Handle tour booking submission
async function handleTourBooking(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  // Get tour details
  const tour = toursData.find((t) => t.id === data.selectedTourId);

  if (!tour) {
    showNotification("Please select a tour first.", "error");
    return;
  }

  if (!validateGuestRoom(data.tourRoomNumber, "tourRoomNumber")) return;

  const message =
    "🗺️ TOUR BOOKING REQUEST\n\n" +
    `👤 Guest Name: ${data.tourCustomerName}\n` +
    `🏨 Room Number: ${data.tourRoomNumber}\n\n` +
    `📍 Tour: ${tour.name}\n` +
    `🏷️ Category: ${tour.category}\n` +
    `⏱️ Duration: ${tour.duration}\n` +
    `📅 Date: ${data.tourDate}\n` +
    `🕐 Time: ${data.tourTime}\n` +
    `👥 Participants: ${data.tourParticipants}\n` +
    `🧭 Tour Guide: ${data.tourNeedGuide ? "Required" : "Not required"}\n` +
    (data.tourNeedGuide && data.tourGuideLanguage
      ? `🗣️ Guide Language: ${data.tourGuideLanguage}\n`
      : "") +
    `📝 Special Requests: ${data.tourSpecialRequests || "None"}\n` +
    `\n📅 Request Date: ${new Date().toLocaleDateString()}\n` +
    `🕐 Request Time: ${new Date().toLocaleTimeString()}\n`;

  // Save for Reception (they can edit / delete it from the Tour Bookings panel). Room + guest name are taken from the logged-in guest on the server.
  try {
    if (window.DyafaStore)
      window.DyafaStore.addTour({
        tourId: tour.id,
        tourName: tour.name,
        category: tour.category,
        duration: tour.duration,
        date: data.tourDate,
        time: data.tourTime,
        participants: parseInt(data.tourParticipants) || 1,
        guide: !!data.tourNeedGuide,
        guideLanguage: data.tourNeedGuide ? data.tourGuideLanguage || "" : "",
        notes: String(data.tourSpecialRequests || "").trim(),
      }).then(function (ok) {
        if (!ok) console.error("Could not save tour booking for Reception");
      });
  } catch (err) {
    console.error("Could not save tour booking for Reception:", err);
  }

  try {
    await postOrderToScript({
      subject: `Room ${data.tourRoomNumber} - Tour Booking Request`,
      message: message,
      roomNumber: data.tourRoomNumber,
    });

    showNotification(
      "Tour booking submitted successfully! We will contact you soon.",
      "success",
    );
    e.target.reset();
    closeTourBooking();
  } catch (error) {
    console.error("Booking error:", error);
    showNotification("Failed to submit booking. Please try again.", "error");
  }
}

// Make tour functions globally accessible
window.openTourDetail = openTourDetail;
window.closeTourDetail = closeTourDetail;
window.prevTourImage = prevTourImage;
window.nextTourImage = nextTourImage;
window.selectTourImage = selectTourImage;
window.showTourBooking = showTourBooking;
window.closeTourBooking = closeTourBooking;

// Update initialization to include tours
const originalDOMContentLoaded = document.addEventListener;
document.addEventListener("DOMContentLoaded", () => {
  initializeTours();
});
// Pizza Size Selector — Enhanced
document.addEventListener("click", function (e) {
  if (!e.target.classList.contains("size-btn")) return;

  const sizeBtn = e.target;
  const pizzaItem = sizeBtn.closest(".pizza-item");
  if (!pizzaItem) return;

  // Toggle active state among siblings
  const allSizeBtns = pizzaItem.querySelectorAll(".size-btn");
  allSizeBtns.forEach((b) => b.classList.remove("active"));
  sizeBtn.classList.add("active");

  const price = sizeBtn.getAttribute("data-price");
  const name = sizeBtn.getAttribute("data-base-name");
  const size = sizeBtn.getAttribute("data-size");

  // Update displayed price with animation
  const priceEl = pizzaItem.querySelector(".item-price");
  if (priceEl) {
    priceEl.classList.remove("price-updated");
    void priceEl.offsetWidth; // reflow to restart animation

    // Build price HTML with size badge
    priceEl.innerHTML = price + " $";
    priceEl.classList.add("price-updated");
  }

  // Update add button
  const addBtn = pizzaItem.querySelector(".add-btn");
  if (addBtn) {
    addBtn.setAttribute("data-price", price);
    addBtn.setAttribute("data-name", name + " (" + size + ")");
    // Pulse the add button
    addBtn.style.transform = "scale(1.2)";
    setTimeout(() => {
      addBtn.style.transform = "";
    }, 250);
  }
});

// Initialize pizza items with default size badge on load
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".pizza-item").forEach((item) => {
    const activeBtn = item.querySelector(".size-btn.active");
    const priceEl = item.querySelector(".item-price");
    if (activeBtn && priceEl) {
      const size = activeBtn.getAttribute("data-size");
      const price = activeBtn.getAttribute("data-price");
      priceEl.innerHTML = price + " $";
    }
  });
});
// ===== FLOATING ORDER BUTTON LOGIC =====
(function () {
  const floatingBtn = document.getElementById("floatingOrderBtn");
  const cartSection = document.querySelector(".cart-section");
  const splashScreen = document.getElementById("splashScreen");

  function scrollToCart() {
    if (cartSection) {
      cartSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  window.scrollToCart = scrollToCart;

  function updateFloatingBtn() {
    if (!floatingBtn) return;

    // Hide during splash screen
    if (
      splashScreen &&
      splashScreen.style.display !== "none" &&
      !splashScreen.classList.contains("fade-out")
    ) {
      floatingBtn.classList.add("hidden");
      return;
    }

    // Only show on food tab
    const foodPanel = document.getElementById("food");
    if (!foodPanel || !foodPanel.classList.contains("active")) {
      floatingBtn.classList.add("tab-hidden");
      floatingBtn.classList.remove("hidden");
      return;
    }
    floatingBtn.classList.remove("tab-hidden");

    // Hide when cart section is already visible
    if (cartSection) {
      const rect = cartSection.getBoundingClientRect();
      const windowHeight =
        window.innerHeight || document.documentElement.clientHeight;
      if (rect.top <= windowHeight - 60) {
        floatingBtn.classList.add("hidden");
      } else {
        floatingBtn.classList.remove("hidden");
      }
    }
  }

  window.addEventListener("scroll", updateFloatingBtn, { passive: true });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTimeout(updateFloatingBtn, 50));
  });

  const splashObserver = new MutationObserver(updateFloatingBtn);
  if (splashScreen) {
    splashObserver.observe(splashScreen, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  }

  updateFloatingBtn();
})();
