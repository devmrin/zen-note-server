import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import config from "../config";

/**
 * Register all middleware plugins with the Fastify instance
 */
export async function registerMiddleware(
	fastify: FastifyInstance,
): Promise<void> {
	// Register rate limiting
	await fastify.register(rateLimit, config.rateLimit);

	// Register CORS with explicit credentials disabled
	await fastify.register(cors, config.cors);
}
