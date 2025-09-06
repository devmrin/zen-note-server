const shareSchema = {
    type: 'object',
    required: ['title', 'content'],
    properties: {
        title: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            pattern: '^[\\s\\S]*$' // Allow any characters but enforce length
        },
        content: {
            type: 'string',
            minLength: 1,
            maxLength: 50000 // 50KB limit
        }
    },
    additionalProperties: false
};

const shareIdSchema = {
    type: 'object',
    required: ['shareId'],
    properties: {
        shareId: {
            type: 'string',
            pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' // UUID format
        }
    },
    additionalProperties: false
};

module.exports = {
    shareSchema,
    shareIdSchema
};
