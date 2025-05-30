
'use server';
/**
 * @fileOverview A Genkit flow to list emoji filenames from Google Cloud Storage.
 *
 * - listEmojis - A function that lists emoji filenames.
 * - ListEmojisOutput - The return type for the listEmojis function.
 */
// process.env.GOOGLE_APPLICATION_CREDENTIALS = './chitchatconnect-aqa0w-c9e0b73cf349.json'; // REMOVED: Rely on external env var or ADC
import {ai} from '@/ai/ai-instance'; 
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
    const storage = new Storage(); // This will use Application Default Credentials if GOOGLE_APPLICATION_CREDENTIALS is set
    const bucketName = 'chat_emoticons'; // Your bucket name
    const prefix = 'emotes_98/';       // The folder path within the bucket

    try {
      console.log(`Attempting to list files from GCS bucket: ${bucketName}, prefix: ${prefix}`);
      const [files] = await storage.bucket(bucketName).getFiles({prefix});
      console.log(`Successfully fetched ${files.length} files from GCS.`);

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
      
      console.log(`Filtered down to ${filenames.length} .png or .gif files.`);
      return filenames;
    } catch (error: any) {
      const specificErrorMessage = error.message || String(error);
      console.error('Detailed GCS Error in listEmojisFlow:', specificErrorMessage);
      // For even more detail, especially for non-standard errors:
      console.error('Full GCS error object structure:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      throw new Error(`Failed to list emojis from GCS: ${specificErrorMessage}`);
    }
  }
);

// Exported async wrapper function to call the flow
export async function listEmojis(): Promise<ListEmojisOutput> {
  return listEmojisFlowInternal({}); // Pass an empty object
}
