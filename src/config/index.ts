import { config as dotenvConfig } from "dotenv";
import type { FastifyLoggerOptions } from "fastify";

dotenvConfig();

interface ServerConfig {
	port: number;
	host: string;
	logger: FastifyLoggerOptions;
}

interface RedisConfig {
	url: string | undefined;
}

interface CorsConfig {
	origin: string[];
	methods: string[];
	credentials: boolean;
}

interface RateLimitConfig {
	max: number;
	timeWindow: string;
	errorResponseBuilder: (
		request: unknown,
		context: { ttl: number },
	) => {
		code: number;
		error: string;
		message: string;
	};
}

interface Config {
	server: ServerConfig;
	redis: RedisConfig;
	cors: CorsConfig;
	rateLimit: RateLimitConfig;
}

const config: Config = {
	server: {
		port: Number(process.env.PORT) || 3000,
		host: "0.0.0.0",
		logger: {
			level: "info",
		},
	},
	redis: {
		url: process.env.REDIS_URL,
	},
	cors: {
		origin: ["https://zen.mrinmay.dev", "https://mrinmay.dev"],
		methods: ["GET", "POST", "OPTIONS"],
		credentials: false,
	},
	rateLimit: {
		max: 10, // 10 requests per minute
		timeWindow: "1 minute",
		errorResponseBuilder: (_request: unknown, context: { ttl: number }) => ({
			code: 429,
			error: "Rate limit exceeded",
			message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds.`,
		}),
	},
};

export default config;
