# HoliAI - Backend

This is the Fastify and BullMQ backend worker for **HoliAI**. It securely manages API keys, parses dynamic LLM models, and powers the **Autonomous Self-Evolving AI Persona**.

### Key Backend Capabilities
- **Autonomous Tool-Calling**: Implements a robust multi-turn execution loop allowing the LLM to autonomously trigger database tools (fetching Garmin data, plans, memories) only when context is strictly required, drastically preventing token bloat.
- **Local RAG & Embeddings**: Uses the raw ONNX runtime to locally embed conversations via `all-MiniLM-L6-v2`, performing highly-accurate semantic searches via `pgvector` in PostgreSQL.
- **Language Cognition Directives**: The backend router dynamically constructs absolute LLM constraints (`langRule`) before appending messages to the Redis Queue, forcing the AI to strictly output and reason in either English or Czech based on frontend UI state.
- **Background Autonomy**: Built-in NodeJS cron workers process offline tasks, heartbeat telemetry evaluations, and dynamic alarms.
- **Hybrid Context Engineering**: Extracts and pre-loads user facts natively into the LLM system prompt, effectively negating hallucinatory recursive tool-fetching loops.
- **Redis Write-Through Caching**: A decoupled caching layer that securely persists backend configurations and eliminates Supabase/Neon database query bottlenecks.

**Please refer to the root [README.md](../README.md) in the parent directory for complete SaaS architecture details, BYOK key management, and comprehensive deployment instructions (Vercel, Render, Docker, and Capacitor Mobile App).**
