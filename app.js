const state = {
  dashboard: null,
  loading: false,
  authMode: "signin",
  authConfig: null
};

const elements = {
  authView: document.querySelector("#authView"),
  dashboardView: document.querySelector("#dashboardView"),
  myStrategiesView: document.querySelector("#myStrategiesView"),
  topbar: document.querySelector("#topbar"),
  topbarUser: document.querySelector("#topbarUser"),
  logoutButton: document.querySelector("#logoutButton"),
  authAccountReveal: document.querySelector("#authAccountReveal"),
  heroAccountReveal: document.querySelector("#heroAccountReveal"),
  splashScreen: document.querySelector("#splashScreen"),
  enterButton: document.querySelector("#enterButton"),
  showSignIn: document.querySelector("#showSignIn"),
  showSignUp: document.querySelector("#showSignUp"),
  authForm: document.querySelector("#authForm"),
  authName: document.querySelector("#authName"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authSubmit: document.querySelector("#authSubmit"),
  authMessage: document.querySelector("#authMessage"),
  googleAuthMount: document.querySelector("#googleAuthMount"),
  googleFallbackButton: document.querySelector("#googleFallbackButton"),
  googleAuthHint: document.querySelector("#googleAuthHint"),
  nameField: document.querySelector("#nameField"),
  openMyStrategies: document.querySelector("#openMyStrategies"),
  backToDashboard: document.querySelector("#backToDashboard"),
  marketplaceGrid: document.querySelector("#marketplaceGrid"),
  marketplaceSummary: document.querySelector("#marketplaceSummary"),
  ownedStrategiesRow: document.querySelector("#ownedStrategiesRow"),
  myStrategiesGrid: document.querySelector("#myStrategiesGrid"),
  librarySummary: document.querySelector("#librarySummary"),
  strategyPicker: document.querySelector("#strategyPicker"),
  purchaseButton: document.querySelector("#purchaseButton"),
  connectShortcut: document.querySelector("#connectShortcut"),
  connectButton: document.querySelector("#connectButton"),
  activateButton: document.querySelector("#activateButton"),
  strategySelect: document.querySelector("#strategySelect"),
  edgeInput: document.querySelector("#edgeInput"),
  stakeInput: document.querySelector("#stakeInput"),
  lossInput: document.querySelector("#lossInput"),
  edgeValue: document.querySelector("#edgeValue"),
  stakeValue: document.querySelector("#stakeValue"),
  lossValue: document.querySelector("#lossValue"),
  connectionTitle: document.querySelector("#connectionTitle"),
  connectionPill: document.querySelector("#connectionPill"),
  connectHint: document.querySelector("#connectHint"),
  configStatus: document.querySelector("#configStatus"),
  liveStatus: document.querySelector("#liveStatus"),
  botStatus: document.querySelector("#botStatus"),
  executionMode: document.querySelector("#executionMode"),
  liveMonitorPill: document.querySelector("#liveMonitorPill"),
  cumulativeReturn: document.querySelector("#cumulativeReturn"),
  totalPnl: document.querySelector("#totalPnl"),
  winRate: document.querySelector("#winRate"),
  capitalDeployed: document.querySelector("#capitalDeployed"),
  heroReturn: document.querySelector("#heroReturn"),
  chart: document.querySelector("#performanceChart"),
  signalList: document.querySelector("#signalList"),
  miniSignals: document.querySelector("#miniSignals"),
  timelineSteps: [...document.querySelectorAll(".timeline-step")]
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "API request failed");
  }

  return payload;
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function getSignals() {
  return state.dashboard?.metrics?.signals || [];
}

function getMarketplace() {
  return state.dashboard?.marketplace || {
    listings: [],
    ownedStrategyIds: []
  };
}

function getLiveMarkets() {
  return state.dashboard?.liveMonitor?.markets || [];
}

function showView(viewName) {
  const showAuth = viewName === "auth";
  const showLibrary = viewName === "library";
  const showDashboard = viewName === "dashboard";
  elements.authView.classList.toggle("is-active", showAuth);
  elements.dashboardView.classList.toggle("is-active", showDashboard);
  elements.myStrategiesView.classList.toggle("is-active", showLibrary);
}

function isAuthenticated() {
  return Boolean(state.dashboard?.auth?.authenticated);
}

