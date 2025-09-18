import { loadPaymentWidget } from "@tosspayments/payment-widget-sdk";
import { useEffect, useMemo, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────── *
 * Utilities
 * ────────────────────────────────────────────────────────────── */
const mask = (k) => (typeof k === "string" ? k.slice(0, 8) + "…" : String(k));

const isProduction =
    (typeof import.meta !== "undefined" && import.meta.env?.MODE === "production") ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "production");

const validateClientKeyForEnv = (clientKey) => {
    if (typeof clientKey !== "string") return { ok: false, reason: "키 없음" };
    const isCkOrGck = /^(test|live)_(ck|gck)_/.test(clientKey);
    const isLive = /^live_(ck|gck)_/.test(clientKey);
    if (!isCkOrGck) return { ok: false, reason: "형식 불일치" };
    if (isProduction && !isLive) return { ok: false, reason: "운영은 live_*만 허용" };
    return { ok: true, reason: "ok" };
};

const parseAmount = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === "string") {
        const n = Number(v.replace(/[^\d]/g, ""));
        if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
    }
    return 0;
};

const getQueryCtx = () => {
    if (typeof window === "undefined") return {};
    const q = new URLSearchParams(window.location.search);
    return {
        name: q.get("name") || undefined,
        amount: q.get("amount") || undefined,
        orderId: q.get("orderId") || undefined,
        customerName: q.get("customer") || q.get("customerName") || undefined,
        customerEmail: q.get("email") || q.get("customerEmail") || undefined,
        userId: q.get("userId") || undefined,
        tossClientKey: q.get("tossClientKey") || undefined,
        successUrl: q.get("successUrl") || undefined,
        failUrl: q.get("failUrl") || undefined,
    };
};

/** http(s)만 허용. 그 외 스킴/빈값은 현재 오리진 + fallbackPath 로 보정 */
const coerceWebUrl = (u, fallbackPath = "/complete-payment") => {
    try {
        if (typeof u !== "string" || !u.trim()) {
            return `${window.location.origin}${fallbackPath}`;
        }
        const isHttp = /^https?:\/\//i.test(u);
        return isHttp ? u : `${window.location.origin}${fallbackPath}`;
    } catch {
        return `${window.location.origin}${fallbackPath}`;
    }
};

/* ────────────────────────────────────────────────────────────── *
 * Component
 * ────────────────────────────────────────────────────────────── */
