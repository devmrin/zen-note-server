const healthRoutes = require("./health");
const notesRoutes = require("./notes");

/**
 * Register all application routes
 * @param {FastifyInstance} fastify - The Fastify instance
 */
async function registerRoutes(fastify) {
	// Register health routes
	await fastify.register(healthRoutes);

	// Register notes routes
	await fastify.register(notesRoutes);
}

module.exports = {
	registerRoutes,
};
