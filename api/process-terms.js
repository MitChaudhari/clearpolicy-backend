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

    // Calculate maximum input tokens and approximate characters
    const maxInputTokens = contextWindow - maxOutputTokens;
    const maxInputChars = maxInputTokens * 4; // Approximate conversion

    // Determine if we need to split the text into chunks
    const termsLength = termsText.length;

    let concernsList = [];

    if (termsLength <= maxInputChars) {
      // No need to split; process in a single API call
      console.log("Processing Terms of Use in one API call.");

      // Make the OpenAI API request
      const concerns = await processChunk(termsText, model, maxOutputTokens);
      concernsList = concernsList.concat(concerns);
    } else {
      // Split the text into chunks based on max input characters
      console.log("Splitting Terms of Use into chunks for processing.");

      const numChunks = Math.ceil(termsLength / maxInputChars);

      for (let i = 0; i < numChunks; i++) {
        const start = i * maxInputChars;
        const end = Math.min(start + maxInputChars, termsLength);
        const chunk = termsText.slice(start, end);

        console.log(`Processing chunk ${i + 1} of ${numChunks}...`);

        // Process each chunk individually
        const concerns = await processChunk(chunk, model, maxOutputTokens, i + 1);
        concernsList = concernsList.concat(concerns);
      }
    }

    return concernsList; // Return the aggregated list of concerns
  } catch (error) {
    console.error("Error with OpenAI API:", error);
    throw new Error(
      error.response?.data?.error?.message ||
        error.message ||
        "Failed to summarize the Terms of Use"
    );
  }
}

// Function to process a single chunk of text
async function processChunk(chunkText, model, maxOutputTokens, chunkNumber = null) {
  try {
    // Prepare the prompt
    const prompt = `As a legal expert reviewing a Terms of Use document, please identify and summarize only the severely problematic or concerning sections of the following ${
      chunkNumber ? `chunk ${chunkNumber} of the Terms of Use` : "Terms of Use"
    }. Focus only on violations that are so severe they could likely change a user's decision to sign up for the product or use it. For each concern, provide:

- "section": The section name or number, if available.
- "quote": The exact quote from the Terms that is concerning.
- "concern": A brief explanation of why it is severely concerning.

Concentrate on sections that involve significant privacy violations or limitations of user rights, such as:

1. **Excessive Data Collection**: Collection of sensitive personal information without clear justification.
2. **Unrestricted Data Usage**: Use of data in ways that could seriously compromise privacy, such as selling personal data to third parties.
3. **Data Sharing Without Consent**: Sharing data with third parties without user consent or in ways that violate user expectations.
4. **Severe Limitation of User Rights**: Clauses that prevent users from accessing, modifying, or deleting their own data.
5. **Unreasonable Data Retention**: Retaining user data indefinitely without valid reason.
6. **Waiving Legal Rights**: Any waivers of important legal rights, such as the right to sue or join class-action lawsuits.
7. **Excessive Limitation of Liability**: Clauses that absolve the company of liability even in cases of gross negligence or misconduct.
8. **Mandatory Arbitration with Unfair Terms**: Arbitration clauses that unfairly limit legal recourse or are heavily biased towards the company.
9. **Unilateral Agreement Changes**: Terms allowing the company to change the agreement at any time without notice, especially if changes affect user rights.

Ignore any standard or minor terms that are commonly acceptable or not significantly detrimental to the user.

**Important:** Only provide the JSON array in your response. Do not include any explanations or additional text.

**Ensure the JSON is properly formatted and valid.**

**Example response:**

[
  {
    "section": "Section 4.2",
    "quote": "We reserve the right to share your personal data, including financial information, with third parties for any purpose.",
    "concern": "Allows unrestricted sharing of sensitive personal data without user consent, posing a severe privacy risk."
  }
]

${chunkNumber ? `Chunk ${chunkNumber}` : "Terms of Use"}:

${chunkText}`;

    // Make the OpenAI API request
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content:
            "You are a legal expert specializing in identifying severely problematic clauses in Terms of Use documents.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: maxOutputTokens,
      temperature: 0.0, // Set temperature to 0 for deterministic output
    });

    // Extract and parse the completion content
    let responseContent = completion.choices[0].message.content.trim();

    console.log("OpenAI API response:", responseContent);

    // Attempt to extract JSON from the response
    const jsonMatch = responseContent.match(/\[.*\]/s);
    if (jsonMatch) {
      responseContent = jsonMatch[0];
    } else {
      console.error("No JSON array found in OpenAI response.");
      throw new Error("Failed to extract JSON array from OpenAI response.");
    }

    try {
      const parsedConcerns = JSON.parse(responseContent);
      return parsedConcerns;
    } catch (parseError) {
      console.error("Error parsing JSON from OpenAI response:", parseError);
      console.error("Attempting to fix JSON...");
      // Try to fix the JSON
      const fixedJSON = fixJSON(responseContent);
      if (fixedJSON) {
        return fixedJSON;
      } else {
        throw new Error("Failed to parse and fix JSON from OpenAI response.");
      }
    }
  } catch (error) {
    console.error(
      "Error during processChunk:",
      error.response?.data || error.message || error
    );
    throw error;
  }
}

// Function to attempt to fix malformed JSON
function fixJSON(jsonString) {
  try {
    // Remove any trailing characters after the JSON array
    const jsonArrayString = jsonString.match(/\[.*\]/s)[0];

    // Replace smart quotes with regular quotes
    const sanitizedString = jsonArrayString
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

    // Remove any invalid control characters
    const cleanedString = sanitizedString.replace(/[\u0000-\u001F]+/g, "");

    const parsedJSON = JSON.parse(cleanedString);
    return parsedJSON;
  } catch (error) {
    console.error("Failed to fix JSON:", error);
    return null;
  }
}

// Helper function to set CORS headers
function setCORSHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Or specify your extension ID
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  // Set CORS headers for all responses
  setCORSHeaders(res);

  if (req.method === "OPTIONS") {
    // Handle preflight requests
    return res.status(200).end();
  }

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

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
