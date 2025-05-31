
'use server';
/**
 * @fileOverview A Genkit flow to list emoji filenames from Google Cloud Storage.
 *
 * - listEmojis - A function that lists emoji filenames.
 * - ListEmojisOutput - The return type for the listEmojis function.
 */
// REMOVED: process.env.GOOGLE_APPLICATION_CREDENTIALS = './chitchatconnect-aqa0w-c9e0b73cf349.json'; 
// This line was a security risk. Credentials should be provided via environment variables (GOOGLE_APPLICATION_CREDENTIALS)
// or Application Default Credentials if running on Google Cloud.

import {ai} from '@/ai/ai-instance';
import {Storage} from '@google-cloud/storage';
import {z} from 'genkit';

const ListEmojisOutputSchema = z.array(z.string()).describe('A list of emoji filenames ending with .png or .gif.');
export type ListEmojisOutput = z.infer<typeof ListEmojisOutputSchema>;

const EmptyInputSchema = z.object({});

const listEmojisFlowInternal = ai.defineFlow(
  {
    name: 'listEmojisFlow',
    inputSchema: EmptyInputSchema,
    outputSchema: ListEmojisOutputSchema,
  },
  async (input) => {
    const storage = new Storage(); // This will use Application Default Credentials if GOOGLE_APPLICATION_CREDENTIALS env var is set
    const bucketName = 'chat_emoticons';
    const prefix = 'emotes_98/';

    try {
      console.log(`[listEmojisFlow] Attempting to list files from GCS bucket: ${bucketName}, prefix: ${prefix}`);
      const [files] = await storage.bucket(bucketName).getFiles({prefix});
      console.log(`[listEmojisFlow] Successfully fetched ${files.length} files from GCS with prefix '${prefix}'.`);

      const filenames = files
        .map(file => {
          // Remove the prefix from the filename
          const name = file.name.startsWith(prefix) ? file.name.substring(prefix.length) : file.name;
          return name;
        })
        .filter(name => {
          if (!name || name.length === 0 || name.endsWith('/')) {
            // console.log(`[listEmojisFlow] Filtering out empty name or folder entry: '${name}'`);
            return false; // Filter out empty names or folder entries
          }
          const lowerName = name.toLowerCase();
          const isValidExtension = lowerName.endsWith('.png') || lowerName.endsWith('.gif');
          // if (!isValidExtension) {
          //   console.log(`[listEmojisFlow] Filtering out file with invalid extension: '${name}'`);
          // }
          return isValidExtension; // Keep only .png or .gif files
        });
      
      console.log(`[listEmojisFlow] Filtered down to ${filenames.length} .png or .gif files.`);
      if (filenames.length === 0 && files.length > 0) {
        console.warn(`[listEmojisFlow] No files matched the filter criteria (.png, .gif, not a folder), but ${files.length} raw files were fetched. Check file names and extensions.`);
      }
      return filenames;
    } catch (error: any) {
      const specificErrorMessage = error.message || String(error);
      console.error('[listEmojisFlow] Detailed GCS Error:', specificErrorMessage);
      // For even more detail, especially for non-standard errors:
      console.error('[listEmojisFlow] Full GCS error object structure:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      throw new Error(`Failed to list emojis from GCS: ${specificErrorMessage}`);
    }
  }
);

export async function listEmojis(): Promise<ListEmojisOutput> {
  return listEmojisFlowInternal({});
}
