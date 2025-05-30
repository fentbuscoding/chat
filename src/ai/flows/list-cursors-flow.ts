
'use server';
/**
 * @fileOverview A Genkit flow to list cursor image filenames from Google Cloud Storage.
 *
 * - listCursors - A function that lists cursor image URLs.
 * - ListCursorsOutput - The return type for the listCursors function.
 */
import {ai} from '@/ai/ai-instance';
import {Storage} from '@google-cloud/storage';
import {z} from 'genkit';

const ListCursorsOutputSchema = z.array(z.string()).describe('A list of public URLs for cursor images (.png, .gif, .cur, .ico).');
export type ListCursorsOutput = z.infer<typeof ListCursorsOutputSchema>;

const EmptyInputSchema = z.object({});

const listCursorsFlowInternal = ai.defineFlow(
  {
    name: 'listCursorsFlow',
    inputSchema: EmptyInputSchema,
    outputSchema: ListCursorsOutputSchema,
  },
  async () => {
    const storage = new Storage();
    const bucketName = 'chat_emoticons'; // Your bucket name
    const prefix = 'cursors/';       // The folder path within the bucket

    try {
      console.log(`Attempting to list cursor files from GCS bucket: ${bucketName}, prefix: ${prefix}`);
      const [files] = await storage.bucket(bucketName).getFiles({prefix});
      console.log(`Successfully fetched ${files.length} files from GCS under cursors/.`);

      const imageBaseUrl = `https://storage.googleapis.com/${bucketName}/`;

      const cursorImageUrls = files
        .map(file => {
          // Ensure we only process files, not "folders" if any appear with trailing slashes
          if (file.name.endsWith('/')) {
            return null;
          }
          const lowerName = file.name.toLowerCase();
          if (lowerName.startsWith(prefix) && (lowerName.endsWith('.png') || lowerName.endsWith('.gif') || lowerName.endsWith('.cur') || lowerName.endsWith('.ico'))) {
            return imageBaseUrl + file.name;
          }
          return null;
        })
        .filter((url): url is string => url !== null && url.length > 0); // Filter out nulls and ensure it's a string

      console.log(`Filtered down to ${cursorImageUrls.length} cursor image URLs.`);
      return cursorImageUrls;
    } catch (error: any) {
      const specificErrorMessage = error.message || String(error);
      console.error('Detailed GCS Error in listCursorsFlow:', specificErrorMessage);
      console.error('Full GCS error object structure:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      throw new Error(`Failed to list cursor images from GCS: ${specificErrorMessage}`);
    }
  }
);

export async function listCursors(): Promise<ListCursorsOutput> {
  return listCursorsFlowInternal({});
}
