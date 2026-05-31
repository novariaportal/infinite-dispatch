import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVER_WORLD_TYPES = {
  casual: 1,
  training: 2,
  expert: 3
};

const BASE_PAY_PER_NM = 14;
const NM_PER_HOUR_BASELINE = 420;
const NM_PER_KM = 0.539957;
const MIN_VALID_COMPLETION_DISTANCE_NM = 25;
const MAX_VALID_COMPLETION_ALT_FT = 5000;
const MAX_VALID_COMPLETION_GS_KTS = 260;
const ENROUTE_COMPLETION_GRACE_FROM_START_MS = 48 * 60 * 60 * 1000;
const RECONCILE_MAX_DISTANCE_NM = 120;
const SESSIONS_TTL_MS = 10 * 60 * 1000;
const FLIGHTS_TTL_MS = 15 * 1000;
const LIVE_API_BASE_URL = "https://api.infiniteflight.com/public/v2";
type LiveApiCacheEntry = {
  data: unknown;
  expiresAt: number;
};
const liveApiCache = new Map<string, LiveApiCacheEntry>();
const AIRPORT_COORDS: Record<string, { lat: number; lon: number }> = {
  WSSS: { lat: 1.35, lon: 103.99 },
  WIII: { lat: -6.12, lon: 106.66 },
  VTBS: { lat: 13.69, lon: 100.75 },
  WMKK: { lat: 2.74, lon: 101.7 },
  RJTT: { lat: 35.55, lon: 139.78 },
  RJAA: { lat: 35.77, lon: 140.39 },
  VHHH: { lat: 22.31, lon: 113.92 },
  ZBAA: { lat: 40.08, lon: 116.58 },
  YSSY: { lat: -33.94, lon: 151.17 },
  YMML: { lat: -37.67, lon: 144.84 },
  YBBN: { lat: -27.38, lon: 153.12 },
  YPPH: { lat: -31.94, lon: 115.97 },
  YPAD: { lat: -34.95, lon: 138.53 },
  NZAA: { lat: -37.01, lon: 174.79 },
  EGLL: { lat: 51.47, lon: -0.45 },
  EGKK: { lat: 51.15, lon: -0.19 },
  LFPG: { lat: 49.01, lon: 2.55 },
  EHAM: { lat: 52.31, lon: 4.76 },
  OMDB: { lat: 25.25, lon: 55.36 },
  OTHH: { lat: 25.27, lon: 51.61 },
  OJED: { lat: 21.68, lon: 39.16 },
  OERK: { lat: 24.96, lon: 46.7 },
  OMAA: { lat: 24.43, lon: 54.65 },
  LTBA: { lat: 40.98, lon: 28.82 },
  EDDF: { lat: 50.03, lon: 8.57 },
  LFPO: { lat: 48.73, lon: 2.38 },
  RKSI: { lat: 37.47, lon: 126.45 },
  RJBB: { lat: 34.43, lon: 135.24 },
  KJFK: { lat: 40.64, lon: -73.78 },
  KLAX: { lat: 33.94, lon: -118.4 },
  KSFO: { lat: 37.62, lon: -122.38 },
  KSEA: { lat: 47.45, lon: -122.31 },
  KMIA: { lat: 25.79, lon: -80.29 },
  KORD: { lat: 41.97, lon: -87.9 }
};

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineNm(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number
) {
  const dLat = toRad(destinationLat - originLat);
  const dLon = toRad(destinationLon - originLon);
  const lat1 = toRad(originLat);
  const lat2 = toRad(destinationLat);

  const inner =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(inner), Math.sqrt(1 - inner));
  const km = 6371 * c;
  return km * NM_PER_KM;
}

function normalizeCallsign(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function callsignFamily(value: unknown) {
  return normalizeCallsign(value).replace(/[A-Z]$/, "");
}

function normalizeIdentityUsername(value: unknown) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase() || null;
}

function readFlightIdentityUsername(flight: any) {
  const candidates = [
    flight?.username,
    flight?.userName,
    flight?.pilotUsername,
    flight?.pilotName,
    flight?.displayName,
    flight?.nickname
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIdentityUsername(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function readDateMs(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getCachedLiveApiResult<T>(cacheKey: string): T | null {
  const entry = liveApiCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    liveApiCache.delete(cacheKey);
    return null;
  }
  return entry.data as T;
}

function setCachedLiveApiResult(cacheKey: string, data: unknown, ttlMs: number) {
  liveApiCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs
  });
}

async function fetchLiveApiResultCached<T>(
  path: string,
  ifApiKey: string,
  ttlMs: number,
  cacheKey: string
): Promise<T> {
  const cached = getCachedLiveApiResult<T>(cacheKey);
  if (cached !== null) return cached;

  const response = await fetch(`${LIVE_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + ifApiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Infinite Flight request failed for ${path}`);
  }

  const payload = await response.json();
  if (typeof payload?.errorCode === "number" && payload.errorCode !== 0) {
    throw new Error(`Infinite Flight returned errorCode ${payload.errorCode} for ${path}`);
  }

  const result = (payload?.result ?? []) as T;
  setCachedLiveApiResult(cacheKey, result, ttlMs);
  return result;
}

