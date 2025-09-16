// src/web/CompletePayment.jsx
import { useEffect, useMemo, useState } from 'react';
import infoIcon from "../img/home/payment.png";
import '../styles/main.scss';

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

    // 2) RN에서 결제 완료 데이터 받기
    useEffect(() => {
        let mounted = true;

        const load = async () => {
            console.log('[CompletePayment] RN에서 결제 완료 데이터를 받는 중...');

            // RN에서 결제 완료 데이터를 받기 위한 이벤트 리스너
            const handlePaymentComplete = (event) => {
                try {
                    const paymentData = event.detail || event.data || event;
                    console.log('[CompletePayment] RN에서 받은 결제 완료 데이터:', paymentData);

                    if (paymentData && paymentData.orderNumber) {
                        setData(paymentData);
                        setLoading(false);
                    } else {
                        console.warn('[CompletePayment] 결제 완료 데이터가 올바르지 않습니다:', paymentData);
                        setErrMsg('결제 완료 데이터를 받지 못했습니다.');
                        setLoading(false);
                    }
                } catch (error) {
                    console.error('[CompletePayment] 결제 완료 데이터 처리 오류:', error);
                    setErrMsg('결제 완료 데이터 처리 중 오류가 발생했습니다.');
                    setLoading(false);
                }
            };

            // 다양한 이벤트 리스너 등록
            document.addEventListener('payment:complete', handlePaymentComplete);
            document.addEventListener('skysunny:payment:complete', handlePaymentComplete);
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'PAYMENT_COMPLETE') {
                    handlePaymentComplete(event);
                }
            });

            // RN 브리지 콜백 등록
            if (typeof window.__askRN === 'function') {
                window.__askRN('REQUEST_PAYMENT_COMPLETE', { orderNumber });
            }

            // 타임아웃 설정 (10초 후 에러 처리)
            const timeout = setTimeout(() => {
                if (mounted) {
                    console.warn('[CompletePayment] 결제 완료 데이터 수신 타임아웃');
                    setErrMsg('결제 완료 데이터를 받는 데 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해주세요.');
                    setLoading(false);
                }
            }, 10000);

            return () => {
                document.removeEventListener('payment:complete', handlePaymentComplete);
                document.removeEventListener('skysunny:payment:complete', handlePaymentComplete);
                clearTimeout(timeout);
            };
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

    // 4) 입장하기 → 같은 도메인의 /qr-code로 이동 (표시용 정보 쿼리로 전달)
    const goQr = () => {
        if (typeof window === 'undefined' || !data) return;
        const p = new URLSearchParams({
            orderNumber: String(data.orderNumber || orderNumber || ''),
            storeName: data.storeName || '',
            passType: data.passType || '',
            description: data.productInfo || '',
            amount: String(data.paymentAmount ?? ''),
            paidAt: data.paidAt || '',
            address: '', // 주소가 필요하면 window.SKYSUNNY.address 등으로 채워 넣으세요
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
