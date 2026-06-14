import { getDeployConfig } from "../../config/deploy.js";
import { runDeployPipeline } from "../../services/deploy/pipeline.js";
import { inngest } from "../client.js";
import { DEPLOY_REQUESTED_EVENT } from "../events.js";

const { maxConcurrent } = getDeployConfig();

export const deployPipelineFunction = inngest.createFunction(
  {
    id: "deploy-app-pipeline",
    name: "Radiant deploy pipeline",
    triggers: [{ event: DEPLOY_REQUESTED_EVENT }],
    concurrency: [{ limit: maxConcurrent }],
    retries: 2,
  },
  async ({ event, step }) => {
    await step.run("run-deploy-pipeline", async () => {
      await runDeployPipeline(event.data.jobId);
    });
  },
);
