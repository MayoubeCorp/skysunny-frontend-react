// CheckPaymentToss.js - 웹뷰 방식 토스 결제
import { useCallback, useEffect, useMemo, useState } from 'react';
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

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('toss-pay');
    const [selectedCoupon, setSelectedCoupon] = useState(location.state?.selectedCoupon || null);
    const [ticketInfo, setTicketInfo] = useState(null);

    const bannerImages2 = [bannerImg, bannerImg, bannerImg];

    const SK = useMemo(() => window?.SKYSUNNY || {}, []);

    const movePage = (path) => navigate(path);

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

    // eslint-disable-next-line no-unused-vars
    const amount = finalAmount || 1000; // 기본값 1000원

    const successUrl = useMemo(() => SK?.successUrl || 'skysunny://pay/success', [SK]);
    const failUrl = useMemo(() => SK?.failUrl || 'skysunny://pay/fail', [SK]);

    // RN draft 요청
    const needsTarget = (t) => t === 'fix' || t === 'locker';
    const requestDraftViaRN = () =>
        new Promise((resolve, reject) => {
            if (typeof window.__askRN !== 'function') {
                reject(new Error('RN bridge not found'));
                return;
            }

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
                if (!passId) { reject(new Error('상품 ID(passId)가 없습니다.')); return; }
                if (needsTarget(passKind) && !targetId) { reject(new Error('좌석/사물함 선택이 필요합니다.')); return; }
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
                paymentMethod: selectedPaymentMethod,
                finalAmount: finalAmount
            };

            let settled = false;
            const done = (fn) => (arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(arg);
            };
            const resolveOnce = done(resolve);
            const rejectOnce = done(reject);

            const timer = setTimeout(() => rejectOnce(new Error('RN 응답 타임아웃')), 10000);

            console.log('[CheckPaymentToss:web] REQUEST_DRAFT → 전체 페이로드:', requestPayload);
            window.__askRN('REQUEST_DRAFT', requestPayload);

            // 응답 처리는 기존 CheckPayment.js와 동일한 로직 사용
            const handleReply = (data) => {
                const action = data.action || data.type;
                const ok = !!data.ok;
                const orderNumber = data.orderNumber ?? data?.data?.orderNumber ?? data?.payload?.orderNumber ?? null;

                if (action === 'DRAFT_REPLY') {
                    if (ok && orderNumber) {
                        resolveOnce({ orderNumber, ...data });
                    } else {
                        rejectOnce(new Error(data.message || 'Draft 생성 실패'));
                    }
                }
            };

            const onCustomReply = (e) => handleReply(e.detail);
            const onWindowMessage = (e) => {
                try {
                    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    if (data) handleReply(data);
                } catch (err) {
                    console.warn('[CheckPaymentToss:web] message parse error', err);
                }
            };

            document.addEventListener('skysunny:reply', onCustomReply);
            window.addEventListener('message', onWindowMessage);
        });

    // 구매하기 버튼 클릭
    const onClickBuy = async () => {
        console.log('[CheckPaymentToss:web] 선택된 결제 방법:', selectedPaymentMethod);

        // 선택된 결제 방법에 따른 처리
        if (selectedPaymentMethod === 'toss-pay' || selectedPaymentMethod === 'credit-card') {
            try {
                console.log('[CheckPaymentToss:web] onClickBuy → requestDraftViaRN()');
                const draft = await requestDraftViaRN();
                console.log('[CheckPaymentToss:web] draft resolved =', draft);

                // draft에 추가 정보 포함
                const draftWithMeta = {
                    ...draft,
                    successUrl: successUrl,
                    failUrl: failUrl,
                    timestamp: Date.now(),
                    userId: SK?.userId || ticketInfo?.userId || localStorage.getItem('userId') || null,
                    storeId: SK?.storeId || ticketInfo?.storeId || null,
                    storeName: SK?.storeName || ticketInfo?.storeName || null,
                    productName: SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || null,
                    price: SK?.selectedTicket?.price || ticketInfo?.selectedTicket?.price || null,
                    couponId: selectedCoupon?.id || null,
                    couponAmount: selectedCoupon?.amount || selectedCoupon?.discount || 0,
                    finalAmount: finalAmount,
                    paymentMethod: selectedPaymentMethod
                };

                // 세션 스토리지에 저장
                sessionStorage.setItem('PAYMENT_DRAFT', JSON.stringify(draftWithMeta));
                console.log('[CheckPaymentToss:web] 세션 저장 완료, 토스 결제 진행');

                // 토스 결제 페이지로 이동 (실제 토스 결제 URL)
                const orderId = `order_${Date.now()}`;
                const orderName = draftWithMeta.productName || '테스트 상품';
                const customerName = '홍길동';
                const customerEmail = 'test@example.com';

                const tossPaymentUrl = `https://pay.toss.im/web/checkout?` +
                    `amount=${finalAmount}&` +
                    `orderId=${orderId}&` +
                    `orderName=${encodeURIComponent(orderName)}&` +
                    `customerName=${encodeURIComponent(customerName)}&` +
                    `customerEmail=${customerEmail}&` +
                    `successUrl=${encodeURIComponent(window.location.origin + '/complete-payment')}&` +
                    `failUrl=${encodeURIComponent(window.location.origin + '/complete-payment?fail=1')}`;

                console.log('[CheckPaymentToss:web] 토스 결제 URL:', tossPaymentUrl);
                window.open(tossPaymentUrl, '_blank', 'width=400,height=600');

            } catch (error) {
                console.error('[CheckPaymentToss:web] onClickBuy 에러:', error);
                alert(error.message || '결제 준비 중 오류가 발생했습니다.');
            }
        } else {
            // 다른 결제 방법들
            const paymentNames = {
                'payco': 'PAYCO',
                'kakao-pay': '카카오페이',
                'naver-pay': '네이버페이',
                'mobile': '휴대폰 결제'
            };

            const paymentName = paymentNames[selectedPaymentMethod] || selectedPaymentMethod;
            alert(`${paymentName} 결제는 현재 준비 중입니다.`);
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
                    {/* {selectedPaymentMethod !== 'credit-card' && selectedPaymentMethod !== 'toss-pay' && (
                        <p className="atm-text">
                            <b>‘ATM 기기’를 통한 무통장 입금은 지원되지 않아요.</b><br />
                            인터넷 뱅킹 또는 은행 창구를 통해 입금 부탁 드려요!<br /><br />
                            <b>해외송금을 통해 무통장 입금 시 결제가 실패됩니다.</b><br />
                            결제실패로 인한 환불 시 고객님께 해외송금 수수료가 청구될 수 있습니다.
                        </p>
                    )} */}
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

                {/* 토스 결제 위젯 */}
                <div className="toss-payment-widget">
                    <div className="section2-title-box">
                        <div className="text-box">
                            <span className="font-bm section-title">결제 방법</span>
                        </div>
                    </div>

                    {/* 신용·체크카드 섹션 */}
                    <div className="payment-section">
                        <div className="payment-methods-grid credit-card-grid">
                            <div
                                className={`payment-method-item ${selectedPaymentMethod === 'credit-card' ? 'selected' : ''}`}
                                onClick={() => setSelectedPaymentMethod('credit-card')}
                            >
                                <div className="payment-brand">
                                    <span className="credit-card-text">신용·체크카드</span>
                                </div>
                            </div>
                            <div
                                className={`payment-method-item ${selectedPaymentMethod === 'toss-pay' ? 'selected' : ''}`}
                                onClick={() => setSelectedPaymentMethod('toss-pay')}
                            >
                                <div className="payment-brand">
                                    <div className="brand-logo toss-pay">
                                        <span className="toss-logo">toss pay</span>
                                    </div>
                                </div>
                            </div>
                            <div
                                className={`payment-method-item ${selectedPaymentMethod === 'payco' ? 'selected' : ''}`}
                                onClick={() => setSelectedPaymentMethod('payco')}
                            >
                                <div className="payment-brand">
                                    <div className="brand-logo payco">
                                        <span className="payco-logo">PAYCO</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 간편결제 섹션 */}
                    <div className="payment-section simple-pay">
                        <div className="payment-methods-grid">
                            <div
                                className={`payment-method-item ${selectedPaymentMethod === 'kakao-pay' ? 'selected' : ''}`}
                                onClick={() => setSelectedPaymentMethod('kakao-pay')}
                            >
                                <div className="payment-brand">
                                    <div className="brand-logo kakao-pay">
                                        <span className="kakao-logo">●</span>
                                        <span className="kakao-text">pay</span>
                                    </div>
                                </div>
                            </div>
                            <div
                                className={`payment-method-item ${selectedPaymentMethod === 'naver-pay' ? 'selected' : ''}`}
                                onClick={() => setSelectedPaymentMethod('naver-pay')}
                            >
                                <div className="payment-brand">
                                    <div className="brand-logo naver-pay">
                                        <span className="naver-logo">N</span>
                                        <span className="naver-text">pay</span>
                                    </div>
                                </div>
                            </div>
                            <div
                                className={`payment-method-item ${selectedPaymentMethod === 'mobile' ? 'selected' : ''}`}
                                onClick={() => setSelectedPaymentMethod('mobile')}
                            >
                                <div className="payment-brand">
                                    <span className="mobile-text">휴대폰</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 동적 할인/혜택 정보 (토스에서 제공되는 정보로 대체 가능) */}
                    <div className="dynamic-benefits-info">
                        {/* 이 부분은 토스 API에서 동적으로 받아온 혜택 정보를 표시 */}
                        <div className="benefit-item">
                            <div className="benefit-header">
                                <div className="benefit-logo">
                                    <span>S</span>
                                </div>
                                <span>신한카드 최대 5개월 무이자 할부</span>
                            </div>
                        </div>
                        <div className="benefit-item">
                            <div className="benefit-detail">
                                <span>Payco · 포인트 결제 시 1% 적립</span>
                            </div>
                        </div>
                        <div className="benefit-item">
                            <div className="benefit-link">
                                <span>신용카드 무이자 할부 안내</span>
                                <span className="arrow">›</span>
                            </div>
                        </div>
                    </div>

                    {/* 약관 동의 */}
                    <div className="agreement-section-toss">
                        <div className="agreement-item-toss">
                            <input type="checkbox" id="agree-payment-toss" defaultChecked />
                            <label htmlFor="agree-payment-toss">
                                [필수] 결제 서비스 이용 약관, 개인정보 처리 동의
                            </label>
                            <span className="arrow">›</span>
                        </div>
                    </div>
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
                    <button onClick={onClickBuy}>구매하기</button>
                </div>
            </div>
        </div>
    );
}