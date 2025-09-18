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
    const lastAmountRef = useRef(1000);

    const bannerImages2 = [bannerImg, bannerImg, bannerImg];

    const SK = useMemo(() => window?.SKYSUNNY || {}, []);

    const movePage = (path) => navigate(path);

    // 토스페이먼츠 공식 설정
    const clientKey = useMemo(() => {
        const testKey = "test_gck_vZnjEJeQVxm46AgkyPeMrPmOoBN0";
        const key =
            SK?.tossClientKey ||
            (typeof import.meta !== "undefined" &&
                (import.meta.env?.VITE_TOSS_CLIENT_KEY_TEST || import.meta.env?.VITE_TOSS_CLIENT_KEY)) ||
            (typeof process !== "undefined" &&
                (process.env?.REACT_APP_TOSS_CLIENT_KEY_TEST || process.env?.REACT_APP_TOSS_CLIENT_KEY)) ||
            testKey;

        console.log('[CheckPaymentToss] Using clientKey:', key);
        return key;
    }, [SK]);

    const customerKey = useMemo(() => {
        return (
            SK?.userId ||
            (typeof localStorage !== "undefined" && localStorage.getItem('userId')) ||
            (typeof localStorage !== "undefined" && localStorage.getItem('accessToken') && "authenticated_user") ||
            `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`
        );
    }, [SK]);

    // ===== 공통 유틸 =====
    const parseAmount = useCallback((v) => {
        if (v == null || v === undefined) return 0;

        if (typeof v === 'number') {
            const result = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
            console.log('[parseAmount] 숫자 입력:', { input: v, output: result });
            return result;
        }

        if (typeof v === 'string') {
            const cleaned = v.replace(/[^\d]/g, '');
            const num = Number(cleaned);
            const result = Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
            console.log('[parseAmount] 문자열 입력:', {
                input: v,
                cleaned: cleaned,
                parsed: num,
                output: result
            });
            return result;
        }

        console.log('[parseAmount] 기타 타입:', { input: v, type: typeof v, output: 0 });
        return 0;
    }, []);

    // passKind
    const passKind = useMemo(
        () => String(ticketInfo?.passType || ticketInfo?.type || '').toLowerCase(),
        [ticketInfo]
    );

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

    // 스터디룸 전용 정규화
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

    // 할인 & 결제금액
    const legacyPrice = useMemo(() => {
        const price = ticketInfo?.selectedTicket?.price;
        const parsed = parseAmount(price);
        console.log('[CheckPaymentToss] legacyPrice 계산:', {
            rawPrice: price,
            parsedPrice: parsed,
            ticketInfo: ticketInfo?.selectedTicket
        });
        return parsed;
    }, [ticketInfo, parseAmount]);

    const discount = useMemo(
        () => parseAmount(selectedCoupon?.amount ?? selectedCoupon?.discount),
        [selectedCoupon, parseAmount]
    );

    const finalAmount = useMemo(() => {
        let result;
        if (passKind === 'studyroom') {
            const base = normalizedStudy?.usageAmountValue ?? 0;
            result = Math.max(base - discount, 0);
        } else {
            result = Math.max(legacyPrice - discount, 0);
        }

        if (result <= 0) {
            console.warn('[CheckPaymentToss] 계산된 금액이 0 이하입니다. 기본값 1000원 사용');
            result = 1000;
        }

        console.log('[CheckPaymentToss] finalAmount 계산:', {
            passKind,
            legacyPrice,
            discount,
            result,
            ticketPrice: ticketInfo?.selectedTicket?.price,
            hasTicketInfo: !!ticketInfo,
            hasSelectedTicket: !!ticketInfo?.selectedTicket
        });

        return result;
    }, [passKind, normalizedStudy, legacyPrice, discount, ticketInfo]);

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
            console.log('[CheckPaymentToss:web] selectedTicket 정보:', e.detail?.selectedTicket);

            const defaultTicketInfo = {
                storeName: '매장',
                passType: 'cash',
                selectedTicket: {
                    name: '상품',
                    price: '1000원',
                    id: 1
                }
            };

            const mergedInfo = {
                ...defaultTicketInfo,
                ...e.detail,
                selectedTicket: {
                    ...defaultTicketInfo.selectedTicket,
                    ...e.detail?.selectedTicket
                }
            };

            console.log('[CheckPaymentToss:web] 병합된 ticketInfo:', mergedInfo);
            setTicketInfo(mergedInfo);
        };

        document.addEventListener('skysunny:init', onInit);

        if (window.SKYSUNNY) {
            console.log('[CheckPaymentToss:web] window.SKYSUNNY 즉시 설정:', window.SKYSUNNY);
            onInit({ detail: window.SKYSUNNY });
        } else {
            console.log('[CheckPaymentToss:web] window.SKYSUNNY 없음, 기본값으로 초기화');
            onInit({ detail: {} });
        }

        // 디버깅 유틸
        try {
            window.__paymentDebug = {
                parseAmount,
                testAmountParsing: () => {
                    const testCases = ['35,000원', '35000원', '35000', 35000, '1,234,567원', '0원', '', null, undefined, '원', 'abc', -1000];
                    console.log('[PaymentDebug] 금액 파싱 테스트:');
                    testCases.forEach(testCase => {
                        const result = parseAmount(testCase);
                        console.log(`  ${JSON.stringify(testCase)} → ${result} (${typeof result})`);
                    });
                },
                currentAmounts: () => ({
                    finalAmount,
                    legacyPrice,
                    discount,
                    ticketPrice: ticketInfo?.selectedTicket?.price,
                    widgetAmount: lastAmountRef.current
                })
            };
            console.log('[CheckPaymentToss] window.__paymentDebug 준비 완료');
        } catch (e) {
            console.warn('[CheckPaymentToss] 디버그 함수 설정 실패:', e);
        }

        return () => {
            document.removeEventListener('skysunny:init', onInit);
        };
    }, []);

    // RN reply 수신 → serverAmount 즉시 반영
    useEffect(() => {
        const onReply = (e) => {
            const payload = e?.detail || {};
            if (payload?.action !== 'REQUEST_DRAFT' || !payload?.ok) return;

            const d = payload?.data || {};
            const serverAmount =
                (typeof d.serverAmount === 'number' ? d.serverAmount : null) ??
                (typeof d?.order?.amount === 'number' ? d.order.amount : null) ??
                (typeof d.orderAmount === 'number' ? d.orderAmount : null);

            if (Number.isInteger(serverAmount) && serverAmount > 0) {
                console.log('[CheckPaymentToss] RN serverAmount 수신:', serverAmount);
                setTicketInfo((prev) => ({ ...(prev || {}), serverAmount }));
                try {
                    if (paymentMethods) {
                        paymentMethods.updateAmount({ value: serverAmount });
                        lastAmountRef.current = serverAmount;
                        console.log('[CheckPaymentToss] 위젯 금액을 serverAmount로 동기화');
                    }
                } catch (err) {
                    console.warn('[CheckPaymentToss] serverAmount 위젯 동기화 실패:', err);
                }
            }
        };
        document.addEventListener('skysunny:reply', onReply);
        return () => document.removeEventListener('skysunny:reply', onReply);
    }, [paymentMethods]);

    // 쿠폰 상태 동기화
    useEffect(() => {
        if ('selectedCoupon' in (location.state || {})) {
            setSelectedCoupon(location.state.selectedCoupon || null);
        }
    }, [location.state]);

    // 토스페이먼츠 위젯 초기화
    useEffect(() => {
        let isMounted = true;
        let initTimeout;

        async function initializePaymentWidget() {
            try {
                console.log('[CheckPaymentToss] === 토스 결제 위젯 초기화 시작 ===');
                console.log('[CheckPaymentToss] clientKey:', clientKey);
                console.log('[CheckPaymentToss] customerKey:', customerKey);
                console.log('[CheckPaymentToss] finalAmount:', finalAmount);
                console.log('[CheckPaymentToss] ticketInfo:', ticketInfo);

                if (!clientKey || !customerKey) {
                    throw new Error('clientKey 또는 customerKey가 없습니다');
                }

                const validAmount = finalAmount && finalAmount > 0 ? finalAmount : 1000;
                if (validAmount < 100) {
                    console.warn('[CheckPaymentToss] 금액이 너무 작습니다. 초기화 보류');
                    return;
                }

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

                paymentMethodElement.innerHTML = '';
                agreementElement.innerHTML = '';

                console.log('[CheckPaymentToss] loadPaymentWidget 호출...');
                const paymentWidget = await loadPaymentWidget(clientKey, customerKey);
                if (!isMounted) return;

                console.log('[CheckPaymentToss] PaymentWidget 로드 성공');

                // 위젯 금액을 정수로 강제 변환
                const widgetAmount = Math.floor(Number(validAmount));
                console.log('[CheckPaymentToss] renderPaymentMethods 호출...', {
                    finalAmount,
                    validAmount,
                    widgetAmount,
                    widgetAmountType: typeof widgetAmount,
                    widgetAmountIsInteger: Number.isInteger(widgetAmount),
                    legacyPrice: parseAmount(ticketInfo?.selectedTicket?.price),
                    ticketPrice: ticketInfo?.selectedTicket?.price,
                    ticketInfo: ticketInfo?.selectedTicket
                });

                if (widgetAmount <= 0) throw new Error(`유효하지 않은 결제 금액: ${widgetAmount}`);
                if (!Number.isInteger(widgetAmount)) throw new Error(`위젯 금액이 정수가 아님: ${widgetAmount} (타입: ${typeof widgetAmount})`);

                console.log('[CheckPaymentToss] 토스페이먼츠 위젯에 전달할 금액:', {
                    value: widgetAmount,
                    type: typeof widgetAmount,
                    isInteger: Number.isInteger(widgetAmount)
                });

                const paymentMethodsWidget = paymentWidget.renderPaymentMethods("#payment-method", {
                    value: widgetAmount
                });

                console.log('[CheckPaymentToss] PaymentMethods 렌더링 완료, 설정된 금액:', widgetAmount);

                // 위젯에 설정된 금액 추적
                lastAmountRef.current = widgetAmount;

                // 위젯 초기화 완료 후 안정화 대기 (시간 증가)
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('[CheckPaymentToss] 위젯 초기화 안정화 완료');

                // 위젯 상태 최종 확인
                console.log('[CheckPaymentToss] 위젯 초기화 후 상태 확인:', {
                    widgetAmount: widgetAmount,
                    lastAmountRef: lastAmountRef.current,
                    paymentMethodsExists: !!paymentMethodsWidget,
                    isAmountSet: lastAmountRef.current === widgetAmount
                });

                console.log('[CheckPaymentToss] renderAgreement 호출...');
                paymentWidget.renderAgreement("#agreement");
                console.log('[CheckPaymentToss] Agreement 렌더링 완료');

                if (!isMounted) return;

                setPaymentWidget(paymentWidget);
                setPaymentMethods(paymentMethodsWidget);
                setIsPaymentReady(true);

                console.log('[CheckPaymentToss] === 토스 결제 위젯 초기화 완료 ===');
            } catch (error) {
                console.error('[CheckPaymentToss] 결제 위젯 초기화 실패:', error);
                if (isMounted) {
                    setIsPaymentReady(false);
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

        initTimeout = setTimeout(initializePaymentWidget, 300);

        return () => {
            isMounted = false;
            if (initTimeout) clearTimeout(initTimeout);

            try {
                const paymentMethodElement = document.getElementById("payment-method");
                const agreementElement = document.getElementById("agreement");
                if (paymentMethodElement) paymentMethodElement.innerHTML = '';
                if (agreementElement) agreementElement.innerHTML = '';
                console.log('[CheckPaymentToss] 위젯 정리 완료');
            } catch (error) {
                console.warn('[CheckPaymentToss] 위젯 정리 중 오류:', error);
            }
        };
    }, [clientKey, customerKey, finalAmount, ticketInfo, parseAmount]);

    // 금액 변경 시 위젯 업데이트
    useEffect(() => {
        if (!paymentMethods || !isPaymentReady) return;

        // 금액을 정수로 강제 변환
        const rawAmount = parseAmount(finalAmount) || 1000;
        const newAmount = Math.floor(Number(rawAmount));

        if (lastAmountRef.current === newAmount) return;

        if (!Number.isInteger(newAmount) || newAmount <= 0) {
            console.error('[CheckPaymentToss] 금액 업데이트 실패 - 유효하지 않은 금액:', {
                finalAmount: finalAmount,
                rawAmount: rawAmount,
                newAmount: newAmount,
                type: typeof newAmount,
                isInteger: Number.isInteger(newAmount)
            });
            return;
        }

        console.log('[CheckPaymentToss] 결제 금액 업데이트:', {
            from: lastAmountRef.current,
            to: newAmount,
            type: typeof newAmount,
            isInteger: Number.isInteger(newAmount),
            rawAmount: rawAmount
        });

        try {
            paymentMethods.updateAmount({ value: newAmount });
            lastAmountRef.current = newAmount;
            console.log('[CheckPaymentToss] 위젯 금액 업데이트 성공:', newAmount);
        } catch (error) {
            console.error('[CheckPaymentToss] 금액 업데이트 오류:', error);
        }
    }, [finalAmount, paymentMethods, isPaymentReady, parseAmount]);

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
            if (!passId) throw new Error('상품 ID(passId)가 없습니다.');
            if (needsTarget(passKind) && !targetId) throw new Error('좌석/사물함 선택이 필요합니다.');
        }

        const numericFinalAmount = parseAmount(finalAmount);
        const numericCouponAmount = parseAmount(selectedCoupon?.amount || selectedCoupon?.discount || 0);
        const numericPrice = parseAmount(SK?.selectedTicket?.price || ticketInfo?.selectedTicket?.price || 0);

        console.log('[CheckPaymentToss] 서버 전송용 금액 변환:', {
            originalFinalAmount: finalAmount,
            numericFinalAmount: numericFinalAmount,
            originalCouponAmount: selectedCoupon?.amount || selectedCoupon?.discount,
            numericCouponAmount: numericCouponAmount,
            originalPrice: SK?.selectedTicket?.price || ticketInfo?.selectedTicket?.price,
            numericPrice: numericPrice
        });

        const requestPayload = {
            passKind: passKind,
            passId: passId,
            targetId: targetId,
            userId: SK?.userId || ticketInfo?.userId || localStorage.getItem('userId') || null,
            seatId: needsTarget(passKind) ? targetId : null,
            storeId: SK?.storeId || ticketInfo?.storeId || null,
            storeName: SK?.storeName || ticketInfo?.storeName || null,
            productName: SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || null,
            price: numericPrice,
            roomName: SK?.roomName || ticketInfo?.roomName || null,
            selectedDate: SK?.selectedDate || ticketInfo?.selectedDate || null,
            period: SK?.period || ticketInfo?.period || null,
            usageInfo: SK?.usageInfo || ticketInfo?.usageInfo || null,
            couponId: selectedCoupon?.id || null,
            couponAmount: numericCouponAmount,
            paymentMethod: 'toss',
            finalAmount: numericFinalAmount
        };

        console.log('[CheckPaymentToss:web] REQUEST_DRAFT → 전체 페이로드:', requestPayload);

        const result = await sendToRN('REQUEST_DRAFT', requestPayload, 30000);
        console.log('[CheckPaymentToss:web] Draft 생성 성공:', result);
        return result;
    };

    // 토스페이먼츠 공식 방식: 구매하기 버튼 클릭
    const onClickBuy = async () => {
        console.log('[CheckPaymentToss] 구매하기 버튼 클릭');

        const checkResult = window.finalPaymentCheck?.(null, finalAmount) || { success: true, amount: parseAmount(finalAmount) };
        if (!checkResult.success) {
            alert(checkResult.error);
            return;
        }

        if (!paymentWidget || !isPaymentReady) {
            alert('결제 위젯 준비 중입니다. 잠시 후 다시 시도하세요.');
            return;
        }

        // 금액을 정수로 강제 변환
        let amount = Math.floor(Number(checkResult.amount || 0));
        if (!amount || amount <= 0) {
            console.warn('[CheckPaymentToss] 계산된 금액이 유효하지 않음:', {
                originalAmount: checkResult.amount,
                convertedAmount: amount
            });
            amount = 1000;
        }
        if (amount < 100) {
            alert('결제 금액은 최소 100원 이상이어야 합니다.');
            return;
        }
        if (amount > 100000000) {
            alert('결제 금액이 너무 큽니다. 고객센터에 문의하세요.');
            return;
        }

        console.log('[CheckPaymentToss] 초기 최종 결제 금액:', {
            originalFinalAmount: finalAmount,
            validatedAmount: amount,
            ticketPrice: ticketInfo?.selectedTicket?.price,
            legacyPrice: legacyPrice,
            discount: discount
        });

        try {
            console.log('[CheckPaymentToss] 임시 주문 생성 중...');
            const draft = await requestDraftViaRN();
            console.log('[CheckPaymentToss] 임시 주문 생성 완료:', draft);

            const rnServerAmount =
                (typeof draft?.data?.serverAmount === 'number' ? draft.data.serverAmount : null) ??
                (typeof draft?.data?.order?.amount === 'number' ? draft.data.order.amount : null);

            const serverTotalPrice = draft?.totalPrice || draft?.data?.totalPrice;
            let serverAmountParsed = parseAmount(serverTotalPrice);

            if (rnServerAmount && rnServerAmount > 0) {
                serverAmountParsed = rnServerAmount;
            }

            // 서버 금액이 있으면 사용 (단순 적용)
            if (serverAmountParsed > 0) {
                amount = Math.floor(Number(serverAmountParsed));
                console.log('[CheckPaymentToss] 서버 금액 사용:', amount);

                if (paymentMethods) {
                    const widgetUpdateAmount = Math.floor(Number(amount));
                    paymentMethods.updateAmount({ value: widgetUpdateAmount });
                    lastAmountRef.current = widgetUpdateAmount;
                }
            }

            const paymentInfo = {
                orderNumber: draft?.orderNumber || draft?.data?.orderNumber || draft?.data?.order?.id || `order_${Date.now()}`,
                storeName: SK?.storeName || ticketInfo?.storeName,
                passKind: passKind,
                passType: passKind,
                productName: SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name,
                finalAmount: amount,
                couponAmount: selectedCoupon?.amount || selectedCoupon?.discount || 0,
                timestamp: Date.now()
            };

            if (!paymentInfo.orderNumber) {
                throw new Error('주문번호를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
            }

            try {
                sessionStorage.setItem('toss:draft', JSON.stringify(paymentInfo));
                console.log('[CheckPaymentToss] 결제 정보 sessionStorage 저장:', paymentInfo);
            } catch (e) {
                console.warn('[CheckPaymentToss] sessionStorage 저장 실패:', e);
            }

            const orderNumber = paymentInfo.orderNumber;

            try {
                console.log('[CheckPaymentToss] 결제 정보 업데이트 중...');
                if (!Number.isInteger(amount) || amount <= 0) {
                    throw new Error(`결제 금액 형식 오류: ${amount}`);
                }

                // 서버 우회 테스트 모드 (임시)
                const isServerBypassTest = window.location.search.includes('bypass=true');

                if (isServerBypassTest) {
                    console.log('[CheckPaymentToss] 서버 우회 테스트 모드 - UPDATE_PAYMENT 스킵');
                } else {
                    await window.updatePayment(orderNumber, {
                        amount: amount,
                        orderName: SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || '상품',
                        customerName: SK?.customerName || ticketInfo?.customerName || '고객',
                        customerEmail: SK?.customerEmail || ticketInfo?.customerEmail || 'customer@example.com',
                        paymentMethod: 'toss',
                        couponId: selectedCoupon?.id || null,
                        couponAmount: selectedCoupon?.amount || selectedCoupon?.discount || 0,
                        timestamp: Date.now()
                    });
                }
                console.log('[CheckPaymentToss] 결제 정보 업데이트 완료');
            } catch (updateErr) {
                console.warn('[CheckPaymentToss] 결제 정보 업데이트 실패:', updateErr);

                // 서버 오류 시에도 토스페이먼츠 테스트 계속 진행 (디버깅용)
                const continueAnyway = window.confirm('서버 업데이트에 실패했습니다.\n\n토스페이먼츠 테스트를 계속 진행하시겠습니까?\n(디버깅 목적)');
                if (!continueAnyway) {
                    alert('결제 정보 업데이트에 실패했습니다.\n다시 시도해주세요.');
                    return;
                }
                console.log('[CheckPaymentToss] 서버 오류 무시하고 토스페이먼츠 테스트 계속 진행');
            }

            // 3. 토스페이먼츠 공식 결제 요청
            const orderId = orderNumber;
            const orderName = SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || '상품';

            // 성공/실패 URL 설정 (결제 완료 페이지에서 사용할 정보 포함)
            const successParams = new URLSearchParams({
                orderNumber: orderNumber,
                amount: amount.toString(),
                storeName: paymentInfo.storeName || '',
                passType: paymentInfo.passType || '',
                productName: paymentInfo.productName || ''
            });
            const webSuccessUrl = `${window.location.origin}/complete-payment?${successParams.toString()}`;
            const webFailUrl = `${window.location.origin}/complete-payment?fail=1&orderNumber=${encodeURIComponent(orderNumber)}`;

            console.log('[CheckPaymentToss] 토스 결제 요청:', { orderId, orderName, amount });
            console.log('[CheckPaymentToss] 최종 결제 금액:', amount);

            if (!Number.isInteger(amount) || amount <= 0) {
                throw new Error(`최종 결제 금액이 유효한 정수가 아님: ${amount} (타입: ${typeof amount})`);
            }

            // 토스페이먼츠 권장 방식: 위젯에 금액을 설정하고 requestPayment에는 amount를 포함하지 않음
            const paymentRequest = {
                orderId: orderId,
                orderName: orderName,
                // amount 필드 제거 - 위젯에 설정된 금액을 자동으로 사용
                successUrl: webSuccessUrl,
                failUrl: webFailUrl,
                customerEmail: SK?.customerEmail || ticketInfo?.customerEmail || "customer@example.com",
                customerName: SK?.customerName || ticketInfo?.customerName || "고객",
                customerMobilePhone: SK?.customerPhone || ticketInfo?.customerPhone || "01012341234",
            };

            console.log('[CheckPaymentToss] paymentRequest (위젯 금액 자동 사용):', paymentRequest);

            console.log('[CheckPaymentToss] 토스 결제 요청 파라미터:', {
                ...paymentRequest,
                widgetAmount: lastAmountRef.current
            });

            console.log('결제 정보:', window.debugPaymentInfo?.());

            console.log('[CheckPaymentToss] 토스페이먼츠 결제 요청 시작...');

            // 토스페이먼츠 결제 요청 전 필수 검증
            console.log('[CheckPaymentToss] 결제 요청 전 검증 시작...');

            if (!paymentWidget) {
                console.error('[CheckPaymentToss] 결제 위젯이 초기화되지 않음');
                throw new Error('결제 위젯이 초기화되지 않았습니다. 페이지를 새로고침해주세요.');
            }

            if (!orderId || orderId.length < 3) {
                console.error('[CheckPaymentToss] 주문번호 검증 실패:', orderId);
                throw new Error('주문번호가 올바르지 않습니다. 페이지를 새로고침 후 다시 시도해주세요.');
            }

            if (!webSuccessUrl || !webFailUrl) {
                console.error('[CheckPaymentToss] 리다이렉션 URL 누락:', { webSuccessUrl, webFailUrl });
                throw new Error('결제 완료 페이지 설정이 올바르지 않습니다.');
            }

            // 위젯 상태 최종 확인
            if (!lastAmountRef.current || lastAmountRef.current <= 0) {
                console.error('[CheckPaymentToss] 위젯 금액 상태 이상:', lastAmountRef.current);
                throw new Error('결제 금액이 설정되지 않았습니다. 페이지를 새로고침해주세요.');
            }

            console.log('[CheckPaymentToss] 모든 검증 통과, 토스페이먼츠 결제 요청 시작');

            try {
                console.log('[CheckPaymentToss] 토스페이먼츠 requestPayment 호출:', {
                    paymentRequest: paymentRequest,
                    widgetAmount: lastAmountRef.current,
                    timestamp: new Date().toISOString()
                });

                // 토스페이먼츠 위젯 상태 안정화를 위한 대기 시간 증가
                await new Promise(resolve => setTimeout(resolve, 500));

                // 위젯 금액 재동기화 시도
                if (paymentMethods && lastAmountRef.current !== amount) {
                    console.log('[CheckPaymentToss] 결제 직전 위젯 금액 재동기화:', {
                        currentWidgetAmount: lastAmountRef.current,
                        targetAmount: amount
                    });

                    try {
                        paymentMethods.updateAmount({ value: amount });
                        lastAmountRef.current = amount;
                        // 재동기화 후 추가 대기
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        console.log('[CheckPaymentToss] 위젯 금액 재동기화 완료:', amount);
                    } catch (syncError) {
                        console.error('[CheckPaymentToss] 위젯 금액 재동기화 실패:', syncError);
                    }
                }

                console.log('[CheckPaymentToss] requestPayment 실행 직전 최종 상태:', {
                    paymentWidget: !!paymentWidget,
                    paymentMethods: !!paymentMethods,
                    isPaymentReady: isPaymentReady,
                    widgetAmount: lastAmountRef.current,
                    targetAmount: amount,
                    amountMatch: lastAmountRef.current === amount
                });

                await paymentWidget.requestPayment(paymentRequest);
                console.log('[CheckPaymentToss] 토스 결제 완료 - 리다이렉션 진행 중');
            } catch (tossError) {
                console.error('[CheckPaymentToss] 토스페이먼츠 결제 요청 실패:', {
                    error: tossError,
                    errorCode: tossError?.code,
                    errorMessage: tossError?.message,
                    paymentRequest: paymentRequest,
                    widgetAmount: lastAmountRef.current,
                    timestamp: new Date().toISOString()
                });

                // 토스페이먼츠 공통 오류 코드별 처리
                switch (tossError?.code) {
                    case 'USER_CANCEL':
                        console.log('[CheckPaymentToss] 사용자가 결제를 취소했습니다.');
                        return; // 정상 종료

                    case 'INVALID_AMOUNT_VALUE':
                        console.error('[CheckPaymentToss] 결제 금액 오류 상세:', {
                            widgetAmount: lastAmountRef.current,
                            amountType: typeof lastAmountRef.current,
                            isInteger: Number.isInteger(lastAmountRef.current),
                            paymentRequest: paymentRequest,
                            tossClientKey: SK?.tossClientKey,
                            isTestEnvironment: SK?.tossClientKey?.includes('test_')
                        });

                        // 토스페이먼츠 테스트 환경에서의 금액 제한 안내
                        if (SK?.tossClientKey?.includes('test_')) {
                            const testAmount = lastAmountRef.current;
                            const recommendedAmounts = [1000, 5000, 10000, 50000, 100000];
                            const alternatives = recommendedAmounts.filter(amt => amt !== testAmount).slice(0, 3);

                            throw new Error(`테스트 환경에서 ${testAmount}원 결제가 제한됩니다.\n\n권장 테스트 금액: ${alternatives.join('원, ')}원\n\n또는 운영 환경에서 시도해주세요.\n\n(토스페이먼츠 테스트 환경 제한)`);
                        } else {
                            throw new Error(`결제 금액이 올바르지 않습니다.\n\n페이지를 새로고침 후 다시 시도해주세요.\n\n문제가 지속되면 고객센터에 문의해주세요.`);
                        }

                    case 'INVALID_CARD':
                        throw new Error('유효하지 않은 카드입니다. 다른 카드를 사용해주세요.');

                    case 'INSUFFICIENT_FUNDS':
                        throw new Error('잔액이 부족합니다. 다른 결제 수단을 이용해주세요.');

                    case 'INVALID_ORDER_ID':
                        throw new Error('주문번호가 올바르지 않습니다. 페이지를 새로고침 후 다시 시도해주세요.');

                    case 'ALREADY_PROCESSED_PAYMENT':
                        throw new Error('이미 처리된 결제입니다. 결제 내역을 확인해주세요.');

                    case 'PROVIDER_ERROR':
                        throw new Error('결제 서비스에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');

                    case 'INVALID_REQUEST':
                        console.error('[CheckPaymentToss] 잘못된 요청 파라미터:', paymentRequest);
                        throw new Error('결제 요청 정보가 올바르지 않습니다. 페이지를 새로고침 후 다시 시도해주세요.');

                    case 'FORBIDDEN_REQUEST':
                        throw new Error('결제 권한이 없습니다. 고객센터에 문의해주세요.');

                    case 'REJECT_CARD_COMPANY':
                        throw new Error('카드사에서 결제를 거절했습니다. 다른 카드를 사용하거나 카드사에 문의해주세요.');

                    case 'INVALID_API_KEY':
                        console.error('[CheckPaymentToss] API 키 오류 - 개발자 확인 필요');
                        throw new Error('결제 시스템 설정 오류입니다. 고객센터에 문의해주세요.');

                    case 'NOT_FOUND_PAYMENT':
                        throw new Error('결제 정보를 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.');

                    case 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING':
                        throw new Error('결제 시스템 내부 오류입니다. 잠시 후 다시 시도해주세요.');

                    case 'FAILED_INTERNAL_SYSTEM_PROCESSING':
                        throw new Error('시스템 내부 오류입니다. 잠시 후 다시 시도해주세요.');

                    default:
                        // 알려지지 않은 오류의 경우 상세 정보 로깅
                        console.error('[CheckPaymentToss] 알려지지 않은 토스페이먼츠 오류:', {
                            code: tossError?.code,
                            message: tossError?.message,
                            stack: tossError?.stack,
                            fullError: tossError
                        });

                        const userMessage = tossError?.message || '결제 중 오류가 발생했습니다.';
                        throw new Error(`${userMessage}\n\n오류가 계속 발생하면 고객센터에 문의해주세요.\n(오류코드: ${tossError?.code || 'UNKNOWN'})`);
                }
            }
        } catch (error) {
            console.error('[CheckPaymentToss] 결제 처리 오류:', error);
            try {
                console.error('[CheckPaymentToss] 디버깅 정보:', window.debugPaymentInfo?.());
            } catch (debugError) {
                console.error('[CheckPaymentToss] 디버깅 정보 수집 실패:', debugError);
            }

            const errorMessage = error?.message ||
                error?.error?.message ||
                error?.response?.data?.message ||
                '결제 요청 중 오류가 발생했습니다.';

            const errorCode = error?.code ||
                error?.errorCode ||
                error?.response?.data?.code ||
                error?.name;

            if (errorCode === 'USER_CANCEL') {
                console.log('[CheckPaymentToss] 사용자 결제 취소');
                return;
            }

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
                                    <div className="info-img" onClick={() => setSelectedCoupon(null)} style={{ cursor: 'pointer' }}>
                                        <img src={close} alt="쿠폰삭제" className="icon24" />
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
                    <div className="copy-url-box" onClick={() => navigator.clipboard.writeText('http://skasca.me/cash')} style={{ cursor: 'pointer' }}>
                        <span className="font-noto url-text">http://skasca.me/cash</span>
                        <img src={copy} alt="info" className="icon14" />
                        <span className="copy-btn">URL 복사</span>
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

                <div className="toss-payment-widget">
                    <div className="section2-title-box">
                        <div className="text-box">
                            <span className="font-bm section-title">결제 방법</span>
                        </div>
                    </div>

                    {!isPaymentReady && (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
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
                </div>

                <div className="scroll-spacer" aria-hidden />
            </div>

            <div className="checkout-footer-fixed">
                <div className="bottom-bar2">
                    <span>결제금액</span>
                    <span>{finalAmountText}</span>
                </div>
                <div className="bottom-button">
                    <button
                        onClick={onClickBuy}
                        disabled={!isPaymentReady}
                        style={{ opacity: isPaymentReady ? 1 : 0.6 }}
                    >
                        구매하기
                    </button>
                </div>
            </div>
        </div>
    );
}
