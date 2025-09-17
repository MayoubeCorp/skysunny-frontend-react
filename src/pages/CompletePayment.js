// src/web/CompletePayment.jsx
import { useEffect, useMemo, useState } from 'react';
import infoIcon from "../img/home/payment.png";
import '../styles/main.scss';
// webviewBridge 유틸리티 import
import { sendToRN } from '../utils/webviewBridge.js';

// 금액 포맷
const toMoney = (v) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? `${n.toLocaleString()}원` : (v ?? '-');
};

// passType별 표시명 매핑
const getPassTypeDisplayName = (passType) => {
    switch (passType) {
        case 'cash': return '캐시정기권';
        case 'free': return '기간정기권(자유석)';
        case 'fix': return '기간정기권(고정석)';
        case '1day': return '1일 이용권';
        case 'locker': return '사물함';
        case 'studyroom': return '스터디룸';
        default: return passType || '이용권';
    }
};

// passType별 표시할 필드들을 반환하는 함수
const getDisplayFields = (passType) => {
    const commonFields = [
        { key: 'storeName', label: '매장명' },
        { key: 'passType', label: '이용권' },
        { key: 'productInfo', label: '상품정보' },
        { key: 'paymentAmount', label: '이용금액', isMoney: true },
        { key: 'validDays', label: '이용기간' }
    ];

    const separator = { type: 'separator' };

    let additionalFields = [];

    switch (passType) {
        case 'cash':
            additionalFields = [
                { key: 'usageInfo', label: '이용정보' },
                { key: 'orderNumber', label: '주문번호' },
                { key: 'paidAt', label: '결제일시' },
                { key: 'paymentAmount', label: '결제금액', isMoney: true }
            ];
            break;
        case 'free':
            additionalFields = [
                { key: 'usageInfo', label: '이용정보' },
                { key: 'oneDayInfo', label: '1일 이용정보' },
                { key: 'orderNumber', label: '주문번호' },
                { key: 'paidAt', label: '결제일시' },
                { key: 'paymentAmount', label: '결제금액', isMoney: true }
            ];
            break;
        case 'fix':
        case '1day':
            additionalFields = [
                { key: 'usageInfo', label: '이용정보' },
                { key: 'orderNumber', label: '주문번호' },
                { key: 'paidAt', label: '결제일시' },
                { key: 'paymentAmount', label: '결제금액', isMoney: true }
            ];
            break;
        case 'locker':
        case 'studyroom':
            additionalFields = [
                { key: 'orderNumber', label: '주문번호' },
                { key: 'paidAt', label: '결제일시' },
                { key: 'paymentAmount', label: '결제금액', isMoney: true }
            ];
            break;
        default:
            // 기본값: 모든 필드 표시
            additionalFields = [
                { key: 'usageInfo', label: '이용정보' },
                { key: 'expireText', label: '만료까지' },
                { key: 'remainingInfo', label: '잔여정보' },
                { key: 'oneDayInfo', label: '1일 이용정보' },
                { key: 'orderNumber', label: '주문번호' },
                { key: 'paidAt', label: '결제일시' },
                { key: 'paymentAmount', label: '결제금액', isMoney: true }
            ];
    }

    return [...commonFields, separator, ...additionalFields];
};

// URL에서 orderNumber 추출
const getOrderNumberFromQuery = () => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);

    // 토스 결제 성공 후 리다이렉트에서 오는 파라미터들을 확인
    // orderId (토스 표준), orderNumber (커스텀), paymentKey, amount 등
    const orderNumber = q.get('orderNumber') || q.get('orderId') || q.get('order_id') || q.get('paymentKey');

    console.log('[CompletePayment] URL parameters:', {
        orderNumber: q.get('orderNumber'),
        orderId: q.get('orderId'),
        order_id: q.get('order_id'),
        paymentKey: q.get('paymentKey'),
        amount: q.get('amount'),
        allParams: Object.fromEntries(q.entries())
    });

    return orderNumber;
};

