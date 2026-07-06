# Universal Knowledge Assistant (Monorepo)

A production-grade, asynchronous Retrieval-Augmented Generation (RAG) platform consisting of a **Next.js Frontend** and a **NestJS Backend Service** integrated with BullMQ, Redis, PostgreSQL (Prisma), Qdrant Vector DB, and Google Gemini API.

---

## Project Directory Structure

The repository is structured as a monorepo containing:
* **[backend/](file:///c:/Development/Personal/unviersal-knowledge-assistant/backend)**: The NestJS API server, background ingestion queue worker, database connections, and external service connectors (Telegram, Discord, WhatsApp, and Custom UI).
* **[frontend/](file:///c:/Development/Personal/unviersal-knowledge-assistant/frontend)**: A Next.js Web UI dashboard built with React and Tailwind CSS.

---

## High-Level Architecture & Workflows

The platform operates on two separate decoupled workflows: **Document Ingestion** (Write Path) and **Contextual Querying** (Read Path).

* **Resilient Multi-Provider LLM Engine**: The contextual query path and the query router use a decoupled orchestrator (`LlmService`) implementing a priority fallback pipeline. If any provider experiences rate limits (HTTP 429), timeouts, or server errors, it retries with exponential backoff and randomized jitter before gracefully failing over (Gemini ➔ Groq ➔ OpenRouter ➔ Ollama).

```mermaid
graph TD
    %% Write Path (Ingestion)
    Client[Client / Bot / Web] -->|1. Upload Doc| API[backend/DocumentsController]
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
    Client2[User / Bot] -->|1. Query| ChatAPI[backend/ChatController]
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
    ChatService -->|8. Request LLM answer| LlmService[Resilient LlmService]
    LlmService -->|Gemini (Primary)| GeminiAPI[Gemini API]
    LlmService -->|Failover 1| GroqAPI[Groq API]
    LlmService -->|Failover 2| OpenRouterAPI[OpenRouter API]
    LlmService -->|Failover 3| OllamaAPI[Ollama (Local)]
    LlmService -->|9. Selected Answer| ChatService
    ChatService -->|10. Save history| DB
    ChatService -->|11. Cache response| Cache
    ChatService -->|12. Return Answer| Client2
```

---

## Quick Start (Running Locally)

### Prerequisites

You need the following services set up:
* **Node.js** (v18 or higher)
* **PostgreSQL** Database
* **Redis** (Local or Upstash)
* **Qdrant** Vector DB (Local container or Qdrant Cloud)
* **Google Gemini API Key**

---

### Step 1: Run the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Copy the template `.env.example` to `.env` and fill in the secrets (Database URL, Redis URL, Gemini API, Qdrant cluster endpoint, etc.).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Sync database schemas and run migrations:
   ```bash
   npx prisma db push
   ```
5. Start the backend NestJS server:
   ```bash
   npm run start:dev
   ```
   * *The backend API will run on `http://localhost:3000` (or `PORT` configured in `.env`).*
   * *The Bull Board job monitoring dashboard will be accessible at `http://localhost:3000/api/queues/`.*

---

### Step 2: Run the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Copy the template `.env.example` to `.env` and configure `NEXT_PUBLIC_API_URL` to point to the backend API (`http://localhost:3000/api`).
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
   * *The frontend app will run on `http://localhost:3001` (or next free port, typically `http://localhost:3000` if the backend is hosted on a different port or system).*
