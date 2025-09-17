// CheckPaymentToss.js - 토스페이먼츠 공식 SDK 방식
import { loadPaymentWidget } from "@tosspayments/payment-widget-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Banner from '../components/BannerSlider';
import backArrow from '../img/common/backarrow.png';
import close from '../img/common/circleClose.png';
import copy from '../img/common/copy.png';
import bannerImg from '../img/home/bannerexample.png';
import infoIcon from '../img/home/information.png';
import '../styles/main.scss';
// webviewBridge 유틸리티 import
import { sendToRN } from '../utils/webviewBridge.js';

export default function CheckPaymentToss() {
    const navigate = useNavigate();
    const location = useLocation();

    const [selectedCoupon, setSelectedCoupon] = useState(location.state?.selectedCoupon || null);
    const [ticketInfo, setTicketInfo] = useState(null);

    // 토스 결제 위젯 관련 상태
    const [paymentWidget, setPaymentWidget] = useState(null);
    const [paymentMethods, setPaymentMethods] = useState(null);
    const [isPaymentReady, setIsPaymentReady] = useState(false);
    const lastAmountRef = useRef(1000); // 기본값으로 초기화

    const bannerImages2 = [bannerImg, bannerImg, bannerImg];

    const SK = useMemo(() => window?.SKYSUNNY || {}, []);

    const movePage = (path) => navigate(path);

    // 토스페이먼츠 공식 설정 (올바른 테스트 키 사용)
    const clientKey = useMemo(() => {
        // 토스 공식 샌드박스 테스트 키 (사용자 제공 키)
        const testKey = "test_gck_vZnjEJeQVxm46AgkyPeMrPmOoBN0";

        const key = SK?.tossClientKey ||
            (typeof import.meta !== "undefined" &&
                (import.meta.env?.VITE_TOSS_CLIENT_KEY_TEST || import.meta.env?.VITE_TOSS_CLIENT_KEY)) ||
            (typeof process !== "undefined" &&
                (process.env?.REACT_APP_TOSS_CLIENT_KEY_TEST || process.env?.REACT_APP_TOSS_CLIENT_KEY)) ||
            testKey;

        console.log('[CheckPaymentToss] Using clientKey:', key);
        return key;
    }, [SK]);

    const customerKey = useMemo(() => {
        return SK?.userId ||
            (typeof localStorage !== "undefined" && localStorage.getItem('userId')) ||
            (typeof localStorage !== "undefined" && localStorage.getItem('accessToken') && "authenticated_user") ||
            `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }, [SK]);

    // ===== 공통 유틸 =====
    const parseAmount = useCallback((v) => {
        if (v == null) return 0;
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        const n = String(v).replace(/[^\d.-]/g, '');
        const num = Number(n);
        return Number.isFinite(num) ? num : 0;
    }, []);

    // passKind (분기 기준)
    const passKind = useMemo(
        () => String(ticketInfo?.passType || ticketInfo?.type || '').toLowerCase(),
        [ticketInfo]
    );

    // 기존 라벨(비-스터디룸용)
    const legacyPassTypeLabel = useMemo(() => {
        const k = String(ticketInfo?.passType || '').toLowerCase();
        switch (k) {
            case 'cash': return '캐시정기권';
            case 'free': return '기간정기권 (자유석)';
            case 'fix': return '기간정기권 (고정석)';
            case '1day': return '1일 이용권';
            case 'locker': return '사물함';
            default: return ticketInfo?.passType || '-';
        }
    }, [ticketInfo?.passType]);

    // ===== 스터디룸 전용 정규화 =====
    const normalizedStudy = useMemo(() => {
        if (passKind !== 'studyroom') return null;
        const t = ticketInfo ?? {};

        const storeName = t.storeName ?? t.store ?? '-';
        const roomName = t.roomName ?? t.productName ?? '-';

        const usageAmountValue = parseAmount(t.priceValue ?? t.totalAmount ?? t.price);
        const usageAmountText = usageAmountValue ? `${usageAmountValue.toLocaleString()}원` : '-';

        const period = t.period ?? t.usagePeriod ?? t.dateRange ?? '-';
        const usageInfo = t.usageInfo ?? period ?? '-';

        return {
            storeName,
            passTypeLabel: '스터디룸',
            productName: roomName,
            usageAmountValue,
            usageAmountText,
            period,
            usageInfo,
        };
    }, [ticketInfo, passKind, parseAmount]);

    // ===== 할인 & 결제금액 =====
    const legacyPrice = useMemo(
        () => parseAmount(ticketInfo?.selectedTicket?.price),
        [ticketInfo, parseAmount]
    );

    const discount = useMemo(
        () => parseAmount(selectedCoupon?.amount ?? selectedCoupon?.discount),
        [selectedCoupon, parseAmount]
    );

    const finalAmount = useMemo(() => {
        if (passKind === 'studyroom') {
            const base = normalizedStudy?.usageAmountValue ?? 0;
            return Math.max(base - discount, 0);
        }
        return Math.max(legacyPrice - discount, 0);
    }, [passKind, normalizedStudy, legacyPrice, discount]);

    const finalAmountText = useMemo(() => {
        if (passKind === 'studyroom') {
            const base = normalizedStudy?.usageAmountValue ?? 0;
            return `${Math.max(base - discount, 0).toLocaleString()}원`;
        }
        const total = Math.max(legacyPrice - discount, 0);
        return `${total.toLocaleString()}원`;
    }, [passKind, normalizedStudy, legacyPrice, discount]);

    useEffect(() => {
        const onInit = (e) => {
            console.log('[CheckPaymentToss:web] skysunny:init detail =', e.detail);
            setTicketInfo(e.detail);
        };
        document.addEventListener('skysunny:init', onInit);
        if (window.SKYSUNNY) onInit({ detail: window.SKYSUNNY });

        return () => {
            document.removeEventListener('skysunny:init', onInit);
        };
    }, []);

    useEffect(() => {
        if ('selectedCoupon' in (location.state || {})) {
            setSelectedCoupon(location.state.selectedCoupon || null);
        }
    }, [location.state]);

    // 토스페이먼츠 위젯 초기화 (DOM 충돌 방지)
    useEffect(() => {
        let isMounted = true;
        let initTimeout;

        async function initializePaymentWidget() {
            try {
                console.log('[CheckPaymentToss] === 토스 결제 위젯 초기화 시작 ===');
                console.log('[CheckPaymentToss] clientKey:', clientKey);
                console.log('[CheckPaymentToss] customerKey:', customerKey);
                console.log('[CheckPaymentToss] finalAmount:', finalAmount);

                // 필수 값 검증
                if (!clientKey || !customerKey) {
                    throw new Error('clientKey 또는 customerKey가 없습니다');
                }

                // DOM 요소가 생성될 때까지 대기 (최대 3초)
                let retryCount = 0;
                let paymentMethodElement, agreementElement;

                while (retryCount < 15 && isMounted) {
                    paymentMethodElement = document.getElementById("payment-method");
                    agreementElement = document.getElementById("agreement");

                    if (paymentMethodElement && agreementElement) {
                        console.log('[CheckPaymentToss] DOM 요소 확인 완료');
                        break;
                    }

                    console.log(`[CheckPaymentToss] DOM 요소 대기 중... (${retryCount + 1}/15)`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                    retryCount++;
                }

                if (!paymentMethodElement || !agreementElement) {
                    throw new Error('DOM 요소를 찾을 수 없습니다 (timeout)');
                }

                if (!isMounted) return;

                // 기존 위젯 정리
                paymentMethodElement.innerHTML = '';
                agreementElement.innerHTML = '';

                // 토스페이먼츠 위젯 로드
                console.log('[CheckPaymentToss] loadPaymentWidget 호출...');
                const paymentWidget = await loadPaymentWidget(clientKey, customerKey);

                if (!isMounted) return;

                console.log('[CheckPaymentToss] PaymentWidget 로드 성공');

                // 결제 방법 위젯 렌더링
                console.log('[CheckPaymentToss] renderPaymentMethods 호출...');
                const paymentMethodsWidget = paymentWidget.renderPaymentMethods("#payment-method", {
                    value: finalAmount || 1000
                });

                console.log('[CheckPaymentToss] PaymentMethods 렌더링 완료');

                // 약관 동의 위젯 렌더링
                console.log('[CheckPaymentToss] renderAgreement 호출...');
                paymentWidget.renderAgreement("#agreement");

                console.log('[CheckPaymentToss] Agreement 렌더링 완료');

                if (!isMounted) return;

                // 상태 업데이트
                setPaymentWidget(paymentWidget);
                setPaymentMethods(paymentMethodsWidget);
                setIsPaymentReady(true);

                console.log('[CheckPaymentToss] === 토스 결제 위젯 초기화 완료 ===');

            } catch (error) {
                console.error('[CheckPaymentToss] ❌ 결제 위젯 초기화 실패:', error);

                if (isMounted) {
                    setIsPaymentReady(false);

                    // 에러 UI 표시
                    const paymentMethodElement = document.getElementById("payment-method");
                    if (paymentMethodElement) {
                        paymentMethodElement.innerHTML = `
                            <div style="padding: 20px; text-align: center; color: #ff6b6b; border: 1px solid #ff6b6b; border-radius: 8px; background: #fff5f5;">
                                <div style="font-weight: bold; margin-bottom: 8px;">⚠️ 결제 위젯 로드 실패</div>
                                <div style="font-size: 12px; line-height: 1.4;">
                                    ${error.message}<br/>
                                    <small style="color: #999;">clientKey: ${clientKey}</small>
                                </div>
                            </div>
                        `;
                    }
                }
            }
        }

        // 약간의 지연 후 초기화 실행 (DOM이 완전히 준비될 때까지)
        initTimeout = setTimeout(initializePaymentWidget, 300);

        return () => {
            isMounted = false;
            if (initTimeout) {
                clearTimeout(initTimeout);
            }

            // 위젯 정리
            try {
                const paymentMethodElement = document.getElementById("payment-method");
                const agreementElement = document.getElementById("agreement");

                if (paymentMethodElement) {
                    paymentMethodElement.innerHTML = '';
                }
                if (agreementElement) {
                    agreementElement.innerHTML = '';
                }

                console.log('[CheckPaymentToss] 위젯 정리 완료');
            } catch (error) {
                console.warn('[CheckPaymentToss] 위젯 정리 중 오류:', error);
            }
        };
    }, [clientKey, customerKey, finalAmount]);

    // 금액 변경 시 위젯 업데이트
    useEffect(() => {
        if (!paymentMethods || !isPaymentReady) return;

        const newAmount = finalAmount || 1000;
        if (lastAmountRef.current === newAmount) return;

        console.log('[CheckPaymentToss] 결제 금액 업데이트:', { from: lastAmountRef.current, to: newAmount });
        try {
            paymentMethods.updateAmount({ value: newAmount });
            lastAmountRef.current = newAmount;
        } catch (error) {
            console.error('[CheckPaymentToss] 금액 업데이트 오류:', error);
        }
    }, [finalAmount, paymentMethods, isPaymentReady]);

    // RN draft 요청
    const needsTarget = (t) => t === 'fix' || t === 'locker';
    const requestDraftViaRN = async () => {
        const passId =
            SK?.selectedTicket?.passId ??
            ticketInfo?.selectedTicket?.passId ??
            SK?.selectedTicket?.id ??
            ticketInfo?.selectedTicket?.id ??
            null;

        const providedTarget =
            SK?.selectedTicket?.targetId ??
            ticketInfo?.selectedTicket?.targetId ??
            0;

        const targetId = needsTarget(passKind) ? Number(providedTarget || 0) : 0;

        if (passKind !== 'studyroom') {
            if (!passId) {
                throw new Error('상품 ID(passId)가 없습니다.');
            }
            if (needsTarget(passKind) && !targetId) {
                throw new Error('좌석/사물함 선택이 필요합니다.');
            }
        }

        const requestPayload = {
            // 기본 정보
            passKind: passKind,
            passId: passId,
            targetId: targetId,
            // 사용자 정보
            userId: SK?.userId || ticketInfo?.userId || localStorage.getItem('userId') || null,
            // 좌석 정보 (targetId가 seatId인 경우)
            seatId: needsTarget(passKind) ? targetId : null,
            // 매장 정보
            storeId: SK?.storeId || ticketInfo?.storeId || null,
            storeName: SK?.storeName || ticketInfo?.storeName || null,
            // 상품 정보
            productName: SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || null,
            price: SK?.selectedTicket?.price || ticketInfo?.selectedTicket?.price || null,
            // 스터디룸 관련 정보 (studyroom인 경우)
            roomName: SK?.roomName || ticketInfo?.roomName || null,
            selectedDate: SK?.selectedDate || ticketInfo?.selectedDate || null,
            period: SK?.period || ticketInfo?.period || null,
            usageInfo: SK?.usageInfo || ticketInfo?.usageInfo || null,
            // 쿠폰 정보
            couponId: selectedCoupon?.id || null,
            couponAmount: selectedCoupon?.amount || selectedCoupon?.discount || 0,
            // 결제 정보
            paymentMethod: 'toss',
            finalAmount: finalAmount
        };

        console.log('[CheckPaymentToss:web] REQUEST_DRAFT → 전체 페이로드:', requestPayload);

        try {
            const result = await sendToRN('REQUEST_DRAFT', requestPayload, 30000);
            console.log('[CheckPaymentToss:web] Draft 생성 성공:', result);
            return result;
        } catch (error) {
            console.error('[CheckPaymentToss:web] Draft 생성 실패:', error);
            throw error;
        }
    };

    // 토스페이먼츠 공식 방식: 구매하기 버튼 클릭
    const onClickBuy = async () => {
        console.log('[CheckPaymentToss] 구매하기 버튼 클릭');

        // 토스 결제 위젯이 준비되지 않은 경우
        if (!paymentWidget || !isPaymentReady) {
            alert('결제 위젯 준비 중입니다. 잠시 후 다시 시도하세요.');
            return;
        }

        // 결제 금액 검증
        const amount = finalAmount || 1000;
        if (!amount || amount <= 0) {
            console.error('[CheckPaymentToss] 유효하지 않은 결제 금액:', amount);
            alert('결제 금액이 올바르지 않습니다.');
            return;
        }

        try {
            console.log('[CheckPaymentToss] 임시 주문 생성 중...');

            // 1. 임시 주문 생성
            const draft = await requestDraftViaRN();
            console.log('[CheckPaymentToss] 임시 주문 생성 완료:', draft);

            // 2. 결제 정보 업데이트
            // sendToRN은 data 객체를 직접 반환하므로 orderNumber를 바로 접근
            const orderNumber = draft?.orderNumber || `order_${Date.now()}`;

            try {
                await window.updatePayment(orderNumber, {
                    amount: amount,
                    couponId: selectedCoupon?.id || null,
                    couponAmount: selectedCoupon?.amount || selectedCoupon?.discount || 0,
                    timestamp: Date.now()
                });
                console.log('[CheckPaymentToss] 결제 정보 업데이트 완료');
            } catch (updateErr) {
                console.warn('[CheckPaymentToss] 결제 정보 업데이트 실패:', updateErr);
                // 업데이트 실패해도 결제는 진행
            }

            // 3. 토스페이먼츠 공식 결제 요청
            const orderId = orderNumber;
            const orderName = SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || '상품';

            // 성공/실패 URL 설정
            const webSuccessUrl = `${window.location.origin}/complete-payment?orderNumber=${encodeURIComponent(orderNumber)}&amount=${amount}`;
            const webFailUrl = `${window.location.origin}/complete-payment?fail=1&orderNumber=${encodeURIComponent(orderNumber)}`;

            console.log('[CheckPaymentToss] 토스 결제 요청:', { orderId, orderName, amount });

            // 4. 토스페이먼츠 공식 결제 요청
            await paymentWidget.requestPayment({
                orderId: orderId,
                orderName: orderName,
                successUrl: webSuccessUrl,
                failUrl: webFailUrl,
                customerEmail: "customer123@gmail.com",
                customerName: "김토스",
                customerMobilePhone: "01012341234",
            });

            console.log('[CheckPaymentToss] 토스 결제 완료 - 리다이렉션 진행 중');

        } catch (error) {
            console.error('[CheckPaymentToss] 결제 처리 오류:', error);

            const errorMessage = error?.message ||
                error?.error?.message ||
                error?.response?.data?.message ||
                '결제 요청 중 오류가 발생했습니다.';

            const errorCode = error?.code ||
                error?.errorCode ||
                error?.response?.data?.code ||
                error?.name;

            alert(`결제 요청 중 오류가 발생했습니다.\ncode=${errorCode || "unknown"}\nmsg=${errorMessage}`);
        }
    };

    return (
        <div className="container checkout-page">
            {/* 상단 바 */}
            <div className="top-bar">
                <div className="top-bar-left">
                    <button
                        onClick={() => {
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'GO_BACK' }));
                            } else {
                                window.history.back();
                            }
                        }}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                    >
                        <img src={backArrow} alt="뒤로가기" className="icon24" />
                    </button>
                </div>
                <div className="top-bar-center">
                    <span className="top-txt font-noto">구매확인</span>
                </div>
            </div>

            {/* 본문 */}
            <div className="content-scroll">

                {/* 배너 */}
                <div className="banner-container">
                    <Banner banners={bannerImages2} type="sub2" />
                </div>

                {/* 구매 정보 */}
                <div className="info-container">
                    <div className="section-title-box">
                        <span className="font-bm section-title">구매정보</span>
                    </div>

                    <div className="info-box">
                        {passKind === 'studyroom' ? (
                            <>
                                <div className="info-row"><span className="info-title">매장명</span><span className="info-text">{normalizedStudy?.storeName}</span></div>
                                <div className="info-row"><span className="info-title">이용권</span><span className="info-text">{normalizedStudy?.passTypeLabel}</span></div>
                                <div className="info-row"><span className="info-title">상품정보</span><span className="info-text">{normalizedStudy?.productName}</span></div>
                                <div className="info-row"><span className="info-title">이용금액</span><span className="info-text">{normalizedStudy?.usageAmountText}</span></div>
                                <div className="info-row"><span className="info-title">이용기간</span><span className="info-text">{normalizedStudy?.period}</span></div>
                                <div className="info-row"><span className="info-title">이용정보</span><span className="info-text">{normalizedStudy?.usageInfo}</span></div>
                            </>
                        ) : (
                            <>
                                <div className="info-row"><span className="info-title">매장명</span><span className="info-text">{ticketInfo?.storeName || '-'}</span></div>
                                <div className="info-row"><span className="info-title">이용권</span><span className="info-text">{legacyPassTypeLabel}</span></div>
                                <div className="info-row"><span className="info-title">상품정보</span><span className="info-text">{ticketInfo?.selectedTicket?.name || '-'}</span></div>
                                <div className="info-row"><span className="info-title">이용금액</span><span className="info-text">{ticketInfo?.selectedTicket?.price || '-'}</span></div>

                                {/* 캐시정기권: 좌석당 할인율 표시 */}
                                {passKind === 'cash' && (
                                    <div className="info-row"><span className="info-title">좌석당 할인율</span><span className="info-text">{ticketInfo?.selectedTicket?.subDescription || '-'}</span></div>
                                )}

                                <div className="info-row"><span className="info-title">이용기간</span><span className="info-text">{ticketInfo?.selectedTicket?.reward || '-'}</span></div>

                                {/* 기간정기권(자유석): 1일 이용정보 표시 */}
                                {passKind === 'free' && (
                                    <div className="info-row"><span className="info-title">1일 이용정보</span><span className="info-text">{ticketInfo?.oneDayInfo || '-'}</span></div>
                                )}
                            </>
                        )}

                        <hr className="line" />

                        <div className="info-row">
                            <span className="info-title">할인쿠폰</span>
                            <button className="coupon-btn" onClick={() => movePage('/check-coupon')}>쿠폰선택</button>
                        </div>

                        <div className="info-row coupon-guide-text">
                            <span className="info-text coupon-guide-text1">사용하실 쿠폰을 선택해주세요.</span>
                        </div>

                        <div className="info-row">
                            {selectedCoupon && (
                                <>
                                    <div className="info-text">{selectedCoupon.title}</div>
                                    <div className="info-img">
                                        <img
                                            src={close}
                                            alt="쿠폰삭제"
                                            className="icon24"
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setSelectedCoupon(null)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <hr className="dashed-line" />

                        <div className="info-row">
                            <span className="info-title">할인금액</span>
                            <span className="info-text">{discount ? `${discount.toLocaleString()}원` : '0원'}</span>
                        </div>
                    </div>
                </div>



                {/* PC/대리인 결제 안내 */}
                <div className="section2-title-box3">
                    <p className="note-text font-bm">PC, 대리인 결제도 가능해요!</p>
                    <div className="copy-url-box">
                        <span className="font-noto url-text">http://skasca.me/cash</span>
                        <img src={copy} alt="info" className="icon14" />
                        <span className="copy-btn" onClick={() => navigator.clipboard.writeText('http://skasca.me/cash')}>URL 복사</span>
                    </div>
                    <div className="line"></div>
                </div>

                {/* 안내사항 */}
                <div className="section2-title-box">
                    <img src={infoIcon} alt="info" className="icon14" />
                    <div className="text-box">
                        <span className="font-bm section-title">안내사항</span>
                    </div>
                </div>
                <div className="section2-title-box2">
                    <p className="note-text font-noto">안내사항입니다.</p>
                </div>

                {/* 토스페이먼츠 공식 결제 위젯 */}
                <div className="toss-payment-widget">
                    <div className="section2-title-box">
                        <div className="text-box">
                            <span className="font-bm section-title">결제 방법</span>
                        </div>
                    </div>

                    {/* 토스페이먼츠 공식 결제 위젯 영역 */}
                    {!isPaymentReady && (
                        <div style={{
                            padding: '40px 20px',
                            textAlign: 'center',
                            color: '#666',
                            fontSize: '14px'
                        }}>
                            결제 위젯을 불러오는 중입니다...
                        </div>
                    )}

                    {/* 결제 방법 위젯 - React가 관리하지 않는 컨테이너 */}
                    <div
                        ref={(el) => {
                            if (el && !el.querySelector('#payment-method')) {
                                const paymentDiv = document.createElement('div');
                                paymentDiv.id = 'payment-method';
                                paymentDiv.style.cssText = `
                                        margin-bottom: 16px;
                                        min-height: 200px;
                                        width: 100%;
                                    `;
                                el.appendChild(paymentDiv);
                            }
                        }}
                        style={{ marginBottom: '16px' }}
                    />

                    {/* 약관 동의 위젯 - React가 관리하지 않는 컨테이너 */}
                    <div
                        ref={(el) => {
                            if (el && !el.querySelector('#agreement')) {
                                const agreementDiv = document.createElement('div');
                                agreementDiv.id = 'agreement';
                                agreementDiv.style.cssText = `
                                        margin-bottom: 16px;
                                        min-height: 50px;
                                        width: 100%;
                                    `;
                                el.appendChild(agreementDiv);
                            }
                        }}
                        style={{ marginBottom: '16px' }}
                    />

                    {/* 로딩 상태 표시 */}
                    {/* {!isPaymentReady && (
                        <div style={{
                            padding: '20px',
                            textAlign: 'center',
                            color: '#666',
                            fontSize: '14px',
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            backgroundColor: '#f9f9f9',
                            marginBottom: '16px'
                        }}>
                            토스 결제 위젯을 불러오는 중입니다...
                        </div>
                    )} */}
                </div>



                <div className="scroll-spacer" aria-hidden />
            </div>

            {/* 하단 고정 */}
            <div className="checkout-footer-fixed">
                <div className="bottom-bar2">
                    <span>결제금액</span>
                    <span>{finalAmountText}</span>
                </div>
                <div className="bottom-button">
                    <button
                        onClick={onClickBuy}
                        disabled={!isPaymentReady}
                        style={{
                            opacity: isPaymentReady ? 1 : 0.6,
                        }}
                    >
                        구매하기
                    </button>
                </div>
            </div>
        </div>
    );
}