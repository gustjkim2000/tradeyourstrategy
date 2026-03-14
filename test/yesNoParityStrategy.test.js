import test from "node:test";
import assert from "node:assert/strict";
import { evaluateYesNoParity } from "../src/yesNoParityStrategy.js";

test("signals a basket buy when yes and no asks add up below one", () => {
  const result = evaluateYesNoParity({
    yesAsk: 0.46,
    yesBid: 0.45,
    noAsk: 0.51,
    noBid: 0.5
  }, {
    minBasketEdge: 0.02,
    maxStake: 100
  });

  assert.equal(result.signals[0]?.type, "buy-basket");
  assert.equal(result.signals[0]?.side, "buy-both");
  assert.equal(result.metrics.basketEdge, 0.03);
});

test("signals buy-no when yes is overpriced versus no", () => {
  const result = evaluateYesNoParity({
    yesAsk: 0.68,
    yesBid: 0.67,
    noAsk: 0.37,
    noBid: 0.35
  }, {
    minReverseEdge: 0.01,
    maxStake: 100
  });

  const signal = result.signals.find((entry) => entry.side === "buy-no");
  assert.ok(signal);
  assert.equal(signal.type, "buy-opposite");
});

test("signals buy-yes when no is overpriced versus yes", () => {
  const result = evaluateYesNoParity({
    yesAsk: 0.28,
    yesBid: 0.27,
    noAsk: 0.76,
    noBid: 0.75
  }, {
    minReverseEdge: 0.01,
    maxStake: 100
  });

  const signal = result.signals.find((entry) => entry.side === "buy-yes");
  assert.ok(signal);
  assert.equal(signal.type, "buy-opposite");
});

test("returns no signal when the edge is smaller than thresholds", () => {
  const result = evaluateYesNoParity({
    yesAsk: 0.5,
    yesBid: 0.49,
    noAsk: 0.5,
    noBid: 0.49
  }, {
    minBasketEdge: 0.02,
    minReverseEdge: 0.02
  });

  assert.deepEqual(result.signals, []);
});
