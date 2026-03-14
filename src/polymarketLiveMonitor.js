const GAMMA_MARKETS_URL = "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=24";
const MARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

function safeJsonParse(value, fallback) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeMarket(rawMarket) {
  const outcomes = safeJsonParse(rawMarket.outcomes, []);
  const tokenIds = safeJsonParse(rawMarket.clobTokenIds, []);

  if (!Array.isArray(outcomes) || !Array.isArray(tokenIds) || outcomes.length < 2 || tokenIds.length < 2) {
    return null;
  }

  const yesIndex = outcomes.findIndex((outcome) => String(outcome).toLowerCase() === "yes");
  const noIndex = outcomes.findIndex((outcome) => String(outcome).toLowerCase() === "no");

  if (yesIndex === -1 || noIndex === -1) {
    return null;
  }

  return {
    id: String(rawMarket.id ?? rawMarket.slug ?? tokenIds[0]),
    question: rawMarket.question || rawMarket.title || rawMarket.slug || "Untitled market",
    slug: rawMarket.slug || String(rawMarket.id ?? ""),
    liquidity: Number(rawMarket.liquidity ?? 0),
    volume24hr: Number(rawMarket.volume24hr ?? 0),
    yesTokenId: String(tokenIds[yesIndex]),
    noTokenId: String(tokenIds[noIndex])
  };
}

function parsePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function selectBestBid(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return null;
  }

  return levels.reduce((best, level) => {
    const price = parsePrice(level?.price ?? level);
    if (price === null) {
      return best;
    }
    return best === null || price > best ? price : best;
  }, null);
}

function selectBestAsk(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return null;
  }

  return levels.reduce((best, level) => {
    const price = parsePrice(level?.price ?? level);
    if (price === null) {
      return best;
    }
    return best === null || price < best ? price : best;
  }, null);
}

export class PolymarketLiveMonitor {
  constructor() {
    this.markets = [];
    this.marketByToken = new Map();
    this.snapshots = new Map();
    this.ws = null;
    this.status = {
      phase: "idle",
      message: "Waiting to initialize live monitor.",
      lastUpdatedAt: null
    };
    this.reconnectTimer = null;
  }

  async start() {
    try {
      this.status = {
        phase: "loading",
        message: "Fetching active Polymarket markets.",
        lastUpdatedAt: new Date().toISOString()
      };

      const response = await fetch(GAMMA_MARKETS_URL);
      if (!response.ok) {
        throw new Error(`Gamma API request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const markets = payload
        .map(normalizeMarket)
        .filter(Boolean)
        .sort((a, b) => (b.liquidity + b.volume24hr) - (a.liquidity + a.volume24hr))
        .slice(0, 12);

      if (markets.length === 0) {
        throw new Error("No binary Yes/No markets found from Gamma API.");
      }

      this.markets = markets;
      this.marketByToken.clear();
      this.snapshots.clear();

      for (const market of markets) {
        this.marketByToken.set(market.yesTokenId, { marketId: market.id, side: "yes" });
        this.marketByToken.set(market.noTokenId, { marketId: market.id, side: "no" });
        this.snapshots.set(market.id, {
          id: market.id,
          name: market.question,
          slug: market.slug,
          liquidity: market.liquidity,
          volume24hr: market.volume24hr,
          yesAsk: null,
          yesBid: null,
          noAsk: null,
          noBid: null,
          updatedAt: null
        });
      }

      this.connectSocket();
    } catch (error) {
      this.status = {
        phase: "error",
        message: error instanceof Error ? error.message : "Unknown live monitor error",
        lastUpdatedAt: new Date().toISOString()
      };
      this.scheduleReconnect();
    }
  }

  connectSocket() {
    if (this.ws) {
      this.ws.close();
    }

    this.status = {
      phase: "connecting",
      message: "Connecting to Polymarket market WebSocket.",
      lastUpdatedAt: new Date().toISOString()
    };

    this.ws = new WebSocket(MARKET_WS_URL);

    this.ws.addEventListener("open", () => {
      const assetIds = this.markets.flatMap((market) => [market.yesTokenId, market.noTokenId]);

      this.ws.send(JSON.stringify({
        type: "market",
        assets_ids: assetIds,
        custom_feature_enabled: true
      }));

      this.status = {
        phase: "connected",
        message: `Streaming ${this.markets.length} live markets from Polymarket.`,
        lastUpdatedAt: new Date().toISOString()
      };
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.handleSocketMessage(payload);
      } catch {
        // Ignore malformed frames and continue streaming.
      }
    });

    this.ws.addEventListener("close", () => {
      this.status = {
        phase: "reconnecting",
        message: "Live feed disconnected. Reconnecting.",
        lastUpdatedAt: new Date().toISOString()
      };
      this.scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      this.status = {
        phase: "error",
        message: "Live feed socket error.",
        lastUpdatedAt: new Date().toISOString()
      };
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.start().catch(() => {
        // The start() method already updates status and schedules the next reconnect.
      });
    }, 5_000);
  }

  handleSocketMessage(payload) {
    if (Array.isArray(payload)) {
      payload.forEach((entry) => this.handleSocketMessage(entry));
      return;
    }

    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.event_type === "best_bid_ask") {
      this.updateTopOfBook(payload.asset_id, payload.best_bid, payload.best_ask, payload.timestamp);
      return;
    }

    if (payload.event_type === "book" || payload.asset_id) {
      const bestBid = selectBestBid(payload.bids);
      const bestAsk = selectBestAsk(payload.asks);
      this.updateTopOfBook(payload.asset_id, bestBid, bestAsk, payload.timestamp);
    }
  }

  updateTopOfBook(assetId, bestBid, bestAsk, timestamp) {
    const tokenEntry = this.marketByToken.get(String(assetId));
    if (!tokenEntry) {
      return;
    }

    const snapshot = this.snapshots.get(tokenEntry.marketId);
    if (!snapshot) {
      return;
    }

    if (tokenEntry.side === "yes") {
      snapshot.yesBid = parsePrice(bestBid);
      snapshot.yesAsk = parsePrice(bestAsk);
    } else {
      snapshot.noBid = parsePrice(bestBid);
      snapshot.noAsk = parsePrice(bestAsk);
    }

    snapshot.updatedAt = timestamp ? new Date(Number(timestamp)).toISOString() : new Date().toISOString();
    this.status.lastUpdatedAt = snapshot.updatedAt;
  }

  getSnapshot() {
    const markets = Array.from(this.snapshots.values()).filter((market) =>
      [market.yesAsk, market.yesBid, market.noAsk, market.noBid].every((value) => value !== null)
    );

    return {
      status: this.status,
      markets: markets.sort((a, b) => {
        const left = (b.updatedAt ? Date.parse(b.updatedAt) : 0) - (a.updatedAt ? Date.parse(a.updatedAt) : 0);
        if (left !== 0) {
          return left;
        }
        return (b.liquidity + b.volume24hr) - (a.liquidity + a.volume24hr);
      })
    };
  }
}
