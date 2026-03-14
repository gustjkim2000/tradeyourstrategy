import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OAuth2Client } from "google-auth-library";
import { evaluateYesNoParity } from "./src/yesNoParityStrategy.js";
import { HOST, OrderType, PolymarketAccountService, Side } from "./src/polymarketAccountService.js";
import {
  addOwnedStrategy,
  createEmailUser,
  createSession,
  deleteSession,
  getOwnedStrategyIds,
  getUserBySession,
  signInEmailUser,
  upsertGoogleUser
} from "./src/persistence.js";
import { PolymarketLiveMonitor } from "./src/polymarketLiveMonitor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const liveMonitor = new PolymarketLiveMonitor();
const accountService = new PolymarketAccountService();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;

const state = {
  license: {
    purchased: false,
    licenseKey: null,
    activatedAt: null
  },
  polymarket: {
    connected: false,
    accountLabel: null,
    authMode: null,
    geoblocked: false,
    lastSyncAt: null
  },
  strategy: {
    strategyName: "YES/NO Parity Reversal",
    minEdge: 0.02,
    maxStake: 100,
    dailyLossLimit: 250,
    mode: "paper"
  },
  bot: {
    live: false,
    startedAt: null
  },
  marketplace: {
    listings: [
      {
        id: "yes-no-parity-reversal",
        title: "YES/NO Parity Reversal",
        creator: "Atlas Labs",
        price: 49,
        return30d: 18.4,
        subscribers: 248,
        description: "Detects YES and NO parity breaks and rotates into the opposite side when the spread widens.",
        tags: ["parity", "mean reversion", "polymarket"]
      },
      {
        id: "basket-lock-only",
        title: "Basket Lock Only",
        creator: "Northstar Quant",
        price: 79,
        return30d: 12.7,
        subscribers: 121,
        description: "Only enters when YES and NO asks combine below one and the basket can be locked cleanly.",
        tags: ["low risk", "basket", "hedged"]
      },
      {
        id: "event-momentum-swing",
        title: "Event Momentum Swing",
        creator: "Signal Harbor",
        price: 99,
        return30d: 24.9,
        subscribers: 86,
        description: "A faster event-driven rotation pack tuned for breakout narratives and fast repricing windows.",
        tags: ["momentum", "high beta", "swing"]
      }
    ]
  },
  liveMonitor: {
    status: {
      phase: "idle",
      message: "Waiting to initialize live monitor.",
      lastUpdatedAt: null
    }
  },
  performance: [0, 0.4, 1.2, 1.1, 2.6, 3.3, 4.1, 4.9, 5.4, 6.2, 6.8, 7.9, 8.6, 9.4, 10.8, 11.6, 12.2, 12.9, 13.4, 14.3, 14.1, 15.4, 16.2, 16.9, 16.7, 17.6, 18.1, 18.4],
  markets: [
    {
      name: "Fed Rate Cut 2026",
      yesAsk: 0.47,
      yesBid: 0.46,
      noAsk: 0.5,
      noBid: 0.49
    },
    {
      name: "BTC Above 120k",
      yesAsk: 0.67,
      yesBid: 0.66,
      noAsk: 0.38,
      noBid: 0.36
    },
    {
      name: "US Recession by Q4",
      yesAsk: 0.31,
      yesBid: 0.3,
      noAsk: 0.75,
      noBid: 0.73
    }
  ]
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function jsonWithHeaders(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function sessionCookie(sessionId, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  return `tys_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

function clearSessionCookie() {
  return "tys_session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
}

function generateLicenseKey() {
  return `PF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function buildSignals() {
  const liveSnapshot = liveMonitor.getSnapshot();
  state.liveMonitor.status = liveSnapshot.status;
  const sourceMarkets = liveSnapshot.markets.length > 0 ? liveSnapshot.markets : state.markets;

  return sourceMarkets.flatMap((market) => {
    const evaluation = evaluateYesNoParity(market, {
      minBasketEdge: state.strategy.minEdge,
      minReverseEdge: state.strategy.minEdge,
      maxStake: state.strategy.maxStake
    });

    return evaluation.signals.map((signal) => ({
      market: market.name,
      basketEntry: evaluation.metrics.basketEntry,
      detectedAt: new Date().toISOString(),
      ...signal
    }));
  });
}

function buildMetrics() {
  const signals = buildSignals();
  const cumulativeReturn = state.performance[state.performance.length - 1];
  const totalPnl = 2500 * (cumulativeReturn / 100);
  const winRate = 64 + signals.length * 2.6;

  return {
    cumulativeReturn,
    totalPnl,
    winRate,
    capitalDeployed: state.strategy.maxStake * Math.max(signals.length, 1) * 4,
    activeMarkets: signals.length + 9,
    signals
  };
}

function buildDashboardPayload(currentUser) {
  return {
    auth: {
      currentUser,
      authenticated: Boolean(currentUser)
    },
    license: state.license,
    polymarket: state.polymarket,
    strategy: state.strategy,
    bot: state.bot,
    marketplace: buildMarketplaceForCurrentUser(currentUser),
    liveMonitor: {
      ...state.liveMonitor,
      ...liveMonitor.getSnapshot()
    },
    performance: state.performance,
    metrics: buildMetrics()
  };
}

function getCurrentOwnedStrategyIds(currentUser) {
  return currentUser ? getOwnedStrategyIds(currentUser.id) : [];
}

function buildMarketplaceForCurrentUser(currentUser) {
  return {
    listings: state.marketplace.listings,
    ownedStrategyIds: getCurrentOwnedStrategyIds(currentUser)
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function serveStaticFile(res, filePath) {
  const content = await readFile(path.join(__dirname, filePath));
  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[ext] ?? "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
}

async function handleApi(req, res, currentUser) {
  const { method, url } = req;

  if (method === "GET" && url === "/health") {
    json(res, 200, {
      ok: true,
      status: "healthy",
      liveMonitor: liveMonitor.getSnapshot().status.phase
    });
    return true;
  }

  if (method === "GET" && url === "/api/dashboard") {
    const payload = buildDashboardPayload(currentUser);
    const connection = await accountService.getConnectionSnapshot();
    if (connection.connected) {
      payload.polymarket.connected = true;
      payload.polymarket.accountLabel = connection.address;
      payload.polymarket.authMode = String(connection.signatureType);
      payload.polymarket.lastSyncAt = new Date().toISOString();
      payload.polymarket.balance = connection.balance;
      payload.polymarket.connectionMode = connection.mode;
    } else if (connection.configured) {
      payload.polymarket.connectionMode = connection.mode;
      payload.polymarket.connectionError = connection.message;
    }
    json(res, 200, payload);
    return true;
  }

  if (method === "GET" && url === "/api/auth/config") {
    json(res, 200, {
      ok: true,
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID),
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      authenticated: Boolean(currentUser),
      currentUser
    });
    return true;
  }

  if (method === "POST" && url === "/api/auth/email") {
    const body = await parseBody(req);
    const mode = body.mode === "signup" ? "signup" : "signin";
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();

    if (!email || !password) {
      json(res, 400, { ok: false, error: "Email and password are required." });
      return true;
    }

    if (mode === "signup") {
      try {
        const user = createEmailUser({
          email,
          name: name || email.split("@")[0],
          password
        });
        const session = createSession(user.id);
        jsonWithHeaders(res, 200, {
          ok: true,
          currentUser: user
        }, {
          "Set-Cookie": sessionCookie(session.id, session.expiresAt)
        });
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to create account."
        });
      }
      return true;
    }

    try {
      const user = signInEmailUser({ email, password });
      const session = createSession(user.id);
      jsonWithHeaders(res, 200, {
        ok: true,
        currentUser: user
      }, {
        "Set-Cookie": sessionCookie(session.id, session.expiresAt)
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to sign in."
      });
    }
    return true;
  }

  if (method === "POST" && url === "/api/auth/google") {
    if (!googleClient) {
      json(res, 400, {
        ok: false,
        error: "Google sign-in is not configured on the server."
      });
      return true;
    }

    const body = await parseBody(req);
    const credential = String(body.credential || "");
    if (!credential) {
      json(res, 400, { ok: false, error: "Missing Google credential." });
      return true;
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();

      const user = upsertGoogleUser({
        id: payload.sub,
        email: payload.email,
        name: payload.name || payload.email,
        picture: payload.picture
      });
      const session = createSession(user.id);
      jsonWithHeaders(res, 200, {
        ok: true,
        currentUser: user
      }, {
        "Set-Cookie": sessionCookie(session.id, session.expiresAt)
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Google token verification failed."
      });
    }
    return true;
  }

  if (method === "POST" && url === "/api/auth/logout") {
    const cookies = parseCookies(req);
    deleteSession(cookies.tys_session);
    jsonWithHeaders(res, 200, { ok: true }, {
      "Set-Cookie": clearSessionCookie()
    });
    return true;
  }

  if (method === "POST" && url === "/api/purchase") {
    state.license.purchased = true;
    state.license.licenseKey = generateLicenseKey();
    state.license.activatedAt = new Date().toISOString();
    json(res, 200, {
      ok: true,
      license: state.license
    });
    return true;
  }

  if (method === "POST" && url === "/api/polymarket/connect") {
    const liveConnection = await accountService.getConnectionSnapshot();
    if (liveConnection.connected) {
      state.polymarket.connected = true;
      state.polymarket.accountLabel = liveConnection.address;
      state.polymarket.authMode = String(liveConnection.signatureType);
      state.polymarket.lastSyncAt = new Date().toISOString();
      state.polymarket.balance = liveConnection.balance;
      state.polymarket.connectionMode = liveConnection.mode;
      json(res, 200, {
        ok: true,
        polymarket: state.polymarket
      });
      return true;
    }

    const body = await parseBody(req);
    state.polymarket.connected = true;
    state.polymarket.accountLabel = body.accountLabel || "demo@polymarket";
    state.polymarket.authMode = body.authMode || "wallet-delegation";
    state.polymarket.lastSyncAt = new Date().toISOString();
    state.polymarket.connectionMode = "demo";
    json(res, 200, {
      ok: true,
      polymarket: state.polymarket
    });
    return true;
  }

  if (method === "GET" && url === "/api/polymarket/account") {
    json(res, 200, {
      ok: true,
      connection: await accountService.getConnectionSnapshot()
    });
    return true;
  }

  if (method === "GET" && url === "/api/polymarket/config") {
    json(res, 200, {
      ok: true,
      host: HOST,
      configured: accountService.isConfigured()
    });
    return true;
  }

  if (method === "GET" && url === "/api/polymarket/allowance") {
    try {
      json(res, 200, {
        ok: true,
        allowance: await accountService.getCollateralAllowance()
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch allowance."
      });
    }
    return true;
  }

  if (method === "POST" && url === "/api/orders/preview") {
    try {
      const body = await parseBody(req);
      const preview = await accountService.previewLimitOrder({
        tokenID: String(body.tokenID),
        price: Number(body.price),
        size: Number(body.size),
        side: body.side === "SELL" ? Side.SELL : Side.BUY
      });
      json(res, 200, {
        ok: true,
        preview
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to preview order."
      });
    }
    return true;
  }

  if (method === "POST" && url === "/api/orders/place") {
    try {
      const body = await parseBody(req);
      const result = await accountService.placeLimitOrder({
        tokenID: String(body.tokenID),
        price: Number(body.price),
        size: Number(body.size),
        side: body.side === "SELL" ? Side.SELL : Side.BUY,
        orderType: body.orderType === "GTD" ? OrderType.GTD : OrderType.GTC
      });
      json(res, 200, {
        ok: true,
        order: result
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to place order."
      });
    }
    return true;
  }

  if (method === "POST" && url === "/api/strategy") {
    const body = await parseBody(req);
    state.strategy = {
      ...state.strategy,
      strategyName: body.strategyName ?? state.strategy.strategyName,
      minEdge: Number(body.minEdge ?? state.strategy.minEdge),
      maxStake: Number(body.maxStake ?? state.strategy.maxStake),
      dailyLossLimit: Number(body.dailyLossLimit ?? state.strategy.dailyLossLimit),
      mode: body.mode ?? state.strategy.mode
    };
    json(res, 200, {
      ok: true,
      strategy: state.strategy,
      metrics: buildMetrics()
    });
    return true;
  }

  if (method === "GET" && url === "/api/marketplace") {
    json(res, 200, {
      ok: true,
      marketplace: buildMarketplaceForCurrentUser(currentUser)
    });
    return true;
  }

  if (method === "GET" && url === "/api/live-monitor") {
    json(res, 200, {
      ok: true,
      liveMonitor: liveMonitor.getSnapshot()
    });
    return true;
  }

  const purchaseMatch = url.match(/^\/api\/marketplace\/([^/]+)\/purchase$/);
  if (method === "POST" && purchaseMatch) {
    if (!currentUser) {
      json(res, 401, {
        ok: false,
        error: "Sign in before purchasing a strategy."
      });
      return true;
    }

    const strategyId = purchaseMatch[1];
    addOwnedStrategy(currentUser.id, strategyId);
    json(res, 200, {
      ok: true,
      marketplace: buildMarketplaceForCurrentUser(currentUser)
    });
    return true;
  }

  const applyMatch = url.match(/^\/api\/marketplace\/([^/]+)\/apply$/);
  if (method === "POST" && applyMatch) {
    const strategyId = applyMatch[1];
    const listing = state.marketplace.listings.find((item) => item.id === strategyId);
    if (!listing) {
      json(res, 404, {
        ok: false,
        error: "Strategy not found."
      });
      return true;
    }

    if (!getCurrentOwnedStrategyIds(currentUser).includes(strategyId)) {
      json(res, 403, {
        ok: false,
        error: "Purchase this strategy before applying it."
      });
      return true;
    }

    state.strategy.strategyName = listing.title;
    json(res, 200, {
      ok: true,
      strategy: state.strategy,
      marketplace: buildMarketplaceForCurrentUser(currentUser),
      metrics: buildMetrics()
    });
    return true;
  }

  if (method === "POST" && url === "/api/bot/activate") {
    if (!state.polymarket.connected) {
      json(res, 400, {
        ok: false,
        error: "Polymarket account must be connected before activation."
      });
      return true;
    }

    state.bot.live = true;
    state.bot.startedAt = new Date().toISOString();
    state.strategy.mode = "live";
    state.performance = state.performance.map((value, index) => value + Math.sin(index / 3) * 0.4 + 0.6);

    json(res, 200, {
      ok: true,
      bot: state.bot,
      metrics: buildMetrics(),
      performance: state.performance
    });
    return true;
  }

  if (method === "GET" && url === "/api/signals") {
    json(res, 200, {
      ok: true,
      signals: buildMetrics().signals
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const currentUser = getUserBySession(parseCookies(req).tys_session);

    if (await handleApi(req, res, currentUser)) {
      return;
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      await serveStaticFile(res, "index.html");
      return;
    }

    if (req.method === "GET" && req.url === "/styles.css") {
      await serveStaticFile(res, "styles.css");
      return;
    }

    if (req.method === "GET" && req.url === "/app.js") {
      await serveStaticFile(res, "app.js");
      return;
    }

    if (req.method === "GET" && req.url === "/src/yesNoParityStrategy.js") {
      await serveStaticFile(res, "src/yesNoParityStrategy.js");
      return;
    }

    json(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Trade your Strategy server listening on http://localhost:${port}`);
});

liveMonitor.start().catch((error) => {
  console.error("Failed to initialize Polymarket live monitor:", error);
});