function currentUser() {
  return state.dashboard?.auth?.currentUser || null;
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "signin";
  const signingUp = state.authMode === "signup";
  elements.showSignIn.classList.toggle("is-active", !signingUp);
  elements.showSignUp.classList.toggle("is-active", signingUp);
  elements.nameField.classList.toggle("is-hidden", !signingUp);
  elements.authSubmit.textContent = signingUp ? "Create Account" : "Sign In";
  elements.authMessage.textContent = signingUp
    ? "Create an account to access your purchased strategies."
    : "Use your account to unlock the marketplace and dashboard.";
}

function renderGoogleAuth() {
  const config = state.authConfig;
  if (!config?.googleEnabled || !config.googleClientId || !window.google?.accounts?.id) {
    elements.googleAuthHint.textContent = "Google sign-in loads when a Google client ID is configured.";
    elements.googleAuthMount.innerHTML = "";
    elements.googleFallbackButton.classList.remove("is-hidden");
    return;
  }

  elements.googleAuthHint.textContent = "Continue instantly with your Google account.";
  elements.googleFallbackButton.classList.add("is-hidden");
  window.google.accounts.id.initialize({
    client_id: config.googleClientId,
    callback: async (response) => {
      try {
        const payload = await api("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({ credential: response.credential })
        });
        state.dashboard = {
          ...state.dashboard,
          auth: {
            authenticated: true,
            currentUser: payload.currentUser
          }
        };
        showView("dashboard");
        await refreshDashboard();
      } catch (error) {
        elements.authMessage.textContent = error.message;
      }
    }
  });
  elements.googleAuthMount.innerHTML = "";
  window.google.accounts.id.renderButton(elements.googleAuthMount, {
    theme: "outline",
    size: "large",
    width: 360,
    shape: "pill"
  });
}

function renderTopbar() {
  const user = currentUser();
  elements.topbar.classList.toggle("is-hidden", !user);
  if (!user) {
    elements.topbarUser.textContent = "Signed out";
    return;
  }

  elements.topbarUser.textContent = `${user.name} • ${user.email}`;
}

function renderTickerMarkets(markets) {
  const tickerMarkets = markets.length > 1 ? [...markets, ...markets] : markets;
  elements.miniSignals.classList.toggle("is-animated", markets.length > 1);
  elements.miniSignals.innerHTML = tickerMarkets.map((market) => `
    <article class="mini-signal">
      <span>${market.name}</span>
      <strong>YES ${market.yesBid?.toFixed(3) ?? "--"} / ${market.yesAsk?.toFixed(3) ?? "--"}</strong>
      <small>NO ${market.noBid?.toFixed(3) ?? "--"} / ${market.noAsk?.toFixed(3) ?? "--"}</small>
    </article>
  `).join("");
}

function renderTickerSignals(signals) {
  const tickerSignals = signals.length > 1 ? [...signals, ...signals] : signals;
  elements.miniSignals.classList.toggle("is-animated", signals.length > 1);
  elements.miniSignals.innerHTML = tickerSignals.map((signal) => `
    <article class="mini-signal">
      <span>${signal.market}</span>
      <strong>${signal.side === "buy-both" ? "Buy YES + NO" : signal.side === "buy-no" ? "Buy NO" : "Buy YES"}</strong>
      <small>edge ${formatPercent(signal.edge * 100)}</small>
    </article>
  `).join("");
}

function renderMiniSignals(signals) {
  if (signals.length === 0) {
    const liveMarkets = getLiveMarkets();
    if (liveMarkets.length > 0) {
      renderTickerMarkets(liveMarkets.slice(0, 6));
      return;
    }

    elements.miniSignals.classList.remove("is-animated");
    elements.miniSignals.innerHTML = `
      <article class="mini-signal">
        <span>Live monitor</span>
        <strong>Waiting for live Polymarket quotes</strong>
        <small>Streaming top of book data</small>
      </article>
    `;
    return;
  }

  renderTickerSignals(signals.slice(0, 6));
}

