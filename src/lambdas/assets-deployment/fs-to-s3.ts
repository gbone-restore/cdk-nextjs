import { createReadStream, readFileSync, ReadStream } from "node:fs";
import { join, relative } from "node:path";
// eslint-disable-next-line import/no-extraneous-dependencies
import { PutObjectCommandInput } from "@aws-sdk/client-s3";
// eslint-disable-next-line import/no-extraneous-dependencies
import { Upload } from "@aws-sdk/lib-storage";
// eslint-disable-next-line import/no-extraneous-dependencies
import * as mime from "mime-types";
import { chunkArray, listFilePaths } from "./common";
import { s3 } from "./s3";
import { createProgressTracker, debug } from "./utils";
import { NextjsType } from "../../common";
import type { FsToS3Action } from "../../nextjs-assets-deployment";

export async function fsToS3(props: FsToS3Action, nextjsType?: NextjsType) {
  const { destinationBucketName, destinationKeyPrefix, sourcePath } = props;
  console.log(
    `Starting fs-to-s3 upload from ${sourcePath} to ${destinationBucketName}${destinationKeyPrefix ? "/" + destinationKeyPrefix : ""}`,
  );

  const sourceFilePaths = listFilePaths(sourcePath);
  console.log(`Found ${sourceFilePaths.length} files to upload`);

  // Create progress tracker
  const progressTracker = createProgressTracker(sourceFilePaths.length);

  // Determine optimal chunk size based on file count
  // Use smaller chunks for large file counts to avoid memory issues
  const totalFiles = sourceFilePaths.length;
  const chunkSize = totalFiles > 1000 ? 50 : totalFiles > 500 ? 100 : 200;
  console.log(`Using chunk size of ${chunkSize} for ${totalFiles} files`);

  // Define priority function for critical assets
  // Prioritize essential files to minimize deployment failure impact
  // This ensures core application files are deployed first in case of interruption
  const isPriorityFile = (filePath: string): boolean => {
    const lowerPath = filePath.toLowerCase();
    // Prioritize critical path resources
    if (
      lowerPath.endsWith(".html") ||
      lowerPath.endsWith(".css") ||
      lowerPath.includes("main-") ||
      lowerPath.includes("chunks/pages/") ||
      lowerPath.includes("chunks/app/")
    ) {
      return true;
    }
    return false;
  };

  let totalUploaded = 0;
  let failedUploads = 0;

  // Process files in parallel batches with prioritization
  for await (const filePathChunk of chunkArray(
    sourceFilePaths,
    chunkSize,
    isPriorityFile,
  )) {
    // Create upload parameters
    const putObjectInputs: PutObjectCommandInput[] = filePathChunk.map(
      (path) => {
        const contentType = mime.lookup(path) || undefined;
        const key = createS3Key({
          keyPrefix: destinationKeyPrefix,
          path,
          basePath: sourcePath,
        });
        let body: string | ReadStream;
        if (
          path.includes(".next/static/chunks/main-app-") &&
          nextjsType === NextjsType.GLOBAL_FUNCTIONS
        ) {
          // see src/lambdas/assets-deployment/patch-fetch.js for why this is needed
          const mainAppFileContent = readFileSync(path);
          const patchFetchContent = readFileSync(
            join(__dirname, "patch-fetch.js"),
          )
            .toString()
            // remove "use strict" because it causes: Uncaught ReferenceError: _N_E is not defined
            // since strict mode doesn't allow webpack to define undeclared variables
            .replace('"use strict";', "");
          body = patchFetchContent + "\n" + mainAppFileContent;
        } else {
          body = createReadStream(path);
        }
        return {
          Body: body,
          Bucket: destinationBucketName,
          ContentType: contentType,
          Key: key,
        };
      },
    );

    debug(
      putObjectInputs.map((i) => ({
        bucket: i.Bucket,
        key: i.ContentType,
      })),
    );

    // Upload files in parallel with configurable concurrency
    const uploadPromises = putObjectInputs.map((input) => {
      const upload = new Upload({
        client: s3,
        params: input,
        // Add partSize optimization for large files (optional)
        queueSize: 4, // Controls concurrent uploads for multipart uploads
      });

      // Add error handling and retry logic
      return upload.done().catch((error) => {
        failedUploads++;
        console.error(`Error uploading ${input.Key}: ${error.message}`);
        // Return null instead of throwing to allow other uploads to continue
        return null;
      });
    });

    // Wait for all uploads in this chunk to complete and update progress
    const results = await Promise.all(uploadPromises);
    const successfulUploads = results.filter((r) => r !== null).length;
    totalUploaded += successfulUploads;
    progressTracker.updateProgress(filePathChunk.length);
  }

  progressTracker.logProgress();
  console.log(
    `fs-to-s3 upload complete. Uploaded ${totalUploaded} files with ${failedUploads} failures.`,
  );

  // Verify all files were uploaded successfully - strict equality check
  if (totalUploaded !== sourceFilePaths.length) {
    const missingCount = sourceFilePaths.length - totalUploaded;
    const errorMsg = `ERROR: File count mismatch! Source: ${sourceFilePaths.length}, Successfully uploaded: ${totalUploaded}, Missing: ${missingCount}`;
    console.error(errorMsg);
    console.error('Website deployment requires 100% of files to be uploaded successfully.');

    // Always throw an error for any missing files - website deployment requires completeness
    throw new Error(errorMsg);
  } else {
    console.log(`Successfully verified all ${sourceFilePaths.length} files were uploaded.`);
  }
}

interface CreateS3KeyProps {
  keyPrefix?: string;
  path: string;
  basePath: string;
}
/**
 * Create S3 Key given local path
 */
export function createS3Key({ keyPrefix, path, basePath }: CreateS3KeyProps) {
  const objectKeyParts: string[] = [];
  if (keyPrefix) objectKeyParts.push(keyPrefix);
  objectKeyParts.push(relative(basePath, path));
  return join(...objectKeyParts);
}
