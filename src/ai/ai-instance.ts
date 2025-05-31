
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Ensure you have GOOGLE_API_KEY set in your environment variables
const googleApiKey = process.env.GOOGLE_API_KEY;

if (!googleApiKey) {
  console.warn(
    'GOOGLE_API_KEY environment variable is not set. Genkit Google AI plugin may not function correctly.'
  );
  // Depending on your error handling strategy, you might throw an error here
  // throw new Error('GOOGLE_API_KEY environment variable is not set.');
}

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      apiKey: googleApiKey, // Use the API key from environment variable
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
});
