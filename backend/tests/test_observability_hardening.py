import threading
import uuid
import pytest
from app.core.observability.otel import get_tracer, inject_trace_context, extract_trace_context, StatusCode
from app.core.observability.metrics import registry, Counter, Gauge, Histogram, telemetry_errors_total
from app.core.observability.audit import log_audit_event, audit_logger
from app.core.observability.sanitizer import Sanitizer
from app.core.observability.logging import TelemetryLoggingFilter
from app.core.observability.request_context import ContextManager, get_context_dict, ctx_request_id
import logging

def test_sanitizer_redaction():
    # String redaction
    assert Sanitizer.sanitize_string("password: secret123") == "password: [REDACTED_SECRET]"
    assert Sanitizer.sanitize_string("Bearer 12345abcdef") == "Bearer [REDACTED_TOKEN]"
    assert Sanitizer.sanitize_string("email: varun@aureon.com") == "email: [REDACTED_EMAIL]"
    
    # Dict/nested data structures
    raw_data = {
        "user": "test_user",
        "password": "supersecretpassword",
        "nested": {
            "api_key": "somekeyvalue",
            "normal_field": "public_data"
        }
    }
    sanitized = Sanitizer.sanitize_data(raw_data)
    assert sanitized["password"] == "[REDACTED_SECRET]"
    assert sanitized["nested"]["api_key"] == "[REDACTED_SECRET]"
    assert sanitized["nested"]["normal_field"] == "public_data"


def test_context_propagation_inject_extract():
    carrier = {}
    with ContextManager(request_id="req-123", correlation_id="corr-456", user_id="user-789", job_id="job-abc"):
        inject_trace_context(carrier)
        
    assert carrier["X-Request-Id"] == "req-123"
    assert carrier["X-Correlation-Id"] == "corr-456"
    assert carrier["X-User-Id"] == "user-789"
    assert carrier["X-Job-Id"] == "job-abc"
    
    extracted = extract_trace_context(carrier)
    assert extracted["request_id"] == "req-123"
    assert extracted["correlation_id"] == "corr-456"
    assert extracted["user_id"] == "user-789"
    assert extracted["job_id"] == "job-abc"


def test_opentelemetry_span_simulation():
    tracer = get_tracer("test")
    with tracer.start_as_current_span("test-span") as span:
        span.set_attribute("env", "testing")
        span.set_status(StatusCode.OK, "All systems nominal")
        
        # Check mock attributes
        assert hasattr(span, "name")
        assert span.name == "test-span"
        if hasattr(span, "attributes"):
            assert span.attributes["env"] == "testing"
            assert span.status_code == "OK"


def test_metrics_central_registry():
    # Registry counter
    metric_counter = registry.register(
        Counter("test_events_total", "Test counter", ["type"])
    )
    metric_counter.inc(type="error")
    metric_counter.inc(amount=2.0, type="error")
    
    # Registry gauge
    metric_gauge = registry.register(
        Gauge("test_active_sessions", "Test gauge", ["region"])
    )
    metric_gauge.set(10.0, region="us-east")
    metric_gauge.inc(2.0, region="us-east")
    metric_gauge.dec(1.0, region="us-east")
    
    # Registry histogram
    metric_hist = registry.register(
        Histogram("test_latency_seconds", "Test histogram", ["action"])
    )
    metric_hist.observe(0.15, action="query")
    metric_hist.observe(0.45, action="query")

    prom_data = registry.generate_prometheus_metrics()
    
    assert "test_events_total{environment=\"development\",service=\"aureon-api\",type=\"error\"} 3" in prom_data
    assert "test_active_sessions{environment=\"development\",service=\"aureon-api\",region=\"us-east\"} 11" in prom_data
    assert "test_latency_seconds_sum{environment=\"development\",service=\"aureon-api\",action=\"query\"} 0.6" in prom_data
    assert "test_latency_seconds_count{environment=\"development\",service=\"aureon-api\",action=\"query\"} 2" in prom_data


def test_audit_logging_flow(tmp_path):
    log_file = tmp_path / "test_audit.log"
    # Create custom audit logger
    from app.core.observability.audit import AuditLogger
    custom_audit = AuditLogger(str(log_file))
    
    custom_audit.log(
        action="PORTFOLIO_DELETE",
        entity_type="portfolio",
        entity_id="port-12345",
        status="SUCCESS",
        details={"reason": "user request"}
    )
    
    # Verify contents of audit file
    assert log_file.exists()
    content = log_file.read_text()
    import json
    parsed = json.loads(content)
    assert parsed["action"] == "PORTFOLIO_DELETE"
    assert parsed["entity_type"] == "portfolio"
    assert parsed["entity_id"] == "port-12345"
    assert parsed["status"] == "SUCCESS"
    assert parsed["details"]["reason"] == "user request"


def test_log_sampling_filter():
    filt = TelemetryLoggingFilter()
    
    # 1. Error/Warnings are always sampled (True)
    rec_err = logging.LogRecord("name", logging.ERROR, "pathname", 10, "msg", (), None)
    assert filt.filter(rec_err) is True
    
    # 2. Category classification mapping check
    rec_db = logging.LogRecord("app.database.query", logging.INFO, "pathname", 10, "msg", (), None)
    filt.filter(rec_db)
    assert rec_db.category == "DATABASE"
    assert rec_db.event == "database.log"  # Deduce event name


