"""TransactionService — abstracts transaction storage and retrieval."""
import logging
from typing import List, Dict
from storage.repositories.transaction_repo import TransactionRepository


class TransactionService:
    def __init__(self):
        self.logger = logging.getLogger("TransactionService")
        self.transaction_repo = TransactionRepository()

    def save_transactions(self, transactions: List[Dict], source_file: str = None) -> int:
        """Save a list of transactions. Returns count of inserted rows."""
        try:
            return self.transaction_repo.save(transactions, source_file=source_file)
        except Exception as e:
            self.logger.error(f"Failed to save transactions: {e}")
            return 0

    def get_transactions(self, provider: str = None, asset: str = None, limit: int = 100) -> List[Dict]:
        """Get transactions with optional filters."""
        try:
            return self.transaction_repo.get(provider=provider, asset=asset, limit=limit)
        except Exception as e:
            self.logger.error(f"Failed to fetch transactions: {e}")
            return []

    def get_summary(self) -> Dict:
        """Get transaction summary."""
        try:
            return self.transaction_repo.get_summary()
        except Exception as e:
            self.logger.error(f"Failed to fetch transaction summary: {e}")
            return {
                'total_transactions': 0,
                'total_buy_value': 0.0,
                'total_sell_value': 0.0,
                'net_invested': 0.0
            }