export default function CompletePayment() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errMsg, setErrMsg] = useState('');

    // 1) orderNumber 결정 (URL 우선, 없으면 다양한 소스에서 시도)
    const orderNumber = useMemo(() => {
        console.log('[CompletePayment] orderNumber 추출 시작...');

        const fromQuery = getOrderNumberFromQuery();
        if (fromQuery) {
            console.log('[CompletePayment] ✅ orderNumber from query:', fromQuery);
            return fromQuery;
        }

        // sessionStorage에서 toss:draft 확인 (CheckPayment에서 저장)
        let fromSessionDraft = null;
        try {
            const draftStr = typeof window !== 'undefined' ? sessionStorage.getItem('toss:draft') : null;
            console.log('[CompletePayment] sessionStorage draft string:', draftStr);
            if (draftStr) {
                const draft = JSON.parse(draftStr);
                fromSessionDraft = draft?.orderNumber || draft?.data?.orderNumber || null;
                console.log('[CompletePayment] ✅ orderNumber from sessionStorage draft:', fromSessionDraft);
            }
        } catch (e) {
            console.warn('[CompletePayment] sessionStorage draft parse error:', e);
        }

        if (fromSessionDraft) return fromSessionDraft;

        const SK = (typeof window !== 'undefined' && window.SKYSUNNY) || {};
        const fromSK = SK?.orderNumber || SK?.lastOrderNumber || SK?.order?.id || null;

        console.log('[CompletePayment] window.SKYSUNNY:', SK);
        console.log('[CompletePayment] orderNumber from SKYSUNNY:', fromSK);

        // localStorage에 저장된 orderNumber가 있는지 확인
        const fromStorage = typeof window !== 'undefined' ? localStorage.getItem('lastOrderNumber') : null;
        console.log('[CompletePayment] orderNumber from localStorage:', fromStorage);

        const finalOrderNumber = fromSK || fromStorage || null;
        console.log('[CompletePayment] 🎯 최종 orderNumber:', finalOrderNumber);

        return finalOrderNumber;
    }, []);

    // 2) 결제 완료 데이터 로드 (URL 파라미터 우선, 필요시 RN에서 추가 데이터 요청)
    useEffect(() => {
        let mounted = true;

        const load = async () => {
            console.log('[CompletePayment] 결제 완료 데이터 로드 시작...');

            if (!orderNumber) {
                console.error('[CompletePayment] orderNumber가 없습니다.');
                setErrMsg('주문번호를 찾을 수 없습니다.');
                setLoading(false);
                return;
            }

            // 1단계: URL 파라미터에서 기본 결제 정보 추출
            const urlParams = new URLSearchParams(window.location.search);
            const urlPaymentData = {
                orderNumber: orderNumber,
                paymentAmount: urlParams.get('amount') ? Number(urlParams.get('amount')) : null,
                paymentKey: urlParams.get('paymentKey'),
                // 토스 결제 성공 시 기본 정보
                storeName: urlParams.get('storeName') || '매장',
                passType: urlParams.get('passType') || 'cash',
                productInfo: urlParams.get('productName') || '상품',
                paidAt: new Date().toLocaleString('ko-KR'),
                couponAmount: 0
            };

            console.log('[CompletePayment] URL에서 추출한 결제 데이터:', urlPaymentData);

            // 2단계: sessionStorage에서 추가 정보 확인
            let sessionData = {};
            try {
                const draftStr = sessionStorage.getItem('toss:draft');
                if (draftStr) {
                    const draft = JSON.parse(draftStr);
                    sessionData = {
                        storeName: draft.storeName || sessionData.storeName,
                        passType: draft.passKind || draft.passType || sessionData.passType,
                        productInfo: draft.productName || sessionData.productInfo,
                        paymentAmount: draft.finalAmount || sessionData.paymentAmount,
                        validDays: draft.validDays || '30일',
                        usageInfo: draft.usageInfo || '이용정보'
                    };
                    console.log('[CompletePayment] sessionStorage에서 추가 정보:', sessionData);
                }
            } catch (e) {
                console.warn('[CompletePayment] sessionStorage 파싱 오류:', e);
            }

            // 3단계: 기본 데이터 병합
            const basicPaymentData = {
                ...urlPaymentData,
                ...sessionData,
                // 필수 필드 기본값 설정
                storeName: sessionData.storeName || urlPaymentData.storeName || '매장',
                passType: sessionData.passType || urlPaymentData.passType || 'cash',
                productInfo: sessionData.productInfo || urlPaymentData.productInfo || '상품',
                paymentAmount: sessionData.paymentAmount || urlPaymentData.paymentAmount || 0,
                validDays: sessionData.validDays || '30일',
                usageInfo: sessionData.usageInfo || '이용정보'
            };

            console.log('[CompletePayment] 병합된 기본 결제 데이터:', basicPaymentData);

            // 4단계: 기본 데이터가 충분하면 바로 표시, 아니면 RN에서 추가 데이터 요청
            if (basicPaymentData.paymentAmount && basicPaymentData.paymentAmount > 0) {
                console.log('[CompletePayment] 기본 데이터로 결제 완료 화면 표시');
                setData(basicPaymentData);
                setLoading(false);
                return;
            }

            // 5단계: RN에서 추가 데이터 요청
            console.log('[CompletePayment] RN에서 추가 결제 데이터 요청...');
            try {
                const rnPaymentData = await sendToRN('REQUEST_PAYMENT_COMPLETE', { orderNumber }, 15000);
                console.log('[CompletePayment] RN에서 받은 추가 결제 데이터:', rnPaymentData);

                if (mounted) {
                    const finalData = {
                        ...basicPaymentData,
                        ...rnPaymentData,
                        orderNumber: orderNumber // orderNumber는 항상 유지
                    };
                    console.log('[CompletePayment] 최종 결제 데이터:', finalData);
                    setData(finalData);
                    setLoading(false);
                }
            } catch (error) {
                console.warn('[CompletePayment] RN 데이터 요청 실패, 기본 데이터 사용:', error);
                if (mounted) {
                    // RN 요청 실패해도 기본 데이터로 표시
                    setData(basicPaymentData);
                    setLoading(false);
                }
            }
        };

        load();
        return () => { mounted = false; };
    }, [orderNumber]);

    // 3) 홈 탭으로 이동 (RN 브리지 → 웹 폴백)
    const goHome = () => {
        try {
            const payload = { action: 'GO_HOME', tab: '홈' };
            if (typeof window !== 'undefined' && typeof window.__askRN === 'function') {
                window.__askRN(payload.action, { tab: payload.tab });
                return;
            }
            if (typeof window !== 'undefined' &&
                window.ReactNativeWebView &&
                typeof window.ReactNativeWebView.postMessage === 'function') {
                window.ReactNativeWebView.postMessage(JSON.stringify(payload));
                return;
            }
            // 웹 폴백: 루트로 이동
            if (typeof window !== 'undefined') {
                window.location.replace(`${window.location.origin}/`);
            }
        } catch (e) {
            console.log('[CompletePayment] goHome error', e);
        }
    };

    // 4) 입장하기 → 같은 도메인의 /qr-code로 이동 (QR 코드 페이지가 기대하는 파라미터 형식으로 전달)
    const goQr = () => {
        if (typeof window === 'undefined' || !data) return;

        // QR 페이지에서 사용할 데이터를 미리 준비
        const qrPayload = {
            // QR 코드 기본 정보 (실제 API 응답과 유사한 구조로 구성)
            qrData: {
                usageSeat: data.seatName || data.seatNumber || null,
                wifiId: window.SKYSUNNY?.wifiSsid || null,
                wifiPassword: window.SKYSUNNY?.wifiPassword || null,
                entrancePassword: window.SKYSUNNY?.entrancePassword || null,
                imageUrl: null // QR 이미지는 API에서 받아와야 함
            },
            orderDetails: {
                storeName: data.storeName || window.SKYSUNNY?.storeName || null,
                passType: data.passType || null,
                productInfo: data.productInfo || null
            },
            attachedInfo: {
                usageInfo: data.usageInfo || data.validDays || null,
                expireText: data.expireText || null,
                remainingInfo: data.remainingInfo || null
            },
            qrIdentifier: {
                orderId: data.orderNumber || orderNumber || null,
                passId: null,
                aggregateId: data.orderNumber || orderNumber || null,
                timestamp: Math.floor(Date.now() / 1000) + (30 * 60) // 30분 후 만료
            }
        };

        // sessionStorage에 QR 데이터 저장 (QR 페이지에서 사용)
        try {
            sessionStorage.setItem('qr:payload', JSON.stringify(qrPayload));
            console.log('[CompletePayment] QR 데이터 sessionStorage 저장:', qrPayload);
        } catch (e) {
            console.warn('[CompletePayment] QR 데이터 sessionStorage 저장 실패:', e);
        }

        // QrCode.js가 기대하는 파라미터 형식으로 전달
        const p = new URLSearchParams({
            // QrCode.js의 getQuery()에서 찾는 파라미터들
            aggregateId: String(data.orderNumber || orderNumber || ''), // orderNumber를 aggregateId로 전달
            id: String(data.orderNumber || orderNumber || ''), // 백업용
            token: window.SKYSUNNY?.accessToken || window.SKYSUNNY?.token || localStorage.getItem('accessToken') || '', // 토큰이 있으면 전달
            storeId: String(window.SKYSUNNY?.storeId || ''), // 매장 ID

            // 추가 정보 (QR 페이지에서 직접 사용하지는 않지만 디버깅용)
            storeName: data.storeName || '',
            passType: data.passType || '',
            productInfo: data.productInfo || '',
            amount: String(data.paymentAmount ?? ''),
            paidAt: data.paidAt || ''
        });

        console.log('[CompletePayment] QR 페이지로 이동:', {
            orderNumber: data.orderNumber || orderNumber,
            aggregateId: data.orderNumber || orderNumber,
            token: (window.SKYSUNNY?.accessToken || localStorage.getItem('accessToken')) ? 'present' : 'missing',
            storeId: window.SKYSUNNY?.storeId,
            qrPayload: qrPayload,
            url: `${window.location.origin}/qr-code?${p.toString()}`
        });

        const base = window.location.origin;
        window.location.assign(`${base}/qr-code?${p.toString()}`);
    };

    // 5) 로딩/에러 UI
    if (loading) {
        return (
            <div className="complete-container">
                <img src={infoIcon} alt="payment" className="payment-img" />
                <div className="notice-box">
                    <span className="notice-text font-bm">결제 정보를 불러오는 중입니다...</span>
                </div>
            </div>
        );
    }
    if (errMsg) {
        return (
            <div className="complete-container">
                <img src={infoIcon} alt="payment" className="payment-img" />
                <div className="notice-box">
                    <span className="notice-text font-bm">{errMsg}</span>
                </div>
                <div className="bottom-bar">
                    <button className="bottom-btn" onClick={goHome}>닫기</button>
                </div>
            </div>
        );
    }

    // 6) 정상 렌더
    return (
        <div className="complete-container">
            {/* 이미지 */}
            <img src={infoIcon} alt="payment" className="payment-img" />

            {/* 결제 완료 안내 */}
            <div className="notice-box">
                <span className="notice-text font-bm">결제가 완료되었습니다.</span>
            </div>

            {/* 정보 카드 */}
            <div className="info-card">
                {getDisplayFields(data.passType).map((field, index) => {
                    if (field.type === 'separator') {
                        return <div key={index} className="line"></div>;
                    }

                    const value = data[field.key];
                    const displayValue = field.isMoney ? toMoney(value) : (value || '-');

                    // passType 필드인 경우 표시명으로 변환
                    const finalValue = field.key === 'passType' ? getPassTypeDisplayName(value) : displayValue;

                    return (
                        <div key={index} className="info-row">
                            <span className="title">{field.label}</span>
                            <span className="text">{finalValue}</span>
                        </div>
                    );
                })}

                {/* 쿠폰할인은 모든 passType에서 표시 (값이 있을 때만) */}
                {!!data.couponAmount && (
                    <div className="info-row">
                        <span className="title">쿠폰할인</span>
                        <span className="text">-{toMoney(data.couponAmount)}</span>
                    </div>
                )}
            </div>

            {/* 입장하기 */}
            <div className="enter-btn-box">
                <button className="enter-btn" onClick={goQr}>입장하기</button>
            </div>

            {/* 닫기 → HomeTab 이동 */}
            <div className="bottom-bar">
                <button className="bottom-btn" onClick={goHome}>닫기</button>
            </div>
        </div>
    );
}
