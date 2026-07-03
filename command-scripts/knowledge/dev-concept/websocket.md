# WebSocket Design Patterns

## Key Principles
- WebSocket is a persistent, bidirectional channel — use only when you need server-initiated push
- Always authenticate on connect (handshake), not after — unauthenticated sockets are attack surface
- Design for disconnection: clients WILL drop, networks WILL fail, deploys WILL restart
- Group-based messaging over broadcast — never send to all when you mean a subset

## When to Use
| Pattern | Use When |
|---------|----------|
| **WebSocket** | Bidirectional, low-latency, frequent updates (chat, live scores) |
| **SSE** | Server-push only, moderate frequency, simpler infra (notifications) |
| **Polling** | Infrequent updates (>30s), simplicity priority, no WS infra budget |

## Decision Guide
1. Client sends data in real time? -> WebSocket
2. Server-push only, <1 msg/sec? -> SSE (fewer moving parts)
3. Need to scale beyond 1 server? -> Redis channel layer is mandatory

## Code Smells
```python
# BAD: No auth on connect
async def connect(self):
    await self.accept()  # Anyone can connect
# GOOD: Auth during handshake
async def connect(self):
    if self.scope["user"].is_anonymous:
        await self.close(code=4401); return
    await self.accept()
```
```python
# BAD: Broadcast to all instead of groups
await self.channel_layer.send(self.channel_name, event)
# GOOD: Group-based messaging
await self.channel_layer.group_send(f"match_{match_id}", {"type": "match.update", "data": payload})
```
```javascript
// BAD: No reconnection logic — dies silently
const ws = new WebSocket(url);
// GOOD: Reconnect with exponential backoff
function connect(n = 0) {
  const ws = new WebSocket(url);
  ws.onclose = () => setTimeout(() => connect(n + 1), Math.min(1000 * 2 ** n, 30000));
}
```

## Common Mistakes
- Missing heartbeat/ping-pong: load balancers kill idle connections (~60s timeout)
- No `group_discard` on disconnect: leaked memberships, messages to dead channels
- Sync ORM calls inside async consumers: blocks the event loop
- `InMemoryChannelLayer` in production: zero cross-process communication

## Stack Hints (Django Channels + Redis)
- `channels[daphne]` + `channels_redis` for channel layer
- Set `capacity` on Redis channel layer (default 100) to prevent backpressure crashes
- Use `AsyncWebsocketConsumer` — sync consumer blocks event loop
- Nginx: `proxy_read_timeout 86400s` + `proxy_set_header Upgrade $http_upgrade`

## Stack Hints (Spring / Kotlin)
```kotlin
// Spring WebSocket with STOMP
@Configuration @EnableWebSocketMessageBroker
class WebSocketConfig : WebSocketMessageBrokerConfigurer {
    override fun registerStompEndpoints(registry: StompEndpointRegistry) {
        registry.addEndpoint("/ws").setAllowedOrigins("*").withSockJS()
    }
    override fun configureMessageBroker(config: MessageBrokerRegistry) {
        config.enableSimpleBroker("/topic", "/queue")  // or use RabbitMQ/Redis broker relay
        config.setApplicationDestinationPrefixes("/app")
    }
}

// Auth on handshake via interceptor
class AuthHandshakeInterceptor(private val tokenService: TokenService) : HandshakeInterceptor {
    override fun beforeHandshake(req: ServerHttpRequest, resp: ServerHttpResponse,
                                  handler: WebSocketHandler, attrs: MutableMap<String, Any>): Boolean {
        val token = (req as ServletServerHttpRequest).servletRequest.getParameter("token")
        val user = tokenService.validate(token) ?: return false
        attrs["user"] = user
        return true
    }
}

// Group messaging via SimpMessagingTemplate
@Service
class MatchLiveService(private val messaging: SimpMessagingTemplate) {
    fun broadcastUpdate(matchId: Long, update: MatchUpdate) {
        messaging.convertAndSend("/topic/match/$matchId", update)
    }
}

// @MessageMapping for client → server
@Controller
class MatchController {
    @MessageMapping("/match/{matchId}/action")
    @SendTo("/topic/match/{matchId}")
    fun handleAction(@DestinationVariable matchId: Long, action: PlayerAction): MatchUpdate { /* ... */ }
}
// Scale: spring.rabbitmq.stomp.relay for multi-instance broker relay
```
