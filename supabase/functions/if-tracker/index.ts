import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SERVER_WORLD_TYPES = {
  casual: 1,
  training: 2,
  expert: 3
};

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ifApiKey = Deno.env.get("IF_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: sessions, error } = await supabase
    .from("flight_tracking")
    .select("*")
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
