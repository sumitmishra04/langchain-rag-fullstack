# RAG Demo with LangChain, Pinecone & LangServe

A beginner-friendly project that shows how to build a **Retrieval-Augmented Generation (RAG)** pipeline from scratch and serve it as an API.

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
├── story.txt               # Sample document (Tortoise & Rabbit story)
├── ecomm_data.json         # Sample document (ecommerce product catalog)
├── story_ingestion.py      # Load, chunk, embed and store story in Pinecone
├── ecomm_ingestion.py      # Load, chunk, embed and store ecomm data in Pinecone
├── story_retrieval.py      # Ask questions about the story
├── ecomm_retrieval.py      # Ask questions about products
├── local_rag.py            # Fully local RAG using HuggingFace + Chroma + Ollama
├── server.py               # FastAPI server exposing both pipelines as REST APIs
├── frontend/               # React + Tailwind UI to interact with the API
└── requirements.txt        # Python dependencies
```

---

## server.py — Explained Step by Step

### Step 1: Import everything we need

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from dotenv import load_dotenv
```

- `FastAPI` — the web framework that runs our server
- `CORSMiddleware` — allows the browser (React frontend) to talk to this server
- `add_routes` — from LangServe, turns a LangChain chain into a REST endpoint automatically
- `OpenAIEmbeddings` — converts text into vectors using OpenAI
- `ChatOpenAI` — the LLM that generates the final answer
- `PineconeVectorStore` — connects to Pinecone where our vectors are stored
- `ChatPromptTemplate` — creates a reusable prompt with placeholders
- `RunnablePassthrough` — passes the user's question through unchanged
- `StrOutputParser` — extracts plain text from the LLM response
- `load_dotenv` — reads your `.env` file so API keys are available

---

### Step 2: Load environment variables

```python
load_dotenv()
```

This reads `OPENAI_API_KEY` and `PINECONE_API_KEY` from your `.env` file. Without this, neither OpenAI nor Pinecone will work.

---

### Step 3: Create the FastAPI app

```python
app = FastAPI(title="RAG Server")
```

This creates the web server. Everything else is registered onto this `app`.

---

### Step 4: Add CORS middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Browsers block requests from one address (e.g. `localhost:5173`) to a different address (e.g. `localhost:8000`) by default. This middleware tells the browser "it's okay, allow all origins". This is needed so the React frontend can call our server.

---

### Step 5: Set up the shared LLM and embeddings

```python
llm = ChatOpenAI(model="gpt-4o-mini")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
```

- `gpt-4o-mini` — the model that reads the retrieved chunks and writes the answer
- `text-embedding-3-small` — the model that converts text to vectors. Must be the same model used during ingestion, otherwise the vectors won't match

---

### Step 6: Connect to Pinecone (Story)

```python
story_store = PineconeVectorStore.from_existing_index(
    index_name="langchain-learn-rag",
    embedding=embeddings
)
story_retriever = story_store.as_retriever(search_kwargs={"k": 3})
```

- `from_existing_index` — connects to a Pinecone index we already populated using `story_ingestion.py`
- `as_retriever(k=3)` — when given a question, find the 3 most relevant chunks using cosine similarity

---

### Step 7: Build the Story RAG chain

```python
story_chain = (
    {"context": story_retriever, "question": RunnablePassthrough()}
    | story_prompt
    | llm
    | StrOutputParser()
)
```

This is **LCEL (LangChain Expression Language)**. The `|` pipe passes output from one step to the next. Here is what happens when a user sends a question:

1. `{"context": story_retriever, "question": RunnablePassthrough()}` — the question goes to the retriever (which fetches relevant chunks) and also passes through as-is
2. `| story_prompt` — the chunks and question are injected into the prompt template
3. `| llm` — the filled prompt is sent to GPT-4o-mini
4. `| StrOutputParser()` — the LLM response is converted to a plain string

---

### Step 8: Same thing for Ecommerce

```python
ecomm_store = PineconeVectorStore.from_existing_index(
    index_name="json-rag",
    embedding=embeddings
)
ecomm_retriever = ecomm_store.as_retriever(search_kwargs={"k": 3})

ecomm_chain = (
    {"context": ecomm_retriever, "question": RunnablePassthrough()}
    | ecomm_prompt
    | llm
    | StrOutputParser()
)
```

Same pattern, but pointing to a different Pinecone index that stores product data.

---

### Step 9: Register routes with LangServe

```python
add_routes(app, story_chain, path="/story")
add_routes(app, ecomm_chain, path="/ecomm")
```

`add_routes` is the magic of LangServe. One line gives you:

| Endpoint | What it does |
|---|---|
| `POST /story/invoke` | Send a question, get an answer |
| `POST /story/stream` | Same but streams the response word by word |
| `GET /story/playground` | Browser UI to test the chain interactively |

---

### Step 10: Run the server

```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

- `uvicorn` — a fast web server that runs FastAPI apps
- `host="0.0.0.0"` — makes the server accessible from outside the machine (not just localhost)
- `port=8000` — the port to listen on

---

## Setup & Run

### Prerequisites

- Python 3.12+
- Node.js 18+
- OpenAI API key
- Pinecone API key (with two indexes: `langchain-learn-rag` and `json-rag`, dimension 1536, metric cosine)

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Create a `.env` file

```
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=...
```

### 3. Ingest documents into Pinecone

```bash
python story_ingestion.py
python ecomm_ingestion.py
```

### 4. Start the API server

```bash
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
# Ask about the story
curl -X POST http://localhost:8000/story/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": "Why did the rabbit lose the race?"}'

# Ask about products
curl -X POST http://localhost:8000/ecomm/invoke \
  -H "Content-Type: application/json" \
  -d '{"input": "Which headphones have the best battery life?"}'
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Document loading | LangChain `TextLoader`, `RecursiveJsonSplitter` |
| Chunking | `RecursiveCharacterTextSplitter` |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector store | Pinecone |
| LLM | OpenAI `gpt-4o-mini` |
| API server | FastAPI + LangServe |
| Frontend | React + Vite + Tailwind CSS |
