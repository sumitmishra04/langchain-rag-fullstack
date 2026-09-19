from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain.agents import create_agent
from pydantic import BaseModel, Field

load_dotenv()


@tool
def get_weather(city: str) -> str:
    """Get the current weather for a given city."""
    mock_data = {
        "london": "Cloudy, 15°C",
        "new york": "Sunny, 22°C",
        "tokyo": "Rainy, 18°C",
    }
    return mock_data.get(city.lower(), f"Weather data not available for {city}.")


@tool
def get_news(city: str) -> str:
    """Get the latest news headline for a given city."""
    mock_news = {
        "london": "London hosts global climate summit this week.",
        "new york": "New York subway expansion approved by city council.",
        "tokyo": "Tokyo prepares for upcoming tech expo 2026.",
    }
    return mock_news.get(city.lower(), f"No news found for {city}.")


class CityReport(BaseModel):
    city: str = Field(description="Name of the city")
    temperature: str = Field(description="Current temperature with unit")
    condition: str = Field(description="Weather condition e.g. Sunny, Rainy")
    headline: str = Field(description="Latest news headline for the city")
    summary: str = Field(description="A brief combined summary of weather and news")


llm = ChatOpenAI(model="gpt-4o-mini")

agent = create_agent(
    model=llm,
    tools=[get_weather, get_news],
    response_format=CityReport,
)

if __name__ == "__main__":
    result = agent.invoke({
        "messages": [{"role": "user", "content": "Give me a city report for Tokyo."}]
    })

    report: CityReport = result["structured_response"]
    print(f"City      : {report.city}")
    print(f"Weather   : {report.condition}, {report.temperature}")
    print(f"Headline  : {report.headline}")
    print(f"Summary   : {report.summary}")
