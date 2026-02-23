
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import type { ExtractedPurchaseBill, PurchaseItem, SubstituteResult, ExtractedSalesBill } from "../types";
import { parseNetworkAndApiError } from '../utils/error';

/**
 * Safely gets an instance of the GoogleGenAI client.
 */
export const getAiClient = (): GoogleGenAI => {
    // Support common key names used in this repo and Vite/client deployment variants.
    const env = (import.meta as any).env || {};
    const rawApiKey =
        env.VITE_GEMINI_API_KEY ||
        env.VITE_API_KEY ||
        env.VITE_GOOGLE_API_KEY ||
        env.VITE_GOOGLE_GENAI_API_KEY ||
        process.env.VITE_GEMINI_API_KEY ||
        process.env.VITE_API_KEY ||
        process.env.VITE_GOOGLE_API_KEY ||
        process.env.VITE_GOOGLE_GENAI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENAI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.API_KEY;

    // Normalize common pasted formats (quoted values or prefixed labels).
    const normalizedKey = String(rawApiKey || '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/^vite_gemini_api_key[-:=\s]*/i, '')
        .replace(/^gemini_api_key[-:=\s]*/i, '')
        .replace(/^google_api_key[-:=\s]*/i, '');

    if (!normalizedKey) {
        throw new Error("Gemini API key missing. Set VITE_GEMINI_API_KEY (or VITE_GOOGLE_API_KEY) in .env.local and restart the app.");
    }

    return new GoogleGenAI({ apiKey: normalizedKey });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanJsonString = (text: string): string => {
    if (!text) return '[]';
    return text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
};

const parseAiError = (error: any): string => {
    return parseNetworkAndApiError(error);
};

const generateWithRetry = async (
    model: string,
    params: any,
    retries = 3,
    baseDelay = 2000
): Promise<GenerateContentResponse> => {
    let lastError: any;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const ai = getAiClient();
            return await ai.models.generateContent({
                model,
                ...params
            });
        } catch (error: any) {
            lastError = error;
            const message = String(error?.message || "").toLowerCase();
            const shouldRetry = message.includes('429') ||
                message.includes('resource_exhausted') ||
                message.includes('500') ||
                message.includes('internal error') ||
                message.includes('503');
            if (shouldRetry && attempt < retries - 1) {
                await wait(baseDelay * Math.pow(2, attempt));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

const generateWithModelFallback = async (
    models: string[],
    params: any
): Promise<GenerateContentResponse> => {
    let lastError: any;

    for (const model of models) {
        try {
            return await generateWithRetry(model, params);
        } catch (error: any) {
            lastError = error;
            const message = String(error?.message || '').toLowerCase();
            const isModelIssue =
                message.includes('model') && (message.includes('not found') || message.includes('unsupported') || message.includes('invalid'));

            if (isModelIssue) {
                continue;
            }
            throw error;
        }
    }

    throw lastError;
};

// Professional System Instruction
const SYSTEM_PERSONALITY = `You are the MDXERA ERP Assistant, a highly professional, efficient, and meticulous pharmacy management expert. 
Your primary goal is to help pharmacy owners manage their inventory, sales, and statutory compliance with absolute accuracy. 
Your tone is professional, helpful, and concise. You provide data-driven insights and actionable advice for business optimization.
Always prioritize pharmaceutical accuracy and professional standard operating procedures.`;

export const getAiInsights = async (summary: any): Promise<string[]> => {
    try {
        const prompt = `Analyze this pharmacy data and provide 3 brief actionable insights in a JSON array of strings: ${JSON.stringify(summary)}`;
        const response = await generateWithRetry('gemini-1.5-flash', {
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            },
        });

        if (!response.text) throw new Error("Empty AI response");
        console.log("MDXERA AI Raw Trace:", response.text);

        try {
            return JSON.parse(cleanJsonString(response.text));
        } catch (parseErr) {
            console.error("AI JSON Parse Error. Content:", response.text);
            throw new Error("AI returned malformed data. Please try again.");
        }

    } catch (error: any) {
        console.error("Gemini Extraction Error Details:", error);

        const apiError = parseAiError(error).toLowerCase();
        let errorMessage = "AI Extraction failed. ";

        if (apiError.includes('429') || apiError.includes('limit')) {
            errorMessage += "Rate limit reached. Please wait 60 seconds.";
        } else if (apiError.includes('invalid_api_key') || apiError.includes('key not found')) {
            errorMessage += "API Key Configuration Error.";
        } else if (apiError.includes('safety')) {
            errorMessage += "Content blocked by safety filters.";
        } else if (error.message?.includes('mismatch')) {
            errorMessage = error.message; // Pass through specific mismatch errors if thrown earlier
        } else {
            errorMessage += "Please ensure the images are clear and belong to the same bill.";
        }

        return ["AI analysis is currently unavailable. Please check your connection and try again."];
    }
};

export interface FileInput {
    mimeType: string;
    data: string;
}

export const extractPurchaseDetailsFromBill = async (
    inputFiles: FileInput[],
    pharmacyName: string
): Promise<ExtractedPurchaseBill> => {
    try {
        const fileParts = inputFiles.map(file => ({
            inlineData: {
                mimeType: file.mimeType,
                data: file.data,
            },
        }));

        const prompt = `
            Analyze these purchase invoice images for "${pharmacyName}".
            
            CROSS-PAGE CONSOLIDATION RULES:
            1. RECONCILE IDENTITY: If multiple pages are provided, they must belong to the same bill. However, allow for slight OCR variations in 'supplier' name (e.g., "M/S ABC" vs "ABC") or 'invoiceNumber' (e.g., "123" vs "0123"). Do not fail for minor formatting differences.
            2. AGGREGATE ALL ITEMS: Extract every single item from EVERY page. Do not stop after the first page. Combine them into a single list.
            3. CONSISTENT METADATA: Use the supplier name, GST, invoice number, and date from the best-quality page (usually the first).
             
            Return ONLY valid JSON following the schema.
        `;

        // Try multiple model names because availability can differ by project/region.
        const response = await generateWithModelFallback(['gemini-1.5-flash', 'gemini-1.5-pro'], {
            contents: { parts: [...fileParts, { text: prompt }] },
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        supplier: { type: Type.STRING },
                        supplierGstNumber: { type: Type.STRING },
                        invoiceNumber: { type: Type.STRING },
                        date: { type: Type.STRING },
                        error: { type: Type.STRING },
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    batch: { type: Type.STRING },
                                    packType: { type: Type.STRING },
                                    expiry: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER },
                                    freeQuantity: { type: Type.NUMBER },
                                    purchasePrice: { type: Type.NUMBER },
                                    mrp: { type: Type.NUMBER },
                                    gstPercent: { type: Type.NUMBER },
                                    discountPercent: { type: Type.NUMBER }
                                },
                                required: ['name', 'quantity', 'purchasePrice', 'mrp']
                            }
                        }
                    },
                    required: ['items']
                }
            }
        });

        if (!response.text) throw new Error("Empty AI response");
        return JSON.parse(cleanJsonString(response.text));

    } catch (error: any) {
        console.error("Gemini Extraction Error Details:", error);
        let errorMessage = "AI Extraction failed. Please ensure all uploaded images are clear, properly aligned, and belong to the same bill. Make sure the supplier name and bill number are visible and consistent across all pages. Then re-upload and try again.";

        const apiError = parseAiError(error).toLowerCase();
        const rawError = String(error?.message || '').toLowerCase();

        if (apiError.includes('gemini api key missing') || apiError.includes('api key missing')) {
            errorMessage = "Gemini API key is missing. Set VITE_GEMINI_API_KEY in .env.local and restart npm run dev.";
        } else if (apiError.includes('403') || apiError.includes('permission_denied') || apiError.includes('referer') || apiError.includes('forbidden')) {
            errorMessage = "Gemini request blocked (403). If your API key has restrictions, allow this app origin (localhost) or use an unrestricted key for testing.";
        } else if (apiError.includes('401') || apiError.includes('invalid api key') || apiError.includes('api_key_invalid') || apiError.includes('key not found') || apiError.includes('unauthorized')) {
            errorMessage = "Gemini API key is invalid. Recheck the key in .env.local and restart npm run dev.";
        } else if (apiError.includes('429') || apiError.includes('limit')) {
            errorMessage = "AI limit reached. Please try again in a few moments.";
        } else if (apiError.includes('quota')) {
            errorMessage = "Monthly AI quota exceeded.";
        } else if (apiError.includes('safety')) {
            errorMessage = "Document content was flagged by AI safety filters.";
        } else if (rawError.includes('model') && (rawError.includes('not found') || rawError.includes('unsupported') || rawError.includes('invalid'))) {
            errorMessage = "Gemini model is not available for this API key/project. Enable Gemini API in Google AI Studio and use a supported key.";
        } else {
            errorMessage = `${errorMessage} Technical details: ${parseAiError(error)}`;
        }

        return {
            supplier: '',
            invoiceNumber: '',
            date: '',
            items: [],
            error: errorMessage
        };
    }
};

