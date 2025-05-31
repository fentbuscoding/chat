
'use server';
/**
 * @fileOverview Utility to list cursor image filenames from Google Cloud Storage.
 *
 * - listCursors - A function that lists cursor image URLs.
 */
import {Storage} from '@google-cloud/storage';
// Genkit and Zod imports are removed

export type ListCursorsOutput = string[];

export async function listCursors(): Promise<ListCursorsOutput> {
  const storage = new Storage();
  const bucketName = 'chat_emoticons';
  const prefix = 'cursors/';

  try {
    console.log(`[listCursors] Attempting to list cursor files from GCS bucket: ${bucketName}, prefix: ${prefix}`);
    const [files] = await storage.bucket(bucketName).getFiles({prefix});
    console.log(`[listCursors] Successfully fetched ${files.length} files from GCS under cursors/.`);

    const imageBaseUrl = `https://storage.googleapis.com/${bucketName}/`;

    const cursorImageUrls = files
      .map(file => {
        if (file.name.endsWith('/')) {
          return null;
        }
        const lowerName = file.name.toLowerCase();
        if (lowerName.startsWith(prefix) && (lowerName.endsWith('.png') || lowerName.endsWith('.gif') || lowerName.endsWith('.cur') || lowerName.endsWith('.ico'))) {
          return imageBaseUrl + file.name;
        }
        return null;
      })
      .filter((url): url is string => url !== null && url.length > 0);

    console.log(`[listCursors] Filtered down to ${cursorImageUrls.length} cursor image URLs.`);
    return cursorImageUrls;
  } catch (error: any) {
    const specificErrorMessage = error.message || String(error);
    console.error('[listCursors] Detailed GCS Error:', specificErrorMessage);
    console.error('[listCursors] Full GCS error object structure:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw new Error(`Failed to list cursor images from GCS: ${specificErrorMessage}`);
  }
}
