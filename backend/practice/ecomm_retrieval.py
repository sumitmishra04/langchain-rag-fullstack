from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from dotenv import load_dotenv

load_dotenv()

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vector_store = PineconeVectorStore.from_existing_index(
    index_name="json-rag",
    embedding=embeddings
)

retriever = vector_store.as_retriever(search_kwargs={"k": 3})

question = "Which headphones have the best battery life and noise cancellation?"
retrieved_docs = retriever.invoke(question)

context = ""
for doc in retrieved_docs:
    context = context + doc.page_content + "\n\n"

prompt = ChatPromptTemplate.from_template("""
You are a helpful ecommerce assistant. Answer the question based only on the product information below.
Keep the answer under 80 words.

Product Information:
{context}

Question: {question}
""")

llm = ChatOpenAI(model="gpt-4o-mini")

chain = prompt | llm

response = chain.invoke({"context": context, "question": question})

print(response.content)
