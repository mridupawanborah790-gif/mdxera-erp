
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
    const { prompt, files, model = 'gemini-1.5-flash' } = await req.json()
    
    // Use the provided API key from environment or fallback
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "AIzaSyBFk9jkrx3uZMhaA9sfua9oypRSvME_f7c";

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured")
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [
      {
        parts: [
          { text: prompt },
          ...(files || []).map((file: any) => ({
            inline_data: {
              mime_type: file.mimeType,
              data: file.data,
            },
          })),
        ],
      },
    ];

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents }),
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