function findReconciledFlight(
  tracking: any,
  flights: any[],
  preferredIdentityUsername: string | null = null
) {
  if (typeof tracking.last_lat !== "number" || typeof tracking.last_lng !== "number") {
    return null;
  }

  const trackedCallsign = normalizeCallsign(tracking.callsign);
  const trackedFamily = callsignFamily(trackedCallsign);
  if (!trackedCallsign) return null;

  let bestIdentityMatch: any = null;
  let bestIdentityDistanceNm = Number.POSITIVE_INFINITY;
  let bestMatch: any = null;
  let bestDistanceNm = Number.POSITIVE_INFINITY;

  for (const flight of flights) {
    const flightCallsign = normalizeCallsign(flight?.callsign);
    if (!flightCallsign) continue;

    const flightFamily = callsignFamily(flightCallsign);
    const familyCompatible = trackedFamily &&
      flightFamily &&
      (trackedFamily === flightFamily ||
        trackedCallsign.startsWith(flightFamily) ||
        flightCallsign.startsWith(trackedFamily));
    if (!familyCompatible) continue;

    const latitude = Number(flight?.latitude);
    const longitude = Number(flight?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const distanceNm = haversineNm(
      tracking.last_lat,
      tracking.last_lng,
      latitude,
      longitude
    );
    if (distanceNm > RECONCILE_MAX_DISTANCE_NM) continue;
    const liveIdentity = readFlightIdentityUsername(flight);
    if (
      preferredIdentityUsername &&
      liveIdentity === preferredIdentityUsername &&
      distanceNm < bestIdentityDistanceNm
    ) {
      bestIdentityDistanceNm = distanceNm;
      bestIdentityMatch = flight;
    }
    if (distanceNm >= bestDistanceNm) continue;
    bestDistanceNm = distanceNm;
    bestMatch = flight;
  }

  return bestIdentityMatch || bestMatch;
}

function findActiveFlightMatch(tracking: any, flights: any[]) {
  const callsign = normalizeCallsign(tracking.callsign);
  const preferredIdentityUsername = normalizeIdentityUsername(tracking.identity_link_username);

  if (!callsign) {
    return {
      callsign,
      preferredIdentityUsername,
      activeMatch: null,
      matchMethod: null
    };
  }

  let identityAwareMatch: any = null;
  let callsignOnlyMatch: any = null;
  for (const flight of flights) {
    if (normalizeCallsign(flight?.callsign) !== callsign) continue;
    if (!callsignOnlyMatch) callsignOnlyMatch = flight;
    if (
      preferredIdentityUsername &&
      readFlightIdentityUsername(flight) === preferredIdentityUsername
    ) {
      identityAwareMatch = flight;
      break;
    }
  }

  if (identityAwareMatch) {
    return {
      callsign,
      preferredIdentityUsername,
      activeMatch: identityAwareMatch,
      matchMethod: "identity"
    };
  }
  if (callsignOnlyMatch) {
    return {
      callsign,
      preferredIdentityUsername,
      activeMatch: callsignOnlyMatch,
      matchMethod: "callsign"
    };
  }

  const reconciledMatch = findReconciledFlight(tracking, flights, preferredIdentityUsername);
  return {
    callsign,
    preferredIdentityUsername,
    activeMatch: reconciledMatch,
    matchMethod: reconciledMatch ? "reconciled" : null
  };
}

function sanitizeLiveFlight(flight: any, callsignFallback: string) {
  if (!flight) return null;
  return {
    callsign: normalizeCallsign(flight.callsign) || callsignFallback || null,
    latitude: Number(flight.latitude),
    longitude: Number(flight.longitude),
    altitude: Number(flight.altitude),
    groundspeed: Number(flight.groundspeed),
    identity_username: readFlightIdentityUsername(flight)
  };
}

async function readOnDemandTrackingTarget(supabase: any, req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const trackingId = String(body?.tracking_id || body?.trackingId || "").trim();
  const userId = String(body?.user_id || body?.userId || "").trim();

  if (!trackingId && !userId) {
    return {
      status: 400,
      response: new Response(
        JSON.stringify({ error: "Either tracking_id or user_id is required for on-demand mode" }),
        { status: 400 }
      )
    };
  }

  let query = supabase
    .from("flight_tracking")
    .select("id, user_id, callsign, origin, destination, status, server_type, identity_link_username, last_lat, last_lng, last_alt, last_speed, updated_at, created_at")
    .eq("status", "enroute")
    .order("created_at", { ascending: false })
    .limit(1);

  if (trackingId) {
    query = query.eq("id", trackingId);
  } else {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return {
      status: 500,
      response: new Response(JSON.stringify({ error: error.message }), { status: 500 })
    };
  }
  if (!data) {
    return {
      status: 404,
      response: new Response(JSON.stringify({ error: "No active tracking row found" }), { status: 404 })
    };
  }

  return { status: 200, tracking: data };
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ifApiKey = Deno.env.get("IF_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(req.url);
  const onDemand = req.method === "POST" && url.searchParams.get("mode") === "on-demand";

  if (onDemand) {
    const target = await readOnDemandTrackingTarget(supabase, req);
    if (target.response) return target.response;

    const tracking = target.tracking;
    let liveSessions: any[] = [];
    try {
      liveSessions = await fetchLiveApiResultCached<any[]>(
        "/sessions",
        ifApiKey,
        SESSIONS_TTL_MS,
        "if:sessions"
      );
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: "Infinite Flight sessions request failed", details }),
        { status: 502 }
      );
    }

    const serverType = tracking.server_type || "casual";
    const worldType = SERVER_WORLD_TYPES[serverType] ?? SERVER_WORLD_TYPES.casual;
    const matchSession = liveSessions.find((session) => session.worldType === worldType);

    let flights: any[] = [];
    if (matchSession?.id) {
      try {
        flights = await fetchLiveApiResultCached<any[]>(
          `/sessions/${matchSession.id}/flights`,
          ifApiKey,
          FLIGHTS_TTL_MS,
          `if:flights:${matchSession.id}`
        );
      } catch {
        flights = [];
      }
    }

    const nowIso = new Date().toISOString();
    const { callsign, activeMatch, matchMethod } = findActiveFlightMatch(tracking, flights);
    if (callsign && activeMatch) {
      await supabase
        .from("flight_tracking")
        .update({
          status: "enroute",
          callsign: normalizeCallsign(activeMatch.callsign) || callsign,
          last_lat: activeMatch.latitude,
          last_lng: activeMatch.longitude,
          last_alt: activeMatch.altitude,
          last_speed: activeMatch.groundspeed,
          updated_at: nowIso
        })
        .eq("id", tracking.id);
    } else {
      await supabase
        .from("flight_tracking")
        .update({ updated_at: nowIso })
        .eq("id", tracking.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        on_demand: true,
        tracking_id: tracking.id,
        user_id: tracking.user_id,
        server_type: serverType,
        session_id: matchSession?.id || null,
        found: Boolean(callsign && activeMatch),
        match_method: matchMethod,
        live_flight: sanitizeLiveFlight(activeMatch, callsign)
      }),
      { status: 200 }
    );
  }

  const { data: sessions, error } = await supabase
    .from("flight_tracking")
    .select("id, user_id, callsign, origin, destination, status, server_type, identity_link_username, last_lat, last_lng, last_alt, last_speed, updated_at, created_at")
    .eq("status", "enroute");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!sessions || sessions.length === 0) {
    return new Response(JSON.stringify({ success: true, updated: 0 }), { status: 200 });
  }

  let liveSessions: any[] = [];
  try {
    liveSessions = await fetchLiveApiResultCached<any[]>(
      "/sessions",
      ifApiKey,
      SESSIONS_TTL_MS,
      "if:sessions"
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Infinite Flight sessions request failed", details }),
      { status: 502 }
    );
  }

  const flightsByServerType = {};

  for (const tracking of sessions) {
    const serverType = tracking.server_type || "casual";
    if (flightsByServerType[serverType]) continue;

    const worldType = SERVER_WORLD_TYPES[serverType] ?? SERVER_WORLD_TYPES.casual;
    const matchSession = liveSessions.find((session) => session.worldType === worldType);

    if (!matchSession?.id) {
      flightsByServerType[serverType] = [];
      continue;
    }

    try {
      flightsByServerType[serverType] = await fetchLiveApiResultCached<any[]>(
        `/sessions/${matchSession.id}/flights`,
        ifApiKey,
        FLIGHTS_TTL_MS,
        `if:flights:${matchSession.id}`
      );
    } catch {
      flightsByServerType[serverType] = [];
    }
  }

  for (const tracking of sessions) {
    const nowIso = new Date().toISOString();
    const serverType = tracking.server_type || "casual";
    const flights = flightsByServerType[serverType] || [];
    const { callsign, activeMatch } = findActiveFlightMatch(tracking, flights);
    if (!callsign) {
      await supabase
        .from("flight_tracking")
        .update({ updated_at: nowIso })
        .eq("id", tracking.id);
      continue;
    }

    if (activeMatch) {
      await supabase
        .from("flight_tracking")
        .update({
          status: "enroute",
          callsign: normalizeCallsign(activeMatch.callsign) || callsign,
          last_lat: activeMatch.latitude,
          last_lng: activeMatch.longitude,
          last_alt: activeMatch.altitude,
          last_speed: activeMatch.groundspeed,
          updated_at: nowIso
        })
        .eq("id", tracking.id);
    } else {
      const hasSeenLivePosition =
        typeof tracking.last_lat === "number" &&
        typeof tracking.last_lng === "number";

      let isValidatedCompletion = false;

      if (
        hasSeenLivePosition &&
        tracking.destination &&
        tracking.last_lat != null &&
        tracking.last_lng != null
      ) {
        const destinationAirport = AIRPORT_COORDS[String(tracking.destination || "").toUpperCase()];

        if (
          destinationAirport &&
          typeof destinationAirport.lat === "number" &&
          typeof destinationAirport.lon === "number"
        ) {
          const distanceRemainingNm = haversineNm(
            tracking.last_lat,
            tracking.last_lng,
            destinationAirport.lat,
            destinationAirport.lon
          );

          const altitude = Number(tracking.last_alt ?? 0);
          const groundspeed = Number(tracking.last_speed ?? 0);
          isValidatedCompletion =
            distanceRemainingNm <= MIN_VALID_COMPLETION_DISTANCE_NM &&
            altitude <= MAX_VALID_COMPLETION_ALT_FT &&
            groundspeed <= MAX_VALID_COMPLETION_GS_KTS;
        }
      }

      const flightStartMs = readDateMs(tracking.created_at);
      const hasGraceElapsed = flightStartMs != null
        ? Date.now() - flightStartMs >= ENROUTE_COMPLETION_GRACE_FROM_START_MS
        : false;

      if (!isValidatedCompletion || !hasGraceElapsed) {
        continue;
      }

      const origin = String(tracking.origin || "").trim().toUpperCase();
      const destination = String(tracking.destination || "").trim().toUpperCase();

      let distanceNm = 0;
      if (origin && destination) {
        const originAirport = AIRPORT_COORDS[origin];
        const destinationAirport = AIRPORT_COORDS[destination];
        if (originAirport && destinationAirport) {
          distanceNm = haversineNm(
            originAirport.lat,
            originAirport.lon,
            destinationAirport.lat,
            destinationAirport.lon
          );
        }
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, hours, balance, pay_multiplier")
        .eq("id", tracking.user_id)
        .maybeSingle();

      if (profileError) {
        console.error(`Failed to load profile for tracking ${tracking.id}:`, profileError.message);
        await supabase
          .from("flight_tracking")
          .update({ updated_at: nowIso })
          .eq("id", tracking.id);
        continue;
      }

      if (!profile) {
        await supabase
          .from("flight_tracking")
          .update({ updated_at: nowIso })
          .eq("id", tracking.id);
        continue;
      }

      const payMultiplier = Number(profile.pay_multiplier || 1);
      const payAward = Math.max(0, Math.round(distanceNm * BASE_PAY_PER_NM * payMultiplier));
      const hourAward = Math.max(1, Math.round(distanceNm / NM_PER_HOUR_BASELINE));

      const { error: rewardError } = await supabase
        .from("profiles")
        .update({
          balance: Number(profile.balance || 0) + payAward,
          hours: Number(profile.hours || 0) + hourAward
        })
        .eq("id", profile.id);

      if (rewardError) {
        console.error(`Failed to apply reward for tracking ${tracking.id}:`, rewardError.message);
        await supabase
          .from("flight_tracking")
          .update({ updated_at: nowIso })
          .eq("id", tracking.id);
        continue;
      }

      await supabase
        .from("flight_tracking")
        .update({
          status: "completed",
          updated_at: nowIso
        })
        .eq("id", tracking.id);
    }
  }

  return new Response(
    JSON.stringify({ success: true, updated: sessions.length }),
    { status: 200 }
  );
});
