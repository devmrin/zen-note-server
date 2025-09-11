# Zen Note Server - Collaboration Architecture

## Overview

This document outlines the technical architecture for implementing a **hybrid local-first + temporary collaboration** system for the Zen Note Server. The system enables real-time collaborative editing while maintaining data privacy and local-first principles.

## Current Architecture Analysis

### Existing Codebase Structure
```
src/
├── config/index.js          # Server configuration (Fastify, Redis, CORS, Rate Limiting)
├── middleware/index.js      # CORS & rate limiting middleware
├── routes/
│   ├── index.js            # Route registration
│   ├── health.js           # Health check endpoints
│   └── notes.js            # Current notes API (POST /api/share, GET /api/shared/:shareId)
├── schemas/index.js        # JSON schema validation
└── utils/
    ├── redis.js            # Redis client utility
    └── sanitizer.js        # XSS prevention utilities
```

### Current Dependencies
- **Fastify**: Web framework
- **ioredis**: Redis client
- **nanoid**: ID generation (8-char alphanumeric)
- **@fastify/cors**: CORS middleware
- **@fastify/rate-limit**: Rate limiting

## Collaboration Architecture

### 🎯 Core Principles

1. **Local-First**: Primary data persists in client-side IndexedDB
2. **Temporary Collaboration**: Real-time sync via WebSocket + Redis (20-min TTL)
3. **Opt-in Sessions**: Collaboration is explicitly enabled per note
4. **Security**: Unguessable UUIDv4 session IDs
5. **One-Session-Per-Note**: Prevents overlapping collaboration sessions

### 🏗️ System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User A        │    │   WebSocket      │    │   User B        │
│   IndexedDB     │◄──►│   Server +       │◄──►│   IndexedDB     │
│   (Local Store) │    │   Redis (Temp)   │    │   (Local Store) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

Perfect! I've successfully populated the `collab.md` file with a comprehensive collaboration architecture document that:

1. **Analyzes your current codebase** - Understanding the existing Fastify structure, Redis integration, and API patterns
2. **Outlines the complete collaboration system** - Based on your hybrid local-first + temporary collaboration specifications
3. **Provides detailed implementation plans** - Including new routes, WebSocket integration, Y.js setup, and Redis data structures
4. **Covers security and deployment** - UUIDv4 session IDs, input validation, monitoring, and environment configuration
5. **Includes testing and future enhancements** - Comprehensive testing strategy and scalability considerations

The document is now ready and integrates seamlessly with your existing codebase patterns while providing a clear roadmap for implementing the real-time collaboration features you outlined.

## Route Structure

### New Collaboration Routes

| Route | Purpose | Method |
|-------|---------|--------|
| `/note/$noteId` | Solo editing (default mode) | - |
| `/share/$shareId` | Read-only shared note | - |
| `/collab/$noteId/$sessionId` | Collaborative editing session | - |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/collab/start/:noteId` | POST | Start collaboration session |
| `POST /api/collab/join/:sessionId` | POST | Join existing session |
| `DELETE /api/collab/end/:sessionId` | DELETE | End collaboration session |
| `GET /api/collab/status/:sessionId` | GET | Get session status & participants |

## Data Models

### Collaboration Session Schema

```javascript
interface CollabSession {
  sessionId: string;           // UUIDv4
  noteId: string;             // Original note identifier
  websocketUrl: string;       // WebSocket endpoint
  ydoc: Y.Doc;               // Y.js document instance
  provider: WebsocketProvider; // WebSocket provider
  isHost: boolean;            // Session creator flag
  participants: string[];     // Array of participant IDs
  expiresAt: number;          // Unix timestamp (20 min TTL)
  createdAt: number;          // Session creation timestamp
}
```

### Redis Data Structure

```javascript
// Session metadata
collab:session:{sessionId} = {
  noteId: string,
  hostId: string,
  participants: string[],
  createdAt: number,
  expiresAt: number
}

// Y.js document state (binary)
collab:doc:{sessionId} = Y.Doc binary state

// Participant presence
collab:presence:{sessionId}:{participantId} = {
  name: string,
  color: string,
  cursor: object,
  lastSeen: number
}
```

## Backend Implementation Plan

### 1. New Dependencies Required

```json
{
  "dependencies": {
    "ws": "^8.14.2",                    // WebSocket server
    "y-websocket": "^1.5.0",           // Y.js WebSocket provider
    "yjs": "^13.6.10",                 // Y.js CRDT library
    "uuid": "^9.0.1",                  // UUIDv4 generation
    "@fastify/websocket": "^10.0.1"    // Fastify WebSocket support
  }
}
```

### 2. New Route Files

#### `src/routes/collaboration.js`
```javascript
const { v4: uuidv4 } = require('uuid');
const { collabStartSchema, collabJoinSchema, sessionIdSchema } = require('../schemas');
const redisClient = require('../utils/redis');
const { CollaborationManager } = require('../services/collaboration');

