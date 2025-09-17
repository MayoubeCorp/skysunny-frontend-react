/**
 * 웹뷰 ↔ React Native 통신 브리지 유틸리티
 * 
 * 사용법:
 * 1. 임시 주문건 생성: window.__askRN('REQUEST_DRAFT');
 * 2. 임시 주문 상세 조회: window.getPaymentDetail(orderNumber);
 * 3. 결제 정보 업데이트: window.updatePayment(orderNumber, data);
 * 4. 구매 요청: window.requestPayment(orderNumber, data);
 * 5. 결제 완료 확인: window.checkPaymentComplete(orderNumber);
 */

/**
 * 브라우저 환경에서 사용할 모크 응답 생성
 * @param {string} action - 액션 타입
 * @param {object} payload - 요청 데이터
 * @returns {object} - 모크 응답 데이터
 */
const createMockResponse = (action, payload) => {
    const timestamp = Date.now();
    const mockOrderNumber = `mock_order_${timestamp}`;

    switch (action) {
        case 'REQUEST_DRAFT':
            return {
                ok: true,
                orderNumber: mockOrderNumber,
                data: {
                    orderNumber: mockOrderNumber,
                    amount: payload.finalAmount || 10000,
                    productName: payload.productName || '테스트 상품',
                    storeName: payload.storeName || '테스트 매장',
                    userId: payload.userId || 'test_user',
                    timestamp: timestamp
                }
            };

        case 'GET_PAYMENT_DETAIL':
            return {
                ok: true,
                orderNumber: payload.orderNumber,
                data: {
                    orderNumber: payload.orderNumber,
                    amount: 10000,
                    productName: '테스트 상품',
                    storeName: '테스트 매장',
                    status: 'pending',
                    createdAt: new Date(timestamp).toISOString()
                }
            };

        case 'UPDATE_PAYMENT':
            return {
                ok: true,
                orderNumber: payload.orderNumber,
                data: {
                    orderNumber: payload.orderNumber,
                    updated: true,
                    timestamp: timestamp
                }
            };

        case 'REQUEST_PAYMENT':
            return {
                ok: true,
                orderNumber: payload.orderNumber,
                data: {
                    orderNumber: payload.orderNumber,
                    paymentKey: `mock_payment_${timestamp}`,
                    status: 'completed',
                    paidAt: new Date(timestamp).toISOString()
                }
            };

        case 'CHECK_PAYMENT_COMPLETE':
            return {
                ok: true,
                orderNumber: payload.orderNumber,
                data: {
                    orderNumber: payload.orderNumber,
                    status: 'completed',
                    amount: 10000,
                    productName: '테스트 상품',
                    storeName: '테스트 매장',
                    paidAt: new Date(timestamp).toISOString()
                }
            };

        default:
            return {
                ok: true,
                data: { message: `Mock response for ${action}` }
            };
    }
};

/**
 * RN으로 메시지를 전송하는 공통 함수
 * @param {string} action - 액션 타입
 * @param {object} payload - 전송할 데이터
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {Promise} - 응답 Promise
 */
export const sendToRN = (action, payload = {}, timeout = 30000) => {
    return new Promise((resolve, reject) => {
        // RN 브리지가 없는 경우 폴백 처리
        if (typeof window.__askRN !== 'function') {
            console.warn(`[WebViewBridge] RN bridge not found for ${action}, using fallback`);

            // 브라우저 환경에서의 폴백 처리
            if (typeof window !== 'undefined' && !window.ReactNativeWebView) {
                console.log(`[WebViewBridge] Browser environment detected, simulating ${action}`);

                // 시뮬레이션된 응답 생성
                setTimeout(() => {
                    const mockResponse = createMockResponse(action, payload);
                    console.log(`[WebViewBridge] Mock response for ${action}:`, mockResponse);
                    resolve(mockResponse);
                }, 500); // 0.5초 지연으로 실제 네트워크 요청 시뮬레이션
                return;
            }

            reject(new Error('RN bridge not found'));
            return;
        }

        let settled = false;
        const done = (fn) => (arg) => {
            if (settled) return;
            settled = true;
            // 이벤트 리스너 정리
            document.removeEventListener('skysunny:reply', onCustomReply);
            window.removeEventListener('message', onWindowMessage);
            try { delete window.onSkysunnyReply; } catch (_) { }
            try { delete window.SKYSUNNY_REPLY; } catch (_) { }
            clearTimeout(timer);
            fn(arg);
        };
        const resolveOnce = done(resolve);
        const rejectOnce = done(reject);

        // 응답 데이터 정규화
        const normalize = (raw) => {
            const d = raw?.detail ?? raw ?? {};
            const responseAction = d.action || d.type;
            const ok = !!d.ok;
            const error = d.error ?? d?.data?.error ?? d?.payload?.error ?? null;
            const data = d.data ?? d.payload ?? d.detail ?? d;
            return { action: responseAction, ok, error, data, raw: d };
        };

        // CustomEvent 리스너
        const onCustomReply = (e) => {
            const n = normalize(e);
            console.log(`[WebViewBridge] receive CustomEvent for ${action}:`, n);
            if (n.action !== action && n.action !== `${action}_REPLY`) return;
            if (n.ok) resolveOnce(n.data);
            else rejectOnce(new Error(n.error || `${action} 실패`));
        };

        // Window message 리스너
        const onWindowMessage = (e) => {
            try {
                const messageData = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (messageData?.source !== 'skysunny') return;
                const n = normalize(messageData);
                console.log(`[WebViewBridge] receive window.message for ${action}:`, n);
                if (n.action !== action && n.action !== `${action}_REPLY`) return;
                if (n.ok) resolveOnce(n.data);
                else rejectOnce(new Error(n.error || `${action} 실패`));
            } catch (err) {
                console.warn(`[WebViewBridge] message parse error for ${action}:`, err);
            }
        };

        // 이벤트 리스너 등록
        document.addEventListener('skysunny:reply', onCustomReply);
        window.addEventListener('message', onWindowMessage);

        // 글로벌 콜백 등록
        window.onSkysunnyReply = (p) => {
            const n = normalize(p);
            console.log(`[WebViewBridge] receive global callback for ${action}:`, n);
            if (n.action !== action && n.action !== `${action}_REPLY`) return;
            if (n.ok) resolveOnce(n.data);
            else rejectOnce(new Error(n.error || `${action} 실패`));
        };
        window.SKYSUNNY_REPLY = window.onSkysunnyReply;

        // 타임아웃 설정
        const timer = setTimeout(() => {
            rejectOnce(new Error(`${action} 응답 타임아웃`));
        }, timeout);

        // RN으로 메시지 전송
        console.log(`[WebViewBridge] sending ${action} to RN:`, payload);
        window.__askRN(action, payload);
    });
};

