import json
import os
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

app = FastAPI(title="ShopNest RAG", description="Ecommerce RAG pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# --- Products endpoint ---
@app.get("/products")
def get_products():
    with open("ecomm_data.json", "r") as f:
        data = json.load(f)
    return data

# --- Ecommerce RAG chain ---
llm = ChatOpenAI(model="gpt-4o-mini")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

ecomm_store = PineconeVectorStore.from_existing_index(
    index_name="json-rag",
    embedding=embeddings
)
ecomm_retriever = ecomm_store.as_retriever(search_kwargs={"k": 3})
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

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
