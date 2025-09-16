// src/web/CheckPayment.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Banner from '../components/BannerSlider';
import backArrow from '../img/common/backarrow.png';
import close from '../img/common/circleClose.png';
import copy from '../img/common/copy.png';
import bannerImg from '../img/home/bannerexample.png';
import infoIcon from '../img/home/information.png';
import '../styles/main.scss';

export default function CheckPayment() {
    const navigate = useNavigate();
    const location = useLocation();

    const [paymentMethod, setPaymentMethod] = useState('card');
    const [selectedCoupon, setSelectedCoupon] = useState(location.state?.selectedCoupon || null);
    const [ticketInfo, setTicketInfo] = useState(null);

    const bannerImages2 = [bannerImg, bannerImg, bannerImg];

    const SK = useMemo(() => window?.SKYSUNNY || {}, []);
    const successUrl = useMemo(() => SK?.successUrl || 'skysunny://pay/success', [SK]);
    const failUrl = useMemo(() => SK?.failUrl || 'skysunny://pay/fail', [SK]);

    const movePage = (path) => navigate(path);

    useEffect(() => {
        const onInit = (e) => {
            console.log('[CheckPayment:web] skysunny:init detail =', e.detail);
            setTicketInfo(e.detail);
        };
        document.addEventListener('skysunny:init', onInit);
        if (window.SKYSUNNY) onInit({ detail: window.SKYSUNNY });

        // RN이 이전에 보관한 마지막 응답이 있다면 재주입
        if (window.__SK_LAST_REPLY__) {
            console.log('[CheckPayment:web] re-dispatch __SK_LAST_REPLY__');
            const ev = new CustomEvent('skysunny:reply', { detail: window.__SK_LAST_REPLY__ });
            document.dispatchEvent(ev);
        }

        // RN → WEB 알림/스냅샷 로그 처리
        const onMessage = (e) => {
            try {
                const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                if (!data) return;
                if (data.action === 'WEB_ALERT') {
                    console.log('[CheckPayment:web] WEB_ALERT msg=', data?.payload?.msg);
                    console.log('[CheckPayment:web] WEB_ALERT skysunny=', data?.payload?.skysunny);
                }
                if (data.action === 'WEB_SKYSUNNY_SNAPSHOT') {
                    console.log('[CheckPayment:web] WEB_SKYSUNNY_SNAPSHOT =', data?.payload?.skysunny);
                }
            } catch (err) {
                console.warn('[CheckPayment:web] message parse error', err);
            }
        };
        window.addEventListener('message', onMessage);

        return () => {
            document.removeEventListener('skysunny:init', onInit);
            window.removeEventListener('message', onMessage);
        };
    }, []);

    useEffect(() => {
        if ('selectedCoupon' in (location.state || {})) {
            setSelectedCoupon(location.state.selectedCoupon || null);
        }
    }, [location.state?.selectedCoupon]);

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
            return `${Math.max(base - discount, 0).toLocaleString()}원`;
        }
        const total = Math.max(legacyPrice - discount, 0);
        return `${total.toLocaleString()}원`;
    }, [passKind, normalizedStudy, legacyPrice, discount]);

    // 조건부 표시
    const showSeatDiscount = passKind === 'cash';
    const showOneDayInfo = passKind === '1day';

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

            let settled = false;
            const done = (fn) => (arg) => {
                if (settled) return;
                settled = true;
                document.removeEventListener('skysunny:reply', onCustomReply);
                window.removeEventListener('message', onWindowMessage);
                try { delete window.onSkysunnyReply; } catch (_) { }
                try { delete window.SKYSUNNY_REPLY; } catch (_) { }
                clearTimeout(timer);
                fn(arg);
            };
            const resolveOnce = done(resolve);
            const rejectOnce = done(reject);

            const normalize = (raw) => {
                const d = raw?.detail ?? raw ?? {};
                const action = d.action || d.type;
                const ok = !!d.ok;
                const orderNumber =
                    d.orderNumber ??
                    d?.data?.orderNumber ??
                    d?.payload?.orderNumber ??
                    null;
                const error =
                    d.error ??
                    d?.data?.error ??
                    d?.payload?.error ??
                    null;
                const data = d.data ?? d.payload ?? d.detail ?? d;
                return { action, ok, orderNumber, error, data, raw: d };
            };

            const onCustomReply = (e) => {
                const n = normalize(e);
                console.log('[CheckPayment:web] receive CustomEvent', n);
                if (n.action !== 'REQUEST_DRAFT') return;
                if (n.ok && n.orderNumber) resolveOnce(n.data || { orderNumber: n.orderNumber });
                else rejectOnce(new Error(n.error || '임시 주문 생성 실패'));
            };

            const onWindowMessage = (e) => {
                try {
                    const payload = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
                    if (payload?.source !== 'skysunny') return;
                    const n = normalize(payload);
                    console.log('[CheckPayment:web] receive window.message', n);
                    if (n.action !== 'REQUEST_DRAFT') return;
                    if (n.ok && n.orderNumber) resolveOnce(n.data || { orderNumber: n.orderNumber });
                    else rejectOnce(new Error(n.error || '임시 주문 생성 실패'));
                } catch (err) {
                    console.log('[CheckPayment:web] message parse error', err);
                }
            };

            document.addEventListener('skysunny:reply', onCustomReply);
            window.addEventListener('message', onWindowMessage);
            window.onSkysunnyReply = (p) => {
                const n = normalize(p);
                console.log('[CheckPayment:web] receive global callback', n);
                if (n.action !== 'REQUEST_DRAFT') return;
                if (n.ok && n.orderNumber) resolveOnce(n.data || { orderNumber: n.orderNumber });
                else rejectOnce(new Error(n.error || '임시 주문 생성 실패'));
            };
            window.SKYSUNNY_REPLY = window.onSkysunnyReply;

            const timer = setTimeout(() => { rejectOnce(new Error('임시 주문 응답 타임아웃')); }, 7000);

            // DB 저장에 필요한 모든 정보 수집
            const requestPayload = {
                passId,
                targetId,
                type: passKind || 'cash',
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
                paymentMethod: paymentMethod || 'card',
                finalAmount: finalAmount
            };

            console.log('[CheckPayment:web] REQUEST_DRAFT → 전체 페이로드:', requestPayload);
            console.log('[CheckPayment:web] SKYSUNNY 전체 객체:', SK);
            console.log('[CheckPayment:web] ticketInfo 전체 객체:', ticketInfo);

            window.__askRN('REQUEST_DRAFT', requestPayload);
        });

    // 결제 버튼
    const onClickBuy = async () => {
        if (paymentMethod !== 'card') {
            movePage('/store-detail');
            return;
        }
        try {
            console.log('[CheckPayment:web] onClickBuy → requestDraftViaRN()');
            const draft = await requestDraftViaRN();
            console.log('[CheckPayment:web] draft resolved =', draft);

            // draft에 추가 정보 포함 (DB 저장용 데이터 유지)
            const draftWithMeta = {
                ...draft,
                // 기본 정보
                successUrl: successUrl,
                failUrl: failUrl,
                timestamp: Date.now(),
                // 사용자 정보
                userId: SK?.userId || ticketInfo?.userId || localStorage.getItem('userId') || null,
                // 좌석 정보
                seatId: needsTarget(passKind) ? (SK?.selectedTicket?.targetId ?? ticketInfo?.selectedTicket?.targetId ?? 0) : null,
                // 매장 정보
                storeId: SK?.storeId || ticketInfo?.storeId || null,
                storeName: SK?.storeName || ticketInfo?.storeName || null,
                // 상품 정보
                passType: passKind,
                productName: SK?.selectedTicket?.name || ticketInfo?.selectedTicket?.name || null,
                price: SK?.selectedTicket?.price || ticketInfo?.selectedTicket?.price || null,
                // 스터디룸 관련 정보
                roomName: SK?.roomName || ticketInfo?.roomName || null,
                selectedDate: SK?.selectedDate || ticketInfo?.selectedDate || null,
                period: SK?.period || ticketInfo?.period || null,
                usageInfo: SK?.usageInfo || ticketInfo?.usageInfo || null,
                // 쿠폰 정보
                couponId: selectedCoupon?.id || null,
                couponAmount: selectedCoupon?.amount || selectedCoupon?.discount || 0,
                // 결제 정보
                paymentMethod: paymentMethod || 'card',
                finalAmount: finalAmount
            };

            sessionStorage.setItem('toss:draft', JSON.stringify(draftWithMeta));
            sessionStorage.setItem('toss:successUrl', successUrl);
            sessionStorage.setItem('toss:failUrl', failUrl);

            console.log('[CheckPayment] draft 저장 완료:', draftWithMeta);

            console.log('[CheckPayment:web] navigate(/toss-payment)');
            movePage('/toss-payment');

            setTimeout(() => {
                const pathOk =
                    window.location.pathname.includes('toss') ||
                    window.location.href.includes('toss');
                if (!pathOk) {
                    console.log('[CheckPayment:web] fallback → location.href');
                    const q = `orderNumber=${encodeURIComponent(draft?.orderNumber || draft?.data?.orderNumber || '')}`;
                    window.location.href = `/toss-payment?${q}`;
                }
            }, 300);
        } catch (e) {
            console.error('[CheckPayment:web] draft error:', e);
            alert(e?.message || '주문 생성 중 오류가 발생했습니다.');
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

                                {/* 고정석, 1일 이용권, 캐시권: 이용정보 표시 */}
                                {/* {(passKind === 'fix' || passKind === '1day' || passKind === 'cash') && (
                                    <div className="info-row"><span className="info-title">이용정보</span><span className="info-text">{ticketInfo?.usageInfo || '-'}</span></div>
                                )} */}
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
                            {selectedCoupon && <span className="info-text">{(parseAmount(selectedCoupon.amount)).toLocaleString()}원</span>}
                        </div>
                    </div>
                </div>

                {/* 결제수단 */}
                <div className="section2-title-box">
                    <span className="font-bm section-title">결제수단</span>
                </div>
                <div className="payment-methods">
                    <button
                        className={`payment-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('card')}
                    >
                        <span className="payment-text">신용/체크카드</span>
                    </button>
                    <button
                        className={`payment-btn ${paymentMethod === 'bank' ? 'active' : ''}`}
                        onClick={() => setPaymentMethod('bank')}
                    >
                        <span className="payment-text">무통장입금</span>
                    </button>
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
                    {paymentMethod !== 'card' && (
                        <p className="atm-text">
                            <b>‘ATM 기기’를 통한 무통장 입금은 지원되지 않아요.</b><br />
                            인터넷 뱅킹 또는 은행 창구를 통해 입금 부탁 드려요!<br /><br />
                            <b>해외송금을 통해 무통장 입금 시 결제가 실패됩니다.</b><br />
                            결제실패로 인한 환불 시 고객님께 해외송금 수수료가 청구될 수 있습니다.
                        </p>
                    )}
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

                <div className="scroll-spacer" aria-hidden />
            </div>

            {/* 하단 고정 */}
            <div className="checkout-footer-fixed">
                <div className="bottom-bar2">
                    <span>결제금액</span>
                    <span>{finalAmount}</span>
                </div>
                <div className="bottom-button">
                    <button onClick={onClickBuy}>구매하기</button>
                </div>
            </div>
        </div>
    );
}
