import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import config from "./config";
import { registerMiddleware } from "./middleware";
import { registerRoutes } from "./routes";
import redisClient from "./utils/redis";
import { CollaborationManager } from "./services/collaboration";

// Global collaboration manager instance
let collaborationManager: CollaborationManager;

/**
 * Create and configure the Fastify application
 */
async function createApp(): Promise<FastifyInstance> {
	// Create Fastify instance with enhanced logging
	const app = fastify({
		logger: config.server.logger,
		genReqId: () => randomUUID(),
	});

	// Register WebSocket support
	await app.register(websocket);

	// Set logger reference in Redis client
	redisClient.setLogger(app.log);

	// Initialize collaboration manager
	collaborationManager = new CollaborationManager();
	collaborationManager.setLogger(app.log);

	// Register middleware
	await registerMiddleware(app);

	// Register routes
	await registerRoutes(app);

	// Set up WebSocket route for collaboration
	app.register(async function (fastify) {
		fastify.get(
			`${config.websocket.path}/:sessionId`,
			{ websocket: true },
			(connection, req) => {
				const sessionId = (req.params as { sessionId: string }).sessionId;
				const participantId =
					(req.headers["x-participant-id"] as string) || req.ip || randomUUID();

				// Validate sessionId format (UUID v4)
				const uuidRegex =
					/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
				if (!uuidRegex.test(sessionId)) {
					connection.close(1008, "Invalid session ID format");
					return;
				}

				fastify.log.info(
					{ sessionId, participantId },
					"WebSocket connection established",
				);

				collaborationManager.handleConnection(
					connection,
					sessionId,
					participantId,
				);
			},
		);
	});

	// Graceful shutdown hook
	app.addHook("onClose", async (_instance) => {
		try {
			app.log.info("Shutting down server gracefully...");

			// Shutdown collaboration manager
			if (collaborationManager) {
				await collaborationManager.shutdown();
				app.log.info("Collaboration manager shut down");
			}

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
		app.log.info(
			`WebSocket endpoint: ws://${config.server.host}:${config.server.port}${config.websocket.path}/:sessionId`,
		);
	} catch (err) {
		console.error("Failed to start server:", err);
		process.exit(1);
	}
}

// Start the server
start();
