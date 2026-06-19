import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

def reconstruct_timeline(correlation_id: str, log_dir: Optional[str] = None) -> str:
    """Scans all JSON files in log_dir to reconstruct the chronological execution tree of a request."""
    if log_dir is None:
        # Resolve logs directory path
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        log_dir = os.path.join(base_dir, "logs")

    if not os.path.exists(log_dir):
        return f"Error: Logs directory '{log_dir}' does not exist."

    # 1. Collect all log records matching correlation_id
    records: List[Dict[str, Any]] = []
    for root, _, files in os.walk(log_dir):
        for file in files:
            if not file.endswith(".log") or file == "audit.log":
                continue
            filepath = os.path.join(root, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            # Try parsing as JSON (Production Log Format)
                            log_record = json.loads(line)
                            if log_record.get("correlation_id") == correlation_id:
                                records.append(log_record)
                        except json.JSONDecodeError:
                            # Fallback: simple text scanning for correlation_id string
                            if correlation_id in line:
                                # Create dummy record from raw text
                                records.append({
                                    "timestamp": datetime.now().isoformat(),
                                    "category": "SYSTEM",
                                    "event": "raw.log",
                                    "message": line.strip()
                                })
            except Exception as e:
                pass

    if not records:
        return f"No trace records found for correlation_id: {correlation_id}"

    # 2. Sort records chronologically by timestamp
    try:
        records.sort(key=lambda x: x.get("timestamp", ""))
    except Exception:
        pass

    # 3. Format into a visual ASCII hierarchy based on category/module nesting
    lines = [f"Trace Timeline for Correlation ID: {correlation_id}\n"]
    
    # We can calculate indentation hierarchy dynamically by tracking nested calls
    # or by analyzing categories and execution_steps (START/FINISH/FAIL)
    indent_level = 0
    for i, r in enumerate(records):
        category = r.get("category", "SYSTEM")
        event = r.get("event", "log")
        module = r.get("module", "-")
        function = r.get("function", "-")
        message = r.get("message", "")
        duration = r.get("duration_ms", None)
        step = r.get("execution_step", "-")
        trace_id = r.get("trace_id", "-")
        span_id = r.get("span_id", "-")

        # Determine nesting indentation changes
        if step == "START" and i > 0:
            indent_level += 1
        elif step in ("FINISH", "FAIL", "EXCEPTION") and indent_level > 0:
            indent_level = max(0, indent_level - 1)

        prefix = "│   " * indent_level
        branch = "├── " if indent_level > 0 else ""
        
        timing_str = f" ({duration}ms)" if duration is not None and duration != "-" else ""
        trace_str = f" [trace:{trace_id} | span:{span_id}]" if trace_id != "-" else ""
        
        lines.append(
            f"{prefix}{branch}[{category} - {event}] {module}.{function} - "
            f"{step}{timing_str}{trace_str} : {message}"
        )
        
        # Reset indent level logic for standard flow
        if step == "START" and i == len(records) - 1:
            indent_level = max(0, indent_level - 1)

    return "\n".join(lines)
