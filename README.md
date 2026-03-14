# Trade your Strategy

Polymarket arbitrage product prototype with:

- Purchase-to-activation onboarding flow
- Polymarket account connection placeholder
- YES/NO parity arbitrage strategy feed
- Cumulative return dashboard
- Minimal backend API for the UI

## Run

This project is designed to run with Node.js 18+.

```bash
npm start
```

Open `http://localhost:3000`.

User accounts, sessions, and purchased strategies are now persisted in:

```bash
./data/app.db
```

## Real Polymarket Account Connection

Set these environment variables before running the server if you want the backend to connect to a real Polymarket account:

```bash
export POLYMARKET_PRIVATE_KEY="0x..."
export POLYMARKET_FUNDER="0x..."
export POLYMARKET_SIGNATURE_TYPE="POLY_PROXY"
export POLYMARKET_CHAIN_ID="137"
```

Optional:

```bash
export POLYMARKET_API_KEY_NONCE="0"
```

Notes:

- `POLYMARKET_PRIVATE_KEY`: the signer private key used for Polymarket authentication
- `POLYMARKET_FUNDER`: your Polymarket profile / funder address
- `POLYMARKET_SIGNATURE_TYPE`: `EOA`, `POLY_PROXY`, or `POLY_GNOSIS_SAFE`
- without these variables the app stays in demo mode for account connection

## Google Sign-In

To enable the real Google sign-in button, set:

```bash
export GOOGLE_CLIENT_ID="YOUR_GOOGLE_WEB_CLIENT_ID"
```

Without it, the auth screen still works with the demo email sign-in and sign-up flow.

## Current API

- `GET /api/dashboard`
- `POST /api/purchase`
- `POST /api/polymarket/connect`
- `GET /api/polymarket/account`
- `GET /api/polymarket/config`
- `GET /api/polymarket/allowance`
- `POST /api/orders/preview`
- `POST /api/orders/place`
- `POST /api/strategy`
- `POST /api/bot/activate`
- `GET /api/signals`

## Order API Examples

Preview a limit order:

```bash
curl -X POST http://localhost:3000/api/orders/preview \
  -H "Content-Type: application/json" \
  -d '{
    "tokenID": "TOKEN_ID_HERE",
    "price": 0.52,
    "size": 10,
    "side": "BUY"
  }'
```

Place a limit order:

```bash
curl -X POST http://localhost:3000/api/orders/place \
  -H "Content-Type: application/json" \
  -d '{
    "tokenID": "TOKEN_ID_HERE",
    "price": 0.52,
    "size": 10,
    "side": "BUY",
    "orderType": "GTC"
  }'
```

## Real Polymarket Integration Tasks

1. Replace `POST /api/polymarket/connect` mock logic with delegated wallet or signer-based authentication.
2. Pull live market data from Polymarket Gamma/CLOB APIs and WebSocket streams.
3. Move strategy execution to a protected backend worker so browser clients never hold trading credentials.
4. Persist users, licenses, configs, fills, and PnL in a database.
5. Add geoblocking checks, audit logs, and kill switches before enabling live trading.
