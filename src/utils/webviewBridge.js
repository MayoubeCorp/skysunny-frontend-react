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
 * 6. 결제 전 최종 검증 함수
 * @param {string} orderNumber - 주문번호 (선택사항)
 * @param {number} contextAmount - 결제 페이지에서 전달하는 금액 (선택사항)
 * @returns {object} - 검증 결과 { success: boolean, amount?: number, error?: string }
 */
window.finalPaymentCheck = (orderNumber = null, contextAmount = null) => {
    try {
        console.log('[WebViewBridge] finalPaymentCheck 시작:', { orderNumber });

        // 1. 기본 환경 검증
        const SK = window?.SKYSUNNY || {};
        const hasValidEnvironment = typeof window !== 'undefined';

        if (!hasValidEnvironment) {
            return {
                success: false,
                error: '결제 환경이 올바르지 않습니다.'
            };
        }

        // 2. 주문 정보 검증 - 다양한 소스에서 금액 정보 수집
        let validatedAmount = null;
        let validatedOrderId = orderNumber;

        // 여러 소스에서 금액 정보 수집
        const amountSources = [];

        // 1. 컨텍스트에서 전달된 금액 (최우선)
        if (contextAmount != null) {
            const parsedAmount = Number(contextAmount);
            if (!isNaN(parsedAmount) && parsedAmount > 0) {
                amountSources.push({ source: 'contextAmount', value: parsedAmount });
            }
        }

        // 2. SKYSUNNY 객체에서 주문 정보 확인
        if (SK?.order) {
            const skAmount = SK.order.amount;
            if (skAmount != null) {
                const parsedAmount = Number(skAmount);
                if (!isNaN(parsedAmount) && parsedAmount > 0) {
                    amountSources.push({ source: 'SKYSUNNY.order.amount', value: parsedAmount });
                }
            }
            validatedOrderId = validatedOrderId || SK.order.id;
        }

        // URL 쿼리에서 주문 정보 확인
        const urlParams = new URLSearchParams(window.location.search);
        const urlAmount = urlParams.get('amount');
        if (urlAmount != null) {
            const parsedAmount = Number(urlAmount);
            if (!isNaN(parsedAmount) && parsedAmount > 0) {
                amountSources.push({ source: 'URL.amount', value: parsedAmount });
            }
        }

        if (!validatedOrderId) {
            validatedOrderId = urlParams.get('orderId') || urlParams.get('orderNumber');
        }

        // 추가 주문번호 소스 확인
        if (!validatedOrderId) {
            // sessionStorage에서 확인
            try {
                const draftStr = sessionStorage.getItem('toss:draft');
                if (draftStr) {
                    const draft = JSON.parse(draftStr);
                    validatedOrderId = draft?.orderNumber || draft?.data?.orderNumber;
                }
            } catch (e) {
                console.warn('[WebViewBridge] sessionStorage draft parse error:', e);
            }
        }

        if (!validatedOrderId) {
            // localStorage에서 확인
            validatedOrderId = localStorage.getItem('lastOrderNumber');
        }

        // 전역 변수에서 금액 확인 (결제 페이지에서 계산된 값들)
        if (typeof window !== 'undefined') {
            // CheckPaymentToss에서 사용하는 finalAmount
            if (window.finalAmount != null) {
                const parsedAmount = Number(window.finalAmount);
                if (!isNaN(parsedAmount) && parsedAmount > 0) {
                    amountSources.push({ source: 'window.finalAmount', value: parsedAmount });
                }
            }

            // 기타 가능한 금액 변수들
            if (window.paymentAmount != null) {
                const parsedAmount = Number(window.paymentAmount);
                if (!isNaN(parsedAmount) && parsedAmount > 0) {
                    amountSources.push({ source: 'window.paymentAmount', value: parsedAmount });
                }
            }
        }

        // 가장 신뢰할 수 있는 금액 선택 (우선순위: contextAmount > window.finalAmount > SKYSUNNY > URL)
        if (amountSources.length > 0) {
            const priorityOrder = ['contextAmount', 'window.finalAmount', 'window.paymentAmount', 'SKYSUNNY.order.amount', 'URL.amount'];

            for (const priority of priorityOrder) {
                const found = amountSources.find(source => source.source === priority);
                if (found) {
                    validatedAmount = found.value;
                    break;
                }
            }

            // 우선순위에 없는 경우 첫 번째 값 사용
            if (validatedAmount === null) {
                validatedAmount = amountSources[0].value;
            }
        }

        console.log('[WebViewBridge] finalPaymentCheck - 금액 소스들:', amountSources);
        console.log('[WebViewBridge] finalPaymentCheck - 선택된 금액:', validatedAmount);

        // 3. 금액 검증
        if (validatedAmount === null || validatedAmount <= 0) {
            console.warn('[WebViewBridge] finalPaymentCheck - 유효한 금액을 찾을 수 없음:', {
                skysunnyAmount: SK?.order?.amount,
                urlAmount: new URLSearchParams(window.location.search).get('amount'),
                validatedAmount
            });
            return {
                success: false,
                error: '결제 금액을 확인할 수 없습니다. 페이지를 새로고침해주세요.'
            };
        }

        if (validatedAmount > 10000000) { // 1천만원 초과 방지
            return {
                success: false,
                error: '결제 금액이 너무 큽니다. 고객센터에 문의해주세요.'
            };
        }

        // 4. 주문번호 검증 (선택적)
        if (validatedOrderId && validatedOrderId.length < 3) {
            console.warn('[WebViewBridge] finalPaymentCheck - 주문번호가 너무 짧음:', validatedOrderId);
            return {
                success: false,
                error: '주문번호가 올바르지 않습니다.'
            };
        }

        // 주문번호가 없는 경우 임시 생성 (결제 시스템에서 자동 생성되는 경우 대비)
        if (!validatedOrderId) {
            validatedOrderId = `temp_order_${Date.now()}`;
            console.log('[WebViewBridge] finalPaymentCheck - 임시 주문번호 생성:', validatedOrderId);
        }

        // 5. 네트워크 상태 검증
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return {
                success: false,
                error: '네트워크 연결을 확인해주세요.'
            };
        }

        // 6. 중복 결제 방지 (세션 스토리지 활용)
        const lastPaymentKey = `payment_${validatedOrderId}`;
        const lastPaymentTime = sessionStorage.getItem(lastPaymentKey);
        const now = Date.now();

        if (lastPaymentTime && (now - parseInt(lastPaymentTime)) < 5000) { // 5초 내 중복 방지
            return {
                success: false,
                error: '이미 결제가 진행 중입니다. 잠시 후 다시 시도해주세요.'
            };
        }

        // 7. 결제 진행 시간 기록
        sessionStorage.setItem(lastPaymentKey, now.toString());

        console.log('[WebViewBridge] finalPaymentCheck 성공:', {
            orderId: validatedOrderId,
            amount: validatedAmount
        });

        return {
            success: true,
            amount: validatedAmount,
            orderId: validatedOrderId
        };

    } catch (error) {
        console.error('[WebViewBridge] finalPaymentCheck 오류:', error);
        return {
            success: false,
            error: '결제 검증 중 오류가 발생했습니다.'
        };
    }
};

