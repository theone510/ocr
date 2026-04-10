
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, GEMINI_MODEL } from "../constants";

// The analyzeManuscript function now initializes a fresh client for every request
// to ensure it captures any potential updates to environment variables or session tokens.
export const analyzeManuscript = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    // Initialize with apiKey from environment variables as per requirements
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Model configuration for high-quality manuscript transcription
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
        temperature: 0.1, // Maintains factual accuracy for OCR tasks
      },
    });

    // Access text property directly from GenerateContentResponse
    if (!response.text) {
      throw new Error("No text was extracted from the image.");
    }

    return response.text;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};
