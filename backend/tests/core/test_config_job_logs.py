from datetime import datetime, timedelta, timezone

from app.core.entities.config import JobLog, JobStatus
from app.core.repositories.config import ConfigRepository
from app.core.services.config import ConfigService


# get_sync_status (used by the Transactions "Data gaps" tab) needs to report
# "days since this provider last synced successfully" even when the most
# recent attempt failed — a stale-but-recovering provider must not read as
# "never synced". This guards get_last_successful_log/get_last_successful_run
# against regressing back to "most recent log regardless of status".
def test_last_successful_run_survives_a_later_failure(db_session):
    job_name = f"test_job_{datetime.now(timezone.utc).timestamp()}"
    repo = ConfigRepository(db_session)

    success_time = datetime.now(timezone.utc) - timedelta(days=2)
    success_log = JobLog(
        job_name=job_name,
        status=JobStatus.SUCCESS,
        started_at=success_time,
        ended_at=success_time,
    )
    repo.save_job_log(success_log)

    failure_time = datetime.now(timezone.utc) - timedelta(hours=1)
    failure_log = JobLog(
        job_name=job_name,
        status=JobStatus.FAILED,
        started_at=failure_time,
        ended_at=failure_time,
        error_message="AUTH_REQUIRED: token expired",
    )
    repo.save_job_log(failure_log)
    db_session.commit()

    service = ConfigService(repo)
    result = service.get_last_successful_run(job_name)

    assert result is not None
    assert result["ended_at"] is not None
    assert datetime.fromisoformat(result["ended_at"]) == success_time


def test_last_successful_run_none_when_never_succeeded(db_session):
    job_name = f"test_job_never_{datetime.now(timezone.utc).timestamp()}"
    repo = ConfigRepository(db_session)

    failure_log = JobLog(
        job_name=job_name,
        status=JobStatus.FAILED,
        started_at=datetime.now(timezone.utc),
        error_message="boom",
    )
    repo.save_job_log(failure_log)
    db_session.commit()

    service = ConfigService(repo)
    assert service.get_last_successful_run(job_name) is None
