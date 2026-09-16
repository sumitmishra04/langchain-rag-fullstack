from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from dotenv import load_dotenv

load_dotenv()

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vector_store = PineconeVectorStore.from_existing_index(
    index_name="langchain-learn-rag",
    embedding=embeddings
)

retriever = vector_store.as_retriever(search_kwargs={"k": 3})

question1 = "Why did the rabbit lose the race?"
question2 = "Take a controversial approach. I feel rabbit is still more talended when it comes to race but shown as villain here"
retrieved_docs = retriever.invoke(question2)

context = ""
for doc in retrieved_docs:
    context = context + doc.page_content + "\n\n"

prompt = ChatPromptTemplate.from_template("""
Answer the question based only on the context below.
- Keep answer to below 50 words.

Context:
{context}

Question: {question}
""")

llm = ChatOpenAI(model="gpt-4o-mini")

chain = prompt | llm

response = chain.invoke({"context": context, "question": question2})

print(response.content)
