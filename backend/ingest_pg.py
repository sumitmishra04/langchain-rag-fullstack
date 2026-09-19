import os
from supabase import create_client
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Read products from the regular products table (same query as GET /products)
products = supabase.table("products").select("*, categories(name)").execute().data

# One document per product — same text format as the old Pinecone ingestion
docs = []
for product in products:
    specs = "\n".join(f"  {k}: {v}" for k, v in (product.get("specs") or {}).items())
    reviews = "\n".join(
        f"  {r['user']} (★{r['rating']}): {r['comment']}"
        for r in (product.get("reviews") or [])
    )
    text = f"""Product: {product['name']}
Category: {product['categories']['name']}
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

vector_store = PGVector(
    embeddings=embeddings,
    connection=os.environ["DATABASE_URL"],
    collection_name="products",
)

# Using product ids as vector ids means re-running this UPDATES existing rows instead of duplicating
vector_store.add_documents(docs, ids=[d.metadata["product_id"] for d in docs])

print(f"Stored {len(docs)} product documents into Postgres (pgvector).")
for doc in docs:
    print(f"  - {doc.metadata['product_id']}: {doc.page_content.splitlines()[0]}")
