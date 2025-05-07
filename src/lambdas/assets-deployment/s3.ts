// eslint-disable-next-line import/no-extraneous-dependencies
import { S3Client } from "@aws-sdk/client-s3";

// Configure S3 client with performance optimizations
export const s3 = new S3Client({
  // Set maximum retry attempts for failed requests
  maxAttempts: 3,
  // The AWS SDK v3 uses HTTP keep-alive by default
  // which significantly improves upload performance
});
