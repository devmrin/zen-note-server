import type { FastifyInstance } from "fastify";
import healthRoutes from "./health";
import notesRoutes from "./notes";
import collaborationRoutes from "./collaboration";

/**
 * Register all application routes
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
	// Register health routes
	await fastify.register(healthRoutes);

	// Register notes routes
	await fastify.register(notesRoutes);

	// Register collaboration routes
	await fastify.register(collaborationRoutes);
}
