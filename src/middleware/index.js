const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const config = require('../config');

/**
 * Register all middleware plugins with the Fastify instance
 * @param {FastifyInstance} fastify - The Fastify instance
 */
async function registerMiddleware(fastify) {
    // Register rate limiting
    await fastify.register(rateLimit, config.rateLimit);

    // Register CORS with explicit credentials disabled
    await fastify.register(cors, config.cors);
}

module.exports = {
    registerMiddleware
};
