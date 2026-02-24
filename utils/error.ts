

export const parseNetworkAndApiError = (error: any): string => {
    const rawMessage = String(error?.message || error || "Unknown Error");
    const message = rawMessage.toLowerCase();

    // OCR/gemini_ocr specific request-shape hints (put before generic 400 handling)
    if (message.includes('ocr function failed (400)') || message.includes('/functions/v1/gemini_ocr') || message.includes('gemini_ocr')) {
        if (message.includes('request payload size exceeds the limit') || message.includes('payload too large') || message.includes('413') || message.includes('token')) {
            return "Invoice image payload is too large for AI extraction. Upload fewer pages, reduce image resolution, or scan one page at a time.";
        }
        if (message.includes('invalid argument') || message.includes('invalid json') || message.includes('malformed')) {
            return "AI extraction request format is invalid. Re-upload a clear JPG/PNG/PDF file and try again.";
        }
        if (message.includes('unsupported') || message.includes('mime')) {
            return "Unsupported invoice file format for AI extraction. Use JPG, PNG, or PDF.";
        }
        return `AI extraction request was rejected by the OCR service. ${rawMessage}`;
    }
    

    if (message.includes('unsupported file:') || message.includes('file too large:') || message.includes('upload up to')) {
        return rawMessage;
    }

    // Specific API Key errors (can apply to Gemini or Supabase)
    if (message.includes('api_key_not_found') || message.includes('invalid api key') || message.includes('api key not valid')) {
        return "AI/API Configuration Error: Invalid API Key. Please check your settings or contact support.";
    }

    // Network Errors
    if (message.includes('failed to fetch') || message.includes('network error') || message.includes('network connection issue') || message.includes('fetch aborted')) {
        return "Network connection issue. Please check your internet and try again.";
    }
    if (message.includes('timeout')) {
        return "Network request timed out. Please try again.";
    }
    
    // Supabase Specific Errors
    if (message.includes('row level security') || message.includes('permission denied')) {
        return "Access denied: You don't have permission to perform this action. Check your user role or contact administrator.";
    }
    if (message.includes('duplicate key') || message.includes('unique constraint')) {
        return "Data conflict: A record with this unique identifier already exists.";
    }
    if (message.includes('foreign key constraint')) {
        return "Data integrity error: Related record not found or cannot be deleted.";
    }
    if (message.includes('null value in column')) {
        return "Data error: A required field is missing. Please ensure all mandatory fields are filled.";
    }
    if (message.includes('type mismatch')) {
        return "Data format error: Invalid value provided for a field.";
    }

    // Gemini/AI Specific Errors (can also appear as HTTP 4xx/5xx)
    if (message.includes('429') || message.includes('resource_exhausted') || message.includes('quota')) {
        return "AI capacity reached. Please try again in a few minutes.";
    }
    if (message.includes('safety') || message.includes('candidate')) {
        return "AI filtering: The AI declined this content for safety/content reasons. Adjust your input.";
    }
    if (message.includes('400') || message.includes('bad request')) {
        return "Invalid request: The AI model could not process the input. Ensure it's clear and valid.";
    }
    if (message.includes('401') || message.includes('unauthorized')) {
        return "Authentication failed: AI service access denied.";
    }
    if (message.includes('403') || message.includes('forbidden')) {
        return "Access forbidden: You do not have permission to use this AI model.";
    }
    if (message.includes('model is not available') || message.includes('unsupported model') || message.includes('not found for api version')) {
        return "Selected Gemini model is unavailable for this key/project. Set a supported model via VITE_GEMINI_MODEL (for example gemini-flash-lite-latest), and ensure Gemini API is enabled for the same Google project as your key.";
    }
    if (message.includes('ocr function failed (404)')) {
        return "AI extraction service is not deployed or reachable. Deploy Supabase Edge Function 'gemini_ocr' and verify VITE_SUPABASE_URL points to the correct project.";
    }
    if (message.includes('500') || message.includes('internal server error')) {
        return "AI service temporarily unavailable. Please try again later.";
    }

    // Generic HTTP errors
    if (message.includes('404') || message.includes('not found')) {
        return "Resource not found. The requested item/service could not be located.";
    }
    if (message.includes('405') || message.includes('method not allowed')) {
        return "Action not allowed. The server rejected the request method.";
    }

    // Fallback for any other errors
    return `An unexpected error occurred: ${error?.message || "Unknown error details"}.`;
};
