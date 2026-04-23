import { GoogleGenAI } from "@google/genai";

// The platform injects GEMINI_API_KEY into the environment
const apiKey = (process.env.GEMINI_API_KEY as string);
const ai = new GoogleGenAI({ apiKey });

export async function analyzePhoto(imageData: string, mimeType: string, prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageData,
              mimeType: mimeType
            }
          }
        ]
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Analyze Error:", error);
    throw error;
  }
}

export async function smartEnhance(imageData: string, mimeType: string, prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageData,
              mimeType: mimeType
            }
          }
        ]
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Enhance Error:", error);
    throw error;
  }
}
