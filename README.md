# Zen Note Server

A high-performance Node.js server for the Zen Note application with real-time collaboration features.

## Features

- **Note Sharing**: Share notes with temporary, secure links
- **Real-time Collaboration**: Multi-user collaborative editing with Y.js CRDT
- **WebSocket Support**: Real-time synchronization and presence awareness
- **Local-First Architecture**: Temporary collaboration with automatic cleanup
- **Redis Integration**: Efficient session management and document persistence
- **Rate Limiting**: Built-in protection against abuse
- **Health Monitoring**: Comprehensive health check endpoints

## Architecture

### Collaboration System

The server implements a **hybrid local-first + temporary collaboration** system:

- **Local-First**: Primary data persists in client-side storage
- **Temporary Sessions**: Real-time collaboration via WebSocket + Redis (20-min TTL)
- **Opt-in Collaboration**: Collaboration is explicitly enabled per note
- **Secure Sessions**: Unguessable UUIDv4 session IDs
- **Automatic Cleanup**: Sessions expire automatically with comprehensive cleanup

### Technology Stack

- **Framework**: Fastify with TypeScript
- **Real-time**: WebSocket with Y.js CRDT for conflict-free collaboration
- **Storage**: Redis for temporary session data and document synchronization
- **Validation**: JSON Schema validation with AJV
- **Security**: Rate limiting, CORS, input sanitization

## API Endpoints

### Note Sharing (Existing)

- `POST /api/share` - Create a shared note (60s TTL)
- `GET /api/shared/:shareId` - Retrieve a shared note

### Real-time Collaboration (New)

- `POST /api/collab/start/:noteId` - Start collaboration session
- `POST /api/collab/join/:sessionId` - Join existing session  
- `DELETE /api/collab/end/:sessionId` - End collaboration session
- `GET /api/collab/status/:sessionId` - Get session status & participants

### WebSocket Endpoint

- `WS /collab/:sessionId` - Real-time collaboration WebSocket

### Health & Monitoring

- `GET /health` - Server health check
- `GET /health/detailed` - Detailed health information

## Environment Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000

# Redis Configuration (Required)
REDIS_URL=redis://localhost:6379

# WebSocket Configuration (Optional - defaults provided)
WEBSOCKET_HEARTBEAT_INTERVAL=30000
MAX_WEBSOCKET_CONNECTIONS=100

# Collaboration Configuration (Optional - defaults provided)
COLLAB_SESSION_TTL=1200
MAX_PARTICIPANTS_PER_SESSION=10
COLLAB_CLEANUP_INTERVAL=60000
```

## Quick Start

### Prerequisites

- Node.js 18+ with npm
- Redis server running locally or accessible via URL
- TypeScript support

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run dev

# Or start production server
npm start
```

### Redis Setup

#### Local Redis (macOS)
```bash
# Install Redis
brew install redis

# Start Redis server
brew services start redis

# Or run temporarily
redis-server
```

#### Docker Redis
```bash
# Run Redis container
docker run -d -p 6379:6379 --name zen-redis redis:7-alpine

# Stop Redis container
docker stop zen-redis
```

## Collaboration Usage

### Starting a Collaboration Session

```javascript
// Start collaboration for a note
const response = await fetch('/api/collab/start/my-note-id', {
  method: 'POST'
});

const { sessionId, websocketUrl, expiresAt } = await response.json();
```

### Joining a Session

```javascript
// Join existing session
const response = await fetch(`/api/collab/join/${sessionId}`, {
  method: 'POST'
});

const { websocketUrl, noteId } = await response.json();
```

### WebSocket Connection

```javascript
// Connect to collaboration WebSocket
const ws = new WebSocket(websocketUrl);

// Set participant ID (optional)
ws.addEventListener('open', () => {
  // Send participant identification if needed
  ws.send(JSON.stringify({
    type: 'participant-id',
    id: 'unique-participant-id'
  }));
});

// Handle Y.js synchronization messages
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'sync-step-1':
    case 'sync-step-2':
    case 'sync-update':
      // Apply Y.js updates to local document
      break;
    case 'awareness':
      // Handle participant presence updates
      break;
  }
});
```

## Development Scripts

```bash
# Development with auto-reload
npm run dev

# Type checking only
npm run type-check

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start

# Run tests (when available)
npm test
```

## Project Structure

```
src/
├── config/           # Server configuration
├── middleware/       # CORS & rate limiting
├── routes/          
│   ├── health.ts    # Health check endpoints
│   ├── notes.ts     # Note sharing endpoints
│   ├── collaboration.ts  # Collaboration endpoints
│   └── index.ts     # Route registration
├── schemas/         # JSON schema validation
├── services/        
│   └── collaboration.ts  # Y.js collaboration manager
├── utils/
│   ├── redis.ts     # Redis client utility
│   └── sanitizer.ts # XSS prevention
└── server.ts        # Main application entry
```

## Data Models

### Collaboration Session

```typescript
interface SessionMetadata {
  noteId: string;           // Original note identifier
  hostId: string;           // Session creator IP/ID
  participants: string[];   // Active participant IDs
  createdAt: number;        // Creation timestamp
  expiresAt: number;        // Expiration timestamp (20 min TTL)
}
```

### Redis Data Structure

```
# Session metadata
collab:session:{sessionId} = SessionMetadata JSON

# Y.js document state (binary)
collab:doc:{sessionId} = Y.Doc binary state

# Participant presence
collab:presence:{sessionId}:{participantId} = {
  name: string,
  color: string,
  cursor: object,
  lastSeen: number
}
```

## Security Features

- **UUIDv4 Session IDs**: Cryptographically random, unguessable identifiers
- **Time-Limited Sessions**: 20-minute automatic expiration
- **Rate Limiting**: 10 requests per minute per IP
- **Input Validation**: Strict JSON schema validation
- **CORS Protection**: Configured origins whitelist
- **XSS Prevention**: Input sanitization for titles

## Monitoring & Observability

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health information
curl http://localhost:3000/health/detailed
```

### Metrics Tracked

- Active collaboration sessions
- WebSocket connections per session
- Session duration and completion rates
- Redis memory usage for collaboration data
- WebSocket connection errors

### Logging

The server provides structured logging for:

- Session lifecycle events (created, joined, expired)
- WebSocket connection events
- Y.js synchronization events
- Error conditions and debugging information

## Production Deployment

### Environment Variables

Set the following in production:

```env
PORT=3000
REDIS_URL=redis://your-production-redis-url
COLLAB_SESSION_TTL=1200
MAX_PARTICIPANTS_PER_SESSION=10
```

### Reverse Proxy Configuration

Ensure your reverse proxy (nginx, Apache) supports WebSocket upgrades:

```nginx
# Nginx example
location /collab/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Scaling Considerations

- **Redis Clustering**: Distribute collaboration data across Redis cluster
- **WebSocket Scaling**: Use sticky sessions or Redis adapter for multiple instances
- **Memory Management**: Monitor Y.js document memory usage
- **Connection Limits**: Configure appropriate WebSocket connection limits

## License

ISC
