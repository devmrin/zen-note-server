# Zen Note Server

A robust, production-ready Node.js server built with Fastify for sharing temporary notes with enhanced security and reliability features.

## Features

- **Temporary Note Sharing**: Create and share notes with 60-second expiration
- **Input Validation**: JSON schema validation with length limits and sanitization
- **Rate Limiting**: 10 requests per minute to prevent abuse
- **Security**: CORS configuration, XSS prevention, and secure error handling
- **Structured Logging**: Request IDs, error tracking, and sensitive data redaction
- **Graceful Shutdown**: Proper Redis cleanup and signal handling
- **Modular Architecture**: Clean separation of concerns for maintainability

## Project Structure

```
zen-note-server/
├── server.js                    # Main entry point (production-ready)
├── src/
│   ├── config/
│   │   └── index.js             # Environment & server configuration
│   ├── schemas/
│   │   └── index.js             # JSON schema validation definitions
│   ├── middleware/
│   │   └── index.js             # CORS & rate limiting middleware
│   ├── routes/
│   │   ├── index.js             # Route registration
│   │   ├── health.js            # Health check routes
│   │   └── notes.js             # Notes API routes
│   └── utils/
│       ├── redis.js             # Redis client utility
│       └── sanitizer.js         # Input sanitization utilities
└── server.js.old               # Backup of original monolithic file
```

## API Endpoints

### Health Check
- **GET** `/` - Returns server status

### Notes API
- **POST** `/api/share` - Create a new shared note
- **GET** `/api/shared/:shareId` - Retrieve a shared note by ID

## Installation

1. Clone the repository:
```bash
git clone https://github.com/devmrin/zen-note-server.git
cd zen-note-server
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Create .env file
REDIS_URL=your_redis_connection_string
PORT=3000
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Usage Examples

### Create a Shared Note
```bash
curl -X POST http://localhost:3000/api/share \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Note Title",
    "content": "This is the note content"
  }'
```

Response:
```json
{
  "sharePath": "/share/Ab12xY_z"
}
```

### Retrieve a Shared Note
```bash
curl http://localhost:3000/api/shared/Ab12xY_z
```

Response:
```json
{
  "title": "My Note Title",
  "content": "This is the note content",
  "createdAt": "2025-01-06T17:30:00.000Z"
}
```

## Security Features

### Input Validation
- **Title**: 1-200 characters
- **Content**: 1-500,000 characters (500KB limit)
- **Share ID**: 8-character ID (URL-safe), strict validation
- **HTML Entity Encoding**: Prevents XSS attacks

### Rate Limiting
- **Limit**: 10 requests per minute per IP
- **Scope**: Applied to all endpoints
- **Response**: 429 status with retry information

### CORS Configuration
- **Origin**: `https://zen.mrinmay.dev / https://mrinmay.dev`
- **Methods**: GET, POST, OPTIONS
- **Credentials**: Explicitly disabled

### Error Handling
- **Generic Responses**: No sensitive information exposed
- **Structured Logging**: Detailed error tracking with request IDs
- **Graceful Degradation**: Proper error status codes

## Configuration

All configuration is centralized in `src/config/index.js`:

```javascript
{
  server: {
    port: 3000,
    host: '0.0.0.0',
    logger: { /* structured logging config */ }
  },
  redis: {
    url: process.env.REDIS_URL
  },
  cors: {
    origin: ['https://zen.mrinmay.dev', 'https://mrinmay.dev'],
    credentials: false
  },
  rateLimit: {
    max: 10,
    timeWindow: '1 minute'
  }
}
```

## Dependencies

### Core Dependencies
- **fastify**: Fast and low overhead web framework
- **@fastify/cors**: CORS support
- **@fastify/rate-limit**: Rate limiting middleware
- **ioredis**: Redis client for data storage
- **dotenv**: Environment variable management

## Deployment

### Environment Variables
```bash
REDIS_URL=redis://your-redis-instance
PORT=3000
```

### Production Considerations
- Ensure Redis instance is properly configured
- Set appropriate CORS origins for your domain
- Configure proper logging levels
- Monitor rate limiting metrics
- Set up health checks using the `/` endpoint

## Development

### Adding New Routes
1. Create route handler in `src/routes/`
2. Register in `src/routes/index.js`
3. Add schemas in `src/schemas/index.js` if needed

### Adding Middleware
1. Add middleware logic in `src/middleware/index.js`
2. Register with Fastify instance

### Configuration Changes
1. Update `src/config/index.js`
2. Add environment variables as needed

## Logging

The server uses structured logging with:
- **Request IDs**: Unique identifier for each request
- **Sensitive Data Redaction**: Authorization headers and cookies
- **Error Context**: Detailed error information for debugging
- **Performance Metrics**: Request/response logging

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please use the GitHub issue tracker.
