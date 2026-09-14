***

# HighLevel — Senior Engineer Take-Home Assignment

## Genesis: AI-Powered HighLevel App Builder
**Stack:** Vue 3 + TypeScript + ShadCN UI + Firebase

---

### Overview

Build an AI-powered app builder that generates **HighLevel marketplace-compatible applications**. A user signs in, creates a project, describes what they want in a chat interface, and an LLM generates a working app that integrates with HighLevel APIs — streamed to the browser in real-time. The generated apps must use real HighLevel API endpoints (Contacts, Conversations, Calendars) so they can function as marketplace apps within the HighLevel ecosystem.

You are building two things:

1. **Backend** — Firebase (Auth, Firestore, Cloud Functions) handling auth, project management, LLM orchestration, SSE streaming, file versioning, and HighLevel API integration
2. **Frontend** — A Vue 3 SPA with ShadCN UI components and a three-panel workspace: chat, code editor, and live preview

> **Key distinction:** The AI doesn't just generate generic web apps — it generates apps that talk to the HighLevel platform. When a user says *"build me a dashboard that shows my recent contacts and upcoming calendar appointments"*, the generated code should call the HighLevel Contacts API and Calendars API.

---

### Prerequisites

Before starting, set up your environment:

1. **Create a HighLevel developer account** at [developers.gohighlevel.com](https://developers.gohighlevel.com)
2. **Create a marketplace app** to obtain OAuth credentials (Client ID, Client Secret)
3. **Familiarize yourself with these APIs** (documentation at [marketplace.gohighlevel.com/docs](https://marketplace.gohighlevel.com/docs)):
   - **Contacts API** — list, search, create, update contacts
   - **Conversations API** — list conversations, get messages, send messages
   - **Calendars API** — list calendars, get appointments, get availability
4. **Obtain a sandbox account** — use a HighLevel Sandbox account for safe testing without affecting live data. Sandbox accounts can be created from your developer dashboard.
5. **Database** — you may use Firebase (Firestore) for your database needs, or any other database you prefer.

---

### What to Build

#### 1. Authentication

| Requirement | Details |
| :--- | :--- |
| **App-level auth** | Email + password sign up/sign in using **Firebase Authentication**. Persist session across page refreshes using Firebase's built-in session management. |
| **HighLevel OAuth** | Users must connect their HighLevel account via OAuth 2.0. Implement the full OAuth flow: redirect to HighLevel authorization URL $\rightarrow$ handle callback (via a Firebase Cloud Function) $\rightarrow$ store access/refresh tokens securely in Firestore $\rightarrow$ handle token refresh on expiry. |
| **Token management** | Store HighLevel OAuth tokens in Firestore, scoped to the authenticated Firebase user. Each user links one HighLevel location. |

#### 2. Backend — Firebase

| Feature | Requirements |
| :--- | :--- |
| **Project CRUD** | Cloud Functions (or Firestore rules + client SDK) to create, read, update, and soft-delete projects. Each project has a name, description, connected HighLevel location ID, and a list of files. Strictly scoped to the authenticated Firebase user via security rules. |
| **Chat & Generation** | Build a server-side AI generation function that accepts a user prompt, gathers bounded project/session/external context, streams an LLM completion, converts the final response into validated file operations, and stores the resulting metadata and artifacts in persistent storage. |
| **SSE Streaming** | A Cloud Function HTTP endpoint that streams LLM tokens to the browser in real-time. Define an event protocol covering at minimum: token delivery, file boundaries, completion, and errors. |
| **File Management** | Functions or Firestore/Storage rules to list the project file tree, read individual file content, and save manual edits. |
| **Version Control** | Each generation creates a snapshot (point-in-time copy of all project files) stored in Firestore. Provide functions to list snapshots and restore a previous one. |

#### 3. Frontend — Vue 3 SPA

| Feature | Requirements |
| :--- | :--- |
| **UI library** | Use **ShadCN for Vue** (`shadcn-vue`) as the primary component library for all UI elements — inputs, buttons, dialogs, tabs, badges, and layout primitives. |
| **Auth screens** | Sign up, sign in (Firebase Auth), and a "Connect HighLevel" OAuth button on the dashboard. Show connection status (connected location name or "Not connected"). |
| **Chat panel** | Message history (user + assistant). Input box. |
| **Code editor** | Monaco Editor (`@guolao/vue-monaco-editor` or equivalent). File tree with clickable files. Tabbed editing. During generation, tokens appear in real-time (read-only while streaming). |
| **Live preview** | Render the generated app in an iframe (Sandpack, WebContainers, or srcdoc). The preview must show real HighLevel data — contacts, conversations, or appointments fetched. Preview updates after generation completes. |
| **SSE integration** | Connect to the Cloud Function SSE endpoint. Handle all event types. Accumulate tokens live in the editor. Handle disconnections gracefully. |
| **Snapshot history** | A ShadCN sheet or dialog showing snapshots with timestamps. "Restore" reverts to that snapshot. |

#### 4. Deployment

| Requirement | Details |
| :--- | :--- |
| **Frontend** | Deploy the Vue app to **Firebase Hosting**. |
| **Backend** | Deploy all Cloud Functions to Firebase. Use environment config (`.env` or Firebase config) — no secrets in source. |
| **HighLevel OAuth callback** | The deployed Cloud Function URL must be registered as the OAuth redirect URI in your HighLevel marketplace app settings. |
| **Environment config** | All secrets (LLM API key, HL Client ID/Secret, Firebase service account) loaded from environment variables or Firebase Secret Manager — never committed. Provide `.env.example`. |
| **Deployment documented** | README includes live URLs and deployment notes. |

---

### HighLevel API Integration Details

The LLM must generate code that integrates with HighLevel APIs. The three API areas to cover are **Contacts**, **Conversations**, and **Calendars**. Each covers a distinct part of the HighLevel CRM — consult the documentation at [marketplace.gohighlevel.com/docs](https://marketplace.gohighlevel.com/docs) to understand their structure and decide how to best expose them to the LLM.

---

### Constraints & Guidance

- **LLM provider:** Use Claude (`@anthropic-ai/sdk`) or OpenAI (`openai`). Streaming mode is mandatory.
- **Backend:** Firebase (Auth + Firestore + Cloud Functions) is required.
- **Frontend:** Vue 3 with ShadCN UI (`shadcn-vue`) is required.
- **HighLevel API integration is mandatory.** The generated apps must make real API calls and display real data in the preview.
- **Error handling:** Malformed LLM responses, interrupted streams, and failed HL API calls must all be handled gracefully. Partial results preserved, user sees clear errors.
- **Version control is mandatory.** Each generation creates a restorable snapshot.

---

### Deliverables

1. **GitHub repository (public):**
   - `/functions` — Firebase Cloud Functions
   - `/frontend` — Vue 3 application
   - `firebase.json` and `.firebaserc` at the root
   - `.env.example` with all required environment variables
   - Root `README.md` containing:
     - **Live URLs** — deployed Firebase Hosting frontend and Cloud Functions base URL
     - **HighLevel setup** — how to configure the HL marketplace app, OAuth redirect URI, and sandbox account
     - **Local setup** — how to run with Firebase emulators (`firebase emulators:start`)
     - **Architecture decisions** — 10 bullet points max covering key tradeoffs
     - **What you would improve** — 5 bullet points max
     - **Deployment notes** — Firebase project setup, any CI/CD, manual steps
2. **Loom video (5 minutes max):**
   - Walk through the deployed application end-to-end: sign up $\rightarrow$ connect HighLevel account via OAuth $\rightarrow$ create a project $\rightarrow$ send a prompt (e.g., *"build a contact dashboard with search and a list of upcoming appointments"*) $\rightarrow$ watch generation stream $\rightarrow$ see real HighLevel data in the preview $\rightarrow$ edit a file $\rightarrow$ show snapshot restore
   - Briefly explain one architectural decision you're proud of
   - Share the Loom link in the README and in your submission email

---

### Bonus

- Generation cancellation (abort mid-stream)
- Iterative refinement (second prompt modifies existing code)
- Diff view showing what the LLM changed per generation
- Rate limiting on Cloud Function endpoints
- The generated app handles HL API pagination
- Webhook support — generated app reacts to HighLevel webhook events (e.g., new contact created)

---
