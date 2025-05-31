
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Ensure you have GOOGLE_API_KEY set in your environment variables
const googleApiKey = process.env.GOOGLE_API_KEY;

if (!googleApiKey) {
  const errorMessage = 'CRITICAL SERVER ERROR: GOOGLE_API_KEY environment variable is not set. The Genkit Google AI plugin cannot initialize, and any Genkit flows (including listEmojis, listCursors, etc.) may fail with a FAILED_PRECONDITION error. Please set this environment variable in your server environment where Next.js runs.';
  console.error('********************************************************************************************************************************************************************************');
  console.error(errorMessage);
  console.error('Refer to https://firebase.google.com/docs/genkit/plugins/google-genai for details on API key setup.');
  console.error('********************************************************************************************************************************************************************************');
  // This warning will appear in your server-side logs if the key is missing.
  // The FAILED_PRECONDITION error will still likely be thrown by the googleAI plugin when a flow is invoked.
}

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      apiKey: googleApiKey, // This will be undefined if the environment variable is not set, causing plugin initialization issues.
    }),
  ],
  model: 'googleai/gemini-2.0-flash', // Default model for the 'ai' instance.
});
