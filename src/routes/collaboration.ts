import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { v4 as uuidv4 } from "uuid";
import {
	type CollabCreateBody,
	type CollabJoinParams,
	type CollabJoinBody,
	type CollabSessionIdParams,
	collabCreateSchema,
	collabJoinSchema,
	collabJoinBodySchema,
	collabSessionIdSchema,
} from "../schemas";
import redisClient from "../utils/redis";
import config from "../config";
import { sanitizeInput } from "../utils/sanitizer";

interface SessionMetadata {
	noteId: string;
	noteTitle: string;
	noteContent: string;
	creatorId: string;
	hostId: string;
	participants: string[];
	createdAt: number;
	expiresAt: number;
}

/**
 * Collaboration-related routes
 */
async function collaborationRoutes(fastify: FastifyInstance): Promise<void> {
	// POST /api/collab/create - Create a new collaboration session
	fastify.post<{
		Body: CollabCreateBody;
	}>(
		"/api/collab/create",
		{
			schema: {
				body: collabCreateSchema,
			},
		},
		async (
			request: FastifyRequest<{ Body: CollabCreateBody }>,
			reply: FastifyReply,
		) => {
			try {
				const { noteTitle, noteContent } = request.body;
				const sessionId = uuidv4();
				const creatorId = request.ip || "unknown";
				const hostId = request.ip || "unknown";

				// Sanitize the title but keep content as-is for collaboration
				const sanitizedTitle = sanitizeInput(noteTitle);

				// Create session metadata
				const session: SessionMetadata = {
					noteId: sessionId, // Use sessionId as noteId for temporary collaboration
					noteTitle: sanitizedTitle,
					noteContent,
					creatorId,
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
					{ sessionId, noteTitle: sanitizedTitle, creatorId },
					"Collaboration session created",
				);

				const collaborationUrl = `${request.protocol}://${request.headers.host || "localhost:3000"}/collab/${sessionId}`;

				return {
					sessionId,
					collaborationUrl,
					websocketUrl: `ws://${request.headers.host || "localhost:3000"}${config.websocket.path}/${sessionId}`,
					expiresAt: session.expiresAt,
				};
			} catch (err) {
				fastify.log.error(
					{ err, reqId: request.id },
					"Error in POST /api/collab/create",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// GET /api/collab/session/:sessionId - Get session data
	fastify.get<{
		Params: CollabSessionIdParams;
	}>(
		"/api/collab/session/:sessionId",
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
				const isActive = Date.now() <= session.expiresAt;

				// Get participant presence data
				const presenceKeys = await redisClient.keys(
					`collab:presence:${sessionId}:*`,
				);
				let participantCount = 0;

				for (const key of presenceKeys) {
					try {
						const presenceData = await redisClient.get(key);
						if (presenceData) {
							participantCount++;
						}
					} catch (err) {
						fastify.log.warn({ err, key }, "Failed to parse presence data");
					}
				}

				return {
					sessionId,
					noteTitle: session.noteTitle,
					noteContent: session.noteContent,
					isActive,
					participantCount,
					createdAt: session.createdAt,
					expiresAt: session.expiresAt,
				};
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in GET /api/collab/session/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// POST /api/collab/join/:sessionId - Join an existing collaboration session
	fastify.post<{
		Params: CollabJoinParams;
		Body: CollabJoinBody;
	}>(
		"/api/collab/join/:sessionId",
		{
			schema: {
				params: collabJoinSchema,
				body: collabJoinBodySchema,
			},
		},
		async (
			request: FastifyRequest<{ Params: CollabJoinParams; Body: CollabJoinBody }>,
			reply: FastifyReply,
		) => {
			try {
				const { sessionId } = request.params;
				const { participantName } = request.body;

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
					{ sessionId, participantName, reqId: request.id },
					"Participant joining collaboration session",
				);

				return {
					success: true,
					sessionData: {
						sessionId,
						noteTitle: session.noteTitle,
						noteContent: session.noteContent,
						websocketUrl: `ws://${request.headers.host || "localhost:3000"}${config.websocket.path}/${sessionId}`,
						expiresAt: session.expiresAt,
					},
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

	// POST /api/collab/leave/:sessionId - Leave a collaboration session
	fastify.post<{
		Params: CollabSessionIdParams;
	}>(
		"/api/collab/leave/:sessionId",
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
				const participantId = request.ip || "unknown";

				// Check if session exists
				const sessionData = await redisClient.get(
					`collab:session:${sessionId}`,
				);
				if (!sessionData) {
					fastify.log.info(
						{ sessionId, reqId: request.id },
						"Session not found for leave operation",
					);
					return reply.status(404).send({ error: "Session not found" });
				}

				// Clean up participant presence
				await redisClient.del(`collab:presence:${sessionId}:${participantId}`);

				fastify.log.info(
					{ sessionId, participantId, reqId: request.id },
					"Participant left collaboration session",
				);

				return { success: true };
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in POST /api/collab/leave/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// DELETE /api/collab/session/:sessionId - End a collaboration session (creator only)
	fastify.delete<{
		Params: CollabSessionIdParams;
	}>(
		"/api/collab/session/:sessionId",
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
				const requesterId = request.ip || "unknown";

				// Check if session exists and validate creator
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

				const session: SessionMetadata = JSON.parse(sessionData);
				
				// Only allow session creator to end the session
				if (session.creatorId !== requesterId) {
					fastify.log.warn(
						{ sessionId, requesterId, creatorId: session.creatorId, reqId: request.id },
						"Unauthorized attempt to end session",
					);
					return reply.status(403).send({ error: "Only session creator can end the session" });
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
					"Collaboration session ended by creator",
				);

				return { success: true };
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in DELETE /api/collab/session/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// Legacy route support - POST /api/collab/start/:noteId (deprecated but kept for compatibility)
	fastify.post(
		"/api/collab/start/:noteId",
		async (request: FastifyRequest, reply: FastifyReply) => {
			fastify.log.warn(
				{ reqId: request.id },
				"Deprecated endpoint /api/collab/start/:noteId accessed",
			);
			return reply.status(410).send({ 
				error: "This endpoint is deprecated. Use POST /api/collab/create instead.",
				migration: "Use POST /api/collab/create with noteTitle and noteContent in the request body"
			});
		},
	);

	// Legacy route support - POST /api/collab/join/:sessionId (without body, deprecated)
	fastify.get(
		"/api/collab/join/:sessionId",
		async (request: FastifyRequest, reply: FastifyReply) => {
			fastify.log.warn(
				{ reqId: request.id },
				"Deprecated endpoint GET /api/collab/join/:sessionId accessed",
			);
			return reply.status(410).send({ 
				error: "This endpoint is deprecated. Use POST /api/collab/join/:sessionId instead.",
				migration: "Use POST /api/collab/join/:sessionId with optional participantName in the request body"
			});
		},
	);

	// Legacy route support - DELETE /api/collab/end/:sessionId (deprecated)
	fastify.delete(
		"/api/collab/end/:sessionId",
		async (request: FastifyRequest, reply: FastifyReply) => {
			fastify.log.warn(
				{ reqId: request.id },
				"Deprecated endpoint DELETE /api/collab/end/:sessionId accessed",
			);
			return reply.status(410).send({ 
				error: "This endpoint is deprecated. Use DELETE /api/collab/session/:sessionId instead.",
				migration: "Use DELETE /api/collab/session/:sessionId"
			});
		},
	);

	// GET /api/collab/content/:sessionId - Get current document content for saving
	fastify.get<{
		Params: CollabSessionIdParams;
	}>(
		"/api/collab/content/:sessionId",
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

				// Validate session exists
				const sessionData = await redisClient.get(
					`collab:session:${sessionId}`,
				);
				if (!sessionData) {
					return reply.status(404).send({ error: "Session not found" });
				}

				const session: SessionMetadata = JSON.parse(sessionData);
				
				// Get current document content from collaboration manager
				const collaborationManager = (fastify as any).collaborationManager;
				const content = await collaborationManager?.getSessionContent(sessionId);

				return {
					sessionId,
					noteTitle: session.noteTitle,
					noteContent: content || session.noteContent,
					lastModified: Date.now(),
				};
			} catch (err) {
				fastify.log.error(
					{ err, sessionId: request.params.sessionId, reqId: request.id },
					"Error in GET /api/collab/content/:sessionId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// Legacy route support - GET /api/collab/status/:sessionId (deprecated)
	fastify.get(
		"/api/collab/status/:sessionId",
		async (request: FastifyRequest, reply: FastifyReply) => {
			fastify.log.warn(
				{ reqId: request.id },
				"Deprecated endpoint GET /api/collab/status/:sessionId accessed",
			);
			return reply.status(410).send({ 
				error: "This endpoint is deprecated. Use GET /api/collab/session/:sessionId instead.",
				migration: "Use GET /api/collab/session/:sessionId"
			});
		},
	);
}

export default collaborationRoutes;
