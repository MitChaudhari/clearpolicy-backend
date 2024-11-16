// api/process-terms.js

import OpenAI from "openai";
import { encoding_for_model, get_encoding } from "tiktoken";

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in environment variables.");
  throw new Error("OPENAI_API_KEY is not set.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Token limits for each model
const TOKEN_LIMITS = {
  "gpt-4o-mini": { contextWindow: 128000, maxOutputTokens: 16384 },
  "gpt-4o-2024-08-06": { contextWindow: 128000, maxOutputTokens: 16384 },
};

// Function to summarize the Terms of Use or privacy policy
async function summarizePolicy(termsText) {
  try {
    const model = "gpt-4o-mini"; // Use the specified model
    const { contextWindow, maxOutputTokens } = TOKEN_LIMITS[model];

    // Initialize the tokenizer for the specified model
    let tokenizer;
    try {
      tokenizer = encoding_for_model(model);
    } catch (e) {
      console.warn(`Tokenizer for model "${model}" not found. Using default tokenizer.`);
      // Use a default tokenizer if the model is not recognized
      tokenizer = get_encoding("cl100k_base");
    }

    // Tokenize the input text
    const tokens = tokenizer.encode(termsText);
    const totalTokens = tokens.length;
    console.log(`Total tokens in input text: ${totalTokens}`);

    // Determine how many chunks are needed based on the context window
    const maxInputTokens = contextWindow - maxOutputTokens - 2000; // Reserve tokens for the prompt and response
    const numChunks = Math.ceil(totalTokens / maxInputTokens);
    console.log(`Number of chunks: ${numChunks}`);

    let concernsList = [];

    // Split the text into chunks and make multiple API calls
    for (let i = 0; i < numChunks; i++) {
      const start = i * maxInputTokens;
      const end = Math.min(start + maxInputTokens, tokens.length);
      const chunkTokens = tokens.slice(start, end);
      const chunk = tokenizer.decode(chunkTokens);

      console.log(`Summarizing chunk ${i + 1} of ${numChunks}...`);

      // Prepare the messages
      const systemMessage = {
        role: "system",
        content:
          "You are a legal expert specializing in identifying problematic clauses in Terms of Use documents.",
      };

      const userMessageContent = `You are a legal expert reviewing a Terms of Use document.

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

For each concern, provide a JSON array of objects with the following structure:

\`\`\`json
[
  {
    "title": "Section Name",
    "description": "Brief description of the concern, referencing specific clauses or language from the text when appropriate."
  },
  // ... more concerns
]
\`\`\`

Ensure the entire response is valid JSON and does not contain any extraneous text.

Ignore any benign or standard terms that are commonly acceptable.

Chunk:

${chunk}`;

      // Tokenize the messages to ensure they fit within the context window
      const messages = [systemMessage, { role: "user", content: userMessageContent }];
      let messageTokens = 0;
      for (const message of messages) {
        messageTokens += tokenizer.encode(message.content).length;
      }

      if (messageTokens > contextWindow) {
        console.error("Messages exceed the model's maximum context length.");
        continue; // Skip this chunk
      }

      console.log("Total tokens for this message:", messageTokens);

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

      // Try to parse the GPT output as JSON
      let chunkConcerns;
      try {
        // Extract JSON from code block
        const jsonMatch = chunkConcernsText.match(/```json\s*([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : chunkConcernsText;

        chunkConcerns = JSON.parse(jsonString);
        if (Array.isArray(chunkConcerns)) {
          concernsList = concernsList.concat(chunkConcerns);
        } else {
          console.error("Chunk concerns is not an array:", chunkConcerns);
        }
      } catch (parseError) {
        console.error("Failed to parse chunk concerns as JSON:", parseError);
        console.error("GPT output was:", chunkConcernsText);
      }
    }

    console.log("Final concerns list:", concernsList);
    return concernsList; // Return the list of concerns for all chunks
  } catch (error) {
    console.error(
      "Error with OpenAI API:",
      error.response?.data || error.message || error
    );
    throw new Error(
      error.response?.data?.error?.message ||
        error.message ||
        "Failed to summarize the Terms of Use"
    );
  }
}

export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    // Handle preflight OPTIONS request
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { termsContent } = req.body;

    if (!termsContent || termsContent.trim() === "") {
      console.error("No Terms of Use content provided");
      res.status(400).json({ error: "No Terms of Use content provided" });
      return;
    }

    console.log("Received Terms of Use content.");

    const concerns = await summarizePolicy(termsContent);

    res.status(200).json({ concerns });
  } catch (error) {
    console.error("Error processing Terms of Use:", error);
    res
      .status(500)
      .json({ error: error.message || "Internal Server Error" });
  }
}