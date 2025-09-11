import type { FastifyBaseLogger } from "fastify";
import Redis from "ioredis";
import config from "../config";

class RedisClient {
	private client: Redis;
	private logger?: FastifyBaseLogger;

	constructor() {
		this.client = new Redis(config.redis.url || "");
		this.setupEventHandlers();
	}

	private setupEventHandlers(): void {
		this.client.on("error", (err: Error) => {
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
	 */
	async set(key: string, value: string, expiration?: number): Promise<string> {
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
	 */
	async get(key: string): Promise<string | null> {
		if (!key) {
			throw new Error("Key is required for Redis get operation");
		}
		return await this.client.get(key);
	}

	/**
	 * Set a binary buffer in Redis with optional expiration
	 */
	async setBuffer(
		key: string,
		value: Buffer,
		expiration?: number,
	): Promise<string> {
		if (!key || !value) {
			throw new Error(
				"Key and value are required for Redis setBuffer operation",
			);
		}
		if (expiration) {
			return await this.client.set(key, value, "EX", expiration);
		}
		return await this.client.set(key, value);
	}

	/**
	 * Get a binary buffer from Redis by key
	 */
	async getBuffer(key: string): Promise<Buffer | null> {
		if (!key) {
			throw new Error("Key is required for Redis getBuffer operation");
		}
		return await this.client.getBuffer(key);
	}

	/**
	 * Delete one or more keys from Redis
	 */
	async del(...keys: string[]): Promise<number> {
		if (keys.length === 0) {
			throw new Error("At least one key is required for Redis del operation");
		}
		return await this.client.del(...keys);
	}

	/**
	 * Find keys matching a pattern
	 */
	async keys(pattern: string): Promise<string[]> {
		if (!pattern) {
			throw new Error("Pattern is required for Redis keys operation");
		}
		return await this.client.keys(pattern);
	}

	/**
	 * Close the Redis connection gracefully
	 */
	async quit(): Promise<string> {
		return await this.client.quit();
	}

	/**
	 * Update logger reference from main app
	 */
	setLogger(logger: FastifyBaseLogger): void {
		this.logger = logger;
		// Update error handler to use proper logger
		this.client.removeAllListeners("error");
		this.client.on("error", (err: Error) => {
			this.logger?.error({ err }, "Redis connection error");
		});
	}
}

// Export singleton instance
export default new RedisClient();
