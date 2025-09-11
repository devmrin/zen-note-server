/**
 * Sanitizes input strings to prevent XSS attacks
 * @param {string} input - The input string to sanitize
 * @returns {string} - The sanitized string
 */
function sanitizeInput(input) {
	if (typeof input !== "string") {
		return input;
	}

	// Handle null or empty strings
	if (!input) {
		return input;
	}

	return input.replace(/[<>&"']/g, (char) => {
		const entities = {
			"<": "&lt;",
			">": "&gt;",
			"&": "&amp;",
			'"': "&quot;",
			"'": "&#x27;",
		};
		return entities[char] || char;
	});
}

module.exports = {
	sanitizeInput,
};
