# ShopNest RAG — LangChain, Pinecone & Supabase

A fullstack **Retrieval-Augmented Generation (RAG)** ecommerce assistant with session-based chat history, token-aware context trimming, and a floating React chat UI.

---

## What is RAG?

Normally, an LLM only knows what it was trained on. RAG lets you give the LLM your own documents so it can answer questions about them.

```
Your Document → split into chunks → convert to vectors → store in Pinecone
User Question  → convert to vector → find closest chunks → send to LLM → Answer
```

---

## Project Structure

```
├── backend/
│   ├── server.py               # FastAPI server — RAG chain, session, chat endpoints
│   ├── ecomm_data.json         # Ecommerce product catalog (9 products, 3 categories)
│   ├── requirements.txt        # Python dependencies
│   ├── Procfile                # Render start command
│   └── practice/               # Learning scripts (ingestion, retrieval, local RAG)
│       ├── story.txt
│       ├── story_ingestion.py
│       ├── story_retrieval.py
│       ├── ecomm_ingestion.py
│       ├── ecomm_retrieval.py
│       └── local_rag.py
└── frontend/
    ├── src/
    │   ├── App.jsx             # React app — product grid + floating chat
    │   └── index.css           # Tailwind + animated card border styles
    └── .env.production         # VITE_API_URL pointing to Render backend
```

---

## server.py — Explained Step by Step

### Step 1: Import everything we need

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, trim_messages
from langchain_core.output_parsers import StrOutputParser
```

- `FastAPI` — the web framework that runs our server
- `CORSMiddleware` — allows the browser (React frontend) to talk to this server
- `OpenAIEmbeddings` — converts text into vectors using OpenAI
- `ChatOpenAI` — the LLM that generates the final answer
- `PineconeVectorStore` — connects to Pinecone where our vectors are stored
- `ChatPromptTemplate`, `MessagesPlaceholder` — creates a reusable prompt with structured message slots
- `RunnablePassthrough` — passes the input dict through while optionally adding new keys
- `RunnableWithMessageHistory` — wraps a chain to automatically fetch and persist chat history
- `BaseChatMessageHistory` — base class for implementing a custom history store
- `HumanMessage`, `AIMessage`, `trim_messages` — message types and token-aware history trimming
- `StrOutputParser` — extracts plain text from the LLM response

---

### Step 2: Load environment variables

```python
load_dotenv()
```

This reads `OPENAI_API_KEY`, `PINECONE_API_KEY`, `SUPABASE_URL`, and `SUPABASE_KEY` from your `.env` file.

---

### Step 3: Create the FastAPI app

```python
app = FastAPI(title="ShopNest RAG")
```

This creates the web server. Everything else is registered onto this `app`.

---

### Step 4: Add CORS middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://langchain-rag-fullstack-1.onrender.com"],
    allow_origin_regex=r"http://localhost:.*",
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Allows requests from the deployed frontend and any localhost port during development.

---

### Step 5: Set up the shared LLM and embeddings

```python
llm = ChatOpenAI(model="gpt-4o-mini")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
```

- `gpt-4o-mini` — the model that reads the retrieved chunks and writes the answer
- `text-embedding-3-small` — converts text to vectors. Must match the model used during ingestion

---

### Step 6: Connect to Pinecone

```python
ecomm_store = PineconeVectorStore.from_existing_index(
    index_name="json-rag",
    embedding=embeddings
)
ecomm_retriever = ecomm_store.as_retriever(search_kwargs={"k": 3})
```

- `from_existing_index` — connects to a Pinecone index already populated via `ecomm_ingestion.py`
- `as_retriever(k=3)` — finds the 3 most relevant product chunks using cosine similarity

---

### Step 7: Build the RAG chain

```python
ecomm_chain = (
    RunnablePassthrough.assign(
        context=lambda x: ecomm_retriever.invoke(x["question"]),
        history=lambda x: trimmer.invoke(x["history"]),
    )
    | ecomm_prompt
    | llm
    | StrOutputParser()
)
```

This is **LCEL (LangChain Expression Language)**. The `|` pipe passes output from one step to the next:

1. `RunnablePassthrough.assign` — adds `context` (Pinecone results) and trims `history` to 1000 tokens
2. The prompt is filled with `context`, trimmed `history`, and the `question`
3. The filled prompt is sent to GPT-4o-mini
4. The LLM response is converted to a plain string

---

### Step 8: Wrap with history management

```python
chain_with_history = RunnableWithMessageHistory(
    ecomm_chain,
    lambda session_id: SupabaseChatMessageHistory(session_id),
    input_messages_key="question",
    history_messages_key="history",
)
```

`RunnableWithMessageHistory` automatically:
1. Fetches past messages from Supabase before each chain run
2. Injects them as structured `HumanMessage`/`AIMessage` objects under `"history"`
3. Persists the new user message and assistant answer after each run

---

### Step 9: Run the server

```python
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

- `uvicorn` — a fast web server that runs FastAPI apps
- `host="0.0.0.0"` — makes the server accessible from outside the machine (not just localhost)
- `PORT` env var — Render injects this automatically; falls back to 8000 locally

