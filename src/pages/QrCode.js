// src/web/QrCode.jsx
import { useEffect, useMemo, useState } from "react";
import lockerIcon from "../img/home/locker2.png";
import qrIcon from "../img/home/qr.png";
import seatIcon from "../img/home/seat2.png";
import timeIcon from "../img/home/time.png";
import wifiIcon from "../img/home/wifi.png";
import "../styles/main.scss";

/** ====== 설정 & 유틸 ====== */
const DEBUG = true;
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

    /** 초기 부트 값 (URL → window.SKYSUNNY) */
    const boot = useMemo(() => {
        const q = getQuery();
        const SK = (typeof window !== "undefined" && window.SKYSUNNY) || {};
        const aggregateId =
            Number(q.id ?? SK.aggregateId ?? SK?.order?.aggregateId ?? 0) || 0;
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

    /** 페이지 마운트/언마운트 로깅 */
    useEffect(() => {
        log("MOUNTED", {
            url: typeof window !== "undefined" ? window.location.href : "-",
            aggregateId: boot.aggregateId,
            storeId: boot.storeId || null,
            tokenPreview: previewToken(boot.token),
        });
        return () => log("UNMOUNTED");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** RN으로 StoreDetail 이동 요청 (UI 변경 없음) */
    const goStoreDetail = () => {
        const SK = (typeof window !== "undefined" && window.SKYSUNNY) || {};
        const q = getQuery();
        const storeId =
            Number(q.storeId || 0) ||
            Number(boot.storeId || 0) ||
            Number(SK.storeId || 0) ||
            null;
        const storeName = orderDetails?.storeName || SK.storeName || null;

        const payload = {
            action: "GO_STORE_DETAIL",
            payload: { storeId, storeName },
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
                const qs = new URLSearchParams(
                    Object.fromEntries(
                        Object.entries(payload.payload).filter(([, v]) => v != null)
                    )
                );
                window.location.assign(`/store-detail?${qs.toString()}`);
                log("fallback → /store-detail (web)");
            }
        } catch (e) {
            log("goStoreDetail error", e);
        }
    };

    /** API 호출 */
    const fetchQr = async (aggregateId, token) => {
        if (!aggregateId) {
            log("fetchQr blocked: no aggregateId");
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

            // 가독성 좋은 요약 로그
            console.groupCollapsed("[QrCode] normalizeResult");
            console.table({
                usageSeat: norm.qrData?.usageSeat,
                wifiId: norm.qrData?.wifiId,
                wifiPassword: norm.qrData?.wifiPassword,
                entrancePassword: norm.qrData?.entrancePassword,
                imageUrl: (norm.qrData?.imageUrl || "").slice(0, 60),
            });
            console.table(norm.orderDetails);
            console.table(norm.attachedInfo);
            console.table(norm.qrIdentifier);
            console.log("computed remainSec =", norm.remainSec);
            console.groupEnd();

            setQrData(norm.qrData || null);
            setOrderDetails(norm.orderDetails || null);
            setAttachedInfo(norm.attachedInfo || null);
            setQrIdentifier(norm.qrIdentifier || null);

            if (Number.isFinite(norm.remainSec)) {
                setRemainSec(Math.max(0, Math.ceil(norm.remainSec)));
            } else {
                const ts = Number(norm?.qrIdentifier?.timestamp || 0); // 초 단위
                if (ts > 0) {
                    const diffSec = Math.max(0, Math.ceil(ts - Date.now() / 1000));
                    setRemainSec(diffSec);
                } else {
                    setRemainSec(0);
                }
            }
        } catch (e) {
            log("fetch error:", e?.message || e);
            setErr(e?.message || "QR 정보를 불러오지 못했습니다.");
        }
    };

    /** RN WebView 메시지 수신 (ID/토큰 수신 & 데이터 직접 주입 지원) */
    useEffect(() => {
        const onMsg = (e) => {
            try {
                const raw = e?.data ?? e;
                const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
                const type = parsed?.type || parsed?.action;
                const payload = parsed?.payload || {};
                log("onMessage:", type, payload);

                // 데이터 직접 주입 (UI는 그대로)
                if (["QR_DATA", "QR_CODE_PAYLOAD", "PAY_COMPLETE_QR"].includes(type)) {
                    const norm = normalizeResult(payload || {});
                    console.groupCollapsed("[QrCode] onMessage normalizeResult");
                    console.table(norm.qrData);
                    console.table(norm.orderDetails);
                    console.table(norm.attachedInfo);
                    console.table(norm.qrIdentifier);
                    console.log("computed remainSec =", norm.remainSec);
                    console.groupEnd();

                    setQrData(norm.qrData || null);
                    setOrderDetails(norm.orderDetails || null);
                    setAttachedInfo(norm.attachedInfo || null);
                    setQrIdentifier(norm.qrIdentifier || null);

                    if (Number.isFinite(norm.remainSec)) {
                        setRemainSec(Math.max(0, Math.ceil(norm.remainSec)));
                    } else if (norm.qrIdentifier?.timestamp) {
                        const diffMs = norm.qrIdentifier.timestamp * 1000 - Date.now();
                        setRemainSec(Math.max(0, Math.ceil(diffMs / 1000)));
                    }
                    return;
                }

                // id/token 수신 → fetch
                if (["QR_CODE_ID", "TOKEN", "REQUEST_QR_CODE_ID_RES"].includes(type)) {
                    const id = Number(payload?.aggregateId || payload?.id || 0) || 0;
                    const token =
                        payload?.token || payload?.accessToken || payload?.authToken || boot.token || null;
                    const finalId = id || boot.aggregateId;
                    log("message provided id/token", { finalId, tokenPreview: previewToken(token) });
                    if (finalId) fetchQr(finalId, token);
                    return;
                }

                if (type === "QR_ERROR") {
                    setErr(payload || "QR 로드 오류");
                    return;
                }
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
    }, [boot.aggregateId, boot.token]);

    /** 최초 로드: ID가 있으면 즉시 호출, 없으면 RN에 요청 */
    useEffect(() => {
        if (boot.aggregateId) {
            log("boot aggregateId present → fetch");
            fetchQr(boot.aggregateId, boot.token);
        } else {
            log("no aggregateId → ask RN for id/token");
            try {
                const ask = (action) => {
                    if (typeof window.__askRN === "function") {
                        window.__askRN(action, {});
                    } else if (
                        window.ReactNativeWebView &&
                        typeof window.ReactNativeWebView.postMessage === "function"
                    ) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({ action, payload: {} }));
                    }
                };
                ask("REQUEST_QR_CODE_ID");
                if (!boot.token) ask("REQUEST_TOKEN");
            } catch (e) {
                log("ask RN failed", e);
            }
        }

        // 디버깅 편의
        try {
            window.__qrDebug = { boot, fetchQr, goStoreDetail };
            log("window.__qrDebug ready");
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** 인증 타이머 */
    useEffect(() => {
        if (remainSec <= 0) {
            log("TIMER_EXPIRED (remainSec=0)");
            return;
        }
        const t = setInterval(() => setRemainSec((s) => Math.max(0, s - 1)), 1000);
        return () => clearInterval(t);
    }, [remainSec]);

    const qrImgSrc = qrData?.imageUrl || qrIcon;

    // ====== ⬇⬇⬇ UI는 절대 변경하지 않음 (원본 그대로) ⬇⬇⬇ ======
    return (
        <div className="qr-container">
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
                <button className="bottom-btn" onClick={goStoreDetail}>
                    닫기
                </button>
            </div>
        </div>
    );
}
