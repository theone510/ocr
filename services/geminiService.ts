
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, GEMINI_MODEL } from "../constants";

// The analyzeManuscript function now initializes a fresh client for every request
// to ensure it captures any potential updates to environment variables or session tokens.
export const analyzeManuscript = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    // Initialize with apiKey from environment variables as per requirements
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    
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

    // Access text property directly or via function depending on genai SDK version
    // Use 'any' cast to prevent TypeScript from complaining if it thinks text is strictly a string getter
    const textValue = typeof (response as any).text === 'function' ? (response as any).text() : response.text;

    if (!textValue) {
      console.error("Gemini Raw Response:", JSON.stringify(response, null, 2));
      const finishReason = response.candidates?.[0]?.finishReason;
      
      // If the model finished normally but returned no text, it likely means the page is blank or has no recognizable text.
      // We return an empty string so that batch processing continues instead of failing.
      if (finishReason === 'STOP') {
        return "";
      }

      let errMsg = "No text was extracted from the image.";
      if (finishReason) {
        errMsg += ` (Reason: ${finishReason})`;
      }
      throw new Error(errMsg);
    }

    return textValue;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};
