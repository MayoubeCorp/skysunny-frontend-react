import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { httpGet, httpUrl } from '../api/httpClient';
import backArrow from '../img/common/backarrow.png';
import redClock from '../img/mypage/redclock.png';
import '../styles/main.scss';

// ✅ 필요한 값: storeId, passId(=selectedTicket.id), (선택) accessToken
// RN에서 window.SKYSUNNY = { storeId, selectedTicket: { id: passId }, accessToken? } 형태로 주입된다고 가정

export default function CheckCoupon() {
    const navigate = useNavigate();
    const location = useLocation();
    const backButtonRef = useRef(null);

    const [ctx, setCtx] = useState(() => {
        // 초기 진입 시 이미 주입되어 있으면 바로 사용
        return typeof window !== 'undefined' ? window.SKYSUNNY || null : null;
    });

    const [loading, setLoading] = useState(false);
    const [couponData, setCouponData] = useState([]);
    const [debugInfo, setDebugInfo] = useState(null);

    // ✅ RN이 늦게 주입해도 받도록 이벤트 구독 (SelectSeat/CheckPaymentWeb에서 CustomEvent 발행)
    useEffect(() => {
        const handler = (e) => {
            setCtx(e?.detail || null);
        };
        document.addEventListener('skysunny:init', handler);
        return () => document.removeEventListener('skysunny:init', handler);
    }, []);

    // ✅ iOS 스와이프 뒤로가기 제스처 차단 (단, 상단 뒤로가기 버튼 영역은 허용)
    useEffect(() => {
        const preventSwipeBack = (e) => {
            const touch = e.touches && e.touches[0];
            if (!touch) return;

            // 뒤로가기 버튼 내부에서 시작된 터치는 허용
            const target = e.target;
            const isInsideBackButton = !!(target && target.closest && target.closest('.top-bar-left'));
            if (isInsideBackButton) return;

            // 화면 왼쪽 30px 이내에서 시작하는 터치 차단 (스와이프 뒤로가기 방지)
            if (touch.clientX < 30) {
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

    // ✅ storeId/passId 계산 (라우트 state > window.SKYSUNNY)
    const routeStoreId = location.state?.storeId ?? null;
    const routePassId = location.state?.passId ?? null;
    const routeAccessToken = location.state?.accessToken;

    const storeId = useMemo(
        () => routeStoreId ?? ctx?.storeId ?? ctx?.storeID ?? null,
        [routeStoreId, ctx]
    );
    const passId = useMemo(
        () => routePassId ?? ctx?.passId ?? ctx?.selectedTicket?.id ?? ctx?.selectedTicket?.passId ?? null,
        [routePassId, ctx]
    );

    // 디버깅 로그 추가
    useEffect(() => {
        const debugData = {
            routeState: location.state,
            routeStoreId,
            routePassId,
            routeAccessToken: routeAccessToken ? '***있음***' : null,
            windowSKYSUNNY: ctx,
            ctxStoreId: ctx?.storeId,
            ctxStoreID: ctx?.storeID,
            ctxPassId: ctx?.passId,
            ctxSelectedTicket: ctx?.selectedTicket,
            ctxAccessToken: ctx?.accessToken ? '***있음***' : null,
            finalStoreId: storeId,
            finalPassId: passId
        };
        console.log('[CheckCoupon] 디버깅 정보:', debugData);
        setDebugInfo(debugData);
    }, [location.state, routeStoreId, routePassId, routeAccessToken, ctx, storeId, passId]);

    // ✅ 사용 가능 쿠폰 조회
    useEffect(() => {
        const fetchAvailableCoupons = async () => {
            console.log('[CheckCoupon] fetchAvailableCoupons 시작:', {
                storeId,
                passId,
                hasStoreId: !!storeId,
                hasPassId: !!passId
            });

            if (!storeId || !passId) {
                console.warn('[CheckCoupon] storeId 또는 passId가 없어서 쿠폰 조회를 건너뜁니다:', {
                    storeId,
                    passId
                });
                // 파라미터가 아직 없으면 대기
                return;
            }

            try {
                setLoading(true);

                // httpClient의 httpGet 사용 (쿼리 파라미터로 storeId, passId 전달)
                const queryParams = {
                    storeId: storeId,
                    passId: passId
                };

                console.log('[available coupons] httpGet 호출 시작:', {
                    storeId,
                    passId,
                    url: httpUrl.usableCoupons,
                    queryParams
                });

                const json = await httpGet(httpUrl.usableCoupons, null, queryParams);

                // 디버그 로그
                console.log('[available coupons][httpGet response]', json);
                console.log('[available coupons][result array length]', json?.result?.length || 0);
                console.log('[available coupons][response code]', json?.code);

                // 서버 응답 형태 가정: { code: 100, result: [...] }
                const list = Array.isArray(json?.result) ? json.result : [];

                // 빈 배열인 경우 추가 로그
                if (list.length === 0) {
                    console.warn('[available coupons] 사용 가능한 쿠폰이 없습니다:', {
                        storeId,
                        passId,
                        serverResponse: json
                    });

                    // 개발/테스트용: 더미 데이터 표시 (실제 운영에서는 제거)
                    // const dummyCoupons = [{
                    //     id: 'dummy1',
                    //     name: '테스트 쿠폰',
                    //     expireDays: 30,
                    //     discountAmount: '5,000원',
                    //     minOrderPrice: '1만원 이상',
                    //     statusText: '이용가능',
                    //     storeName: '테스트 매장'
                    // }];
                    // list.push(...dummyCoupons);
                }

                // ✅ UI에서 쓰는 필드로 안전 매핑
                // 서버 필드 예시(쿠폰함과 유사): id, name, expireDays, discountAmount, minOrderPrice, statusText, storeName
                const mapped = list.map((c, idx) => ({
                    id: String(c.id ?? idx + 1),
                    code: c.code || c.couponCode || '',           // 없으면 빈 문자열
                    title: c.name || c.title || '-',               // UI 타이틀
                    store: c.storeName || '매장전용',
                    validDays: typeof c.expireDays === 'number' ? c.expireDays : 0,
                    amount: c.discountAmount ?? '',                // "5,000원" 형태면 그대로
                    minUse: c.minOrderPrice ?? '',                 // "1만원 이상" 등
                    type: c.statusText || '이용가능',              // 보통 '이용가능'만 내려옴
                    // 필요시 원본도 보관
                    _raw: c,
                }));

                setCouponData(mapped);
            } catch (e) {
                console.error('[available coupons][error]', e);
                setCouponData([]);
            } finally {
                setLoading(false);
            }
        };

        fetchAvailableCoupons();
    }, [storeId, passId, ctx?.accessToken, routeAccessToken]); // 토큰 갱신도 대비

    // ✅ available API는 이미 "이용가능"만 내려올 확률이 크지만, 방어적으로 한 번 더 필터
    const filteredCoupons = useMemo(
        () => couponData.filter((c) => c.type === '이용가능' && (c.validDays ?? 0) !== 0 ? true : c.validDays > 0),
        [couponData]
    );

    return (
        <div className="container" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
            {/* 상단 바 */}
            <div className="top-bar">
                <div className="top-bar-left">
                    <button
                        onClick={() => navigate(-1)}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                    >
                        <img src={backArrow} alt="뒤로가기" className="icon24" />
                    </button>
                </div>
                <div className="top-bar-center">
                    <span className="top-txt font-noto">쿠폰선택</span>
                </div>
            </div>


            {/* 쿠폰 리스트 */}
            <div className="coupon-list" style={{ minHeight: 'calc(100vh - 60px)' }}>
                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center' }}>불러오는 중…</div>
                ) : filteredCoupons.length > 0 ? (
                    filteredCoupons.map((item) => (
                        <div className="coupon-card" key={item.id}>
                            {/* 코드 & 상태 */}
                            <div className="coupon-header">
                                <span></span>
                                <div className={`status-box ${item.type === '이용가능' ? 'active' : 'disabled'}`}>
                                    <span className="coupon-type">{item.type}</span>
                                </div>
                            </div>

                            <div className="line"></div>

                            {/* 제목 & 태그 */}
                            <div className="title-row">
                                <div className="tag">매장전용</div>
                                <span className="coupon-title">{item.title}</span>
                            </div>

                            {/* 매장명 & 유효기간 */}
                            <div className="date-row">
                                <img src={redClock} alt="clock" className="icon14" />
                                <span className={`date-text ${item.validDays > 0 ? '' : 'expired'}`}>
                                    {item.validDays > 0 ? `유효기간 ${item.validDays}일` : '만료됨'}
                                </span>
                            </div>

                            {/* 금액 & 최소사용금액 */}
                            <div className="bottom-row">
                                <span className="amount font-bm">{item.amount}</span>
                                <span className="min-use">{item.minUse}</span>
                            </div>

                            {/* 이용하기 버튼 */}
                            <button
                                className="detail-btn"
                                onClick={() => {
                                    try {
                                        // RN WebView 환경에서 페이지 이동 시도
                                        if (window.ReactNativeWebView) {
                                            // RN에게 페이지 이동 요청
                                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                                type: 'NAVIGATE',
                                                path: '/cash',
                                                state: { selectedCoupon: item }
                                            }));
                                            console.log('[CheckCoupon] RN으로 페이지 이동 요청:', '/cash');

                                            // 일정 시간 후 React Router로 폴백
                                            setTimeout(() => {
                                                navigate('/cash', { state: { selectedCoupon: item } });
                                            }, 100);
                                        } else {
                                            // 일반 웹 환경에서는 바로 React Router 사용
                                            navigate('/cash', { state: { selectedCoupon: item } });
                                        }
                                    } catch (error) {
                                        console.error('[CheckCoupon] 페이지 이동 오류:', error);
                                        // 오류 발생 시 React Router로 폴백
                                        navigate('/cash', { state: { selectedCoupon: item } });
                                    }
                                }}
                            >
                                <span className="btn-text">이용하기</span>
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="no-coupon">
                        <img src={require('../img/home/noCoupon.png')} alt="no coupon" className="no-coupon-img" />
                        <p className="no-coupon-text">사용 가능한 쿠폰이 없어요.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