/**
 * 7. 결제 디버깅 정보 함수
 * @returns {object} - 디버깅에 필요한 결제 관련 정보
 */
window.debugPaymentInfo = () => {
    try {
        const SK = window?.SKYSUNNY || {};
        const urlParams = new URLSearchParams(window.location.search);
        const now = new Date();

        const debugInfo = {
            timestamp: now.toISOString(),
            environment: {
                userAgent: navigator.userAgent,
                url: window.location.href,
                origin: window.location.origin,
                isOnline: navigator.onLine,
                language: navigator.language
            },
            skysunny: {
                available: !!window.SKYSUNNY,
                userId: SK?.userId || 'not_set',
                order: SK?.order || null,
                tossClientKey: SK?.tossClientKey ? '***설정됨***' : 'not_set'
            },
            urlParams: {
                orderId: urlParams.get('orderId'),
                amount: urlParams.get('amount'),
                userId: urlParams.get('userId'),
                tossClientKey: urlParams.get('tossClientKey') ? '***설정됨***' : null
            },
            webviewBridge: {
                hasAskRN: typeof window.__askRN === 'function',
                hasReactNativeWebView: typeof window.ReactNativeWebView !== 'undefined',
                availableFunctions: [
                    'getPaymentDetail',
                    'updatePayment',
                    'requestPayment',
                    'checkPaymentComplete',
                    'finalPaymentCheck',
                    'debugPaymentInfo'
                ].filter(fn => typeof window[fn] === 'function')
            },
            sessionStorage: {
                paymentKeys: Object.keys(sessionStorage).filter(key => key.startsWith('payment_'))
            },
            localStorage: {
                paymentKeys: Object.keys(localStorage).filter(key => key.startsWith('payment_'))
            }
        };

        console.log('[WebViewBridge] 디버깅 정보:', debugInfo);
        return debugInfo;

    } catch (error) {
        console.error('[WebViewBridge] debugPaymentInfo 오류:', error);
        return {
            error: '디버깅 정보 수집 중 오류가 발생했습니다.',
            timestamp: new Date().toISOString()
        };
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
    console.log('- window.finalPaymentCheck(orderNumber) - 결제 전 최종 검증');
    console.log('- window.debugPaymentInfo() - 결제 디버깅 정보 조회');
};

// 브라우저 환경에서 즉시 초기화
if (typeof window !== 'undefined') {
    initWebViewBridge();
}

export default {
    sendToRN,
    initWebViewBridge
};
