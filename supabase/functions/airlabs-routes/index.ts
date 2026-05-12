import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const AIRLABS_ROUTES_URL = "https://airlabs.co/api/v9/routes";
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
const DEFAULT_FIELDS = [
  "airline_iata",
  "airline_icao",
  "flight_number",
  "flight_iata",
  "flight_icao",
  "dep_iata",
  "dep_icao",
  "dep_time",
  "arr_iata",
  "arr_icao",
  "arr_time",
  "duration",
  "days",
  "aircraft_icao",
  "updated"
];

const ALLOWED_FILTERS = [
  "dep_iata",
  "dep_icao",
  "arr_iata",
  "arr_icao",
  "airline_iata",
  "airline_icao",
  "flight_icao",
  "flight_iata",
  "flight_number"
];

const cache = new Map<string, { expiresAt: number; payload: unknown }>();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json"
    }
  });
}

function clampInt(raw: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeCode(raw: string | null) {
  if (!raw) return null;
  return String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sanitizeFieldList(raw: string | null) {
  if (!raw) return DEFAULT_FIELDS.join(",");
  const fields = String(raw)
    .split(",")
    .map((f) => f.trim())
    .filter((f) => /^[a-z0-9_]+$/i.test(f));
  return fields.length ? fields.join(",") : DEFAULT_FIELDS.join(",");
}

function buildUpstreamParams(url: URL, apiKey: string) {
  const params = new URLSearchParams();
  params.set("api_key", apiKey);

  let hasFilter = false;
  for (const key of ALLOWED_FILTERS) {
    const value = sanitizeCode(url.searchParams.get(key));
    if (!value) continue;
    params.set(key, value);
    hasFilter = true;
  }

  const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1_000_000);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set("_fields", sanitizeFieldList(url.searchParams.get("_fields")));

  return { params, hasFilter, limit, offset };
}

function mapRouteRow(row: Record<string, unknown>) {
  return {
    airline_iata: row.airline_iata ?? null,
    airline_icao: row.airline_icao ?? null,
    flight_number: row.flight_number ?? null,
    flight_iata: row.flight_iata ?? null,
    flight_icao: row.flight_icao ?? null,
    dep_iata: row.dep_iata ?? null,
    dep_icao: row.dep_icao ?? null,
    dep_time: row.dep_time ?? null,
    arr_iata: row.arr_iata ?? null,
    arr_icao: row.arr_icao ?? null,
    arr_time: row.arr_time ?? null,
    duration: typeof row.duration === "number" ? row.duration : null,
    days: Array.isArray(row.days) ? row.days : [],
    aircraft_icao: row.aircraft_icao ?? null,
    updated: row.updated ?? null
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const apiKey = Deno.env.get("AIRLABS_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "AIRLABS_API_KEY is not configured." }, 500);
  }

  try {
    const requestUrl = new URL(req.url);
    const { params, hasFilter, limit, offset } = buildUpstreamParams(requestUrl, apiKey);

    if (!hasFilter) {
      return jsonResponse({ error: "At least one route filter is required." }, 400);
    }

    const cacheKey = params.toString();
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const cachedPayload = cached.payload as {
        data?: unknown[];
        request?: Record<string, unknown>;
      };
      return jsonResponse({
        ...cachedPayload,
        request: {
          ...(cachedPayload.request || {}),
          cached: true
        }
      });
    }

    const upstreamRes = await fetch(`${AIRLABS_ROUTES_URL}?${params.toString()}`, { method: "GET" });
    if (!upstreamRes.ok) {
      return jsonResponse({ error: "AirLabs route request failed." }, 502);
    }

    const upstreamPayload = await upstreamRes.json();
    const rows = Array.isArray(upstreamPayload?.response) ? upstreamPayload.response : [];
    const mapped = rows
      .filter((row: unknown) => !!row && typeof row === "object")
      .map((row: Record<string, unknown>) => mapRouteRow(row));

    const payload = {
      data: mapped,
      request: {
        limit,
        offset,
        has_more: Boolean(upstreamPayload?.request?.has_more),
        cached: false
      }
    };

    cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload
    });

    return jsonResponse(payload, 200);
  } catch (error) {
    console.error("airlabs-routes error:", error);
    return jsonResponse({ error: "Failed to fetch routes." }, 500);
  }
});