/**
 * 1. 임시 주문건 생성 (결제 페이지 진입 전)
 * 이미 CheckPayment.js와 CheckPaymentToss.js에 구현되어 있음
 * 사용법: window.__askRN('REQUEST_DRAFT', payload);
 */

/**
 * 2. 임시 주문 상세 조회 (결제 페이지에서)
 * @param {string} orderNumber - 주문번호
 * @returns {Promise} - 주문 상세 정보
 */
window.getPaymentDetail = async (orderNumber) => {
    if (!orderNumber) {
        throw new Error('주문번호가 필요합니다.');
    }

    try {
        const result = await sendToRN('GET_PAYMENT_DETAIL', { orderNumber });
        console.log('[WebViewBridge] getPaymentDetail result:', result);
        return result;
    } catch (error) {
        console.error('[WebViewBridge] getPaymentDetail error:', error);
        throw error;
    }
};

/**
 * 3. 결제 정보 중간 업데이트 (구매하기 버튼 클릭 시)
 * @param {string} orderNumber - 주문번호
 * @param {object} updateData - 업데이트할 결제 정보
 * @returns {Promise} - 업데이트 결과
 */
window.updatePayment = async (orderNumber, updateData = {}) => {
    if (!orderNumber) {
        throw new Error('주문번호가 필요합니다.');
    }

    const payload = {
        orderNumber,
        ...updateData
    };

    try {
        const result = await sendToRN('UPDATE_PAYMENT', payload);
        console.log('[WebViewBridge] updatePayment result:', result);
        return result;
    } catch (error) {
        console.error('[WebViewBridge] updatePayment error:', error);
        throw error;
    }
};

/**
 * 4. 구매 요청 (토스 결제 승인 후)
 * @param {string} orderNumber - 주문번호
 * @param {object} paymentData - 토스에서 받은 결제 정보
 * @returns {Promise} - 구매 요청 결과
 */
window.requestPayment = async (orderNumber, paymentData = {}) => {
    if (!orderNumber) {
        throw new Error('주문번호가 필요합니다.');
    }

    const payload = {
        orderNumber,
        ...paymentData
    };

    try {
        const result = await sendToRN('REQUEST_PAYMENT', payload);
        console.log('[WebViewBridge] requestPayment result:', result);
        return result;
    } catch (error) {
        console.error('[WebViewBridge] requestPayment error:', error);
        throw error;
    }
};

/**
 * 5. 결제 완료 확인 (기존 함수 개선)
 * @param {string} orderNumber - 주문번호
 * @returns {Promise} - 결제 완료 정보
 */
window.checkPaymentComplete = async (orderNumber) => {
    if (!orderNumber) {
        throw new Error('주문번호가 필요합니다.');
    }

    try {
        const result = await sendToRN('CHECK_PAYMENT_COMPLETE', { orderNumber });
        console.log('[WebViewBridge] checkPaymentComplete result:', result);
        return result;
    } catch (error) {
        console.error('[WebViewBridge] checkPaymentComplete error:', error);
        throw error;
    }
};

/**
 * 웹뷰 브리지 초기화 함수
 * 앱 시작 시 한 번 호출하여 전역 함수들을 등록
 */
export const initWebViewBridge = () => {
    const hasRNBridge = typeof window.__askRN === 'function';
    const hasWebView = typeof window.ReactNativeWebView !== 'undefined';

    console.log('[WebViewBridge] 웹뷰 브리지 초기화 완료');
    console.log('[WebViewBridge] 환경 정보:');
    console.log(`- RN Bridge (__askRN): ${hasRNBridge ? '✅ 사용 가능' : '❌ 없음'}`);
    console.log(`- WebView: ${hasWebView ? '✅ 사용 가능' : '❌ 없음 (브라우저 환경)'}`);

    if (!hasRNBridge && !hasWebView) {
        console.log('[WebViewBridge] 🔄 브라우저 환경에서 모크 데이터로 동작합니다.');
    }

    console.log('[WebViewBridge] 사용 가능한 함수들:');
    console.log('- window.__askRN(action, payload) - RN으로 메시지 전송');
    console.log('- window.getPaymentDetail(orderNumber) - 임시 주문 상세 조회');
    console.log('- window.updatePayment(orderNumber, data) - 결제 정보 업데이트');
    console.log('- window.requestPayment(orderNumber, data) - 구매 요청');
    console.log('- window.checkPaymentComplete(orderNumber) - 결제 완료 확인');
};

// 브라우저 환경에서 즉시 초기화
if (typeof window !== 'undefined') {
    initWebViewBridge();
}

export default {
    sendToRN,
    initWebViewBridge
};
