import { AssetType, Chain, ClobClient, OrderType, Side, SignatureType } from "@polymarket/clob-client";
import { Wallet } from "ethers";

const HOST = "https://clob.polymarket.com";

function parseSignatureType(value) {
  if (value === "0" || value === "EOA") {
    return SignatureType.EOA;
  }
  if (value === "2" || value === "POLY_GNOSIS_SAFE") {
    return SignatureType.POLY_GNOSIS_SAFE;
  }
  return SignatureType.POLY_PROXY;
}

export class PolymarketAccountService {
  constructor(env = process.env) {
    this.env = env;
    this.publicClient = new ClobClient(HOST, Number(this.env.POLYMARKET_CHAIN_ID || Chain.POLYGON));
  }

  isConfigured() {
    return Boolean(this.env.POLYMARKET_PRIVATE_KEY && this.env.POLYMARKET_FUNDER);
  }

  async getConnectionSnapshot() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        mode: "demo",
        message: "Set POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER to enable a real account connection."
      };
    }

    try {
      const signer = new Wallet(this.env.POLYMARKET_PRIVATE_KEY);
      const signatureType = parseSignatureType(this.env.POLYMARKET_SIGNATURE_TYPE);
      const chainId = Number(this.env.POLYMARKET_CHAIN_ID || Chain.POLYGON);
      const apiKeyNonce = this.env.POLYMARKET_API_KEY_NONCE ? Number(this.env.POLYMARKET_API_KEY_NONCE) : undefined;

      const bootstrapClient = new ClobClient(HOST, chainId, signer, undefined, signatureType, this.env.POLYMARKET_FUNDER);
      const creds = await bootstrapClient.createOrDeriveApiKey(apiKeyNonce);
      const client = new ClobClient(HOST, chainId, signer, creds, signatureType, this.env.POLYMARKET_FUNDER);
      const balance = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });

      return {
        configured: true,
        connected: true,
        mode: "live",
        address: signer.address,
        funder: this.env.POLYMARKET_FUNDER,
        signatureType,
        balance
      };
    } catch (error) {
      return {
        configured: true,
        connected: false,
        mode: "error",
        message: error instanceof Error ? error.message : "Unknown Polymarket connection error"
      };
    }
  }

  async createAuthenticatedClient() {
    if (!this.isConfigured()) {
      throw new Error("Polymarket account is not configured. Set POLYMARKET_PRIVATE_KEY and POLYMARKET_FUNDER.");
    }

    const signer = new Wallet(this.env.POLYMARKET_PRIVATE_KEY);
    const signatureType = parseSignatureType(this.env.POLYMARKET_SIGNATURE_TYPE);
    const chainId = Number(this.env.POLYMARKET_CHAIN_ID || Chain.POLYGON);
    const apiKeyNonce = this.env.POLYMARKET_API_KEY_NONCE ? Number(this.env.POLYMARKET_API_KEY_NONCE) : undefined;

    const bootstrapClient = new ClobClient(HOST, chainId, signer, undefined, signatureType, this.env.POLYMARKET_FUNDER);
    const creds = await bootstrapClient.createOrDeriveApiKey(apiKeyNonce);
    const client = new ClobClient(HOST, chainId, signer, creds, signatureType, this.env.POLYMARKET_FUNDER);

    return {
      client,
      signer,
      signatureType
    };
  }

  async getOrderContext(tokenID) {
    const book = await this.publicClient.getOrderBook(tokenID);
    const tickSize = String(book.tick_size ?? await this.publicClient.getTickSize(tokenID));
    const negRisk = typeof book.neg_risk === "boolean" ? book.neg_risk : await this.publicClient.getNegRisk(tokenID);
    return {
      tokenID,
      tickSize,
      negRisk: Boolean(negRisk),
      bestBid: Number(book.bids?.[0]?.price ?? 0),
      bestAsk: Number(book.asks?.[0]?.price ?? 0),
      minOrderSize: Number(book.min_order_size ?? 0)
    };
  }

  async previewLimitOrder({ tokenID, price, size, side }) {
    const context = await this.getOrderContext(tokenID);
    const normalizedPrice = this.normalizePrice(price, context.tickSize);
    const numericSize = Number(size);

    return {
      tokenID,
      side,
      price: normalizedPrice,
      size: numericSize,
      tickSize: context.tickSize,
      negRisk: context.negRisk,
      bestBid: context.bestBid,
      bestAsk: context.bestAsk,
      minOrderSize: context.minOrderSize,
      wouldCross: side === Side.BUY ? normalizedPrice >= context.bestAsk : normalizedPrice <= context.bestBid
    };
  }

  async placeLimitOrder({ tokenID, price, size, side, orderType = OrderType.GTC }) {
    const preview = await this.previewLimitOrder({ tokenID, price, size, side });
    const { client } = await this.createAuthenticatedClient();

    const response = await client.createAndPostOrder(
      {
        tokenID,
        price: preview.price,
        size: preview.size,
        side
      },
      {
        tickSize: preview.tickSize,
        negRisk: preview.negRisk
      },
      orderType
    );

    return {
      preview,
      response
    };
  }

  async getCollateralAllowance() {
    const { client } = await this.createAuthenticatedClient();
    return client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  }

  normalizePrice(price, tickSize) {
    const numericPrice = Number(price);
    const numericTick = Number(tickSize);
    if (!Number.isFinite(numericPrice) || !Number.isFinite(numericTick) || numericTick <= 0) {
      throw new Error("Invalid price or tick size.");
    }

    const rounded = Math.round(numericPrice / numericTick) * numericTick;
    const tickString = String(tickSize);
    return Number(rounded.toFixed(Math.max(0, (tickString.split(".")[1] || "").length)));
  }
}

export { HOST, OrderType, Side };
