import type { JSONSchemaType } from "ajv";

interface ShareBody {
	title: string;
	content: string;
}

interface ShareIdParams {
	shareId: string;
}

interface CollabStartParams {
	noteId: string;
}

interface CollabJoinParams {
	sessionId: string;
}

interface CollabSessionIdParams {
	sessionId: string;
}

export const shareSchema: JSONSchemaType<ShareBody> = {
	type: "object",
	required: ["title", "content"],
	properties: {
		title: {
			type: "string",
			minLength: 1,
			maxLength: 200,
			pattern: "^[\\s\\S]*$", // Allow any characters but enforce length
		},
		content: {
			// Accept raw HTML string as-is
			type: "string",
			minLength: 1,
			maxLength: 500000,
		},
	},
	additionalProperties: false,
};

export const shareIdSchema: JSONSchemaType<ShareIdParams> = {
	type: "object",
	required: ["shareId"],
	properties: {
		shareId: {
			type: "string",
			// 8-character NanoID: URL-safe alphanumerics
			pattern: "^[A-Za-z0-9_-]{8}$",
		},
	},
	additionalProperties: false,
};

export const collabStartSchema: JSONSchemaType<CollabStartParams> = {
	type: "object",
	required: ["noteId"],
	properties: {
		noteId: {
			type: "string",
			pattern: "^[a-zA-Z0-9-_]+$",
			minLength: 1,
			maxLength: 100,
		},
	},
	additionalProperties: false,
};

export const collabJoinSchema: JSONSchemaType<CollabJoinParams> = {
	type: "object",
	required: ["sessionId"],
	properties: {
		sessionId: {
			type: "string",
			// UUID v4 pattern
			pattern:
				"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
		},
	},
	additionalProperties: false,
};

export const collabSessionIdSchema: JSONSchemaType<CollabSessionIdParams> = {
	type: "object",
	required: ["sessionId"],
	properties: {
		sessionId: {
			type: "string",
			// UUID v4 pattern
			pattern:
				"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
		},
	},
	additionalProperties: false,
};

export type {
	ShareBody,
	ShareIdParams,
	CollabStartParams,
	CollabJoinParams,
	CollabSessionIdParams,
};
