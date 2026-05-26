
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, GEMINI_MODEL } from "../constants";

const MAX_RETRIES = 5;        // 6 total attempts (attempt 0 + 5 retries)
const BASE_DELAY_MS = 2000;   // 2s→4s→8s→16s→32s exponential backoff

// Helper: delay for a given number of milliseconds
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The analyzeManuscript function with retry + exponential backoff
export const analyzeManuscript = async (base64Image: string, mimeType: string): Promise<string> => {
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Wait before retry (exponential backoff): 0s, 2s, 4s, 8s
      if (attempt > 0) {
        // Exponential backoff + jitter: prevents all users retrying at the same instant
        const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitterMs  = Math.random() * 1000; // 0–1000ms random
        const totalWait = Math.round(backoffMs + jitterMs);
        console.log(`Retry attempt ${attempt}/${MAX_RETRIES} after ${totalWait}ms...`);
        await delay(totalWait);
      }

      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image,
              },
            },
            {
              text: "Start extraction following the defined silent protocol.",
            }
          ],
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1,
        },
      });

      const textValue = typeof (response as any).text === 'function' ? (response as any).text() : response.text;

      if (!textValue) {
        const finishReason = response.candidates?.[0]?.finishReason;
        
        // Blank page: model finished normally but returned no text
        if (finishReason === 'STOP') {
          return "";
        }

        let errMsg = "No text was extracted from the image.";
        if (finishReason) {
          errMsg += ` (Reason: ${finishReason})`;
        }
        throw new Error(errMsg);
      }

      // Safety net: detect blank page meta-messages
      const lowerText = textValue.toLowerCase();
      if (
        lowerText.includes('completely blank') ||
        lowerText.includes('no text') ||
        lowerText.includes('cannot extract') ||
        lowerText.includes('لا يوجد نص') ||
        lowerText.includes('صفحة فارغة')
      ) {
        if (textValue.length < 200) {
          return "";
        }
      }

      return textValue;

    } catch (error: any) {
      lastError = error;
      
      // Check if this is a retryable error (network/rate-limit)
      // Only retry on transient server/network errors — fail fast on anything else
      const isRetryable =
        error.status === 503 ||
        error.status === 429 ||
        error.message?.includes('503') ||
        error.message?.includes('429') ||
        error.message?.includes('UNAVAILABLE') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('rate') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('network');
      
      if (!isRetryable || attempt === MAX_RETRIES) {
        console.error("Gemini Analysis Error (non-retryable or max retries reached):", error);
        throw error;
      }
      
      console.warn(`Gemini request failed (attempt ${attempt + 1}), will retry:`, error.message);
    }
  }

  // Should not reach here, but just in case
  throw lastError;
};
