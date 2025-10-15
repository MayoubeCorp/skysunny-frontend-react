// CheckPaymentToss.js - 토스페이먼츠 v2 SDK 방식 (샌드박스 코드 적용)
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Banner from '../components/BannerSlider';
import backArrow from '../img/common/backarrow.png';
import close from '../img/common/circleClose.png';
import copy from '../img/common/copy.png';
import infoIcon from '../img/home/information.png';
import '../styles/main.scss';

export default function CheckPaymentToss() {
    const navigate = useNavigate();
    const location = useLocation();

    const [selectedCoupon, setSelectedCoupon] = useState(location.state?.selectedCoupon || null);
    const [ticketInfo, setTicketInfo] = useState(null);

    // 토스페이먼츠 v2 SDK 관련 상태 (샌드박스 방식)
    const [widgets, setWidgets] = useState(null);
    const [isPaymentReady, setIsPaymentReady] = useState(false);
    const lastAmountRef = useRef(50000);

    // URL 복사 알림 상태
    const [showCopyNotification, setShowCopyNotification] = useState(false);
    const [showDebugInfo, setShowDebugInfo] = useState(false);

    // SK 먼저 정의 (다른 useMemo에서 사용하므로)
    const SK = useMemo(() => window?.SKYSUNNY || {}, []);

    // 배너 데이터 (BannerSlider 컴포넌트 형식에 맞춤)
    const bannerImages2 = useMemo(() => {
        // RN에서 전달된 배너가 있으면 사용
        const rnBanners = SK?.banners || window?.SKYSUNNY?.banners;
        if (rnBanners && Array.isArray(rnBanners) && rnBanners.length > 0) {
            return rnBanners;
        }
        // 배너가 없으면 빈 배열 반환 (BannerSlider가 자체적으로 null 처리)
        return [];
    }, [SK]);

    const movePage = (path) => navigate(path);

    // 토스페이먼츠 설정 (기존 키 사용)
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

    // 샌드박스에서는 ANONYMOUS 사용 (공식 샘플 방식)
    const customerKey = useMemo(() => {
        return ANONYMOUS;
    }, []);

    // ===== 공통 유틸 =====
    const parseAmount = useCallback((v) => {
        if (v == null || v === undefined) return 0;

        if (typeof v === 'number') {
            return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
        }

        if (typeof v === 'string') {
            const cleaned = v.replace(/[^\d]/g, '');
            const num = Number(cleaned);
            return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
        }

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
        return parseAmount(price);
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

    // RN 데이터 주입 확인
    useEffect(() => {
        const checkRNData = () => {
            if (window.SKYSUNNY && Object.keys(window.SKYSUNNY).length > 0) {
                console.log('[CheckPaymentToss] RN 데이터 감지됨');
            }
        };

        const interval = setInterval(checkRNData, 2000);
        setTimeout(() => clearInterval(interval), 10000);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        console.log('🌟 [useEffect:onInit] 마운트됨');
        console.log('🌟 [useEffect:onInit] window.SKYSUNNY:', window.SKYSUNNY);
        console.log('🌟 [useEffect:onInit] window.__askRN 존재:', typeof window.__askRN === 'function');

        const onInit = (e) => {
            console.log('🌟 [onInit] 이벤트 수신:', e.detail);

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

            // orderNumber 확인
            if (e.detail?.orderNumber) {
                console.log('🌟 [onInit] ✅ orderNumber 발견:', e.detail.orderNumber);
                mergedInfo.orderNumber = e.detail.orderNumber;
            } else {
                console.log('🌟 [onInit] ⚠️ orderNumber 없음');
            }

            console.log('🌟 [onInit] ticketInfo 업데이트:', mergedInfo);
            setTicketInfo(mergedInfo);
        };

        document.addEventListener('skysunny:init', onInit);

        if (window.SKYSUNNY) {
            console.log('🌟 [useEffect:onInit] window.SKYSUNNY 존재 - 즉시 호출');
            onInit({ detail: window.SKYSUNNY });
        } else {
            console.log('🌟 [useEffect:onInit] window.SKYSUNNY 없음 - 빈 객체로 호출');
            onInit({ detail: {} });
        }


        return () => {
            document.removeEventListener('skysunny:init', onInit);
        };
    }, []);

    // RN reply 수신 → serverAmount 즉시 반영
    useEffect(() => {
        const onReply = async (e) => {
            const payload = e?.detail || {};
            if (payload?.action !== 'REQUEST_DRAFT' || !payload?.ok) return;

            const d = payload?.data || {};
            const serverAmount =
                (typeof d.serverAmount === 'number' ? d.serverAmount : null) ??
                (typeof d?.order?.amount === 'number' ? d.order.amount : null) ??
                (typeof d.orderAmount === 'number' ? d.orderAmount : null);

            if (Number.isInteger(serverAmount) && serverAmount > 0) {
                setTicketInfo((prev) => ({ ...(prev || {}), serverAmount }));
                try {
                    if (widgets) {
                        await widgets.setAmount({ currency: "KRW", value: serverAmount });
                        lastAmountRef.current = serverAmount;
                    }
                } catch (err) {
                    console.warn('[CheckPaymentToss] serverAmount 위젯 동기화 실패:', err);
                }
            }
        };
        document.addEventListener('skysunny:reply', onReply);
        return () => document.removeEventListener('skysunny:reply', onReply);
    }, [widgets]);

    // 쿠폰 상태 동기화
    useEffect(() => {
        if ('selectedCoupon' in (location.state || {})) {
            setSelectedCoupon(location.state.selectedCoupon || null);
        }
    }, [location.state]);

    // 토스페이먼츠 위젯 초기화 (샌드박스 방식 적용)
    useEffect(() => {
        let isMounted = true;

        async function initializePaymentWidget() {
            try {

                if (!clientKey) {
                    throw new Error('clientKey가 없습니다');
                }

                // DOM 요소 확인
                const paymentMethodElement = document.getElementById("payment-method");
                const agreementElement = document.getElementById("agreement");

                if (!paymentMethodElement || !agreementElement) {
                    setTimeout(initializePaymentWidget, 100);
                    return;
                }

                if (!isMounted) return;

                // 기존 내용 초기화
                paymentMethodElement.innerHTML = '';
                agreementElement.innerHTML = '';

                // 토스페이먼츠 SDK 로드
                const tossPayments = await loadTossPayments(clientKey);
                if (!isMounted) return;


                // 위젯 인스턴스 생성 (샌드박스에서는 ANONYMOUS 사용)
                const widgets = tossPayments.widgets({
                    customerKey: customerKey
                });
                if (!isMounted) return;

                // 금액 설정 (샌드박스 방식: setAmount 먼저 호출)
                const amount = {
                    currency: "KRW",
                    value: finalAmount && finalAmount > 0 ? finalAmount : 50000, // 기본 50,000원
                };

                await widgets.setAmount(amount);

                // 결제 수단과 약관 렌더링 (기본 설정 사용)
                await Promise.all([
                    widgets.renderPaymentMethods({
                        selector: "#payment-method",
                        variantKey: "sky-sunny",
                    }),
                    widgets.renderAgreement({
                        selector: "#agreement",
                        variantKey: "AGREEMENT",
                    }),
                ]);

                // iframe에 referrerPolicy 설정
                setTimeout(() => {
                    const iframes = document.querySelectorAll('#payment-method iframe, #agreement iframe');
                    iframes.forEach(iframe => {
                        iframe.setAttribute('referrerpolicy', 'no-referrer');
                        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation');
                    });
                }, 100);

                if (!isMounted) return;

                setWidgets(widgets);
                setIsPaymentReady(true);
                lastAmountRef.current = amount.value;

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

        // 초기화 시작
        initializePaymentWidget();

        return () => {
            isMounted = false;
            try {
                const paymentMethodElement = document.getElementById("payment-method");
                const agreementElement = document.getElementById("agreement");
                if (paymentMethodElement) paymentMethodElement.innerHTML = '';
                if (agreementElement) agreementElement.innerHTML = '';
            } catch (error) {
                console.warn('[CheckPaymentToss] 위젯 정리 중 오류:', error);
            }
        };
    }, [clientKey, customerKey]);

    // 금액 변경 시 위젯 업데이트
    useEffect(() => {
        if (!widgets || !isPaymentReady) return;

        const newAmount = finalAmount && finalAmount > 0 ? finalAmount : 50000;

        if (lastAmountRef.current === newAmount) return;


        const updateAmount = async () => {
            try {
                await widgets.setAmount({
                    currency: "KRW",
                    value: newAmount
                });
                lastAmountRef.current = newAmount;
            } catch (error) {
                console.error('[CheckPaymentToss] 금액 업데이트 오류:', error);
            }
        };

        updateAmount();
    }, [finalAmount, widgets, isPaymentReady]);


    // 랜덤 문자열 생성 함수 (샌드박스 방식)
    const generateRandomString = () => window.btoa(Math.random()).slice(0, 20);

    // 실제 주문번호 가져오기
    const getActualOrderNumber = useCallback(() => {
        console.log('[getActualOrderNumber] 시작 - 전체 상태:', {
            'SK?.order?.id': SK?.order?.id,
            'SK?.orderNumber': SK?.orderNumber,
            'ticketInfo?.orderNumber': ticketInfo?.orderNumber,
            'window.SKYSUNNY': window.SKYSUNNY
        });

        // 1순위: window.SKYSUNNY에서 order.id 또는 orderNumber
        if (SK?.order?.id) {
            console.log('[getActualOrderNumber] ✅ SK.order.id 발견:', SK.order.id);
            return SK.order.id;
        }
        if (SK?.orderNumber) {
            console.log('[getActualOrderNumber] ✅ SK.orderNumber 발견:', SK.orderNumber);
            return SK.orderNumber;
        }

        // 2순위: sessionStorage의 toss:draft
        try {
            const draftStr = sessionStorage.getItem('toss:draft');
            console.log('[getActualOrderNumber] sessionStorage toss:draft 확인:', draftStr);
            if (draftStr) {
                const draft = JSON.parse(draftStr);
                if (draft?.orderNumber) {
                    console.log('[getActualOrderNumber] ✅ sessionStorage draft.orderNumber 발견:', draft.orderNumber);
                    return draft.orderNumber;
                }
            }
        } catch (error) {
            console.warn('[getActualOrderNumber] sessionStorage draft parse error:', error);
        }

        // 3순위: ticketInfo에서 orderNumber (RN에서 전달한 경우)
        if (ticketInfo?.orderNumber) {
            console.log('[getActualOrderNumber] ✅ ticketInfo.orderNumber 발견:', ticketInfo.orderNumber);
            return ticketInfo.orderNumber;
        }

        // 4순위: localStorage의 lastOrderNumber
        const lastOrderNumber = localStorage.getItem('lastOrderNumber');
        if (lastOrderNumber) {
            console.log('[getActualOrderNumber] ✅ localStorage lastOrderNumber 발견:', lastOrderNumber);
            return lastOrderNumber;
        }

        // 5순위: URL 파라미터
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const orderFromUrl = params.get('orderNumber') || params.get('orderId');
            if (orderFromUrl) {
                console.log('[getActualOrderNumber] ✅ URL orderNumber 발견:', orderFromUrl);
                return orderFromUrl;
            }
        }

        console.error('[getActualOrderNumber] ❌ 주문번호를 어디서도 찾을 수 없습니다!');
        return null;
    }, [SK, ticketInfo]);

    // 토스페이먼츠 샌드박스 방식: 구매하기 버튼 클릭
    const onClickBuy = async () => {
        console.log('🔵 [onClickBuy] 구매하기 버튼 클릭됨');
        console.log('🔵 [onClickBuy] widgets:', !!widgets);
        console.log('🔵 [onClickBuy] isPaymentReady:', isPaymentReady);
        console.log('🔵 [onClickBuy] window.__askRN 존재:', typeof window.__askRN === 'function');
        console.log('🔵 [onClickBuy] window.SKYSUNNY:', window.SKYSUNNY);

        if (!widgets || !isPaymentReady) {
            alert('결제 위젯 준비 중입니다. 잠시 후 다시 시도하세요.');
            return;
        }

        try {
            // 실제 주문번호 가져오기 (orderNumber: 사용자용 주문번호)
            console.log('🔵 [onClickBuy] getActualOrderNumber 호출 시작');
            let orderNumber = getActualOrderNumber();
            console.log('🔵 [onClickBuy] getActualOrderNumber 결과:', orderNumber);

            // 주문번호가 없으면 RN에 임시 주문 생성 요청
            if (!orderNumber) {
                console.log('🟡 [onClickBuy] 주문번호가 없음 - RN에 임시 주문 생성 요청 시작');

                // RN에 임시 주문 생성 요청 (window.__askRN 사용)
                if (typeof window.__askRN === 'function') {
                    try {
                        console.log('🟡 [onClickBuy] window.__askRN 함수 존재 확인됨');

                        // Promise로 응답 대기
                        const draftPromise = new Promise((resolve, reject) => {
                            console.log('🟡 [onClickBuy] Promise 생성 - 응답 대기 시작');

                            const timeout = setTimeout(() => {
                                console.error('🔴 [onClickBuy] 10초 타임아웃 - RN 응답 없음');
                                reject(new Error('임시 주문 생성 타임아웃 (10초)'));
                            }, 10000); // 10초 타임아웃

                            // 응답 리스너 등록
                            const handleReply = (event) => {
                                const detail = event.detail || {};
                                console.log('🟢 [onClickBuy] skysunny:reply 이벤트 수신:', {
                                    action: detail.action,
                                    type: detail.type,
                                    ok: detail.ok,
                                    orderNumber: detail.orderNumber,
                                    error: detail.error,
                                    fullDetail: detail
                                });

                                if (detail.action === 'REQUEST_DRAFT' || detail.type === 'REQUEST_DRAFT') {
                                    console.log('🟢 [onClickBuy] REQUEST_DRAFT 응답 확인됨');
                                    clearTimeout(timeout);
                                    document.removeEventListener('skysunny:reply', handleReply);

                                    if (detail.ok && detail.orderNumber) {
                                        console.log('🟢 [onClickBuy] 성공 - orderNumber:', detail.orderNumber);
                                        resolve(detail);
                                    } else {
                                        const errorMsg = detail.error || '임시 주문 생성 실패';
                                        console.error('🔴 [onClickBuy] 실패 - error:', errorMsg);
                                        console.error('🔴 [onClickBuy] 전체 응답:', detail);
                                        reject(new Error(errorMsg));
                                    }
                                }
                            };

                            console.log('🟡 [onClickBuy] skysunny:reply 이벤트 리스너 등록');
                            document.addEventListener('skysunny:reply', handleReply);
                        });

                        // RN에 요청 전송
                        const requestPayload = {
                            storeName: ticketInfo?.storeName,
                            productName: ticketInfo?.selectedTicket?.name || ticketInfo?.productName,
                            amount: finalAmount || 50000,
                            passType: passKind || 'cash'
                        };
                        console.log('🟡 [onClickBuy] RN에 REQUEST_DRAFT 전송:', requestPayload);
                        window.__askRN('REQUEST_DRAFT', requestPayload);
                        console.log('🟡 [onClickBuy] REQUEST_DRAFT 전송 완료 - 응답 대기 중...');

                        // 응답 대기
                        const draftResult = await draftPromise;
                        console.log('🟢 [onClickBuy] Promise 완료 - draftResult:', draftResult);

                        if (draftResult?.orderNumber) {
                            orderNumber = draftResult.orderNumber;
                            const dbOrderId = draftResult.data?.order?.id || draftResult.data?.orderId;

                            console.log('🟢 [onClickBuy] RN 응답 데이터:', {
                                orderNumber,
                                dbOrderId,
                                '설명': {
                                    'orderNumber': '토스에 전달할 주문번호',
                                    'dbOrderId': 'DB orders 테이블 PK'
                                }
                            });

                            // sessionStorage에 DB orderId 저장 (CompletePayment에서 사용)
                            if (dbOrderId) {
                                sessionStorage.setItem('dbOrderId', String(dbOrderId));
                                console.log('🟢 [onClickBuy] sessionStorage에 dbOrderId 저장:', dbOrderId);
                            }

                            // window.SKYSUNNY에 저장
                            if (window.SKYSUNNY) {
                                window.SKYSUNNY.orderNumber = orderNumber;
                                window.SKYSUNNY.orderId = dbOrderId;
                                if (draftResult.data?.order) {
                                    window.SKYSUNNY.order = draftResult.data.order;
                                }
                                if (draftResult.tossClientKey) {
                                    window.SKYSUNNY.tossClientKey = draftResult.tossClientKey;
                                }
                                console.log('🟢 [onClickBuy] window.SKYSUNNY 업데이트 완료:', window.SKYSUNNY);
                            }
                        }
                    } catch (error) {
                        // console.error('🔴 [onClickBuy] RN 임시 주문 생성 실패:', error);
                        // console.error('🔴 [onClickBuy] 에러 상세:', {
                        //     message: error.message,
                        //     stack: error.stack,
                        //     error: error
                        // });

                        // 사용자에게 더 명확한 에러 메시지 표시
                        // let userMessage = error.message || '알 수 없는 오류';
                        // if (error.message?.includes('타임아웃')) {
                        //     userMessage = '결제 준비에 시간이 오래 걸리고 있습니다.\n\n가능한 원인:\n• 네트워크 연결 불안정\n• 서버 응답 지연\n\n잠시 후 다시 시도해주세요.';
                        // }

                        // alert(`임시 주문 생성에 실패했습니다.\n\n${userMessage}`);
                        return;
                    }
                } else {
                    // console.error('🔴 [onClickBuy] window.__askRN 함수가 없습니다!');
                    // console.error('🔴 [onClickBuy] window 객체:', Object.keys(window).filter(k => k.includes('ask') || k.includes('RN') || k.includes('SKYSUNNY')));
                }

                // 여전히 주문번호가 없으면 에러 처리
                if (!orderNumber) {
                    return;
                }
            }

            console.log('[onClickBuy] 결제 진행 - orderNumber:', orderNumber);

            const orderName = ticketInfo?.selectedTicket?.name || "스카이써니 이용권";
            const customerName = SK?.customerName || ticketInfo?.customerName || "고객";
            const customerEmail = SK?.customerEmail || ticketInfo?.customerEmail || "test@example.com";

            // sessionStorage에 주문 정보 저장
            const draftData = {
                orderNumber: orderNumber,
                storeName: ticketInfo?.storeName || '매장',
                passKind: passKind || 'cash',
                passType: passKind || 'cash',
                productName: orderName,
                finalAmount: finalAmount || 50000,
                validDays: ticketInfo?.selectedTicket?.reward || '30일',
                usageInfo: ticketInfo?.oneDayInfo || '이용정보',
                timestamp: Date.now()
            };
            sessionStorage.setItem('toss:draft', JSON.stringify(draftData));

            // 성공/실패 URL 설정
            const baseUrl = window.location.origin;
            const successParams = new URLSearchParams({
                orderNumber: orderNumber,
                amount: (finalAmount || 50000).toString(),
                storeName: ticketInfo?.storeName || '매장',
                passType: passKind || 'cash',
                productName: orderName,
                status: 'success'
            });
            const successUrl = `${baseUrl}/complete-payment?${successParams.toString()}`;
            const failUrl = `${baseUrl}/complete-payment?fail=1&orderNumber=${encodeURIComponent(orderNumber)}&status=fail`;

            // 토스페이먼츠에 전달할 랜덤 주문 ID 생성 (임시 주석처리)
            // const tossOrderId = generateRandomString();

            console.log('[onClickBuy] 🔍 토스 결제 데이터:', {
                // tossOrderId,
                orderNumber,
                dbOrderId: sessionStorage.getItem('dbOrderId'),
                '설명': {
                    // 'tossOrderId': '토스에 전달하는 랜덤 ID (예: MC4yOTUxMDk0ODgzNzcy)',
                    'orderNumber': '사용자용 주문번호 (예: 20251001000033)',
                    'dbOrderId': 'DB orders 테이블 PK (예: 166)'
                }
            });

            // sessionStorage에 매핑 정보 저장 (CompletePayment에서 사용)
            sessionStorage.setItem('tossOrderIdMapping', JSON.stringify({
                // tossOrderId: tossOrderId,
                orderNumber: orderNumber
            }));

            // 토스페이먼츠 결제 요청
            await widgets?.requestPayment({
                orderId: orderNumber,  // 우리 orderNumber 사용
                orderName: orderName,
                customerName: customerName,
                customerEmail: customerEmail,
                successUrl: successUrl,
                failUrl: failUrl
            });

        } catch (error) {
            // 사용자 취소는 조용히 처리
            if (error?.code === 'USER_CANCEL') {
                return;
            }

            // 앱 연동 실패 시 조용히 처리
            if (error?.message?.includes('intent') || error?.message?.includes('scheme')) {
                return;
            }

            const errorMessage = error?.message || '결제 요청 중 오류가 발생했습니다.';
            alert(`결제 요청 중 오류가 발생했습니다.\n${errorMessage}`);
        }
    };

    return (
        <div className="container checkout-page">
            {/* 상단 바 */}
            <div className="top-bar">
                <div
                    className="top-bar-left"
                    onClick={() => {
                        try {
                            // RN WebView 환경
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'GO_BACK' }));
                            }
                            // RN 커스텀 브리지
                            else if (window.__askRN) {
                                window.__askRN('GO_BACK', {});
                            }
                            // 웹 환경
                            else {
                                navigate(-1);
                            }
                        } catch (error) {
                            navigate(-1);
                        }
                    }}
                    style={{
                        cursor: 'pointer',
                        padding: '8px',
                        minWidth: '40px',
                        minHeight: '40px',
                        zIndex: 1000
                    }}
                >
                    <img src={backArrow} alt="뒤로가기" className="icon24" style={{ pointerEvents: 'none' }} />
                </div>
                <div className="top-bar-center">
                    <span className="top-txt font-noto">구매확인</span>
                </div>
                {/* <div className="top-bar-right">
                    <button
                        onClick={() => setShowDebugInfo(!showDebugInfo)}
                        style={{
                            border: '1px solid #ccc',
                            background: '#fff',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderRadius: '4px'
                        }}
                    >
                        🔍
                    </button>
                </div> */}
            </div>

            {/* 본문 */}
            <div className="content-scroll">

                {/* 디버깅 정보 (개발용) */}
                {/* {showDebugInfo && (
                    <div style={{
                        margin: '10px',
                        padding: '10px',
                        backgroundColor: '#f0f0f0',
                        borderRadius: '5px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        maxHeight: '300px',
                        overflow: 'auto'
                    }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>🔍 CheckPaymentToss 디버깅 정보:</div>
                        <div>SK.storeId: {SK?.storeId || 'null'}</div>
                        <div>SK.storeID: {SK?.storeID || 'null'}</div>
                        <div>SK.passId: {SK?.passId || 'null'}</div>
                        <div>SK.selectedTicket: {JSON.stringify(SK?.selectedTicket) || 'null'}</div>
                        <div>SK.accessToken: {SK?.accessToken ? '***있음***' : 'null'}</div>
                        <div>ticketInfo.storeId: {ticketInfo?.storeId || 'null'}</div>
                        <div>ticketInfo.selectedTicket.id: {ticketInfo?.selectedTicket?.id || 'null'}</div>
                        <div>ticketInfo.selectedTicket.storeId: {ticketInfo?.selectedTicket?.storeId || 'null'}</div>
                        <div>localStorage.accessToken: {(typeof localStorage !== 'undefined' && localStorage.getItem('accessToken')) ? '***있음***' : 'null'}</div>
                        <div style={{ marginTop: '10px', fontWeight: 'bold', color: 'blue' }}>전체 window.SKYSUNNY:</div>
                        <div style={{ fontSize: '10px', wordBreak: 'break-all' }}>{JSON.stringify(window.SKYSUNNY, null, 2)}</div>
                        <div style={{ marginTop: '5px', fontWeight: 'bold', color: 'green' }}>전체 ticketInfo:</div>
                        <div style={{ fontSize: '10px', wordBreak: 'break-all' }}>{JSON.stringify(ticketInfo, null, 2)}</div>
                        <div style={{ marginTop: '5px', fontWeight: 'bold', color: 'red' }}>URL 파라미터:</div>
                        <div style={{ fontSize: '10px' }}>{window.location.search}</div>
                    </div>
                )} */}

                {/* 배너 - BannerSlider 컴포넌트 (배너가 없으면 자동으로 null 반환) */}
                <Banner banners={bannerImages2} type="sub2" />

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
                                <div className="info-row"><span className="info-title">이용금액</span><span className="info-text">{ticketInfo?.selectedTicket?.priceText || ticketInfo?.selectedTicket?.price || '-'}</span></div>

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
                            <button
                                className="coupon-btn"
                                onClick={() => {
                                    try {
                                        // 더 광범위한 fallback 로직
                                        const storeId =
                                            SK?.storeId ||
                                            SK?.storeID ||
                                            ticketInfo?.selectedTicket?.storeId ||
                                            ticketInfo?.storeId ||
                                            SK?.store?.id ||
                                            // URL 파라미터에서 확인
                                            (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('storeId')) ||
                                            // 임시 기본값 (테스트용)
                                            '5';

                                        const passId =
                                            ticketInfo?.selectedTicket?.id ||
                                            SK?.passId ||
                                            SK?.selectedTicket?.id ||
                                            // URL 파라미터에서 확인
                                            (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('passId')) ||
                                            // 임시 기본값 (테스트용)
                                            ticketInfo?.selectedTicket?.id ||
                                            '1';

                                        const accessToken =
                                            SK?.accessToken ||
                                            (typeof localStorage !== 'undefined' && localStorage.getItem('accessToken')) ||
                                            undefined;

                                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                                        console.log('[CheckPaymentToss] 🎫 쿠폰선택 클릭 - 전달할 데이터:');
                                        console.log('[CheckPaymentToss] 🏪 storeId:', storeId);
                                        console.log('[CheckPaymentToss] 🎟️ passId:', passId);
                                        console.log('[CheckPaymentToss] 🔑 accessToken:', accessToken ? '있음 (' + accessToken.substring(0, 20) + '...)' : '❌ 없음');
                                        console.log('[CheckPaymentToss] 📦 SK 전체:', SK);
                                        console.log('[CheckPaymentToss] 🎪 ticketInfo 전체:', ticketInfo);
                                        console.log('[CheckPaymentToss] 🌐 window.SKYSUNNY:', window.SKYSUNNY);
                                        console.log('[CheckPaymentToss] 💾 localStorage.accessToken:', localStorage.getItem('accessToken') ? '있음' : '❌ 없음');
                                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

                                        navigate('/check-coupon', {
                                            state: { storeId, passId, accessToken }
                                        });
                                    } catch (err) {
                                        console.warn('[CheckPaymentToss] 쿠폰선택 이동 오류', err);
                                        navigate('/check-coupon');
                                    }
                                }}
                            >
                                쿠폰선택
                            </button>
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
                    <div className="copy-url-box" onClick={async () => {
                        try {
                            await navigator.clipboard.writeText('https://app.skysunny.mayoube.co.kr/cash');
                            setShowCopyNotification(true);
                            setTimeout(() => setShowCopyNotification(false), 3000);
                        } catch (err) {
                            console.error('URL 복사 실패:', err);
                            alert('URL 복사에 실패했습니다.');
                        }
                    }} style={{ cursor: 'pointer' }}>
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
                    <p className="note-text font-noto">
                        환불 가능 조건 <br />
                        - 캐시정기권 : 남은 캐시 환불 가능 ( 부분환불 x ) <br />
                        - 기간정기권(고정석, 자유석), 사물함 : 남은 날짜 / 결제금액 일할 계산해 환불 가능 <br />
                        - 1일이용권 : 환불 불가능 <br />
                        - 스터디룸 : 2일전 100%, 1일전 50%, 당일 환불 불가능 <br />

                        캐시정기권, 기간정기권,사물함 환불시 결제 후 2주이내건만 환불 가능하며 위약금 10% 발생 <br />
                    </p>
                </div>

                <div className="toss-payment-widget">


                    {!isPaymentReady && (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                            결제 위젯을 불러오는 중입니다...
                        </div>
                    )}

                    {/* 결제 방법 위젯 */}
                    <div id="payment-method" style={{ marginBottom: '16px', minHeight: '200px', width: '100%' }}></div>

                    {/* 약관 동의 위젯 */}
                    <div id="agreement" style={{ marginBottom: '16px', minHeight: '50px', width: '100%' }}></div>

                    <div className="toss-payment-widget-footer" style={{ marginBottom: '20px', paddingLeft: '20px', }}>
                        <span className="font-noto" style={{ color: '#999999', fontSize: '11px', lineHeight: '16px', whiteSpace: 'pre-line' }}>
                            주식회사 스카스카 | 대표 : 김형래 {"\n"}
                            주소 : 경기도 남양주시 별내중앙로 30, 305-1849호(별내동){"\n"}
                            사업자등록번호 : 137-87-03668 | 통신판매업신고번호 : 미정{"\n"}
                            SKASKA All rights reserved
                        </span>
                    </div>
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

            {/* URL 복사 알림 메시지 */}
            {showCopyNotification && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    zIndex: 9999,
                    fontFamily: 'NotoSansKR, sans-serif'
                }}>
                    URL이 복사되었습니다
                </div>
            )}
        </div>
    );
} 