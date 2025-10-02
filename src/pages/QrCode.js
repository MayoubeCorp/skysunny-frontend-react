// src/web/QrCode.jsx
import { useEffect, useMemo, useState } from "react";
import lockerIcon from "../img/home/locker2.png";
import qrIcon from "../img/home/qr.png";
import seatIcon from "../img/home/seat2.png";
import timeIcon from "../img/home/time.png";
import wifiIcon from "../img/home/wifi.png";
import "../styles/main.scss";

/** ====== 설정 & 유틸 ====== */
const DEBUG = false;
const log = (...args) => DEBUG && console.log("[QrCode]", ...args);

const API_BASE =
    (typeof window !== "undefined" && window.API_BASE) ||
    "https://skysunny-api.mayoube.co.kr";
const QR_CODE_TPL = "/user/qr-code/%s"; // GET

const getQuery = () => {
    if (typeof window === "undefined") return {};
    const q = new URLSearchParams(window.location.search);
    return {
        id: q.get("aggregateId") || q.get("id") || undefined,
        token: q.get("token") || undefined,
        storeId: q.get("storeId") || undefined, // RN StoreDetail 이동용
    };
};

const previewToken = (t) =>
    t ? String(t).replace(/^Bearer\s+/i, "").slice(0, 10) + "...(hidden)" : null;

/** mm:ss 포맷터 (통일) */
function toMMSS(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "00:00";
    const s = Math.max(0, Math.floor(n));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}
// 과거 호출 호환용 별칭
const secToMMSS = toMMSS;

/** passType 라벨 보정(혹시 서버에서 영문 등으로 내려올 경우 대비) */
function labelPassType(v) {
    const k = String(v || "").toLowerCase();
    switch (k) {
        case "cash":
            return "캐시정기권";
        case "free":
            return "기간정기권 (자유석)";
        case "fix":
            return "기간정기권 (고정석)";
        case "1day":
        case "oneday":
            return "1일 이용권";
        default:
            return v || "-";
    }
}

/** 서버/메시지 응답 정규화 (스키마 변화 대응) */
function normalizeResult(raw = {}) {
    // 일부는 result 아래, 일부는 최상단
    const r = raw?.result && typeof raw.result === "object" ? raw.result : raw;

    const qrData = {
        usageSeat:
            r?.qrData?.usageSeat ??
            r?.seat ??
            r?.seatName ??
            r?.seat_name ??
            r?.seat_number ??
            null,
        wifiId:
            r?.qrData?.wifiId ??
            r?.wifiId ??
            r?.wifi ??
            r?.wifiSsid ??
            r?.wifi_ssid ??
            null,
        wifiPassword:
            r?.qrData?.wifiPassword ?? r?.wifiPassword ?? r?.wifiPw ?? r?.wifi_pw ?? null,
        entrancePassword:
            r?.qrData?.entrancePassword ??
            r?.entrancePassword ??
            r?.doorPassword ??
            r?.entrance ??
            null,
        imageUrl:
            r?.qrData?.imageUrl ?? r?.imageUrl ?? r?.qrImage ?? r?.qr_image_url ?? null,
    };

    const orderDetails = {
        storeName: r?.orderDetails?.storeName ?? r?.storeName ?? r?.store_name ?? null,
        passType: labelPassType(
            r?.orderDetails?.passType ?? r?.passType ?? r?.pass_type
        ),
        productInfo:
            r?.orderDetails?.productInfo ??
            r?.productInfo ??
            r?.productDetail ??
            r?.product_detail ??
            r?.product_name ??
            r?.passName ??
            r?.pass_name ??
            null,
    };

    const attachedInfo = {
        usageInfo:
            r?.attachedInfo?.usageInfo ?? r?.usageInfo ?? r?.usage_info ?? null,
        expireText:
            r?.attachedInfo?.expireText ??
            r?.expireText ??
            r?.expire_text ??
            r?.expirationText ??
            r?.expireAt ??
            r?.expire_at ??
            null,
        remainingInfo:
            r?.attachedInfo?.remainingInfo ??
            r?.remainingInfo ??
            r?.remaining_info ??
            r?.remainText ??
            r?.remain_text ??
            null,
    };

    const qrIdentifier = {
        orderId: r?.qrIdentifier?.orderId ?? r?.orderId ?? r?.order_id ?? null,
        passId: r?.qrIdentifier?.passId ?? r?.passId ?? r?.pass_id ?? null,
        aggregateId:
            r?.qrIdentifier?.aggregateId ??
            r?.aggregateId ??
            r?.aggregate_id ??
            r?.id ??
            null,
        timestamp: r?.qrIdentifier?.timestamp ?? r?.timestamp ?? r?.ts ?? null, // 초 단위 가정
    };

    // 남은 시간 계산
    let remainSec = null;
    const remainCandidate =
        r?.qrIdentifier?.remainSec ??
        r?.qrIdentifier?.remain_sec ??
        r?.remainSec ??
        r?.remain_sec ??
        r?.expiresIn ??
        r?.expires_in ??
        null;

    if (Number.isFinite(Number(remainCandidate))) {
        remainSec = Number(remainCandidate);
    } else if (Number.isFinite(Number(qrIdentifier.timestamp))) {
        remainSec = Math.max(0, Math.ceil(Number(qrIdentifier.timestamp) - Date.now() / 1000));
    }

    return { qrData, orderDetails, attachedInfo, qrIdentifier, remainSec };
}