const TossPayment = () => {
    const [paymentWidget, setPaymentWidget] = useState(null);
    const [paymentMethods, setPaymentMethods] = useState(null);

    // 1) RN(WebView)의 window.SKYSUNNY 또는 URL 쿼리에서 결제 컨텍스트 수집
    const initialCtx = useMemo(() => {
        const SK = (typeof window !== "undefined" && window.SKYSUNNY) || {};
        const q = getQueryCtx();

        // (A 방식) order를 먼저 만든다
        const order = {
            id: SK?.order?.id || q.orderId || `order-${Date.now()}`,
            name: SK?.order?.name || q.name || "상품",
            amount: parseAmount(SK?.order?.amount ?? q.amount ?? 0),
            customerName: SK?.order?.customerName ||
                q.customerName ||
                SK?.userName ||
                SK?.userInfo?.name ||
                SK?.customerName ||
                (typeof localStorage !== "undefined" && localStorage.getItem('userName')) ||
                "고객",
            customerEmail: SK?.order?.customerEmail ||
                q.customerEmail ||
                SK?.userEmail ||
                SK?.userInfo?.email ||
                SK?.customerEmail ||
                (typeof localStorage !== "undefined" && localStorage.getItem('userEmail')) ||
                "test@example.com",
            customerMobilePhone: SK?.order?.customerMobilePhone ||
                q.customerMobilePhone ||
                SK?.userPhone ||
                SK?.userInfo?.phone ||
                SK?.customerPhone ||
                (typeof localStorage !== "undefined" && localStorage.getItem('userPhone')) ||
                undefined,
        };

        // 키/고객 식별자
        const clientKey =
            SK?.tossClientKey ||
            (typeof import.meta !== "undefined" &&
                (import.meta.env?.VITE_TOSS_CLIENT_KEY_TEST || import.meta.env?.VITE_TOSS_CLIENT_KEY)) ||
            (typeof process !== "undefined" &&
                (process.env?.REACT_APP_TOSS_CLIENT_KEY_TEST || process.env?.REACT_APP_TOSS_CLIENT_KEY)) ||
            q.tossClientKey ||
            // 테스트용 기본 키 (실제 운영에서는 제거 필요)
            "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq" ||
            undefined;

        const customerKey =
            SK?.userId ||
            q.userId ||
            (typeof localStorage !== "undefined" && localStorage.getItem("userId")) ||
            (typeof localStorage !== "undefined" && localStorage.getItem("accessToken") && "authenticated_user") ||
            `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        // (A) 성공/실패 URL은 반드시 웹 URL로 강제
        const successUrl = coerceWebUrl(
            SK?.successUrl ||
            q.successUrl ||
            `${window.location.origin}/complete-payment?orderNumber=${encodeURIComponent(
                order.id
            )}&amount=${order.amount}&desc=${encodeURIComponent(order.name)}`
        );

        const failUrl = coerceWebUrl(
            SK?.failUrl || q.failUrl || `${window.location.origin}/complete-payment?fail=1&orderNumber=${encodeURIComponent(order.id)}`,
            "/complete-payment?fail=1"
        );

        return { order, clientKey, customerKey, successUrl, failUrl };
    }, []);

    // 2) 주문/금액/URL/키는 변경될 수 있으니 state로 관리
    const [order, setOrder] = useState(initialCtx.order);
    const [successUrl, setSuccessUrl] = useState(initialCtx.successUrl);
    const [failUrl, setFailUrl] = useState(initialCtx.failUrl);
    const [clientKey, setClientKey] = useState(initialCtx.clientKey);
    const [customerKey] = useState(initialCtx.customerKey);

    const lastAmountRef = useRef(order.amount);

    // 디버그 로깅
    useEffect(() => {
        console.log("[TOSS:init ctx]", {
            clientKeyMasked: mask(clientKey),
            customerKey,
            order,
            successUrl,
            failUrl,
        });
    }, [clientKey, customerKey, order, successUrl, failUrl]);

    // 3) 위젯 초기화
    useEffect(() => {
        let cancelled = false;

        async function initWidget() {
            if (!clientKey) {
                alert("Toss clientKey가 설정되지 않았습니다. window.SKYSUNNY.tossClientKey 또는 환경변수를 확인하세요.");
                return;
            }
            const { ok, reason } = validateClientKeyForEnv(clientKey);
            console.log("[TOSS:init:validate]", { ok, reason, clientKeyMasked: mask(clientKey) });
            if (!ok) {
                alert(
                    reason === "운영은 live_*만 허용"
                        ? "운영 환경에서는 live 키(live_ck_/live_gck_)만 허용됩니다."
                        : "유효하지 않은 Toss clientKey 형식입니다. test_* 또는 live_* (ck/gck) 키를 사용하세요."
                );
                return;
            }

            try {
                const widget = await loadPaymentWidget(clientKey, customerKey);
                if (cancelled) return;
                console.log("[TOSS:init:loaded] OK");

                const methods = widget.renderPaymentMethods({
                    selector: "#payment-method",
                    variantKey: "sky-sunny",
                });
                if (widget.renderAgreement) widget.renderAgreement("#toss-agreement");

                setPaymentWidget(widget);
                setPaymentMethods(methods);
            } catch (e) {
                console.error("[TOSS:init:error]", e);
                alert("결제 위젯 초기화 중 오류가 발생했습니다. 콘솔 로그를 확인하세요.");
            }
        }

        initWidget();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientKey, customerKey]);

    // 4) 금액 변경 시 위젯 반영
    useEffect(() => {
        if (!paymentMethods) return;
        if (lastAmountRef.current === order.amount) return;
        console.log("[TOSS:updateAmount]", { from: lastAmountRef.current, to: order.amount });
        paymentMethods.updateAmount({ value: order.amount });
        lastAmountRef.current = order.amount;
    }, [order.amount, paymentMethods]);

    // 5) RN → Web 드래프트 응답 수신하여 컨텍스트 갱신
    useEffect(() => {
        const onReply = (ev) => {
            try {
                const d = ev?.detail || {};
                if (!d?.ok || d?.action !== "REQUEST_DRAFT") return;
                const data = d.data || {};

                if (data.order) {
                    setOrder((prev) => ({
                        ...prev,
                        ...data.order,
                        amount: parseAmount(data.order.amount ?? prev.amount),
                        // 사용자 정보도 업데이트
                        customerName: data.order.customerName ||
                            data.userName ||
                            data.userInfo?.name ||
                            data.customerName ||
                            prev.customerName,
                        customerEmail: data.order.customerEmail ||
                            data.userEmail ||
                            data.userInfo?.email ||
                            data.customerEmail ||
                            prev.customerEmail,
                        customerMobilePhone: data.order.customerMobilePhone ||
                            data.userPhone ||
                            data.userInfo?.phone ||
                            data.customerPhone ||
                            prev.customerMobilePhone,
                    }));
                }
                if (data.successUrl) setSuccessUrl(coerceWebUrl(data.successUrl));
                if (data.failUrl) setFailUrl(coerceWebUrl(data.failUrl, "/complete-payment?fail=1"));
                if (data.tossClientKey) setClientKey(data.tossClientKey);

                console.log("[TOSS] skysunny:reply merged:", {
                    order: data.order,
                    successUrl: data.successUrl,
                    failUrl: data.failUrl,
                });
            } catch (e) {
                console.error("[TOSS] onReply handler error", e);
            }
        };
        document.addEventListener("skysunny:reply", onReply);
        return () => document.removeEventListener("skysunny:reply", onReply);
    }, []);

    // 6) 결제 요청
    const handlePayment = async () => {
        try {
            // 1. 결제 전 최종 검증
            const checkResult = window.finalPaymentCheck(order.id, order.amount);
            if (!checkResult.success) {
                alert(checkResult.error);
                return;
            }

            if (!paymentWidget) {
                alert("결제 위젯 준비 중입니다. 잠시 후 다시 시도하세요.");
                return;
            }

            // 2. 토스 결제 요청 시 검증된 금액 사용
            const paymentAmount = checkResult.amount;
            const amount = Number.isFinite(paymentAmount) ? paymentAmount : 0;
            if (!amount || amount <= 0) {
                console.error("[TOSS] invalid amount:", paymentAmount);
                alert("결제 금액이 올바르지 않습니다.");
                return;
            }

            const orderId = String(order.id || "").trim();
            if (!orderId || orderId.length < 6) {
                console.error("[TOSS] invalid orderId:", order.id);
                alert("주문번호가 올바르지 않습니다.");
                return;
            }

            if (!successUrl || !failUrl) {
                console.error("[TOSS] missing successUrl/failUrl", { successUrl, failUrl });
                alert("성공/실패 URL이 설정되지 않았습니다.");
                return;
            }

            // 결제 정보 업데이트 (구매하기 버튼 클릭 시)
            try {
                console.log("[TOSS] 결제 정보 업데이트 중...");
                await window.updatePayment(orderId, {
                    amount: amount,
                    orderName: order.name,
                    customerName: order.customerName,
                    customerEmail: order.customerEmail,
                    paymentMethod: 'toss',
                    timestamp: Date.now()
                });
                console.log("[TOSS] 결제 정보 업데이트 완료");
            } catch (updateErr) {
                console.warn("[TOSS] 결제 정보 업데이트 실패:", updateErr);
                // 업데이트 실패해도 결제는 진행
            }

            // 데스크톱에서 커스텀 스킴 경고 (보정 후엔 거의 해당 없음)
            const isDesktop =
                typeof window !== "undefined" && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isDesktop && /^.+:\/\//.test(successUrl) && !/^https?:\/\//.test(successUrl)) {
                console.warn("[TOSS] Desktop + non-http(s) successUrl:", successUrl);
            }

            const payload = {
                orderId: order.id,
                orderName: order.name,
                customerName: order.customerName,
                customerEmail: order.customerEmail,
                amount: amount, // 서버에서 검증된 금액 사용
                successUrl: successUrl,
                failUrl: failUrl,
            };
            console.log("[TOSS] requestPayment →", payload);
            console.log("[TOSS] requestPayment →", order);

            // 3. 디버깅이 필요한 경우
            console.log('결제 정보:', window.debugPaymentInfo());

            // 4. 토스페이먼츠 결제 요청
            await paymentWidget.requestPayment(payload);
            console.log("[TOSS] requestPayment: navigation triggered");
        } catch (err) {
            console.error("[TOSS] requestPayment error:", err);

            // 사용자 취소는 조용히 처리
            if (err?.code === 'USER_CANCEL') {
                console.log("[TOSS] 사용자 결제 취소");
                return;
            }

            const msg = err?.message || "결제 요청 중 오류가 발생했습니다.";
            const code = err?.code || err?.name || "unknown";
            alert(`결제 요청 중 오류가 발생했습니다.\ncode=${code}\nmsg=${msg}`);
        }
    };

    /* ─────────────────────────────────────────────────────────── */
    return (
        <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
            {/* 주문 정보 미리보기 */}
            <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
                <div style={{ fontWeight: "bold", marginBottom: 6 }}>
                    {order.name}
                </div>
                <div style={{ fontSize: 14, color: "#555" }}>주문번호: {order.id}</div>
                <div style={{ marginTop: 4 }}>결제금액: {order.amount.toLocaleString()}원</div>
            </div>

            {/* 토스 결제 위젯 */}
            <div id="toss-widget-container" style={{ marginTop: 16 }} />
            <div id="toss-agreement" style={{ marginTop: 12 }} />

            <button
                onClick={handlePayment}
                style={{
                    marginTop: 16,
                    width: "100%",
                    padding: "16px 0",
                    backgroundColor: "#3182F6",
                    color: "#fff",
                    fontSize: "18px",
                    fontWeight: "bold",
                    border: "none",
                    borderRadius: "12px",
                    cursor: "pointer",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                    transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1B64DA")}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#3182F6")}
            >
                결제하기
            </button>
        </div>
    );
};

export default TossPayment;