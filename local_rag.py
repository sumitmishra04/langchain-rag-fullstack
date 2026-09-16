from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate

# --- Load ---
loader = TextLoader("story.txt")
docs = loader.load()

# --- Chunk ---
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = splitter.split_documents(docs)

# --- Embed + Store (local, no API key) ---
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma.from_documents(documents=chunks, embedding=embeddings)

# --- Retrieve ---
retriever = vector_store.as_retriever(search_kwargs={"k": 3})

question = "Why did the rabbit lose the race?"
retrieved_docs = retriever.invoke(question)

context = ""
for doc in retrieved_docs:
    context = context + doc.page_content + "\n\n"

# --- Generate ---
prompt = ChatPromptTemplate.from_template("""
Answer the question based only on the context below.
Keep the answer under 60 words.

Context:
{context}

Question: {question}
""")

llm = ChatOllama(model="qwen3:1.7b")

chain = prompt | llm

response = chain.invoke({"context": context, "question": question})

print(response.content)
