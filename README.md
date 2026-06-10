# HoliAI - Holistic Coaching AI App (SaaS)

<p align="center">
  <img src="holi-ai-fe/assets/cover.png" width="100%" alt="HoliAI Logo">
</p>

Welcome to **HoliAI**. This repository contains a fully decoupled, multi-tenant Bring-Your-Own-Key (BYOK) **Holistic Coaching AI Application** and SaaS platform powered by an **Autonomous Self-Evolving LLM Persona**.

## Architecture & Features
1. **Autonomous Tool-Calling Architecture**: The AI coach dynamically fetches its own context using a robust Function Calling (Tool Calling) loop. It autonomously queries the database for your health data, plans, and crons *only* when needed, completely eliminating token bloat and context pollution.
2. **Self-Evolving AI**: The AI dynamically learns your goals based on your conversations. It autonomously mutates its own core system prompt in the database to become a hyper-specialized expert tailored to your exact needs.
3. **Garmin Health Integration**: Seamlessly syncs your Garmin biometric data (Sleep, HRV, Stress, Body Battery). The LLM autonomously analyzes this data via tool calls to provide precise, data-driven coaching.
4. **BYOK Ecosystem**: Instead of a centralized database storing everyone's private health data, users provide their own **Groq** and **Garmin** keys directly in the Frontend Settings tab.
5. **Dynamic Model Selection**: Connects directly to Groq to offer a real-time selection of all available open-source models (Llama 3.3, Qwen, DeepSeek, etc.).
6. **Deep Semantic Memory (Local RAG)**: Runs an internal, on-device `all-MiniLM-L6-v2` embedding model (via ONNX runtime) to instantly convert chat history into mathematical vectors. Powered by `pgvector`, the AI mathematically searches your past conversations to retrieve obscure facts from months ago, keeping costs at $0.
7. **Contextual Fact Memory**: The backend autonomously extracts foundational metrics (age, weight, goals) during conversation and stores them permanently with timestamps.
8. **Local Postgres & Redis**: A fully bundled local vector database (`pgvector`) and Redis queue means you do not need to connect external cloud databases during local development.
9. **Full Localization (EN/CS)**: Deep LLM system constraints force the AI to reason and generate plans natively in your preferred language, synchronized automatically with a dynamic frontend UI localization dictionary.
10. **Autonomous Background Routines**: The AI autonomously formulates and schedules cron jobs, alarms, and heartbeat prompts inside a dedicated "Routines" tab to track your progress even when you are away.
11. **Hybrid Context Engineering**: Extracts and pre-loads permanent user facts dynamically into the LLM system prompt, eliminating costly recursive context-fetching tool loops.
12. **Full-Stack Caching Architecture**: Features a backend Redis write-through cache to eliminate database bottlenecks, coupled with a frontend Stale-While-Revalidate (SWR) mechanism using `localStorage` for an instant, zero-latency PWA experience.

---

## 🗂️ Repository Structure

This monorepo is divided into two decoupled, fully independent sub-repositories:

- **[Frontend (HoliAI-fe)](./HoliAI-fe/README.md)**: A Next.js PWA featuring native iOS-style UI aesthetics, dynamic Groq model selectors, smart dashboard merging, UI-level routine (cron) management, and secure BYOK ecosystem management entirely in the browser. It natively supports Capacitor for iOS/Android compilation.
- **[Backend (HoliAI-be)](./HoliAI-be/README.md)**: A robust Node.js Fastify + BullMQ backend worker. It securely routes BYOK API keys, dynamically interprets LLM schemas, runs local on-device RAG semantic search via `pgvector`, and handles the autonomous execution of your background alarms/crons.

---

## 🚀 Deployment Guide

This repository is pre-configured with Enterprise-grade deployment pipelines. You can deploy it "out of the box" in minutes.

### 1. Web Deployment (Vercel + Render)
This is the recommended architecture for the highest performance.

*   **Frontend (Vercel)**:
    1. Push this repository to GitHub.
    2. Go to [Vercel](https://vercel.com/), click "Add New Project", and import your repository.
    3. Make sure the "Framework Preset" is set to `Next.js` and the Root Directory is set to `HoliAI-fe`.
    4. Vercel will automatically read the `vercel.json` and deploy your blazing-fast edge-cached web app!

*   **Backend & Queue (Render)**:
    1. Go to [Render](https://render.com/), click "New", and select "Blueprint".
    2. Connect your GitHub repository.
    3. Render will automatically read the `render.yaml` file in the root directory.
    4. It will provision a Managed Redis Database and a Node.js Fastify Backend server pre-linked together.

*Once both are deployed, open your Vercel URL, go to Settings, and paste your BYOK API Keys. You're live!*

---

### 2. Native Mobile App Deployment (Android & iOS)
If you want to package the app into a native smartphone application, the repository includes a fully interactive build wizard to handle the frontend static export and Capacitor synchronization.

**Locating your Render URL:**
1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click on the "Web Service" that was created for your backend.
3. In the top-left corner under the service name, copy the URL (it will look like `https://your-app-name.onrender.com`).

**Building the App:**
1. Open PowerShell in the root directory.
2. Run the mobile build script:
   ```powershell
   .\build-mobile.ps1
   ```
3. The wizard will prompt you for your live backend URL. Paste the Render URL you copied in the previous step. It will securely inject it into `.env.production` and compile the assets.
4. Once completed, it will automatically prompt you to launch Android Studio or Xcode to instantly compile your `.apk` or iOS app!

---

### 3. Local Docker Testing (Interactive Wizard)
If you want to test the entire isolated stack (Frontend, Backend, Postgres, Redis) on your local machine, use the bundled interactive launcher.

1. Ensure Docker Desktop is running.
2. Open PowerShell in the root directory and run the launcher script:
   ```powershell
   .\start-local.ps1
   ```
3. The wizard will optionally configure Ngrok for you (if you want to test Garmin webhooks locally) and securely write your secrets.
4. It will dynamically boot the entire cluster. Access the app at `http://localhost:3000`.

### 🛑 Safely Stopping the Local Cluster
To safely bring down the entire cluster, remove orphaned profile containers (like Ngrok), and clean up the networks, simply run:
```powershell
.\stop-local.ps1
```

---

## 🧪 Automated Testing
The repository features fully isolated testing suites on both ends:
- **Backend (Jest)**: Fully mocks out PostgreSQL and external dependencies for deterministic, zero-cost, offline-ready integration and unit tests.
- **Frontend (Vitest)**: Utilizes Vitest, jsdom, and React Testing Library to test all deeply-abstracted custom hooks (caching, chat, Garmin) and heavily mocks Capacitor primitives.

To run the test suites:
1. Navigate to the backend: `cd holi-ai-be` and run `npm test`
2. Navigate to the frontend: `cd holi-ai-fe` and run `npm test`
