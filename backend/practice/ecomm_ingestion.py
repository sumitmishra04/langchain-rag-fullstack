import json
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from dotenv import load_dotenv

load_dotenv()

with open("../ecomm_data.json", "r") as f:
    data = json.load(f)

# One document per product — gives clean, semantically rich text per product
# so cosine similarity search works reliably for any product query.
docs = []
for category in data["categories"]:
    for product in category["products"]:
        specs = "\n".join(f"  {k}: {v}" for k, v in product.get("specs", {}).items())
        reviews = "\n".join(
            f"  {r['user']} (★{r['rating']}): {r['comment']}"
            for r in product.get("reviews", [])
        )
        text = f"""Product: {product['name']}
Category: {category['name']}
Brand: {product['brand']}
Price: ${product['price']}
Stock: {product['stock']} units
Rating: {product['rating']}/5
Description: {product['description']}
Specs:
{specs}
Reviews:
{reviews}"""
        docs.append(Document(page_content=text, metadata={"product_id": product["id"]}))

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Overwrite the existing index with the new documents
vector_store = PineconeVectorStore.from_documents(
    documents=docs,
    embedding=embeddings,
    index_name="json-rag"
)

print(f"Stored {len(docs)} product documents into Pinecone.")
for doc in docs:
    print(f"  - {doc.metadata['product_id']}: {doc.page_content.splitlines()[0]}")
