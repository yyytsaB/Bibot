import { createApp } from "./server.js";

const port = parseInt(process.env["PORT"] ?? "3001", 10);
const host = "127.0.0.1";

const app = createApp();

const server = app.listen(port, host, () => {
  console.log(`Backend server running on http://${host}:${port}`);
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});
