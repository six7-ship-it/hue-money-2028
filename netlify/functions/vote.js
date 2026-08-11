import { getStore } from "@netlify/blobs";

const SEED_SECRET = "huemoney-seed-2028"; // change this if you want a different key
const MAX_NAME_LENGTH = 40;

// A write-in name only gets its own row once it reaches this many votes.
const PROMOTION_THRESHOLD = 20;
// Never show more than this many named write-ins, even if more qualify.
const MAX_PROMOTED_NAMES = 3;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function seedTallies() {
  return { hue: 0, writein: 0 };
}

function buildPublicResponse(tallies, writeInNames) {
  const entries = Object.entries(writeInNames || {})
    .filter(([, count]) => count >= PROMOTION_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PROMOTED_NAMES);

  const promoted = entries.map(([name, count]) => ({ name, count }));
  const promotedTotal = promoted.reduce((sum, e) => sum + e.count, 0);

  return {
    hue: tallies.hue || 0,
    writein: tallies.writein || 0,
    // votes still folded into the generic bucket (below threshold or overflow past top 3)
    writeinOther: Math.max((tallies.writein || 0) - promotedTotal, 0),
    promoted,
  };
}

export default async (req) => {
  const store = getStore("hue-money-poll");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const seedCandidate = url.searchParams.get("seed");
    const seedAmount = parseInt(url.searchParams.get("amount") || "0", 10);
    const seedKey = url.searchParams.get("key");

    // One-time seed trick: /api/vote?seed=hue&amount=30&key=...
    if (seedCandidate && seedKey === SEED_SECRET) {
      if (!["hue", "writein"].includes(seedCandidate) || !(seedAmount > 0)) {
        return json({ error: "invalid_seed_params" }, 400);
      }
      const tallies = (await store.get("tallies", { type: "json" })) || seedTallies();
      tallies[seedCandidate] = (tallies[seedCandidate] || 0) + seedAmount;
      await store.setJSON("tallies", tallies);
      return json({ ok: true, seeded: seedCandidate, amount: seedAmount, tallies });
    }

    // Owner-only: full name breakdown, regardless of threshold
    // /api/vote?names=1&key=...
    if (url.searchParams.get("names") && seedKey === SEED_SECRET) {
      const writeInNames = (await store.get("writeInNames", { type: "json" })) || {};
      return json({ writeInNames });
    }

    const tallies = (await store.get("tallies", { type: "json" })) || seedTallies();
    const writeInNames = (await store.get("writeInNames", { type: "json" })) || {};
    return json(buildPublicResponse(tallies, writeInNames));
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const { candidateId, voterId, writeInName } = body || {};

    if (!["hue", "writein"].includes(candidateId) || !voterId) {
      return json({ error: "invalid_request" }, 400);
    }

    let cleanName = "";
    if (candidateId === "writein") {
      cleanName = sanitizeName(writeInName);
      if (!cleanName) {
        return json({ error: "missing_write_in_name" }, 400);
      }
    }

    const voters = (await store.get("voters", { type: "json" })) || [];

    if (voters.includes(voterId)) {
      const tallies = (await store.get("tallies", { type: "json" })) || seedTallies();
      const writeInNames = (await store.get("writeInNames", { type: "json" })) || {};
      return json({ error: "already_voted", tallies: buildPublicResponse(tallies, writeInNames) }, 409);
    }

    const tallies = (await store.get("tallies", { type: "json" })) || seedTallies();
    tallies[candidateId] = (tallies[candidateId] || 0) + 1;
    voters.push(voterId);

    await store.setJSON("tallies", tallies);
    await store.setJSON("voters", voters);

    let writeInNames = {};
    if (candidateId === "writein") {
      writeInNames = (await store.get("writeInNames", { type: "json" })) || {};
      writeInNames[cleanName] = (writeInNames[cleanName] || 0) + 1;
      await store.setJSON("writeInNames", writeInNames);
    } else {
      writeInNames = (await store.get("writeInNames", { type: "json" })) || {};
    }

    return json({ ok: true, tallies: buildPublicResponse(tallies, writeInNames) });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/vote" };
