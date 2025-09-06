// Require Fastify and instantiate it
const fastify = require('fastify')({ logger: true });

// Declare a simple route
fastify.get('/', async (request, reply) => {
    return { hello: 'world' };
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
