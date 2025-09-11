const Redis = require("ioredis");
const config = require("../config");

class RedisClient {
	constructor() {
		this.client = new Redis(config.redis.url);
		this.setupEventHandlers();
	}

	setupEventHandlers() {
		this.client.on("error", (err) => {
			// Use console as fallback until logger is set via setLogger()
			if (this.logger) {
				this.logger.error({ err }, "Redis connection error");
			} else {
				console.error("Redis connection error:", err);
			}
		});

		this.client.on("connect", () => {
			// Use console as fallback until logger is set via setLogger()
			if (this.logger) {
				this.logger.info("Redis connected successfully");
			} else {
				console.info("Redis connected successfully");
			}
		});
	}

	/**
	 * Set a key-value pair in Redis with optional expiration
	 * @param {string} key - The key to set
	 * @param {string} value - The value to set
	 * @param {number} [expiration] - Optional expiration time in seconds
	 * @returns {Promise<string>} Redis response
	 */
	async set(key, value, expiration) {
		if (!key || value === undefined) {
			throw new Error("Key and value are required for Redis set operation");
		}
		if (expiration) {
			return await this.client.set(key, value, "EX", expiration);
		}
		return await this.client.set(key, value);
	}

	/**
	 * Get a value from Redis by key
	 * @param {string} key - The key to retrieve
	 * @returns {Promise<string|null>} The value or null if not found
	 */
	async get(key) {
		if (!key) {
			throw new Error("Key is required for Redis get operation");
		}
		return await this.client.get(key);
	}

	/**
	 * Close the Redis connection gracefully
	 * @returns {Promise<string>} Redis response
	 */
	async quit() {
		return await this.client.quit();
	}

	/**
	 * Update logger reference from main app
	 * @param {Object} logger - Fastify logger instance
	 */
	setLogger(logger) {
		this.logger = logger;
		// Update error handler to use proper logger
		this.client.removeAllListeners("error");
		this.client.on("error", (err) => {
			this.logger.error({ err }, "Redis connection error");
		});
	}
}

// Export singleton instance
module.exports = new RedisClient();
