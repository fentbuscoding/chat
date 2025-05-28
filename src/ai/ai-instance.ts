
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      apiKey: "AIzaSyAjgLdL1nsc87kUo9az20nkwoBznrv2i3w", // Using the provided API key
    }),
  ],
  model: 'googleai/gemini-2.0-flash',
});