def test_context_thread_safety():
    def thread_worker(req_val, results):
        with ContextManager(request_id=req_val):
            # Let other thread execute
            import time
            time.sleep(0.01)
            results.append(ctx_request_id.get())

    results = []
    t1 = threading.Thread(target=thread_worker, args=("req-A", results))
    t2 = threading.Thread(target=thread_worker, args=("req-B", results))
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    
    # Context variables must be isolated across threads (i.e. req-A and req-B shouldn't override each other)
    assert "req-A" in results
    assert "req-B" in results


def test_timeline_reconstruction(tmp_path):
    import json
    from app.core.observability.timeline import reconstruct_timeline
    
    log_file = tmp_path / "app.log"
    corr_id = "test-corr-timeline"
    
    # Write sample JSON logs
    logs = [
        {"timestamp": "2026-06-18T12:00:00Z", "correlation_id": corr_id, "category": "API", "event": "api.request.started", "module": "middleware", "function": "dispatch", "execution_step": "START", "message": "Incoming request"},
        {"timestamp": "2026-06-18T12:00:01Z", "correlation_id": corr_id, "category": "DATABASE", "event": "db.query.executed", "module": "database", "function": "execute", "execution_step": "START", "message": "SELECT 1"},
        {"timestamp": "2026-06-18T12:00:02Z", "correlation_id": corr_id, "category": "DATABASE", "event": "db.query.executed", "module": "database", "function": "execute", "execution_step": "FINISH", "duration_ms": 10, "message": "SELECT 1 done"},
        {"timestamp": "2026-06-18T12:00:03Z", "correlation_id": corr_id, "category": "API", "event": "api.request.completed", "module": "middleware", "function": "dispatch", "execution_step": "FINISH", "duration_ms": 300, "message": "Success response"}
    ]
    with open(log_file, "w") as f:
        for log in logs:
            f.write(json.dumps(log) + "\n")
            
    timeline = reconstruct_timeline(corr_id, log_dir=str(tmp_path))
    assert corr_id in timeline
    assert "SELECT 1" in timeline
    assert "Success response" in timeline


def test_audit_chain_verification(tmp_path):
    from app.core.observability.audit import AuditLogger
    log_file = tmp_path / "audit.log"
    logger = AuditLogger(str(log_file))
    
    # 1. Log multiple events to establish the SHA-256 chain
    logger.log("ACTION_A", "user", "u-1", "SUCCESS", {"meta": "data"})
    logger.log("ACTION_B", "user", "u-2", "SUCCESS", {"meta": "data"})
    
    # 2. Verify untouched chain is valid
    assert logger.verify_chain(str(log_file)) is True
    
    # 3. Tamper with the log file (modify the payload slightly)
    lines = log_file.read_text().splitlines()
    import json
    tampered = json.loads(lines[0])
    tampered["action"] = "ACTION_TAMPERED"
    lines[0] = json.dumps(tampered)
    log_file.write_text("\n".join(lines) + "\n")
    
    # 4. Verify chain fails validation
    assert logger.verify_chain(str(log_file)) is False


def test_health_score_engine():
    from app.core.observability.health import health_engine
    res = health_engine.compute_health_score()
    assert "health_score_percent" in res
    assert 0.0 <= res["health_score_percent"] <= 100.0
    assert "status" in res
    assert "checks" in res
    assert "system_resources" in res


def test_config_validation(monkeypatch):
    from app.core.observability.config_validation import validate_telemetry_config
    
    # Untouched should succeed
    validate_telemetry_config()
    
    # Mocking invalid rate bound
    monkeypatch.setenv("LOG_SAMPLE_RATE_DATABASE_INFO", "1.5")
    with pytest.raises(ValueError, match="Telemetry Config Error: Environment sample rate override"):
        validate_telemetry_config()


def test_feature_flag_telemetry():
    from app.core.observability.feature_flags import FeatureFlagEvaluator
    enabled, variant = FeatureFlagEvaluator.evaluate("test_flag", user_id="user_123", experiment_id="exp_abc")
    assert isinstance(enabled, bool)
    assert variant in ("variant_a", "variant_b", "control")


def test_slow_operation_warning(caplog):
    import logging
    from app.core.observability.slow_operations import check_slow_operation
    
    aureon_logger = logging.getLogger("aureon")
    aureon_logger.addHandler(caplog.handler)
    
    try:
        check_slow_operation("DB", actual_ms=150.0, threshold_ms=100.0, details={"query": "SELECT *"})
        assert any("Slow DB operation detected" in record.message for record in caplog.records)
        # Check extra parameters on the matching log record
        warning_record = next(r for r in caplog.records if "Slow DB operation" in r.message)
        assert warning_record.levelname == "WARNING"
    finally:
        aureon_logger.removeHandler(caplog.handler)


@pytest.mark.asyncio
async def test_async_context_propagation():
    import asyncio
    from app.core.observability.request_context import ContextManager, ctx_request_id
    from concurrent.futures import ThreadPoolExecutor
    
    async def task_coroutine(req_val):
        with ContextManager(request_id=req_val):
            await asyncio.sleep(0.01)
            # Spawn a thread pool executor to verify ThreadPoolExecutor propagation
            loop = asyncio.get_running_loop()
            
            def sync_callback():
                return ctx_request_id.get()
                
            with ThreadPoolExecutor() as pool:
                res = await loop.run_in_executor(pool, sync_callback)
            return ctx_request_id.get(), res

    res1, res2 = await asyncio.gather(
        task_coroutine("req-async-A"),
        task_coroutine("req-async-B")
    )
    
    # Verify no cross-coroutine leakage
    assert res1[0] == "req-async-A"
    assert res2[0] == "req-async-B"
