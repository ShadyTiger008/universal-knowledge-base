# Universal Knowledge Assistant

A production-grade, asynchronous Retrieval-Augmented Generation (RAG) pipeline built with **NestJS**, **BullMQ**, **Redis (Upstash)**, **Prisma (PostgreSQL)**, **Qdrant (Vector Database)**, and **Google Gemini (LLM & Embeddings)**. 

The Universal Knowledge Assistant is designed to ingest multi-format documents (PDF, Excel, CSV, Word, Markdown, Text) in a decoupled, non-blocking background queue, store and index text chunks as high-dimensional vectors, and retrieve contextually relevant information to provide rate-limit-resilient answers.

---

## Getting Started

### Prerequisites

Ensure you have the following installed and running:
* **Node.js** (v18 or higher)
* **PostgreSQL** (local or hosted instance)
* **Redis** (Upstash Redis is recommended for cloud-based serverless deployment; local Redis is suitable for local development)
* **Qdrant** (local container or Qdrant Cloud cluster)
* **Google Gemini API Key** (from Google AI Studio)

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd universal-knowledge-assistant
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

### Configuration

Create a `.env` file in the project root by copying the template file:
```bash
cp .env.example .env
```

Configure the environment variables in `.env`:

```ini
PORT=3000

# Relational Database Connection (Prisma)
DATABASE_URL="postgresql://postgres:password@localhost:5432/universal_knowledge_assistant?schema=public"

# JSON Web Token Secret Configuration
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN=7d

# Telegram Notification Bot Integration (Optional)
TELEGRAM_BOT_TOKEN="your-telegram-bot-token"

# Supabase Storage & Configuration (Optional)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
SUPABASE_SECRET_KEY="your-secret-key"
SUPABASE_JWKS_URL="https://your-project-id.supabase.co/auth/v1/.well-known/jwks.json"

# Google Gemini API Key
GOOGLE_API_KEY="your-google-ai-studio-api-key"

# Qdrant Vector DB Configuration
QDRANT_API_KEY="your-qdrant-api-key"
QDRANT_CLUSTER_ENDPOINT="https://your-cluster-endpoint.qdrant.io"
SIMILARITY_THRESHOLD=0.60
QDRANT_UPSERT_BATCH_SIZE=100

# Redis & BullMQ Queue Configuration (Supports SSL/TLS for Upstash via rediss://)
REDIS_URL="redis://localhost:6379"

# Debug / Mocks Options
USE_MOCK_EMBEDDINGS=false
USE_MOCK_LLM=false
```

### Running the Application

1. **Prisma DB Sync**: Apply database migrations and seed schemas.
   ```bash
   npx prisma db push
   ```

2. **Start Development Server**: Start the NestJS runtime (both the HTTP API server and the BullMQ background workers will initialize within the same process).
   ```bash
   npm run start:dev
   ```

3. **Queue Monitoring Dashboard**: Access the interactive **Bull Board** UI at `http://localhost:3000/queues` to track background document ingestion jobs, failures, and worker performance in real-time.

---

## High-Level Design

The system is split into two primary asynchronous workflows: **Document Ingestion** (Write Path) and **Contextual Querying** (Read Path).

```mermaid
graph TD
    %% Write Path (Ingestion)
    Client[Client / Bot / Web] -->|1. Upload Doc| API[DocumentsController]
    API -->|2. Register job & doc| DB[(PostgreSQL DB)]
    API -->|3. Push ingestion job| Queue[(BullMQ Queue)]
    API -->|4. Immediate 202 Accepted| Client
    
    Queue -->|5. Dequeue job| Worker[DocumentIngestionProcessor]
    Worker -->|6. Load temp file| FS[Local Upload Storage]
    Worker -->|7. Parse & clean text| CleanService[Parser & Text Cleaner]
    Worker -->|8. Generate chunks| ChunkService[Chunking Service]
    Worker -->|9. Generate embeddings| EmbedService[Gemini Embedding Provider]
    Worker -->|10. Upsert points| VectorDB[(Qdrant Vector DB)]
    Worker -->|11. Mark job READY| DB
    Worker -->|12. Clean temp file| FS
    Worker -->|13. Send Notification| Channels[Telegram / Discord / Web UI]
    
    %% Read Path (RAG Query)
    Client2[User / Bot] -->|1. Query| ChatAPI[ChatController]
    ChatAPI -->|2. Check answer cache| Cache[(Redis Cache)]
    Cache -->|Cache Hit| ReturnCache[Return cached response]
    Cache -->|Cache Miss| ChatService[ChatService]
    
    ChatService -->|3. Check embed cache| Cache
    Cache -->|Cache Hit| Vector[Cached Vector]
    Cache -->|Cache Miss| GeminiEmbed[Gemini Embedding API]
    GeminiEmbed -->|4. Cache vector| Cache
    
    ChatService -->|5. Vector Search| VectorDB
    VectorDB -->|6. Retrieve contexts| ChatService
    ChatService -->|7. Build context prompt| PromptBuilder[PromptBuilderService]
    ChatService -->|8. Request LLM answer| GeminiLLM[Gemini LLM]
    ChatService -->|9. Save history| DB
    ChatService -->|10. Cache response| Cache
    ChatService -->|11. Return Answer| Client2
```