function renderSignals(signals) {
  if (signals.length === 0) {
    const liveMarkets = getLiveMarkets();
    if (liveMarkets.length > 0) {
      elements.signalList.innerHTML = liveMarkets.slice(0, 6).map((market) => `
        <article class="signal-item">
          <div class="signal-meta">
            <span class="signal-chip">${market.name}</span>
            <span class="signal-chip">live book</span>
          </div>
          <strong>YES bid ${market.yesBid?.toFixed(3) ?? "--"} | YES ask ${market.yesAsk?.toFixed(3) ?? "--"}</strong>
          <p>NO bid ${market.noBid?.toFixed(3) ?? "--"} | NO ask ${market.noAsk?.toFixed(3) ?? "--"}</p>
          <small>Updated ${market.updatedAt ? new Date(market.updatedAt).toLocaleTimeString() : "just now"}</small>
        </article>
      `).join("");
      return;
    }

    elements.signalList.innerHTML = `
      <article class="signal-item">
        <strong>No actionable live spread yet</strong>
        <p>The monitor is connected, but no market currently clears the edge threshold.</p>
        <small>Waiting for the next live quote update</small>
      </article>
    `;
    return;
  }

  elements.signalList.innerHTML = signals.map((signal) => `
    <article class="signal-item">
      <div class="signal-meta">
        <span class="signal-chip">${signal.market}</span>
        <span class="signal-chip ${signal.type === "buy-basket" ? "" : "warning"}">${signal.type}</span>
      </div>
      <strong>${signal.side === "buy-both" ? "Buy YES and NO together" : signal.side === "buy-no" ? "YES looks rich, buy NO" : "NO looks rich, buy YES"}</strong>
      <p>${signal.reason}</p>
      <small>entry ${signal.basketEntry.toFixed(2)} | shares ${signal.shares} | edge ${formatPercent(signal.edge * 100)}</small>
    </article>
  `).join("");
}

