/**
 * Health check route
 * @param {FastifyInstance} fastify - The Fastify instance
 */
async function healthRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        return { hello: 'world' };
    });
}

module.exports = healthRoutes;
