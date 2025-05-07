import { existsSync, mkdirSync, readFileSync } from "node:fs";
import type { CloudFormationCustomResourceHandler } from "aws-lambda";
import { fsToFs } from "./fs-to-fs";
import { fsToS3 } from "./fs-to-s3";
import { pruneS3 } from "./prune-s3";
import { cfnResponse, CfnResponseStatus, debug } from "./utils";
import type { CustomResourceProperties } from "../../nextjs-assets-deployment";

type ResourceProps = CustomResourceProperties & {
  ServiceToken: string;
};

export const handler: CloudFormationCustomResourceHandler = async (
  event,
  context,
) => {
  debug({ event });
  let responseStatus = CfnResponseStatus.Failed;
  let responseReason = "";
  let previewModeId = "";
  let partialSuccess = false;

  // Calculate timeout buffer - ensure we have at least 20 seconds to send response
  const timeoutBuffer = 20000; // 20 seconds
  const remainingTime = context.getRemainingTimeInMillis();
  console.log(`Lambda has ${remainingTime}ms remaining execution time.`);

  const executionTimeLimit = remainingTime - timeoutBuffer;
  const timeoutTime = Date.now() + executionTimeLimit;

  // Set up timeout check interval
  let timeoutCheckIntervalId: NodeJS.Timeout | null = null;
  let timeoutResponseSent = false;

  // Function to check for approaching timeout
  const setupTimeoutCheck = () => {
    return setInterval(() => {
      const remaining = timeoutTime - Date.now();
      if (remaining <= 0 && !timeoutResponseSent) {
        console.warn(
          `Approaching Lambda timeout, sending partial success to CloudFormation`,
        );
        timeoutResponseSent = true;

        // Clear interval to prevent multiple responses
        if (timeoutCheckIntervalId) {
          clearInterval(timeoutCheckIntervalId);
          timeoutCheckIntervalId = null;
        }

        // Send partial success response
        cfnResponse({
          event,
          context,
          responseStatus: CfnResponseStatus.Success,
          responseData: {
            previewModeId,
            partialExecution: "true",
            message:
              "Operation timed out but some assets were deployed successfully",
          },
          reason:
            "Lambda execution approaching timeout, reporting partial success",
        }).catch((err) => {
          console.error("Failed to send timeout response:", err);
        });
      }
    }, 5000); // Check every 5 seconds
  };

  // Start timeout checking
  timeoutCheckIntervalId = setupTimeoutCheck();

  try {
    const props = event.ResourceProperties as ResourceProps;
    if (event.RequestType === "Create" || event.RequestType === "Update") {
      const { actions, nextjsType } = props;

      // Track progress through actions
      const totalActions = actions.length;
      let completedActions = 0;

      for (const action of actions) {
        // Check if we're approaching timeout before starting a new action
        if (Date.now() >= timeoutTime) {
          console.warn(
            `Approaching timeout after ${completedActions}/${totalActions} actions, marking as partial success`,
          );
          responseStatus = CfnResponseStatus.Success;
          responseReason = `Execution approaching timeout after completing ${completedActions}/${totalActions} actions.`;
          partialSuccess = true;
          break;
        }

        console.log(
          `Starting action ${completedActions + 1}/${totalActions} of type ${action.type}`,
        );

        if (action.type === "fs-to-fs") {
          fsToFs(action);
        } else if (action.type === "fs-to-s3") {
          await fsToS3(action, nextjsType);
        } else if (action.type === "prune-s3") {
          await pruneS3(action);
        }

        completedActions++;
        console.log(`Completed action ${completedActions}/${totalActions}`);
      }

      // Only initialize these if we had time to complete all actions or we're in partial success mode
      if (completedActions === totalActions || partialSuccess) {
        try {
          if (props.imageCachePath) {
            initImageCache(props.imageCachePath);
          }

          if (props.prerenderManifestPath) {
            previewModeId = getPreviewModeId(props.prerenderManifestPath);
          }
        } catch (err) {
          console.error("Error in final initialization:", err);
          // Don't fail the entire deployment if just these final steps fail
        }

        responseStatus = CfnResponseStatus.Success;
        if (partialSuccess) {
          responseReason = `Partially completed: ${completedActions}/${totalActions} actions.`;
        } else {
          responseReason = "All actions completed successfully.";
        }
      }
    } else {
      // Delete request - simple and quick
      responseStatus = CfnResponseStatus.Success;
      responseReason = "Delete request processed successfully.";
    }
  } catch (err) {
    console.error(err);
    responseReason =
      err instanceof Error ? err.message : "Unknown error occurred";
  } finally {
    // Clear the timeout check interval
    if (timeoutCheckIntervalId) {
      clearInterval(timeoutCheckIntervalId);
      timeoutCheckIntervalId = null;
    }

    // Only send final response if timeout response wasn't already sent
    if (!timeoutResponseSent) {
      // Prepare response data
      const responseData: Record<string, string> = {
        previewModeId,
      };

      if (partialSuccess) {
        responseData.partialExecution = "true";
      }

      // Send final response to CloudFormation
      await cfnResponse({
        event,
        context,
        responseStatus,
        responseData,
        reason: responseReason,
      });
    }
  }
};

/**
 * On first deployment there is no directory for images to be optimized into by
 * Next.js so this creates directory for those images. Only runs once.
 * This is unlike other cache directories which are created at build time.
 */
function initImageCache(imageCachePath: string) {
  if (imageCachePath && !existsSync(imageCachePath)) {
    try {
      console.log(`Creating image cache directory at ${imageCachePath}`);
      mkdirSync(imageCachePath, { recursive: true });
    } catch (err) {
      console.error(`Failed to create image cache directory: ${err}`);
    }
  }
}

/**
 * Only need preview mode id for `NextjsGlobalFunctions`, but easy to get
 * so we do it each time.
 */
function getPreviewModeId(prerenderManifestPath: string): string {
  try {
    console.log(`Reading prerender manifest from ${prerenderManifestPath}`);
    const prerenderManifest = JSON.parse(
      readFileSync(prerenderManifestPath, { encoding: "utf-8" }),
    );
    return prerenderManifest.preview.previewModeId;
  } catch (err) {
    console.error(`Failed to read prerender manifest: ${err}`);
    return "";
  }
}
