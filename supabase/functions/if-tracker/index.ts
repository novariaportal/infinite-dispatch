import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const ifRes = await fetch("https://api.infiniteflight.com/public/v2/flights", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ifApiKey}`
    }
  });

  if (!ifRes.ok) {
    return new Response(JSON.stringify({ error: "Infinite Flight API failed" }), { status: 502 });
  }

  const ifData = await ifRes.json();
  const flights = ifData?.result ?? [];

  for (const session of sessions || []) {
    const callsign = session.callsign?.toUpperCase();
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
        .eq("id", session.id);
    } else {
      await supabase
        .from("flight_tracking")
        .update({
          status: "completed",
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id);
    }
  }

  return new Response(
    JSON.stringify({ success: true, updated: sessions?.length || 0 }),
    { status: 200 }
  );
});
