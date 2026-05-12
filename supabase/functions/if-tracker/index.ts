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

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ifApiKey = Deno.env.get("IF_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: sessions, error } = await supabase
    .from("flight_tracking")
    .select("id, user_id, callsign, origin, destination, status, server_type, last_lat, last_lng, last_alt, last_speed")
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
    const serverType = tracking.server_type || "casual";
    const flights = flightsByServerType[serverType] || [];
    const callsign = tracking.callsign?.toUpperCase();
    const match = flights.find((flight) =>
      flight?.callsign?.toUpperCase() === callsign
    );

    if (match) {
      await supabase
        .from("flight_tracking")
        .update({
          status: "enroute",
          last_lat: match.latitude,
          last_lng: match.longitude,
          last_alt: match.altitude,
          last_speed: match.groundspeed,
          updated_at: new Date().toISOString()
        })
        .eq("id", tracking.id);
    } else {
      const hasSeenLivePosition =
        typeof tracking.last_lat === "number" &&
        typeof tracking.last_lng === "number";

      let isValidatedCompletion = false;
      let distanceRemainingNm: number | null = null;

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
          distanceRemainingNm = haversineNm(
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

      if (!isValidatedCompletion) {
        await supabase
          .from("flight_tracking")
          .update({
            updated_at: new Date().toISOString()
          })
          .eq("id", tracking.id);
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, hours, balance, pay_multiplier")
        .eq("id", tracking.user_id)
        .maybeSingle();

      if (profile) {
        const payMultiplier = Number(profile.pay_multiplier || 1);
        const payAward = Math.max(0, Math.round(distanceNm * BASE_PAY_PER_NM * payMultiplier));
        const hourAward = Math.max(1, Math.round(distanceNm / NM_PER_HOUR_BASELINE));

        await supabase
          .from("profiles")
          .update({
            balance: Number(profile.balance || 0) + payAward,
            hours: Number(profile.hours || 0) + hourAward
          })
          .eq("id", profile.id);
      }

      await supabase
        .from("flight_tracking")
        .update({
          status: "completed",
          updated_at: new Date().toISOString()
        })
        .eq("id", tracking.id);
    }
  }

  return new Response(
    JSON.stringify({ success: true, updated: sessions.length }),
    { status: 200 }
  );
});
