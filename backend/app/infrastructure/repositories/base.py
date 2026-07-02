from sqlalchemy.orm import Session
from app.core.observability.decorators import instrument_repository

class BaseRepository:
    def __init__(self, session: Session):
        self.session = session

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # Instrument all methods of the subclass at import time
        repo_name = cls.__name__
        for attr_name, attr_value in list(cls.__dict__.items()):
            if attr_name.startswith("_"):
                continue
            if callable(attr_value) and not isinstance(attr_value, (classmethod, staticmethod)):
                setattr(cls, attr_name, instrument_repository(repo_name)(attr_value))
