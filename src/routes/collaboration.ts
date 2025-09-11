import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { v4 as uuidv4 } from "uuid";
import {
	type CollabStartParams,
	type CollabJoinParams,
	type CollabSessionIdParams,
	collabStartSchema,
	collabJoinSchema,
	collabSessionIdSchema,
} from "../schemas";
import redisClient from "../utils/redis";
import config from "../config";

interface SessionMetadata {
	noteId: string;
	hostId: string;
	participants: string[];
	createdAt: number;
	expiresAt: number;
}

/**
 * Collaboration-related routes
 */
async function collaborationRoutes(fastify: FastifyInstance): Promise<void> {
	// POST /api/collab/start/:noteId - Start a new collaboration session
	fastify.post<{
		Params: CollabStartParams;
	}>(
		"/api/collab/start/:noteId",
		{
			schema: {
				params: collabStartSchema,
			},
		},
		async (
			request: FastifyRequest<{ Params: CollabStartParams }>,
			reply: FastifyReply,
		) => {
			try {
				const { noteId } = request.params;
				const sessionId = uuidv4();
				const hostId = request.ip || "unknown";

				// Create session metadata
				const session: SessionMetadata = {
					noteId,
					hostId,
					participants: [],
					createdAt: Date.now(),
					expiresAt: Date.now() + config.collaboration.sessionTTL * 1000,
				};

				// Store session in Redis with TTL
				await redisClient.set(
					`collab:session:${sessionId}`,
					JSON.stringify(session),
					config.collaboration.sessionTTL,
				);

				fastify.log.info(
					{ sessionId, noteId, hostId },
					"Collaboration session started",
				);

				return {
					sessionId,
					websocketUrl: `ws://${request.headers.host || "localhost:3000"}${config.websocket.path}/${sessionId}`,
					expiresAt: session.expiresAt,
				};
			} catch (err) {
				fastify.log.error(
					{ err, reqId: request.id },
					"Error in POST /api/collab/start/:noteId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// POST /api/collab/join/:sessionId - Join an existing collaboration session
	fastify.post<{
		Params: CollabJoinParams;
	}>(
		"/api/collab/join/:sessionId",
		{
			schema: {
				params: collabJoinSchema,
			},
		},
		async (
			request: FastifyRequest<{ Params: CollabJoinParams }>,
			reply: FastifyReply,
		) => {
			try {
				const { sessionId } = request.params;

				// Validate session exists and not expired
				const sessionData = await redisClient.get(
					`collab:session:${sessionId}`,
				);
				if (!sessionData) {
					fastify.log.info(
						{ sessionId, reqId: request.id },
						"Session not found or expired",
					);
					return reply
						.status(404)
						.send({ error: "Session not found or expired" });
				}

				const session: SessionMetadata = JSON.parse(sessionData);
				if (Date.now() > session.expiresAt) {
					fastify.log.info({ sessionId, reqId: request.id }, "Session expired");
					return reply.status(410).send({ error: "Session expired" });
				}

				fastify.log.info(
					{ sessionId, noteId: session.noteId, reqId: request.id },
					"Participant joining collaboration session",
				);

				return {
					sessionId,
					websocketUrl: `ws://${request.headers.host || "localhost:3000"}${config.websocket.path}/${sessionId}`,
					noteId: session.noteId,
					expiresAt: session.expiresAt,
				};
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in POST /api/collab/join/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// DELETE /api/collab/end/:sessionId - End a collaboration session
	fastify.delete<{
		Params: CollabSessionIdParams;
	}>(
		"/api/collab/end/:sessionId",
		{
			schema: {
				params: collabSessionIdSchema,
			},
		},
		async (
			request: FastifyRequest<{ Params: CollabSessionIdParams }>,
			reply: FastifyReply,
		) => {
			try {
				const { sessionId } = request.params;

				// Check if session exists
				const sessionData = await redisClient.get(
					`collab:session:${sessionId}`,
				);
				if (!sessionData) {
					fastify.log.info(
						{ sessionId, reqId: request.id },
						"Session not found for deletion",
					);
					return reply.status(404).send({ error: "Session not found" });
				}

				// Clean up session data
				await redisClient.del(`collab:session:${sessionId}`);
				await redisClient.del(`collab:doc:${sessionId}`);

				// Clean up presence data
				const keys = await redisClient.keys(`collab:presence:${sessionId}:*`);
				if (keys.length > 0) {
					await redisClient.del(...keys);
				}

				fastify.log.info(
					{ sessionId, reqId: request.id },
					"Collaboration session ended",
				);

				return { success: true };
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in DELETE /api/collab/end/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// GET /api/collab/status/:sessionId - Get collaboration session status
	fastify.get<{
		Params: CollabSessionIdParams;
	}>(
		"/api/collab/status/:sessionId",
		{
			schema: {
				params: collabSessionIdSchema,
			},
		},
		async (
			request: FastifyRequest<{ Params: CollabSessionIdParams }>,
			reply: FastifyReply,
		) => {
			try {
				const { sessionId } = request.params;

				// Get session data
				const sessionData = await redisClient.get(
					`collab:session:${sessionId}`,
				);
				if (!sessionData) {
					return reply.status(404).send({ error: "Session not found" });
				}

				const session: SessionMetadata = JSON.parse(sessionData);
				const isExpired = Date.now() > session.expiresAt;

				// Get participant presence data
				const presenceKeys = await redisClient.keys(
					`collab:presence:${sessionId}:*`,
				);
				const participants = [];

				for (const key of presenceKeys) {
					try {
						const presenceData = await redisClient.get(key);
						if (presenceData) {
							participants.push(JSON.parse(presenceData));
						}
					} catch (err) {
						fastify.log.warn({ err, key }, "Failed to parse presence data");
					}
				}

				return {
					sessionId,
					noteId: session.noteId,
					hostId: session.hostId,
					participants,
					participantCount: participants.length,
					createdAt: session.createdAt,
					expiresAt: session.expiresAt,
					isExpired,
					status: isExpired ? "expired" : "active",
				};
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in GET /api/collab/status/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);
}

export default collaborationRoutes;
