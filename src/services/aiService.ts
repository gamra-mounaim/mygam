import { GoogleGenAI, Type } from "@google/genai";
import { Product, Sale } from "../types";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || '' 
});

export interface PredictionResult {
  nextMonthTotal: number;
  confidence: number;
  recommendations: string[];
}

export const predictSales = async (
  products: Product[],
  sales: Sale[],
  settings: { currency: string; storeName: string }
): Promise<PredictionResult> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const inventorySummary = products.map(p => ({
    name: p.name,
    stock: p.qty,
    price: p.sell,
    cost: p.cost
  }));

  const recentSalesSummary = sales.slice(0, 100).map(s => ({
    total: s.total,
    itemsCount: s.items.length,
    date: s.timestamp
  }));

  const prompt = `
    You are an expert sales analyst for "${settings.storeName}".
    Based on the following inventory and recent sales data, predict the sales performance for the next month.
    
    Inventory:
    ${JSON.stringify(inventorySummary)}
    
    Recent Sales:
    ${JSON.stringify(recentSalesSummary)}
    
    Current Currency: ${settings.currency}
    
    Provide a prediction of the total sales value for next month, a confidence score (0-1), and 3 actionable recommendations.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nextMonthTotal: {
              type: Type.NUMBER,
              description: "Predicted total sales value for next month"
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence level of the prediction from 0 to 1"
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of 3 actionable business recommendations"
            }
          },
          required: ["nextMonthTotal", "confidence", "recommendations"]
        }
      }
    });

    if (!response.text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(response.text) as PredictionResult;
  } catch (error) {
    console.error("AI Sales Prediction failed:", error);
    throw error;
  }
};
