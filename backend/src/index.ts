import { createApp } from "./server.js";
import { FeedbackPipeline } from "./pipeline.js";
import { HttpOllamaTransport } from "./transport.js";
import { ReadinessService, resolveOllamaConfig } from "./readiness.js";

const port = parseInt(process.env["PORT"] ?? "3001", 10);
const host = "127.0.0.1";

// Resolve one single Ollama configuration object for both services
const ollamaConfig = resolveOllamaConfig();

const transport = new HttpOllamaTransport({ config: ollamaConfig });
const pipeline = new FeedbackPipeline(transport);
const readiness = new ReadinessService({ config: ollamaConfig });

const app = createApp(pipeline, readiness);

const server = app.listen(port, host, () => {
  console.log(`Backend server running on http://${host}:${port}`);
  void readiness.start();
});

process.on("SIGINT", () => {
  readiness.stop();
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  readiness.stop();
  server.close(() => {
    process.exit(0);
  });
});
