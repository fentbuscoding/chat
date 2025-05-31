
'use server';
/**
 * @fileOverview Utility to list emoji filenames from Google Cloud Storage.
 *
 * - listEmojis - A function that lists emoji filenames.
 */

import {Storage} from '@google-cloud/storage';
// Genkit and Zod imports are removed as this is no longer a Genkit flow

// Output type is a simple promise of string array
export type ListEmojisOutput = string[];

// This is now a direct async function, not a Genkit flow
export async function listEmojis(): Promise<ListEmojisOutput> {
  const storage = new Storage(); // This will use Application Default Credentials if GOOGLE_APPLICATION_CREDENTIALS env var is set
  const bucketName = 'chat_emoticons';
  const prefix = 'emotes_98/';

  try {
    console.log(`[listEmojis] Attempting to list files from GCS bucket: ${bucketName}, prefix: ${prefix}`);
    const [files] = await storage.bucket(bucketName).getFiles({prefix});
    console.log(`[listEmojis] Successfully fetched ${files.length} files from GCS with prefix '${prefix}'.`);

    const filenames = files
      .map(file => {
        const name = file.name.startsWith(prefix) ? file.name.substring(prefix.length) : file.name;
        return name;
      })
      .filter(name => {
        if (!name || name.length === 0 || name.endsWith('/')) {
          return false;
        }
        const lowerName = name.toLowerCase();
        return lowerName.endsWith('.png') || lowerName.endsWith('.gif');
      });
    
    console.log(`[listEmojis] Filtered down to ${filenames.length} .png or .gif files.`);
    if (filenames.length === 0 && files.length > 0) {
      console.warn(`[listEmojis] No files matched the filter criteria (.png, .gif, not a folder), but ${files.length} raw files were fetched. Check file names and extensions.`);
    }
    return filenames;
  } catch (error: any) {
    const specificErrorMessage = error.message || String(error);
    console.error('[listEmojis] Detailed GCS Error:', specificErrorMessage);
    console.error('[listEmojis] Full GCS error object structure:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    // Throwing the error so the calling client-side code can catch it
    throw new Error(`Failed to list emojis from GCS: ${specificErrorMessage}`);
  }
}
