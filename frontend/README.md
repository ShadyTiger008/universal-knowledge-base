# Universal Knowledge Assistant - Frontend

This is the Next.js React frontend for the Universal Knowledge Assistant. It provides a clean, responsive Web UI to upload documents, monitor background processing queues, and chat with your documents.

---

## Tech Stack
* **Framework**: Next.js (App Router)
* **Styling**: Tailwind CSS
* **Language**: TypeScript
* **Tooling**: Turbo development server

---

## Environment Variables

Create a `.env` file in the `frontend` directory:

```ini
# Address of the NestJS Backend API (Note the /api global prefix)
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
```

---

## Core Scripts

Navigate to the `frontend` directory:
```bash
cd frontend
```

* **Start Development Server**: Runs Next.js with Turbo mode.
  ```bash
  npm run dev
  ```
  *(Default address is `http://localhost:3000` or `http://localhost:3001` if port 3000 is taken by the backend).*

* **Build Production Bundle**:
  ```bash
  npm run build
  ```

* **Run Lint Check**:
  ```bash
  npm run lint
  ```

* **Verify TypeScript compilation**:
  ```bash
  npm run typecheck
  ```