---

## Chat History with Supabase

The app stores every conversation in a **Supabase Postgres database** so chat history survives page refreshes and supports multiple named sessions.

### How it works

```
Page loads    →  GET /session       →  load the latest session + its messages (empty state if none)
User sends    →  POST /chat         →  RunnableWithMessageHistory fetches history → runs RAG → persists both messages → returns answer
New chat btn  →  clears UI lazily   →  POST /session created on first message send
Clock icon    →  GET /sessions      →  list all sessions with date + first-message preview
Session click →  GET /session/{id}  →  load that session's full message history
```

The LLM receives the most recent **1000 tokens** of chat history (token-trimmed, not a fixed count), passed as structured `HumanMessage`/`AIMessage` objects — not a raw string.

### Database Schema

Two tables in Supabase:

```sql
-- One row per conversation
create table sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now()
);

-- One row per message
create table messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamp with time zone default now()
);
```

### Session & Chat API endpoints

| Method | Endpoint | What it does |
|---|---|---|
| `GET` | `/session` | Load latest session (returns empty if none exist) |
| `POST` | `/session` | Create a new empty session |
| `GET` | `/sessions` | List all sessions with date + first message preview |
| `GET` | `/session/{id}` | Load all messages for a specific session |
| `DELETE` | `/session/{id}` | Delete a session and all its messages |
| `POST` | `/chat` | Send a message, get a history-aware RAG answer |

`POST /chat` request body:
```json
{ "session_id": "uuid-here", "question": "Which headphones have ANC?" }
```

Response:
```json
{ "answer": "The UltraSound Wireless Headphones have active noise cancellation..." }
```

### Setting up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the two `CREATE TABLE` statements above (one at a time)
3. Go to **Settings → General** — copy the **Project URL** (looks like `https://xxxx.supabase.co`)
4. Go to **Settings → API Keys** — copy the **Secret key** (`sb_secret_...`)
5. Add both to your `backend/.env`:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_KEY=sb_secret_...
   ```

---

## Setup & Run

### Prerequisites

- Python 3.12+
- Node.js 18+
- OpenAI API key
- Pinecone API key (index: `json-rag`, dimension 1536, metric cosine)
- Supabase project (free tier)

### 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Create a `backend/.env` file

```
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=sb_secret_...

# Optional: LangSmith tracing
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=langchain-rag-fullstack
```

**LangSmith** traces every chain call — retrieval, LLM, prompt — with latency, token usage, inputs and outputs. Get your API key at [smith.langchain.com](https://smith.langchain.com). No code changes needed, just set the env vars.

### 3. Ingest documents into Pinecone

```bash
cd backend
python practice/ecomm_ingestion.py
```

### 4. Start the API server

```bash
cd backend
python server.py
```

Server runs at `http://localhost:8000`

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

---

## How to query the API directly

```bash
# Send a chat message (session-aware, history-managed)
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "your-session-uuid", "question": "Which headphones have the best battery life?"}'

# Create a new session
curl -X POST http://localhost:8000/session

# List all past sessions
curl http://localhost:8000/sessions

# Load a specific session's messages
curl http://localhost:8000/session/your-session-uuid
```

---

## Deployment

### Backend — Render Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect GitHub repo `langchain-rag-fullstack`
3. Set **Root Directory** to `backend`
4. Render auto-detects the `Procfile` and sets the start command
5. Add environment variables in the **Environment** tab:
   ```
   OPENAI_API_KEY=sk-...
   PINECONE_API_KEY=...
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_KEY=sb_secret_...
   ```
6. Click **Deploy**

Backend URL: `https://langchain-rag-fullstack.onrender.com`

### Frontend — Render Static Site

1. Go to Render → **New** → **Static Site**
2. Connect the same GitHub repo
3. Set:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install; npm run build`
   - **Publish Directory:** `dist`
4. Click **Deploy**

Frontend URL: `https://langchain-rag-fullstack-1.onrender.com`

### Keep the backend alive — UptimeRobot

Render's free tier spins down after 15 minutes of inactivity. The first request after sleep takes ~30-50 seconds. To prevent this:

1. Go to [uptimerobot.com](https://uptimerobot.com) → Sign up free
2. Click **+ Add New Monitor**
3. Set:
   - **Monitor Type:** HTTP(s)
   - **URL:** `https://langchain-rag-fullstack.onrender.com/docs`
   - **Interval:** 5 minutes
4. Click **Create Monitor**

UptimeRobot pings the backend every 5 minutes, keeping it awake indefinitely.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Document loading | LangChain `TextLoader`, `RecursiveJsonSplitter` |
| Chunking | `RecursiveCharacterTextSplitter` |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector store | Pinecone |
| LLM | OpenAI `gpt-4o-mini` |
| Chat history | Supabase (Postgres) via `RunnableWithMessageHistory` |
| Context trimming | LangChain `trim_messages` (token-aware) |
| API server | FastAPI |
| Frontend | React + Vite + Tailwind CSS |
| Hosting | Render (backend + frontend) |
| Uptime monitoring | UptimeRobot |