export const extractPrescription = async (
    file: FileInput,
    pharmacyName: string
): Promise<ExtractedSalesBill> => {
    try {
        const prompt = `
            Act as a highly accurate Pharmacist Assistant. Analyze the provided medical prescription.
            1. Extract the Patient Name (as customerName).
            2. Extract all listed medicines. For each, identify:
               - name: The brand or generic name.
               - quantity: The total number of units prescribed (calculate from frequency and duration if needed, e.g., 1-0-1 for 5 days = 10 units).
            Return ONLY valid JSON.
        `;

        // Switched to gemini-3-flash-preview and disabled thinking budget for high-speed OCR/extraction
        const response = await generateWithRetry('gemini-1.5-flash', {
            contents: {
                parts: [
                    { inlineData: { mimeType: file.mimeType, data: file.data } },
                    { text: prompt }
                ]
            },
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        customerName: { type: Type.STRING },
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    quantity: { type: Type.NUMBER }
                                },
                                required: ['name', 'quantity']
                            }
                        }
                    }
                }
            }
        });

        if (!response.text) throw new Error("Empty AI response");
        return JSON.parse(cleanJsonString(response.text));

    } catch (error: any) {
        console.error("Prescription AI Error:", error);
        return { items: [], error: "Prescription analysis failed. Please ensure the image is clear." };
    }
};

