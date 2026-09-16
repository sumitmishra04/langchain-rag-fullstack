from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="RAG Server", description="Story and Ecommerce RAG pipelines")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# --- Shared LLM ---
llm = ChatOpenAI(model="gpt-4o-mini")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# --- Story RAG chain ---
story_store = PineconeVectorStore.from_existing_index(
    index_name="langchain-learn-rag",
    embedding=embeddings
)
story_retriever = story_store.as_retriever(search_kwargs={"k": 3})
story_prompt = ChatPromptTemplate.from_template("""
Answer the question based only on the context below.
Keep answer under 50 words.

Context:
{context}

Question: {question}
""")

story_chain = (
    {"context": story_retriever, "question": RunnablePassthrough()}
    | story_prompt
    | llm
    | StrOutputParser()
)

# --- Ecommerce RAG chain ---
ecomm_store = PineconeVectorStore.from_existing_index(
    index_name="json-rag",
    embedding=embeddings
)
ecomm_retriever = ecomm_store.as_retriever(search_kwargs={"k": 3})
ecomm_prompt = ChatPromptTemplate.from_template("""
You are a helpful ecommerce assistant. Answer based only on the product information below.
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

# --- Register routes ---
add_routes(app, story_chain, path="/story")
add_routes(app, ecomm_chain, path="/ecomm")

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
