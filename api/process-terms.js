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
  "gpt-4o-mini": { contextWindow: 128000, maxOutputTokens: 16384 }, // GPT-4o-mini
};

// Function to summarize the Terms of Use or Privacy Policy
async function summarizePolicy(termsText) {
  try {
    const model = "gpt-4o-mini"; // Model version
    const { contextWindow, maxOutputTokens } = TOKEN_LIMITS[model];

    // Calculate maximum input tokens and characters
    const maxInputTokens = contextWindow - maxOutputTokens;
    const maxInputChars = maxInputTokens * 4; // Convert tokens to characters

    // Determine if we need to split the text into chunks
    const termsLength = termsText.length;

    let concernsList = [];

    if (termsLength <= maxInputChars) {
      // No need to split; process in a single API call
      console.log("Processing Terms of Use in one API call.");

      // Make the OpenAI API request
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are a legal expert specializing in identifying problematic clauses in Terms of Use documents.",
          },
          {
            role: "user",
            content: `As a legal expert reviewing a Terms of Use document, please identify and summarize only the problematic or concerning sections of the following Terms of Use. For each concern, provide:

- **Section**: The section name or number, if available.
- **Quote**: The exact quote from the Terms that is concerning.
- **Concern**: A brief explanation of why it is concerning.

Focus on sections that may negatively impact user rights or privacy, such as:

1. **Data Collection**: Any invasive or excessive data collection practices.
2. **Data Usage**: Any use of data that could compromise privacy or security.
3. **Data Sharing**: Sharing data with third parties that may violate user expectations.
4. **User Rights**: Clauses that limit user rights or impose unreasonable restrictions.
5. **Retention**: Terms that involve retaining user data for an unusually long time.
6. **Waiving Rights**: Any waivers of important legal rights.
7. **Limitation of Liability**: Clauses that excessively limit the company's liability.
8. **Mandatory Arbitration**: Terms that require arbitration and limit legal recourse.
9. **Unilateral Changes**: Terms allowing the company to change the agreement without notice.

Ignore any benign or standard terms that are commonly acceptable.

**Please respond in JSON format as an array of concerns. Example:**

[
  {
    "section": "Section 4.2",
    "quote": "We reserve the right to share your data with third parties without your consent.",
    "concern": "Allows data sharing without user consent, violating privacy expectations."
  },
  ...
]

Terms of Use:

${termsText}`,
          },
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.7,
      });

      // Extract and parse the completion content
      const chunkConcerns = completion.choices[0].message.content.trim();

      try {
        const parsedConcerns = JSON.parse(chunkConcerns);
        concernsList = concernsList.concat(parsedConcerns);
      } catch (parseError) {
        console.error("Error parsing JSON from OpenAI response:", parseError);
        console.error("Received content:", chunkConcerns);
        throw new Error("Failed to parse JSON from OpenAI response.");
      }
    } else {
      // Split the text into chunks based on max input characters
      console.log("Splitting Terms of Use into chunks for processing.");

      const numChunks = Math.ceil(termsLength / maxInputChars);

      for (let i = 0; i < numChunks; i++) {
        const start = i * maxInputChars;
        const end = Math.min(start + maxInputChars, termsLength);
        const chunk = termsText.slice(start, end);

        console.log(`Processing chunk ${i + 1} of ${numChunks}...`);

        // Make the OpenAI API request for each chunk
        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: "system",
              content:
                "You are a legal expert specializing in identifying problematic clauses in Terms of Use documents.",
            },
            {
              role: "user",
              content: `As a legal expert reviewing a Terms of Use document, please identify and summarize only the problematic or concerning sections of the following Terms of Use chunk. For each concern, provide:

- **Section**: The section name or number, if available.
- **Quote**: The exact quote from the Terms that is concerning.
- **Concern**: A brief explanation of why it is concerning.

Focus on sections that may negatively impact user rights or privacy, such as:

1. **Data Collection**: Any invasive or excessive data collection practices.
2. **Data Usage**: Any use of data that could compromise privacy or security.
3. **Data Sharing**: Sharing data with third parties that may violate user expectations.
4. **User Rights**: Clauses that limit user rights or impose unreasonable restrictions.
5. **Retention**: Terms that involve retaining user data for an unusually long time.
6. **Waiving Rights**: Any waivers of important legal rights.
7. **Limitation of Liability**: Clauses that excessively limit the company's liability.
8. **Mandatory Arbitration**: Terms that require arbitration and limit legal recourse.
9. **Unilateral Changes**: Terms allowing the company to change the agreement without notice.

Ignore any benign or standard terms that are commonly acceptable.

**Please respond in JSON format as an array of concerns. Example:**

[
  {
    "section": "Section 4.2",
    "quote": "We reserve the right to share your data with third parties without your consent.",
    "concern": "Allows data sharing without user consent, violating privacy expectations."
  },
  ...
]

Chunk:

${chunk}`,
            },
          ],
          max_tokens: maxOutputTokens,
          temperature: 0.7,
        });

        // Extract and parse the completion content
        const chunkConcerns = completion.choices[0].message.content.trim();

        try {
          const parsedConcerns = JSON.parse(chunkConcerns);
          concernsList = concernsList.concat(parsedConcerns);
        } catch (parseError) {
          console.error("Error parsing JSON from OpenAI response:", parseError);
          console.error("Received content:", chunkConcerns);
          throw new Error("Failed to parse JSON from OpenAI response.");
        }
      }
    }

    return concernsList; // Return the aggregated list of concerns
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

// Helper function to set CORS headers
function setCORSHeaders(req, res) {
  // Access the Origin header from the request
  const origin = req.headers.origin;
  console.log("Request origin:", origin);

  // Allow requests from any origin (or restrict as needed)
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  // Set CORS headers
  setCORSHeaders(req, res);

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

    console.log("Received Terms of Use content.");

    const concerns = await summarizePolicy(termsContent);

    res.status(200).json({ concerns });
  } catch (error) {
    console.error("Error processing Terms of Use:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