/** ====== 컴포넌트 ====== */
export default function QrCode({ navigate }) {
    const [qrData, setQrData] = useState(null);             // { usageSeat, wifiId, wifiPassword, entrancePassword, imageUrl }
    const [orderDetails, setOrderDetails] = useState(null); // { storeName, passType, productInfo }
    const [attachedInfo, setAttachedInfo] = useState(null); // { usageInfo, expireText, remainingInfo }
    const [qrIdentifier, setQrIdentifier] = useState(null); // { orderId, passId, aggregateId, timestamp }
    const [remainSec, setRemainSec] = useState(0);
    const [err, setErr] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false); // 초기화 완료 플래그

    /** 초기 부트 값 (URL → window.SKYSUNNY) */
    const boot = useMemo(() => {
        const q = getQuery();
        const SK = (typeof window !== "undefined" && window.SKYSUNNY) || {};

        // aggregateId 우선순위: URL aggregateId > URL id > SKYSUNNY aggregateId > SKYSUNNY order.aggregateId
        let aggregateId = q.id || SK.aggregateId || SK?.order?.aggregateId || 0;

        // 문자열이면 숫자로 변환, 유효하지 않으면 0
        if (typeof aggregateId === 'string') {
            const parsed = parseInt(aggregateId, 10);
            aggregateId = isNaN(parsed) ? 0 : parsed;
        } else if (typeof aggregateId === 'number') {
            aggregateId = isNaN(aggregateId) ? 0 : aggregateId;
        } else {
            aggregateId = 0;
        }

        const token =
            q.token ||
            SK.accessToken ||
            SK.token ||
            SK.authToken ||
            (SK.headers && SK.headers.Authorization);
        const storeId =
            Number(q.storeId ?? SK.storeId ?? 0) || 0; // StoreDetail 이동용 후보


        return { aggregateId, token, storeId };
    }, []);

    /** iOS 스와이프 뒤로가기 제스처 차단 */
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

    /** 페이지 마운트/언마운트 로깅 */
    useEffect(() => {
        log("=== QR 페이지 마운트 ===", {
            url: typeof window !== "undefined" ? window.location.href : "-",
            aggregateId: boot.aggregateId,
            storeId: boot.storeId || null,
            tokenPreview: previewToken(boot.token),
            initialRemainSec: remainSec,
            hasQrData: !!qrData,
            hasOrderDetails: !!orderDetails,
            hasAttachedInfo: !!attachedInfo
        });

        // 페이지 마운트 시 타이머 상태 확인
        if (remainSec <= 0) {
            log("⚠️ 페이지 마운트 시 remainSec이 0 이하입니다:", remainSec);
        }

        return () => log("=== QR 페이지 언마운트 ===");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** RN으로 HomeTab 이동 요청 (UI 변경 없음) */
    const goHomeTab = () => {
        const payload = {
            action: "GO_HOME_TAB",
            payload: {},
        };

        log("CLOSE_BUTTON_CLICKED → send RN", payload);

        try {
            if (typeof window !== "undefined" && typeof window.__askRN === "function") {
                window.__askRN(payload.action, payload.payload);
                log("sent via __askRN");
                return;
            }
            if (
                typeof window !== "undefined" &&
                window.ReactNativeWebView &&
                typeof window.ReactNativeWebView.postMessage === "function"
            ) {
                window.ReactNativeWebView.postMessage(JSON.stringify(payload));
                log("sent via postMessage");
                return;
            }
            // 웹 폴백 (브라우저 테스트용)
            if (typeof window !== "undefined") {
                window.history.back(); // 브라우저에서는 뒤로가기
                log("fallback → history.back() (web)");
            }
        } catch (e) {
            log("goHomeTab error", e);
        }
    };

    /** API 호출 */
    const fetchQr = async (aggregateId, token) => {
        if (!aggregateId || aggregateId === 0 || aggregateId === '0') {
            log("fetchQr blocked: no valid aggregateId", { aggregateId, type: typeof aggregateId });
            setErr("유효한 QR 식별자가 없습니다.");
            return;
        }
        const url = API_BASE + QR_CODE_TPL.replace("%s", String(aggregateId));
        const headers = { Accept: "application/json" };
        if (token) headers.Authorization = token.startsWith("Bearer") ? token : `Bearer ${token}`;

        // ---- 필수 디버깅 로그 (요청 전) ----
        log("BOOT", {
            aggregateId: boot.aggregateId,
            storeId: boot.storeId,
            token: previewToken(boot.token),
        });

        log("fetchQr →", {
            url,
            headers: { ...headers, Authorization: previewToken(headers.Authorization) },
        });

        try {
            setErr(null);
            const res = await fetch(url, { method: "GET", headers });
            log("fetchQr status", res.status, res.statusText);

            const text = await res.text(); // 원문 로깅
            log("fetchQr raw body", text);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }

            let data = {};
            try { data = JSON.parse(text || "{}"); } catch (e) {
                log("JSON parse error:", e);
                throw new Error("서버 응답 파싱 실패");
            }

            log("result.code", data?.code, "| keys in result =", Object.keys(data?.result || {}));

            const norm = normalizeResult(data);


            // 기존 데이터와 병합 (sessionStorage 데이터가 있으면 우선 사용하되, API에서 받은 QR 이미지는 업데이트)
            const mergedQrData = {
                ...(qrData || {}), // 기존 데이터 유지
                ...norm.qrData, // API 데이터로 덮어쓰기
                // QR 이미지는 API에서만 받을 수 있으므로 항상 API 데이터 사용
                imageUrl: norm.qrData?.imageUrl || qrData?.imageUrl || null
            };

            const mergedOrderDetails = {
                ...(orderDetails || {}),
                ...norm.orderDetails
            };

            const mergedAttachedInfo = {
                ...(attachedInfo || {}),
                ...norm.attachedInfo
            };

            const mergedQrIdentifier = {
                ...(qrIdentifier || {}),
                ...norm.qrIdentifier
            };


            setQrData(mergedQrData);
            setOrderDetails(mergedOrderDetails);
            setAttachedInfo(mergedAttachedInfo);
            setQrIdentifier(mergedQrIdentifier);

            // 기존 에러 상태 초기화 (API 성공 시)
            setErr(null);

            // 항상 3분(180초)으로 고정
            setRemainSec(180);
            setIsInitialized(true);
            log("✅ API에서 QR 데이터 설정 완료 - Timer set to 3 minutes (180 seconds)");
        } catch (e) {
            log("fetch error:", e?.message || e);

            // 에러 유형별 메시지 개선
            let errorMsg = "QR 정보를 불러오지 못했습니다.";
            if (e.message?.includes("HTTP 404")) {
                errorMsg = "해당 주문을 찾을 수 없습니다. aggregateId를 확인해주세요.";
            } else if (e.message?.includes("HTTP 401") || e.message?.includes("HTTP 403")) {
                errorMsg = "인증이 필요합니다. 토큰을 확인해주세요.";
            } else if (e.message?.includes("HTTP")) {
                errorMsg = `서버 오류: ${e.message}`;
            } else {
                errorMsg = e?.message || "QR 정보를 불러오지 못했습니다.";
            }


            // 현재 상태 확인
            log("API 실패 시 현재 상태:", {
                hasQrData: !!qrData,
                hasOrderDetails: !!orderDetails,
                hasAttachedInfo: !!attachedInfo,
                currentErr: err
            });

            // 이미 QR 데이터가 있거나 에러가 설정되어 있으면 추가 에러 설정 안함
            if (qrData || orderDetails || attachedInfo || err) {
                log("⚠️ API 실패했지만 기존 데이터가 있거나 이미 에러 상태여서 무시");
                return;
            }

            // QR 데이터가 전혀 없고 에러도 없을 때만 에러 표시
            log("❌ QR 데이터가 없어서 에러 상태로 변경");
            setErr(errorMsg);
        }
    };

    /** RN WebView 메시지 수신 (ID/토큰 수신 & 데이터 직접 주입 지원) */
    useEffect(() => {
        const onMsg = (e) => {
            try {
                const raw = e?.data ?? e;
                const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});

                // 다양한 메시지 구조 지원
                const type = parsed?.type || parsed?.action || parsed?.data?.action;
                const payload = parsed?.payload || parsed?.data?.payload || parsed;

                log("onMessage raw:", raw);
                log("onMessage parsed:", { type, payload });

                // 현재 상태 로깅
                log("Current state before processing:", {
                    hasQrData: !!qrData,
                    hasOrderDetails: !!orderDetails,
                    hasAttachedInfo: !!attachedInfo,
                    remainSec
                });

                // RN에서 직접 QR 데이터를 보내는 경우 (type이 없고 qrData가 있는 경우)
                if (!type && (parsed?.qrData || parsed?.orderDetails || parsed?.attachedInfo)) {
                    log("Direct QR data received from RN");
                    const norm = normalizeResult(parsed);


                    setQrData(norm.qrData || null);
                    setOrderDetails(norm.orderDetails || null);
                    setAttachedInfo(norm.attachedInfo || null);
                    setQrIdentifier(norm.qrIdentifier || null);

                    // 기존 에러 상태 초기화
                    setErr(null);

                    // 항상 3분(180초)으로 고정
                    setRemainSec(180);
                    setIsInitialized(true);
                    log("✅ RN 직접 QR 데이터 설정 완료 - Timer set to 3 minutes (180 seconds)");
                    return;
                }

                // 데이터 직접 주입 (UI는 그대로)
                if (["QR_DATA", "QR_CODE_PAYLOAD", "PAY_COMPLETE_QR"].includes(type)) {
                    log("QR_DATA type message received");
                    const norm = normalizeResult(payload || {});

                    setQrData(norm.qrData || null);
                    setOrderDetails(norm.orderDetails || null);
                    setAttachedInfo(norm.attachedInfo || null);
                    setQrIdentifier(norm.qrIdentifier || null);

                    // 기존 에러 상태 초기화
                    setErr(null);

                    // 항상 3분(180초)으로 고정
                    setRemainSec(180);
                    setIsInitialized(true);
                    log("✅ QR_DATA 메시지에서 데이터 설정 완료 - Timer set to 3 minutes (180 seconds)");
                    return;
                }

                // id/token 수신 → fetch
                if (["QR_CODE_ID", "TOKEN", "REQUEST_QR_CODE_ID_RES", "REQUEST_QR_DATA_RES"].includes(type)) {
                    const id = Number(payload?.aggregateId || payload?.id || 0) || 0;
                    const token =
                        payload?.token || payload?.accessToken || payload?.authToken || boot.token || null;
                    const finalId = id || boot.aggregateId;
                    log("message provided id/token", { finalId, tokenPreview: previewToken(token) });

                    // QR 데이터가 함께 온 경우 먼저 처리
                    if (payload?.qrData || payload?.orderDetails || payload?.attachedInfo) {
                        log("QR data included with id/token message");
                        const norm = normalizeResult(payload);
                        setQrData(norm.qrData || null);
                        setOrderDetails(norm.orderDetails || null);
                        setAttachedInfo(norm.attachedInfo || null);
                        setQrIdentifier(norm.qrIdentifier || null);

                        // 기존 에러 상태 초기화
                        setErr(null);

                        // 항상 3분(180초)으로 고정
                        setRemainSec(180);
                        setIsInitialized(true);
                        log("✅ ID/토큰 메시지에서 QR 데이터 설정 완료 - Timer set to 3 minutes (180 seconds)");
                    }

                    // API 호출은 QR 이미지가 없는 경우에만 (QR 데이터가 함께 오지 않은 경우에만)
                    if (finalId && !(payload?.qrData || payload?.orderDetails || payload?.attachedInfo)) {
                        fetchQr(finalId, token);
                    }
                    return;
                }

                if (type === "QR_ERROR") {
                    const errorMessage = payload || "QR 로드 오류";
                    log("❌ QR_ERROR 수신:", errorMessage);

                    // 이미 QR 데이터가 있으면 에러를 무시하고 계속 진행
                    if (qrData || orderDetails || attachedInfo) {
                        log("⚠️ QR_ERROR 수신했지만 기존 QR 데이터가 있어서 무시");
                        return;
                    }

                    // QR 데이터가 없을 때만 에러 표시
                    setErr(errorMessage);

                    // 에러 발생 시 5초 후 홈탭으로 자동 이동
                    setTimeout(() => {
                        log("🏠 QR 에러로 인한 홈탭 자동 이동");
                        goHomeTab();
                    }, 5000);
                    return;
                }

                // 알 수 없는 메시지 타입에 대한 추가 로깅
                log("Unknown message type:", type, "Full message:", parsed);
            } catch (err) {
                log("onMessage parse error", err);
            }
        };

        window.addEventListener("message", onMsg);
        document.addEventListener("message", onMsg); // iOS RN
        return () => {
            window.removeEventListener("message", onMsg);
            document.removeEventListener("message", onMsg);
        };
    }, []); // 의존성 제거 - 이벤트 리스너는 한 번만 등록

    /** 최초 로드: sessionStorage 데이터 우선, 그 다음 ID로 API 호출, 없으면 RN에 요청 */
    useEffect(() => {
        // 1단계: sessionStorage에서 QR 데이터 확인 (결제 완료 페이지에서 저장한 데이터)
        try {
            const qrPayloadStr = sessionStorage.getItem('qr:payload');
            if (qrPayloadStr) {
                const qrPayload = JSON.parse(qrPayloadStr);
                log("sessionStorage QR 데이터 발견:", qrPayload);

                // sessionStorage 데이터로 즉시 UI 업데이트
                setQrData(qrPayload.qrData || null);
                setOrderDetails(qrPayload.orderDetails || null);
                setAttachedInfo(qrPayload.attachedInfo || null);
                setQrIdentifier(qrPayload.qrIdentifier || null);

                // 기존 에러 상태 초기화 (sessionStorage 데이터가 있으면 정상 상태)
                setErr(null);

                // 항상 3분(180초)으로 고정
                setRemainSec(180);
                setIsInitialized(true);
                log("✅ sessionStorage에서 QR 데이터 설정 완료 - Timer set to 3 minutes (180 seconds)");

                // sessionStorage 데이터 사용 후 정리
                sessionStorage.removeItem('qr:payload');

                // QR 이미지는 여전히 API에서 받아와야 하므로 API 호출 진행
                if (boot.aggregateId) {
                    log("sessionStorage 데이터 사용 후 QR 이미지를 위한 API 호출");
                    fetchQr(boot.aggregateId, boot.token);
                }
                return;
            }
        } catch (e) {
            log("sessionStorage QR 데이터 파싱 오류:", e);
        }

        // 2단계: aggregateId가 있으면 API 호출
        if (boot.aggregateId && boot.aggregateId !== 0) {
            log("boot aggregateId present → fetch", { aggregateId: boot.aggregateId });
            fetchQr(boot.aggregateId, boot.token);
        } else {
            log("no valid aggregateId → ask RN for id/token and QR data", {
                aggregateId: boot.aggregateId,
                type: typeof boot.aggregateId
            });
            try {
                const ask = (action, payload = {}) => {
                    const message = { action, payload };
                    log("Sending message to RN:", message);

                    if (typeof window.__askRN === "function") {
                        window.__askRN(action, payload);
                        log("sent via __askRN");
                    } else if (
                        window.ReactNativeWebView &&
                        typeof window.ReactNativeWebView.postMessage === "function"
                    ) {
                        window.ReactNativeWebView.postMessage(JSON.stringify(message));
                        log("sent via postMessage");
                    } else {
                        log("No RN communication method available");
                    }
                };

                // QR 데이터와 ID/토큰을 모두 요청
                ask("REQUEST_QR_CODE_ID");
                ask("REQUEST_QR_DATA"); // 추가: QR 데이터 직접 요청
                if (!boot.token) ask("REQUEST_TOKEN");
            } catch (e) {
                log("ask RN failed", e);
            }
        }

        // 디버깅 편의
        try {
            window.__qrDebug = { boot, fetchQr, goHomeTab };
            log("window.__qrDebug ready");
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** 인증 타이머 */
    useEffect(() => {
        log("Timer useEffect - remainSec:", remainSec, "isInitialized:", isInitialized);

        if (remainSec <= 0) {
            log("TIMER_EXPIRED (remainSec=0)");
            // 초기화가 완료되고, 실제로 타이머가 만료된 경우에만 처리
            if (isInitialized && remainSec === 0 && (qrData || orderDetails || attachedInfo)) {
                log("✅ 초기화 완료 후 타이머 만료 - 3초 후 홈탭으로 이동");
                setTimeout(() => {
                    log("🏠 타이머 만료로 홈탭 이동 실행");
                    goHomeTab();
                }, 3000); // 3초 후 이동 (사용자가 만료를 충분히 인지할 수 있도록)
            } else {
                log("⏸️ 타이머 만료이지만 조건 미충족 - 이동하지 않음", {
                    isInitialized,
                    remainSec,
                    hasQrData: !!qrData,
                    hasOrderDetails: !!orderDetails,
                    hasAttachedInfo: !!attachedInfo
                });
            }
            return;
        }
        const t = setInterval(() => setRemainSec((s) => Math.max(0, s - 1)), 1000);
        return () => clearInterval(t);
    }, [remainSec, isInitialized, qrData, orderDetails, attachedInfo]);

    const qrImgSrc = qrData?.imageUrl || qrIcon;

    // ====== 정상 상태 UI ======
    return (
        <div className="qr-container" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
            {/* 상단 영역 */}
            <div className="qr-header">
                <div className="qr-header-inner">
                    <p className="qr-header-text">
                        <b>QR코드</b>를 <b>출입문 리더기</b>에
                        <br />
                        인식시켜주세요.
                    </p>
                </div>
            </div>

            {/* QR 박스 */}
            <div className="qr-box-wrapper">
                <div className="menu-box">
                    <img src={qrImgSrc} alt="QR Code" className="qr-img" />
                    <div className="qr-timer-box">
                        <img src={timeIcon} alt="time" className="icon18" />
                        <span className="qr-timer">인증시간 {toMMSS(remainSec)}</span>
                    </div>
                </div>

                {/* 기본 내용 */}
                <div className="info-basic">
                    <div className="info-row">
                        <div className="info-label">
                            <img src={seatIcon} alt="seat" className="icon18" />
                            <span className="title">이용좌석</span>
                        </div>
                        <span className="text">{qrData?.usageSeat ?? "-"}</span>
                    </div>
                    <div className="info-row">
                        <div className="info-label">
                            <img src={lockerIcon} alt="door" className="icon18" />
                            <span className="title">출입문</span>
                        </div>
                        <span className="text">{qrData?.entrancePassword ?? "-"}</span>
                    </div>
                    <div className="info-row">
                        <div className="info-label">
                            <img src={wifiIcon} alt="wifi" className="icon18" />
                            <span className="title">와이파이</span>
                        </div>
                        <span className="text">
                            {qrData?.wifiId ?? "-"}
                            {qrData?.wifiPassword ? ` / ${qrData.wifiPassword}` : ""}
                        </span>
                    </div>
                </div>

                {/* 결제/부가 정보 */}
                <div className="info-card">
                    <div className="info-row">
                        <span className="title">매장명</span>
                        <span className="text">{orderDetails?.storeName ?? "-"}</span>
                    </div>
                    <div className="info-row">
                        <span className="title">이용권</span>
                        <span className="text">{orderDetails?.passType ?? "-"}</span>
                    </div>
                    <div className="info-row">
                        <span className="title">상품정보</span>
                        <span className="text">{orderDetails?.productInfo ?? "-"}</span>
                    </div>

                    <div className="line"></div>

                    <div className="info-row">
                        <span className="title">이용정보</span>
                        <span className="text">{attachedInfo?.usageInfo ?? "-"}</span>
                    </div>
                    <div className="info-row">
                        <span className="title">유효기간</span>
                        <span className="text">{attachedInfo?.expireText ?? "-"}</span>
                    </div>
                    <div className="info-row">
                        <span className="title">잔여정보</span>
                        <span className="text">{attachedInfo?.remainingInfo ?? "-"}</span>
                    </div>
                </div>


            </div>

            {/* 하단 버튼 */}
            <div className="bottom-bar">
                <button className="bottom-btn" onClick={goHomeTab}>
                    닫기
                </button>
            </div>
        </div>
    );
}
