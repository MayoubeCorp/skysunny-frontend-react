import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpPost } from '../api/httpClient';
import errorIcon from '../img/common/error.png';
import mainlogo from '../img/common/mainlogo.png';
import '../styles/main.scss';

const httpUrl = {
    login: '/user/login',
};

export default function ParentLogin() {
    const navigate = useNavigate();

    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(false);

    const handleBack = () => {
        navigate('/');
    };

    const handleLogin = async () => {
        const trimmedId = (id || '').trim().toLowerCase();

        if (!trimmedId || !password) {
            setLoginError(true);
            return;
        }

        try {
            const result = await httpPost(httpUrl.login, [], {
                type: 'email',
                id: trimmedId,
                password: password,
            });

            if (result?.code === 100 && result?.result) {
                const user = result.result;

                // 토큰 저장
                if (user?.accessToken) {
                    localStorage.setItem('accessToken', user.accessToken);
                    if (window.SKYSUNNY) {
                        window.SKYSUNNY.accessToken = user.accessToken;
                    }
                }
                if (user?.refreshToken) {
                    localStorage.setItem('refreshToken', user.refreshToken);
                }

                // 사용자 정보 저장
                localStorage.setItem('user', JSON.stringify(user));

                // 로그인 성공 - 메인 페이지로 이동
                alert('로그인 되었습니다.');
                navigate('/');
            } else {
                setLoginError(true);
            }
        } catch (e) {
            console.error('[LOGIN] 로그인 오류:', e);
            setLoginError(true);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    };

    return (
        <div className="parent-login-container">
            <div className="top-bar">
                <button className="back-button"
                // onClick={handleBack}
                >
                    {/* <img src={backarrow} alt="뒤로가기" className="icon-24" /> */}
                </button>
            </div>

            <div className="login-content">
                <div className="logo-section">
                    <img src={mainlogo} alt="스카이써니 로고" className="main-logo" />
                </div>

                <div className="title-wrapper">
                    <div className="title-line"></div>
                    <h1 className="page-title">스카스카 캐시충전</h1>
                    <div className="title-line"></div>
                </div>

                <div className="input-section">
                    <div className="input-group">
                        <div className={`input-wrapper ${loginError ? 'error' : ''}`}>
                            <label className="input-label">회원 연락처</label>
                            <input
                                type="email"
                                placeholder="숫자만 입력하세요"
                                value={id}
                                onChange={(e) => {
                                    setId(e.target.value);
                                    setLoginError(false);
                                }}
                                onKeyPress={handleKeyPress}
                                className="login-input"
                                autoCapitalize="none"
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <div className={`input-wrapper ${loginError ? 'error' : ''}`}>
                            <label className="input-label">회원 이름</label>
                            <input
                                type="password"
                                placeholder="성함을 입력하세요"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setLoginError(false);
                                }}
                                onKeyPress={handleKeyPress}
                                className="login-input"
                            />
                        </div>
                    </div>

                    {loginError && (
                        <div className="error-message">
                            <img src={errorIcon} alt="에러" className="icon-16" />
                            <span>아이디 또는 비밀번호가 다릅니다.</span>
                        </div>
                    )}
                </div>

                <button className="login-button" onClick={handleLogin}>
                    인증하기
                </button>
            </div>

            <style jsx>{`
                .parent-login-container {
                    min-height: 100vh;
                    background-color: #ffffff;
                    display: flex;
                    flex-direction: column;
                }

                .top-bar {
                    padding: 16px;
                    display: flex;
                    align-items: center;
                }

                .back-button {
                    background: none;
                    border: none;
                    padding: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .icon-24 {
                    width: 24px;
                    height: 24px;
                }

                .icon-16 {
                    width: 16px;
                    height: 16px;
                    margin-right: 4px;
                }

                .login-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 0 20px 50px;
                }

                .logo-section {
                    padding: 60px 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }

                .main-logo {
                    width: 150px;
                    height: auto;
                    object-fit: contain;
                }

                .title-wrapper {
                    display: flex;
                    align-items: center;
                    width: 100%;
                    max-width: 390px;
                    margin: 20px 0 30px;
                    gap: 16px;
                }

                .title-line {
                    flex: 1;
                    height: 1px;
                    background-color: #e0e0e0;
                }

                .page-title {
                    font-size: 18px;
                    font-weight: 700;
                    color: #000000;
                    white-space: nowrap;
                    text-align: center;
                    margin: 0;
                }

                .input-section {
                    width: 100%;
                    max-width: 390px;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .input-group {
                    display: flex;
                    flex-direction: column;
                }

                .input-wrapper {
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    border: 1px solid #e5e5e5;
                    border-radius: 8px;
                    background-color: #ffffff;
                    padding: 12px 16px 8px;
                    transition: all 0.2s;
                }

                .input-wrapper:focus-within {
                    border-color: #2f3032;
                    background-color: #ffffff;
                }

                .input-label {
                    font-size: 12px;
                    font-weight: 500;
                    color: #666666;
                    margin-bottom: 4px;
                }

                .login-input {
                    width: 100%;
                    border: none;
                    background: transparent;
                    font-size: 14px;
                    font-weight: 400;
                    color: #000000;
                    outline: none;
                    padding: 0;
                }

                .login-input::placeholder {
                    color: #c0c0c0;
                }

                .input-wrapper.error {
                    border-color: red;
                }

                .error-message {
                    display: flex;
                    align-items: center;
                    color: red;
                    font-size: 12px;
                    margin-top: -10px;
                }

                .login-button {
                    width: 100%;
                    max-width: 390px;
                    height: 52px;
                    background-color: #2f3032;
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    margin-top: 30px;
                }

                .login-button:hover {
                    background-color: #1a1b1c;
                }

                .login-button:active {
                    background-color: #000000;
                }
            `}</style>
        </div>
    );
}

