// api/process-terms.js

import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Helper function to convert characters to tokens
const charsToTokens = (chars) => Math.ceil(chars / 4);

// Token limits for each model
const TOKEN_LIMITS = {
  'gpt-3.5-turbo': { contextWindow: 4096, maxOutputTokens: 1500 },
  'gpt-4': { contextWindow: 8192, maxOutputTokens: 3000 },
};

// Function to summarize the Terms of Use or privacy policy
async function summarizePolicy(termsText) {
  try {
    const model = 'gpt-3.5-turbo'; // Choose the model you have access to
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
      const completion = await openai.createChatCompletion({
        model: model,
        messages: [
          {
            role: 'system',
            content:
              'You are a legal expert specializing in identifying problematic clauses in Terms of Use documents.',
          },
          {
            role: 'user',
            content: `You are a legal expert reviewing a Terms of Use document. 
            Please identify and summarize only the problematic or concerning sections of the following Terms of Use chunk. 
            Focus on sections that may negatively impact user rights or privacy, such as:
            - **Data Collection**: Any invasive or excessive data collection practices.
            - **Data Usage**: Any use of data that could compromise privacy or security.
            - **Data Sharing**: Sharing data with third parties that may violate user expectations.
            - **User Rights**: Clauses that limit user rights or impose unreasonable restrictions.
            - **Retention**: Terms that involve retaining user data for an unusually long time.
            - **Waiving Rights**: Any waivers of important legal rights.

            Ignore any benign or standard terms that are commonly acceptable. Summarize only the concerning parts in the chunk below:
            ${chunk}`,
          },
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.7,
      });

      // Extract the completion content
      const chunkConcerns = completion.data.choices[0].message.content.trim();

      // Add the concerns to the list
      concernsList.push({ chunk: i + 1, concerns: chunkConcerns });
    }

    return concernsList; // Return the list of concerns for all chunks
  } catch (error) {
    console.error('Error with OpenAI API:', error);
    // Pass the actual error message back
    throw new Error(error.response?.data?.error?.message || error.message || 'Failed to summarize the Terms of Use');

  }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*'); // Adjust as needed
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    if (req.method === 'OPTIONS') {
      return res.status(200).end(); // Handle preflight request
    }
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { termsContent } = req.body;
  
      if (!termsContent || termsContent.trim() === '') {
        console.error('No Terms of Use content provided');
        return res.status(400).json({ error: 'No Terms of Use content provided' });
      }
  
      console.log('Received Terms of Use content:', termsContent);
  
      // Summarize the content using OpenAI
      const concerns = await summarizePolicy(termsContent);
  
      // Send back the structured concerns
      res.status(200).json({ concerns });
    } catch (error) {
      console.error('Error processing Terms of Use:', error);
  
      // Ensure error is returned as JSON
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  }  
