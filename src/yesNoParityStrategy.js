const DEFAULTS = {
  minBasketEdge: 0.02,
  minReverseEdge: 0.015,
  feePerShare: 0,
  maxStake: 100,
  maxSharesPerTrade: 100
};

function roundTo(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function clampPositive(value) {
  return value > 0 ? value : 0;
}

function validateQuote(market) {
  const requiredKeys = ["yesAsk", "yesBid", "noAsk", "noBid"];

  for (const key of requiredKeys) {
    if (typeof market[key] !== "number" || Number.isNaN(market[key])) {
      throw new Error(`Invalid market quote: ${key} must be a number`);
    }

    if (market[key] < 0 || market[key] > 1) {
      throw new Error(`Invalid market quote: ${key} must be between 0 and 1`);
    }
  }
}

function sizeTrade(entryPrice, config) {
  const sharesByCapital = Math.floor(config.maxStake / entryPrice);
  const shares = Math.min(config.maxSharesPerTrade, sharesByCapital);
  return clampPositive(shares);
}

export function evaluateYesNoParity(market, overrides = {}) {
  validateQuote(market);

  const config = { ...DEFAULTS, ...overrides };
  const basketEntry = market.yesAsk + market.noAsk;
  const basketEdge = 1 - basketEntry - (2 * config.feePerShare);

  const signals = [];

  if (basketEdge >= config.minBasketEdge) {
    const shares = Math.min(
      sizeTrade(market.yesAsk, config),
      sizeTrade(market.noAsk, config)
    );

    if (shares > 0) {
      signals.push({
        type: "buy-basket",
        side: "buy-both",
        shares,
        edge: roundTo(basketEdge),
        expectedProfit: roundTo(basketEdge * shares),
        reason: "YES ask + NO ask is below 1, so buying both sides locks in payout at settlement."
      });
    }
  }

  const yesOverpricedVsNo = market.yesAsk - (1 - market.noBid) - config.feePerShare;
  if (yesOverpricedVsNo >= config.minReverseEdge) {
    const shares = sizeTrade(market.noAsk, config);
    if (shares > 0) {
      signals.push({
        type: "buy-opposite",
        side: "buy-no",
        shares,
        edge: roundTo(yesOverpricedVsNo),
        expectedProfit: null,
        reason: "YES looks expensive versus NO, so the strategy buys NO as the opposite-direction leg."
      });
    }
  }

  const noOverpricedVsYes = market.noAsk - (1 - market.yesBid) - config.feePerShare;
  if (noOverpricedVsYes >= config.minReverseEdge) {
    const shares = sizeTrade(market.yesAsk, config);
    if (shares > 0) {
      signals.push({
        type: "buy-opposite",
        side: "buy-yes",
        shares,
        edge: roundTo(noOverpricedVsYes),
        expectedProfit: null,
        reason: "NO looks expensive versus YES, so the strategy buys YES as the opposite-direction leg."
      });
    }
  }

  return {
    market,
    metrics: {
      basketEntry: roundTo(basketEntry),
      basketEdge: roundTo(basketEdge),
      yesOverpricedVsNo: roundTo(yesOverpricedVsNo),
      noOverpricedVsYes: roundTo(noOverpricedVsYes)
    },
    signals
  };
}
