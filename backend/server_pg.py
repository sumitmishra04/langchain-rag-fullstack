import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_postgres import PGVector
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, trim_messages
from langchain_core.output_parsers import StrOutputParser
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="ShopNest RAG", description="Ecommerce RAG pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://langchain-rag-fullstack-1.onrender.com"],
    allow_origin_regex=r"http://localhost:.*",
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
    result = (
        supabase.table("products")
        .select("*, categories(name)")
        .execute()
    )
    return [
        {**p, "category": p.pop("categories")["name"]}
        for p in result.data
    ]

# --- Session endpoints ---

@app.get("/session")
def get_default_session():
    """Load the most recent session, or return empty if none exist."""
    result = supabase.table("sessions").select("id").order("created_at", desc=True).limit(1).execute()
    if not result.data:
        return {"session_id": None, "messages": []}

    session_id = result.data[0]["id"]
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


# --- Chat request model ---
class ChatRequest(BaseModel):
    session_id: str
    question: str


# --- Supabase-backed message history ---
class SupabaseChatMessageHistory(BaseChatMessageHistory):
    def __init__(self, session_id: str):
        self.session_id = session_id

    @property
    def messages(self) -> list[BaseMessage]:
        result = (
            supabase.table("messages")
            .select("role, content")
            .eq("session_id", self.session_id)
            .order("created_at")
            .execute()
        )
        return [
            HumanMessage(content=m["content"]) if m["role"] == "user"
            else AIMessage(content=m["content"])
            for m in result.data
        ]

    def add_message(self, message: BaseMessage) -> None:
        role = "user" if isinstance(message, HumanMessage) else "assistant"
        supabase.table("messages").insert({
            "session_id": self.session_id,
            "role": role,
            "content": message.content,
        }).execute()

    def clear(self) -> None:
        supabase.table("messages").delete().eq("session_id", self.session_id).execute()


# --- Ecommerce RAG ---
llm = ChatOpenAI(model="gpt-4o-mini")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

ecomm_store = PGVector(
    embeddings=embeddings,
    connection=os.environ["DATABASE_URL"],
    collection_name="products",
)
ecomm_retriever = ecomm_store.as_retriever(search_kwargs={"k": 3})

ecomm_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a helpful ecommerce assistant for ShopNest. Answer based only on the product information below.
Keep answer under 100 words.

Product Information:
{context}"""),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{question}"),
])

trimmer = trim_messages(
    max_tokens=1000,
    strategy="last",
    token_counter=llm,
    include_system=True,
    start_on="human",
)

ecomm_chain = (
    RunnablePassthrough.assign(
        context=lambda x: ecomm_retriever.invoke(x["question"]),
        history=lambda x: trimmer.invoke(x["history"]),
    )
    | ecomm_prompt
    | llm
    | StrOutputParser()
)

chain_with_history = RunnableWithMessageHistory(
    ecomm_chain,
    lambda session_id: SupabaseChatMessageHistory(session_id),
    input_messages_key="question",
    history_messages_key="history",
)


@app.post("/chat")
def chat(req: ChatRequest):
    answer = chain_with_history.invoke(
        {"question": req.question},
        config={"configurable": {"session_id": req.session_id}},
    )
    return {"answer": answer}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
