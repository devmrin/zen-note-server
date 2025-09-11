import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import config from "./config";
import { registerMiddleware } from "./middleware";
import { registerRoutes } from "./routes";
import redisClient from "./utils/redis";

/**
 * Create and configure the Fastify application
 */
async function createApp(): Promise<FastifyInstance> {
	// Create Fastify instance with enhanced logging
	const app = fastify({
		logger: config.server.logger,
		genReqId: () => randomUUID(),
	});

	// Set logger reference in Redis client
	redisClient.setLogger(app.log);

	// Register middleware
	await registerMiddleware(app);

	// Register routes
	await registerRoutes(app);

	// Graceful shutdown hook
	app.addHook("onClose", async (_instance) => {
		try {
			app.log.info("Shutting down server gracefully...");
			await redisClient.quit();
			app.log.info("Redis connection closed");
		} catch (err) {
			app.log.error({ err }, "Error during graceful shutdown");
			throw err;
		}
	});

	return app;
}

/**
 * Start the server
 */
async function start(): Promise<void> {
	try {
		const app = await createApp();

		// Handle process signals for graceful shutdown
		process.on("SIGINT", () => {
			app.log.info("Received SIGINT, shutting down gracefully");
			app.close();
		});

		process.on("SIGTERM", () => {
			app.log.info("Received SIGTERM, shutting down gracefully");
			app.close();
		});

		// Start listening
		await app.listen({
			port: config.server.port,
			host: config.server.host,
		});

		app.log.info(
			`Server listening at http://${config.server.host}:${config.server.port}`,
		);
	} catch (err) {
		console.error("Failed to start server:", err);
		process.exit(1);
	}
}

// Start the server
start();
