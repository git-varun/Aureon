import re
import urllib.parse

import feedparser

from modules.interfaces import NewsProvider


def clean_html(raw_html):
    """Removes ugly HTML tags from news summaries."""
    cleanr = re.compile('<.*?>')
    return re.sub(cleanr, '', raw_html)

class GoogleNews(NewsProvider):
    def fetch_headlines(self, symbol: str) -> str:
        try:
            search_term = symbol.split('.')[0] if '.' in symbol else symbol
            query = urllib.parse.quote(f"{search_term} stock market news")
            feed = feedparser.parse(f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en")

            articles = []
            for entry in feed.entries[:3]:  # Get top 3 articles per asset
                snippet = clean_html(entry.get('summary', ''))[:300]  # First 300 chars of the article
                articles.append(f"Title: {entry.title}\nSnippet: {snippet}...\nLink: {entry.link}")
            return "\n\n".join(articles) if articles else ""
        except:
            return ""

class YahooFinanceNews(NewsProvider):
    def fetch_headlines(self, symbol: str) -> str:
        try:
            feed = feedparser.parse(f"https://finance.yahoo.com/rss/headline?s={symbol}")
            articles = []
            for entry in feed.entries[:2]:
                snippet = clean_html(entry.get('summary', ''))[:300]
                articles.append(f"Title: {entry.title}\nSnippet: {snippet}...\nLink: {entry.link}")
            return "\n\n".join(articles) if articles else ""
        except:
            return ""
