import type { JSONSchemaType } from "ajv";

interface ShareBody {
	title: string;
	content: string;
}

interface ShareIdParams {
	shareId: string;
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

export type { ShareBody, ShareIdParams };
