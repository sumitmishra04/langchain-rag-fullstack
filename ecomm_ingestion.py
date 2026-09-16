import json
from langchain_text_splitters import RecursiveJsonSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from dotenv import load_dotenv

load_dotenv()

with open("ecomm_data.json", "r") as f:
    data = json.load(f)

splitter = RecursiveJsonSplitter(max_chunk_size=500)
chunks = splitter.create_documents(texts=[data])

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vector_store = PineconeVectorStore.from_documents(
    documents=chunks,
    embedding=embeddings,
    index_name="json-rag"
)

print(f"Stored {len(chunks)} chunks into Pinecone.")
