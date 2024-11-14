// api/process-terms.js

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY is not set in environment variables.");
}

const charsToTokens = (chars) => Math.ceil(chars / 4);

// Token limits for each model
const TOKEN_LIMITS = {
  "gpt-4o-mini": { contextWindow: 128000, maxOutputTokens: 16384 },
  "gpt-4o-2024-08-06": { contextWindow: 128000, maxOutputTokens: 16384 },
};

// Function to summarize the Terms of Use or privacy policy
async function summarizePolicy(termsText) {
  try {
    const model = "gpt-4o-mini"; // Choose the model version
    const { contextWindow, maxOutputTokens } = TOKEN_LIMITS[model];

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

      // Make the OpenAI API request
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are a legal expert specializing in identifying " +
              "problematic clauses in Terms of Use documents.",
          },
          {
            role: "user",
            content: `You are a legal expert reviewing a Terms of Use document.

Please identify and summarize only the problematic or concerning sections of the following Terms of Use chunk.

Focus on sections that may negatively impact user rights or privacy, such as:

- **Data Collection**: Any invasive or excessive data collection practices.
- **Data Usage**: Any use of data that could compromise privacy or security.
- **Data Sharing**: Sharing data with third parties that may violate user expectations.
- **User Rights**: Clauses that limit user rights or impose unreasonable restrictions.
- **Limitation of Liability**: Clauses that unfairly limit the company's liability or set low maximum damages.
- **Indemnification**: Requirements for users to indemnify the company in ways that may be overly burdensome.
- **Dispute Resolution**: Mandatory arbitration clauses, class action waivers, or terms that limit legal recourse.
- **Governing Law and Jurisdiction**: Terms requiring users to submit to unfavorable laws or jurisdictions.
- **Retention**: Terms involving retaining user data for an unusually long time.
- **Waiving Rights**: Any waivers of important legal rights.

For each concern, provide:

- **Section Name**: Brief description of the concern, referencing specific clauses or language from the text when appropriate.

**Example:**

- **Limitation of Liability**: The Terms limit the company's total liability to $1,000, which may not cover potential damages. For example, it states: "IN NO EVENT SHALL OUR TOTAL LIABILITY TO YOU FOR ALL DAMAGES... EXCEED ONE THOUSAND U.S. DOLLARS (US $1,000)."

Ignore any benign or standard terms that are commonly acceptable.

Chunk:

${chunk}`,
          },
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.5,
      });

      // Extract the completion content
      const chunkConcerns = completion.choices[0].message.content.trim();

      // Add the concerns to the list
      concernsList.push(chunkConcerns);
    }

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
  // Allow requests from Chrome extensions
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Access-Control-Allow-Headers"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { termsContent } = req.body;

    if (!termsContent || termsContent.trim() === "") {
      console.error("No Terms of Use content provided");
      return res
        .status(400)
        .json({ error: "No Terms of Use content provided" });
    }

    console.log("Received Terms of Use content:", termsContent);

    const concerns = await summarizePolicy(termsContent);

    res.status(200).json({ concerns });
  } catch (error) {
    console.error("Error processing Terms of Use:", error);
    res
      .status(500)
      .json({ error: error.message || "Internal Server Error" });
  }
}