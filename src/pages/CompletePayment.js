// src/web/CompletePayment.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

// 표시할 필드들
const getDisplayFields = () => {
    return [
        { key: 'storeName', label: '매장명' },
        { key: 'passType', label: '이용권' },
        { key: 'productInfo', label: '상품정보' },
        { key: 'paymentAmount', label: '이용금액', isMoney: true },
        { key: 'validDays', label: '이용기간' },
        { type: 'separator' },
        { key: 'usageInfo', label: '이용정보' },
        { key: 'orderNumber', label: '주문번호' },
        { key: 'paidAt', label: '결제일시' },
        { key: 'paymentAmount', label: '결제금액', isMoney: true }
    ];
};

// URL에서 orderNumber 및 aggregateId 추출
const getParamsFromQuery = () => {
    if (typeof window === 'undefined') return { orderNumber: null, aggregateId: null };
    const q = new URLSearchParams(window.location.search);

    // 토스 결제 성공 후 리다이렉트에서 오는 파라미터들을 확인
    const orderNumber = q.get('orderNumber') || q.get('orderId') || q.get('order_id') || q.get('paymentKey');
    const aggregateId = q.get('aggregateId') || q.get('id');

    console.log('[CompletePayment] URL 파라미터 추출:', {
        orderNumber,
        aggregateId,
        allParams: Object.fromEntries(q.entries())
    });

    return { orderNumber, aggregateId };
};

