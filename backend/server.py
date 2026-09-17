import json
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client
from langserve import add_routes
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough, RunnableLambda
from langchain_core.output_parsers import StrOutputParser
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ShopNest RAG", description="Ecommerce RAG pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# --- Supabase client ---
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_KEY"],
)

# --- Products endpoint ---
@app.get("/products")
def get_products():
    with open("ecomm_data.json", "r") as f:
        data = json.load(f)
    return data

# --- Session endpoints ---

@app.get("/session")
def get_default_session():
    """Load the most recent session, or create one if none exist."""
    result = supabase.table("sessions").select("id").order("created_at", desc=True).limit(1).execute()
    if result.data:
        session_id = result.data[0]["id"]
    else:
        created = supabase.table("sessions").insert({}).execute()
        session_id = created.data[0]["id"]

    msgs = (
        supabase.table("messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return {"session_id": session_id, "messages": msgs.data}


@app.post("/session")
def create_session():
    """Create a brand new session."""
    created = supabase.table("sessions").insert({}).execute()
    session_id = created.data[0]["id"]
    return {"session_id": session_id, "messages": []}


@app.get("/sessions")
def list_sessions():
    """List all sessions with a preview of the first user message."""
    sessions = (
        supabase.table("sessions")
        .select("id, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    result = []
    for s in sessions.data:
        first_msg = (
            supabase.table("messages")
            .select("content")
            .eq("session_id", s["id"])
            .eq("role", "user")
            .order("created_at")
            .limit(1)
            .execute()
        )
        preview = first_msg.data[0]["content"] if first_msg.data else "New conversation"
        if len(preview) > 60:
            preview = preview[:60] + "..."
        result.append({"id": s["id"], "created_at": s["created_at"], "preview": preview})
    return result


@app.get("/session/{session_id}")
def load_session(session_id: str):
    """Load all messages for a specific session."""
    msgs = (
        supabase.table("messages")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return {"session_id": session_id, "messages": msgs.data}


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    """Delete a session and all its messages (cascade handled by DB)."""
    supabase.table("sessions").delete().eq("id", session_id).execute()
    return {"deleted": session_id}


# --- Chat endpoint (history-aware) ---
class ChatRequest(BaseModel):
    session_id: str
    question: str


# --- Ecommerce RAG ---
llm = ChatOpenAI(model="gpt-4o-mini")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

ecomm_store = PineconeVectorStore.from_existing_index(
    index_name="json-rag",
    embedding=embeddings
)
ecomm_retriever = ecomm_store.as_retriever(search_kwargs={"k": 3})

# Simple chain kept for /ecomm/playground
ecomm_prompt = ChatPromptTemplate.from_template("""
You are a helpful ecommerce assistant for ShopNest. Answer based only on the product information below.
Keep answer under 80 words.

Product Information:
{context}

Question: {question}
""")

ecomm_chain = (
    {"context": ecomm_retriever, "question": RunnablePassthrough()}
    | ecomm_prompt
    | llm
    | StrOutputParser()
)

add_routes(app, ecomm_chain, path="/ecomm")

# History-aware chain used by /chat
ecomm_prompt_with_history = ChatPromptTemplate.from_template("""
You are a helpful ecommerce assistant for ShopNest. Answer based only on the product information below.
Keep answer under 100 words.

Product Information:
{context}

Chat History:
{history}

Question: {question}
""")

ecomm_chain_with_history = (
    {
        "context": RunnableLambda(lambda x: ecomm_retriever.invoke(x["question"])),
        "question": RunnableLambda(lambda x: x["question"]),
        "history": RunnableLambda(lambda x: x["history"]),
    }
    | ecomm_prompt_with_history
    | llm
    | StrOutputParser()
)


@app.post("/chat")
def chat(req: ChatRequest):
    # Load last 10 messages for context
    msgs_result = (
        supabase.table("messages")
        .select("role, content")
        .eq("session_id", req.session_id)
        .order("created_at")
        .execute()
    )
    recent = msgs_result.data[-10:]
    history = "\n".join(
        f"{m['role'].capitalize()}: {m['content']}" for m in recent
    ) if recent else "No previous conversation."

    # Persist user message
    supabase.table("messages").insert({
        "session_id": req.session_id,
        "role": "user",
        "content": req.question,
    }).execute()

    # Run RAG chain with history
    answer = ecomm_chain_with_history.invoke({
        "question": req.question,
        "history": history,
    })

    # Persist assistant message
    supabase.table("messages").insert({
        "session_id": req.session_id,
        "role": "assistant",
        "content": answer,
    }).execute()

    return {"answer": answer}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