function renderMarketplace() {
  const marketplace = getMarketplace();
  const owned = new Set(marketplace.ownedStrategyIds || []);

  elements.marketplaceSummary.textContent = `${marketplace.listings.length} strategies live • ${owned.size} owned`;
  elements.marketplaceGrid.innerHTML = marketplace.listings.map((listing) => {
    const isOwned = owned.has(listing.id);
    const isActive = state.dashboard?.strategy?.strategyName === listing.title;

    return `
      <article class="market-card">
        <div class="market-card-header">
          <div>
            <p class="eyebrow">${listing.creator}</p>
            <h3>${listing.title}</h3>
          </div>
          <span class="status-pill ${isActive ? "online" : "warm"}">${isActive ? "active" : isOwned ? "owned" : "market"}</span>
        </div>
        <p>${listing.description}</p>
        <div class="market-meta">
          ${listing.tags.map((tag) => `<span class="market-tag">${tag}</span>`).join("")}
        </div>
        <div class="market-stats">
          <div class="market-stat">
            <span>Price</span>
            <strong>${formatCurrency(listing.price)}</strong>
          </div>
          <div class="market-stat">
            <span>30D Return</span>
            <strong>${formatPercent(listing.return30d)}</strong>
          </div>
          <div class="market-stat">
            <span>Subscribers</span>
            <strong>${listing.subscribers}</strong>
          </div>
          <div class="market-stat">
            <span>Creator</span>
            <strong>${listing.creator}</strong>
          </div>
        </div>
        <div class="market-actions">
          <button class="ghost-button" data-market-action="purchase" data-strategy-id="${listing.id}">
            ${isOwned ? "Purchased" : `Buy ${formatCurrency(listing.price)}`}
          </button>
          <button class="primary-button" data-market-action="apply" data-strategy-id="${listing.id}" ${isOwned ? "" : "disabled"}>
            ${isActive ? "Applied" : "Apply"}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderStrategyPicker(options, selected) {
  elements.strategyPicker.innerHTML = options.map((title) => `
    <button
      type="button"
      class="strategy-option ${title === selected ? "is-selected" : ""}"
      data-strategy-option="${title}"
    >
      ${title}
    </button>
  `).join("");
}

function renderMyStrategies() {
  const marketplace = getMarketplace();
  const ownedIds = new Set(marketplace.ownedStrategyIds || []);
  const ownedListings = marketplace.listings.filter((listing) => ownedIds.has(listing.id));

  elements.librarySummary.textContent = `${ownedListings.length} purchased strategies ready to apply.`;
  elements.ownedStrategiesRow.innerHTML = ownedListings.map((listing) => {
    const isActive = state.dashboard?.strategy?.strategyName === listing.title;
    return `
      <article class="market-card owned-card">
        <div class="market-card-header">
          <div>
            <p class="eyebrow">${listing.creator}</p>
            <h3>${listing.title}</h3>
          </div>
          <span class="status-pill ${isActive ? "online" : "cool"}">${isActive ? "active" : "owned"}</span>
        </div>
        <p>${listing.description}</p>
        <div class="market-meta">
          ${listing.tags.map((tag) => `<span class="market-tag">${tag}</span>`).join("")}
        </div>
        <div class="market-actions">
          <button class="primary-button" data-market-action="apply" data-strategy-id="${listing.id}">
            ${isActive ? "Applied" : "Apply"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  elements.myStrategiesGrid.innerHTML = ownedListings.map((listing) => {
    const isActive = state.dashboard?.strategy?.strategyName === listing.title;
    return `
      <article class="market-card">
        <div class="market-card-header">
          <div>
            <p class="eyebrow">${listing.creator}</p>
            <h3>${listing.title}</h3>
          </div>
          <span class="status-pill ${isActive ? "online" : "cool"}">${isActive ? "active" : "owned"}</span>
        </div>
        <p>${listing.description}</p>
        <div class="market-meta">
          ${listing.tags.map((tag) => `<span class="market-tag">${tag}</span>`).join("")}
        </div>
        <div class="market-stats">
          <div class="market-stat">
            <span>30D Return</span>
            <strong>${formatPercent(listing.return30d)}</strong>
          </div>
          <div class="market-stat">
            <span>Subscribers</span>
            <strong>${listing.subscribers}</strong>
          </div>
        </div>
        <div class="market-actions">
          <button class="primary-button" data-market-action="apply" data-strategy-id="${listing.id}">
            ${isActive ? "Applied" : "Apply"}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderChart() {
  const width = 640;
  const height = 240;
  const padding = 18;
  const values = state.dashboard?.performance || [0];
  const maxValue = Math.max(...values) + 1;
  const minValue = Math.min(...values) - 1;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / (maxValue - minValue)) * (height - padding * 2);
    return [x, y];
  });

  const linePath = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1][0]} ${height - padding} L ${points[0][0]} ${height - padding} Z`;
  const latest = points[points.length - 1];

  elements.chart.innerHTML = `
    <defs>
      <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#d45113" />
        <stop offset="100%" stop-color="#177245" />
      </linearGradient>
      <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(212, 81, 19, 0.26)" />
        <stop offset="100%" stop-color="rgba(212, 81, 19, 0.02)" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(255,255,255,0.42)"></rect>
    ${[0.25, 0.5, 0.75].map((ratio) => `
      <line
        x1="${padding}"
        y1="${padding + ratio * (height - padding * 2)}"
        x2="${width - padding}"
        y2="${padding + ratio * (height - padding * 2)}"
        stroke="rgba(36, 23, 15, 0.09)"
        stroke-dasharray="5 7"
      ></line>
    `).join("")}
    <path d="${areaPath}" fill="url(#areaGradient)"></path>
    <path d="${linePath}" fill="none" stroke="url(#lineGradient)" stroke-width="4" stroke-linecap="round"></path>
    <circle cx="${latest[0]}" cy="${latest[1]}" r="7" fill="#177245"></circle>
    <circle cx="${latest[0]}" cy="${latest[1]}" r="13" fill="rgba(23, 114, 69, 0.15)"></circle>
  `;
}

function setActiveStep(step) {
  elements.timelineSteps.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.step === step);
  });
}

function updateMetrics(signals) {
  const metrics = state.dashboard?.metrics;
  if (!metrics) {
    return;
  }

  elements.cumulativeReturn.textContent = formatPercent(metrics.cumulativeReturn);
  elements.totalPnl.textContent = `${metrics.totalPnl >= 0 ? "+" : ""}${formatCurrency(metrics.totalPnl)}`;
  elements.winRate.textContent = `${metrics.winRate.toFixed(1)}%`;
  elements.capitalDeployed.textContent = formatCurrency(metrics.capitalDeployed);
  elements.heroReturn.textContent = formatPercent(metrics.cumulativeReturn);
}

function updateConnectionUi() {
  const connected = state.dashboard?.polymarket?.connected;
  const live = state.dashboard?.bot?.live;
  const liveMonitor = state.dashboard?.liveMonitor;
  const livePhase = liveMonitor?.status?.phase || "idle";
  elements.liveMonitorPill.textContent = livePhase;
  elements.liveMonitorPill.className = `status-pill ${livePhase === "connected" ? "online" : livePhase === "error" ? "warm" : "cool"}`;

  if (!connected) {
    elements.connectionTitle.textContent = "Connect your account to unlock live automation.";
    elements.connectionPill.textContent = "not connected";
    elements.connectHint.textContent = "Connect your Polymarket account first.";
    elements.activateButton.disabled = true;
    elements.configStatus.textContent = "Pending";
    elements.configStatus.classList.add("muted");
    elements.liveStatus.textContent = "Standby";
    elements.liveStatus.classList.add("muted");
    elements.botStatus.textContent = "awaiting connection";
    elements.executionMode.textContent = "demo feed";
    setActiveStep("connect");
    return;
  }

  elements.connectionTitle.textContent = "Polymarket connected. Review your parameters and start automation.";
  elements.connectionPill.textContent = "connected";
  elements.connectHint.textContent = "Connection complete. Confirm your risk controls before going live.";
  elements.activateButton.disabled = false;
  elements.configStatus.textContent = "Configured";
  elements.configStatus.classList.remove("muted");
  elements.liveStatus.textContent = live ? "Live" : "Armed";
  elements.liveStatus.classList.toggle("muted", !live);
  elements.botStatus.textContent = live ? "bot live" : "armed";
  elements.executionMode.textContent = live ? "connected account" : "paper mode";
  setActiveStep(live ? "live" : "configure");
}

function syncControlsFromDashboard() {
  const strategy = state.dashboard?.strategy;
  const marketplace = getMarketplace();
  if (!strategy) {
    return;
  }

  const ownedTitles = marketplace.listings
    .filter((listing) => marketplace.ownedStrategyIds.includes(listing.id))
    .map((listing) => listing.title);
  const options = Array.from(new Set([...ownedTitles, "YES/NO Parity Reversal", "Basket Lock Only"]));
  elements.strategySelect.innerHTML = options.map((title) => `<option>${title}</option>`).join("");
  elements.strategySelect.value = strategy.strategyName;
  renderStrategyPicker(options, strategy.strategyName);
  elements.edgeInput.value = String(strategy.minEdge);
  elements.stakeInput.value = String(strategy.maxStake);
  elements.lossInput.value = String(strategy.dailyLossLimit);
  elements.edgeValue.textContent = `${(strategy.minEdge * 100).toFixed(1)}%`;
  elements.stakeValue.textContent = formatCurrency(strategy.maxStake);
  elements.lossValue.textContent = formatCurrency(strategy.dailyLossLimit);
}

function render() {
  const signals = getSignals();
  if (!isAuthenticated()) {
    showView("auth");
  }
  renderTopbar();
  syncControlsFromDashboard();
  renderMarketplace();
  renderMyStrategies();
  renderMiniSignals(signals);
  renderSignals(signals);
  renderChart();
  updateMetrics(signals);
  updateConnectionUi();
}

async function refreshDashboard() {
  state.loading = true;
  state.authConfig = await api("/api/auth/config");
  const payload = await api("/api/dashboard");
  state.dashboard = payload;
  state.loading = false;
  renderGoogleAuth();
  render();
}

function enterDashboard() {
  elements.splashScreen.classList.add("is-hidden");
  document.body.classList.remove("intro-active");
  showView(isAuthenticated() ? "dashboard" : "auth");
}

async function saveStrategy() {
  const payload = await api("/api/strategy", {
    method: "POST",
    body: JSON.stringify({
      strategyName: elements.strategySelect.value,
      minEdge: Number(elements.edgeInput.value),
      maxStake: Number(elements.stakeInput.value),
      dailyLossLimit: Number(elements.lossInput.value),
      mode: state.dashboard?.bot?.live ? "live" : "paper"
    })
  });

  state.dashboard = {
    ...state.dashboard,
    strategy: payload.strategy,
    metrics: payload.metrics
  };
  render();
}

elements.purchaseButton.addEventListener("click", async () => {
  setActiveStep("purchase");
  await api("/api/purchase", { method: "POST" });
  await refreshDashboard();
});

elements.enterButton.addEventListener("click", enterDashboard);
elements.showSignIn.addEventListener("click", () => setAuthMode("signin"));
elements.showSignUp.addEventListener("click", () => setAuthMode("signup"));
elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/api/auth/email", {
      method: "POST",
      body: JSON.stringify({
        mode: state.authMode,
        name: elements.authName.value,
        email: elements.authEmail.value,
        password: elements.authPassword.value
      })
    });
    state.dashboard = {
      ...state.dashboard,
      auth: {
        authenticated: true,
        currentUser: payload.currentUser
      }
    };
    elements.authMessage.textContent = `${payload.currentUser.name} is signed in.`;
    showView("dashboard");
    await refreshDashboard();
  } catch (error) {
    elements.authMessage.textContent = error.message;
  }
});
elements.googleFallbackButton.addEventListener("click", () => {
  elements.authMessage.textContent = "Set GOOGLE_CLIENT_ID on the server to enable real Google sign-in.";
});
elements.openMyStrategies.addEventListener("click", () => showView("library"));
elements.backToDashboard.addEventListener("click", () => showView("dashboard"));
elements.logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  state.dashboard = {
    ...state.dashboard,
    auth: {
      authenticated: false,
      currentUser: null
    },
    marketplace: {
      ...(state.dashboard?.marketplace || {}),
      ownedStrategyIds: []
    }
  };
  showView("auth");
  render();
});
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-account-toggle]");
  if (!target) {
    return;
  }

  const key = target.dataset.accountToggle;
  if (key === "auth") {
    elements.authAccountReveal.classList.toggle("is-hidden");
  }
  if (key === "hero") {
    elements.heroAccountReveal.classList.toggle("is-hidden");
  }
});
elements.splashScreen.addEventListener("click", (event) => {
  if (event.target === elements.splashScreen) {
    enterDashboard();
  }
});
elements.splashScreen.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    enterDashboard();
  }
});