export default function CompletePayment() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errMsg, setErrMsg] = useState('');

    // 1) orderNumber 및 aggregateId 결정 (URL 우선, 없으면 sessionStorage에서 시도)
    const { orderNumber: urlOrderNumber, aggregateId: urlAggregateId } = useMemo(() => {
        return getParamsFromQuery();
    }, []);

    const orderNumber = useMemo(() => {
        if (urlOrderNumber) {
            return urlOrderNumber;
        }

        // sessionStorage에서 toss:draft 확인
        try {
            const draftStr = sessionStorage.getItem('toss:draft');
            if (draftStr) {
                const draft = JSON.parse(draftStr);
                return draft?.orderNumber || null;
            }
        } catch (e) {
            console.warn('[CompletePayment] sessionStorage parse error:', e);
        }

        return null;
    }, [urlOrderNumber]);

    // ✅ iOS 스와이프 뒤로가기 제스처 차단
    useEffect(() => {
        const preventSwipeBack = (e) => {
            // 화면 왼쪽 30px 이내에서 시작하는 터치 차단 (결제 페이지 보호)
            if (e.touches && e.touches[0] && e.touches[0].clientX < 30) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        document.addEventListener('touchstart', preventSwipeBack, { passive: false });
        document.addEventListener('touchmove', preventSwipeBack, { passive: false });

        return () => {
            document.removeEventListener('touchstart', preventSwipeBack);
            document.removeEventListener('touchmove', preventSwipeBack);
        };
    }, []);

    // 2) 결제 완료 데이터 로드 (URL 파라미터 우선, 필요시 RN에서 추가 데이터 요청)
    useEffect(() => {
        let mounted = true;

        const load = async () => {

            if (!orderNumber) {
                setErrMsg('주문번호를 찾을 수 없습니다.');
                setLoading(false);
                return;
            }

            // 1단계: URL 파라미터에서 기본 결제 정보 추출
            const urlParams = new URLSearchParams(window.location.search);

            console.log('[CompletePayment] 🔍 URL 전체 파라미터:', {
                url: window.location.href,
                allParams: Object.fromEntries(urlParams.entries())
            });

            // 토스페이먼츠가 리다이렉트할 때 전달하는 파라미터들
            const orderId = urlParams.get('orderId'); // 토스가 돌려준 랜덤 문자열
            const paymentKey = urlParams.get('paymentKey');
            const amount = urlParams.get('amount') ? Number(urlParams.get('amount')) : null;

            // sessionStorage에서 DB orderId (SK 서버 PK) 가져오기
            let orderIdSk = sessionStorage.getItem('dbOrderId');

            // tossOrderIdMapping에서도 확인 (fallback)
            const mappingStr = sessionStorage.getItem('tossOrderIdMapping');
            let mapping = null;
            if (mappingStr) {
                try {
                    mapping = JSON.parse(mappingStr);
                } catch (e) {
                    console.warn('[CompletePayment] tossOrderIdMapping 파싱 실패:', e);
                }
            }

            console.log('[CompletePayment] 🔍 토스에서 받은 원본 데이터:', {
                '토스가 돌려준 orderId': orderId,
                'paymentKey': paymentKey,
                'amount': amount,
                'orderNumber (우리가 관리)': orderNumber,
                'orderIdSk (sessionStorage)': orderIdSk,
                'tossOrderIdMapping': mapping,
                '⚠️ orderIdSk 상태': orderIdSk ? '✅ 있음' : '❌ 없음 (문제!)',
                '설명': {
                    'orderId': '토스가 리다이렉트할 때 전달 (랜덤 문자열)',
                    'orderIdSk': 'SK 서버 orders 테이블 PK',
                    'orderNumber': '사용자용 주문번호'
                }
            });

            // ⚠️ orderIdSk가 없으면 경고
            if (!orderIdSk) {
                console.error('[CompletePayment] ❌ CRITICAL: orderIdSk가 sessionStorage에 없습니다!');
                console.error('[CompletePayment] sessionStorage 전체 내용:', {
                    dbOrderId: sessionStorage.getItem('dbOrderId'),
                    'toss:draft': sessionStorage.getItem('toss:draft'),
                    tossOrderIdMapping: sessionStorage.getItem('tossOrderIdMapping')
                });
            }

            const urlPaymentData = {
                orderNumber: orderNumber,
                paymentAmount: amount,
                paymentKey: paymentKey,
                orderId: orderId,         // 토스가 돌려준 랜덤 문자열
                orderIdSk: orderIdSk,     // SK 서버 orders 테이블 PK
                // 토스 결제 성공 시 기본 정보
                storeName: urlParams.get('storeName') || '매장',
                passType: urlParams.get('passType') || 'cash',
                productInfo: urlParams.get('productName') || '상품',
                paidAt: new Date().toLocaleString('ko-KR'),
                couponAmount: 0
            };

            console.log('[CompletePayment] 🔍 최종 urlPaymentData:', {
                ...urlPaymentData,
                '명확한 구분': {
                    'orderId': orderId + ' (토스가 돌려준 랜덤 문자열)',
                    'orderIdSk': orderIdSk + ' (SK 서버 PK)',
                    'orderNumber': orderNumber + ' (사용자용)'
                }
            });

            // 결제 승인 직후 RN에 구매 요청 전달 (paymentKey가 있을 때만)
            if (urlPaymentData.paymentKey) {
                try {
                    const paymentData = {
                        paymentKey: urlPaymentData.paymentKey,
                        orderId: urlPaymentData.orderId,              // 토스가 돌려준 랜덤 문자열
                        orderIdSk: urlPaymentData.orderIdSk || null,  // SK 서버 orders 테이블 PK
                        amount: urlPaymentData.paymentAmount || 0,
                    };

                    console.log('[CompletePayment] 🔍 RN으로 전달할 최종 데이터:', {
                        orderNumber,
                        paymentData,
                        '검증': {
                            'paymentKey 존재': !!paymentData.paymentKey,
                            'orderId 존재': !!paymentData.orderId,
                            'orderIdSk 존재': !!paymentData.orderIdSk,
                            'orderIdSk 값': paymentData.orderIdSk
                        },
                        '명확한 구분': {
                            'orderNumber': orderNumber + ' (사용자용 주문번호)',
                            'paymentData.orderId': paymentData.orderId + ' (토스 랜덤 ID)',
                            'paymentData.orderIdSk': (paymentData.orderIdSk || '❌없음') + ' (SK 서버 PK)',
                            'paymentKey': '토스에서 발급한 결제 키'
                        }
                    });

                    if (!paymentData.orderIdSk) {
                        console.error('[CompletePayment] ⚠️ WARNING: orderIdSk (SK 서버 PK)가 없습니다! 서버 에러 발생 가능');
                    }

                    if (typeof window.requestPayment === 'function') {
                        await window.requestPayment(orderNumber, paymentData);
                    }
                } catch (e) {
                    console.error('[CompletePayment] REQUEST_PAYMENT 호출 실패:', e);
                    // 실패하더라도 화면 표시는 계속 진행
                }
            }

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


            console.log('[CompletePayment] 병합된 결제 데이터:', basicPaymentData);

            // 4단계: 기본 데이터가 충분하면 바로 표시
            if (basicPaymentData.orderNumber) {
                const dataWithAggregateId = {
                    ...basicPaymentData,
                    // aggregateId가 없으면 orderNumber를 사용
                    aggregateId: basicPaymentData?.aggregateId || basicPaymentData?.id || orderNumber,
                    // 결제 금액이 없으면 기본값 설정
                    paymentAmount: basicPaymentData.paymentAmount || 50000
                };
                console.log('[CompletePayment] 최종 데이터 설정:', dataWithAggregateId);
                setData(dataWithAggregateId);
                setLoading(false);
                return;
            }

            // 5단계: RN에서 추가 데이터 요청
            try {
                const rnPaymentData = await sendToRN('REQUEST_PAYMENT_COMPLETE', { orderNumber }, 15000);

                if (mounted) {
                    const finalData = {
                        ...basicPaymentData,
                        ...rnPaymentData,
                        orderNumber: orderNumber, // orderNumber는 항상 유지
                        aggregateId: rnPaymentData?.aggregateId
                    };
                    setData(finalData);
                    setLoading(false);
                }
            } catch (error) {
                console.warn('[CompletePayment] RN 데이터 요청 실패, 기본 데이터 사용:', error);
                if (mounted) {
                    // RN 요청 실패해도 기본 데이터로 표시
                    const fallbackData = {
                        ...basicPaymentData,
                        aggregateId: basicPaymentData?.aggregateId
                    };
                    setData(fallbackData);
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
        }
    };

    // 4) 입장하기 → React Router navigate를 사용하여 QR 페이지로 이동
    const goQr = () => {
        if (!data) {
            console.warn('[CompletePayment] 결제 데이터가 없어서 QR 페이지로 이동할 수 없습니다.');
            return;
        }
        // aggregateId 결정 로직 개선 (URL 파라미터 우선)
        const finalOrderNumber = data.orderNumber || orderNumber;
        const finalAggregateId = urlAggregateId || data.aggregateId || data.id || finalOrderNumber;

        console.log('[CompletePayment:goQr] aggregateId 결정:', {
            urlAggregateId,
            dataAggregateId: data.aggregateId,
            dataId: data.id,
            finalOrderNumber,
            finalAggregateId
        });


        // QR 페이지에서 사용할 데이터를 미리 준비
        const qrPayload = {
            // QR 코드 기본 정보 (실제 API 응답과 유사한 구조로 구성)
            qrData: {
                usageSeat: data.seatName || data.seatNumber || null,
                wifiId: data.wifiId || window.SKYSUNNY?.wifiSsid || null,
                wifiPassword: data.wifiPassword || window.SKYSUNNY?.wifiPassword || null,
                entrancePassword: data.entrancePassword || window.SKYSUNNY?.entrancePassword || null,
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
                orderId: finalOrderNumber,
                passId: null,
                aggregateId: finalAggregateId,
                timestamp: Math.floor(Date.now() / 1000) + (30 * 60) // 30분 후 만료
            }
        };


        // sessionStorage에 QR 데이터 저장 (QR 페이지에서 사용)
        try {
            sessionStorage.setItem('qr:payload', JSON.stringify(qrPayload));
        } catch (e) {
        }

        // QrCode.js가 기대하는 파라미터 준비
        const finalToken = window.SKYSUNNY?.accessToken || window.SKYSUNNY?.token || localStorage.getItem('accessToken') || '';
        const finalStoreId = window.SKYSUNNY?.storeId || '';

        const searchParams = {
            aggregateId: String(finalAggregateId || ''),
            token: finalToken,
            storeId: String(finalStoreId)
        };

        // 빈 값 제거 (QR 페이지에서 파라미터 파싱 시 문제 방지)
        Object.keys(searchParams).forEach(key => {
            if (!searchParams[key] || searchParams[key] === 'undefined' || searchParams[key] === 'null') {
                delete searchParams[key];
            }
        });


        // React Router navigate를 사용하여 이동 (SPA 방식)
        try {
            const searchString = new URLSearchParams(searchParams).toString();
            const qrPath = `/qr-code?${searchString}`;


            navigate(qrPath);
        } catch (error) {
            console.error('[CompletePayment] React Router navigate 실패, 폴백 사용:', error);

            // 폴백: window.location 사용
            const p = new URLSearchParams(searchParams);
            const qrUrl = `${window.location.origin}/qr-code?${p.toString()}`;
            window.location.href = qrUrl;
        }
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
        <div className="complete-container" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
            {/* 이미지 */}
            <img src={infoIcon} alt="payment" className="payment-img" />

            {/* 결제 완료 안내 */}
            <div className="notice-box">
                <span className="notice-text font-bm">결제가 완료되었습니다.</span>
            </div>

            {/* 정보 카드 */}
            <div className="info-card">
                {getDisplayFields().map((field, index) => {
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
