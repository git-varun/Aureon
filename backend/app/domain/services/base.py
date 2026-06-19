from app.core.observability.decorators import instrument_service

class BaseService:
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # Instrument all methods of the subclass at import time
        service_name = cls.__name__
        for attr_name, attr_value in list(cls.__dict__.items()):
            if attr_name.startswith("__"):
                continue
            if callable(attr_value) and not isinstance(attr_value, (classmethod, staticmethod)):
                setattr(cls, attr_name, instrument_service(service_name)(attr_value))