elements.connectShortcut.addEventListener("click", async () => {
  await api("/api/polymarket/connect", {
    method: "POST",
    body: JSON.stringify({
      accountLabel: "buyer@polymarket",
      authMode: "wallet-delegation"
    })
  });
  await refreshDashboard();
});

elements.connectButton.addEventListener("click", async () => {
  await api("/api/polymarket/connect", {
    method: "POST",
    body: JSON.stringify({
      accountLabel: "buyer@polymarket",
      authMode: "wallet-delegation"
    })
  });
  await refreshDashboard();
});

elements.marketplaceGrid.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-market-action]");
  if (!target) {
    return;
  }

  const strategyId = target.dataset.strategyId;
  const action = target.dataset.marketAction;

  if (action === "purchase") {
    const payload = await api(`/api/marketplace/${strategyId}/purchase`, { method: "POST" });
    state.dashboard = {
      ...state.dashboard,
      marketplace: payload.marketplace
    };
    render();
    return;
  }

  if (action === "apply") {
    const payload = await api(`/api/marketplace/${strategyId}/apply`, { method: "POST" });
    state.dashboard = {
      ...state.dashboard,
      strategy: payload.strategy,
      marketplace: payload.marketplace,
      metrics: payload.metrics
    };
    render();
  }
});

