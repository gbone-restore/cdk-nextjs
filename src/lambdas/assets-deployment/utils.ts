import type { CloudFormationCustomResourceHandler } from "aws-lambda";

export enum CfnResponseStatus {
  Success = "SUCCESS",
  Failed = "FAILED",
}

interface CfnResponseProps {
  event: Parameters<CloudFormationCustomResourceHandler>[0];
  context: Parameters<CloudFormationCustomResourceHandler>[1];
  responseStatus: CfnResponseStatus;
  responseData?: Record<string, string>;
  physicalResourceId?: string;
  reason?: string;
}

/**
 * Enhanced CloudFormation response function with retry mechanism
 * Inspired by: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponsemodule.html
 */
export async function cfnResponse(props: CfnResponseProps) {
  const body = JSON.stringify({
    Status: props.responseStatus,
    Reason:
      props.reason ||
      `See the details in CloudWatch Log Stream: ${props.context.logStreamName}`,
    PhysicalResourceId: props.physicalResourceId || props.context.logStreamName,
    StackId: props.event.StackId,
    RequestId: props.event.RequestId,
    LogicalResourceId: props.event.LogicalResourceId,
    Data: props.responseData,
  });

  const maxRetries = 3;
  let retryCount = 0;
  let success = false;

  while (!success && retryCount < maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(props.event.ResponseURL, {
        method: "PUT",
        body,
        headers: {
          "content-type": "",
          "content-length": body.length.toString(),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(
          `Successfully sent response to CloudFormation (attempt ${retryCount + 1})`,
        );
        success = true;
      } else {
        console.error(
          `Failed to send response to CloudFormation: ${response.status} ${response.statusText}`,
        );
        retryCount++;
        if (retryCount < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } catch (error) {
      console.error(`Error sending response to CloudFormation:`, error);
      retryCount++;
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!success) {
    console.error(
      `Failed to send response to CloudFormation after ${maxRetries} attempts.`,
    );
  }

  return success;
}

export function debug(value: unknown) {
  if (process.env.DEBUG) console.log(JSON.stringify(value, null, 2));
}

/**
 * Progress tracking for long running operations
 */
export interface ProgressTracker {
  totalFiles: number;
  filesProcessed: number;
  startTime: number;
  lastUpdateTime: number;

  updateProgress(count: number): void;
  logProgress(): void;
}

export function createProgressTracker(totalFiles: number): ProgressTracker {
  return {
    totalFiles,
    filesProcessed: 0,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),

    updateProgress(count: number) {
      this.filesProcessed += count;
      const now = Date.now();
      // Log progress at most every 5 seconds
      if (now - this.lastUpdateTime > 5000) {
        this.logProgress();
        this.lastUpdateTime = now;
      }
    },

    logProgress() {
      const percentComplete = Math.round(
        (this.filesProcessed / this.totalFiles) * 100,
      );
      const elapsedSeconds = Math.round((Date.now() - this.startTime) / 1000);
      console.log(
        `Progress: ${this.filesProcessed}/${this.totalFiles} files (${percentComplete}%) in ${elapsedSeconds} seconds`,
      );
    },
  };
}
