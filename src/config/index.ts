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

interface WebSocketConfig {
	path: string;
	heartbeatInterval: number;
	maxConnections: number;
}

interface CollaborationConfig {
	sessionTTL: number;
	maxParticipants: number;
	cleanupInterval: number;
}

interface Config {
	server: ServerConfig;
	redis: RedisConfig;
	cors: CorsConfig;
	rateLimit: RateLimitConfig;
	websocket: WebSocketConfig;
	collaboration: CollaborationConfig;
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
		methods: ["GET", "POST", "DELETE", "OPTIONS"],
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
	websocket: {
		path: "/collab",
		heartbeatInterval:
			Number(process.env.WEBSOCKET_HEARTBEAT_INTERVAL) || 30000,
		maxConnections: Number(process.env.MAX_WEBSOCKET_CONNECTIONS) || 100,
	},
	collaboration: {
		sessionTTL: Number(process.env.COLLAB_SESSION_TTL) || 1200, // 20 minutes
		maxParticipants: Number(process.env.MAX_PARTICIPANTS_PER_SESSION) || 10,
		cleanupInterval: Number(process.env.COLLAB_CLEANUP_INTERVAL) || 60000, // 1 minute
	},
};

export default config;
