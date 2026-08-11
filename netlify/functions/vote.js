import { getStore } from "@netlify/blobs";

const VALID_CANDIDATES = ["hue", "other"];

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

  if (req.method === "GET") {
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
