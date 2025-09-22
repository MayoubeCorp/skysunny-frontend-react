// CheckPaymentToss.js - 토스페이먼츠 v2 SDK 방식 (샌드박스 코드 적용)
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Banner from '../components/BannerSlider';
import backArrow from '../img/common/backarrow.png';
import close from '../img/common/circleClose.png';
import copy from '../img/common/copy.png';
import bannerImg from '../img/home/bannerexample.png';
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

    const bannerImages2 = [bannerImg, bannerImg, bannerImg];

    const SK = useMemo(() => window?.SKYSUNNY || {}, []);

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

    // 전화번호 형식 정리 함수 (토스페이먼츠 v2 요구사항)
    const formatPhoneNumber = useCallback((phone) => {
        if (!phone || typeof phone !== 'string') return undefined;

        // 하이픈, 공백, 괄호 등 특수문자 제거
        const cleaned = phone.replace(/[^\d]/g, '');

        // 숫자만 남은 전화번호가 유효한지 확인 (10-11자리)
        if (cleaned.length >= 10 && cleaned.length <= 11) {
            return cleaned;
        }

        // 유효하지 않은 경우 undefined 반환 (토스페이먼츠에서 선택사항)
        return undefined;
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
        const onReply = async (e) => {
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
                    if (widgets) {
                        await widgets.setAmount({ currency: "KRW", value: serverAmount });
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
                console.log('[CheckPaymentToss] === 토스 결제 위젯 초기화 시작 (샌드박스 방식) ===');
                console.log('[CheckPaymentToss] clientKey:', clientKey);
                console.log('[CheckPaymentToss] customerKey:', customerKey);

                if (!clientKey) {
                    throw new Error('clientKey가 없습니다');
                }

                // DOM 요소 확인
                const paymentMethodElement = document.getElementById("payment-method");
                const agreementElement = document.getElementById("agreement");

                if (!paymentMethodElement || !agreementElement) {
                    console.warn('[CheckPaymentToss] DOM 요소가 아직 준비되지 않음, 재시도...');
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

                console.log('[CheckPaymentToss] TossPayments v2 SDK 로드 성공');

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

                console.log('[CheckPaymentToss] 위젯 금액 설정:', amount);
                await widgets.setAmount(amount);

                // 결제 수단과 약관 렌더링 (sky-sunny variantKey 사용)
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

                console.log('[CheckPaymentToss] 위젯 렌더링 완료');

                if (!isMounted) return;

                setWidgets(widgets);
                setIsPaymentReady(true);
                lastAmountRef.current = amount.value;

                console.log('[CheckPaymentToss] === 토스페이먼츠 위젯 초기화 완료 ===');
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
                console.log('[CheckPaymentToss] 위젯 정리 완료');
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

        console.log('[CheckPaymentToss] 결제 금액 업데이트:', {
            from: lastAmountRef.current,
            to: newAmount
        });

        const updateAmount = async () => {
            try {
                await widgets.setAmount({
                    currency: "KRW",
                    value: newAmount
                });
                lastAmountRef.current = newAmount;
                console.log('[CheckPaymentToss] 위젯 금액 업데이트 성공:', newAmount);
            } catch (error) {
                console.error('[CheckPaymentToss] 금액 업데이트 오류:', error);
            }
        };

        updateAmount();
    }, [finalAmount, widgets, isPaymentReady]);


    // 랜덤 문자열 생성 함수 (샌드박스 방식)
    const generateRandomString = () => window.btoa(Math.random()).slice(0, 20);

    // 토스페이먼츠 샌드박스 방식: 구매하기 버튼 클릭
    const onClickBuy = async () => {
        console.log('[CheckPaymentToss] 구매하기 버튼 클릭 (샌드박스 방식)');

        if (!widgets || !isPaymentReady) {
            alert('결제 위젯 준비 중입니다. 잠시 후 다시 시도하세요.');
            return;
        }

        try {
            // 샌드박스 방식: 간단한 결제 요청
            const orderId = generateRandomString();
            const orderName = ticketInfo?.selectedTicket?.name || "토스 티셔츠 외 2건";
            const customerName = SK?.customerName || ticketInfo?.customerName || "김토스";
            const customerEmail = SK?.customerEmail || ticketInfo?.customerEmail || "customer123@gmail.com";

            // 성공/실패 URL 설정 (샌드박스 방식)
            const successParams = new URLSearchParams({
                orderNumber: orderId,
                amount: (finalAmount || 50000).toString(),
                storeName: ticketInfo?.storeName || '매장',
                passType: passKind || 'cash',
                productName: orderName
            });
            const successUrl = window.location.origin + "/complete-payment?" + successParams.toString();
            const failUrl = window.location.origin + "/complete-payment?fail=1&orderNumber=" + encodeURIComponent(orderId);

            console.log('[CheckPaymentToss] 토스페이먼츠 결제 요청 (샌드박스 방식):', {
                orderId,
                orderName,
                customerName,
                customerEmail,
                successUrl,
                failUrl
            });

            // 토스페이먼츠 결제 요청 (샌드박스 방식)
            await widgets?.requestPayment({
                orderId: orderId,
                orderName: orderName,
                customerName: customerName,
                customerEmail: customerEmail,
                successUrl: successUrl,
                failUrl: failUrl
            });

            console.log('[CheckPaymentToss] 토스 결제 완료 - 리다이렉션 진행 중');
        } catch (error) {
            console.error('[CheckPaymentToss] 결제 처리 오류:', error);

            // 사용자 취소는 조용히 처리
            if (error?.code === 'USER_CANCEL') {
                console.log('[CheckPaymentToss] 사용자 결제 취소');
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
                    <div className="copy-url-box" onClick={async () => {
                        try {
                            await navigator.clipboard.writeText('http://skasca.me/cash');
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
