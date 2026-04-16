import logging
import os

from diskcache import Cache


CACHE_DIR = "data/smart_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

smart_cache = Cache(CACHE_DIR)
logger = logging.getLogger("SmartCache")

TTL_PRICES = 60
TTL_QUANT_MATH = 300
TTL_FUNDAMENTALS = 3600
TTL_ALT_DATA = 14400
TTL_MF_NAV = 21600


def clear_system_cache():
    smart_cache.clear()
    logger.warning("🧹 Smart Cache flushed entirely.")
