import type { NewTokenEvent } from "../types/token.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSol(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function formatIsoTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function buildTokenMessage(event: NewTokenEvent): string {
  const lines: string[] = ["🚨 <b>NEW PUMP.FUN TOKEN</b>", ""];

  if (event.name !== undefined) {
    lines.push(`<b>Name:</b> ${escapeHtml(event.name)}`);
  }

  if (event.symbol !== undefined) {
    const symbolLabel = event.symbol.startsWith("$")
      ? event.symbol
      : `$${event.symbol}`;
    lines.push(`<b>Symbol:</b> ${escapeHtml(symbolLabel)}`);
  }

  lines.push("", `<b>Mint:</b>`, `<code>${escapeHtml(event.mint)}</code>`);

  if (event.traderPublicKey !== undefined) {
    lines.push("", `<b>Creator:</b>`, `<code>${escapeHtml(event.traderPublicKey)}</code>`);
  }

  if (event.initialBuySol !== undefined) {
    lines.push(
      "",
      `<b>Developer Initial Buy:</b> ${formatSol(event.initialBuySol)} SOL`,
    );
  }

  if (event.marketCapSol !== undefined) {
    lines.push(`<b>Market Cap:</b> ${formatSol(event.marketCapSol)} SOL`);
  }

  lines.push("", `<b>Received:</b> ${formatIsoTimestamp(event.receivedAt)}`);

  if (event.blockchainCreatedAt !== undefined) {
    lines.push(
      `<b>Blockchain Created:</b> ${formatIsoTimestamp(event.blockchainCreatedAt)}`,
    );
  }

  lines.push(
    "",
    "<b>Links:</b>",
    `Pump.fun: https://pump.fun/coin/${escapeHtml(event.mint)}`,
    `Solscan: https://solscan.io/token/${escapeHtml(event.mint)}`,
  );

  return lines.join("\n");
}

export function escapeHtmlForTelegram(value: string): string {
  return escapeHtml(value);
}
