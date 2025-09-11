import * as Y from "yjs";
import WebSocket from "ws";
import type { FastifyBaseLogger } from "fastify";
import redisClient from "../utils/redis";
import config from "../config";

interface CollaborationSession {
	ydoc: Y.Doc;
	connections: Set<WebSocket>;
	lastActivity: number;
	participants: Set<string>;
}

interface SessionMetadata {
	noteId: string;
	hostId: string;
	participants: string[];
	createdAt: number;
	expiresAt: number;
}

export class CollaborationManager {
	private sessions = new Map<string, CollaborationSession>();
	private logger: FastifyBaseLogger | null = null;
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor() {
		this.startCleanupInterval();
	}

	setLogger(logger: FastifyBaseLogger): void {
		this.logger = logger;
	}

	async handleConnection(
		ws: WebSocket,
		sessionId: string,
		participantId: string,
	): Promise<void> {
		try {
			// Validate session exists and is not expired
			const sessionData = await redisClient.get(`collab:session:${sessionId}`);
			if (!sessionData) {
				ws.close(1008, "Session not found or expired");
				return;
			}

			const metadata: SessionMetadata = JSON.parse(sessionData);
			if (Date.now() > metadata.expiresAt) {
				ws.close(1008, "Session expired");
				await this.cleanupSession(sessionId);
				return;
			}

			// Get or create session
			let session = this.sessions.get(sessionId);
			if (!session) {
				session = await this.createSession(sessionId, metadata);
			}

			// Check participant limit
			if (session.participants.size >= config.collaboration.maxParticipants) {
				ws.close(1008, "Session full");
				return;
			}

			// Add connection and participant
			session.connections.add(ws);
			session.participants.add(participantId);
			session.lastActivity = Date.now();

			this.logger?.info(
				{
					sessionId,
					participantId,
					participantCount: session.participants.size,
					connectionCount: session.connections.size,
				},
				"Participant joined collaboration session",
			);

			// Set up Y.js sync
			this.setupYjsSync(ws, session.ydoc, sessionId);

			// Handle WebSocket events
			ws.on("close", () => {
				this.handleDisconnection(ws, sessionId, participantId);
			});

			ws.on("error", (error: Error) => {
				this.logger?.error(
					{ error, sessionId, participantId },
					"WebSocket error",
				);
				this.handleDisconnection(ws, sessionId, participantId);
			});

			// Update participant presence in Redis
			await this.updateParticipantPresence(sessionId, participantId, {
				name: participantId,
				color: this.generateParticipantColor(participantId),
				lastSeen: Date.now(),
			});
		} catch (error) {
			this.logger?.error(
				{ error, sessionId },
				"Error handling WebSocket connection",
			);
			ws.close(1011, "Internal server error");
		}
	}

	private async createSession(
		sessionId: string,
		metadata: SessionMetadata,
	): Promise<CollaborationSession> {
		const ydoc = new Y.Doc();

		// Try to restore document state from Redis
		const docState = await redisClient.getBuffer(`collab:doc:${sessionId}`);
		if (docState) {
			Y.applyUpdate(ydoc, docState);
		}

		const session: CollaborationSession = {
			ydoc,
			connections: new Set(),
			lastActivity: Date.now(),
			participants: new Set(),
		};

		// Set up document update handler to persist changes
		ydoc.on("update", async (update: Uint8Array) => {
			try {
				await redisClient.setBuffer(
					`collab:doc:${sessionId}`,
					Buffer.from(update),
					config.collaboration.sessionTTL,
				);
			} catch (error) {
				this.logger?.error(
					{ error, sessionId },
					"Failed to persist document update",
				);
			}
		});

		this.sessions.set(sessionId, session);
		return session;
	}

	private setupYjsSync(ws: WebSocket, ydoc: Y.Doc, sessionId: string): void {
		// Send initial document state
		const state = Y.encodeStateAsUpdate(ydoc);
		this.sendMessage(ws, { type: "sync-step-1", update: Array.from(state) });

		// Handle incoming messages
		ws.on("message", (data: Buffer) => {
			try {
				const message = JSON.parse(data.toString());
				this.handleYjsMessage(ws, ydoc, message, sessionId);
			} catch (error) {
				this.logger?.error(
					{ error, sessionId },
					"Failed to parse WebSocket message",
				);
			}
		});

		// Handle document updates
		ydoc.on("update", (update: Uint8Array) => {
			const message = {
				type: "sync-update",
				update: Array.from(update),
			};

			// Broadcast to all connections except sender
			const session = this.sessions.get(sessionId);
			if (session) {
				session.connections.forEach((conn) => {
					if (conn !== ws && conn.readyState === WebSocket.OPEN) {
						this.sendMessage(conn, message);
					}
				});
			}
		});
	}

