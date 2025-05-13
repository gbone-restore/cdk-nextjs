import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { FsToFsAction } from "../../nextjs-assets-deployment";
import { listFilePaths } from "./common";

export function fsToFs(props: FsToFsAction) {
  const { destinationPath, sourcePath } = props;

  console.log(`Copying files from ${sourcePath} to ${destinationPath}`);

  // Enhanced error handling and directory creation
  try {
    if (!existsSync(sourcePath)) {
      console.warn(`Source path does not exist: ${sourcePath}`);
      return;
    }

    // Count source files before copying
    const sourceFiles = listFilePaths(sourcePath);
    const sourceFileCount = sourceFiles.length;
    console.log(`Found ${sourceFileCount} files to copy from ${sourcePath}`);

    // Early return if no files to copy (avoid empty directory errors)
    if (sourceFileCount === 0) {
      console.log(`No files found in source path ${sourcePath}, skipping copy operation`);
      return;
    }

    // Ensure destination directory exists
    const destDir = dirname(destinationPath);
    if (!existsSync(destDir)) {
      console.log(`Creating destination directory: ${destDir}`);
      mkdirSync(destDir, { recursive: true });
    }

    cpSync(sourcePath, destinationPath, { recursive: true });

    // Count destination files after copying to verify
    const destinationFiles = listFilePaths(destinationPath);
    const destinationFileCount = destinationFiles.length;
    console.log(`Copied ${destinationFileCount} files to ${destinationPath}`);

    // Verify ALL files were copied - strict equality check
    if (sourceFileCount !== destinationFileCount) {
      const missingCount = sourceFileCount - destinationFileCount;
      const errorMsg = `ERROR: File count mismatch! Source: ${sourceFileCount}, Destination: ${destinationFileCount}, Missing: ${missingCount}`;
      console.error(errorMsg);
      console.error('Website deployment requires 100% of files to be copied successfully.');
      throw new Error(errorMsg);
    } else {
      console.log(
        `Successfully verified all ${sourceFileCount} files were copied from ${sourcePath} to ${destinationPath}`,
      );
    }
  } catch (error) {
    console.error(
      `Error copying files from ${sourcePath} to ${destinationPath}:`,
      error,
    );
    throw error;
  }
}
