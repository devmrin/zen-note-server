/**
 * Health check route
 * @param {FastifyInstance} fastify - The Fastify instance
 */
async function healthRoutes(fastify) {
	fastify.get("/", async (_request, _reply) => {
		return { hello: "world" };
	});
}

module.exports = healthRoutes;
