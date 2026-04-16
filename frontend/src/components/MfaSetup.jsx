import React, { useState } from 'react';
import axios from 'axios';

export default function MfaSetup({ token }) {
    const [qrCode, setQrCode] = useState('');
    const [mfaToken, setMfaToken] = useState('');
    const [message, setMessage] = useState('');

    const startSetup = async () => {
        try {
            const response = await axios.post('http://localhost:5000/mfa/setup', {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setQrCode(response.data.qrCodeUrl);
            setMessage('Scan this QR code with Google Authenticator or Authy.');
        } catch (error) {
            setMessage('Error starting MFA setup.');
        }
    };

    const verifyToken = async () => {
        try {
            const response = await axios.post('http://localhost:5000/mfa/verify', 
                { token: mfaToken },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setMessage(response.data.message);
            setQrCode('');
        } catch (error) {
            setMessage(error.response?.data?.message || 'Invalid code, please try again.');
        }
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', marginTop: '20px' }}>
            <h3>🔒 Two-Factor Authentication</h3>
            
            {!qrCode && (
                <button onClick={startSetup} style={{ padding: '10px', cursor: 'pointer' }}>
                    Enable MFA
                </button>
            )}
            
            {qrCode && (
                <div style={{ marginTop: '15px' }}>
                    <p>{message}</p>
                    <img src={qrCode} alt="MFA QR Code" style={{ border: '10px solid white' }} />
                    <br />
                    <input 
                        type="text" 
                        placeholder="Enter 6-digit code" 
                        value={mfaToken} 
                        onChange={(e) => setMfaToken(e.target.value)} 
                        style={{ padding: '8px', marginRight: '10px' }}
                    />
                    <button onClick={verifyToken} style={{ padding: '8px', cursor: 'pointer' }}>
                        Verify & Enable
                    </button>
                </div>
            )}
            
            {!qrCode && message && <p style={{ color: 'green', fontWeight: 'bold' }}>{message}</p>}
        </div>
    );
}