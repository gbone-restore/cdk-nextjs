import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FsToFsAction } from "../../nextjs-assets-deployment";

export function fsToFs(props: FsToFsAction) {
  const { destinationPath, sourcePath } = props;

  console.log(`Copying files from ${sourcePath} to ${destinationPath}`);

  // Enhanced error handling and directory creation
  try {
    if (!existsSync(sourcePath)) {
      console.warn(`Source path does not exist: ${sourcePath}`);
      return;
    }

    // Ensure destination directory exists
    const destDir = dirname(destinationPath);
    if (!existsSync(destDir)) {
      console.log(`Creating destination directory: ${destDir}`);
      mkdirSync(destDir, { recursive: true });
    }

    cpSync(sourcePath, destinationPath, { recursive: true });
    console.log(
      `Successfully copied files from ${sourcePath} to ${destinationPath}`,
    );
  } catch (error) {
    console.error(
      `Error copying files from ${sourcePath} to ${destinationPath}:`,
      error,
    );
    throw error;
  }
}
