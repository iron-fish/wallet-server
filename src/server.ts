import { configDotEnv } from "./utils/configDotenv";
configDotEnv();

import express from "express";
import bodyParser from "body-parser";
import { RegisterRoutes } from "./routes/routes";
import swaggerUi from "swagger-ui-express";
import * as openApiDocument from "./swagger/swagger.json";
import { logger } from "./utils/logger";
import { lightBlockCache } from "./cache";
import { lightBlockUpload } from "./upload";

if (process.env["BUILD_CACHE"] === "true") {
  logger.info("Building block cache...");
  void lightBlockCache.cacheBlocks();
}

if (process.env["UPLOAD_BLOCKS"] === "true") {
  logger.info("Starting uploader...");
  void lightBlockUpload.upload();
}

export const app = express();
app.use(bodyParser.json());

// Register tsoa routes
RegisterRoutes(app);

// Serve Swagger UI at /docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

const PORT = process.env["PORT"] || 3000;
export const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
