/**
 * Sanitizes input strings to prevent XSS attacks
 */
export function sanitizeInput(input: string): string;
export function sanitizeInput(input: unknown): unknown;
export function sanitizeInput(input: unknown): unknown {
	if (typeof input !== "string") {
		return input;
	}

	// Handle null or empty strings
	if (!input) {
		return input;
	}

	return input.replace(/[<>&"']/g, (char) => {
		const entities: Record<string, string> = {
			"<": "&lt;",
			">": "&gt;",
			"&": "&amp;",
			'"': "&quot;",
			"'": "&#x27;",
		};
		return entities[char] || char;
	});
}
