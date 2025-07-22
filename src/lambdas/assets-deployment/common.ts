import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Given path of directory, returns array of all file paths within directory
 */
export function listFilePaths(dirPath: string): string[] {
  const filePaths: string[] = [];
  try {
    const directory = readdirSync(dirPath, { withFileTypes: true });
    for (const d of directory) {
      const filePath = resolve(dirPath, d.name);
      if (d.isDirectory()) {
        filePaths.push(...listFilePaths(filePath));
      } else {
        filePaths.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Error listing files in directory ${dirPath}:`, error);
  }
  return filePaths;
}

/**
 * Helper for batching requests with prioritization
 * @param array Array of items to process in chunks
 * @param chunkSize Maximum size of each chunk
 * @param priorityFn Optional function to prioritize items (returns true for high priority items)
 */
export async function* chunkArray(
  array: string[],
  chunkSize: number,
  priorityFn?: (item: string) => boolean,
) {
  if (!priorityFn) {
    // Standard chunking without prioritization
    for (let i = 0; i < array.length; i += chunkSize) {
      yield array.slice(i, i + chunkSize);
    }
    return;
  }

  // With prioritization: process high priority items first
  const highPriorityItems = array.filter(priorityFn);
  const normalPriorityItems = array.filter((item) => !priorityFn(item));

  console.log(
    `Prioritized ${highPriorityItems.length} high priority files out of ${array.length} total files`,
  );

  // Process high priority items first
  for (let i = 0; i < highPriorityItems.length; i += chunkSize) {
    yield highPriorityItems.slice(i, i + chunkSize);
  }

  // Then process normal priority items
  for (let i = 0; i < normalPriorityItems.length; i += chunkSize) {
    yield normalPriorityItems.slice(i, i + chunkSize);
  }
}
