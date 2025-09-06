require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');
const cors = require('@fastify/cors');
const Redis = require('ioredis');

// Single shared Redis client instance
const redis = new Redis(process.env.REDIS_URL);

redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

fastify.register(cors, {
    origin: 'https://zen.mrinmay.dev',
    methods: ['GET', 'POST', 'OPTIONS'],
});

fastify.get('/', async (request, reply) => {
    return { hello: 'world' };
});

fastify.post('/api/share', async (request, reply) => {
    try {
        const { title, content } = request.body;

        if (!title || !content) {
            return reply.status(400).send({ error: 'Missing title or content' });
        }

        const shareId = crypto.randomUUID();
        const redisKey = `note:${shareId}`;
        const note = { title, content };

        // Store as plain string with 60s TTL
        await redis.set(redisKey, JSON.stringify(note), 'EX', 60);

        return {
            sharePath: `/share/${shareId}`
        };
    } catch (err) {
        console.error('Error in POST /api/share:', err);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
});

fastify.get('/api/shared/:shareId', async (request, reply) => {
    try {
        const { shareId } = request.params;
        const redisKey = `note:${shareId}`;

        const data = await redis.get(redisKey);

        if (!data) {
            return reply.status(404).send({ error: 'Note not found or expired' });
        }

        const note = JSON.parse(data);
        return note;
    } catch (err) {
        console.error('Error in GET /api/shared/:shareId:', err);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
});

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