export const generateTextToSpeech = async (text: string): Promise<string> => {
    try {
        const response = await generateWithRetry("gemini-1.5-flash", {
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
    } catch (error) {
        throw new Error(parseAiError(error));
    }
};

export const generatePromotionalImage = async (prompt: string, logoUrl?: string): Promise<string> => {
    try {
        const parts: any[] = [{ text: `Social media graphic for: "${prompt}". Professional, clean, and medical aesthetic.` }];
        if (logoUrl?.startsWith('data:')) {
            const [mime, data] = logoUrl.split(';base64,');
            parts.push({ inlineData: { mimeType: mime.replace('data:', ''), data } });
        }

        const response = await generateWithRetry('gemini-1.5-flash', {
            contents: { parts },
            config: { imageConfig: { aspectRatio: "1:1" } }
        });

        const imageData = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData;
        if (!imageData) throw new Error("No image data returned.");
        return `data:${imageData.mimeType};base64,${imageData.data}`;
    } catch (error: any) {
        throw new Error(parseAiError(error));
    }
};

export const generateCaptionsForImage = async (prompt: string): Promise<string[]> => {
    try {
        const response = await generateWithRetry('gemini-1.5-flash', {
            contents: `Write 3 professional social media captions for this promo: "${prompt}". JSON array of strings.`,
            config: {
                systemInstruction: SYSTEM_PERSONALITY,
                responseMimeType: "application/json",
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
        });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (error) {
        return ["Your health is our priority.", "Genuine medicines at competitive rates.", "Professional care for the community."];
    }
};

export const findSubstitutes = async (text?: string, imageBase64?: string, mimeType?: string): Promise<SubstituteResult> => {
    const ai = getAiClient();
    const model = 'gemini-1.5-pro';
    const parts: any[] = [{ text: "Find medicine substitutes for: " + (text || "the provided image") }];
    if (imageBase64) {
        parts.push({ inlineData: { mimeType: mimeType!, data: imageBase64 } });
    }

    const systemInstruction = `${SYSTEM_PERSONALITY} You are an Expert Pharmacologist. Identify the salt and suggest 5-8 brand-name substitutes available in India.`;

    const substituteSchema = {
        type: Type.OBJECT,
        properties: {
            SUMMARY: { type: Type.STRING },
            PRIMARY_PRODUCT: {
                type: Type.OBJECT,
                properties: {
                    brand_name: { type: Type.STRING },
                    generic_name: { type: Type.STRING },
                    strength: { type: Type.STRING },
                    dosage_form: { type: Type.STRING },
                    pack_info: { type: Type.STRING },
                    google_reference_url: { type: Type.STRING },
                },
                required: ['brand_name', 'generic_name', 'strength', 'dosage_form']
            },
            SUBSTITUTES_LIST: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        brand_name: { type: Type.STRING },
                        manufacturer: { type: Type.STRING },
                        is_exact_match: { type: Type.BOOLEAN },
                        notes: { type: Type.STRING },
                    },
                    required: ['brand_name', 'is_exact_match']
                }
            },
            RAW_SEARCH_REFERENCES: { type: Type.ARRAY, items: { type: Type.STRING } },
            SAFETY_NOTE: { type: Type.STRING },
        },
        required: ['SUMMARY', 'PRIMARY_PRODUCT', 'SUBSTITUTES_LIST', 'SAFETY_NOTE']
    };

    try {
        const response = await generateWithRetry(model, {
            contents: { parts },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: substituteSchema
            }
        });
        if (!response.text) throw new Error("Empty response from AI");
        return JSON.parse(cleanJsonString(response.text));
    } catch (error: any) {
        throw new Error(parseAiError(error));
    }
};
