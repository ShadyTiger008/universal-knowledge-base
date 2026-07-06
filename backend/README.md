# Universal Knowledge Assistant - Backend

The backend engine is a NestJS application orchestrating document processing, vector indexing, caching, and chat interfaces. It processes multi-format documents asynchronously using background queues, indexes text chunks into Qdrant, and runs a cache-aside RAG retrieval flow using Google Gemini.

---

## Technical Architecture & Core Features

### 1. Ingestion Pipeline
* **Asynchronous Queueing**: Document uploads are parsed on background worker threads using **BullMQ** and **Redis**. The HTTP thread responds instantly with `202 Accepted` and a `jobId`.
* **State Updates**: Progress is tracked in PostgreSQL and reported to users at milestones: `PARSING` (25%), `CHUNKING` (50%), `EMBEDDING` (75%), and `INDEXING` (90%).
* **Temporary File Cleanup**: Files uploaded via Telegram or HTTP are saved locally in `public/uploads/temp` and deleted immediately after processing to prevent disk leaks.

### 2. Multi-Channel Communication strategy
* **Dynamic Provider Registry (`CommunicationRegistryService`)**: Resolves strategy classes dynamically at runtime. It checks the database table `bot_configs` for active API tokens, falling back to `.env` variables if none exist.
* **Connectors**:
  * **Telegram Bot**: Operates via long-polling (`getUpdates`). Registers new users in DB, displays typing status, downloads user-submitted files (PDF, Excel, CSV, DOCX, Markdown, TXT), pushes them into the ingestion queue, and delivers RAG answers. Includes auto-fallback: if sending strict Markdown v2 fails, it falls back to plain-text formatting.
  * **Discord**: Strategy skeleton integrated into registry for sending channel events.
  * **WhatsApp**: Strategy skeleton integrated into registry.
  * **Custom UI (Web)**: Push/SSE notifications dispatcher for the frontend dashboard.

### 3. Smart Caching & Error Avoidance
* **Cache-Aside Architecture**: Chat response caching uses versioned cache keys linked to the user's active document list. Ingestion of a new document automatically invalidates old cache keys.
* **Error Prevention**: Transient API quota/rate-limit error responses from Gemini are **not** cached in Redis.
* **Startup Flush**: All stale `chat:response:*` keys are automatically flushed from Redis on application boot.

### 4. Resilient LLM Architecture (Fault-Tolerant Failover)
* **Unified Provider Interface**: All LLM integrations (Gemini, Groq, OpenRouter, and Ollama) are abstracted behind a unified `LlmProvider` interface, allowing the rest of the application to execute queries without caring which provider answers.
* **Fallback Priority Chain**:
  ```
  Primary: Gemini ──► Fallback 1: Groq ──► Fallback 2: OpenRouter ──► Fallback 3: Ollama (Local)
  ```
* **Error Classification**:
  * **Transient (Retryable)**: Network timeouts, DNS failures, HTTP 429 (Rate Limit/Quota), and HTTP 5xx (Server Error) trigger up to 3 attempts with exponential backoff and randomized jitter (to avoid concurrent stampedes).
  * **Critical (Fail-Fast)**: HTTP 400 (Client Request Error), HTTP 401/403 (Auth/Unauthorized), and JSON syntax errors immediately bypass retries and failover to the next active provider in the chain.

---

## Environment Variables (.env)

Create a `.env` file in the `backend` directory:

```ini
PORT=3000

# PostgreSQL Connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/universal_knowledge_assistant?schema=public"

# JWT Auth Secret
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN=7d

# Google Gemini API (Primary)
GOOGLE_API_KEY="your-gemini-api-key"
GEMINI_LLM_MODEL="gemini-flash-latest"

# Groq (Fallback 1)
GROQ_API_KEY="your-groq-api-key"
GROQ_LLM_MODEL="llama-3.3-70b-versatile"

# OpenRouter (Fallback 2)
OPENROUTER_API_KEY="your-openrouter-api-key"
OPENROUTER_LLM_MODEL="google/gemini-2.5-flash"

# Ollama (Fallback 3 - Local)
OLLAMA_HOST="http://localhost:11434"
OLLAMA_LLM_MODEL="llama3"

# Qdrant Vector DB
QDRANT_CLUSTER_ENDPOINT="https://your-qdrant-endpoint"
QDRANT_API_KEY="your-qdrant-key"

# Redis & BullMQ
REDIS_URL="redis://localhost:6379"

# Telegram Bot Token fallback
TELEGRAM_BOT_TOKEN="your-telegram-token"

# Dev / Testing Flags
USE_MOCK_LLM=false
USE_MOCK_EMBEDDINGS=false
```

---

## Running the Backend

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Apply Database Schema**:
   ```bash
   npx prisma db push
   ```
3. **Start Development Server**:
   ```bash
   npm run start:dev
   ```
4. **Monitor Queues**:
   Open `http://localhost:3000/api/queues/` to view the Bull Board dashboard for tracking background jobs.
