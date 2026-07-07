import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './common/redis/redis.service';
import { QdrantService } from './common/qdrant/qdrant.service';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

@Controller()
export class AppController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly qdrantService: QdrantService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html')
  getHome(): string {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Universal Knowledge Assistant | API Service</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #090d16;
      --card-bg: rgba(17, 24, 39, 0.7);
      --card-border: rgba(255, 255, 255, 0.06);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #8b5cf6;
      --primary-glow: rgba(139, 92, 246, 0.15);
      --secondary: #06b6d4;
      --secondary-glow: rgba(6, 182, 212, 0.15);
      --accent: #10b981;
      --font-title: 'Outfit', sans-serif;
      --font-body: 'Plus Jakarta Sans', sans-serif;
      --font-mono: 'Fira Code', monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: var(--font-body);
      line-height: 1.6;
      overflow-x: hidden;
      position: relative;
    }

    /* Background glow decorations */
    body::before {
      content: "";
      position: absolute;
      top: -10%;
      left: -10%;
      width: 50%;
      height: 50%;
      background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
      z-index: -1;
      filter: blur(80px);
    }

    body::after {
      content: "";
      position: absolute;
      bottom: -10%;
      right: -10%;
      width: 50%;
      height: 50%;
      background: radial-gradient(circle, var(--secondary-glow) 0%, transparent 70%);
      z-index: -1;
      filter: blur(80px);
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header {
      text-align: center;
      margin-bottom: 60px;
      position: relative;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.2);
      color: #a78bfa;
      margin-bottom: 20px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      box-shadow: 0 0 20px rgba(139, 92, 246, 0.05);
    }

    h1 {
      font-family: var(--font-title);
      font-size: 3rem;
      font-weight: 700;
      line-height: 1.2;
      background: linear-gradient(135deg, #ffffff 30%, #a78bfa 70%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }

    .subtitle {
      font-size: 1.2rem;
      color: var(--text-muted);
      max-width: 700px;
      margin: 0 auto 30px auto;
      font-weight: 300;
    }

    .nav-links {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 0.95rem;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%);
      color: white;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(139, 92, 246, 0.45);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(10px);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
    }

    /* Grid Layout */
    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 30px;
      margin-bottom: 60px;
    }

    @media (min-width: 768px) {
      .grid {
        grid-template-columns: 2fr 1fr;
      }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 30px;
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      transition: border-color 0.3s ease;
    }

    .card:hover {
      border-color: rgba(139, 92, 246, 0.2);
    }

    .card-title {
      font-family: var(--font-title);
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: white;
    }

    .card-title svg {
      color: var(--primary);
    }

    /* Steps list styling */
    .flow-steps {
      list-style: none;
      position: relative;
    }

    .flow-steps li {
      position: relative;
      padding-left: 40px;
      margin-bottom: 24px;
    }

    .flow-steps li::before {
      content: "";
      position: absolute;
      left: 14px;
      top: 24px;
      bottom: -20px;
      width: 2px;
      background: rgba(255, 255, 255, 0.06);
    }

    .flow-steps li:last-child::before {
      display: none;
    }

    .flow-step-num {
      position: absolute;
      left: 0;
      top: 2px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(139, 92, 246, 0.1);
      border: 1px solid rgba(139, 92, 246, 0.3);
      color: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      font-weight: bold;
    }

    .flow-step-title {
      font-weight: 600;
      color: white;
      margin-bottom: 4px;
    }

    .flow-step-desc {
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    /* Endpoint list styling */
    .endpoint-item {
      display: flex;
      flex-direction: column;
      padding: 16px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      margin-bottom: 12px;
      transition: all 0.2s ease;
    }

    .endpoint-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.08);
      transform: translateX(4px);
    }

    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .method {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .method-get { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.2); }
    .method-post { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2); }

    .path {
      font-family: var(--font-mono);
      font-weight: 500;
      color: #e5e7eb;
      font-size: 0.95rem;
    }

    .endpoint-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    /* System Stats Grid */
    .stats-container {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-top: 10px;
    }

    .stat-box {
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      padding: 16px;
      border-radius: 12px;
      text-align: center;
    }

    .stat-value {
      font-family: var(--font-mono);
      font-size: 1.1rem;
      font-weight: bold;
      color: var(--secondary);
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Footer styling */
    footer {
      text-align: center;
      margin-top: 80px;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 40px;
    }

    .tech-stack {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .tech-badge {
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">API Engine Live</div>
      <h1>Universal Knowledge Assistant</h1>
      <p class="subtitle">A production-grade, asynchronous Retrieval-Augmented Generation (RAG) backend engine powering high-performance knowledge bases.</p>
      
      <div class="nav-links">
        <a href="/api/docs" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
          Swagger Docs
        </a>
        <a href="/api/queues" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>
          BullMQ Monitor
        </a>
        <a href="/health" class="btn btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
          System Health
        </a>
      </div>
    </header>

    <div class="grid">
      <!-- Main Content Card (Architecture Workflows) -->
      <div class="card">
        <div class="card-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          How It Works (System Workflows)
        </div>
        
        <div style="margin-bottom: 30px;">
          <h3 style="color: white; margin-bottom: 12px; font-weight: 600;">1. Write Path: Document Ingestion</h3>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 20px;">
            Uploading files initiates an asynchronous ingestion job:
          </p>
          <ul class="flow-steps">
            <li>
              <div class="flow-step-num">1</div>
              <div class="flow-step-title">Upload & Register</div>
              <div class="flow-step-desc">Documents are uploaded to the API, registered in PostgreSQL, and pushed as a job payload into BullMQ (Redis-backed).</div>
            </li>
            <li>
              <div class="flow-step-num">2</div>
              <div class="flow-step-title">Clean & Segment</div>
              <div class="flow-step-desc">A background queue worker cleans text (normalizing spaces/characters) and splits it into semantic, overlapping chunks.</div>
            </li>
            <li>
              <div class="flow-step-num">3</div>
              <div class="flow-step-title">Embed & Store</div>
              <div class="flow-step-desc">Each chunk is converted to a vector using the Gemini API embedding model and upserted into the Qdrant Vector database.</div>
            </li>
          </ul>
        </div>

        <div>
          <h3 style="color: white; margin-bottom: 12px; font-weight: 600;">2. Read Path: Contextual Querying</h3>
          <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 20px;">
            Answering queries using semantic vector lookup and a resilient LLM chain:
          </p>
          <ul class="flow-steps">
            <li>
              <div class="flow-step-num">1</div>
              <div class="flow-step-title">Vector Search</div>
              <div class="flow-step-desc">The query is embedded and compared against stored document vectors in Qdrant to retrieve the top relevant paragraphs.</div>
            </li>
            <li>
              <div class="flow-step-num">2</div>
              <div class="flow-step-title">Priority Fallback Chain</div>
              <div class="flow-step-desc">A custom orchestrator sends the query and context to Gemini (primary). If rate limits (429) or timeouts occur, it falls back: Gemini ➔ Groq ➔ OpenRouter ➔ Ollama.</div>
            </li>
            <li>
              <div class="flow-step-num">3</div>
              <div class="flow-step-title">Respond & Cache</div>
              <div class="flow-step-desc">The answer is saved to chat history in PostgreSQL, cached in Redis for fast future retrieval, and returned to the client.</div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Sidebar Card (API Routes & System Info) -->
      <div style="display: flex; flex-direction: column; gap: 30px;">
        <div class="card">
          <div class="card-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
            Key API Routes
          </div>
          
          <div class="endpoint-item">
            <div class="endpoint-header">
              <span class="method method-get">GET</span>
              <span class="path">/health</span>
            </div>
            <div class="endpoint-desc">Backend health & subsystem dependency statuses.</div>
          </div>
          
          <div class="endpoint-item">
            <div class="endpoint-header">
              <span class="method method-post">POST</span>
              <span class="path">/api/chat/query</span>
            </div>
            <div class="endpoint-desc">Run RAG queries against ingested files.</div>
          </div>

          <div class="endpoint-item">
            <div class="endpoint-header">
              <span class="method method-post">POST</span>
              <span class="path">/api/documents/upload</span>
            </div>
            <div class="endpoint-desc">Upload files for background queue processing.</div>
          </div>

          <div class="endpoint-item">
            <div class="endpoint-header">
              <span class="method method-get">GET</span>
              <span class="path">/api/docs</span>
            </div>
            <div class="endpoint-desc">Swagger interactive API explorer.</div>
          </div>

          <div class="endpoint-item">
            <div class="endpoint-header">
              <span class="method method-get">GET</span>
              <span class="path">/api/queues</span>
            </div>
            <div class="endpoint-desc">Bull Board UI to monitor backgrounds queues.</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            System Info
          </div>
          <div class="stats-container">
            <div class="stat-box">
              <div class="stat-value">${process.version}</div>
              <div class="stat-label">Node</div>
            </div>
            <div class="stat-box">
              <div class="stat-value">${formatUptime(process.uptime())}</div>
              <div class="stat-label">Uptime</div>
            </div>
            <div class="stat-box">
              <div class="stat-value" style="color: var(--accent);">${process.platform}</div>
              <div class="stat-label">Platform</div>
            </div>
            <div class="stat-box">
              <div class="stat-value" style="color: var(--accent);">${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB</div>
              <div class="stat-label">RSS RAM</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer>
      <p>Universal Knowledge Assistant Monorepo Core Service</p>
      <div class="tech-stack">
        <span class="tech-badge">NestJS</span>
        <span class="tech-badge">Next.js</span>
        <span class="tech-badge">PostgreSQL</span>
        <span class="tech-badge">Prisma</span>
        <span class="tech-badge">Redis</span>
        <span class="tech-badge">BullMQ</span>
        <span class="tech-badge">Qdrant DB</span>
        <span class="tech-badge">Gemini LLM</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
    return html;
  }

  @Get('health')
  async getHealth() {
    const status: Record<string, any> = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'universal-knowledge-assistant-backend',
      uptimeSeconds: process.uptime(),
      description: 'System check for databases, cache queues, and external engines.',
    };

    const details: Record<string, any> = {};
    let overallHealthy = true;

    // 1. Database check
    try {
      const start = Date.now();
      await this.prismaService.$queryRaw`SELECT 1`;
      details.database = {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      overallHealthy = false;
      details.database = {
        status: 'down',
        error: err.message,
      };
    }

    // 2. Redis check
    try {
      const start = Date.now();
      const redisClient = this.redisService.getClient();
      if (!redisClient) {
        throw new Error('Redis client not available');
      }
      await redisClient.ping();
      details.redis = {
        status: 'up',
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      overallHealthy = false;
      details.redis = {
        status: 'down',
        error: err.message,
      };
    }

    // 3. Qdrant check
    try {
      const qdrantHealth = await this.qdrantService.checkHealth();
      details.qdrant = qdrantHealth;
      if (qdrantHealth.status === 'down') {
        overallHealthy = false;
      }
    } catch (err) {
      overallHealthy = false;
      details.qdrant = {
        status: 'down',
        error: err.message,
      };
    }

    status.status = overallHealthy ? 'healthy' : 'degraded';
    status.details = details;

    // Configuration status
    status.config = {
      databaseUrl: !!process.env.DATABASE_URL,
      redisUrl: !!process.env.REDIS_URL,
      qdrantClusterEndpoint: !!process.env.QDRANT_CLUSTER_ENDPOINT,
      googleApiKey: !!process.env.GOOGLE_API_KEY,
    };

    if (!overallHealthy) {
      throw new ServiceUnavailableException(status);
    }

    return status;
  }
}
