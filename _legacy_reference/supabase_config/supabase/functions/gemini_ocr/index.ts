import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt, files, model = 'gemini-2.5-flash' } = await req.json()
    
    // This key must be set in your Supabase Dashboard -> Settings -> API -> Secrets
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in Supabase Secrets.")
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const parts = [];
    
    // Add text prompt
    if (prompt) {
      parts.push({ text: prompt });
    }

    // Add multimodal files
    if (Array.isArray(files)) {
      for (const file of files) {
        if (file?.mimeType && file?.data) {
          parts.push({
            inline_data: {
              mime_type: file.mimeType,
              data: file.data.replace(/^data:.*;base64,/, ''), 
            },
          });
        }
      }
    }

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ role: 'user', parts }] 
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: result.error?.message || "Gemini API Error" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status,
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
})
