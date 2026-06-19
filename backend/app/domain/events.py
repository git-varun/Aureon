import uuid


def schedule_asset_snapshot_refresh(asset_id: uuid.UUID) -> None:
    from app.workers.snapshots.asset_snapshot import process_asset_snapshot
    process_asset_snapshot(asset_id)

def quote_saved(asset_id: uuid.UUID) -> None:
    schedule_asset_snapshot_refresh(asset_id)
