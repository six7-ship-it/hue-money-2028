import { getStore } from "@netlify/blobs";

const VALID_CANDIDATES = ["hue", "other"];
const SEED_SECRET = "huemoney-seed-2028"; // change this if you want a different key

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default async (req) => {
  const store = getStore("hue-money-poll");
  const url = new URL(req.url);

  if (req.method === "GET") {
    // One-time seed trick: visit
    // /api/vote?seed=hue&amount=30&key=huemoney-seed-2028
    // to add votes to a candidate's starting count.
    const seedCandidate = url.searchParams.get("seed");
    const seedAmount = parseInt(url.searchParams.get("amount") || "0", 10);
    const seedKey = url.searchParams.get("key");

    if (seedCandidate && seedKey === SEED_SECRET) {
      if (!VALID_CANDIDATES.includes(seedCandidate) || !(seedAmount > 0)) {
        return json({ error: "invalid_seed_params" }, 400);
      }
      const tallies = (await store.get("tallies", { type: "json" })) || {
        hue: 0,
        other: 0,
      };
      tallies[seedCandidate] = (tallies[seedCandidate] || 0) + seedAmount;
      await store.setJSON("tallies", tallies);
      return json({ ok: true, seeded: seedCandidate, amount: seedAmount, tallies });
    }

    const tallies = (await store.get("tallies", { type: "json" })) || {
      hue: 0,
      other: 0,
    };
    return json(tallies);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const { candidateId, voterId } = body || {};

    if (!VALID_CANDIDATES.includes(candidateId) || !voterId) {
      return json({ error: "invalid_request" }, 400);
    }

    const voters = (await store.get("voters", { type: "json" })) || [];

    if (voters.includes(voterId)) {
      const tallies = (await store.get("tallies", { type: "json" })) || {
        hue: 0,
        other: 0,
      };
      return json({ error: "already_voted", tallies }, 409);
    }

    const tallies = (await store.get("tallies", { type: "json" })) || {
      hue: 0,
      other: 0,
    };
    tallies[candidateId] = (tallies[candidateId] || 0) + 1;
    voters.push(voterId);

    await store.setJSON("tallies", tallies);
    await store.setJSON("voters", voters);

    return json({ ok: true, tallies });
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/vote" };
