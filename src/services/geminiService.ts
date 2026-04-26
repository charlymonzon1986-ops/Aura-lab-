import { auth } from "../firebase";
import axios from "axios";

export async function analyzePhoto(imageData: string, mimeType: string, prompt: string) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    const token = await user.getIdToken();

    const response = await axios.post('/api/ai/analyze', {
      imageData,
      mimeType,
      prompt
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.data.text;
  } catch (error) {
    console.error("Gemini Analyze Error:", error);
    throw error;
  }
}

export async function smartEnhance(imageData: string, mimeType: string, prompt: string) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");
    const token = await user.getIdToken();

    const response = await axios.post('/api/ai/enhance', {
      imageData,
      mimeType,
      prompt
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.data.text;
  } catch (error) {
    console.error("Gemini Enhance Error:", error);
    throw error;
  }
}
