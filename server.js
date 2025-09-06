// Require Fastify and instantiate it
const fastify = require('fastify')({ logger: true });
const crypto = require('crypto');
const cors = require('@fastify/cors');

// Register CORS plugin
fastify.register(cors, {
    origin: 'https://zen.mrinmay.dev',   // Allow only your frontend origin
    methods: ['GET', 'POST', 'OPTIONS'],
});

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

// GET /api/shared/:shareId endpoint
fastify.get('/api/shared/:shareId', async (request, reply) => {
    const { shareId } = request.params;
    
    // TODO: Look up the shared note from Redis using shareId
    
    // For now, return static JSON regardless of shareId
    return {
        "title": "Meeting Notes - Q4 Planning",
        "content": "<h2>Q4 Planning Meeting</h2>\n<p><strong>Date:</strong> September 6, 2025</p>\n<p><strong>Attendees:</strong> Team leads, Product managers</p>\n<h3>Key Discussion Points:</h3>\n<ul>\n  <li>Product roadmap for Q4</li>\n  <li>Resource allocation</li>\n  <li>Timeline adjustments</li>\n</ul>\n<h3>Action Items:</h3>\n<ol>\n  <li>Review budget proposals by Friday</li>\n  <li>Schedule follow-up meetings with stakeholders</li>\n  <li>Update project timelines</li>\n</ol>"
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
