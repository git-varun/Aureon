from typing import Any


class ValidationError(Exception):
    pass

def validate_feature_vector(features: dict[str, Any]) -> bool:
    if not isinstance(features, dict):
        return False
    return True

def check_missing_values(features: dict[str, Any]) -> bool:
    if features.get('price') is None:
        return False
    return True

def check_numeric_ranges(features: dict[str, Any]) -> bool:
    if features.get('price') is not None and features['price'] < 0:
        return False
    return True

def check_outliers(features: dict[str, Any]) -> bool:
    if features.get('price') is not None and features['price'] > 1000000000:
        return False
    return True

def validate_features(features: dict[str, Any]) -> None:
    if not validate_feature_vector(features):
        raise ValidationError("Invalid feature vector format")
    if not check_missing_values(features):
        raise ValidationError("Missing required values")
    if not check_numeric_ranges(features):
        raise ValidationError("Values out of numeric bounds")
    if not check_outliers(features):
        raise ValidationError("Outliers detected")