	private handleYjsMessage(
		ws: WebSocket,
		ydoc: Y.Doc,
		message: any,
		sessionId: string,
	): void {
		switch (message.type) {
			case "sync-step-1": {
				if (message.update) {
					Y.applyUpdate(ydoc, new Uint8Array(message.update));
				}
				break;
			}

			case "sync-step-2": {
				if (message.update) {
					Y.applyUpdate(ydoc, new Uint8Array(message.update));
				}
				break;
			}

			case "sync-update": {
				if (message.update) {
					Y.applyUpdate(ydoc, new Uint8Array(message.update));
				}
				break;
			}

			case "awareness": {
				// Broadcast awareness updates to other participants
				const session = this.sessions.get(sessionId);
				if (session) {
					session.connections.forEach((conn) => {
						if (conn !== ws && conn.readyState === WebSocket.OPEN) {
							this.sendMessage(conn, message);
						}
					});
				}
				break;
			}

			default:
				this.logger?.warn(
					{ messageType: message.type, sessionId },
					"Unknown message type",
				);
		}
	}

	private handleDisconnection(
		ws: WebSocket,
		sessionId: string,
		participantId: string,
	): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		session.connections.delete(ws);
		session.participants.delete(participantId);

		this.logger?.info(
			{
				sessionId,
				participantId,
				remainingConnections: session.connections.size,
				remainingParticipants: session.participants.size,
			},
			"Participant left collaboration session",
		);

		// Clean up participant presence
		redisClient
			.del(`collab:presence:${sessionId}:${participantId}`)
			.catch((error: Error) => {
				this.logger?.error(
					{ error, sessionId, participantId },
					"Failed to clean up participant presence",
				);
			});

		// If no more connections, mark session for cleanup
		if (session.connections.size === 0) {
			setTimeout(() => {
				if (session.connections.size === 0) {
					this.cleanupSession(sessionId);
				}
			}, 30000); // 30-second grace period
		}
	}

	private async cleanupSession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (session) {
			// Close all remaining connections
			session.connections.forEach((ws) => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.close(1000, "Session ended");
				}
			});

			// Clean up Y.js document
			session.ydoc.destroy();
			this.sessions.delete(sessionId);
		}

		// Clean up Redis data
		try {
			await redisClient.del(`collab:session:${sessionId}`);
			await redisClient.del(`collab:doc:${sessionId}`);

			// Clean up presence data
			const keys = await redisClient.keys(`collab:presence:${sessionId}:*`);
			if (keys.length > 0) {
				await redisClient.del(...keys);
			}

			this.logger?.info({ sessionId }, "Collaboration session cleaned up");
		} catch (error) {
			this.logger?.error(
				{ error, sessionId },
				"Error cleaning up session data",
			);
		}
	}

	private async updateParticipantPresence(
		sessionId: string,
		participantId: string,
		presence: any,
	): Promise<void> {
		try {
			await redisClient.set(
				`collab:presence:${sessionId}:${participantId}`,
				JSON.stringify(presence),
				config.collaboration.sessionTTL,
			);
		} catch (error) {
			this.logger?.error(
				{ error, sessionId, participantId },
				"Failed to update participant presence",
			);
		}
	}

	private generateParticipantColor(participantId: string): string {
		const colors = [
			"#FF6B6B",
			"#4ECDC4",
			"#45B7D1",
			"#96CEB4",
			"#FECA57",
			"#FF9FF3",
			"#54A0FF",
			"#5F27CD",
			"#00D2D3",
			"#FF9F43",
		];
		const hash = participantId.split("").reduce((a, b) => {
			a = (a << 5) - a + b.charCodeAt(0);
			return a & a;
		}, 0);
		const index = Math.abs(hash) % colors.length;
		return colors[index] ?? "#FF6B6B";
	}

	private sendMessage(ws: WebSocket, message: any): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	private startCleanupInterval(): void {
		this.cleanupInterval = setInterval(() => {
			this.performPeriodicCleanup();
		}, config.collaboration.cleanupInterval);
	}

	private async performPeriodicCleanup(): Promise<void> {
		const now = Date.now();
		const sessionsToCleanup: string[] = [];

		// Check for inactive sessions
		for (const [sessionId, session] of this.sessions.entries()) {
			if (now - session.lastActivity > config.collaboration.sessionTTL * 1000) {
				sessionsToCleanup.push(sessionId);
			}
		}

		// Clean up inactive sessions
		for (const sessionId of sessionsToCleanup) {
			await this.cleanupSession(sessionId);
		}

		if (sessionsToCleanup.length > 0) {
			this.logger?.info(
				{ cleanedSessions: sessionsToCleanup.length },
				"Cleaned up inactive collaboration sessions",
			);
		}
	}

	async shutdown(): Promise<void> {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}

		// Clean up all active sessions
		const sessionIds = Array.from(this.sessions.keys());
		for (const sessionId of sessionIds) {
			await this.cleanupSession(sessionId);
		}

		this.logger?.info("Collaboration manager shut down");
	}
}
