// Require Fastify and instantiate it
const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');

// Declare a simple route
fastify.get('/', async (request, reply) => {
    return { hello: 'world' };
});

// POST /api/share endpoint
fastify.post('/api/share', async (request, reply) => {
    const { title, content } = request.body;

    // TODO: Save the note to the redis database with TTL

    // Generate a UUID for the share path
    const shareId = crypto.randomUUID();

    // Return the sharePath in the expected format
    return {
        sharePath: `/share/${shareId}`
    };
});

// Start the server
const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;

        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening at http://0.0.0.0:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
