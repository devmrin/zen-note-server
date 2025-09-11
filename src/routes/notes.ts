import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
	type ShareBody,
	type ShareIdParams,
	shareIdSchema,
	shareSchema,
} from "../schemas";
import redisClient from "../utils/redis";
import { sanitizeInput } from "../utils/sanitizer";

interface Note {
	title: string;
	content: string;
	createdAt: string;
}

/**
 * Notes-related routes
 */
async function notesRoutes(fastify: FastifyInstance): Promise<void> {
	// POST /api/share - Create a new shared note
	fastify.post<{
		Body: ShareBody;
	}>(
		"/api/share",
		{
			schema: {
				body: shareSchema,
			},
		},
		async (
			request: FastifyRequest<{ Body: ShareBody }>,
			reply: FastifyReply,
		) => {
			try {
				const { title, content } = request.body;

				// Sanitize only the title. Accept raw HTML for content.
				const sanitizedTitle = sanitizeInput(title);

				const { customAlphabet } = await import("nanoid");
				const generateShareId = customAlphabet(
					"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
					8,
				);
				const shareId = generateShareId();
				const redisKey = `note:${shareId}`;
				const note: Note = {
					title: sanitizedTitle,
					content: content,
					createdAt: new Date().toISOString(),
				};

				// Store as plain string with 60s TTL
				await redisClient.set(redisKey, JSON.stringify(note), 60);

				fastify.log.info(
					{ shareId, titleLength: title.length, contentLength: content.length },
					"Note shared successfully",
				);

				return {
					sharePath: `/share/${shareId}`,
				};
			} catch (err) {
				fastify.log.error(
					{ err, reqId: request.id },
					"Error in POST /api/share",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);

	// GET /api/shared/:shareId - Retrieve a shared note
	fastify.get<{
		Params: ShareIdParams;
	}>(
		"/api/shared/:shareId",
		{
			schema: {
				params: shareIdSchema,
			},
		},
		async (
			request: FastifyRequest<{ Params: ShareIdParams }>,
			reply: FastifyReply,
		) => {
			try {
				const { shareId } = request.params;
				const redisKey = `note:${shareId}`;

				const data = await redisClient.get(redisKey);

				if (!data) {
					fastify.log.info(
						{ shareId, reqId: request.id },
						"Note not found or expired",
					);
					return reply.status(404).send({ error: "Note not found or expired" });
				}

				const note: Note = JSON.parse(data);
				fastify.log.info(
					{ shareId, reqId: request.id },
					"Note retrieved successfully",
				);
				return note;
			} catch (err) {
				fastify.log.error(
					{ err, shareId: request.params.shareId, reqId: request.id },
					"Error in GET /api/shared/:shareId",
				);
				return reply.status(500).send({ error: "Internal Server Error" });
			}
		},
	);
}

export default notesRoutes;