---

## Low-Level Design & Component Specification

### 1. Asynchronous Ingestion Engine (BullMQ & Redis)
* **`DocumentsService` (Producer)**: Receives file uploads via Multer. Instead of parsing the document on the HTTP thread, it creates a Postgres `Document` record in `UPLOADING` state and pushes a task containing metadata and the temporary file path onto the `document-ingestion` queue. It immediately returns a `202 Accepted` response with the `jobId` so clients don't block.
* **`DocumentIngestionProcessor` (Consumer)**: Dequeues job data, updating the database status sequentially (`PARSING` at 25%, `CHUNKING` at 50%, `EMBEDDING` at 75%, `INDEXING` at 90%). Once Qdrant indexes the chunks, the database state updates to `READY` (or `FAILED` in case of error). It deletes the temporary local file in a `finally` block to prevent disk leakage.

### 2. Dual-Layer Caching (Redis & `ioredis`)
* **Embedding Caching**: Generates a stable key based on the question hash (`embedding:md5(model:question)`). This eliminates redundant API calls and rate-limit exhaustion for identical or frequent semantic queries.
* **Response Caching**: Chat response payloads are stored under keys reflecting the context variables (`chat:response:md5(question:userId:documentId:topK)`). Cached replies are returned within milliseconds. If a cached answer is hit for a logged-in user, the assistant response is still backfilled into PostgreSQL database messages so that chat histories remain contiguous.

### 3. Unified Notification Router (`NotificationService`)
* Connects the background worker's life cycle events back to active user sessions.
* Routes ingestion success/failure notifications to:
  * **Telegram**: Invokes the `TelegramService` client using the user's mapped `platformUserId`.
  * **Discord / Web UI**: Mapped dynamic console or WebSocket channels depending on client configuration.

### 4. Vector Store Strategy (Qdrant)
* Chunks are stored in Qdrant with deterministic UUIDs derived from their parent document identity and chunk indices (`chunk_{documentId}_{chunkIndex}`) hashed into a UUIDv4-compliant schema.
* Document payloads store metadata keys (`userId`, `documentId`, `documentName`, `sourceType`, `sheetName`, `rowNumber`, `section`) enabling runtime retrieval filtering.

---

## API Documentation

### Document Upload
* **Endpoint**: `POST /documents/upload`
* **Content-Type**: `multipart/form-data`
* **Body**:
  * `file`: Binary file (PDF, Excel, Word, CSV, Markdown, Text)
  * `userId`: Mapped User ID from Postgres
* **Response (201 Created / 202 Accepted)**:
  ```json
  {
    "documentId": "uuid-string-here",
    "jobId": "uuid-string-here",
    "filename": "annual-report.pdf",
    "status": "UPLOADING",
    "progress": 0,
    "message": "Your document upload is complete and is now being processed in the background. You can check the status using the /documents/status/:jobId endpoint."
  }
  ```

### Check Ingestion Status
* **Endpoint**: `GET /documents/status/:jobId`
* **Response (200 OK)**:
  ```json
  {
    "jobId": "uuid-string-here",
    "documentId": "uuid-string-here",
    "filename": "annual-report.pdf",
    "status": "EMBEDDING",
    "progress": 75,
    "error": null,
    "createdAt": "2026-07-06T12:00:00.000Z"
  }
  ```

### Chat / Ask Question
* **Endpoint**: `POST /chat/query`
* **Body**:
  ```json
  {
    "question": "Is Altiora a sole proprietorship?",
    "userId": "user-uuid-here",
    "documentId": "optional-document-uuid-filter",
    "topK": 5
  }
  ```
* **Response (200 OK)**:
  * Includes the LLM-generated `answer`, context `sources`, similarity scores, and detailed retrieval metrics.
