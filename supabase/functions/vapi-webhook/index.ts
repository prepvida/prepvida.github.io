import { createClient } from "https://esm.sh";

const SUPABASE_URL = "https://supabase.co";
// Using the service role key safely inside the cloud function environment variable
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json"
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const message = payload?.message;

    if (message?.type === "end-of-call-report") {
      const call = message?.call;
      const vapiCallId = call?.id ?? `manual_${Date.now()}`;
      const transcript = call?.transcript ?? "No conversation text was recorded.";
      const audioUrl = call?.recordingUrl ?? "";
      
      const studentEmail = message?.customer?.email ?? "unlinked_student@prepvida.in";
      
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const wordCount = transcript.split(/\s+/).length;
      const gradingMetric = {
        overall_score: Math.min(100, Math.max(30, Math.floor(wordCount / 12))),
        communication: Math.min(100, Math.max(40, Math.floor(wordCount / 15))),
        technical_relevance: 75,
        evaluation_timestamp: new Date().toISOString()
      };

      const { error: dbError } = await supabase
        .from("interview_history")
        .insert({
          student_email: studentEmail,
          company_selected: "Dream Company Matrix",
          role_selected: "AI Assessment Round",
          transcript: transcript,
          score_json: gradingMetric,
          vapi_call_id: vapiCallId,
          audio_url: audioUrl
        });

      if (dbError) throw dbError;

      await supabase.rpc('decrement_student_credit', { target_email: studentEmail });

      return new Response(JSON.stringify({ success: true, logged: true }), {
        headers: corsHeaders,
        status: 200
      });
    }

    return new Response(JSON.stringify({ status: "Event type not processed" }), {
      headers: corsHeaders,
      status: 200
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: corsHeaders,
      status: 400
    });
  }
});
