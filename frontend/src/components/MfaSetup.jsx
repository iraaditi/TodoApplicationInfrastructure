import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = 'http://localhost:5000';

export default function Settings({ token }) {
    const navigate = useNavigate();
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [qrCode, setQrCode] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [step, setStep] = useState('idle'); // 'idle' | 'scanning' | 'verifying'
    const [message, setMessage] = useState({ text: '', type: '' }); // type: 'success' | 'error' | 'info'

    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await axios.get(`${API_BASE}/mfa/status`, authHeaders);
            setMfaEnabled(res.data.mfaEnabled);
        } catch {
            showMessage('Could not load MFA status.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const showMessage = (text, type = 'info') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    const handleEnableMfa = async () => {
        setMessage({ text: '', type: '' });
        try {
            const res = await axios.post(`${API_BASE}/mfa/setup`, {}, authHeaders);
            setQrCode(res.data.qrCodeUrl);
            setStep('scanning');
            showMessage('Scan the QR code with Google Authenticator or Authy, then enter the 6-digit code below.', 'info');
        } catch {
            showMessage('Failed to start MFA setup.', 'error');
        }
    };

    const handleVerify = async () => {
        if (mfaCode.length !== 6) {
            showMessage('Please enter a valid 6-digit code.', 'error');
            return;
        }
        try {
            await axios.post(`${API_BASE}/mfa/verify`, { token: mfaCode }, authHeaders);
            setMfaEnabled(true);
            setStep('idle');
            setQrCode('');
            setMfaCode('');
            showMessage('Two-Factor Authentication is now enabled!', 'success');
        } catch (err) {
            showMessage(err.response?.data?.message || 'Invalid code, please try again.', 'error');
        }
    };

    const handleDisableMfa = async () => {
        if (!window.confirm('Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.')) return;
        try {
            await axios.post(`${API_BASE}/mfa/disable`, {}, authHeaders);
            setMfaEnabled(false);
            setStep('idle');
            setQrCode('');
            setMfaCode('');
            showMessage('Two-Factor Authentication has been disabled.', 'info');
        } catch {
            showMessage('Failed to disable MFA.', 'error');
        }
    };

    const handleCancelSetup = () => {
        setStep('idle');
        setQrCode('');
        setMfaCode('');
        setMessage({ text: '', type: '' });
    };

    const messageColors = {
        success: { bg: '#dcfce7', border: '#166534', text: '#166534', icon: '✅' },
        error:   { bg: '#fee2e2', border: '#991b1b', text: '#991b1b', icon: '❌' },
        info:    { bg: '#dbeafe', border: '#1e40af', text: '#1e40af', icon: 'ℹ️' },
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '32px 20px',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}>
            {/* Header */}
            <div style={{
                width: '100%',
                maxWidth: '680px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '4px solid #2563eb',
                borderRadius: '12px',
                padding: '20px 28px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                marginBottom: '24px',
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: '#1e3a8a' }}>
                        ⚙️ Security Settings
                    </h1>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>
                        Manage your account security preferences
                    </p>
                </div>
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{
                        background: 'none',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        color: '#475569',
                        cursor: 'pointer',
                        fontWeight: '500',
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.target.style.background = '#f8fafc'; e.target.style.borderColor = '#94a3b8'; }}
                    onMouseLeave={e => { e.target.style.background = 'none'; e.target.style.borderColor = '#cbd5e1'; }}
                >
                    ← Back to Dashboard
                </button>
            </div>

            {/* Message Banner */}
            {message.text && (() => {
                const c = messageColors[message.type] || messageColors.info;
                return (
                    <div style={{
                        width: '100%',
                        maxWidth: '680px',
                        background: c.bg,
                        border: `1px solid ${c.border}`,
                        borderRadius: '10px',
                        padding: '12px 20px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '14px',
                        color: c.text,
                        fontWeight: '500',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    }}>
                        <span>{c.icon}</span>
                        <span>{message.text}</span>
                    </div>
                );
            })()}

            {/* MFA Card */}
            <div style={{
                width: '100%',
                maxWidth: '680px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
            }}>
                {/* Card Header */}
                <div style={{
                    padding: '20px 28px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#fafafe',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '20px',
                        }}>🔐</div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#1e3a8a' }}>
                                Two-Factor Authentication
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748b' }}>
                                Add an extra layer of security to your account
                            </p>
                        </div>
                    </div>

                    {/* Status badge */}
                    {!loading && (
                        <span style={{
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '700',
                            letterSpacing: '0.5px',
                            background: mfaEnabled ? '#dcfce7' : '#f1f5f9',
                            color: mfaEnabled ? '#166534' : '#64748b',
                            border: mfaEnabled ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                        }}>
                            {mfaEnabled ? '● ENABLED' : '○ DISABLED'}
                        </span>
                    )}
                </div>

                {/* Card Body */}
                <div style={{ padding: '28px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '15px' }}>
                            Loading...
                        </div>
                    ) : step === 'idle' ? (
                        <>
                            <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 24px' }}>
                                {mfaEnabled
                                    ? 'Two-Factor Authentication is currently active on your account. Each time you log in, you will be asked for a one-time code from your authenticator app.'
                                    : 'Two-Factor Authentication is not enabled. When enabled, you will be asked for a time-based one-time code from your authenticator app during login.'}
                            </p>

                            {mfaEnabled ? (
                                <button
                                    onClick={handleDisableMfa}
                                    style={{
                                        padding: '11px 24px',
                                        borderRadius: '8px',
                                        border: '1px solid #fca5a5',
                                        background: '#fee2e2',
                                        color: '#991b1b',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { e.target.style.background = '#fecaca'; }}
                                    onMouseLeave={e => { e.target.style.background = '#fee2e2'; }}
                                >
                                    🔓 Disable MFA
                                </button>
                            ) : (
                                <button
                                    onClick={handleEnableMfa}
                                    style={{
                                        padding: '11px 24px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                        color: '#ffffff',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 6px rgba(37,99,235,0.35)',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { e.target.style.background = 'linear-gradient(135deg, #1d4ed8, #1e40af)'; e.target.style.boxShadow = '0 4px 12px rgba(37,99,235,0.45)'; }}
                                    onMouseLeave={e => { e.target.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)'; e.target.style.boxShadow = '0 2px 6px rgba(37,99,235,0.35)'; }}
                                >
                                    🔒 Enable MFA
                                </button>
                            )}
                        </>
                    ) : (
                        /* Setup Flow */
                        <div>
                            {/* Step indicator */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                                {['Scan QR Code', 'Enter Code', 'Done'].map((label, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '24px', height: '24px', borderRadius: '50%',
                                            background: i === 0 ? '#2563eb' : '#e2e8f0',
                                            color: i === 0 ? '#fff' : '#94a3b8',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '12px', fontWeight: '700',
                                        }}>{i + 1}</div>
                                        <span style={{ fontSize: '13px', color: i === 0 ? '#2563eb' : '#94a3b8', fontWeight: i === 0 ? '600' : '400' }}>{label}</span>
                                        {i < 2 && <span style={{ color: '#cbd5e1', margin: '0 4px' }}>›</span>}
                                    </div>
                                ))}
                            </div>

                            {/* QR Code */}
                            {qrCode && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                                    <div style={{
                                        padding: '16px',
                                        background: '#f8fafc',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '12px',
                                        display: 'inline-block',
                                        marginBottom: '12px',
                                    }}>
                                        <img src={qrCode} alt="MFA QR Code" style={{ width: '180px', height: '180px', display: 'block' }} />
                                    </div>
                                    <p style={{ fontSize: '13px', color: '#64748b', textAlign: 'center', margin: 0 }}>
                                        Scan with <strong>Google Authenticator</strong> or <strong>Authy</strong>
                                    </p>
                                </div>
                            )}

                            {/* Code input */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                                    Enter 6-digit verification code
                                </label>
                                <input
                                    type="text"
                                    placeholder="000000"
                                    value={mfaCode}
                                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    maxLength={6}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #bfdbfe',
                                        fontSize: '24px',
                                        letterSpacing: '10px',
                                        textAlign: 'center',
                                        fontWeight: '700',
                                        color: '#1e3a8a',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                    }}
                                    onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
                                    onBlur={e => { e.target.style.borderColor = '#bfdbfe'; e.target.style.boxShadow = 'none'; }}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={handleVerify}
                                    disabled={mfaCode.length !== 6}
                                    style={{
                                        flex: 1,
                                        padding: '11px 0',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: mfaCode.length === 6
                                            ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                                            : '#e2e8f0',
                                        color: mfaCode.length === 6 ? '#ffffff' : '#94a3b8',
                                        fontWeight: '600',
                                        fontSize: '14px',
                                        cursor: mfaCode.length === 6 ? 'pointer' : 'not-allowed',
                                        boxShadow: mfaCode.length === 6 ? '0 2px 6px rgba(37,99,235,0.35)' : 'none',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    ✓ Verify & Enable
                                </button>
                                <button
                                    onClick={handleCancelSetup}
                                    style={{
                                        padding: '11px 20px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        background: '#ffffff',
                                        color: '#64748b',
                                        fontWeight: '500',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => { e.target.style.background = '#f8fafc'; }}
                                    onMouseLeave={e => { e.target.style.background = '#ffffff'; }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Info notice */}
            <div style={{
                maxWidth: '680px',
                width: '100%',
                marginTop: '20px',
                padding: '14px 20px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '10px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
            }}>
                <span style={{ fontSize: '16px', marginTop: '1px' }}>💡</span>
                <p style={{ margin: 0, fontSize: '13px', color: '#1e40af', lineHeight: '1.6' }}>
                    We recommend using <strong>Google Authenticator</strong> (iOS / Android) or <strong>Authy</strong>. 
                    These apps generate time-based codes that expire every 30 seconds. Keep your authenticator app installed — losing it may lock you out.
                </p>
            </div>
        </div>
    );
}