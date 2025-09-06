const fastify = require('fastify');
const config = require('./src/config');
const { registerMiddleware } = require('./src/middleware');
const { registerRoutes } = require('./src/routes');
const redisClient = require('./src/utils/redis');

/**
 * Create and configure the Fastify application
 */
async function createApp() {
    // Create Fastify instance with enhanced logging
    const app = fastify({
        logger: config.server.logger,
        genReqId: () => require('crypto').randomUUID()
    });

    // Set logger reference in Redis client
    redisClient.setLogger(app.log);

    // Register middleware
    await registerMiddleware(app);

    // Register routes
    await registerRoutes(app);

    // Graceful shutdown hook
    app.addHook('onClose', async (instance, done) => {
        try {
            app.log.info('Shutting down server gracefully...');
            await redisClient.quit();
            app.log.info('Redis connection closed');
            done();
        } catch (err) {
            app.log.error({ err }, 'Error during graceful shutdown');
            done(err);
        }
    });

    return app;
}

/**
 * Start the server
 */
async function start() {
    try {
        const app = await createApp();
        
        // Handle process signals for graceful shutdown
        process.on('SIGINT', () => {
            app.log.info('Received SIGINT, shutting down gracefully');
            app.close();
        });

        process.on('SIGTERM', () => {
            app.log.info('Received SIGTERM, shutting down gracefully');
            app.close();
        });

        // Start listening
        await app.listen({ 
            port: config.server.port, 
            host: config.server.host 
        });
        
        app.log.info(`Server listening at http://${config.server.host}:${config.server.port}`);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

// Start the server
start();
