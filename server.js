// Require dependencies
require('dotenv').config();  // Load env variables
const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');
const cors = require('@fastify/cors');
const Redis = require('ioredis');

// Initialize a single Redis client instance
const redis = new Redis(process.env.REDIS_URL);

// Global Redis error handler
redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});

// Register CORS plugin
fastify.register(cors, {
    origin: 'https://zen.mrinmay.dev',
    methods: ['GET', 'POST', 'OPTIONS'],
});

// Health check route
fastify.get('/', async (request, reply) => {
    return { hello: 'world' };
});

// POST /api/share endpoint
fastify.post('/api/share', async (request, reply) => {
    try {
        const { title, content } = request.body;

        if (!title || !content) {
            return reply.status(400).send({ error: 'Missing title or content' });
        }

        const shareId = crypto.randomUUID();
        const redisKey = `note:${shareId}`;
        const note = { title, content };

        // Store note using RedisJSON and set TTL of 60s
        await redis.call('JSON.SET', redisKey, '.', JSON.stringify(note));
        await redis.expire(redisKey, 60);

        return {
            sharePath: `/share/${shareId}`
        };
    } catch (err) {
        console.error('Error in POST /api/share:', err);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
});

// GET /api/shared/:shareId endpoint
fastify.get('/api/shared/:shareId', async (request, reply) => {
    try {
        const { shareId } = request.params;
        const redisKey = `note:${shareId}`;

        const data = await redis.call('JSON.GET', redisKey, '.');

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
