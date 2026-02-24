

export const parseNetworkAndApiError = (error: any): string => {
    const message = String(error?.message || error || "Unknown Error").toLowerCase();
    
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
    if (message.includes('model is not available') || message.includes('unsupported model') || message.includes('not found for api version') || ((message.includes('model') || message.includes('models/')) && message.includes('not found'))) {
        return "Selected Gemini model is unavailable for this key/project. Set VITE_GEMINI_MODEL to an allowed model (e.g. gemini-1.5-flash or gemini-2.0-flash) and ensure Gemini API is enabled for the same Google project as your key.";
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