async function collaborationRoutes(fastify) {
  // POST /api/collab/start/:noteId
  fastify.post('/api/collab/start/:noteId', {
    schema: { params: { noteId: { type: 'string', pattern: '^[a-zA-Z0-9-_]+$' } } }
  }, async (request, reply) => {
    const { noteId } = request.params;
    const sessionId = uuidv4();
    
    // Create session in Redis with 20-minute TTL
    const session = {
      noteId,
      sessionId,
      hostId: request.ip, // or user ID if auth implemented
      participants: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + (20 * 60 * 1000) // 20 minutes
    };
    
    await redisClient.set(`collab:session:${sessionId}`, JSON.stringify(session), 1200);
    
    return {
      sessionId,
      websocketUrl: `ws://localhost:3000/collab/${sessionId}`,
      expiresAt: session.expiresAt
    };
  });

  // POST /api/collab/join/:sessionId
  fastify.post('/api/collab/join/:sessionId', {
    schema: { params: { sessionId: { type: 'string', format: 'uuid' } } }
  }, async (request, reply) => {
    const { sessionId } = request.params;
    
    // Validate session exists and not expired
    const sessionData = await redisClient.get(`collab:session:${sessionId}`);
    if (!sessionData) {
      return reply.status(404).send({ error: 'Session not found or expired' });
    }
    
    const session = JSON.parse(sessionData);
    if (Date.now() > session.expiresAt) {
      return reply.status(410).send({ error: 'Session expired' });
    }
    
    return {
      sessionId,
      websocketUrl: `ws://localhost:3000/collab/${sessionId}`,
      noteId: session.noteId
    };
  });

  // DELETE /api/collab/end/:sessionId
  fastify.delete('/api/collab/end/:sessionId', {
    schema: { params: { sessionId: { type: 'string', format: 'uuid' } } }
  }, async (request, reply) => {
    const { sessionId } = request.params;
    
    // Clean up session data
    await redisClient.del(`collab:session:${sessionId}`);
    await redisClient.del(`collab:doc:${sessionId}`);
    
    // Clean up presence data
    const keys = await redisClient.keys(`collab:presence:${sessionId}:*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    
    return { success: true };
  });
}

module.exports = collaborationRoutes;
```

### 3. WebSocket Server Implementation

#### `src/services/websocket.js`
```javascript
const WebSocket = require('ws');
const { CollaborationManager } = require('./collaboration');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/collab' });
    this.collabManager = new CollaborationManager();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.wss.on('connection', (ws, request) => {
      const sessionId = this.extractSessionId(request.url);
      if (!sessionId) {
        ws.close(1008, 'Invalid session ID');
        return;
      }

      this.collabManager.handleConnection(ws, sessionId);
    });
  }

  extractSessionId(url) {
    const match = url.match(/\/collab\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }
}

module.exports = { WebSocketServer };
```

#### `src/services/collaboration.js`
```javascript
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const redisClient = require('../utils/redis');

class CollaborationManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> { ydoc, provider, connections }
  }

  async handleConnection(ws, sessionId) {
    // Validate session exists
    const sessionData = await redisClient.get(`collab:session:${sessionId}`);
    if (!sessionData) {
      ws.close(1008, 'Session not found');
      return;
    }

    // Get or create Y.Doc for session
    let session = this.sessions.get(sessionId);
    if (!session) {
      const ydoc = new Y.Doc();
      const provider = new WebsocketProvider(ws, sessionId, ydoc);
      
      session = {
        ydoc,
        provider,
        connections: new Set()
      };
      this.sessions.set(sessionId, session);
    }

    session.connections.add(ws);
    
    // Handle WebSocket events
    ws.on('close', () => {
      session.connections.delete(ws);
      if (session.connections.size === 0) {
        this.cleanupSession(sessionId);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      session.connections.delete(ws);
    });
  }

  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.provider.destroy();
      this.sessions.delete(sessionId);
    }
  }
}

module.exports = { CollaborationManager };
```

### 4. Schema Updates

#### `src/schemas/index.js` (additions)
```javascript
const collabStartSchema = {
  type: 'object',
  required: ['noteId'],
  properties: {
    noteId: {
      type: 'string',
      pattern: '^[a-zA-Z0-9-_]+$',
      minLength: 1,
      maxLength: 100
    }
  }
};

const collabJoinSchema = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: {
      type: 'string',
      format: 'uuid'
    }
  }
};

const sessionIdSchema = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: {
      type: 'string',
      format: 'uuid'
    }
  }
};

module.exports = {
  shareSchema,
  shareIdSchema,
  collabStartSchema,
  collabJoinSchema,
  sessionIdSchema
};
```

### 5. Configuration Updates

#### `src/config/index.js` (additions)
```javascript
const config = {
  // ... existing config
  websocket: {
    path: '/collab',
    heartbeatInterval: 30000, // 30 seconds
    maxConnections: 100
  },
  collaboration: {
    sessionTTL: 1200, // 20 minutes in seconds
    maxParticipants: 10,
    cleanupInterval: 60000 // 1 minute
  }
};
```

## Security Considerations

### 1. Session Security
- **UUIDv4 Generation**: Cryptographically random session IDs
- **Time-Limited**: 20-minute automatic expiration
- **No Authentication**: Links are unguessable (low attack surface)
- **Rate Limiting**: Apply to collaboration endpoints

### 2. Input Validation
- **Session ID Format**: Strict UUIDv4 validation
- **Note ID Sanitization**: Alphanumeric + hyphens/underscores only
- **Content Limits**: Inherit from existing note validation

### 3. Redis Security
- **Key Namespacing**: `collab:session:`, `collab:doc:`, `collab:presence:`
- **TTL Enforcement**: Automatic cleanup prevents data leakage
- **Connection Limits**: Prevent resource exhaustion

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add WebSocket support to Fastify
2. Implement basic collaboration routes
3. Set up Redis data structures
4. Add schema validation

### Phase 2: Y.js Integration
1. Implement Y.js document management
2. Set up WebSocket provider
3. Add presence awareness
4. Implement session cleanup

### Phase 3: Advanced Features
1. Add heartbeat/ping mechanism
2. Implement participant management
3. Add session expiration warnings
4. Optimize memory usage

### Phase 4: Testing & Optimization
1. Load testing with multiple sessions
2. Memory leak detection
3. Performance optimization
4. Error handling improvements

## Monitoring & Observability

### Metrics to Track
- Active collaboration sessions
- WebSocket connections per session
- Session duration and completion rates
- Redis memory usage for collaboration data
- WebSocket connection errors

### Logging
```javascript
// Session lifecycle events
fastify.log.info({ sessionId, noteId, action: 'session_created' });
fastify.log.info({ sessionId, participantId, action: 'participant_joined' });
fastify.log.info({ sessionId, action: 'session_expired' });

// WebSocket events
fastify.log.info({ sessionId, connectionCount, action: 'connection_established' });
fastify.log.error({ sessionId, error, action: 'websocket_error' });
```

## Testing Strategy

### Unit Tests
- Route handlers for collaboration endpoints
- Session validation logic
- Redis operations
- Schema validation

### Integration Tests
- WebSocket connection flow
- Y.js document synchronization
- Session cleanup mechanisms
- Error handling scenarios

### Load Tests
- Multiple concurrent sessions
- High participant counts per session
- Memory usage under load
- Redis performance with large datasets

## Deployment Considerations

### Environment Variables
```bash
# Existing
REDIS_URL=redis://your-redis-instance
PORT=3000

# New
WEBSOCKET_PATH=/collab
COLLAB_SESSION_TTL=1200
MAX_PARTICIPANTS_PER_SESSION=10
```

### Redis Configuration
- Ensure sufficient memory for temporary collaboration data
- Configure appropriate eviction policies
- Monitor memory usage patterns

### WebSocket Considerations
- Configure reverse proxy for WebSocket support
- Set appropriate connection timeouts
- Monitor connection limits

## Future Enhancements

### Potential Features
1. **Authentication Integration**: Optional user authentication for collaboration
2. **Session Persistence**: Save collaboration history
3. **Conflict Resolution**: Advanced merge strategies
4. **Mobile Support**: Optimize for mobile collaboration
5. **Offline Support**: Handle network interruptions gracefully

### Scalability Improvements
1. **Redis Clustering**: Distribute collaboration data
2. **WebSocket Scaling**: Multiple server instances
3. **CDN Integration**: Optimize for global users
4. **Caching Strategies**: Reduce Redis load

---

## Summary

This architecture provides a secure, privacy-respecting, and scalable collaboration system that:

- ✅ Maintains local-first data principles
- ✅ Enables temporary, real-time collaboration
- ✅ Uses unguessable session IDs for security
- ✅ Implements automatic session cleanup
- ✅ Provides clear separation between solo and collaborative modes
- ✅ Scales efficiently with Redis and WebSocket technology
- ✅ Integrates seamlessly with existing codebase structure

The implementation follows the existing patterns in the codebase while adding powerful collaboration capabilities that respect user privacy and data ownership.
