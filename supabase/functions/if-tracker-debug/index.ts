import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVER_WORLD_TYPES = {
  casual: 1,
  training: 2,
  expert: 3
};

const NM_PER_KM = 0.539957;
const MIN_VALID_COMPLETION_DISTANCE_NM = 25;
const MAX_VALID_COMPLETION_ALT_FT = 5000;
const MAX_VALID_COMPLETION_GS_KTS = 260;
const ENROUTE_COMPLETION_GRACE_FROM_START_MS = 48 * 60 * 60 * 1000;
const RECONCILE_MAX_DISTANCE_NM = 120;
const DEBUG_TRACKING_TABLE = "flight_tracking_debug";
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

function readDateMs(value: unknown) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function findReconciledFlight(tracking: any, flights: any[]) {
  if (typeof tracking.last_lat !== "number" || typeof tracking.last_lng !== "number") {
    return null;
  }

  const trackedCallsign = normalizeCallsign(tracking.callsign);
  const trackedFamily = callsignFamily(trackedCallsign);
  if (!trackedCallsign) return null;

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
    if (distanceNm >= bestDistanceNm) continue;

    bestDistanceNm = distanceNm;
    bestMatch = flight;
  }

  return bestMatch;
}

serve(async (_request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ifApiKey = Deno.env.get("IF_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: sessions, error } = await supabase
      .from(DEBUG_TRACKING_TABLE)
      .select("id, callsign, destination, status, server_type, last_lat, last_lng, last_alt, last_speed, updated_at, created_at")
      .eq("status", "enroute");

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0 }), { status: 200 });
    }

    const sessionsRes = await fetch("https://api.infiniteflight.com/public/v2/sessions", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ifApiKey}`
      }
    });

    if (!sessionsRes.ok) {
      return new Response(JSON.stringify({ error: "Infinite Flight sessions request failed" }), { status: 502 });
    }

    const sessionsPayload = await sessionsRes.json();
    const liveSessions = sessionsPayload?.result ?? [];

    const flightsByServerType: Record<string, any[]> = {};

    for (const tracking of sessions) {
      const serverType = tracking.server_type || "casual";
      if (flightsByServerType[serverType]) continue;

      const worldType = SERVER_WORLD_TYPES[serverType] ?? SERVER_WORLD_TYPES.casual;
      const matchSession = liveSessions.find((session) => session.worldType === worldType);

      if (!matchSession?.id) {
        flightsByServerType[serverType] = [];
        continue;
      }

      const flightsRes = await fetch(
        `https://api.infiniteflight.com/public/v2/sessions/${matchSession.id}/flights`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${ifApiKey}`
          }
        }
      );

      if (!flightsRes.ok) {
        flightsByServerType[serverType] = [];
        continue;
      }

      const flightsPayload = await flightsRes.json();
      flightsByServerType[serverType] = flightsPayload?.result ?? [];
    }

    for (const tracking of sessions) {
      const nowIso = new Date().toISOString();
      const serverType = tracking.server_type || "casual";
      const flights = flightsByServerType[serverType] || [];
      const callsign = normalizeCallsign(tracking.callsign);
      if (!callsign) {
        await supabase
          .from(DEBUG_TRACKING_TABLE)
          .update({ updated_at: nowIso })
          .eq("id", tracking.id);
        continue;
      }
      const match = flights.find((flight) =>
        normalizeCallsign(flight?.callsign) === callsign
      );

      const activeMatch = match || findReconciledFlight(tracking, flights);

      if (activeMatch) {
        await supabase
          .from(DEBUG_TRACKING_TABLE)
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
        continue;
      }

      const hasSeenLivePosition =
        typeof tracking.last_lat === "number" &&
        typeof tracking.last_lng === "number";

      let isValidatedCompletion = false;

      if (hasSeenLivePosition && tracking.destination) {
        const destinationAirport = AIRPORT_COORDS[tracking.destination.toUpperCase()];

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

      const flightStartMs = readDateMs(tracking.created_at) ?? readDateMs(tracking.updated_at);
      const hasGraceElapsed = flightStartMs != null
        ? Date.now() - flightStartMs >= ENROUTE_COMPLETION_GRACE_FROM_START_MS
        : false;

      if (!isValidatedCompletion || !hasGraceElapsed) {
        continue;
      }

      await supabase
        .from(DEBUG_TRACKING_TABLE)
        .update({ status: "completed", updated_at: nowIso })
        .eq("id", tracking.id);
    }

    return new Response(
      JSON.stringify({ success: true, updated: sessions.length }),
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("if-tracker-debug failed:", message);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});