elements.strategyPicker.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-strategy-option]");
  if (!target) {
    return;
  }

  elements.strategySelect.value = target.dataset.strategyOption;
  await saveStrategy();
});

elements.activateButton.addEventListener("click", async () => {
  await saveStrategy();
  const payload = await api("/api/bot/activate", { method: "POST" });
  state.dashboard = {
    ...state.dashboard,
    bot: payload.bot,
    performance: payload.performance,
    metrics: payload.metrics,
    strategy: {
      ...state.dashboard.strategy,
      mode: "live"
    }
  };
  render();
});

elements.strategySelect.addEventListener("change", saveStrategy);
elements.edgeInput.addEventListener("input", async () => {
  elements.edgeValue.textContent = `${(Number(elements.edgeInput.value) * 100).toFixed(1)}%`;
  await saveStrategy();
});
elements.stakeInput.addEventListener("input", async () => {
  elements.stakeValue.textContent = formatCurrency(Number(elements.stakeInput.value));
  await saveStrategy();
});
elements.lossInput.addEventListener("input", async () => {
  elements.lossValue.textContent = formatCurrency(Number(elements.lossInput.value));
  await saveStrategy();
});

refreshDashboard().catch((error) => {
  elements.authMessage.textContent = error.message;
});

window.setInterval(() => {
  refreshDashboard().catch(() => {
    // Keep the last good state on screen if a refresh fails.
  });
}, 4000);
