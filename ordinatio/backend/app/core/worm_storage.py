"""WORM (Write-Once-Read-Many) Audit Storage Engine.

Ensures regulatory compliance with immutable disk-based append-only audit records,
SHA-256 hash chaining (Merkle consistency), and read-only filesystem permissions.

무결성 검증 모델 (ADR-C2):
  - 각 레코드는 단조 증가하는 ``seq``와 직전 레코드의 ``record_hash``(``prev_hash``)를 보관한다.
  - 검증은 ``seq`` 순으로 체인을 전수 순회하여 다음을 모두 확인한다:
      1. TAMPERED      : 레코드 본문 재계산 해시 불일치
      2. MISSING_RECORD: ``seq`` 연속성 단절 (레코드 삭제/누락)
      3. CHAIN_BROKEN  : ``prev_hash`` 연결 불일치 (재배열/치환)
      4. HEAD_MISMATCH : 체인 헤드 앵커와 마지막 레코드 불일치
  - ``seq``가 없는 레코드(본 모델 도입 이전 기록)는 ``legacy_records``로 분류하여
    자기 해시 검증만 수행하고 체인 순회 대상에서 제외한다.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import logging
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings

logger = logging.getLogger("worm_storage")

GENESIS_HASH = "GENESIS_BLOCK_0000000000000000000000000000000000000000000000000000000000000000"

# 심각도 내림차순 — status 결정에 사용
VIOLATION_SEVERITY = (
    "TAMPERED",
    "CORRUPTED",
    "MISSING_RECORD",
    "DUPLICATE_SEQ",
    "CHAIN_BROKEN",
    "HEAD_MISMATCH",
    "PERMISSION_VIOLATION",
)


class WormStorage:
    """Enterprise WORM compliance vault manager."""

    @classmethod
    def resolve_storage_dir(cls) -> Path:
        """Resolve the active WORM storage directory with graceful fallback for unprivileged environments."""
        candidates = [
            Path(settings.WORM_STORAGE_PATH),
            Path("./data/worm_audit"),
            Path("/tmp/ordinatio_worm_audit"),
        ]

        for p in candidates:
            try:
                p.mkdir(parents=True, exist_ok=True)
                # Test write capability
                test_file = p / ".probe"
                test_file.write_text("probe", encoding="utf-8")
                test_file.unlink(missing_ok=True)
                return p
            except (OSError, PermissionError):
                continue

        # Ultimate fallback
        fallback = Path("/tmp/ordinatio_worm_audit")
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback

    @classmethod
    def _get_chain_head_path(cls, storage_dir: Path) -> Path:
        return storage_dir / ".chain_head"

    @classmethod
    def _get_chain_lock_path(cls, storage_dir: Path) -> Path:
        return storage_dir / ".chain.lock"

    @classmethod
    def _read_chain_head(cls, storage_dir: Path) -> Tuple[str, int]:
        """체인 헤드 앵커를 (최신 레코드 해시, 최신 seq)로 읽는다.

        레거시 포맷(해시 문자열 단독)은 seq 0으로 해석하여 하위 호환을 유지한다.
        """
        head_path = cls._get_chain_head_path(storage_dir)
        if head_path.exists():
            try:
                raw = head_path.read_text(encoding="utf-8").strip()
            except Exception:
                return GENESIS_HASH, 0

            if raw.startswith("{"):
                try:
                    data = json.loads(raw)
                    return str(data.get("hash") or GENESIS_HASH), int(data.get("seq") or 0)
                except Exception:
                    logger.warning("WORM chain head is unreadable JSON; treating as genesis anchor")
                    return GENESIS_HASH, 0
            if raw:
                # 레거시 앵커: 해시만 존재하고 seq 개념이 없던 시점의 기록
                return raw, 0

        return GENESIS_HASH, 0

    @classmethod
    def _get_previous_hash(cls, storage_dir: Path) -> str:
        """하위 호환 유지용 헬퍼 (해시만 필요한 호출자용)."""
        return cls._read_chain_head(storage_dir)[0]

    @classmethod
    def _write_chain_head(cls, storage_dir: Path, new_hash: str, seq: int) -> None:
        """체인 헤드 앵커를 원자적으로 갱신하고 읽기 전용(0o400)으로 봉인한다."""
        head_path = cls._get_chain_head_path(storage_dir)
        tmp_path = storage_dir / ".chain_head.tmp"
        payload = json.dumps({"hash": new_hash, "seq": seq}, sort_keys=True)
        try:
            tmp_path.write_text(payload, encoding="utf-8")
            # WORM 앵커 불변식: 소유자 읽기 전용. os.replace는 대상 권한과 무관하게 동작한다.
            os.chmod(tmp_path, stat.S_IRUSR)
            os.replace(tmp_path, head_path)
        except Exception as e:
            logger.error(f"Failed to update WORM chain head (seq={seq}): {e}")
            raise

    @classmethod
    def record_audit_log(
        cls,
        log_id: str,
        requester_id: Optional[str],
        key_id: Optional[str],
        model_id: Optional[str],
        original_prompt_hash: str,
        masked_payload_hash: str,
        detections: Any,
        pii_count: int,
        action_taken: str,
        latency_ms: float,
        is_blocked: bool,
    ) -> Optional[str]:
        """Persist an immutable audit log record to WORM storage with SHA-256 hash chaining.

        Returns:
            WORM 참조 URI. **기록에 실패하면 None을 반환한다** — 호출자는 실패를
            정상 참조로 오인해 저장하지 않도록 반환값을 그대로 보관해야 한다.
        """
        storage_dir = cls.resolve_storage_dir()
        file_path = storage_dir / f"{log_id}.json"

        # seq 할당 ~ 헤드 갱신까지를 배타 락으로 직렬화한다 (동시 기록 시 seq 중복 방지)
        lock_path = cls._get_chain_lock_path(storage_dir)
        try:
            lock_file = open(lock_path, "a+")
        except Exception as e:
            logger.error(f"Failed to open WORM chain lock {lock_path}: {e}")
            return None

        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX)

            prev_hash, prev_seq = cls._read_chain_head(storage_dir)
            seq = prev_seq + 1
            now_utc = datetime.now(timezone.utc).isoformat()

            record_body = {
                "seq": seq,
                "log_id": log_id,
                "timestamp": now_utc,
                "requester_id": requester_id,
                "key_id": key_id,
                "model_id": model_id,
                "original_prompt_hash": original_prompt_hash,
                "masked_payload_hash": masked_payload_hash,
                "detections": detections,
                "pii_count": pii_count,
                "action_taken": action_taken,
                "latency_ms": latency_ms,
                "is_blocked": is_blocked,
                "prev_hash": prev_hash,
            }

            canonical_bytes = json.dumps(record_body, sort_keys=True, ensure_ascii=False).encode("utf-8")
            record_hash = hashlib.sha256(canonical_bytes).hexdigest()
            record_hash_uri = f"sha256:{record_hash}"
            record_body["record_hash"] = record_hash_uri

            tmp_path = storage_dir / f".{log_id}.tmp"
            try:
                tmp_path.write_text(json.dumps(record_body, indent=2, ensure_ascii=False), encoding="utf-8")
                # Make read-only (WORM invariant: 0o444)
                os.chmod(tmp_path, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
                tmp_path.rename(file_path)
            except Exception as e:
                logger.error(f"Failed to write WORM file {file_path}: {e}")
                tmp_path.unlink(missing_ok=True)
                return None

            # 레코드가 디스크에 안착한 뒤에만 헤드를 전진시킨다
            try:
                cls._write_chain_head(storage_dir, record_hash_uri, seq)
            except Exception:
                logger.error(
                    f"WORM record {log_id} was written but the chain head could not advance; "
                    f"integrity verification will report HEAD_MISMATCH until repaired"
                )
                return None

            logger.info(f"WORM immutable record committed: {file_path} (seq={seq}, hash: {record_hash_uri[:23]}...)")
            return f"worm-s3-vault://audit/{log_id}.json"
        finally:
            try:
                fcntl.flock(lock_file, fcntl.LOCK_UN)
            finally:
                lock_file.close()

    @classmethod
    def _load_records(cls, storage_dir: Path) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """저장소의 모든 레코드를 읽어 (체인 레코드, 레거시 레코드, 위반 목록)으로 분류한다."""
        json_files = sorted(
            [f for f in storage_dir.glob("*.json") if not f.name.startswith(".")],
            key=lambda p: p.name,
        )

        chained: List[Dict[str, Any]] = []
        legacy: List[Dict[str, Any]] = []
        violations: List[Dict[str, Any]] = []

        for f in json_files:
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception as ex:
                violations.append({"file": f.name, "status": "CORRUPTED", "error": str(ex)})
                continue

            stored_hash = data.get("record_hash", "")
            body = {k: v for k, v in data.items() if k != "record_hash"}
            computed_hash = "sha256:" + hashlib.sha256(
                json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest()

            if stored_hash != computed_hash:
                violations.append({
                    "file": f.name,
                    "status": "TAMPERED",
                    "stored_hash": stored_hash,
                    "computed_hash": computed_hash,
                })
                continue

            # 읽기 전용 권한 이탈은 조용히 복구하지 않고 위반으로 보고한다
            mode = stat.S_IMODE(os.stat(f).st_mode)
            if mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH):
                violations.append({
                    "file": f.name,
                    "status": "PERMISSION_VIOLATION",
                    "mode": oct(mode),
                    "expected_mode": "0o444",
                })

            entry = {"file": f.name, "data": data}
            if isinstance(data.get("seq"), int):
                chained.append(entry)
            else:
                legacy.append(entry)

        chained.sort(key=lambda e: e["data"]["seq"])
        return chained, legacy, violations

    @classmethod
    def verify_integrity(cls, db: Any = None) -> Dict[str, Any]:
        """WORM 감사 로그 전수 무결성 및 SHA-256 해시 체인 연결성을 검증한다.

        Args:
            db: 선택. 전달하면 DB AuditLog 건수와의 괴리(``db_worm_divergence``)를 함께 보고한다.
                괴리는 참고 지표이며 status를 좌우하지 않는다.
        """
        storage_dir = cls.resolve_storage_dir()
        chained, legacy, violations = cls._load_records(storage_dir)
        head_hash, head_seq = cls._read_chain_head(storage_dir)

        # 1) seq 연속성 — 단절은 레코드 삭제/누락, 역행은 중복 적재를 의미한다
        expected_seq = chained[0]["data"]["seq"] if chained else 1
        for entry in chained:
            actual_seq = entry["data"]["seq"]
            if actual_seq > expected_seq:
                violations.append({
                    "file": entry["file"],
                    "status": "MISSING_RECORD",
                    "expected_seq": expected_seq,
                    "found_seq": actual_seq,
                    "missing_count": actual_seq - expected_seq,
                })
                expected_seq = actual_seq
            elif actual_seq < expected_seq:
                violations.append({
                    "file": entry["file"],
                    "status": "DUPLICATE_SEQ",
                    "expected_seq": expected_seq,
                    "found_seq": actual_seq,
                    "detail": "동일 seq가 중복 적재되었습니다. 백업 복원 또는 동시 기록 경합이 의심됩니다.",
                })
                continue
            expected_seq += 1

        # 2) prev_hash 연결성 — 두 번째 레코드부터 직전 레코드 해시와 일치해야 한다
        for prev_entry, cur_entry in zip(chained, chained[1:]):
            prev_recorded = prev_entry["data"].get("record_hash", "")
            cur_prev = cur_entry["data"].get("prev_hash", "")
            if cur_prev != prev_recorded:
                violations.append({
                    "file": cur_entry["file"],
                    "status": "CHAIN_BROKEN",
                    "expected_prev_hash": prev_recorded,
                    "found_prev_hash": cur_prev,
                })

        # 3) 체인 헤드 앵커 일치 — 마지막 레코드 제거 또는 앵커 변조를 탐지한다
        if chained:
            last = chained[-1]["data"]
            if head_seq != last["seq"] or head_hash != last.get("record_hash", ""):
                violations.append({
                    "file": chained[-1]["file"],
                    "status": "HEAD_MISMATCH",
                    "anchor_seq": head_seq,
                    "anchor_hash": head_hash,
                    "last_record_seq": last["seq"],
                    "last_record_hash": last.get("record_hash", ""),
                })
        elif head_seq > 0:
            violations.append({
                "file": None,
                "status": "HEAD_MISMATCH",
                "anchor_seq": head_seq,
                "anchor_hash": head_hash,
                "detail": "체인 앵커가 존재하지만 대응하는 레코드가 하나도 없습니다.",
            })

        # 4) 체인 헤드 앵커 자체의 권한 (0o400 기대)
        head_path = cls._get_chain_head_path(storage_dir)
        if head_path.exists():
            head_mode = stat.S_IMODE(os.stat(head_path).st_mode)
            if head_mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH):
                violations.append({
                    "file": head_path.name,
                    "status": "PERMISSION_VIOLATION",
                    "mode": oct(head_mode),
                    "expected_mode": "0o400",
                    "detail": "체인 앵커가 쓰기 가능 상태입니다. 앵커 변조가 가능합니다.",
                })

        tampered_records = sum(1 for v in violations if v["status"] in ("TAMPERED", "CORRUPTED"))
        is_valid = not violations

        status = "VERIFIED"
        if violations:
            found = {v["status"] for v in violations}
            status = next(s for s in VIOLATION_SEVERITY if s in found)

        result: Dict[str, Any] = {
            "status": status,
            "storage_path": str(storage_dir.resolve()),
            "total_records": len(chained) + len(legacy),
            "chained_records": len(chained),
            "legacy_records": len(legacy),
            "tampered_records": tampered_records,
            "violation_count": len(violations),
            "hash_chain_valid": is_valid,
            "latest_hash": head_hash,
            "latest_seq": head_seq,
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "details": violations[:10],
        }

        if db is not None:
            try:
                from app.models.audit_log import AuditLog
                db_count = db.query(AuditLog).count()
                result["db_record_count"] = db_count
                # 참고 지표: WORM 파일을 남기지 않는 기록 경로 또는 시딩 데이터가 있으면 양수가 된다
                result["db_worm_divergence"] = db_count - result["total_records"]
            except Exception as e:
                logger.warning(f"WORM/DB cross-check skipped: {e}")

        if not is_valid:
            logger.error(
                f"WORM integrity verification FAILED: status={status}, "
                f"violations={len(violations)}, storage={storage_dir}"
            )

        return result
