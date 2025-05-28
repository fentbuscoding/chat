
'use server';
/**
 * @fileOverview A Genkit flow to list emoji filenames from Google Cloud Storage.
 *
 * - listEmojis - A function that lists emoji filenames.
 * - ListEmojisOutput - The return type for the listEmojis function.
 */

import {ai} from '@/ai/ai-instance'; // Assuming your global ai instance is here
import {Storage} from '@google-cloud/storage';
import {z} from 'genkit';

const ListEmojisOutputSchema = z.array(z.string()).describe('A list of emoji filenames ending with .png or .gif.');
export type ListEmojisOutput = z.infer<typeof ListEmojisOutputSchema>;

// Define an empty object schema for the input
const EmptyInputSchema = z.object({});

// This is the actual flow that will be registered with Genkit
const listEmojisFlowInternal = ai.defineFlow(
  {
    name: 'listEmojisFlow',
    inputSchema: EmptyInputSchema, // Use the empty object schema
    outputSchema: ListEmojisOutputSchema,
  },
  async (input) => { // Input will be an empty object, not used by the logic
    const storage = new Storage();
    const bucketName = 'chat_emoticons'; // Your bucket name
    const prefix = 'emotes_98/';       // The folder path within the bucket

    try {
      const [files] = await storage.bucket(bucketName).getFiles({prefix});
      const filenames = files
        .map(file => {
          // Remove the prefix from the filename
          const name = file.name.startsWith(prefix) ? file.name.substring(prefix.length) : file.name;
          return name;
        })
        .filter(name => {
          if (!name || name.length === 0 || name.endsWith('/')) {
            return false; // Filter out empty names or folder entries
          }
          const lowerName = name.toLowerCase();
          return lowerName.endsWith('.png') || lowerName.endsWith('.gif'); // Keep only .png or .gif files
        });

      return filenames;
    } catch (error) {
      console.error('Error listing emojis from GCS:', error);
      // In a real app, you might want to throw a more specific error or return an empty array
      throw new Error('Failed to list emojis from GCS.');
    }
  }
);

// Exported async wrapper function to call the flow
export async function listEmojis(): Promise<ListEmojisOutput> {
  return listEmojisFlowInternal({}); // Pass an empty object
}
