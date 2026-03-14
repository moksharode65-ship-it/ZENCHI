// src/auth.js - Handles login flow and device fingerprinting

// Simple fingerprint generation using canvas and userAgent (for demo purposes)
function generateFingerprint() {
    const ua = navigator.userAgent;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('fingerprint', 4, 17);
    const dataUrl = canvas.toDataURL();
    return btoa(ua + '|' + dataUrl);
}

async function login() {
    // Redirect to backend Google OAuth endpoint
    window.location.href = '/auth/google';
}

// After Google redirects back, backend returns JSON with email
async function handlePostLogin(email) {
    const deviceInfo = generateFingerprint();
    const response = await fetch('/auth/verify', {
        method: 'POST',
        credentials: 'include', // send cookies
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceInfo })
    });
    const data = await response.json();
    if (response.ok) {
        alert('Login successful!');
        // You can now redirect to protected area or update UI
    } else {
        alert(data.error || 'Login failed');
    }
}

// Detect if we are on the callback page with email param
function checkCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');
    if (email) {
        handlePostLogin(email);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }
    checkCallback();
});
