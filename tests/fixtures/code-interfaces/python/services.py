from dataclasses import dataclass
from typing import Protocol


class Repository(Protocol):
    """Persistence contract for account records."""

    def save(self, account_id: str) -> None:
        """Save an account by id."""


@dataclass
class AccountService:
    """Coordinates account creation."""

    repository: Repository

    async def create_account(self, email: str) -> str:
        """Create an account and return the id."""
        return email


def build_service(repository: Repository) -> AccountService:
    """Build the account service."""
    return AccountService(repository)
