import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { httpPost, httpUrl } from '../api/httpClient';
import errorIcon from '../img/common/error.png';
import mainlogo from '../img/common/mainlogo.png';
import '../styles/main.scss';

export default function ParentLogin() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [loginError, setLoginError] = useState(false);
    const [orderNumber, setOrderNumber] = useState('');

    // URL에서 orderNumber 가져오기
    useEffect(() => {
        const orderNumberFromUrl = searchParams.get('orderNumber');
        if (orderNumberFromUrl) {
            setOrderNumber(orderNumberFromUrl);
            console.log('[ParentLogin] URL에서 orderNumber 확인:', orderNumberFromUrl);
        } else {
            console.warn('[ParentLogin] URL에 orderNumber가 없습니다.');
        }
    }, [searchParams]);

    const handleBack = () => {
        navigate('/');
    };

    const handleLogin = async () => {
        const trimmedPhone = (phone || '').trim();
        const trimmedName = (name || '').trim();

        // 입력값 검증
        if (!trimmedPhone || !trimmedName) {
            alert('회원 연락처와 이름을 모두 입력해주세요.');
            setLoginError(true);
            return;
        }

        // orderNumber 검증
        if (!orderNumber) {
            alert('주문 정보를 찾을 수 없습니다.\n올바른 URL을 통해 접속해주세요.');
            return;
        }

        try {
            console.log('[ParentLogin] 인증 요청:', {
                orderNumber,
                parentId: trimmedName,
                parentPhoneNumber: trimmedPhone
            });

            const result = await httpPost(httpUrl.verifyParent, [], {
                orderNumber: orderNumber,
                parentId: trimmedName,
                parentPhoneNumber: trimmedPhone,
            });

            console.log('[ParentLogin] 인증 응답:', result);

            if (result?.code === 100) {
                // 인증 성공
                alert('인증이 완료되었습니다.\n결제를 진행해주세요.');

                // 결제 페이지로 이동 (orderNumber 포함)
                navigate(`/check-payment-toss?orderNumber=${encodeURIComponent(orderNumber)}`);
            } else {
                // 인증 실패
                const errorMessage = result?.message || '회원 정보를 확인해주세요.';
                alert(errorMessage);
                setLoginError(true);
            }
        } catch (e) {
            console.error('[ParentLogin] 인증 오류:', e);
            alert('인증 중 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.');
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
                                type="tel"
                                placeholder="숫자만 입력하세요"
                                value={phone}
                                onChange={(e) => {
                                    setPhone(e.target.value);
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
                                type="text"
                                placeholder="성함을 입력하세요"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
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
                            <span>회원 정보를 확인해주세요.</span>
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

