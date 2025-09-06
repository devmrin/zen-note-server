const Redis = require('ioredis');
const config = require('../config');

class RedisClient {
    constructor() {
        this.client = new Redis(config.redis.url);
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('error', (err) => {
            // Note: Logger will be passed from the main application
            console.error('Redis connection error:', err);
        });

        this.client.on('connect', () => {
            console.info('Redis connected successfully');
        });
    }

    async set(key, value, expiration) {
        if (expiration) {
            return await this.client.set(key, value, 'EX', expiration);
        }
        return await this.client.set(key, value);
    }

    async get(key) {
        return await this.client.get(key);
    }

    async quit() {
        return await this.client.quit();
    }

    // Method to update logger reference from main app
    setLogger(logger) {
        this.logger = logger;
        // Update error handler to use proper logger
        this.client.removeAllListeners('error');
        this.client.on('error', (err) => {
            this.logger.error({ err }, 'Redis connection error');
        });
    }
}

// Export singleton instance
module.exports = new RedisClient();
