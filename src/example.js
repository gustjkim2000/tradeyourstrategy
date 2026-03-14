import { evaluateYesNoParity } from "./yesNoParityStrategy.js";

const snapshots = [
  {
    name: "Locked basket arb",
    yesAsk: 0.47,
    yesBid: 0.46,
    noAsk: 0.50,
    noBid: 0.49
  },
  {
    name: "YES overpriced, buy NO",
    yesAsk: 0.67,
    yesBid: 0.66,
    noAsk: 0.38,
    noBid: 0.36
  },
  {
    name: "NO overpriced, buy YES",
    yesAsk: 0.31,
    yesBid: 0.30,
    noAsk: 0.75,
    noBid: 0.73
  }
];

for (const snapshot of snapshots) {
  const result = evaluateYesNoParity(snapshot, {
    minBasketEdge: 0.01,
    minReverseEdge: 0.01,
    maxStake: 50
  });

  console.log(`\n=== ${snapshot.name} ===`);
  console.log(JSON.stringify(result, null, 2));
}
