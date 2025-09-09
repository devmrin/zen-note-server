const crypto = require('crypto');
const { shareSchema, shareIdSchema } = require('../schemas');
const { sanitizeInput } = require('../utils/sanitizer');
const redisClient = require('../utils/redis');

/**
 * Notes-related routes
 * @param {FastifyInstance} fastify - The Fastify instance
 */
async function notesRoutes(fastify) {
    // POST /api/share - Create a new shared note
    fastify.post('/api/share', {
        schema: {
            body: shareSchema
        }
    }, async (request, reply) => {
        try {
            const { title, content } = request.body;

            // Sanitize only the title. Accept raw HTML for content.
            const sanitizedTitle = sanitizeInput(title);

            const shareId = crypto.randomUUID();
            const redisKey = `note:${shareId}`;
            const note = {
                title: sanitizedTitle,
                content: content,
                createdAt: new Date().toISOString()
            };

            // Store as plain string with 60s TTL
            await redisClient.set(redisKey, JSON.stringify(note), 60);

            fastify.log.info({ shareId, titleLength: title.length, contentLength: content.length }, 'Note shared successfully');

            return {
                sharePath: `/share/${shareId}`
            };
        } catch (err) {
            fastify.log.error({ err, reqId: request.id }, 'Error in POST /api/share');
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });

    // GET /api/shared/:shareId - Retrieve a shared note
    fastify.get('/api/shared/:shareId', {
        schema: {
            params: shareIdSchema
        }
    }, async (request, reply) => {
        try {
            const { shareId } = request.params;
            const redisKey = `note:${shareId}`;

            const data = await redisClient.get(redisKey);

            if (!data) {
                fastify.log.info({ shareId, reqId: request.id }, 'Note not found or expired');
                return reply.status(404).send({ error: 'Note not found or expired' });
            }

            const note = JSON.parse(data);
            fastify.log.info({ shareId, reqId: request.id }, 'Note retrieved successfully');
            return note;
        } catch (err) {
            fastify.log.error({ err, shareId: request.params.shareId, reqId: request.id }, 'Error in GET /api/shared/:shareId');
            return reply.status(500).send({ error: 'Internal Server Error' });
        }
    });
}

module.exports = notesRoutes;
