#!/usr/bin/env python3
import sys
import os
import argparse
import getpass
from app.db import session as db_session_module
from app.db.init_db import init_db
from app.models.user import User
from app.core.security import hash_password

def init_super_admin(
    username: str = "admin",
    full_name: str = "시스템 최고관리자",
    email: str = "admin@aiorche.local",
    password: str = None
):
    print("=" * 64)
    print("🔐 AI Orchestrator Initial Super Admin Bootstrap")
    print("=" * 64)

    # Ensure all tables and seed records are created
    init_db()

    db = db_session_module.SessionLocal()
    try:
        existing_super_admin = db.query(User).filter(User.role == "SUPER_ADMIN").first()
        if existing_super_admin and not password:
            print(f"ℹ️  기존 슈퍼 관리자 계정이 이미 존재합니다: '{existing_super_admin.username}' ({existing_super_admin.email})")
            choice = input("비밀번호를 재설정하시겠습니까? (y/N): ").strip().lower()
            if choice != "y":
                print("초기화 작업을 취소합니다.")
                return 0
            username = existing_super_admin.username

        if not password:
            u_input = input(f"Username [{username}]: ").strip()
            if u_input:
                username = u_input

            f_input = input(f"Full Name [{full_name}]: ").strip()
            if f_input:
                full_name = f_input

            e_input = input(f"Email [{email}]: ").strip()
            if e_input:
                email = e_input

            while True:
                p1 = getpass.getpass("Enter Password (typing hidden): ")
                if len(p1) < 8:
                    print("❌ 비밀번호는 최소 8자 이상이어야 합니다.")
                    continue
                p2 = getpass.getpass("Confirm Password (typing hidden): ")
                if p1 != p2:
                    print("❌ 비밀번호가 일치하지 않습니다. 다시 입력해 주십시오.")
                    continue
                password = p1
                break

        # Check if user already exists
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.full_name = full_name
            user.email = email
            user.password_hash = hash_password(password)
            user.role = "SUPER_ADMIN"
            user.is_active = True
            user.failed_login_count = 0
            user.locked_until = None
            db.commit()
            print(f"\n✔ 기존 사용자 '{username}' 계정이 최고 관리자(SUPER_ADMIN)로 갱신되었습니다.")
        else:
            new_user = User(
                username=username,
                full_name=full_name,
                email=email,
                password_hash=hash_password(password),
                role="SUPER_ADMIN",
                tenant_id=None,
                is_active=True
            )
            db.add(new_user)
            db.commit()
            print(f"\n✔ 최고 관리자(SUPER_ADMIN) '{username}' 계정이 성공적으로 생성되었습니다.")

        print(f"  • 사용자명: {username}")
        print(f"  • 권한: SUPER_ADMIN (전사 최고 관리자)")
        print(f"  • 해싱 알고리즘: Argon2id (단방향 솔트 암호화)")
        print("\n🎉 SUCCESS: 초기 관리자 계정 설정이 완료되었습니다.")
        print("=" * 64)
        return 0
    except Exception as e:
        db.rollback()
        print(f"❌ 계정 생성 중 오류 발생: {e}")
        return 1
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap Initial Super Admin for AI Orchestrator")
    parser.add_argument("--username", default="admin", help="Admin username")
    parser.add_argument("--full-name", default="시스템 최고관리자", help="Admin full name")
    parser.add_argument("--email", default="admin@aiorche.local", help="Admin email")
    parser.add_argument("--password", default=None, help="Admin password (non-interactive)")
    args = parser.parse_args()

    code = init_super_admin(
        username=args.username,
        full_name=args.full_name,
        email=args.email,
        password=args.password
    )
    sys.exit(code)
