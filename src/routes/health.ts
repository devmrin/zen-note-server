import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Health check route
 */
async function healthRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get("/", async (_request: FastifyRequest, _reply: FastifyReply) => {
		return { hello: "world" };
	});
}

export default healthRoutes;
