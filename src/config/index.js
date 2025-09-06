require('dotenv').config();

const config = {
    server: {
        port: Number(process.env.PORT) || 3000,
        host: '0.0.0.0',
        logger: {
            level: 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
                req: (req) => ({
                    method: req.method,
                    url: req.url,
                    hostname: req.hostname,
                    remoteAddress: req.ip,
                    remotePort: req.socket?.remotePort,
                    reqId: req.id
                }),
                res: (res) => ({
                    statusCode: res.statusCode,
                    reqId: res.request?.id
                })
            }
        }
    },
    redis: {
        url: process.env.REDIS_URL
    },
    cors: {
        origin: ['https://zen.mrinmay.dev', 'https://mrinmay.dev'],
        methods: ['GET', 'POST', 'OPTIONS'],
        credentials: false
    },
    rateLimit: {
        max: 10, // 10 requests per minute
        timeWindow: '1 minute',
        errorResponseBuilder: function (request, context) {
            return {
                code: 429,
                error: 'Rate limit exceeded',
                message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds.`
            };
        }
    }
};

module.exports = config;
