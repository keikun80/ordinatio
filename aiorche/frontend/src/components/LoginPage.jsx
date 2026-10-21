import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldCheck, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  Clock, 
  Layers, 
  KeyRound,
  Terminal,
  CheckCircle2,
  Loader2
} from 'lucide-react';

export default function LoginPage() {
  const { login, logoutReason } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('사용자명과 비밀번호를 모두 입력해 주십시오.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      await login(username.trim(), password);
    } catch (err) {
      setErrorMessage(err.message || '로그인 인증에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="login-container" 
      data-testid="scr-login-view"
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        backgroundImage: 'var(--body-bg-gradient)',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Decorative Background Blur Glows */}
      <div 
        style={{
          position: 'absolute',
          top: '20%',
          left: '25%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.08)',
          filter: 'blur(100px)',
          pointerEvents: 'none'
        }}
      />
      <div 
        style={{
          position: 'absolute',
          bottom: '20%',
          right: '25%',
          width: '450px',
          height: '450px',
          borderRadius: '50%',
          background: 'rgba(168, 85, 247, 0.06)',
          filter: 'blur(120px)',
          pointerEvents: 'none'
        }}
      />

      {/* Main Glassmorphism Card */}
      <div 
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '36px',
          background: 'var(--bg-card)',
          backdropFilter: 'var(--backdrop-blur)',
          border: '1px solid var(--border-card)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
          zIndex: 10
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div 
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              marginBottom: '14px',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.2)'
            }}
          >
            <Layers size={28} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--heading-color)', margin: 0 }}>
            AI Orchestrator
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
            고객 자율 운영형 폐쇄망 어플라이언스 콘솔
          </p>
        </div>

        {/* Auto-logout alert banner */}
        {logoutReason === 'inactivity' && (
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(234, 179, 8, 0.12)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: '#facc15',
              fontSize: '0.82rem',
              marginBottom: '20px'
            }}
          >
            <Clock size={16} />
            <span>30분간 활동이 없어 세션이 안전하게 자동 종료되었습니다.</span>
          </div>
        )}

        {/* Error alert banner */}
        {errorMessage && (
          <div 
            data-testid="login-error-alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.82rem',
              marginBottom: '20px'
            }}
          >
            <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {/* Username Input */}
          <div style={{ marginBottom: '18px' }}>
            <label 
              htmlFor="login-username"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}
            >
              사용자 아이디 (Username)
            </label>
            <div style={{ position: 'relative' }}>
              <div 
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <User size={16} />
              </div>
              <input
                id="login-username"
                data-testid="login-input-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="관리자 계정명 (예: admin)"
                autoComplete="username"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
            </div>
          </div>

          {/* Password Input */}
          <div style={{ marginBottom: '24px' }}>
            <label 
              htmlFor="login-password"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}
            >
              비밀번호 (Password)
            </label>
            <div style={{ position: 'relative' }}>
              <div 
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Lock size={16} />
              </div>
              <input
                id="login-password"
                data-testid="login-input-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                autoComplete="current-password"
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '10px 42px 10px 38px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px'
                }}
                title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            data-testid="login-btn-submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #0284c7, #2563eb)',
              color: 'white',
              fontSize: '0.95rem',
              fontWeight: 600,
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'opacity 0.2s ease'
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="spin" />
                <span>보안 인증 진행 중...</span>
              </>
            ) : (
              <>
                <KeyRound size={18} />
                <span>안전 로그인</span>
              </>
            )}
          </button>
        </form>

        {/* Financial Security Invariants Notice */}
        <div 
          style={{
            marginTop: '26px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            lineHeight: 1.6
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
            <ShieldCheck size={14} color="#38bdf8" />
            <span>금융권 컴플라이언스 및 세션 보안 표준</span>
          </div>
          <ul style={{ paddingLeft: '18px', margin: 0 }}>
            <li>30분 미활동 시 자동 로그아웃 (슬라이딩 세션 만료)</li>
            <li>5회 연속 비밀번호 오류 시 15분간 계정 자동 잠금</li>
            <li>Argon2id 솔트 해싱 및 단일 활성 세션 제어</li>
          </ul>
        </div>

        {/* Initial Admin Bootstrap Hint */}
        <div 
          style={{
            marginTop: '16px',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px dashed var(--border-subtle)',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Terminal size={14} color="#a855f7" />
          <span>
            초기 관리자 계정 설정: <code>make init-admin</code>
          </span>
        </div>
      </div>
    </div>
  );
}
