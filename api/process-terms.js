// api/process-terms.js

import OpenAI from "openai";

// Helper function to set CORS headers
function setCORSHeaders(res) {
  const allowedOrigins = [
    // List of allowed origins
    "chrome-extension://occbnfdfebomfpfkbjdjbinecmljnmki",
    "https://signup.com",
    "https://disneytermsofuse.com",
    "https://open.spotify.com",
    "https://www.chase.com",
    "https://promotions.bankofamerica.com",
    "https://www.fidelity.com",
  ];
  const origin = res.req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "null"); // Or handle as needed
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  // Set CORS headers
  setCORSHeaders(res);

  if (req.method === "OPTIONS") {
    // Handle preflight OPTIONS request
    res.status(200).end();
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY is not set in environment variables.");
    res.status(500).json({ error: "OPENAI_API_KEY is not set." });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const { termsContent } = req.body;

    if (!termsContent || termsContent.trim() === "") {
      console.error("No Terms of Use content provided");
      res.status(400).json({ error: "No Terms of Use content provided" });
      return;
    }

    console.log("Received Terms of Use content.");

    const concerns = await summarizePolicy(termsContent, openai);

    res.status(200).json({ concerns });
  } catch (error) {
    console.error("Error processing Terms of Use:", error);

    // Ensure CORS headers are set on error responses
    setCORSHeaders(res);

    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}

// Function to summarize the Terms of Use or privacy policy
async function summarizePolicy(termsText, openai) {
  try {
    const model = "gpt-4o-mini"; // Use the specified model
    const TOKEN_LIMITS = {
      "gpt-4o-mini": { contextWindow: 128000, maxOutputTokens: 16384 },
      "gpt-4o-2024-08-06": { contextWindow: 128000, maxOutputTokens: 16384 },
    };
    const { contextWindow, maxOutputTokens } = TOKEN_LIMITS[model];

    const charsToTokens = (chars) => Math.ceil(chars / 4);

    // Calculate total tokens for the input text
    const totalTokens = charsToTokens(termsText.length);

    // Determine how many chunks are needed based on the context window
    const maxInputTokens = contextWindow - maxOutputTokens;
    const numChunks = Math.ceil(totalTokens / maxInputTokens);

    let concernsList = [];

    // Split the text into chunks and make multiple API calls
    for (let i = 0; i < numChunks; i++) {
      const start = i * maxInputTokens * 4;
      const end = start + maxInputTokens * 4;
      const chunk = termsText.slice(start, end);

      console.log(`Summarizing chunk ${i + 1} of ${numChunks}...`);

      // Prepare the messages
      const messages = [
        {
          role: "system",
          content:
            "You are a legal expert specializing in identifying problematic clauses in Terms of Use documents.",
        },
        {
          role: "user",
          content: `You are a legal expert reviewing a Terms of Use document.

Please identify and summarize only the problematic or concerning sections of the following Terms of Use chunk.

Focus on sections that may negatively impact user rights or privacy, such as:

- Data Collection: Any invasive or excessive data collection practices.
- Data Usage: Any use of data that could compromise privacy or security.
- Data Sharing: Sharing data with third parties that may violate user expectations.
- User Rights: Clauses that limit user rights or impose unreasonable restrictions.
- Limitation of Liability: Clauses that unfairly limit the company's liability or set low maximum damages.
- Indemnification: Requirements for users to indemnify the company in ways that may be overly burdensome.
- Dispute Resolution: Mandatory arbitration clauses, class action waivers, or terms that limit legal recourse.
- Governing Law and Jurisdiction: Terms requiring users to submit to unfavorable laws or jurisdictions.
- Retention: Terms involving retaining user data for an unusually long time.
- Waiving Rights: Any waivers of important legal rights.

Ignore any benign or standard terms that are commonly acceptable.

Chunk:

${chunk}`,
        },
      ];

      // Make the OpenAI API request
      console.log("Making OpenAI API request with model:", model);
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: maxOutputTokens,
        temperature: 0.5,
      });

      // Extract the completion content
      const chunkConcernsText = completion.choices[0].message.content.trim();
      console.log("Received GPT output:", chunkConcernsText);

      // Collect the outputs as is
      concernsList.push(chunkConcernsText);
    }

    console.log("Final concerns list:", concernsList);
    return concernsList; // Return the list of concerns for all chunks
  } catch (error) {
    console.error(
      "Error with OpenAI API:",
      error.response?.data || error.message || error
    );
    throw error; // Re-throw the error to be caught in the handler
  }
}
